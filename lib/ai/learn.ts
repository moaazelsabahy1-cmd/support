import { prisma } from "@/lib/db";
import { enqueueIndexJob } from "@/lib/ai/jobs";
import { retrieveKnowledge } from "@/lib/ai/retrieval";
import { sanitizeLearnedText } from "@/lib/ai/sanitize-knowledge";
import { getEnv } from "@/lib/env";
import { requireLlm } from "@/lib/ai/providers";
import { aiLog, aiWarn } from "@/lib/ai/log";
import { newId } from "@/lib/id";
import {
  clampKnowledgeCategory,
  normalizeKnowledgeTags,
  ticketHasLearnableContent,
} from "@/lib/ai/knowledge-taxonomy";
import { DEFAULT_ORGANIZATION_ID, SYSTEM_AI_USER_ID } from "@/types";
import type { KnowledgeSource, Prisma } from "@prisma/client";

export { ticketHasLearnableContent };

function parseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/\s*```$/, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

type ExtractedQa = {
  title: string;
  question: string;
  answer: string;
  steps?: string;
  exceptions?: string;
  category: string;
  tags: string[];
};

async function extractReusableQa(transcript: string, extraTags: string[]): Promise<ExtractedQa | null> {
  const llm = requireLlm();
  const completion = await llm.generateText({
    temperature: 0.1,
    messages: [
      {
        role: "system",
        content:
          'Extract reusable support knowledge from a resolved support thread. Return JSON only with keys title, question, answer, steps, exceptions, category, tags. category must be one of: Billing, Technical Support, Account, Orders, General. tags is a short string array. Omit greetings, PII, emails, phone numbers, passwords, tokens, and customer names. If a human agent gave a clear how-to or factual answer another customer could reuse, extract it (including product procedure names). Do not invent policies. If nothing reusable exists, return {"question":"","answer":""}.',
      },
      { role: "user", content: transcript },
    ],
  });
  const parsed = parseJsonObject(completion.text);
  const question = sanitizeLearnedText(String(parsed?.question || ""));
  const extracted: ExtractedQa = {
    title: sanitizeLearnedText(String(parsed?.title || question)).slice(0, 120),
    question,
    answer: sanitizeLearnedText(String(parsed?.answer || "")),
    steps: parsed?.steps ? sanitizeLearnedText(String(parsed.steps)) : undefined,
    exceptions: parsed?.exceptions ? sanitizeLearnedText(String(parsed.exceptions)) : undefined,
    category: clampKnowledgeCategory(parsed?.category),
    tags: normalizeKnowledgeTags(parsed?.tags, extraTags).map((t) => sanitizeLearnedText(t)),
  };
  if (!extracted.question || !extracted.answer) return null;
  return extracted;
}

function composeAnswer(extracted: ExtractedQa) {
  const answerParts = [extracted.answer];
  if (extracted.steps) answerParts.push(`Steps: ${extracted.steps}`);
  if (extracted.exceptions) answerParts.push(`Exceptions: ${extracted.exceptions}`);
  return answerParts.join("\n\n");
}

async function findReplacesSourceId(question: string, organizationId: string) {
  try {
    const similar = await retrieveKnowledge({
      query: question,
      filters: { organizationId },
    });
    const top = similar.hits[0];
    if (top && top.score >= 0.85 && (top.sourceType === "QA" || top.sourceType === "CONVERSATION")) {
      return top.sourceId;
    }
  } catch {
    /* retrieval optional for versioning hint */
  }
  return undefined;
}

async function createLearnedSource(opts: {
  organizationId: string;
  extracted: ExtractedQa;
  createdBy: string;
  extraTags: string[];
  metadata: Record<string, unknown>;
}) {
  const auto = Boolean(getEnv().KNOWLEDGE_AUTO_APPROVE);
  const tags = opts.extracted.tags.length ? opts.extracted.tags : opts.extraTags;
  const source = await prisma.knowledgeSource.create({
    data: {
      id: newId(),
      organizationId: opts.organizationId,
      type: "CONVERSATION",
      title: (opts.extracted.title || opts.extracted.question).slice(0, 120),
      status: auto ? "PENDING" : "PENDING_REVIEW",
      question: opts.extracted.question,
      answer: composeAnswer(opts.extracted),
      category: opts.extracted.category,
      tags,
      createdBy: opts.createdBy,
      chunkCount: 0,
      metadata: opts.metadata as Prisma.InputJsonValue,
    },
  });
  if (auto) await enqueueIndexJob(source.id);
  aiLog("knowledge", "candidate created", { sourceId: source.id, auto });
  return source;
}

async function findSourceByMeta(organizationId: string, key: string, value: string) {
  const prior = await prisma.knowledgeSource.findMany({
    where: { type: "CONVERSATION", organizationId },
    select: { id: true, metadata: true },
  });
  const existing = prior.find((s) => {
    const meta = (s.metadata || {}) as Record<string, unknown>;
    return meta[key] === value;
  });
  if (!existing) return null;
  return prisma.knowledgeSource.findUnique({ where: { id: existing.id } });
}

export async function extractConversationKnowledge(conversationId: string, opts?: { ticketId?: string }) {
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conv) return null;
  if (conv.status !== "CLOSED") {
    aiLog("knowledge", "skip extract: conversation not closed", { conversationId, status: conv.status });
    return null;
  }
  const ticketId = opts?.ticketId || conv.ticketId || undefined;
  const existing = await findSourceByMeta(conv.organizationId, "sourceConversationId", conversationId);
  if (existing) {
    if (ticketId) await stampSourceTicketId(existing, ticketId);
    return prisma.knowledgeSource.findUnique({ where: { id: existing.id } });
  }

  const messages = await prisma.message.findMany({
    where: { conversationId, internal: false },
    orderBy: { createdAt: "asc" },
  });
  const hasHuman = messages.some((m) => m.role === "HUMAN");
  if (!hasHuman) {
    aiLog("knowledge", "skip extract: no human reply", { conversationId });
    return null;
  }

  const transcript = messages
    .map((m) => `${m.role}: ${m.body}`)
    .join("\n")
    .slice(0, 12000);

  let extracted: ExtractedQa | null;
  try {
    extracted = await extractReusableQa(transcript, ["conversation-learn"]);
  } catch (error) {
    aiWarn("knowledge", "extract failed", { conversationId, error });
    return null;
  }
  if (!extracted) {
    aiLog("knowledge", "empty extract", { conversationId });
    return null;
  }

  const replacesSourceId = await findReplacesSourceId(extracted.question, conv.organizationId);
  return createLearnedSource({
    organizationId: conv.organizationId,
    extracted,
    createdBy: SYSTEM_AI_USER_ID,
    extraTags: ["conversation-learn"],
    metadata: {
      sourceConversationId: conversationId,
      sourceMessageIds: messages.map((m) => m.id),
      createdBy: "AI",
      handoffReason: conv.handoffReason,
      resolvedBy: conv.agentId,
      origin: ticketId ? "RESOLVED_TICKET" : "RESOLVED_CHAT",
      ...(ticketId ? { sourceTicketId: ticketId } : {}),
      ...(replacesSourceId ? { replacesSourceId } : {}),
    },
  });
}

async function stampSourceTicketId(source: KnowledgeSource, ticketId: string) {
  const meta = { ...((source.metadata || {}) as Record<string, unknown>) };
  if (meta.sourceTicketId) return;
  meta.sourceTicketId = ticketId;
  meta.origin = meta.origin || "RESOLVED_TICKET";
  await prisma.knowledgeSource.update({
    where: { id: source.id },
    data: { metadata: meta as Prisma.InputJsonValue },
  });
}

export async function extractTicketKnowledge(ticketId: string, opts?: { createdBy?: string }) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      customer: { select: { id: true, organizationId: true, role: true } },
      comments: {
        where: { internal: false },
        orderBy: { createdAt: "asc" },
        include: { author: { select: { id: true, role: true } } },
      },
    },
  });
  if (!ticket) return null;
  if (ticket.status !== "RESOLVED" && ticket.status !== "CLOSED") {
    aiLog("knowledge", "skip ticket extract: not resolved", { ticketId, status: ticket.status });
    return null;
  }

  const organizationId = ticket.customer.organizationId || DEFAULT_ORGANIZATION_ID;
  const existing = await findSourceByMeta(organizationId, "sourceTicketId", ticketId);
  if (existing) return existing;

  const publicStaffComments = ticket.comments.filter((c) => c.author.role !== "CUSTOMER");
  const learnable = ticketHasLearnableContent({
    title: ticket.title,
    description: ticket.description,
    publicStaffComments,
  });

  if (learnable) {
    const transcript = [
      `TITLE: ${ticket.title}`,
      `DESCRIPTION: ${ticket.description}`,
      ...ticket.comments.map((c) => `${c.author.role}: ${c.body}`),
    ]
      .join("\n")
      .slice(0, 12000);

    let extracted: ExtractedQa | null;
    try {
      extracted = await extractReusableQa(transcript, ["ticket-learn", "conversation-learn"]);
    } catch (error) {
      aiWarn("knowledge", "ticket extract failed", { ticketId, error });
      return fallbackLinkedConversationExtract(ticketId, organizationId);
    }
    if (!extracted) {
      aiLog("knowledge", "empty ticket extract", { ticketId });
      return fallbackLinkedConversationExtract(ticketId, organizationId);
    }

    const replacesSourceId = await findReplacesSourceId(extracted.question, organizationId);
    return createLearnedSource({
      organizationId,
      extracted,
      createdBy: opts?.createdBy || ticket.assignedAgentId || SYSTEM_AI_USER_ID,
      extraTags: ["ticket-learn", "conversation-learn"],
      metadata: {
        origin: "RESOLVED_TICKET",
        sourceTicketId: ticketId,
        sourceCommentIds: ticket.comments.map((c) => c.id),
        createdBy: "AGENT",
        resolvedBy: opts?.createdBy || ticket.assignedAgentId,
        ...(replacesSourceId ? { replacesSourceId } : {}),
      },
    });
  }

  return fallbackLinkedConversationExtract(ticketId, organizationId);
}

async function fallbackLinkedConversationExtract(ticketId: string, organizationId: string) {
  const linked = await prisma.conversation.findMany({
    where: { ticketId, organizationId },
    select: { id: true, status: true },
  });
  for (const conv of linked) {
    if (conv.status !== "CLOSED") {
      await prisma.conversation.update({
        where: { id: conv.id },
        data: { status: "CLOSED", aiPaused: false },
      });
    }
    const source = await extractConversationKnowledge(conv.id, { ticketId });
    if (source) return source;
  }
  aiLog("knowledge", "skip ticket extract: not learnable", { ticketId });
  return null;
}
