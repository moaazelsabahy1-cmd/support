import { prisma } from "@/lib/db";
import { readStored } from "@/lib/storage";
import { getEnv, isConfigured } from "@/lib/env";
import { AppError } from "@/lib/api-response";
import { chunkDocument, qaKnowledgeChunks } from "@/lib/ai/chunking";
import { embedTexts, embeddingModelName } from "@/lib/ai/embeddings";
import { extractFileBuffer } from "@/lib/ai/extract";
import { extractWebsite } from "@/lib/ai/web";
import { deleteQdrantBySource, qdrantConfigured, qdrantPointId, upsertQdrantPoints } from "@/lib/ai/qdrant";
import { KnowledgeError, KNOWLEDGE_ERROR } from "@/lib/ai/errors";
import { aiLog, aiWarn } from "@/lib/ai/log";
import { llmConfigured } from "@/lib/ai/providers";
import { newId } from "@/lib/id";
import type { KnowledgeSource, KnowledgeSourceType, Prisma } from "@prisma/client";

export function isKnowledgeType(value: string): value is KnowledgeSourceType {
  return value === "QA" || value === "FILE" || value === "WEB" || value === "CONVERSATION";
}

export async function failSource(sourceId: string, code: string, message: string) {
  await prisma.knowledgeSource.update({
    where: { id: sourceId },
    data: { status: "FAILED", errorCode: code, errorMessage: message },
  });
}

export async function removeSourceVectors(sourceId: string) {
  await prisma.knowledgeChunk.deleteMany({ where: { sourceId } });
  if (qdrantConfigured()) {
    await deleteQdrantBySource(sourceId);
  }
}

export async function ingestSource(sourceId: string) {
  const source = await prisma.knowledgeSource.findUnique({ where: { id: sourceId } });
  if (!source) throw new KnowledgeError(KNOWLEDGE_ERROR.INVALID_SOURCE, "Knowledge source not found");
  if (source.status === "DISABLED" || source.status === "PENDING_REVIEW" || source.status === "REJECTED") {
    aiLog("ingest", "skip source", { sourceId, status: source.status });
    return;
  }

  await prisma.knowledgeSource.update({
    where: { id: sourceId },
    data: { status: "PROCESSING", errorCode: null, errorMessage: null },
  });

  try {
    const loaded = await loadSourceText(source);
    const chunks =
      loaded.chunks?.length ? loaded.chunks : chunkDocument(loaded.text);
    if (!chunks.length) throw new KnowledgeError(KNOWLEDGE_ERROR.NO_TEXT_FOUND, "No usable text after chunking");
    aiLog("chunk", "created chunks", { count: chunks.length, sourceId });

    if (!llmConfigured()) {
      throw new KnowledgeError(KNOWLEDGE_ERROR.EMBEDDING_FAILED, "OPENROUTER_API_KEY is not configured");
    }
    const embeddings = await embedTexts(chunks.map((c) => c.embedText || c.text));
    if (!embeddings) throw new KnowledgeError(KNOWLEDGE_ERROR.EMBEDDING_FAILED, "Embedding provider unavailable");

    await persistChunks({ ...source, title: loaded.title }, chunks, embeddings);
    await prisma.knowledgeSource.update({
      where: { id: sourceId },
      data: {
        status: "READY",
        title: loaded.title,
        chunkCount: chunks.length,
        indexedAt: new Date(),
        errorCode: null,
        errorMessage: null,
        embeddingModel: embeddingModelName(),
        embeddingDims: embeddings[0]?.length,
      },
    });
    aiLog("ingest", "source ready", { sourceId, chunks: chunks.length });
  } catch (error) {
    const code = error instanceof KnowledgeError ? error.code : KNOWLEDGE_ERROR.EXTRACTION_FAILED;
    const message = error instanceof Error ? error.message : "Indexing failed";
    aiWarn("ingest", "source failed", { sourceId, code, error: message });
    await failSource(sourceId, code, message);
    throw error;
  }
}

