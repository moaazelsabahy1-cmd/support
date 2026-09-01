"use server";

import { prisma } from "@/lib/db";
import { newId } from "@/lib/id";

export async function recordTicketAttachmentHistory(
  ticketId: string,
  actorId: string,
  action: string,
  filename: string,
) {
  await prisma.ticketHistory.create({
    data: {
      id: newId(),
      ticketId,
      actorId,
      action,
      meta: { filename },
    },
  });
}
