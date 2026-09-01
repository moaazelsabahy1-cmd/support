export type ChatRoleLabel = "You" | "Handoff" | "Assistant" | "Customer" | "Agent";

export function chatMessageLabel(opts: {
  role?: string | null;
  senderId: string;
  viewerId: string;
  customerId?: string | null;
}): ChatRoleLabel {
  if (opts.senderId === opts.viewerId) return "You";
  if (opts.role === "SYSTEM") return "Handoff";
  if (opts.role === "AI") return "Assistant";
  if (opts.role === "CUSTOMER" || (opts.customerId && opts.senderId === opts.customerId)) return "Customer";
  if (opts.role === "HUMAN") return "Agent";
  return "Customer";
}

export function shouldAppendChatMessage(
  messages: { _id: string }[],
  msg: { _id?: string; id?: string; conversationId?: string },
  activeConversationId: string,
) {
  const id = msg._id || msg.id;
  if (!id) return false;
  if (msg.conversationId !== activeConversationId) return false;
  return !messages.some((m) => m._id === id);
}
