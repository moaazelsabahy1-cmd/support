"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { serialize } from "@/lib/serialize";
import { emitToConversation } from "@/lib/socket-server";
import { notifyUser } from "@/lib/notifications";
import { persistAiHandoff } from "@/lib/ai/handoff";
import { findOrCreateCustomerConversation } from "@/lib/ai/conversation";
import { extractConversationKnowledge } from "@/lib/ai/learn";
import { knowledgeOrgId } from "@/lib/ai/org";
import { AppError } from "@/lib/api-response";
import { newId } from "@/lib/id";
import type { Prisma } from "@prisma/client";

export async function listConversationsAction() {
  const user = await requireUser();
  const where: Prisma.ConversationWhereInput =
    user.role === "CUSTOMER"
      ? { customerId: user.id }
      : user.role === "AGENT"
        ? {
            OR: [
              { agentId: user.id },
              { AND: [{ agentId: null }, { status: "OPEN" }] },
              { AND: [{ aiPaused: true }, { status: "OPEN" }] },
            ],
          }
        : {};
  const items = await prisma.conversation.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 50,
    include: {
      customer: { select: { id: true, name: true, email: true } },
      messages: {
        where: { role: "CUSTOMER", internal: false },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  return serialize(
    items.map(({ messages, ...rest }) => ({
      ...rest,
      lastQuestion: messages[0]?.body || null,
    })),
  );
}

export async function getOrCreateConversationAction(customerId?: string) {
  const user = await requireUser();
  const cid = user.role === "CUSTOMER" ? user.id : customerId;
  if (!cid) throw new AppError("BAD_REQUEST", "customerId required", 400);
  const customer = await prisma.user.findUnique({ where: { id: cid } });
  let conv = await prisma.conversation.findFirst({ where: { customerId: cid, status: "OPEN" } });
  if (!conv) {
    conv = await prisma.conversation.create({
      data: {
        id: newId(),
        customerId: cid,
        agentId: user.role === "AGENT" ? user.id : null,
        organizationId: customer?.organizationId || "default",
        status: "OPEN",
      },
    });
  }
  return serialize(conv);
}

export async function listMessagesAction(conversationId: string) {
  const user = await requireUser();
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conv) throw new AppError("NOT_FOUND", "Conversation not found", 404);
  if (user.role === "CUSTOMER" && conv.customerId !== user.id) {
    throw new AppError("FORBIDDEN", "Not your conversation", 403);
  }
  const items = await prisma.message.findMany({
    where: {
      conversationId: conv.id,
      ...(user.role === "CUSTOMER" ? { internal: false } : {}),
    },
    orderBy: { createdAt: "asc" },
  });
  return serialize(items);
}

export async function sendMessageAction(conversationId: string, body: string, attachmentIds: string[] = []) {
  const user = await requireUser();
  if (!body.trim() && attachmentIds.length === 0) {
    throw new AppError("BAD_REQUEST", "Message cannot be empty", 400);
  }
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conv) throw new AppError("NOT_FOUND", "Conversation not found", 404);
  const now = new Date();
  const role = user.role === "CUSTOMER" ? "CUSTOMER" : "HUMAN";
  const message = await prisma.message.create({
    data: {
      id: newId(),
      conversationId: conv.id,
      senderId: user.id,
      body,
      attachmentIds,
      readBy: [user.id],
      role,
    },
  });
  await prisma.conversation.update({
    where: { id: conv.id },
    data: {
      updatedAt: now,
      lastMessageAt: now,
      agentId: user.role === "AGENT" || user.role === "ADMIN" || user.role === "SUPER_ADMIN" ? user.id : conv.agentId,
    },
  });
  const payload = serialize(message);
  emitToConversation(conversationId, "message:new", payload);
  const other = user.role === "CUSTOMER" ? conv.agentId : conv.customerId;
  if (other) {
    await notifyUser({
      userId: other,
      title: "New message",
      body: body.slice(0, 100) || "Attachment",
      href: `/chat/${conversationId}`,
      type: "message.new",
    });
  }
  return payload;
}

export async function closeConversationAction(conversationId: string) {
  const user = await requireUser();
  if (user.role === "CUSTOMER") throw new AppError("FORBIDDEN", "Agents close conversations", 403);
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conv) throw new AppError("NOT_FOUND", "Conversation not found", 404);
  const updated = await prisma.conversation.update({
    where: { id: conv.id },
    data: {
      status: "CLOSED",
      aiPaused: false,
      agentId:
        user.role === "AGENT" || user.role === "ADMIN" || user.role === "SUPER_ADMIN"
          ? user.id
          : conv.agentId,
    },
  });
  await extractConversationKnowledge(conv.id);
  return serialize(updated);
}

export async function escalateAiToHumanAction(sessionId: string) {
  const user = await requireUser();
  const organizationId = await knowledgeOrgId(user.id);
  const conv = await findOrCreateCustomerConversation({
    customerId: user.id,
    organizationId,
    sessionId,
  });
  if (conv.aiPaused) {
    return serialize(conv);
  }
  const logs = await prisma.aiChatLog.findMany({
    where: { sessionId },
    orderBy: { createdAt: "desc" },
    take: 8,
  });
  const latest = logs[0];
  const logSources = Array.isArray(latest?.sources) ? (latest.sources as { title?: string }[]) : [];
  await persistAiHandoff({
    userId: user.id,
    conversationId: conv.id,
    sessionId,
    reason: "CUSTOMER_REQUESTED_HUMAN",
    lastQuestion: String(latest?.question || latest?.message || "Customer requested a human agent."),
    aiResponse: latest ? String(latest.answer || latest.response || "") : undefined,
    sources: logSources.map((s) => ({ title: String(s.title || "Source"), type: "QA" })),
    turnKey: `handoff:manual:${sessionId}`,
  });
  return serialize(await prisma.conversation.findUniqueOrThrow({ where: { id: conv.id } }));
}
