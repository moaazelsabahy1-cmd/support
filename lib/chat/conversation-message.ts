import { prisma } from "@/lib/db";
import { serialize } from "@/lib/serialize";
import { emitToConversation } from "@/lib/socket-server";
import { notifyUser } from "@/lib/notifications";
import { AppError } from "@/lib/api-response";
import { newId } from "@/lib/id";
import { assertCanAccessConversation, type ConversationActor } from "@/lib/chat/conversation-access";

export async function sendConversationMessage(opts: {
  user: ConversationActor;
  conversationId: string;
  body: string;
  attachmentIds?: string[];
}) {
  if (!opts.body.trim() && !(opts.attachmentIds || []).length) {
    throw new AppError("BAD_REQUEST", "Message cannot be empty", 400);
  }
  const conv = await prisma.conversation.findUnique({
    where: { id: opts.conversationId },
    include: { humanHandoff: true },
  });
  if (!conv) throw new AppError("NOT_FOUND", "Conversation not found", 404);
  assertCanAccessConversation(opts.user, conv);

  const handoffStatus = conv.humanHandoff?.status;
  if (conv.status === "CLOSED" || handoffStatus === "COMPLETED" || handoffStatus === "NO_AGENT_AVAILABLE") {
    throw new AppError("FORBIDDEN", "This conversation is closed.", 403);
  }

  const role = opts.user.role === "CUSTOMER" ? "CUSTOMER" : "HUMAN";
  if (role === "HUMAN") {
    const offered = handoffStatus === "OFFERED";
    const accepted = handoffStatus === "ACCEPTED";
    if (offered || (accepted && conv.agentId && conv.agentId !== opts.user.id)) {
      throw new AppError("FORBIDDEN", "Accept the handoff before messaging this customer.", 403);
    }
  }

  const now = new Date();
  const message = await prisma.message.create({
    data: {
      id: newId(),
      conversationId: conv.id,
      senderId: opts.user.id,
      body: opts.body,
      attachmentIds: opts.attachmentIds || [],
      readBy: [opts.user.id],
      role,
    },
  });
  await prisma.conversation.update({
    where: { id: conv.id },
    data: {
      updatedAt: now,
      lastMessageAt: now,
      agentId:
        conv.humanHandoff?.status === "ACCEPTED"
          ? conv.agentId
          : opts.user.role === "AGENT" || opts.user.role === "ADMIN" || opts.user.role === "SUPER_ADMIN"
            ? opts.user.id
            : conv.agentId,
    },
  });
  const payload = serialize(message);
  emitToConversation(opts.conversationId, "message:new", payload);
  const other =
    opts.user.role === "CUSTOMER"
      ? conv.agentId || conv.humanHandoff?.currentAgentId
      : conv.customerId;
  if (other) {
    await notifyUser({
      userId: other,
      title: "New message",
      body: opts.body.slice(0, 100) || "Attachment",
      href: `/chat/${opts.conversationId}`,
      type: "message.new",
    });
  }
  return payload;
}
