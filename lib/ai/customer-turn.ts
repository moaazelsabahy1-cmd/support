import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { answerQuestion, type AnswerQuestionResult } from "@/lib/ai/agent";
import { knowledgeOrgId } from "@/lib/ai/org";
import { persistAiHandoff } from "@/lib/ai/handoff";
import { findOrCreateCustomerConversation } from "@/lib/ai/conversation";
import { emitToConversation } from "@/lib/socket-server";
import { serialize } from "@/lib/serialize";
import { SYSTEM_AI_USER_ID } from "@/types";
import { newId } from "@/lib/id";
import type { AiHandoffReason } from "@/types";
import type { LlmProvider } from "@/lib/ai/providers";

function turnKey(sessionId: string, message: string) {
  return createHash("sha256").update(`${sessionId}:${message.trim().toLowerCase()}`).digest("hex").slice(0, 40);
}

export async function handleCustomerAiTurn(opts: {
  userId: string;
  message: string;
  sessionId: string;
  llm?: LlmProvider | "fail";
}): Promise<AnswerQuestionResult & { handedOff: boolean; conversationId?: string; aiPaused?: boolean }> {
  const user = await prisma.user.findUnique({ where: { id: opts.userId } });
  if (!user) throw new Error("User not found");
  const organizationId = user.organizationId || (await knowledgeOrgId(opts.userId));
  const key = turnKey(opts.sessionId, opts.message);

  const conv = await findOrCreateCustomerConversation({
    customerId: user.id,
    organizationId,
    sessionId: opts.sessionId,
    attachUnpausedOnly: true,
  });

  const existingRows = await prisma.message.findMany({
    where: { conversationId: conv.id, aiTurnKey: { in: [`user:${key}`, `ai:${key}`, `handoff:${key}`] } },
  });
  const existingHandoff = existingRows.find((m) => m.aiTurnKey?.startsWith("handoff:"));
  const existingAi = existingRows.find((m) => m.aiTurnKey?.startsWith("ai:"));
  const existingUser = existingRows.find((m) => m.aiTurnKey?.startsWith("user:"));
  const completed = existingHandoff || existingAi;
  if (completed) {
    const log = await prisma.aiChatLog.findFirst({
      where: { sessionId: opts.sessionId, question: opts.message },
      orderBy: { createdAt: "desc" },
    });
    const handedOff = Boolean(existingHandoff) || conv.aiPaused;
    return {
      answer: log?.answer || completed.body,
      response: log?.answer || completed.body,
      sources: (Array.isArray(log?.sources) ? log.sources : []) as unknown as AnswerQuestionResult["sources"],
      confidence: log?.confidence ?? 0,
      escalated: Boolean(log?.escalated) || handedOff,
      offerHuman: false,
      fallbackUsed: Boolean(log?.fallbackUsed),
      knowledgeSufficient: !handedOff,
      handoffReason: (completed.handoffReason || conv.handoffReason) as AiHandoffReason | null,
      handedOff,
      conversationId: conv.id,
      aiPaused: conv.aiPaused,
    };
  }

  const now = new Date();
  if (!existingUser) {
    const customerMsg = await prisma.message.create({
      data: {
        id: newId(),
        conversationId: conv.id,
        senderId: user.id,
        body: opts.message,
        attachmentIds: [],
        readBy: [user.id],
        role: "CUSTOMER",
        aiTurnKey: `user:${key}`,
        createdAt: now,
      },
    });
    await prisma.conversation.update({
      where: { id: conv.id },
      data: { updatedAt: now, lastMessageAt: now },
    });
    emitToConversation(conv.id, "message:new", serialize(customerMsg));
  }

  if (conv.aiPaused) {
    return {
      answer: "An agent is already handling this conversation. They will reply in Chat.",
      response: "An agent is already handling this conversation. They will reply in Chat.",
      sources: [],
      confidence: 0,
      escalated: true,
      offerHuman: false,
      fallbackUsed: false,
      knowledgeSufficient: false,
      handoffReason: conv.handoffReason,
      handedOff: true,
      conversationId: conv.id,
      aiPaused: true,
    };
  }

  const result = await answerQuestion({
    message: opts.message,
    sessionId: opts.sessionId,
    userId: user.id,
    organizationId,
    llm: opts.llm,
  });

  const shouldHandoff = !result.knowledgeSufficient || result.escalated || result.handoffReason === "AI_ERROR";
  if (shouldHandoff) {
    const handed = await persistAiHandoff({
      userId: user.id,
      conversationId: conv.id,
      sessionId: opts.sessionId,
      reason: result.handoffReason || "KNOWLEDGE_NOT_FOUND",
      lastQuestion: opts.message,
      aiResponse: result.response,
      sources: result.sources,
      turnKey: `handoff:${key}`,
    });
    return { ...result, offerHuman: false, handedOff: true, conversationId: handed.id, aiPaused: true };
  }

  const aiMsg = await prisma.message.create({
    data: {
      id: newId(),
      conversationId: conv.id,
      senderId: SYSTEM_AI_USER_ID,
      body: result.response,
      attachmentIds: [],
      readBy: [SYSTEM_AI_USER_ID],
      role: "AI",
      aiTurnKey: `ai:${key}`,
    },
  });
  emitToConversation(conv.id, "message:new", serialize(aiMsg));
  return { ...result, offerHuman: false, handedOff: false, conversationId: conv.id, aiPaused: false };
}