async function loadSourceText(source: KnowledgeSource): Promise<{
  title: string;
  text: string;
  chunks?: { text: string; order: number; embedText?: string }[];
}> {
  if (source.type === "QA" || source.type === "CONVERSATION") {
    const question = source.question?.trim();
    const answer = source.answer?.trim();
    if (!question || !answer) throw new KnowledgeError(KNOWLEDGE_ERROR.NO_TEXT_FOUND, "Q&A is missing question or answer");
    const title = source.title || question;
    const chunks = qaKnowledgeChunks({ title, question, answer });
    return {
      title,
      text: chunks[0]?.text || `Question: ${question}\n\nAnswer: ${answer}`,
      chunks,
    };
  }
  if (source.type === "WEB") {
    if (!source.sourceUrl) throw new KnowledgeError(KNOWLEDGE_ERROR.INVALID_SOURCE, "Website URL is missing");
    const page = await extractWebsite(source.sourceUrl);
    const prev = (source.metadata || {}) as Record<string, unknown>;
    await prisma.knowledgeSource.update({
      where: { id: source.id },
      data: {
        metadata: { ...prev, crawlMode: page.crawlMode } as Prisma.InputJsonValue,
        title: page.title,
      },
    });
    return { title: page.title, text: page.text };
  }
  if (!source.storageKey) throw new KnowledgeError(KNOWLEDGE_ERROR.INVALID_SOURCE, "File is missing storage key");
  const buf = await readStored(source.storageKey);
  const text = await extractFileBuffer(buf, source.mimeType || "", source.filename || "file");
  return { title: source.title || source.filename || "File", text };
}

async function persistChunks(
  source: KnowledgeSource,
  chunks: { text: string; order: number; embedText?: string }[],
  embeddings: number[][],
) {
  const sourceId = source.id;
  const qdrantOn = qdrantConfigured();
  if (qdrantOn) {
    try {
      await deleteQdrantBySource(sourceId);
    } catch {
      /* collection may not exist yet */
    }
  }

  const meta = (source.metadata || {}) as Record<string, unknown>;
  const sourceConversationId = typeof meta.sourceConversationId === "string" ? meta.sourceConversationId : undefined;
  const sourceTicketId = typeof meta.sourceTicketId === "string" ? meta.sourceTicketId : undefined;
  const sourceMessageIds = Array.isArray(meta.sourceMessageIds)
    ? meta.sourceMessageIds.filter((id): id is string => typeof id === "string")
    : undefined;
  const handoffReason = typeof meta.handoffReason === "string" ? meta.handoffReason : undefined;
  const resolvedBy = typeof meta.resolvedBy === "string" ? meta.resolvedBy : undefined;

  const model = embeddingModelName();
  const points: Parameters<typeof upsertQdrantPoints>[0] = [];
  const docs = chunks.map((chunk, i) => {
    const chunkId = `${sourceId}:${chunk.order}`;
    const qdrantId = qdrantPointId(sourceId, chunkId);
    const embedding = embeddings[i] || [];
    if (embedding.length) {
      points.push({
        id: qdrantId,
        vector: embedding,
        payload: {
          sourceId,
          knowledgeId: sourceId,
          sourceType: source.type,
          chunkId,
          title: source.title,
          text: chunk.text,
          category: source.category ?? undefined,
          tags: source.tags,
          url: source.sourceUrl ?? undefined,
          organizationId: source.organizationId,
          createdAt: new Date().toISOString(),
          status: "READY",
          ...(sourceConversationId ? { sourceConversationId } : {}),
          ...(sourceTicketId ? { sourceTicketId } : {}),
          ...(sourceMessageIds?.length ? { sourceMessageIds } : {}),
          ...(handoffReason ? { handoffReason } : {}),
          ...(resolvedBy ? { resolvedBy } : {}),
        },
      });
    }
    return {
      id: newId(),
      organizationId: source.organizationId,
      sourceType: source.type,
      sourceId,
      chunkId,
      text: chunk.text,
      order: chunk.order,
      metadata: { title: source.title, category: source.category, tags: source.tags, url: source.sourceUrl } as Prisma.InputJsonValue,
      embedding,
      embeddingStatus: embedding.length ? ("READY" as const) : ("FAILED" as const),
      embeddingModel: model,
      embeddingDims: embedding.length || null,
      qdrantId,
    };
  });

  await prisma.$transaction(async (tx) => {
    await tx.knowledgeChunk.deleteMany({ where: { sourceId } });
    if (docs.length) await tx.knowledgeChunk.createMany({ data: docs });
  });
  if (qdrantOn) await upsertQdrantPoints(points);
}

export async function deleteKnowledgeSource(id: string) {
  const source = await prisma.knowledgeSource.findUnique({ where: { id } });
  if (!source) throw new AppError("NOT_FOUND", "Source not found", 404);
  try {
    await removeSourceVectors(source.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Qdrant delete failed";
    await failSource(source.id, KNOWLEDGE_ERROR.QDRANT_FAILED, message);
    throw new AppError(KNOWLEDGE_ERROR.QDRANT_FAILED, "Could not remove vectors. Source was not deleted.", 502);
  }
  await prisma.knowledgeSource.delete({ where: { id: source.id } });
}

export function envKnowledgeLimits() {
  const env = getEnv();
  return {
    maxFileBytes: env.KNOWLEDGE_MAX_FILE_BYTES,
    r2: isConfigured(env.R2_ACCESS_KEY_ID),
  };
}
