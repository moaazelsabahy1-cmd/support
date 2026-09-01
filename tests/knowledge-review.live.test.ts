/**
 * Approves one existing PENDING_REVIEW conversation source through the real job/ingest path.
 */
import { describe, expect, it } from "vitest";
import { prisma, ensureAppDefaults } from "../lib/db";
import { approveKnowledgeSource } from "../lib/ai/jobs";
import { llmConfigured } from "../lib/ai/providers";
import { qdrantConfigured } from "../lib/ai/qdrant";
import { DEFAULT_ORGANIZATION_ID } from "../types";

describe("knowledge review approve", () => {
  it("approves an existing PENDING_REVIEW conversation source without duplicating it", async () => {
    if (!llmConfigured()) throw new Error("OpenRouter key required");
    if (!qdrantConfigured()) throw new Error("QDRANT_URL required");
    await ensureAppDefaults();
    const candidate = await prisma.knowledgeSource.findFirst({
      where: { organizationId: DEFAULT_ORGANIZATION_ID, status: "PENDING_REVIEW", type: "CONVERSATION" },
      orderBy: { createdAt: "desc" },
    });
    expect(candidate).toBeTruthy();
    const before = await prisma.knowledgeSource.count({ where: { id: candidate!.id } });
    expect(before).toBe(1);
    const result = await approveKnowledgeSource(candidate!.id, { wait: true });
    expect(result.id).toBe(candidate!.id);
    const after = await prisma.knowledgeSource.findUniqueOrThrow({ where: { id: candidate!.id } });
    expect(after.status).toBe("READY");
    expect(await prisma.knowledgeSource.count({ where: { id: candidate!.id } })).toBe(1);
  }, 180_000);
});
