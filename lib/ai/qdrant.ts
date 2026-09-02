import { createHash } from "crypto";
import { QdrantClient } from "@qdrant/js-client-rest";
import { getEnv, isConfigured } from "@/lib/env";
import { aiLog, aiWarn } from "@/lib/ai/log";
import { KnowledgeError, KNOWLEDGE_ERROR } from "@/lib/ai/errors";

export function qdrantConfigured() {
  return isConfigured(getEnv().QDRANT_URL);
}

export function getQdrant() {
  const env = getEnv();
  if (!qdrantConfigured()) return null;
  return new QdrantClient({
    url: env.QDRANT_URL,
    apiKey: env.QDRANT_API_KEY || undefined,
  });
}

export function qdrantPointId(sourceId: string, chunkId: string) {
  const hash = createHash("sha256").update(`${sourceId}:${chunkId}`).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export async function ensureQdrantCollection(vectorSize: number) {
  const client = getQdrant();
  if (!client) return;
  const env = getEnv();
  const exists = await client.collectionExists(env.QDRANT_COLLECTION);
  const present = typeof exists === "boolean" ? exists : exists.exists;
  if (!present) {
    aiLog("qdrant", "creating collection", { collection: env.QDRANT_COLLECTION, size: vectorSize });
    await client.createCollection(env.QDRANT_COLLECTION, {
      vectors: { size: vectorSize, distance: "Cosine" },
    });
  }
}

export type QdrantPayload = {
  sourceId: string;
  sourceType: string;
  chunkId: string;
  title: string;
  text: string;
  category?: string;
  tags?: string[];
  url?: string;
  organizationId: string;
  createdAt: string;
  status?: string;
  sourceConversationId?: string;
  sourceMessageIds?: string[];
  handoffReason?: string;
  resolvedBy?: string;
};

export async function upsertQdrantPoints(
  points: { id: string; vector: number[]; payload: QdrantPayload }[],
) {
  const client = getQdrant();
  if (!client) return { used: false as const };
  if (!points.length) return { used: true as const };
  try {
    await ensureQdrantCollection(points[0].vector.length);
    await client.upsert(getEnv().QDRANT_COLLECTION, {
      wait: true,
      points: points.map((p) => ({ id: p.id, vector: p.vector, payload: p.payload })),
    });
    aiLog("qdrant", "upserted points", { count: points.length });
    return { used: true as const };
  } catch (error) {
    aiWarn("qdrant", "upsert failed", { error });
    throw new KnowledgeError(
      KNOWLEDGE_ERROR.QDRANT_FAILED,
      error instanceof Error ? error.message : "Qdrant upsert failed",
    );
  }
}

export async function deleteQdrantBySource(sourceId: string) {
  const client = getQdrant();
  if (!client) return { used: false as const };
  try {
    await client.delete(getEnv().QDRANT_COLLECTION, {
      wait: true,
      filter: {
        must: [{ key: "sourceId", match: { value: sourceId } }],
      },
    });
    aiLog("qdrant", "deleted source vectors", { sourceId });
    return { used: true as const };
  } catch (error) {
    aiWarn("qdrant", "delete failed", { sourceId, error });
    throw new KnowledgeError(
      KNOWLEDGE_ERROR.QDRANT_FAILED,
      error instanceof Error ? error.message : "Qdrant delete failed",
    );
  }
}

export async function searchQdrant(
  vector: number[],
  limit: number,
  filters?: { organizationId?: string; category?: string; sourceType?: string },
) {
  const client = getQdrant();
  if (!client) return null;
  await ensureQdrantCollection(vector.length);
  const must: { key: string; match: { value: string } }[] = [];
  if (filters?.organizationId) must.push({ key: "organizationId", match: { value: filters.organizationId } });
  if (filters?.category) must.push({ key: "category", match: { value: filters.category } });
  if (filters?.sourceType) must.push({ key: "sourceType", match: { value: filters.sourceType } });
  const res = await client.query(getEnv().QDRANT_COLLECTION, {
    query: vector,
    limit,
    with_payload: true,
    filter: must.length ? { must } : undefined,
  });
  return res.points || [];
}
