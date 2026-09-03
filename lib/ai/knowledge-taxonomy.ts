export const KNOWLEDGE_CATEGORIES = [
  "Billing",
  "Technical Support",
  "Account",
  "Orders",
  "General",
] as const;

export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];

export function clampKnowledgeCategory(value: unknown): KnowledgeCategory {
  const raw = String(value || "").trim();
  const match = KNOWLEDGE_CATEGORIES.find((c) => c.toLowerCase() === raw.toLowerCase());
  return match ?? "General";
}

export function normalizeKnowledgeTags(values: unknown, extra: string[] = []): string[] {
  const list = Array.isArray(values) ? values : typeof values === "string" ? values.split(",") : [];
  const tags = [...list.map((t) => String(t).trim().toLowerCase()), ...extra.map((t) => t.trim().toLowerCase())]
    .filter(Boolean)
    .filter((t, i, all) => all.indexOf(t) === i);
  return tags.slice(0, 8);
}

const TRIVIAL_RE = /^(hi|hello|hey|thanks|thank you|thx|please call me|call me)[\s!.?]*$/i;
const MIN_SOLUTION_LEN = 24;

export function isTrivialSupportText(value: string) {
  const t = value.replace(/\s+/g, " ").trim();
  if (!t) return true;
  return TRIVIAL_RE.test(t);
}

export function ticketHasLearnableContent(opts: {
  title: string;
  description: string;
  publicStaffComments: { body: string }[];
}) {
  const title = opts.title.trim();
  const description = opts.description.trim();
  if (isTrivialSupportText(title) && isTrivialSupportText(description)) return false;
  if (`${title} ${description}`.trim().length < 12) return false;
  return opts.publicStaffComments.some((c) => {
    const body = String(c.body || "").trim();
    return body.length >= MIN_SOLUTION_LEN && !isTrivialSupportText(body);
  });
}

export function knowledgeReviewSourceLabel(metadata?: {
  sourceTicketId?: string;
  sourceConversationId?: string;
  origin?: string;
} | null) {
  if (metadata?.sourceTicketId) return `Resolved Ticket ${metadata.sourceTicketId.slice(-8)}`;
  if (metadata?.origin === "RESOLVED_CHAT" || metadata?.sourceConversationId) {
    const id = metadata.sourceConversationId ? ` ${metadata.sourceConversationId.slice(-8)}` : "";
    return `Resolved Chat${id}`;
  }
  return null;
}
