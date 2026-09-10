import { persistAiHandoff } from "@/lib/ai/handoff";
import { findOrCreateCustomerConversation } from "@/lib/ai/conversation";
import { signWidgetToken, upsertWidgetGuest, verifyWidgetToken, widgetGuestEmail } from "@/lib/ai/widget-guest";
import { resolveHandoffStartAgent } from "@/lib/ai/handoff-queue";
import { assertHumanSupportOpen } from "@/lib/ai/human-support-hours";
import { prisma } from "@/lib/db";
import { emitToConversation } from "@/lib/socket-server";
import { serialize } from "@/lib/serialize";
import { AppError } from "@/lib/api-response";
import { newId } from "@/lib/id";
import type { ResolvedWidgetSite } from "@/lib/ai/widget-site";

export async function escalateWidgetToHuman(opts: {
  site: ResolvedWidgetSite;
  sessionId: string;
  name?: string;
  selectedAgentId?: string;
  at?: Date;
}) {
  if (!opts.selectedAgentId) {
    throw new AppError("VALIDATION", "Choose a support agent before sending a request.", 400);
  }
  await resolveHandoffStartAgent(opts.site.organizationId, opts.selectedAgentId);
  const existingGuest = await prisma.user.findUnique({ where: { email: widgetGuestEmail(opts.sessionId) } });
  if (existingGuest) {
    const existingConv = await prisma.conversation.findFirst({
      where: { customerId: existingGuest.id, sourceSessionId: opts.sessionId },
    });
    if (existingConv?.aiPaused) {
      const full = await prisma.conversation.findUniqueOrThrow({
        where: { id: existingConv.id },
        include: { humanHandoff: true },
      });
      return {
        sessionId: opts.sessionId,
        conversationId: full.id,
        human: true,
        widgetToken: signWidgetToken({
          sessionId: opts.sessionId,
          conversationId: full.id,
          userId: existingGuest.id,
        }),
        aiPaused: full.aiPaused,
        handoff: serialize(full.humanHandoff),
        handoffReason: full.handoffReason,
      };
    }
  }
  assertHumanSupportOpen(opts.at);
  const guest = await upsertWidgetGuest({
    sessionId: opts.sessionId,
    organizationId: opts.site.organizationId,
    name: opts.name,
  });
  const conv = await findOrCreateCustomerConversation({
    customerId: guest.id,
    organizationId: opts.site.organizationId,
    sessionId: opts.sessionId,
  });
  if (!conv.aiPaused) {
    const logs = await prisma.aiChatLog.findMany({
      where: { sessionId: opts.sessionId },
      orderBy: { createdAt: "desc" },
      take: 8,
    });
    const latest = logs[0];
    await persistAiHandoff({
      userId: guest.id,
      conversationId: conv.id,
      sessionId: opts.sessionId,
      reason: "CUSTOMER_REQUESTED_HUMAN",
      lastQuestion: String(latest?.question || latest?.message || "Visitor requested a human agent."),
      aiResponse: latest ? String(latest.answer || latest.response || "") : undefined,
      turnKey: `handoff:widget:${opts.sessionId}`,
      startAgentId: opts.selectedAgentId,
      at: opts.at,
    });
  }
  const full = await prisma.conversation.findUniqueOrThrow({
    where: { id: conv.id },
    include: { humanHandoff: true },
  });
  const widgetToken = signWidgetToken({
    sessionId: opts.sessionId,
    conversationId: full.id,
    userId: guest.id,
  });
  return {
    sessionId: opts.sessionId,
    conversationId: full.id,
    human: true,
    widgetToken,
    aiPaused: full.aiPaused,
    handoff: serialize(full.humanHandoff),
    handoffReason: full.handoffReason,
  };
}

export async function listWidgetConversation(opts: { widgetToken: string; sessionId: string }) {
  const claims = requireWidgetClaims(opts.widgetToken, opts.sessionId);
  const conv = await prisma.conversation.findUniqueOrThrow({
    where: { id: claims.conversationId },
    include: { humanHandoff: true },
  });
  const messages = await prisma.message.findMany({
    where: { conversationId: conv.id, internal: false },
    orderBy: { createdAt: "asc" },
  });
  return {
    conversationId: conv.id,
    handoff: serialize(conv.humanHandoff),
    aiPaused: conv.aiPaused,
    handoffReason: conv.handoffReason,
    messages: serialize(messages),
  };
}

export async function sendWidgetConversationMessage(opts: {
  widgetToken: string;
  sessionId: string;
  body: string;
}) {
  const text = opts.body.trim();
  if (!text) throw new AppError("VALIDATION", "Enter a message to send.", 400);
  const claims = requireWidgetClaims(opts.widgetToken, opts.sessionId);
  const conv = await prisma.conversation.findUniqueOrThrow({
    where: { id: claims.conversationId },
    include: { humanHandoff: true },
  });
  if (conv.customerId !== claims.userId) {
    throw new AppError("FORBIDDEN", "Not this conversation", 403);
  }
  const now = new Date();
  const message = await prisma.message.create({
    data: {
      id: newId(),
      conversationId: conv.id,
      senderId: claims.userId,
      body: text,
      attachmentIds: [],
      readBy: [claims.userId],
      role: "CUSTOMER",
    },
  });
  await prisma.conversation.update({
    where: { id: conv.id },
    data: { updatedAt: now, lastMessageAt: now },
  });
  const payload = serialize(message);
  emitToConversation(conv.id, "message:new", payload);
  return {
    message: payload,
    conversationId: conv.id,
    handoff: serialize(conv.humanHandoff),
    aiPaused: conv.aiPaused,
  };
}

function requireWidgetClaims(token: string, sessionId: string) {
  const claims = verifyWidgetToken(token);
  if (!claims || claims.sessionId !== sessionId) {
    throw new AppError("UNAUTHORIZED", "Invalid widget session", 401);
  }
  return claims;
}
