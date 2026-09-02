import { prisma } from "@/lib/db";
import { enqueueIndexJob } from "@/lib/ai/jobs";
import { retrieveKnowledge } from "@/lib/ai/retrieval";
import { sanitizeLearnedText } from "@/lib/ai/sanitize-knowledge";
import { getEnv } from "@/lib/env";
import { requireLlm } from "@/lib/ai/providers";
import { aiLog, aiWarn } from "@/lib/ai/log";
import { newId } from "@/lib/id";
import { SYSTEM_AI_USER_ID } from "@/types";

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

export async function extractConversationKnowledge(conversationId: string) {
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conv) return null;
  if (conv.status !== "CLOSED") {
    aiLog("knowledge", "skip extract: conversation not closed", { conversationId, status: conv.status });
    return null;
  }
  const prior = await prisma.knowledgeSource.findMany({
    where: { type: "CONVERSATION", organizationId: conv.organizationId },
    select: { id: true, metadata: true, status: true, question: true, answer: true, title: true },
  });
  const existing = prior.find((s) => {
    const meta = (s.metadata || {}) as Record<string, unknown>;
    return meta.sourceConversationId === conversationId;
  });
  if (existing) return prisma.knowledgeSource.findUnique({ where: { id: existing.id } });

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

  let extracted: { question: string; answer: string; steps?: string; exceptions?: string };
  try {
    const llm = requireLlm();
    const completion = await llm.generateText({
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content:
            "Extract reusable support knowledge from a resolved conversation. Return JSON only with keys question, answer, steps, exceptions. Omit greetings, PII, emails, phone numbers, and one-off personal details. If nothing reusable exists, return {\"question\":\"\",\"answer\":\"\"}.",
        },
        { role: "user", content: transcript },
      ],
    });
    const parsed = parseJsonObject(completion.text);
    extracted = {
      question: sanitizeLearnedText(String(parsed?.question || "")),
      answer: sanitizeLearnedText(String(parsed?.answer || "")),
      steps: parsed?.steps ? sanitizeLearnedText(String(parsed.steps)) : undefined,
      exceptions: parsed?.exceptions ? sanitizeLearnedText(String(parsed.exceptions)) : undefined,
    };
  } catch (error) {
    aiWarn("knowledge", "extract failed", { conversationId, error });
    return null;
  }

  if (!extracted.question || !extracted.answer) {
    aiLog("knowledge", "empty extract", { conversationId });
    return null;
  }

  const answerParts = [extracted.answer];
  if (extracted.steps) answerParts.push(`Steps: ${extracted.steps}`);
  if (extracted.exceptions) answerParts.push(`Exceptions: ${extracted.exceptions}`);
  const answer = answerParts.join("\n\n");

  let replacesSourceId: string | undefined;
  try {
    const similar = await retrieveKnowledge({
      query: extracted.question,
      filters: { organizationId: conv.organizationId },
    });
    const top = similar.hits[0];
    if (top && top.score >= 0.85 && (top.sourceType === "QA" || top.sourceType === "CONVERSATION")) {
      replacesSourceId = top.sourceId;
    }
  } catch {
    /* retrieval optional for versioning hint */
  }

  const metadata = {
    sourceConversationId: conversationId,
    sourceMessageIds: messages.map((m) => m.id),
    createdBy: "AI",
    handoffReason: conv.handoffReason,
    resolvedBy: conv.agentId,
    ...(replacesSourceId ? { replacesSourceId } : {}),
  };

  const auto = Boolean(getEnv().KNOWLEDGE_AUTO_APPROVE);
  const source = await prisma.knowledgeSource.create({
    data: {
      id: newId(),
      organizationId: conv.organizationId,
      type: "CONVERSATION",
      title: extracted.question.slice(0, 120),
      status: auto ? "PENDING" : "PENDING_REVIEW",
      question: extracted.question,
      answer,
      category: "General",
      tags: ["conversation-learn"],
      createdBy: SYSTEM_AI_USER_ID,
      chunkCount: 0,
      metadata,
    },
  });
  if (auto) await enqueueIndexJob(source.id);
  aiLog("knowledge", "candidate created", { sourceId: source.id, auto });
  return source;
}
