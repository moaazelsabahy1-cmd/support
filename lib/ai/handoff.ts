import { prisma } from "@/lib/db";
import { notifyAgents, notifyUser } from "@/lib/notifications";
import { emitToConversation } from "@/lib/socket-server";
import { serialize } from "@/lib/serialize";
import { SYSTEM_AI_USER_ID } from "@/types";
import { newId } from "@/lib/id";
import type { AiHandoffReason } from "@/types";

export function shouldSkipHandoff(conv: {
  aiPaused: boolean;
  handoffReason?: string | null;
  hasSystemHandoff?: boolean;
}) {
  return Boolean(conv.aiPaused || conv.handoffReason || conv.hasSystemHandoff);
}

export async function persistAiHandoff(opts: {
  userId: string;
  conversationId: string;
  sessionId: string;
  reason: AiHandoffReason;
  lastQuestion: string;
  aiResponse?: string;
  turnKey: string;
}) {
  const existing = await prisma.message.findFirst({
    where: { conversationId: opts.conversationId, aiTurnKey: opts.turnKey },
  });
  const convNow = await prisma.conversation.findUniqueOrThrow({ where: { id: opts.conversationId } });
  if (existing) return convNow;

  const existingHandoff = await prisma.message.findFirst({
    where: { conversationId: opts.conversationId, role: "SYSTEM", handoffReason: { not: null } },
  });
  if (shouldSkipHandoff({ ...convNow, hasSystemHandoff: Boolean(existingHandoff) })) {
    return convNow;
  }

  const now = new Date();
  const claimed = await prisma.conversation.updateMany({
    where: { id: opts.conversationId, status: "OPEN", aiPaused: false },
    data: {
      updatedAt: now,
      lastMessageAt: now,
      aiPaused: true,
      handoffReason: opts.reason,
      status: "OPEN",
      sourceSessionId: opts.sessionId,
    },
  });
  if (claimed.count === 0) {
    return prisma.conversation.findUniqueOrThrow({ where: { id: opts.conversationId } });
  }

  const summary = [
    "Connecting you with a human agent. They can see your last question and will reply in this chat.",
    `Last question: ${opts.lastQuestion}`,
    opts.aiResponse ? `Assistant: ${opts.aiResponse}` : "",
    `Reason: ${opts.reason}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const message = await prisma.$transaction(async (tx) => {
    const msg = await tx.message.create({
      data: {
        id: newId(),
        conversationId: opts.conversationId,
        senderId: SYSTEM_AI_USER_ID,
        body: summary,
        attachmentIds: [],
        readBy: [SYSTEM_AI_USER_ID],
        internal: false,
        role: "SYSTEM",
        handoffReason: opts.reason,
        aiTurnKey: opts.turnKey,
        createdAt: now,
      },
    });
    await tx.aiChatLog.updateMany({
      where: { sessionId: opts.sessionId },
      data: { escalated: true, handoffReason: opts.reason },
    });
    return msg;
  });

  emitToConversation(opts.conversationId, "message:new", serialize(message));
  await notifyUser({
    userId: opts.userId,
    title: "Human support requested",
    body: "An agent will join your conversation shortly.",
    href: `/chat/${opts.conversationId}`,
    type: "ai.escalation",
  });
  await notifyAgents({
    title: "AI handoff waiting",
    body: opts.lastQuestion.slice(0, 140),
    href: `/chat/${opts.conversationId}`,
    type: "ai.handoff",
    excludeUserId: opts.userId,
  });
  return prisma.conversation.findUniqueOrThrow({ where: { id: opts.conversationId } });
}
