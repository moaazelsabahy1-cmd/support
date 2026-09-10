import { prisma } from "@/lib/db";
import { notifyUser } from "@/lib/notifications";
import { emitToConversation, emitToUser } from "@/lib/socket-server";
import { serialize } from "@/lib/serialize";
import { SYSTEM_AI_USER_ID } from "@/types";
import { newId } from "@/lib/id";
import { AppError } from "@/lib/api-response";
import type { AiHandoffReason } from "@/types";

export const MAX_HANDOFF_AGENTS = 4;

export function nextHandoffAttempt(currentAttempt: number, queueLength: number) {
  if (currentAttempt >= queueLength || currentAttempt >= MAX_HANDOFF_AGENTS) return null;
  return currentAttempt + 1;
}

export async function listHandoffAgents(organizationId: string) {
  return prisma.user.findMany({
    where: {
      organizationId,
      role: "AGENT",
      status: "ACTIVE",
      email: { not: "ai@solvio.local" },
      id: { not: SYSTEM_AI_USER_ID },
    },
    orderBy: { createdAt: "asc" },
    take: MAX_HANDOFF_AGENTS,
    select: { id: true, name: true, email: true, createdAt: true, image: true, avatarUrl: true },
  });
}

export type PublicHandoffAgent = {
  id: string;
  label: string;
  name: string;
  title: string;
  ordinal: number;
  avatarUrl?: string | null;
};

export function publicHandoffAgentCards(
  agents: { id: string; name: string | null; image?: string | null; avatarUrl?: string | null }[],
): PublicHandoffAgent[] {
  return agents.map((agent, i) => ({
    id: agent.id,
    label: `Agent ${i + 1}`,
    name: agent.name || `Agent ${i + 1}`,
    title: "Support Agent",
    ordinal: i + 1,
    avatarUrl: agent.avatarUrl || agent.image || null,
  }));
}

export async function listPublicHandoffAgents(organizationId: string) {
  const agents = await listHandoffAgents(organizationId);
  return publicHandoffAgentCards(agents);
}

export async function resolveHandoffStartAgent(organizationId: string, startAgentId?: string | null) {
  const agents = await listHandoffAgents(organizationId);
  if (!agents.length) return { agents, start: null as { agent: (typeof agents)[0]; attempt: number } | null };
  if (!startAgentId) {
    return { agents, start: { agent: agents[0], attempt: 1 } };
  }
  const idx = agents.findIndex((a) => a.id === startAgentId);
  if (idx < 0) {
    throw new AppError("VALIDATION", "That agent is not available for support.", 400);
  }
  return { agents, start: { agent: agents[idx], attempt: idx + 1 } };
}

function payload(handoff: {
  id: string;
  conversationId: string;
  currentAgentId: string | null;
  status: string;
  currentAttempt: number;
  handoffReason: string;
}) {
  return {
    handoffId: handoff.id,
    conversationId: handoff.conversationId,
    currentAgentId: handoff.currentAgentId,
    status: handoff.status,
    currentAttempt: handoff.currentAttempt,
    agentLabel: `Agent ${handoff.currentAttempt}`,
    handoffReason: handoff.handoffReason,
  };
}

async function systemLine(conversationId: string, body: string) {
  const msg = await prisma.message.create({
    data: {
      id: newId(),
      conversationId,
      senderId: SYSTEM_AI_USER_ID,
      body,
      attachmentIds: [],
      readBy: [SYSTEM_AI_USER_ID],
      role: "SYSTEM",
    },
  });
  emitToConversation(conversationId, "message:new", serialize(msg));
  return msg;
}

export async function startSequentialHandoff(opts: {
  conversationId: string;
  customerId: string;
  organizationId: string;
  reason: AiHandoffReason;
  startAgentId?: string | null;
}) {
  const { agents, start } = await resolveHandoffStartAgent(opts.organizationId, opts.startAgentId);
  const existing = await prisma.humanHandoff.findUnique({
    where: { conversationId: opts.conversationId },
  });
  if (existing && (existing.status === "OFFERED" || existing.status === "ACCEPTED")) {
    return existing;
  }

  if (!agents.length || !start) {
    const handoff = existing
      ? await prisma.humanHandoff.update({
          where: { id: existing.id },
          data: { status: "NO_AGENT_AVAILABLE", currentAgentId: null, completedAt: new Date() },
        })
      : await prisma.humanHandoff.create({
          data: {
            id: newId(),
            conversationId: opts.conversationId,
            customerId: opts.customerId,
            status: "NO_AGENT_AVAILABLE",
            handoffReason: opts.reason,
            currentAttempt: 0,
            completedAt: new Date(),
          },
        });
    emitToConversation(opts.conversationId, "handoff:unavailable", payload(handoff));
    await systemLine(opts.conversationId, "No agent is available right now.");
    return handoff;
  }

  const first = start.agent;
  const attempt = start.attempt;
  const handoff = existing
    ? await prisma.humanHandoff.update({
        where: { id: existing.id },
        data: {
          status: "OFFERED",
          currentAgentId: first.id,
          currentAttempt: attempt,
          handoffReason: opts.reason,
          acceptedAt: null,
          completedAt: null,
        },
      })
    : await prisma.humanHandoff.create({
        data: {
          id: newId(),
          conversationId: opts.conversationId,
          customerId: opts.customerId,
          currentAgentId: first.id,
          status: "OFFERED",
          handoffReason: opts.reason,
          currentAttempt: attempt,
        },
      });

  await prisma.agentHandoffAttempt.create({
    data: {
      id: newId(),
      handoffId: handoff.id,
      agentId: first.id,
      order: attempt,
      status: "OFFERED",
    },
  });

  const body = payload(handoff);
  emitToConversation(opts.conversationId, "handoff:offered", body);
  emitToUser(first.id, "handoff:offered", body);
  await notifyUser({
    userId: first.id,
    title: "NEW CUSTOMER REQUEST",
    body: `Customer wants to talk to a human · Agent ${attempt}`,
    href: `/chat/${opts.conversationId}`,
    type: "ai.handoff",
  });
  await systemLine(
    opts.conversationId,
    `Request sent to Agent ${attempt}.\nWaiting for Agent ${attempt}...`,
  );
  return handoff;
}

