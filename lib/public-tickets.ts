import { randomBytes } from "crypto";
import { nextTicketNumber, prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { appUrl } from "@/lib/utils";
import { notifyUser } from "@/lib/notifications";
import { AppError } from "@/lib/api-response";
import { ticketCreateSchema } from "@/lib/validation";
import { z } from "zod";
import { newId } from "@/lib/id";
import type { TicketPriority } from "@prisma/client";

export const publicTicketSchema = ticketCreateSchema.extend({
  name: z.string().min(2).max(120),
  email: z.string().email(),
});

export async function createPublicTicket(input: unknown) {
  const data = publicTicketSchema.parse(input);
  let user = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
  if (!user) {
    const password = `${randomBytes(10).toString("base64url")}Aa1!`;
    try {
      await auth.api.signUpEmail({
        body: {
          name: data.name,
          email: data.email.toLowerCase(),
          password,
        },
      });
      await prisma.user.update({
        where: { email: data.email.toLowerCase() },
        data: { role: "CUSTOMER", status: "ACTIVE", name: data.name },
      });
    } catch {
      /* email may already exist from a race */
    }
    user = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
  }
  if (!user?.id) throw new AppError("USER_CREATE", "Could not resolve customer", 400);

  const customerId = user.id;
  const number = await nextTicketNumber();
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
        priority: (data.priority || "MEDIUM") as TicketPriority,
        category: data.category?.trim() || null,
        tags: data.tags ?? [],
      },
    });
    await tx.ticketHistory.create({
      data: {
        id: newId(),
        ticketId: created.id,
        actorId: customerId,
        action: "created",
        to: "OPEN",
      },
    });
    return created;
  });
  await sendEmail({
    to: data.email,
    subject: `Ticket ${number} created`,
    template: "ticket-created",
    data: { number, title: data.title, url: appUrl("/login") },
  });
  await notifyUser({
    userId: customerId,
    title: "Ticket created",
    body: `${number}: ${data.title}`,
    href: `/tickets/${ticket.id}`,
    type: "ticket.created",
  });
  return { number, id: ticket.id };
}
