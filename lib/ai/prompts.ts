const ESCALATE_PHRASES = [
  "talk to a human",
  "talk to an agent",
  "talk to support",
  "talk to human",
  "i need an agent",
  "speak to a human",
  "speak to an agent",
  "speak to support",
  "connect me to an agent",
  "connect me to a real person",
  "i need a real person",
  "real person",
  "i want a human",
  "i want to talk to a human",
  "human agent",
  "human please",
];

const ESCALATE_ARABIC = [
  "عايز أكلم موظف",
  "عايز اكلم موظف",
  "عايز أتكلم مع حد",
  "عايز اتكلم مع حد",
  "ممكن موظف يساعدني",
  "عايز إنسان",
  "عايز انسان",
  "ممكن أكلم خدمة العملاء",
  "عايز حد يساعدني",
  "كلم موظف",
  "تحدث مع موظف",
];

export function detectIntent(message: string) {
  const t = message.toLowerCase();
  const compact = message.replace(/\s+/g, " ").trim();
  if (
    ESCALATE_PHRASES.some((p) => t.includes(p)) ||
    ESCALATE_ARABIC.some((p) => compact.includes(p)) ||
    /\bescalate(\s+this)?\b/.test(t)
  ) {
    return "escalate";
  }
  if (/(billing|invoice|refund|charge)/.test(t)) return "billing";
  if (/(meeting|call|schedule)/.test(t)) return "meeting";
  if (/(ticket|bug|issue|broken)/.test(t)) return "ticket";
  return "question";
}

export type GroundedPromptOptions = {
  assistantName?: string;
  language?: string;
};

export function groundedPrompt(
  question: string,
  chunks: { title: string; text: string; sourceType?: string }[],
  history: { role: "user" | "assistant"; content: string }[] = [],
  options?: GroundedPromptOptions,
) {
  const context = chunks
    .map((c, i) => `[${i + 1}] ${c.title}\n${c.text}`)
    .join("\n\n")
    .slice(0, 12000);
  const name = (options?.assistantName || "Solvio").trim() || "Solvio";
  const language = (options?.language || "").trim();
  const languageLine = language ? `\nRespond in ${language}. Prefer the customer's dialect (including Egyptian Arabic when they used it).` : "";
  return [
    {
      role: "system" as const,
      content: `You are ${name}, a customer support assistant.

Use the retrieved knowledge as the source of truth.
Answer as general support knowledge. Do not claim you remember this customer, another customer, or a previous private conversation.
Never expose customer identities, emails, phone numbers, or private conversation details.
Do not invent company policies, prices, or procedures.
If the knowledge does not contain the answer, say so clearly and offer to talk to a human agent.
Do not claim a source says something it does not say.
Keep answers concise and useful.
When citing, refer to verified support knowledge. Do not mention conversation IDs or private chat provenance.${languageLine}

Retrieved knowledge:
${context || "(no knowledge retrieved)"}`,
    },
    ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user" as const, content: question },
  ];
}

export function generalKnowledgePrompt(
  question: string,
  history: { role: "user" | "assistant"; content: string }[] = [],
  options?: GroundedPromptOptions,
) {
  const name = (options?.assistantName || "Solvio").trim() || "Solvio";
  const language = (options?.language || "").trim();
  const languageLine = language
    ? `\nRespond in ${language}. Prefer the customer's dialect (including Egyptian Arabic when they used it).`
    : "";
  return [
    {
      role: "system" as const,
      content: `You are ${name}, a customer support assistant answering a general knowledge question.

This is NOT verified Solvio company knowledge. You may answer general topics (for example what a VPN is, HTTP vs HTTPS).
Never invent Solvio-specific policies, pricing, internal procedures, account data, order data, ticket status, refund decisions, or private company facts.
If the customer is asking about Solvio the company, say you do not have verified information and offer human support.
Keep answers concise.${languageLine}`,
    },
    ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user" as const, content: question },
  ];
}

export function publicSourceLabel(hit: { title: string; sourceType: string; url?: string }) {
  const type = String(hit.sourceType).toUpperCase();
  if (type === "QA" || type === "TRAINING" || type === "CONVERSATION") {
    return { title: "Verified support knowledge", type: "QA" as const };
  }
  if (type === "WEB") {
    return { title: hit.title, type: "WEB" as const, url: hit.url };
  }
  return { title: hit.title, type: "FILE" as const };
}
