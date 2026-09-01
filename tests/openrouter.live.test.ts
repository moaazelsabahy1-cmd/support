/**
 * Live OpenRouter checks. Uses OPENROUTER_API_KEY from the environment.
 * Never logs the key. Skips if the key is missing.
 */
import { describe, expect, it } from "vitest";
import { retrieveKnowledge } from "../lib/ai/retrieval";
import { llmConfigured, getChatModel, getEmbeddingModel, getLlmProvider, getEmbeddingProvider } from "../lib/ai/providers";
import { prisma } from "../lib/db";
import { ingestSource } from "../lib/ai/ingest";
import { answerQuestion } from "../lib/ai/agent";
import { DEFAULT_ORGANIZATION_ID } from "../types";
import { newId } from "../lib/id";

describe("OpenRouter live", () => {
  it("generates text with google/gemini-3.7-flash", async () => {
    if (!llmConfigured()) {
      throw new Error("OPENROUTER_API_KEY is required for OpenRouter live tests");
    }
    expect(getChatModel()).toBe("google/gemini-3.7-flash");
    const llm = getLlmProvider();
    expect(llm).not.toBeNull();
    const result = await llm!.generateText({
      messages: [{ role: "user", content: "Reply with the single word: ok" }],
      temperature: 0.2,
    });
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.model.toLowerCase()).toContain("gemini");
    expect(typeof result.tokens === "number" || result.tokens === undefined).toBe(true);
  }, 60_000);

  it("embeds with openai/text-embedding-3-small at 1536 dimensions", async () => {
    if (!llmConfigured()) {
      throw new Error("OPENROUTER_API_KEY is required for OpenRouter live tests");
    }
    expect(getEmbeddingModel()).toBe("openai/text-embedding-3-small");
    const provider = getEmbeddingProvider();
    expect(provider).not.toBeNull();
    const vectors = await provider!.embed(["Solvio knowledge embedding probe"]);
    expect(vectors[0]?.length).toBe(1536);
  }, 60_000);

  it("runs retrieval against the knowledge store", async () => {
    if (!llmConfigured()) {
      throw new Error("OPENROUTER_API_KEY is required for OpenRouter live tests");
    }
    const result = await retrieveKnowledge({ query: "How do I reset my password?" });
    expect(Array.isArray(result.hits)).toBe(true);
  }, 60_000);

  it("ingests Q&A and returns a grounded RAG answer", async () => {
    if (!llmConfigured()) {
      throw new Error("OPENROUTER_API_KEY is required for OpenRouter live tests");
    }
    const source = await prisma.knowledgeSource.create({
      data: {
        id: newId(),
        organizationId: DEFAULT_ORGANIZATION_ID,
        type: "QA",
        title: "Live-test refund window",
        status: "PENDING",
        question: "What is the Solvio live-test refund window?",
        answer: "The live-test refund window is 14 days.",
        tags: ["live-test"],
        chunkCount: 0,
      },
    });
    try {
      await ingestSource(source.id);
      const grounded = await answerQuestion({
        message: "What is the Solvio live-test refund window?",
        sessionId: `openrouter-live-${Date.now()}`,
      });
      expect(grounded.response.toLowerCase()).toMatch(/14 days/);
      const unrelated = await answerQuestion({
        message: "What is the secret launch date of Project Nebula?",
        sessionId: `openrouter-live-unrelated-${Date.now()}`,
      });
      expect(unrelated.response.toLowerCase()).toMatch(/enough information|don't have enough|not sure|human/);
    } finally {
      await prisma.knowledgeChunk.deleteMany({ where: { sourceId: source.id } });
      await prisma.knowledgeSource.delete({ where: { id: source.id } });
    }
  }, 120_000);
});
