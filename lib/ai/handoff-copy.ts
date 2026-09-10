export function handoffStartAttempt(h?: {
  currentAttempt?: number | null;
  attempts?: { order?: number; status?: string }[] | null;
} | null) {
  const orders = (h?.attempts || []).map((a) => a.order || 0).filter(Boolean);
  if (orders.length) return Math.min(...orders);
  return h?.currentAttempt || 1;
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
    return "No support agent is currently available.";
  }
  const n = h?.currentAttempt || 1;
  const start = handoffStartAttempt(h);
  const requested = `You requested help from Agent ${start}.`;
  if (n > start) {
    return `${requested} Agent ${n - 1} is unavailable. Sending your request to Agent ${n}...`;
  }
  return `${requested} Request sent to Agent ${n}. Waiting for Agent ${n}...`;
}
