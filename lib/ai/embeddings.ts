import { getEmbeddingProvider } from "@/lib/ai/providers";
import { getEmbeddingModel } from "@/lib/ai/providers";
import { KnowledgeError, KNOWLEDGE_ERROR } from "@/lib/ai/errors";
import { aiLog, aiWarn } from "@/lib/ai/log";

export async function embedTexts(texts: string[]) {
  const provider = getEmbeddingProvider();
  if (!provider) return null;
  const batches: number[][] = [];
  try {
    for (let i = 0; i < texts.length; i += 16) {
      const slice = texts.slice(i, i + 16);
      batches.push(...(await provider.embed(slice)));
    }
    aiLog("embedding", "embedded texts", { count: texts.length, model: provider.model });
    return batches;
  } catch (error) {
    aiWarn("embedding", "embed failed", { error });
    throw new KnowledgeError(
      KNOWLEDGE_ERROR.EMBEDDING_FAILED,
      error instanceof Error ? error.message : "Embedding generation failed",
    );
  }
}

export async function embedText(text: string) {
  const vectors = await embedTexts([text]);
  return vectors?.[0] ?? null;
}

export function embeddingModelName() {
  return getEmbeddingModel();
}

export function cosine(a: number[], b: number[]) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
