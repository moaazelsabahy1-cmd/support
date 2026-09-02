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
