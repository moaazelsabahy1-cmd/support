"use server";

import { nextTicketNumber, prisma } from "@/lib/db";
import { AppError } from "@/lib/api-response";
import { sendEmail } from "@/lib/email";
import { notifyUser } from "@/lib/notifications";
import { ticketCreateSchema, ticketUpdateSchema } from "@/lib/validation";
import { requirePermission, requireUser } from "@/lib/session";
import { serialize } from "@/lib/serialize";
import { emitToTicket } from "@/lib/socket-server";
import { appUrl } from "@/lib/utils";
import { extractTicketKnowledge } from "@/lib/ai/learn";
import { newId } from "@/lib/id";
import type { Prisma, TicketPriority, TicketStatus } from "@prisma/client";

async function recordHistory(
  ticketId: string,
  actorId: string,
  action: string,
  from?: string | null,
  to?: string | null,
  meta?: Record<string, unknown>,
) {
  await prisma.ticketHistory.create({
    data: {
      id: newId(),
      ticketId,
      actorId,
      action,
      from: from ?? null,
      to: to ?? null,
      meta: (meta ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

export async function createTicketAction(input: unknown) {
  const user = await requirePermission("ticket.create");
  const data = ticketCreateSchema.parse(input);
  const number = await nextTicketNumber();
  const customerId = user.role === "CUSTOMER" ? user.id : (input as { customerId?: string }).customerId || user.id;
  const ticket = await prisma.$transaction(async (tx) => {
    const created = await tx.ticket.create({
      data: {
        id: newId(),
        number,
        title: data.title,
        description: data.description,
        customerId,
        assignedAgentId: null,
        departmentId: data.departmentId || null,
        status: "OPEN",
        priority: data.priority as TicketPriority,
        category: data.category ?? null,
        tags: data.tags ?? [],
      },
    });
    await tx.ticketHistory.create({
      data: {
        id: newId(),
        ticketId: created.id,
        actorId: user.id,
        action: "created",
        to: "OPEN",
      },
    });
    return created;
  });
  const customer = await prisma.user.findUnique({ where: { id: customerId } });
  if (customer?.email) {
    await sendEmail({
      to: customer.email,
      subject: `Ticket ${number} created`,
      template: "ticket-created",
      data: { number, title: data.title, url: appUrl(`/tickets/${ticket.id}`) },
    });
  }
  await notifyUser({
    userId: customerId,
    title: "Ticket created",
    body: `${number}: ${data.title}`,
    href: `/tickets/${ticket.id}`,
    type: "ticket.created",
  });
  return serialize(ticket);
}

export async function listTicketsAction(filters: {
  page?: number;
  pageSize?: number;
  q?: string;
  status?: string;
  priority?: string;
  departmentId?: string;
  assigned?: "me" | "unassigned" | "all";
  scope?: "mine" | "all";
}) {
  const user = await requirePermission("ticket.view");
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;
  const where: Prisma.TicketWhereInput = {};
  if (user.role === "CUSTOMER" || filters.scope === "mine") {
    where.customerId = user.id;
  }
  if (filters.status) where.status = filters.status as TicketStatus;
  if (filters.priority) where.priority = filters.priority as TicketPriority;
  if (filters.departmentId) where.departmentId = filters.departmentId;
  if (filters.assigned === "me") where.assignedAgentId = user.id;
  if (filters.assigned === "unassigned") where.assignedAgentId = null;
  if (filters.q) {
    where.OR = [
      { title: { contains: filters.q, mode: "insensitive" } },
      { number: { contains: filters.q, mode: "insensitive" } },
      { description: { contains: filters.q, mode: "insensitive" } },
    ];
  }
  const [total, items] = await Promise.all([
    prisma.ticket.count({ where }),
    prisma.ticket.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return serialize({ items, total, page, pageSize });
}

export async function getTicketAction(id: string) {
  const user = await requirePermission("ticket.view");
  const ticket = await prisma.ticket.findUnique({ where: { id } });
  if (!ticket) throw new AppError("NOT_FOUND", "Ticket not found", 404);
  if (user.role === "CUSTOMER" && ticket.customerId !== user.id) {
    throw new AppError("FORBIDDEN", "Not your ticket", 403);
  }
  const commentWhere: Prisma.CommentWhereInput = { ticketId: ticket.id };
  if (user.role === "CUSTOMER") commentWhere.internal = false;
  const [commentDocs, history, files, customer, agent, department] = await Promise.all([
    prisma.comment.findMany({ where: commentWhere, orderBy: { createdAt: "asc" } }),
    prisma.ticketHistory.findMany({ where: { ticketId: ticket.id }, orderBy: { createdAt: "asc" } }),
    prisma.attachment.findMany({ where: { ticketId: ticket.id } }),
    prisma.user.findUnique({ where: { id: ticket.customerId } }),
    ticket.assignedAgentId ? prisma.user.findUnique({ where: { id: ticket.assignedAgentId } }) : null,
    ticket.departmentId ? prisma.department.findUnique({ where: { id: ticket.departmentId } }) : null,
  ]);
  return serialize({
    ticket,
    comments: commentDocs,
    history,
    attachments: files,
    customer,
    agent,
    department,
  });
}

export async function updateTicketAction(id: string, input: unknown) {
  const user = await requirePermission("ticket.update");
  const data = ticketUpdateSchema.parse(input);
  const ticket = await prisma.ticket.findUnique({ where: { id } });
  if (!ticket) throw new AppError("NOT_FOUND", "Ticket not found", 404);
  if (user.role === "CUSTOMER" && ticket.customerId !== user.id) {
    throw new AppError("FORBIDDEN", "Not your ticket", 403);
  }
  if (user.role === "CUSTOMER") {
    delete data.assignedAgentId;
    delete data.status;
    delete data.saveAsKnowledge;
  }
  const set: Prisma.TicketUpdateInput = {};
  if (data.title) set.title = data.title;
  if (data.description) set.description = data.description;
  if (data.priority && data.priority !== ticket.priority) {
    await recordHistory(ticket.id, user.id, "priority", ticket.priority, data.priority);
    set.priority = data.priority as TicketPriority;
  }
  if (data.status && data.status !== ticket.status) {
    await recordHistory(ticket.id, user.id, "status", ticket.status, data.status);
    set.status = data.status as TicketStatus;
    if (data.status === "RESOLVED") set.resolvedAt = new Date();
    if (data.status === "CLOSED") set.closedAt = new Date();
  }
  if (data.assignedAgentId !== undefined) {
    const to = data.assignedAgentId;
    await recordHistory(ticket.id, user.id, "assign", ticket.assignedAgentId ?? null, to);
    set.agent = to ? { connect: { id: to } } : { disconnect: true };
    if (to) {
      const agent = await prisma.user.findUnique({ where: { id: to } });
      if (agent?.email) {
        await sendEmail({
          to: agent.email,
          subject: `Assigned ${ticket.number}`,
          template: "ticket-assigned",
          data: { number: ticket.number, url: appUrl(`/tickets/${ticket.id}`) },
        });
      }
      await notifyUser({
        userId: to,
        title: "Ticket assigned",
        body: `${ticket.number} was assigned to you`,
        href: `/tickets/${ticket.id}`,
        type: "ticket.assigned",
      });
    }
  }
  if (data.departmentId !== undefined) {
    await recordHistory(ticket.id, user.id, "department", ticket.departmentId ?? null, data.departmentId);
    set.department = data.departmentId ? { connect: { id: data.departmentId } } : { disconnect: true };
  }
  if (data.tags) set.tags = data.tags;
  if (data.category !== undefined) set.category = data.category;
  if (data.csat) set.csat = data.csat;
  const updated = await prisma.ticket.update({ where: { id: ticket.id }, data: set });
  emitToTicket(id, "ticket:updated", serialize(updated));
  let knowledgeSaved = false;
  let knowledgeId: string | null = null;
  if (data.status === "RESOLVED" || data.status === "CLOSED") {
    const linked = await prisma.conversation.findMany({ where: { ticketId: ticket.id }, select: { id: true, status: true } });
    for (const c of linked) {
      if (c.status !== "CLOSED") {
        await prisma.conversation.update({
          where: { id: c.id },
          data: { status: "CLOSED", aiPaused: false },
        });
      }
    }
    if (data.saveAsKnowledge) {
      const source = await extractTicketKnowledge(ticket.id, { createdBy: user.id });
      knowledgeSaved = Boolean(source);
      knowledgeId = source?.id ?? null;
    }
  }
  if (data.status === "RESOLVED") {
    await notifyUser({
      userId: ticket.customerId,
      title: "Ticket resolved",
      body: `${ticket.number} was resolved`,
      href: `/tickets/${ticket.id}`,
      type: "ticket.resolved",
    });
    const customer = await prisma.user.findUnique({ where: { id: ticket.customerId } });
    if (customer?.email) {
      await sendEmail({
        to: customer.email,
        subject: `${ticket.number} resolved`,
        template: "ticket-resolved",
        data: { number: ticket.number, url: appUrl(`/tickets/${ticket.id}`) },
      });
    }
  }
  return { ...serialize(updated), knowledgeSaved, knowledgeId };
}

export async function addCommentAction(ticketId: string, input: unknown) {
  const user = await requireUser();
  const data = (await import("@/lib/validation")).commentSchema.parse(input);
  if (data.internal && user.role === "CUSTOMER") {
    throw new AppError("FORBIDDEN", "Customers cannot add internal notes", 403);
  }
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new AppError("NOT_FOUND", "Ticket not found", 404);
  if (user.role === "CUSTOMER" && ticket.customerId !== user.id) {
    throw new AppError("FORBIDDEN", "Not your ticket", 403);
  }
  const now = new Date();
  const comment = await prisma.comment.create({
    data: {
      id: newId(),
      ticketId: ticket.id,
      authorId: user.id,
      body: data.body,
      internal: data.internal,
    },
  });
  await recordHistory(ticket.id, user.id, data.internal ? "internal_note" : "comment");
  await prisma.ticket.update({
    where: { id: ticket.id },
    data: {
      updatedAt: now,
      ...(!ticket.firstResponseAt && user.role !== "CUSTOMER" ? { firstResponseAt: now } : {}),
    },
  });
  const recipient = user.role === "CUSTOMER" ? ticket.assignedAgentId : ticket.customerId;
  if (recipient) {
    await notifyUser({
      userId: recipient,
      title: data.internal ? "Internal note" : "New reply",
      body: `${ticket.number}: ${data.body.slice(0, 80)}`,
      href: `/tickets/${ticket.id}`,
      type: "ticket.reply",
    });
    if (!data.internal) {
      const rec = await prisma.user.findUnique({ where: { id: recipient } });
      if (rec?.email) {
        await sendEmail({
          to: rec.email,
          subject: `Reply on ${ticket.number}`,
          template: "ticket-reply",
          data: {
            number: ticket.number,
            author: user.name,
            url: appUrl(`/tickets/${ticket.id}`),
          },
        });
      }
    }
  }
  emitToTicket(ticketId, "ticket:updated", { commentId: comment.id });
  return serialize({ ...data, authorId: user.id, createdAt: now, id: comment.id });
}

export async function dashboardStatsAction() {
  const user = await requireUser();
  const mine = user.role === "CUSTOMER" ? { customerId: user.id } : {};
  const [open, pending, resolved, recentConvos, upcoming, unread, recentTickets] = await Promise.all([
    prisma.ticket.count({ where: { ...mine, status: "OPEN" } }),
    prisma.ticket.count({
      where: { ...mine, status: { in: ["IN_PROGRESS", "WAITING_CUSTOMER", "WAITING_AGENT"] } },
    }),
    prisma.ticket.count({ where: { ...mine, status: { in: ["RESOLVED", "CLOSED"] } } }),
    prisma.conversation.findMany({
      where: user.role === "CUSTOMER" ? { customerId: user.id } : {},
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
    prisma.meeting.findMany({
      where: {
        ...(user.role === "CUSTOMER" ? { customerId: user.id } : {}),
        status: { in: ["REQUESTED", "CONFIRMED"] },
        date: { gte: new Date(Date.now() - 86400000) },
      },
      orderBy: { date: "asc" },
      take: 5,
    }),
    prisma.notification.count({ where: { userId: user.id, read: false } }),
    prisma.ticket.findMany({ where: mine, orderBy: { createdAt: "desc" }, take: 8 }),
  ]);
  return serialize({ open, pending, resolved, recentConvos, upcoming, unread, recentTickets });
}
