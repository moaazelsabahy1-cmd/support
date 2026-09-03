/**
 * Real learn-loop proof. Fails if OpenRouter is not configured (does not skip).
 * Never logs API keys.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, ensureAppDefaults } from "../lib/db";
import { deleteKnowledgeSource } from "../lib/ai/ingest";
import { handleCustomerAiTurn } from "../lib/ai/customer-turn";
import { extractConversationKnowledge } from "../lib/ai/learn";
import { approveKnowledgeSource } from "../lib/ai/jobs";
import { retrieveKnowledge } from "../lib/ai/retrieval";
import { qdrantConfigured, searchQdrant } from "../lib/ai/qdrant";
import { embedText } from "../lib/ai/embeddings";
import { llmConfigured } from "../lib/ai/providers";
import { DEFAULT_ORGANIZATION_ID } from "../types";
import { newId } from "../lib/id";

const ORG_B = "org_b";

describe("learn loop e2e", () => {
  const ids: string[] = [];
  let customerId = "";
  let agentId = "";
  let orgBUserId = "";
  let learnedId = "";
  const nonce = `BLUE-${Date.now().toString(36).toUpperCase()}`;
  const unknownQuestion = `What is the Solvio learn-loop handoff code for probe ${nonce}?`;
  const humanAnswer = `The Solvio learn-loop handoff code for probe ${nonce} is ${nonce}. Quote that code exactly.`;

  beforeAll(async () => {
    if (!llmConfigured()) {
      throw new Error("OPENROUTER_API_KEY is required for learn-loop e2e");
    }
    if (!qdrantConfigured()) {
      throw new Error("QDRANT_URL is required for learn-loop e2e (local Compose: http://localhost:6333)");
    }
    await ensureAppDefaults();
    const customer = await prisma.user.create({
      data: {
        id: newId(),
        name: "Learn Loop Customer",
        email: `learn-cust-${Date.now()}@solvio.local`,
        emailVerified: true,
        role: "CUSTOMER",
        organizationId: DEFAULT_ORGANIZATION_ID,
      },
    });
    customerId = customer.id;
    ids.push(customerId);
    const agent = await prisma.user.create({
      data: {
        id: newId(),
        name: "Learn Loop Agent",
        email: `learn-agent-${Date.now()}@solvio.local`,
        emailVerified: true,
        role: "AGENT",
        organizationId: DEFAULT_ORGANIZATION_ID,
      },
    });
    agentId = agent.id;
    ids.push(agentId);
    await prisma.organization.upsert({
      where: { id: ORG_B },
      create: { id: ORG_B, name: "Org B" },
      update: {},
    });
    const other = await prisma.user.create({
      data: {
        id: newId(),
        name: "Org B Customer",
        email: `learn-orgb-${Date.now()}@solvio.local`,
        emailVerified: true,
        role: "CUSTOMER",
        organizationId: ORG_B,
      },
    });
    orgBUserId = other.id;
    ids.push(orgBUserId);
  }, 30_000);

  afterAll(async () => {
    if (learnedId) {
      try {
        await deleteKnowledgeSource(learnedId);
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

  it("unknown question through ingest answers the same question", async () => {
    const matrix: { step: string; result: string; impl: string }[] = [];

    const handoff = await handleCustomerAiTurn({
      userId: customerId,
      message: unknownQuestion,
      sessionId: `learn-unknown-${Date.now()}`,
    });
    expect(handoff.handedOff).toBe(true);
    expect(handoff.aiPaused).toBe(true);
    expect(handoff.conversationId).toBeTruthy();
    expect(handoff.response.toLowerCase()).not.toContain(nonce.toLowerCase());
    matrix.push({
      step: "1 Unknown question → Human Handoff",
      result: "PASS",
      impl: "handleCustomerAiTurn + persistAiHandoff",
    });

    await prisma.message.create({
      data: {
        id: newId(),
        conversationId: handoff.conversationId!,
        senderId: agentId,
        body: humanAnswer,
        attachmentIds: [],
        readBy: [agentId],
        role: "HUMAN",
      },
    });
    const human = await prisma.message.findFirst({
      where: { conversationId: handoff.conversationId, role: "HUMAN" },
    });
    expect(human?.body).toContain(nonce);
    matrix.push({ step: "2 Human Agent replies", result: "PASS", impl: "Message.role HUMAN (sendMessageAction shape)" });

    await prisma.conversation.update({
      where: { id: handoff.conversationId! },
      data: { status: "CLOSED", aiPaused: false, agentId },
    });
    const closed = await prisma.conversation.findUnique({ where: { id: handoff.conversationId! } });
    expect(closed?.status).toBe("CLOSED");
    matrix.push({ step: "3 Conversation is resolved", result: "PASS", impl: "closeConversationAction / Conversation.status CLOSED" });

    const candidate = await extractConversationKnowledge(handoff.conversationId!);
    expect(candidate).toBeTruthy();
    expect(candidate!.type).toBe("CONVERSATION");
    expect(candidate!.status).toBe("PENDING_REVIEW");
    const meta = (candidate!.metadata || {}) as Record<string, unknown>;
    expect(meta.sourceConversationId).toBe(handoff.conversationId);
    expect(meta.origin).toBe("RESOLVED_CHAT");
    expect(meta.resolvedBy).toBe(agentId);
    expect(candidate!.question).toBeTruthy();
    expect(candidate!.answer).toBeTruthy();
    expect(candidate!.tags).toContain("conversation-learn");
    learnedId = candidate!.id;
    matrix.push({
      step: "4 Knowledge candidate is extracted",
      result: "PASS",
      impl: "extractConversationKnowledge",
    });

    await approveKnowledgeSource(learnedId, { wait: true });
    const ready = await prisma.knowledgeSource.findUnique({ where: { id: learnedId } });
    expect(ready?.status).toBe("READY");
    expect(ready?.type).toBe("CONVERSATION");
    matrix.push({
      step: "5 Admin approval works",
      result: "PASS",
      impl: "approveKnowledgeSource → enqueueIndexJob/runIndexJob",
    });

    expect(ready?.organizationId).toBe(DEFAULT_ORGANIZATION_ID);
    const chunks = await prisma.knowledgeChunk.findMany({ where: { sourceId: learnedId } });
    expect(chunks.length).toBeGreaterThan(0);
    matrix.push({
      step: "6 Approved knowledge stored in PostgreSQL",
      result: "PASS",
      impl: "ingestSource persistChunks → knowledge_chunks",
    });

    const embedded = chunks.filter((c) => c.embeddingStatus === "READY" && c.embedding.length === 1536);
    expect(embedded.length).toBeGreaterThan(0);
    matrix.push({
      step: "7 Embedding is generated",
      result: "PASS",
      impl: "embedTexts openai/text-embedding-3-small 1536-d",
    });

    const vector = await embedText(unknownQuestion);
    expect(vector?.length).toBe(1536);
    const pointsA = await searchQdrant(vector!, 8, { organizationId: DEFAULT_ORGANIZATION_ID });
    const hitA = (pointsA || []).find((p) => String((p.payload as { sourceId?: string } | undefined)?.sourceId) === learnedId);
    expect(hitA).toBeTruthy();
    const payloadA = hitA!.payload as {
      organizationId?: string;
      sourceId?: string;
      knowledgeId?: string;
      sourceConversationId?: string;
      resolvedBy?: string;
      status?: string;
    };
    expect(String(payloadA.organizationId)).toBe(DEFAULT_ORGANIZATION_ID);
    expect(String(payloadA.sourceId)).toBe(learnedId);
    expect(String(payloadA.knowledgeId)).toBe(learnedId);
    expect(payloadA.sourceConversationId).toBe(handoff.conversationId);
    expect(payloadA.resolvedBy).toBe(agentId);
    expect(payloadA.status).toBe("READY");
    const pointsB = await searchQdrant(vector!, 8, { organizationId: ORG_B });
    expect((pointsB || []).some((p) => String((p.payload as { sourceId?: string } | undefined)?.sourceId) === learnedId)).toBe(
      false,
    );
    matrix.push({ step: "8 Qdrant is indexed", result: "PASS", impl: "upsertQdrantPoints + searchQdrant" });

    const again = await handleCustomerAiTurn({
      userId: customerId,
      message: unknownQuestion,
      sessionId: `learn-repeat-${Date.now()}`,
    });
    expect(again.handedOff).toBe(false);
    expect(again.knowledgeSufficient).toBe(true);
    expect(again.response).toContain(nonce);
    expect(again.sources.every((s) => s.title === "Verified support knowledge")).toBe(true);
    expect(JSON.stringify(again.sources)).not.toContain(handoff.conversationId);
    matrix.push({
      step: "9–10 Same question → AI answers from learned knowledge",
      result: "PASS",
      impl: "retrieveKnowledge + answerQuestion",
    });

    const paraphrase = await handleCustomerAiTurn({
      userId: customerId,
      message: `What's the process for looking up the Solvio learn-loop handoff code for probe ${nonce}?`,
      sessionId: `learn-paraphrase-${Date.now()}`,
    });
    expect(paraphrase.handedOff).toBe(false);
    expect(paraphrase.knowledgeSufficient).toBe(true);
    expect(paraphrase.response).toContain(nonce);
    matrix.push({
      step: "5 Similar wording → AI answers from approved knowledge",
      result: "PASS",
      impl: "handleCustomerAiTurn paraphrase",
    });

    const differentWording = await handleCustomerAiTurn({
      userId: customerId,
      message: `I need the Solvio learn-loop handoff code used for probe ${nonce}.`,
      sessionId: `learn-wording-${Date.now()}`,
    });
    expect(differentWording.handedOff).toBe(false);
    expect(differentWording.knowledgeSufficient).toBe(true);
    expect(differentWording.response).toContain(nonce);
    matrix.push({
      step: "6 Different wording → approved knowledge retrieved",
      result: "PASS",
      impl: "handleCustomerAiTurn second paraphrase",
    });

    const orgBHits = await retrieveKnowledge({
      query: unknownQuestion,
      filters: { organizationId: ORG_B },
    });
    expect(orgBHits.hits.every((h) => h.sourceId !== learnedId)).toBe(true);
    const orgBTurn = await handleCustomerAiTurn({
      userId: orgBUserId,
      message: unknownQuestion,
      sessionId: `learn-orgb-${Date.now()}`,
    });
    expect(orgBTurn.handedOff).toBe(true);
    expect(orgBTurn.response).not.toContain(nonce);
    matrix.push({
      step: "11 Organization isolation is preserved",
      result: "PASS",
      impl: "User.organizationId + retrieveKnowledge org filter",
    });

    const nonsense = await handleCustomerAiTurn({
      userId: customerId,
      message: "What is the unpublished Solvio nebula launch date for Project Quasar?",
      sessionId: `learn-nonsense-${Date.now()}`,
    });
    expect(nonsense.handedOff).toBe(true);
    expect(nonsense.response.toLowerCase()).not.toMatch(/nebula launch date is/);
    expect(nonsense.response).not.toContain(nonce);
    matrix.push({
      step: "12 No hallucinated answer when knowledge is insufficient",
      result: "PASS",
      impl: "knowledgeIsSufficient + groundedPrompt",
    });

    console.info("[learn-loop matrix]\n" + matrix.map((r) => `${r.result}\t${r.step}\t${r.impl}`).join("\n"));
    expect(
      matrix.filter((r) => r.result !== "PASS"),
      JSON.stringify(matrix, null, 2),
    ).toEqual([]);
  }, 300_000);

  it("does not extract from open chats or closed chats without a human reply", async () => {
    const openConv = await prisma.conversation.create({
      data: {
        id: newId(),
        customerId,
        organizationId: DEFAULT_ORGANIZATION_ID,
        status: "OPEN",
      },
    });
    await prisma.message.create({
      data: {
        id: newId(),
        conversationId: openConv.id,
        senderId: agentId,
        body: "This should not be learned while open.",
        attachmentIds: [],
        readBy: [agentId],
        role: "HUMAN",
      },
    });
    expect(await extractConversationKnowledge(openConv.id)).toBeNull();

    const closedNoHuman = await prisma.conversation.create({
      data: {
        id: newId(),
        customerId,
        organizationId: DEFAULT_ORGANIZATION_ID,
        status: "CLOSED",
      },
    });
    await prisma.message.create({
      data: {
        id: newId(),
        conversationId: closedNoHuman.id,
        senderId: customerId,
        body: "Still waiting.",
        attachmentIds: [],
        readBy: [customerId],
        role: "CUSTOMER",
      },
    });
    expect(await extractConversationKnowledge(closedNoHuman.id)).toBeNull();
  }, 30_000);

  it("strips email and tokens from chat-learned Q&A before ingest", async () => {
    const conv = await prisma.conversation.create({
      data: {
        id: newId(),
        customerId,
        organizationId: DEFAULT_ORGANIZATION_ID,
        status: "CLOSED",
        agentId,
      },
    });
    await prisma.message.createMany({
      data: [
        {
          id: newId(),
          conversationId: conv.id,
          senderId: customerId,
          body: "How do I reset my widget password? Email me at leak-chat@example.com",
          attachmentIds: [],
          readBy: [customerId],
          role: "CUSTOMER",
        },
        {
          id: newId(),
          conversationId: conv.id,
          senderId: agentId,
          body: "Open Settings → Security → Reset Password, then follow the email. Never share token sk-or-abcdefghijklmnop or +1-555-010-9999.",
          attachmentIds: [],
          readBy: [agentId],
          role: "HUMAN",
        },
      ],
    });
    const candidate = await extractConversationKnowledge(conv.id);
    expect(candidate).toBeTruthy();
    const blob = `${candidate!.question}\n${candidate!.answer}\n${candidate!.title}`;
    expect(blob).not.toMatch(/leak-chat@example.com/i);
    expect(blob).not.toMatch(/sk-or-abcdefghijklmnop/i);
    expect(blob).not.toMatch(/555-010-9999/);
    if (candidate) {
      await approveKnowledgeSource(candidate.id, { wait: true });
      const chunks = await prisma.knowledgeChunk.findMany({ where: { sourceId: candidate.id } });
      const indexed = chunks.map((c) => c.text).join("\n");
      expect(indexed).not.toMatch(/leak-chat@example.com/i);
      expect(indexed).not.toMatch(/sk-or-abcdefghijklmnop/i);
      const vector = await embedText("How do I reset my widget password?");
      const points = vector ? await searchQdrant(vector, 8, { organizationId: DEFAULT_ORGANIZATION_ID }) : [];
      const hit = (points || []).find((p) => String((p.payload as { sourceId?: string })?.sourceId) === candidate.id);
      if (hit) {
        const text = String((hit.payload as { text?: string }).text || "");
        expect(text).not.toMatch(/leak-chat@example.com/i);
        expect(text).not.toMatch(/sk-or-abcdefghijklmnop/i);
      }
      await deleteKnowledgeSource(candidate.id);
    }
  }, 300_000);

  it("does not retrieve REJECTED conversation knowledge", async () => {
    const rejectedId = newId();
    await prisma.knowledgeSource.create({
      data: {
        id: rejectedId,
        organizationId: DEFAULT_ORGANIZATION_ID,
        type: "CONVERSATION",
        title: `Rejected probe ${nonce}`,
        status: "REJECTED",
        question: `Rejected unique probe ${nonce}`,
        answer: "Should never be retrieved after rejection.",
        createdBy: agentId,
        chunkCount: 0,
      },
    });
    const hits = await retrieveKnowledge({
      query: `Rejected unique probe ${nonce}`,
      filters: { organizationId: DEFAULT_ORGANIZATION_ID },
    });
    expect(hits.hits.every((h) => h.sourceId !== rejectedId)).toBe(true);
    await prisma.knowledgeSource.delete({ where: { id: rejectedId } }).catch(() => undefined);
  }, 30_000);

  it("does not retrieve PENDING_REVIEW conversation knowledge", async () => {
    const pendingId = newId();
    await prisma.knowledgeSource.create({
      data: {
        id: pendingId,
        organizationId: DEFAULT_ORGANIZATION_ID,
        type: "CONVERSATION",
        title: `Pending probe ${nonce}`,
        status: "PENDING_REVIEW",
        question: `Pending unique probe ${nonce}`,
        answer: "Should never be retrieved before approval.",
        createdBy: agentId,
        chunkCount: 0,
      },
    });
    const hits = await retrieveKnowledge({
      query: `Pending unique probe ${nonce}`,
      filters: { organizationId: DEFAULT_ORGANIZATION_ID },
    });
    expect(hits.hits.every((h) => h.sourceId !== pendingId)).toBe(true);
    await prisma.knowledgeSource.delete({ where: { id: pendingId } }).catch(() => undefined);
  }, 30_000);
});
