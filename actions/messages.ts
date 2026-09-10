"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { serialize } from "@/lib/serialize";
import { persistAiHandoff } from "@/lib/ai/handoff";
import { acceptHandoff, declineHandoff, listPublicHandoffAgents, resolveHandoffStartAgent } from "@/lib/ai/handoff-queue";
import { assertHumanSupportOpen, humanSupportHoursState } from "@/lib/ai/human-support-hours";
import { findOrCreateCustomerConversation } from "@/lib/ai/conversation";
import { extractConversationKnowledge } from "@/lib/ai/learn";
import { knowledgeOrgId } from "@/lib/ai/org";
import { assertCanAccessConversation } from "@/lib/chat/conversation-access";
import { sendConversationMessage } from "@/lib/chat/conversation-message";
import { AppError } from "@/lib/api-response";
import { newId } from "@/lib/id";
import type { Prisma } from "@prisma/client";

export async function listHandoffAgentCardsAction() {
  const user = await requireUser();
  const organizationId = await knowledgeOrgId(user.id);
  return {
    agents: await listPublicHandoffAgents(organizationId),
    ...humanSupportHoursState(),
  };
}

export async function listConversationsAction() {
  const user = await requireUser();
  const where: Prisma.ConversationWhereInput =
    user.role === "CUSTOMER"
      ? { customerId: user.id }
      : user.role === "AGENT"
        ? {
            OR: [
              { agentId: user.id },
              { humanHandoff: { is: { currentAgentId: user.id, status: { in: ["OFFERED", "ACCEPTED"] } } } },
            ],
          }
        : {};
  const items = await prisma.conversation.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 50,
    include: {
      customer: { select: { id: true, name: true, email: true } },
      humanHandoff: {
        include: {
          attempts: { orderBy: { order: "asc" as const } },
          currentAgent: { select: { id: true, name: true } },
        },
      },
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
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { humanHandoff: true },
  });
  if (!conv) throw new AppError("NOT_FOUND", "Conversation not found", 404);
  assertCanAccessConversation(user, conv);
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
  return sendConversationMessage({ user, conversationId, body, attachmentIds });
}

export async function closeConversationAction(conversationId: string) {
  const user = await requireUser();
  if (user.role === "CUSTOMER") throw new AppError("FORBIDDEN", "Agents close conversations", 403);
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { humanHandoff: true },
  });
  if (!conv) throw new AppError("NOT_FOUND", "Conversation not found", 404);
  assertCanAccessConversation(user, conv);
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
  await prisma.humanHandoff.updateMany({
    where: { conversationId: conv.id, status: { in: ["OFFERED", "ACCEPTED"] } },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
  if (conv.humanHandoff) {
    await prisma.humanHandoffEvent.create({
      data: {
        id: newId(),
        handoffId: conv.humanHandoff.id,
        conversationId: conv.id,
        actorId: user.id,
        type: "CLOSED",
        fromStatus: conv.humanHandoff.status,
        toStatus: "COMPLETED",
        agentId: conv.humanHandoff.currentAgentId,
      },
    });
  }
  await extractConversationKnowledge(conv.id);
  return serialize(updated);
}

export async function escalateAiToHumanAction(sessionId: string, selectedAgentId?: string) {
  const user = await requireUser();
  if (!selectedAgentId) {
    throw new AppError("VALIDATION", "Choose a support agent before sending a request.", 400);
  }
  const organizationId = await knowledgeOrgId(user.id);
  await resolveHandoffStartAgent(organizationId, selectedAgentId);
  let conv = await findOrCreateCustomerConversation({
    customerId: user.id,
    organizationId,
    sessionId,
  });
  const existingHandoff = await prisma.humanHandoff.findUnique({ where: { conversationId: conv.id } });
  const activeHandoff =
    existingHandoff && (existingHandoff.status === "OFFERED" || existingHandoff.status === "ACCEPTED");
  if (conv.aiPaused && activeHandoff) {
    return serialize(
      await prisma.conversation.findUniqueOrThrow({
        where: { id: conv.id },
        include: { humanHandoff: { include: { attempts: { orderBy: { order: "asc" } } } } },
      }),
    );
  }
  if (conv.aiPaused && !activeHandoff) {
    conv = await prisma.conversation.create({
      data: {
        id: newId(),
        customerId: user.id,
        organizationId,
        status: "OPEN",
        sourceSessionId: sessionId,
      },
    });
  }
  assertHumanSupportOpen();
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
    startAgentId: selectedAgentId,
  });
  return serialize(
    await prisma.conversation.findUniqueOrThrow({
      where: { id: conv.id },
      include: { humanHandoff: { include: { attempts: { orderBy: { order: "asc" } } } } },
    }),
  );
}

export async function acceptHandoffAction(handoffId: string) {
  const user = await requireUser();
  if (user.role === "CUSTOMER") throw new AppError("FORBIDDEN", "Agents accept handoffs", 403);
  return serialize(await acceptHandoff(handoffId, user.id));
}

export async function declineHandoffAction(handoffId: string) {
  const user = await requireUser();
  if (user.role === "CUSTOMER") throw new AppError("FORBIDDEN", "Agents decline handoffs", 403);
  return serialize(await declineHandoff(handoffId, user.id));
}
