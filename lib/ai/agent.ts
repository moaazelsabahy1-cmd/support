import { prisma } from "@/lib/db";
import { retrieveKnowledge, type RetrievedHit } from "@/lib/ai/retrieval";
import { detectIntent, groundedPrompt, publicSourceLabel } from "@/lib/ai/prompts";
import { getChatModel, getEmbeddingModel, requireLlm, type LlmProvider } from "@/lib/ai/providers";
import { knowledgeOrgId } from "@/lib/ai/org";
import { knowledgeConfidenceThreshold } from "@/lib/env";
import { aiLog, aiWarn } from "@/lib/ai/log";
import { newId } from "@/lib/id";
import type { AiHandoffReason, PublicSourceRef } from "@/types";
import type { Prisma } from "@prisma/client";

const NO_KNOWLEDGE =
  "I don't have enough verified information to answer that.\nI'll connect you with a human agent.";
const EMPTY_REPLY =
  "I could not generate an answer. Please create a support ticket or talk to a human agent.";
const PROVIDER_FAIL =
  "The assistant could not complete that request. Create a support ticket or talk to a human.";

export function knowledgeIsSufficient(hits: RetrievedHit[], threshold: number) {
  if (!hits.length) return false;
  return (hits[0]?.score ?? 0) >= threshold;
}

export function handoffReasonForHits(hits: RetrievedHit[], threshold: number): AiHandoffReason {
  if (!hits.length) return "KNOWLEDGE_NOT_FOUND";
  const top = hits[0]?.score ?? 0;
  if (top < threshold) return "LOW_CONFIDENCE";
  return "LOW_RELEVANCE";
}

export type AnswerQuestionResult = {
  answer: string;
  response: string;
  sources: PublicSourceRef[];
  confidence: number;
  escalated: boolean;
  offerHuman: boolean;
  fallbackUsed: boolean;
  knowledgeSufficient: boolean;
  handoffReason: AiHandoffReason | null;
};

export async function answerQuestion(opts: {
  message: string;
  sessionId: string;
  userId?: string | null;
  organizationId?: string;
  assistantName?: string;
  language?: string;
  llm?: LlmProvider | "fail";
}): Promise<AnswerQuestionResult> {
  const intent = detectIntent(opts.message);
  if (intent === "escalate") {
    return logAndReturn({
      ...opts,
      response:
        "I can connect you with a human agent. Use Talk to a human agent to open a live conversation.",
      sources: [],
      retrievalScores: [],
      escalated: true,
      knowledgeSufficient: false,
      handoffReason: "CUSTOMER_REQUESTED_HUMAN",
      confidence: 0.2,
      model: "policy",
      fallbackUsed: false,
    });
  }

  const org = opts.organizationId || (await knowledgeOrgId(opts.userId));
  const threshold = knowledgeConfidenceThreshold();
  const retrieved = await retrieveKnowledge({ query: opts.message, filters: { organizationId: org } });
  const chunks = retrieved.hits;
  const top = chunks[0]?.score ?? 0;
  const sufficient = knowledgeIsSufficient(chunks, threshold);

  if (!sufficient) {
    const handoffReason = handoffReasonForHits(chunks, threshold);
    aiLog("ai", "no confident knowledge", { handoffReason, top });
    return logAndReturn({
      ...opts,
      response: NO_KNOWLEDGE,
      sources: [],
      retrievalScores: chunks.map((c) => c.score),
      escalated: true,
      knowledgeSufficient: false,
      handoffReason,
      confidence: top,
      model: getChatModel(),
      fallbackUsed: retrieved.fallbackUsed,
    });
  }

  const history = await loadSessionHistory(opts.sessionId);
  const publicSources: PublicSourceRef[] = chunks.map(publicSourceLabel);
  try {
    if (opts.llm === "fail") {
      throw new Error("injected provider failure");
    }
    const llm = opts.llm ?? requireLlm();
    const completion = await llm.generateText({
      messages: groundedPrompt(opts.message, chunks, history, {
        assistantName: opts.assistantName,
        language: opts.language,
      }),
      temperature: 0.2,
    });
    const response = completion.text.trim() || EMPTY_REPLY;
    aiLog("ai", "completion ok", {
      model: completion.model,
      tokens: completion.tokens,
      promptTokens: completion.promptTokens,
      completionTokens: completion.completionTokens,
    });
    return logAndReturn({
      ...opts,
      response,
      sources: publicSources,
      retrievalScores: chunks.map((c) => c.score),
      escalated: false,
      knowledgeSufficient: true,
      handoffReason: null,
      confidence: top,
      model: completion.model,
      tokens: completion.tokens,
      fallbackUsed: retrieved.fallbackUsed,
    });
  } catch (error) {
    aiWarn("ai", "provider request failed", { error });
    return logAndReturn({
      ...opts,
      response: PROVIDER_FAIL,
      sources: publicSources,
      retrievalScores: chunks.map((c) => c.score),
      escalated: true,
      knowledgeSufficient: false,
      handoffReason: "AI_ERROR",
      confidence: top,
      model: getChatModel(),
      fallbackUsed: retrieved.fallbackUsed,
    });
  }
}

async function loadSessionHistory(sessionId: string) {
  const logs = await prisma.aiChatLog.findMany({
    where: { sessionId },
    orderBy: { createdAt: "desc" },
    take: 6,
  });
  return logs
    .reverse()
    .flatMap((log) => {
      const turns: { role: "user" | "assistant"; content: string }[] = [];
      const q = log.question || log.message;
      const a = log.answer || log.response;
      if (q) turns.push({ role: "user", content: q.slice(0, 2000) });
      if (a) turns.push({ role: "assistant", content: a.slice(0, 2000) });
      return turns;
    });
}

async function logAndReturn(opts: {
  message: string;
  sessionId: string;
  userId?: string | null;
  response: string;
  sources: PublicSourceRef[];
  retrievalScores: number[];
  escalated: boolean;
  knowledgeSufficient: boolean;
  handoffReason: AiHandoffReason | null;
  confidence?: number;
  model?: string;
  tokens?: number;
  fallbackUsed: boolean;
}): Promise<AnswerQuestionResult> {
  await prisma.aiChatLog.create({
    data: {
      id: newId(),
      userId: opts.userId || null,
      sessionId: opts.sessionId,
      question: opts.message,
      answer: opts.response,
      message: opts.message,
      response: opts.response,
      sources: opts.sources as unknown as Prisma.InputJsonValue,
      retrievalScores: opts.retrievalScores,
      tokens: opts.tokens,
      model: opts.model,
      embeddingModel: getEmbeddingModel(),
      escalated: opts.escalated || !opts.knowledgeSufficient,
      fallbackUsed: opts.fallbackUsed,
      confidence: opts.confidence,
      handoffReason: opts.handoffReason,
    },
  });
  const offerHuman = !opts.knowledgeSufficient || opts.escalated;
  return {
    answer: opts.response,
    response: opts.response,
    sources: opts.sources,
    confidence: opts.confidence ?? 0,
    escalated: opts.escalated,
    offerHuman,
    fallbackUsed: opts.fallbackUsed,
    knowledgeSufficient: opts.knowledgeSufficient,
    handoffReason: opts.handoffReason,
  };
}
