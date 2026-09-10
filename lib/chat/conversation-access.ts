import { AppError } from "@/lib/api-response";

export type ConversationActor = { id: string; role: string };

export type ConversationAccessShape = {
  customerId: string;
  agentId?: string | null;
  humanHandoff?: { currentAgentId: string | null; status: string } | null;
};

const ACTIVE_HANDOFF = new Set(["OFFERED", "ACCEPTED"]);

export function canAccessConversation(user: ConversationActor, conv: ConversationAccessShape) {
  if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") return true;
  if (user.role === "CUSTOMER") return conv.customerId === user.id;
  if (user.role === "AGENT") {
    if (conv.agentId === user.id) return true;
    const h = conv.humanHandoff;
    return Boolean(h && h.currentAgentId === user.id && ACTIVE_HANDOFF.has(h.status));
  }
  return false;
}

export function assertCanAccessConversation(user: ConversationActor, conv: ConversationAccessShape) {
  if (!canAccessConversation(user, conv)) {
    throw new AppError("FORBIDDEN", "Not your conversation", 403);
  }
}
