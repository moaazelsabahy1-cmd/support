/**
 * Read-only RAG diagnosis for the seeded password-reset Q&A. Never logs API keys.
 */
import { prisma, ensureAppDefaults } from "../lib/db";
import { retrieveKnowledge } from "../lib/ai/retrieval";
import { embedText } from "../lib/ai/embeddings";
import { searchQdrant, qdrantConfigured } from "../lib/ai/qdrant";
import { getEmbeddingModel, embeddingModelAliases } from "../lib/ai/providers";
import { knowledgeOrgId } from "../lib/ai/org";
import { getEnv, knowledgeConfidenceThreshold } from "../lib/env";
import { DEFAULT_ORGANIZATION_ID } from "../types";

const QUERY = "How do I reset my password?";

async function main() {
  await ensureAppDefaults();
  const env = getEnv();
  const org = DEFAULT_ORGANIZATION_ID;
  const customerOrg = await knowledgeOrgId();

  const sources = await prisma.knowledgeSource.findMany({
    where: {
      organizationId: org,
      OR: [
        { title: { contains: "reset my password", mode: "insensitive" } },
        { question: { contains: "reset my password", mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      status: true,
      organizationId: true,
      chunkCount: true,
      embeddingModel: true,
      embeddingDims: true,
      errorCode: true,
      type: true,
    },
  });

  const sourceIds = sources.map((s) => s.id);
  const chunks = sourceIds.length
    ? await prisma.knowledgeChunk.findMany({
        where: { sourceId: { in: sourceIds } },
        select: {
          id: true,
          sourceId: true,
          organizationId: true,
          embeddingStatus: true,
          embeddingModel: true,
          embeddingDims: true,
          embedding: true,
        },
      })
    : [];

  const queryEmbedding = await embedText(QUERY);
  let qdrantTop: { score?: number; sourceId?: string; org?: string; title?: string }[] = [];
  if (qdrantConfigured() && queryEmbedding) {
    const points = await searchQdrant(queryEmbedding, 8, { organizationId: org });
    qdrantTop = (points || []).slice(0, 5).map((p) => {
      const payload = (p.payload || {}) as Record<string, string>;
      return {
        score: p.score,
        sourceId: payload.sourceId,
        org: payload.organizationId,
        title: payload.title,
      };
    });
  }

  const retrieved = await retrieveKnowledge({ query: QUERY, filters: { organizationId: org } });
  const pgReadyCount = await prisma.knowledgeSource.count({
    where: { organizationId: org, status: "READY" },
  });

  const classification: string[] = [];
  if (!sources.length) classification.push("missing Knowledge");
  else if (!sources.some((s) => s.status === "READY")) classification.push("source not READY");
  if (sources.length && !chunks.length) classification.push("missing chunks");
  for (const c of chunks) {
    if (c.embeddingStatus !== "READY") classification.push("missing/invalid embeddings");
    if ((c.embeddingDims || c.embedding.length) !== 1536) classification.push("embedding mismatch");
    if (c.organizationId !== org) classification.push("wrong organizationId");
    const aliases = embeddingModelAliases(getEmbeddingModel());
    if (c.embeddingModel && !aliases.includes(c.embeddingModel)) classification.push("embedding mismatch");
  }
  if (qdrantConfigured() && !qdrantTop.length) classification.push("Qdrant not indexed");
  if (qdrantTop.length && !retrieved.hits.length) classification.push("post-filter empty without PG fallback");
  if (!queryEmbedding) classification.push("query embedding problem");
  if (customerOrg !== org) classification.push("wrong organizationId");

  const report = {
    query: QUERY,
    org,
    knowledgeOrgIdDefault: customerOrg,
    minScore: env.KNOWLEDGE_MIN_SCORE,
    confidenceThreshold: knowledgeConfidenceThreshold(),
    embeddingModel: getEmbeddingModel(),
    aliases: embeddingModelAliases(),
    qdrantConfigured: qdrantConfigured(),
    pgReadySourceCount: pgReadyCount,
    sources,
    chunkSummary: chunks.map((c) => ({
      sourceId: c.sourceId,
      organizationId: c.organizationId,
      embeddingStatus: c.embeddingStatus,
      embeddingModel: c.embeddingModel,
      embeddingDims: c.embeddingDims,
      vectorLength: c.embedding.length,
    })),
    qdrantTop,
    retrieveHits: retrieved.hits.map((h) => ({
      score: h.score,
      sourceId: h.sourceId,
      title: h.title,
    })),
    retrieveCode: retrieved.code,
    fallbackUsed: retrieved.fallbackUsed,
    classification: [...new Set(classification)],
  };
  console.info("[password-rag diagnose]", JSON.stringify(report, null, 2));
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
