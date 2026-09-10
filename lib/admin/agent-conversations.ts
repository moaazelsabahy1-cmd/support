import { prisma } from "@/lib/db";
import { AppError } from "@/lib/api-response";
import { serialize } from "@/lib/serialize";
import { customerHandoffStatusLabel } from "@/lib/ai/handoff-copy";
import { listHandoffAgents, publicHandoffAgentCards } from "@/lib/ai/handoff-queue";
import { knowledgeOrgId } from "@/lib/ai/org";
import type { ConversationActor } from "@/lib/chat/conversation-access";
import type { Prisma } from "@prisma/client";

const ADMIN_ROLES = new Set(["ADMIN", "SUPER_ADMIN"]);
const FILTERS = new Set(["pending", "accepted", "declined", "connected", "closed"]);

export function assertAdminActor(actor: ConversationActor) {
  if (!ADMIN_ROLES.has(actor.role)) {
    throw new AppError("FORBIDDEN", "Insufficient role", 403);
  }
}

export function agentConversationWhere(agentId: string): Prisma.ConversationWhereInput {
  return {
    OR: [
      { agentId },
      { humanHandoff: { is: { currentAgentId: agentId } } },
      { humanHandoff: { is: { attempts: { some: { agentId } } } } },
    ],
  };
}

function conversationSearchWhere(q: string): Prisma.ConversationWhereInput {
  const term = q.trim();
  if (!term) return {};
  return {
    OR: [
      { id: { contains: term, mode: "insensitive" } },
      { ticketId: { contains: term, mode: "insensitive" } },
      { customer: { is: { name: { contains: term, mode: "insensitive" } } } },
      { customer: { is: { email: { contains: term, mode: "insensitive" } } } },
      { messages: { some: { body: { contains: term, mode: "insensitive" } } } },
    ],
  };
}

function parseIsoDate(value: string | undefined, label: string) {
  if (!value?.trim()) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new AppError("VALIDATION", `${label} must be a valid ISO date.`, 400);
  }
  return d;
}

function statusFilterWhere(agentId: string, status?: string): Prisma.ConversationWhereInput {
  if (!status) return {};
  if (!FILTERS.has(status)) {
    throw new AppError("VALIDATION", "status must be pending, accepted, declined, connected, or closed.", 400);
  }
  if (status === "pending") {
    return { humanHandoff: { is: { currentAgentId: agentId, status: "OFFERED" } } };
  }
  if (status === "accepted") {
    return { humanHandoff: { is: { status: "ACCEPTED" } } };
  }
  if (status === "connected") {
    return { status: "OPEN", humanHandoff: { is: { status: "ACCEPTED" } } };
  }
  if (status === "declined") {
    return {
      humanHandoff: {
        is: {
          OR: [
            { attempts: { some: { agentId, status: "DECLINED" } } },
            { currentAgentId: agentId, status: "NO_AGENT_AVAILABLE" },
          ],
        },
      },
    };
  }
  return {
    OR: [{ status: "CLOSED" }, { humanHandoff: { is: { status: { in: ["COMPLETED", "NO_AGENT_AVAILABLE"] } } } }],
  };
}

const conversationListInclude = {
  customer: { select: { id: true, name: true, email: true } },
  agent: { select: { id: true, name: true, email: true, role: true } },
  humanHandoff: {
    select: {
      id: true,
      status: true,
      currentAgentId: true,
      currentAttempt: true,
      attempts: { select: { agentId: true, order: true, status: true }, orderBy: { order: "asc" as const } },
    },
  },
  messages: { orderBy: { createdAt: "desc" as const }, take: 1 },
} satisfies Prisma.ConversationInclude;

function mapListedConversation(conv: {
  id: string;
  status: string;
  ticketId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt: Date | null;
  agentId: string | null;
  customer: { id: string; name: string; email: string };
  agent: { id: string; name: string; email: string; role: string } | null;
  humanHandoff: {
    status: string;
    currentAgentId: string | null;
    currentAttempt: number;
  } | null;
  messages: { body: string; createdAt: Date }[];
}) {
  const closed = conv.status === "CLOSED";
  return {
    id: conv.id,
    ticketId: conv.ticketId || null,
    customerId: conv.customer.id,
    customer: conv.customer,
    assignedAgent: conv.agent,
    assignedAgentId: conv.agentId || conv.humanHandoff?.currentAgentId || null,
    status: conv.status,
    handoffStatus: conv.humanHandoff?.status || null,
    displayStatus: customerHandoffStatusLabel(conv.humanHandoff?.status, closed),
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
    lastMessageAt: conv.lastMessageAt || conv.messages[0]?.createdAt || conv.updatedAt,
    lastMessage: conv.messages[0]?.body || null,
  };
}

async function agentCounts(agentId: string) {
  const base = agentConversationWhere(agentId);
  const [conversationCount, pending, accepted, declined, connected, closed] = await Promise.all([
    prisma.conversation.count({ where: base }),
    prisma.conversation.count({ where: { AND: [base, statusFilterWhere(agentId, "pending")] } }),
    prisma.conversation.count({ where: { AND: [base, statusFilterWhere(agentId, "accepted")] } }),
    prisma.conversation.count({ where: { AND: [base, statusFilterWhere(agentId, "declined")] } }),
    prisma.conversation.count({ where: { AND: [base, statusFilterWhere(agentId, "connected")] } }),
    prisma.conversation.count({ where: { AND: [base, statusFilterWhere(agentId, "closed")] } }),
  ]);
  return { conversationCount, pending, accepted, declined, connected, closed };
}

