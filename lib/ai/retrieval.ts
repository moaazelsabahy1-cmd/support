import { prisma } from "@/lib/db";
import { cosine, embedText, embeddingModelName } from "@/lib/ai/embeddings";
import { searchQdrant, qdrantConfigured } from "@/lib/ai/qdrant";
import { knowledgeOrgId } from "@/lib/ai/org";
import { getEnv } from "@/lib/env";
import { aiLog, aiWarn } from "@/lib/ai/log";
import { KNOWLEDGE_ERROR } from "@/lib/ai/errors";
import { embeddingModelAliases } from "@/lib/ai/providers";
import { isHexId } from "@/lib/id";
import type { KnowledgeSourceType } from "@/types";

export type RetrievedHit = {
  sourceId: string;
  chunkId: string;
  title: string;
  text: string;
  sourceType: KnowledgeSourceType | string;
  url?: string;
  score: number;
};

export type KnowledgeRetriever = {
  retrieveKnowledge: typeof retrieveKnowledge;
};

export function dedupeHits(hits: RetrievedHit[]) {
  const seen = new Set<string>();
  const out: RetrievedHit[] = [];
  for (const hit of hits) {
    const key = hit.chunkId || `${hit.sourceId}:${hit.text.slice(0, 40)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hit);
  }
  return out;
}

export function applyMinScore(hits: RetrievedHit[], minScore: number) {
  return hits.filter((h) => h.score >= minScore);
}

export function rankHits(hits: RetrievedHit[], topK: number) {
  return [...hits].sort((a, b) => b.score - a.score).slice(0, topK);
}

async function restrictToReadySources(hits: RetrievedHit[], organizationId: string) {
  if (!hits.length) return hits;
  const ids = [...new Set(hits.map((h) => h.sourceId).filter((id) => isHexId(id) || id.length > 0))];
  const ready = await prisma.knowledgeSource.findMany({
    where: { organizationId, status: "READY", id: { in: ids } },
    select: { id: true },
  });
  const allowed = new Set(ready.map((s) => s.id));
  return hits.filter((h) => allowed.has(h.sourceId));
}

export async function retrieveSimilarChunks(
  queryEmbedding: number[],
  topK: number,
  filters?: { organizationId?: string; category?: string; sourceType?: string },
): Promise<RetrievedHit[]> {
  const org = filters?.organizationId || (await knowledgeOrgId());
  const ready = await prisma.knowledgeSource.findMany({
    where: {
      organizationId: org,
      status: "READY",
      ...(filters?.category ? { category: filters.category } : {}),
      ...(filters?.sourceType ? { type: filters.sourceType as KnowledgeSourceType } : {}),
    },
    select: { id: true, title: true, type: true, sourceUrl: true },
  });
  const ids = ready.map((s) => s.id);
  if (!ids.length) return [];
  const model = embeddingModelName();
  const aliases = embeddingModelAliases(model);
  const chunks = await prisma.knowledgeChunk.findMany({
    where: {
      sourceId: { in: ids },
      embeddingStatus: "READY",
      OR: [{ embeddingModel: { in: aliases } }, { embeddingModel: null }],
    },
  });
  const byId = new Map(ready.map((s) => [s.id, s]));
  const scored: RetrievedHit[] = [];
  for (const chunk of chunks) {
    const src = byId.get(chunk.sourceId);
    const meta = (chunk.metadata || {}) as Record<string, unknown>;
    const score = cosine(queryEmbedding, chunk.embedding || []);
    scored.push({
      sourceId: chunk.sourceId,
      chunkId: chunk.chunkId || chunk.id,
      title: String(meta.title || src?.title || "Knowledge"),
      text: chunk.text,
      sourceType: chunk.sourceType || src?.type || "QA",
      url: typeof meta.url === "string" ? meta.url : src?.sourceUrl || undefined,
      score,
    });
  }
  return rankHits(scored, topK);
}

export async function retrieveKnowledge(opts: {
  query: string;
  topK?: number;
  filters?: { organizationId?: string; category?: string; sourceType?: string };
}): Promise<{ hits: RetrievedHit[]; code?: string; fallbackUsed: boolean }> {
  const env = getEnv();
  const topK = opts.topK ?? env.KNOWLEDGE_TOP_K;
  const minScore = env.KNOWLEDGE_MIN_SCORE;
  const org = opts.filters?.organizationId || (await knowledgeOrgId());
  const queryEmbedding = await embedText(opts.query);
  if (!queryEmbedding) {
    aiLog("retrieval", "no embedding provider");
    return { hits: [], code: KNOWLEDGE_ERROR.EMBEDDING_FAILED, fallbackUsed: false };
  }

  let fallbackUsed = false;
  let hits: RetrievedHit[] = [];

  if (qdrantConfigured()) {
    try {
      const points = await searchQdrant(queryEmbedding, topK * 2, {
        organizationId: org,
        category: opts.filters?.category,
        sourceType: opts.filters?.sourceType,
      });
      hits = (points || []).map((p) => {
        const payload = (p.payload || {}) as Record<string, unknown>;
        return {
          sourceId: String(payload.sourceId || ""),
          chunkId: String(payload.chunkId || p.id),
          title: String(payload.title || "Knowledge"),
          text: String(payload.text || ""),
          sourceType: String(payload.sourceType || "QA"),
          url: typeof payload.url === "string" ? payload.url : undefined,
          score: p.score ?? 0,
        };
      });
      aiLog("retrieval", "qdrant hits", { count: hits.length });
    } catch (error) {
      aiWarn("retrieval", "qdrant failed, postgres fallback", { error });
      fallbackUsed = true;
    }
  } else {
    fallbackUsed = true;
  }

  if (!hits.length) {
    hits = await retrieveSimilarChunks(queryEmbedding, topK * 2, { ...opts.filters, organizationId: org });
    fallbackUsed = true;
    aiLog("retrieval", "postgres cosine hits", { count: hits.length });
  }

  hits = await restrictToReadySources(hits, org);
  hits = applyMinScore(dedupeHits(rankHits(hits, topK * 2)), minScore).slice(0, topK);
  if (!hits.length) {
    const pgHits = await retrieveSimilarChunks(queryEmbedding, topK * 2, { ...opts.filters, organizationId: org });
    fallbackUsed = true;
    aiLog("retrieval", "postgres cosine after qdrant miss", { count: pgHits.length });
    hits = await restrictToReadySources(pgHits, org);
    hits = applyMinScore(dedupeHits(rankHits(hits, topK * 2)), minScore).slice(0, topK);
  }
  if (!hits.length) {
    return { hits: [], code: KNOWLEDGE_ERROR.NO_CONFIDENT_KNOWLEDGE, fallbackUsed };
  }
  return { hits, fallbackUsed };
}

/** @deprecated use retrieveKnowledge */
export async function retrieveChunks(queryEmbedding: number[], limit = 6) {
  const hits = await retrieveSimilarChunks(queryEmbedding, limit);
  return hits.map((h) => ({ id: h.chunkId, text: h.text, score: h.score, title: h.title }));
}
