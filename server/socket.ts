import { Server as IOServer, type Socket } from "socket.io";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { setIO } from "@/lib/socket-server";
import { canAccessConversation } from "@/lib/chat/conversation-access";
import type { Role } from "@/types";

export function attachSocket(io: IOServer) {
  setIO(io);
  io.use(async (socket, next) => {
    try {
      const widgetToken = String(socket.handshake.auth?.widgetToken || "");
      if (widgetToken) {
        const { verifyWidgetToken } = await import("@/lib/ai/widget-guest");
        const claims = verifyWidgetToken(widgetToken);
        if (!claims) return next(new Error("UNAUTHENTICATED"));
        socket.data.user = { id: claims.userId, role: "CUSTOMER" as Role };
        socket.data.widgetConversationId = claims.conversationId;
        return next();
      }
      const cookie = socket.handshake.headers.cookie || "";
      const session = await auth.api.getSession({
        headers: new Headers({ cookie }),
      });
      if (!session?.user) {
        return next(new Error("UNAUTHENTICATED"));
      }
      socket.data.user = {
        id: session.user.id,
        role: ((session.user as { role?: Role }).role || "CUSTOMER") as Role,
      };
      next();
    } catch (error) {
      next(error as Error);
    }
  });

  io.on("connection", (socket) => {
    const user = socket.data.user as { id: string; role: Role };
    const widgetConversationId = socket.data.widgetConversationId as string | undefined;
    socket.join(`user:${user.id}`);
    io.emit("agent:status", { userId: user.id, online: true });

    socket.on("join", async (payload: { conversationId?: string; ticketId?: string }) => {
      try {
        if (payload.conversationId) {
          if (await canJoinConversation(user, payload.conversationId, widgetConversationId)) {
            socket.join(`conversation:${payload.conversationId}`);
          }
        }
        if (payload.ticketId && !widgetConversationId) {
          if (await canJoinTicket(user, payload.ticketId)) {
            socket.join(`ticket:${payload.ticketId}`);
          }
        }
      } catch (error) {
        socket.emit("error", { message: "Join failed" });
        console.error(error);
      }
    });

    socket.on("leave", async (payload: { conversationId?: string; ticketId?: string }) => {
      if (payload.conversationId) socket.leave(`conversation:${payload.conversationId}`);
      if (payload.ticketId) socket.leave(`ticket:${payload.ticketId}`);
    });

    socket.on("typing:start", (payload: { conversationId: string }) => {
      socket.to(`conversation:${payload.conversationId}`).emit("typing:start", {
        userId: user.id,
        conversationId: payload.conversationId,
      });
    });
    socket.on("typing:stop", (payload: { conversationId: string }) => {
      socket.to(`conversation:${payload.conversationId}`).emit("typing:stop", {
        userId: user.id,
        conversationId: payload.conversationId,
      });
    });

    socket.on("message:read", async (payload: { conversationId: string }) => {
      if (!(await canJoinConversation(user, payload.conversationId, widgetConversationId))) return;
      const messages = await prisma.message.findMany({ where: { conversationId: payload.conversationId } });
      await Promise.all(
        messages.map((m) =>
          m.readBy.includes(user.id)
            ? Promise.resolve()
            : prisma.message.update({
                where: { id: m.id },
                data: { readBy: { push: user.id } },
              }),
        ),
      );
      io.to(`conversation:${payload.conversationId}`).emit("message:read", {
        conversationId: payload.conversationId,
        userId: user.id,
      });
    });

    socket.on("disconnect", () => {
      io.emit("agent:status", { userId: user.id, online: false });
    });
  });
}

async function canJoinConversation(
  user: { id: string; role: Role },
  id: string,
  widgetConversationId?: string,
) {
  if (widgetConversationId && widgetConversationId !== id) return false;
  const conv = await prisma.conversation.findUnique({
    where: { id },
    include: { humanHandoff: true },
  });
  if (!conv) return false;
  return canAccessConversation(user, conv);
}

async function canJoinTicket(user: { id: string; role: Role }, id: string) {
  const ticket = await prisma.ticket.findUnique({ where: { id } });
  if (!ticket) return false;
  if (["ADMIN", "SUPER_ADMIN", "AGENT"].includes(user.role)) return true;
  return ticket.customerId === user.id;
}

export function bindSocketErrors(socket: Socket) {
  socket.on("error", (err) => console.error("socket error", err));
}
