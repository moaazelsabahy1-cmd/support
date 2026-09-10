export function handoffStartAttempt(h?: {
  currentAttempt?: number | null;
  attempts?: { order?: number; status?: string }[] | null;
} | null) {
  const orders = (h?.attempts || []).map((a) => a.order || 0).filter(Boolean);
  if (orders.length) return Math.min(...orders);
  return h?.currentAttempt || 1;
}

export function humanSupportPhase(status?: string | null, conversationClosed?: boolean) {
  if (conversationClosed || status === "COMPLETED") return "closed" as const;
  if (status === "NO_AGENT_AVAILABLE") return "unavailable" as const;
  if (status === "ACCEPTED") return "connected" as const;
  return "pending" as const;
}

export function humanSupportStatusLine(status?: string | null, conversationClosed?: boolean) {
  const phase = humanSupportPhase(status, conversationClosed);
  if (phase === "closed") return "Conversation closed";
  if (phase === "unavailable") return "No agent available";
  if (phase === "connected") return "Connected";
  return "Request Pending";
}

export function customerHandoffStatusLabel(status?: string | null, conversationClosed?: boolean) {
  if (conversationClosed || status === "COMPLETED") return "CLOSED";
  if (status === "ACCEPTED") return "ACTIVE";
  if (status === "NO_AGENT_AVAILABLE") return "CLOSED";
  if (status === "OFFERED" || status === "PENDING") return "PENDING";
  return status || "PENDING";
}

export function handoffStatusCopy(h?: {
  status?: string | null;
  currentAttempt?: number | null;
  attempts?: { order?: number; status?: string }[] | null;
} | null) {
  if (h?.status === "ACCEPTED") {
    return `Agent ${h.currentAttempt || 1} has joined the conversation.`;
  }
  if (h?.status === "NO_AGENT_AVAILABLE") {
    return "All human agents are currently unavailable.";
  }
  const n = h?.currentAttempt || 1;
  const start = handoffStartAttempt(h);
  return `You requested help from Agent ${start}. Request sent to Agent ${n}. Waiting for Agent ${n}...`;
}
