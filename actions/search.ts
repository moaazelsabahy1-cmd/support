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
      where: user.role === "CUSTOMER" ? { customerId: user.id } : {},
      take: 8,
    }),
  ]);
  return serialize({
    tickets: ticketDocs,
    customers: customerDocs,
    articles: articleDocs,
    conversations: convoDocs,
  });
}
