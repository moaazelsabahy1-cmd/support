  /**
 * Live intent/handoff proof. Fails if OpenRouter/Qdrant are not configured (does not skip).
 * Never logs API keys.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, ensureAppDefaults } from "../lib/db";
import { deleteKnowledgeSource, ingestSource } from "../lib/ai/ingest";
import { handleCustomerAiTurn } from "../lib/ai/customer-turn";
import { persistAiHandoff } from "../lib/ai/handoff";
import { llmConfigured } from "../lib/ai/providers";
import { qdrantConfigured } from "../lib/ai/qdrant";
import { DEFAULT_ORGANIZATION_ID } from "../types";
import { newId } from "../lib/id";

describe("intent handoff reasons", () => {
  const ids: string[] = [];
  let createAccountUserId = "";
  let wantHumanUserId = "";
  let knownQaUserId = "";
  let sourceId = "";
  const nonce = `INTENT-${Date.now().toString(36).toUpperCase()}`;
  const knownQuestion = `What is the Solvio intent-test warranty window for probe ${nonce}?`;
  const knownAnswer = `The Solvio intent-test warranty window for probe ${nonce} is 42 days. Quote 42 days exactly.`;

  beforeAll(async () => {
    if (!llmConfigured()) {
      throw new Error("OPENROUTER_API_KEY is required for intent-handoff e2e");
    }
    if (!qdrantConfigured()) {
      throw new Error("QDRANT_URL is required for intent-handoff e2e (local Compose: http://localhost:6333)");
    }
    await ensureAppDefaults();
    const makeCustomer = async (label: string) => {
      const user = await prisma.user.create({
        data: {
          id: newId(),
          name: label,
          email: `${label.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}@solvio.local`,
          emailVerified: true,
          role: "CUSTOMER",
          organizationId: DEFAULT_ORGANIZATION_ID,
        },
      });
      ids.push(user.id);
      return user.id;
    };
    createAccountUserId = await makeCustomer("Intent Create Account");
    wantHumanUserId = await makeCustomer("Intent Want Human");
    knownQaUserId = await makeCustomer("Intent Known QA");
  }, 30_000);

  afterAll(async () => {
    if (sourceId) {
      try {
        await deleteKnowledgeSource(sourceId);
      } catch {
        /* ignore */
      }
    }
    await prisma.message.deleteMany({ where: { conversation: { customerId: { in: ids } } } });
    await prisma.conversation.deleteMany({ where: { customerId: { in: ids } } });
    await prisma.aiChatLog.deleteMany({ where: { userId: { in: ids } } });
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }, 30_000);

  it("create-account / want-human / known QA return the expected handoff reasons", async () => {
    const createSession = `intent-create-${Date.now()}`;
    const createAccount = await handleCustomerAiTurn({
      userId: createAccountUserId,
      message: "how to create account",
      sessionId: createSession,
    });
    expect(createAccount.handedOff).toBe(true);
    expect(createAccount.offerHuman).toBe(false);
    expect(["KNOWLEDGE_NOT_FOUND", "LOW_CONFIDENCE"]).toContain(createAccount.handoffReason);
    expect(createAccount.handoffReason).not.toBe("CUSTOMER_REQUESTED_HUMAN");

    const createAccountCustomer = await prisma.message.count({
      where: {
        conversationId: createAccount.conversationId!,
        role: "CUSTOMER",
        body: "how to create account",
      },
    });
    expect(createAccountCustomer).toBe(1);
    const createAccountSystem = await prisma.message.count({
      where: { conversationId: createAccount.conversationId!, role: "SYSTEM" },
    });
    expect(createAccountSystem).toBe(2);

    const retryCreate = await handleCustomerAiTurn({
      userId: createAccountUserId,
      message: "how to create account",
      sessionId: createSession,
    });
    expect(retryCreate.handoffReason).toBe(createAccount.handoffReason);
    expect(
      await prisma.message.count({
        where: {
          conversationId: createAccount.conversationId!,
          role: "CUSTOMER",
          body: "how to create account",
        },
      }),
    ).toBe(1);
    expect(
      await prisma.message.count({
        where: { conversationId: createAccount.conversationId!, role: "SYSTEM" },
      }),
    ).toBe(2);

    const convAfterKnowledge = await prisma.conversation.findUniqueOrThrow({
      where: { id: createAccount.conversationId! },
    });
    await persistAiHandoff({
      userId: createAccountUserId,
      conversationId: createAccount.conversationId!,
      sessionId: convAfterKnowledge.sourceSessionId || `intent-create-manual-${Date.now()}`,
      reason: "CUSTOMER_REQUESTED_HUMAN",
      lastQuestion: "Talk to a human agent",
      turnKey: `handoff:manual:overwrite-probe`,
    });
    const convKept = await prisma.conversation.findUniqueOrThrow({
      where: { id: createAccount.conversationId! },
    });
    expect(convKept.handoffReason).toBe(createAccount.handoffReason);
    expect(
      await prisma.message.count({
        where: { conversationId: createAccount.conversationId!, role: "SYSTEM" },
      }),
    ).toBe(2);

    const wantHuman = await handleCustomerAiTurn({
      userId: wantHumanUserId,
      message: "I want to talk to a human",
      sessionId: `intent-human-${Date.now()}`,
    });
    expect(wantHuman.handedOff).toBe(false);
    expect(wantHuman.offerHuman).toBe(true);
    expect(wantHuman.handoffReason).toBe("CUSTOMER_REQUESTED_HUMAN");
    expect(
      await prisma.message.count({
        where: { conversationId: wantHuman.conversationId!, role: "SYSTEM" },
      }),
    ).toBe(0);
    const humanAsk = await prisma.message.findFirst({
      where: { conversationId: wantHuman.conversationId!, role: "CUSTOMER" },
    });
    expect(humanAsk?.role).toBe("CUSTOMER");
    expect(humanAsk?.senderId).toBe(wantHumanUserId);

    const source = await prisma.knowledgeSource.create({
      data: {
        id: newId(),
        organizationId: DEFAULT_ORGANIZATION_ID,
        type: "QA",
        title: `Intent-test warranty ${nonce}`,
        status: "PENDING",
        question: knownQuestion,
        answer: knownAnswer,
        tags: ["intent-test"],
        chunkCount: 0,
      },
    });
    sourceId = source.id;
    await ingestSource(source.id);

    const knownQa = await handleCustomerAiTurn({
      userId: knownQaUserId,
      message: knownQuestion,
      sessionId: `intent-known-${Date.now()}`,
    });
    expect(knownQa.handedOff).toBe(false);
    expect(knownQa.offerHuman).toBe(false);
    expect(knownQa.response.toLowerCase()).toMatch(/42 days/);

    const report = {
      createAccount: { handedOff: createAccount.handedOff, handoffReason: createAccount.handoffReason },
      wantHuman: { handedOff: wantHuman.handedOff, handoffReason: wantHuman.handoffReason },
      knownQa: { handedOff: knownQa.handedOff, handoffReason: knownQa.handoffReason },
    };
    console.info("[intent-handoff] reasons", report);
  }, 180_000);

  it("answers a general question without handing off", async () => {
    const user = await prisma.user.create({
      data: {
        id: newId(),
        name: "Intent VPN",
        email: `intent-vpn-${Date.now()}@solvio.local`,
        emailVerified: true,
        role: "CUSTOMER",
        organizationId: DEFAULT_ORGANIZATION_ID,
      },
    });
    ids.push(user.id);
    const turn = await handleCustomerAiTurn({
      userId: user.id,
      message: "What is a VPN?",
      sessionId: `intent-vpn-${Date.now()}`,
    });
    expect(turn.handedOff).toBe(false);
    expect(turn.escalated).toBe(false);
    expect(turn.response.toLowerCase()).toMatch(/virtual private|vpn|network/);
  }, 180_000);

  it("treats Arabic human requests as CUSTOMER_REQUESTED_HUMAN", async () => {
    const user = await prisma.user.create({
      data: {
        id: newId(),
        name: "Intent Arabic Human",
        email: `intent-ar-${Date.now()}@solvio.local`,
        emailVerified: true,
        role: "CUSTOMER",
        organizationId: DEFAULT_ORGANIZATION_ID,
      },
    });
    ids.push(user.id);
    const turn = await handleCustomerAiTurn({
      userId: user.id,
      message: "عايز أكلم موظف",
      sessionId: `intent-ar-${Date.now()}`,
    });
    expect(turn.handedOff).toBe(false);
    expect(turn.offerHuman).toBe(true);
    expect(turn.handoffReason).toBe("CUSTOMER_REQUESTED_HUMAN");
  }, 120_000);
});
