"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { serialize } from "@/lib/serialize";
import { unreadCount } from "@/lib/notifications";

export async function listNotificationsAction() {
  const user = await requireUser();
  const items = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const unread = await unreadCount(user.id);
  return serialize({ items, unread });
}

export async function markNotificationsReadAction(ids?: string[]) {
  const user = await requireUser();
  await prisma.notification.updateMany({
    where: {
      userId: user.id,
      ...(ids?.length ? { id: { in: ids } } : {}),
    },
    data: { read: true },
  });
  return { ok: true };
}
