"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { serialize } from "@/lib/serialize";
import type { Prisma } from "@prisma/client";

export async function globalSearchAction(q: string) {
  const user = await requireUser();
  if (!q.trim()) return { tickets: [], customers: [], articles: [], conversations: [] };
  const ticketWhere: Prisma.TicketWhereInput = {
    OR: [
      { title: { contains: q, mode: "insensitive" } },
      { number: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ],
    ...(user.role === "CUSTOMER" ? { customerId: user.id } : {}),
  };
  const [ticketDocs, customerDocs, articleDocs, convoDocs] = await Promise.all([
    prisma.ticket.findMany({ where: ticketWhere, take: 8 }),
    user.role === "CUSTOMER"
      ? Promise.resolve([])
      : prisma.user.findMany({
          where: {
            role: "CUSTOMER",
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          },
          take: 8,
        }),
    prisma.kbArticle.findMany({
      where: {
        published: true,
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { body: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 8,
    }),
    prisma.conversation.findMany({
      where: {
        AND: [
          user.role === "CUSTOMER"
            ? { customerId: user.id }
            : user.role === "AGENT"
              ? {
                  OR: [
                    { agentId: user.id },
                    { humanHandoff: { is: { currentAgentId: user.id, status: { in: ["OFFERED", "ACCEPTED"] } } } },
                  ],
                }
              : {},
          {
            OR: [
              { id: { contains: q, mode: "insensitive" } },
              { customer: { is: { name: { contains: q, mode: "insensitive" } } } },
              { customer: { is: { email: { contains: q, mode: "insensitive" } } } },
              { messages: { some: { body: { contains: q, mode: "insensitive" } } } },
            ],
          },
        ],
      },
      take: 8,
      include: {
        customer: { select: { id: true, name: true, email: true } },
        agent: { select: { id: true } },
        humanHandoff: { select: { currentAgentId: true } },
      },
    }),
  ]);
  const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  return serialize({
    tickets: ticketDocs,
    customers: customerDocs,
    articles: articleDocs,
    conversations: convoDocs.map((c) => {
      const historyAgentId = c.agentId || c.humanHandoff?.currentAgentId || null;
      return {
        id: c.id,
        customer: c.customer,
        assignedAgentId: historyAgentId,
        href:
          isAdmin && historyAgentId
            ? `/admin/agents/${historyAgentId}/conversations/${c.id}`
            : `/chat/${c.id}`,
      };
    }),
  });
}
