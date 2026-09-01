"use server";

import { prisma } from "@/lib/db";
import { requirePermission, requireUser } from "@/lib/session";
import { meetingSchema, meetingUpdateSchema } from "@/lib/validation";
import { serialize } from "@/lib/serialize";
import { notifyUser } from "@/lib/notifications";
import { sendEmail } from "@/lib/email";
import { appUrl, formatDate } from "@/lib/utils";
import { AppError } from "@/lib/api-response";
import { newId } from "@/lib/id";
import type { Prisma } from "@prisma/client";

export async function listMeetingsAction() {
  const user = await requireUser();
  const where: Prisma.MeetingWhereInput =
    user.role === "CUSTOMER"
      ? { customerId: user.id }
      : user.role === "AGENT"
        ? { OR: [{ agentId: user.id }, { agentId: null }] }
        : {};
  return serialize(await prisma.meeting.findMany({ where, orderBy: { date: "asc" } }));
}

export async function createMeetingAction(input: unknown) {
  const user = await requireUser();
  const data = meetingSchema.parse(input);
  const meeting = await prisma.meeting.create({
    data: {
      id: newId(),
      customerId: user.id,
      agentId: data.agentId || null,
      title: data.title,
      description: data.description,
      date: new Date(data.date),
      startTime: data.startTime,
      endTime: data.endTime,
      status: "REQUESTED",
    },
  });
  if (meeting.agentId) {
    await notifyUser({
      userId: meeting.agentId,
      title: "Meeting requested",
      body: data.title,
      href: "/meetings",
      type: "meeting.requested",
    });
  }
  return serialize(meeting);
}

export async function updateMeetingAction(id: string, input: unknown) {
  const user = await requirePermission("meeting.manage");
  const data = meetingUpdateSchema.parse(input);
  const meeting = await prisma.meeting.findUnique({ where: { id } });
  if (!meeting) throw new AppError("NOT_FOUND", "Meeting not found", 404);
  await prisma.meeting.update({
    where: { id: meeting.id },
    data: {
      ...data,
      ...(data.date ? { date: new Date(data.date) } : {}),
      ...(data.agentId ? { agentId: data.agentId } : {}),
    },
  });
  const customer = await prisma.user.findUnique({ where: { id: meeting.customerId } });
  if (data.status === "CONFIRMED" && customer?.email) {
    await sendEmail({
      to: customer.email,
      subject: "Meeting confirmed",
      template: "meeting-confirmed",
      data: {
        title: meeting.title,
        when: formatDate(meeting.date),
        url: appUrl("/meetings"),
      },
    });
    await notifyUser({
      userId: meeting.customerId,
      title: "Meeting confirmed",
      body: meeting.title,
      href: "/meetings",
      type: "meeting.confirmed",
    });
  }
  if (data.status === "CANCELLED" && customer?.email) {
    await sendEmail({
      to: customer.email,
      subject: "Meeting cancelled",
      template: "meeting-cancelled",
      data: { title: meeting.title },
    });
    await notifyUser({
      userId: meeting.customerId,
      title: "Meeting cancelled",
      body: meeting.title,
      href: "/meetings",
      type: "meeting.cancelled",
    });
  }
  return { ok: true, actor: user.id };
}

export async function cancelOwnMeetingAction(id: string) {
  const user = await requireUser();
  const meeting = await prisma.meeting.findUnique({ where: { id } });
  if (!meeting) throw new AppError("NOT_FOUND", "Meeting not found", 404);
  if (meeting.customerId !== user.id && !["ADMIN", "SUPER_ADMIN", "AGENT"].includes(user.role)) {
    throw new AppError("FORBIDDEN", "Not your meeting", 403);
  }
  await prisma.meeting.update({ where: { id: meeting.id }, data: { status: "CANCELLED" } });
  return { ok: true };
}
