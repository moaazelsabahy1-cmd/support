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

/** Circular next agent who has not already declined this handoff. */
export function nextEligibleHandoffAgent<T extends { id: string }>(
  agents: T[],
  currentAgentId: string,
  declinedAgentIds: Iterable<string>,
): { agent: T; attempt: number } | null {
  const declined = new Set(declinedAgentIds);
  declined.add(currentAgentId);
  if (!agents.length) return null;
  const start = agents.findIndex((a) => a.id === currentAgentId);
  const from = start < 0 ? 0 : start;
  for (let step = 1; step <= agents.length; step++) {
    const idx = (from + step) % agents.length;
    const agent = agents[idx];
    if (!declined.has(agent.id)) {
      return { agent, attempt: idx + 1 };
    }
  }
  return null;
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

export type HandoffEventType =
  | "HUMAN_REQUESTED"
  | "REQUEST_SENT"
  | "OFFERED"
  | "ACCEPTED"
  | "DECLINED"
  | "UNAVAILABLE"
  | "CONNECTED"
  | "CLOSED";

export async function recordHandoffEvent(opts: {
  handoffId: string;
  conversationId: string;
  actorId?: string | null;
  type: HandoffEventType;
  fromStatus?: string | null;
  toStatus?: string | null;
  agentId?: string | null;
  reason?: string | null;
}) {
  return prisma.humanHandoffEvent.create({
    data: {
      id: newId(),
      handoffId: opts.handoffId,
      conversationId: opts.conversationId,
      actorId: opts.actorId || null,
      type: opts.type,
      fromStatus: opts.fromStatus || null,
      toStatus: opts.toStatus || null,
      agentId: opts.agentId || null,
      reason: opts.reason || null,
    },
  });
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
    await recordHandoffEvent({
      handoffId: handoff.id,
      conversationId: opts.conversationId,
      actorId: opts.customerId,
      type: "UNAVAILABLE",
      toStatus: "NO_AGENT_AVAILABLE",
    });
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
  await recordHandoffEvent({
    handoffId: handoff.id,
    conversationId: opts.conversationId,
    actorId: opts.customerId,
    type: "HUMAN_REQUESTED",
    toStatus: "OFFERED",
    agentId: first.id,
    reason: opts.reason,
  });
  await recordHandoffEvent({
    handoffId: handoff.id,
    conversationId: opts.conversationId,
    actorId: opts.customerId,
    type: "REQUEST_SENT",
    toStatus: "OFFERED",
    agentId: first.id,
  });
  await recordHandoffEvent({
    handoffId: handoff.id,
    conversationId: opts.conversationId,
    actorId: opts.customerId,
    type: "OFFERED",
    toStatus: "OFFERED",
    agentId: first.id,
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
  await recordHandoffEvent({
    handoffId,
    conversationId: handoff.conversationId,
    actorId: agentId,
    type: "ACCEPTED",
    fromStatus: "OFFERED",
    toStatus: "ACCEPTED",
    agentId,
  });
  await recordHandoffEvent({
    handoffId,
    conversationId: handoff.conversationId,
    actorId: agentId,
    type: "CONNECTED",
    fromStatus: "OFFERED",
    toStatus: "ACCEPTED",
    agentId,
  });
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
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.humanHandoff.findUnique({ where: { id: handoffId } });
    if (!current || current.status !== "OFFERED" || current.currentAgentId !== agentId) {
      throw new AppError("CONFLICT", "This handoff is no longer offered to you.", 409);
    }
    const conv = await tx.conversation.findUniqueOrThrow({ where: { id: current.conversationId } });
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
      select: { id: true, name: true },
    });
    const claimed = await tx.agentHandoffAttempt.updateMany({
      where: { handoffId, agentId, status: "OFFERED" },
      data: { status: "DECLINED", respondedAt: now },
    });
    if (claimed.count !== 1) {
      throw new AppError("CONFLICT", "This handoff is no longer offered to you.", 409);
    }
    const declinedRows = await tx.agentHandoffAttempt.findMany({
      where: { handoffId, status: "DECLINED" },
      select: { agentId: true },
    });
    const next = nextEligibleHandoffAgent(
      agents,
      agentId,
      declinedRows.map((r) => r.agentId),
    );
    const lastOrder = await tx.agentHandoffAttempt.aggregate({
      where: { handoffId },
      _max: { order: true },
    });
    const moved = await tx.humanHandoff.updateMany({
      where: { id: handoffId, status: "OFFERED", currentAgentId: agentId },
      data: next
        ? {
            status: "OFFERED",
            currentAgentId: next.agent.id,
            currentAttempt: next.attempt,
          }
        : { status: "NO_AGENT_AVAILABLE", currentAgentId: agentId, completedAt: now },
    });
    if (moved.count !== 1) {
      throw new AppError("CONFLICT", "This handoff is no longer offered to you.", 409);
    }
    if (next) {
      await tx.agentHandoffAttempt.create({
        data: {
          id: newId(),
          handoffId,
          agentId: next.agent.id,
          order: (lastOrder._max.order || 0) + 1,
          status: "OFFERED",
        },
      });
    }
    await tx.humanHandoffEvent.create({
      data: {
        id: newId(),
        handoffId,
        conversationId: current.conversationId,
        actorId: agentId,
        type: "DECLINED",
        fromStatus: "OFFERED",
        toStatus: next ? "OFFERED" : "NO_AGENT_AVAILABLE",
        agentId,
      },
    });
    await tx.humanHandoffEvent.create({
      data: {
        id: newId(),
        handoffId,
        conversationId: current.conversationId,
        actorId: agentId,
        type: next ? "OFFERED" : "UNAVAILABLE",
        fromStatus: "OFFERED",
        toStatus: next ? "OFFERED" : "NO_AGENT_AVAILABLE",
        agentId: next?.agent.id || agentId,
      },
    });
    const handoff = await tx.humanHandoff.findUniqueOrThrow({ where: { id: handoffId } });
    const declinedAttempt = current.currentAttempt;
    return { handoff, next, declinedAttempt };
  });

  const body = payload(result.handoff);
  if (!result.next) {
    emitToConversation(result.handoff.conversationId, "handoff:unavailable", body);
    emitToUser(agentId, "handoff:unavailable", body);
    emitToUser(result.handoff.customerId, "handoff:unavailable", body);
    await systemLine(result.handoff.conversationId, "All human agents are currently unavailable.");
    await notifyUser({
      userId: result.handoff.customerId,
      title: "Human support unavailable",
      body: "All human agents are currently unavailable.",
      href: `/chat/${result.handoff.conversationId}`,
      type: "ai.escalation",
    });
    return result.handoff;
  }

  emitToConversation(result.handoff.conversationId, "handoff:declined", body);
  emitToUser(agentId, "handoff:declined", body);
  emitToConversation(result.handoff.conversationId, "handoff:offered", body);
  emitToUser(result.next.agent.id, "handoff:offered", body);
  await systemLine(
    result.handoff.conversationId,
    `Agent ${result.declinedAttempt} is unavailable. Your request has been sent to Agent ${result.handoff.currentAttempt}.`,
  );
  await notifyUser({
    userId: result.next.agent.id,
    title: "NEW CUSTOMER REQUEST",
    body: `Customer wants to talk to a human · Agent ${result.handoff.currentAttempt}`,
    href: `/chat/${result.handoff.conversationId}`,
    type: "ai.handoff",
  });
  await notifyUser({
    userId: result.handoff.customerId,
    title: "Request forwarded",
    body: `Agent ${result.declinedAttempt} is unavailable. Your request has been sent to Agent ${result.handoff.currentAttempt}.`,
    href: `/chat/${result.handoff.conversationId}`,
    type: "ai.escalation",
  });
  return result.handoff;
}

export async function getHandoffForConversation(conversationId: string) {
  return prisma.humanHandoff.findUnique({
    where: { conversationId },
    include: { attempts: { orderBy: { order: "asc" } } },
  });
}