export async function acceptHandoff(handoffId: string, agentId: string) {
  const now = new Date();
  const claimed = await prisma.humanHandoff.updateMany({
    where: { id: handoffId, status: "OFFERED", currentAgentId: agentId },
    data: { status: "ACCEPTED", acceptedAt: now },
  });
  if (claimed.count === 0) {
    throw new AppError("CONFLICT", "This conversation has already been accepted by another agent.", 409);
  }
  const handoff = await prisma.humanHandoff.findUniqueOrThrow({ where: { id: handoffId } });
  await prisma.agentHandoffAttempt.updateMany({
    where: { handoffId, agentId, status: "OFFERED" },
    data: { status: "ACCEPTED", respondedAt: now },
  });
  await prisma.conversation.update({
    where: { id: handoff.conversationId },
    data: { agentId, aiPaused: true },
  });
  const body = payload(handoff);
  emitToConversation(handoff.conversationId, "handoff:accepted", body);
  emitToUser(agentId, "handoff:accepted", body);
  emitToUser(handoff.customerId, "handoff:accepted", body);
  await systemLine(handoff.conversationId, `Agent ${handoff.currentAttempt} has joined the conversation.`);
  await notifyUser({
    userId: handoff.customerId,
    title: "Agent joined",
    body: `Agent ${handoff.currentAttempt} has joined the conversation.`,
    href: `/chat/${handoff.conversationId}`,
    type: "ai.escalation",
  });
  return handoff;
}

export async function declineHandoff(handoffId: string, agentId: string) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const handoff = await tx.humanHandoff.findUnique({ where: { id: handoffId } });
    if (!handoff || handoff.status !== "OFFERED" || handoff.currentAgentId !== agentId) {
      throw new AppError("CONFLICT", "This handoff is no longer offered to you.", 409);
    }
    const conv = await tx.conversation.findUniqueOrThrow({ where: { id: handoff.conversationId } });
    const agents = await tx.user.findMany({
      where: {
        organizationId: conv.organizationId,
        role: "AGENT",
        status: "ACTIVE",
        email: { not: "ai@solvio.local" },
        id: { not: SYSTEM_AI_USER_ID },
      },
      orderBy: { createdAt: "asc" },
      take: MAX_HANDOFF_AGENTS,
      select: { id: true },
    });
    await tx.agentHandoffAttempt.updateMany({
      where: { handoffId, agentId, status: "OFFERED" },
      data: { status: "DECLINED", respondedAt: now },
    });
    const next = nextHandoffAttempt(handoff.currentAttempt, agents.length);
    if (!next) {
      const done = await tx.humanHandoff.update({
        where: { id: handoffId },
        data: { status: "NO_AGENT_AVAILABLE", currentAgentId: null, completedAt: now },
      });
      return { handoff: done, nextAgentId: null as string | null, nextAttempt: null as number | null };
    }
    const nextAgent = agents[next - 1];
    await tx.agentHandoffAttempt.create({
      data: {
        id: newId(),
        handoffId,
        agentId: nextAgent.id,
        order: next,
        status: "OFFERED",
      },
    });
    const updated = await tx.humanHandoff.update({
      where: { id: handoffId },
      data: { currentAgentId: nextAgent.id, currentAttempt: next, status: "OFFERED" },
    });
    return { handoff: updated, nextAgentId: nextAgent.id, nextAttempt: next };
  }).then(async ({ handoff, nextAgentId, nextAttempt }) => {
    const body = payload(handoff);
    if (!nextAgentId) {
      emitToConversation(handoff.conversationId, "handoff:unavailable", body);
      await systemLine(handoff.conversationId, "No agent is available right now.");
      return handoff;
    }
    emitToConversation(handoff.conversationId, "handoff:declined", body);
    emitToUser(nextAgentId, "handoff:offered", body);
    await notifyUser({
      userId: nextAgentId,
      title: "NEW CUSTOMER REQUEST",
      body: `Agent ${nextAttempt} · ${handoff.handoffReason}`,
      href: `/chat/${handoff.conversationId}`,
      type: "ai.handoff",
    });
    await systemLine(
      handoff.conversationId,
      `Agent ${handoff.currentAttempt - 1} is unavailable.\nSending your request to Agent ${handoff.currentAttempt}...`,
    );
    return handoff;
  });
}

export async function getHandoffForConversation(conversationId: string) {
  return prisma.humanHandoff.findUnique({
    where: { conversationId },
    include: { attempts: { orderBy: { order: "asc" } } },
  });
}
