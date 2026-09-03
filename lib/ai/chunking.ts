import { getEnv } from "@/lib/env";

export type ChunkPiece = { text: string; order: number; embedText?: string };

const MIN_CHUNK = 40;

function splitSentences(text: string) {
  return text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
}

function splitParagraphs(text: string) {
  return text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
}

function splitHeadings(text: string) {
  const parts = text.split(/(?=^#{1,6}\s+.+$)/m).map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts : [text];
}

function pack(pieces: string[], size: number, overlap: number): string[] {
  const chunks: string[] = [];
  let buf = "";
  for (const piece of pieces) {
    if (piece.length > size) {
      if (buf) {
        chunks.push(buf.trim());
        buf = "";
      }
      if (/[.!?]/.test(piece)) {
        chunks.push(...pack(splitSentences(piece), size, overlap));
      } else {
        for (let i = 0; i < piece.length; i += size - overlap) {
          chunks.push(piece.slice(i, i + size).trim());
        }
      }
      continue;
    }
    if (!buf) {
      buf = piece;
      continue;
    }
    if (`${buf}\n\n${piece}`.length <= size) {
      buf = `${buf}\n\n${piece}`;
    } else {
      chunks.push(buf.trim());
      const tail = buf.slice(Math.max(0, buf.length - overlap)).trim();
      buf = tail ? `${tail}\n\n${piece}` : piece;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks.filter((c) => c.replace(/\s+/g, " ").trim().length >= MIN_CHUNK);
}

export function chunkDocument(text: string, size?: number, overlap?: number): ChunkPiece[] {
  const env = getEnv();
  const chunkSize = size ?? env.KNOWLEDGE_CHUNK_SIZE;
  let chunkOverlap = overlap ?? env.KNOWLEDGE_CHUNK_OVERLAP;
  if (chunkOverlap >= chunkSize) chunkOverlap = Math.max(0, Math.floor(chunkSize / 8));
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];
  const byHeading = splitHeadings(clean);
  const paragraphs = byHeading.flatMap(splitParagraphs);
  const packed = pack(paragraphs, chunkSize, chunkOverlap);
  return packed.map((t, order) => ({ text: t, order }));
}

const MAX_INTENT_ALIASES = 4;

const LEAD_SWAPS: [RegExp, string][] = [
  [/^how do i\b/i, "Where can I"],
  [/^how do i\b/i, "How can I"],
  [/^how do i\b/i, "Where do I"],
  [/^how to\b/i, "Where can I"],
  [/^where can i\b/i, "How do I"],
];

const VERB_SWAPS: [RegExp, string][] = [
  [/\bcreate\b/gi, "submit"],
  [/\bcreate\b/gi, "open"],
  [/\bsubmit\b/gi, "create"],
  [/\bopen\b/gi, "create"],
];

const NOUN_SWAPS: [RegExp, string][] = [
  [/\ba new ticket\b/gi, "a new support request"],
  [/\ba support ticket\b/gi, "a new support request"],
  [/\ba ticket\b/gi, "a new support request"],
  [/\ba ticket\b/gi, "a support ticket"],
  [/\ba ticket\b/gi, "a new ticket"],
  [/\bticket\b/gi, "support request"],
];

const CONTACT_SEED =
  /\b(connect with|talk to|speak with|reach|contact)\b.+\b(agent|human|support|representative|customer service)\b/i;
const CONTACT_NOUN = /\b(an agent|a human|a support representative|customer service)\b/i;

function isContactQuestion(seed: string) {
  if (/\bticket\b/i.test(seed)) return false;
  return CONTACT_SEED.test(seed) || (CONTACT_NOUN.test(seed) && !/\bcreate|submit|open\b/i.test(seed));
}

const CONTACT_ALIASES = [
  "How do I talk to a human?",
  "I need to contact an agent",
  "How can I reach support?",
  "Where can I talk to customer service?",
  "How can I contact support?",
  "I want to speak with an agent",
  "How do I reach customer service?",
];

export function qaIntentAliases(question: string, title = ""): string[] {
  const seeds = [question, title].map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
  const seen = new Set(seeds.map((s) => s.toLowerCase()));
  const out: string[] = [];

  function add(value: string) {
    if (out.length >= MAX_INTENT_ALIASES) return;
    const text = value.replace(/\s+/g, " ").trim().replace(/\?+$/, "?");
    if (text.length < 10) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(text);
  }

  for (const seed of seeds) {
    if (isContactQuestion(seed)) {
      for (const alias of CONTACT_ALIASES) add(alias);
      add(seed.replace(/^how can i\b/i, "How do I"));
      add(seed.replace(/\bconnect with an agent\b/gi, "talk to a human"));
      add(seed.replace(/\ban agent\b/gi, "a human"));
    }
    // Combined paraphrases first so create/submit + ticket/support-request stay in the cap.
    for (const [leadRe, leadTo] of LEAD_SWAPS) {
      for (const [verbRe, verbTo] of VERB_SWAPS) {
        for (const [nounRe, nounTo] of NOUN_SWAPS) {
          add(seed.replace(leadRe, leadTo).replace(verbRe, verbTo).replace(nounRe, nounTo));
        }
      }
    }
    for (const [re, to] of LEAD_SWAPS) add(seed.replace(re, to));
    for (const [re, to] of VERB_SWAPS) add(seed.replace(re, to));
    for (const [re, to] of NOUN_SWAPS) add(seed.replace(re, to));
  }
  return out.slice(0, MAX_INTENT_ALIASES);
}

/** Embed question, title, and capped intent aliases; store full Q&A as the LLM context payload. */
export function qaKnowledgeChunks(opts: { title?: string | null; question: string; answer: string }): ChunkPiece[] {
  const question = opts.question.trim();
  const answer = opts.answer.trim();
  if (!question || !answer) return [];
  const title = (opts.title || question).trim();
  const payload = `Question: ${question}\n\nAnswer: ${answer}`;
  const chunks: ChunkPiece[] = [{ order: 0, text: payload, embedText: question }];
  if (title && title.toLowerCase() !== question.toLowerCase()) {
    chunks.push({ order: chunks.length, text: payload, embedText: title });
  }
  for (const alias of qaIntentAliases(question, title)) {
    if (alias.toLowerCase() === question.toLowerCase() || alias.toLowerCase() === title.toLowerCase()) continue;
    chunks.push({ order: chunks.length, text: payload, embedText: alias });
  }
  return chunks;
}

/** @deprecated character-window helper kept for tests */
export function chunkText(text: string, size = 800, overlap = 120) {
  return chunkDocument(text, size, overlap).map((c) => c.text);
}