export async function listAdminAgents(actor: ConversationActor, q?: string) {
  assertAdminActor(actor);
  const orgId = await knowledgeOrgId(actor.id);
  const agents = await listHandoffAgents(orgId);
  const cards = publicHandoffAgentCards(agents);
  const term = q?.trim().toLowerCase();
  const filtered = term
    ? cards.filter(
        (c) =>
          c.name.toLowerCase().includes(term) ||
          c.label.toLowerCase().includes(term) ||
          (agents.find((a) => a.id === c.id)?.email || "").toLowerCase().includes(term),
      )
    : cards;
  const items = await Promise.all(
    filtered.map(async (card) => {
      const user = agents.find((a) => a.id === card.id)!;
      const counts = await agentCounts(card.id);
      return {
        id: card.id,
        label: card.label,
        name: card.name,
        email: user.email,
        status: "ACTIVE",
        availability: "Available",
        ...counts,
      };
    }),
  );
  return serialize({ items });
}

export async function assertAgentUser(agentId: string) {
  if (!agentId?.trim()) throw new AppError("VALIDATION", "agentId is required.", 400);
  const agent = await prisma.user.findUnique({
    where: { id: agentId },
    select: { id: true, name: true, email: true, role: true, status: true },
  });
  if (!agent || agent.role !== "AGENT") {
    throw new AppError("NOT_FOUND", "Agent not found", 404);
  }
  return agent;
}

export type AgentConversationListOpts = {
  q?: string;
  status?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

function parseListOpts(qOrOpts?: string | AgentConversationListOpts): AgentConversationListOpts {
  if (typeof qOrOpts === "string") return { q: qOrOpts };
  return qOrOpts || {};
}

export async function listConversationsForAgent(
  actor: ConversationActor,
  agentId: string,
  qOrOpts?: string | AgentConversationListOpts,
) {
  assertAdminActor(actor);
  const agent = await assertAgentUser(agentId);
  const opts = parseListOpts(qOrOpts);
  const page = Math.max(1, Number(opts.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(opts.pageSize) || 20));
  const from = parseIsoDate(opts.from, "from");
  const to = parseIsoDate(opts.to, "to");
  if (from && to && from > to) {
    throw new AppError("VALIDATION", "from must be before to.", 400);
  }
  const dateWhere: Prisma.ConversationWhereInput =
    from || to
      ? {
          OR: [
            { lastMessageAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } },
            { updatedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } },
          ],
        }
      : {};
  const where: Prisma.ConversationWhereInput = {
    AND: [
      agentConversationWhere(agentId),
      conversationSearchWhere(opts.q || ""),
      statusFilterWhere(agentId, opts.status),
      dateWhere,
    ],
  };
  const [total, items] = await Promise.all([
    prisma.conversation.count({ where }),
    prisma.conversation.findMany({
      where,
      orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: conversationListInclude,
    }),
  ]);
  return serialize({
    agent,
    items: items.map(mapListedConversation),
    page,
    pageSize,
    total,
  });
}

export async function getConversationForAdmin(
  actor: ConversationActor,
  conversationId: string,
  agentId?: string,
) {
  assertAdminActor(actor);
  if (!conversationId?.trim()) throw new AppError("VALIDATION", "conversationId is required.", 400);
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      customer: { select: { id: true, name: true, email: true } },
      agent: { select: { id: true, name: true, email: true, role: true } },
      humanHandoff: {
        include: {
          attempts: { orderBy: { order: "asc" } },
          events: { orderBy: { createdAt: "asc" } },
        },
      },
      messages: {
        orderBy: { createdAt: "asc" },
        include: { sender: { select: { id: true, name: true, email: true, role: true } } },
      },
    },
  });
  if (!conv) throw new AppError("NOT_FOUND", "Conversation not found", 404);
  if (agentId) {
    const matches = await prisma.conversation.count({
      where: { id: conversationId, AND: [agentConversationWhere(agentId)] },
    });
    if (!matches) throw new AppError("NOT_FOUND", "Conversation not found", 404);
  }
  const closed = conv.status === "CLOSED";
  return serialize({
    id: conv.id,
    ticketId: conv.ticketId,
    customer: conv.customer,
    assignedAgent: conv.agent,
    assignedAgentId: conv.agentId || conv.humanHandoff?.currentAgentId || null,
    status: conv.status,
    displayStatus: customerHandoffStatusLabel(conv.humanHandoff?.status, closed),
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
    lastMessageAt: conv.lastMessageAt,
    humanHandoff: conv.humanHandoff
      ? {
          id: conv.humanHandoff.id,
          status: conv.humanHandoff.status,
          currentAgentId: conv.humanHandoff.currentAgentId,
          currentAttempt: conv.humanHandoff.currentAttempt,
          attempts: conv.humanHandoff.attempts.map((a) => ({
            agentId: a.agentId,
            order: a.order,
            status: a.status,
          })),
          events: conv.humanHandoff.events.map((e) => ({
            id: e.id,
            type: e.type,
            actorId: e.actorId,
            fromStatus: e.fromStatus,
            toStatus: e.toStatus,
            agentId: e.agentId,
            reason: e.reason,
            createdAt: e.createdAt,
          })),
        }
      : null,
    messages: conv.messages.map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      senderId: m.senderId,
      body: m.body,
      role: m.role,
      internal: m.internal,
      attachmentIds: m.attachmentIds,
      createdAt: m.createdAt,
      sender: m.sender,
    })),
  });
}
