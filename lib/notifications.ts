import { prisma } from "@/lib/db";
import { emitToUser } from "@/lib/socket-server";
import { sendPushToUser } from "@/lib/push";
import { newId } from "@/lib/id";

export async function notifyUser(opts: {
  userId: string;
  title: string;
  body: string;
  href?: string;
  type: string;
}) {
  const userId = opts.userId;
  const doc = await prisma.notification.create({
    data: {
      id: newId(),
      userId,
      title: opts.title,
      body: opts.body,
      href: opts.href,
      type: opts.type,
      read: false,
    },
  });
  const payload = { ...doc, _id: doc.id, userId };
  emitToUser(userId, "notification:new", payload);
  await sendPushToUser(userId, { title: opts.title, body: opts.body, href: opts.href });
  return payload;
}

export async function notifyAgents(opts: {
  title: string;
  body: string;
  href?: string;
  type: string;
  excludeUserId?: string;
}) {
  const agents = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      role: { in: ["AGENT", "ADMIN", "SUPER_ADMIN"] },
      ...(opts.excludeUserId ? { id: { not: opts.excludeUserId } } : {}),
      email: { not: "ai@solvio.local" },
    },
    select: { id: true },
  });
  await Promise.all(
    agents.map((agent) =>
      notifyUser({
        userId: agent.id,
        title: opts.title,
        body: opts.body,
        href: opts.href,
        type: opts.type,
      }),
    ),
  );
}

export async function unreadCount(userId: string) {
  return prisma.notification.count({ where: { userId, read: false } });
}
