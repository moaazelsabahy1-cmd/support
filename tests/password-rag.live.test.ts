/**
 * Live password-reset RAG plus intent/unknown checks. Fails if OpenRouter/Qdrant are missing.
 * Never logs API keys.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, ensureAppDefaults } from "../lib/db";
import { handleCustomerAiTurn } from "../lib/ai/customer-turn";
import { retrieveKnowledge } from "../lib/ai/retrieval";
import { llmConfigured } from "../lib/ai/providers";
import { qdrantConfigured } from "../lib/ai/qdrant";
import { DEFAULT_ORGANIZATION_ID } from "../types";
import { newId } from "../lib/id";

describe("password-reset RAG", () => {
  const ids: string[] = [];
  let knownUser = "";
  let unknownUser = "";
  let humanUser = "";
  const nonce = `RAG-${Date.now().toString(36).toUpperCase()}`;

  beforeAll(async () => {
    if (!llmConfigured()) {
      throw new Error("OPENROUTER_API_KEY is required");
    }
    if (!qdrantConfigured()) {
      throw new Error("QDRANT_URL is required");
    }
    await ensureAppDefaults();
    const makeCustomer = async (label: string) => {
      const user = await prisma.user.create({
        data: {
          id: newId(),
          name: label,
          email: `rag-${label.replace(/\s+/g, "-").toLowerCase()}-${Date.now()}@solvio.local`,
          emailVerified: true,
          role: "CUSTOMER",
          organizationId: DEFAULT_ORGANIZATION_ID,
        },
      });
      ids.push(user.id);
      return user.id;
    };
    knownUser = await makeCustomer("Password Known");
    unknownUser = await makeCustomer("Password Unknown");
    humanUser = await makeCustomer("Password Human");
  }, 30_000);

  afterAll(async () => {
    await prisma.message.deleteMany({ where: { conversation: { customerId: { in: ids } } } });
    await prisma.conversation.deleteMany({ where: { customerId: { in: ids } } });
    await prisma.aiChatLog.deleteMany({ where: { userId: { in: ids } } });
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }, 30_000);

  it("A grounded password reset, B unknown handoff, C explicit human", async () => {
    const query = "How do I reset my password?";
    const retrieved = await retrieveKnowledge({
      query,
      filters: { organizationId: DEFAULT_ORGANIZATION_ID },
    });
    const top = retrieved.hits[0];
    console.info("[password-rag] retrieval", {
      score: top?.score,
      sourceId: top?.sourceId,
      title: top?.title,
      fallbackUsed: retrieved.fallbackUsed,
    });
    expect(top).toBeTruthy();
    expect(top!.score).toBeGreaterThanOrEqual(0.35);

    const known = await handleCustomerAiTurn({
      userId: knownUser,
      message: query,
      sessionId: `rag-known-${Date.now()}`,
    });
    expect(known.handedOff).toBe(false);
    expect(known.handoffReason).toBeNull();
    expect(known.response.toLowerCase()).toMatch(/forgot password|reset link/);

    const unknown = await handleCustomerAiTurn({
      userId: unknownUser,
      message: `What is the Solvio launch date for probe ${nonce}?`,
      sessionId: `rag-unknown-${Date.now()}`,
    });
    expect(unknown.handedOff).toBe(true);
    expect(unknown.handoffReason).toBe("KNOWLEDGE_NOT_FOUND");

    const human = await handleCustomerAiTurn({
      userId: humanUser,
      message: "I want to talk to a human",
      sessionId: `rag-human-${Date.now()}`,
    });
    expect(human.handedOff).toBe(false);
    expect(human.offerHuman).toBe(true);
    expect(human.handoffReason).toBe("CUSTOMER_REQUESTED_HUMAN");

    console.info("[password-rag] A/B/C", {
      A: { handedOff: known.handedOff, handoffReason: known.handoffReason },
      B: { handedOff: unknown.handedOff, handoffReason: unknown.handoffReason },
      C: { handedOff: human.handedOff, handoffReason: human.handoffReason },
    });
  }, 180_000);
});
