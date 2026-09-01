import { getEnv } from "@/lib/env";

export type ChunkPiece = { text: string; order: number };

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

/** @deprecated character-window helper kept for tests */
export function chunkText(text: string, size = 800, overlap = 120) {
  return chunkDocument(text, size, overlap).map((c) => c.text);
}
