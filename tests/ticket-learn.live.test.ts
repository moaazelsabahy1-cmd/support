/**
 * Resolved ticket → knowledge proof. Fails if OpenRouter/Qdrant are not configured.
 * Never logs API keys.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, ensureAppDefaults, nextTicketNumber } from "../lib/db";
import { deleteKnowledgeSource } from "../lib/ai/ingest";
import { handleCustomerAiTurn } from "../lib/ai/customer-turn";
import { extractTicketKnowledge } from "../lib/ai/learn";
import { approveKnowledgeSource } from "../lib/ai/jobs";
import { retrieveKnowledge } from "../lib/ai/retrieval";
import { qdrantConfigured, searchQdrant } from "../lib/ai/qdrant";
import { embedText } from "../lib/ai/embeddings";
import { llmConfigured } from "../lib/ai/providers";
import { DEFAULT_ORGANIZATION_ID } from "../types";
import { newId } from "../lib/id";

const ORG_B = "org_b";

describe("ticket learn e2e", () => {
  const ids: string[] = [];
  let customerId = "";
  let agentId = "";
  let orgBUserId = "";
  let learnedId = "";
  let paraphraseLearnedId = "";
  let createTicketLearnedId = "";
  let connectAgentLearnedId = "";
  let ticketId = "";
  const nonce = `TIX-${Date.now().toString(36).toUpperCase()}`;
  const problem = `How do I configure feature ${nonce}?`;
  const solution = `Open Settings → Features → ${nonce} → Enable → Save. Quote ${nonce} exactly.`;

  beforeAll(async () => {
    if (!llmConfigured()) {
      throw new Error("OPENROUTER_API_KEY is required for ticket-learn e2e");
    }
    if (!qdrantConfigured()) {
      throw new Error("QDRANT_URL is required for ticket-learn e2e (local Compose: http://localhost:6333)");
    }
    await ensureAppDefaults();
    const customer = await prisma.user.create({
      data: {
        id: newId(),
        name: "Ticket Learn Customer",
        email: `tix-cust-${Date.now()}@solvio.local`,
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
        name: "Ticket Learn Agent",
        email: `tix-agent-${Date.now()}@solvio.local`,
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
        name: "Org B Ticket Customer",
        email: `tix-orgb-${Date.now()}@solvio.local`,
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
    if (paraphraseLearnedId) {
      try {
        await deleteKnowledgeSource(paraphraseLearnedId);
      } catch {
        /* ignore */
      }
    }
    if (createTicketLearnedId) {
      try {
        await deleteKnowledgeSource(createTicketLearnedId);
      } catch {
        /* ignore */
      }
    }
    if (connectAgentLearnedId) {
      try {
        await deleteKnowledgeSource(connectAgentLearnedId);
      } catch {
        /* ignore */
      }
    }
    await prisma.comment.deleteMany({ where: { ticket: { customerId: { in: ids } } } });
    await prisma.ticketHistory.deleteMany({ where: { ticket: { customerId: { in: ids } } } });
    await prisma.ticket.deleteMany({ where: { customerId: { in: ids } } });
    await prisma.message.deleteMany({ where: { conversation: { customerId: { in: ids } } } });
    await prisma.conversation.deleteMany({ where: { customerId: { in: ids } } });
    await prisma.aiChatLog.deleteMany({ where: { userId: { in: ids } } });
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }, 30_000);

  it("does not extract from open tickets or closed tickets without save", async () => {
    const open = await prisma.ticket.create({
      data: {
        id: newId(),
        number: await nextTicketNumber(),
        title: problem,
        description: `Customer secret@example.com password hunter2 token sk-or-abcdefghijklmnop cannot enable feature ${nonce}.`,
        customerId,
        assignedAgentId: agentId,
        status: "OPEN",
      },
    });
    await prisma.comment.create({
      data: { id: newId(), ticketId: open.id, authorId: agentId, body: solution, internal: false },
    });
    expect(await extractTicketKnowledge(open.id, { createdBy: agentId })).toBeNull();

    const closedNoSave = await prisma.ticket.create({
      data: {
        id: newId(),
        number: await nextTicketNumber(),
        title: "Unrelated closed ticket",
        description: "Do not learn this closed ticket.",
        customerId,
        assignedAgentId: agentId,
        status: "CLOSED",
      },
    });
    const sources = await prisma.knowledgeSource.findMany({
      where: { type: "CONVERSATION", organizationId: DEFAULT_ORGANIZATION_ID },
      select: { metadata: true },
    });
    expect(sources.every((s) => (s.metadata as { sourceTicketId?: string } | null)?.sourceTicketId !== closedNoSave.id)).toBe(
      true,
    );
  }, 30_000);

  it("saves a resolved ticket as knowledge, indexes after approve, and answers a new customer", async () => {
    ticketId = newId();
    await prisma.ticket.create({
      data: {
        id: ticketId,
        number: await nextTicketNumber(),
        title: problem,
        description: `I cannot turn on feature ${nonce}. Contact me at leak@example.com with token sk-or-abcdefghijklmnop.`,
        customerId,
        assignedAgentId: agentId,
        status: "RESOLVED",
        resolvedAt: new Date(),
      },
    });
    await prisma.comment.create({
      data: { id: newId(), ticketId, authorId: agentId, body: solution, internal: false },
    });
    await prisma.comment.create({
      data: { id: newId(), ticketId, authorId: agentId, body: "Internal debug: dump pid 999", internal: true },
    });

    const candidate = await extractTicketKnowledge(ticketId, { createdBy: agentId });
    expect(candidate).toBeTruthy();
    if (!candidate) throw new Error("expected knowledge candidate");
    expect(candidate.status).toBe("PENDING_REVIEW");
    const meta = (candidate.metadata || {}) as Record<string, unknown>;
    expect(meta.sourceTicketId).toBe(ticketId);
    expect(meta.origin).toBe("RESOLVED_TICKET");
    expect(candidate.question).toBeTruthy();
    expect(candidate.answer).toBeTruthy();
    expect(candidate.answer).toContain(nonce);
    const learnedText = `${candidate.question || ""}\n${candidate.answer || ""}`;
    expect(learnedText).not.toMatch(/leak@example.com/i);
    expect(learnedText).not.toContain("sk-or-abcdefghijklmnop");
    expect(learnedText).not.toContain("Internal debug");
    learnedId = candidate.id;

    await approveKnowledgeSource(learnedId, { wait: true });
    const ready = await prisma.knowledgeSource.findUnique({ where: { id: learnedId } });
    expect(ready?.status).toBe("READY");
    const chunks = await prisma.knowledgeChunk.findMany({ where: { sourceId: learnedId } });
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.some((c) => c.embeddingStatus === "READY" && c.embedding.length === 1536)).toBe(true);

    const vector = await embedText(`Where can I turn on feature ${nonce}?`);
    expect(vector?.length).toBe(1536);
    const pointsA = await searchQdrant(vector!, 8, { organizationId: DEFAULT_ORGANIZATION_ID });
    const hitA = (pointsA || []).find((p) => String((p.payload as { sourceId?: string })?.sourceId) === learnedId);
    expect(hitA).toBeTruthy();
    const payload = hitA!.payload as { organizationId?: string; sourceTicketId?: string; sourceId?: string };
    expect(payload.organizationId).toBe(DEFAULT_ORGANIZATION_ID);
    expect(payload.sourceTicketId).toBe(ticketId);

    const paraphrase = await handleCustomerAiTurn({
      userId: customerId,
      message: `Where can I turn on feature ${nonce}?`,
      sessionId: `tix-paraphrase-${Date.now()}`,
    });
    expect(paraphrase.handedOff).toBe(false);
    expect(paraphrase.knowledgeSufficient).toBe(true);
    expect(paraphrase.response).toContain(nonce);
    expect(JSON.stringify(paraphrase.sources)).not.toContain(ticketId);

    const unrelated = await handleCustomerAiTurn({
      userId: customerId,
      message: "How do I change my unpublished nebula billing constellation address?",
      sessionId: `tix-unrelated-${Date.now()}`,
    });
    expect(unrelated.handedOff).toBe(true);
    expect(unrelated.response).not.toContain(nonce);

    const orgBHits = await retrieveKnowledge({
      query: `Where can I turn on feature ${nonce}?`,
      filters: { organizationId: ORG_B },
    });
    expect(orgBHits.hits.every((h) => h.sourceId !== learnedId)).toBe(true);
    const orgBTurn = await handleCustomerAiTurn({
      userId: orgBUserId,
      message: `Where can I turn on feature ${nonce}?`,
      sessionId: `tix-orgb-${Date.now()}`,
    });
    expect(orgBTurn.handedOff).toBe(true);
    expect(orgBTurn.response).not.toContain(nonce);
  }, 300_000);

  it("answers a paraphrased question that does not contain the answer token", async () => {
    const topic = "Blue Falcon notifications";
    const tId = newId();
    await prisma.ticket.create({
      data: {
        id: tId,
        number: await nextTicketNumber(),
        title: `How do I enable ${topic}?`,
        description: `I cannot find where to turn on ${topic}. Marker ${nonce}.`,
        customerId,
        assignedAgentId: agentId,
        status: "RESOLVED",
        resolvedAt: new Date(),
      },
    });
    await prisma.comment.create({
      data: {
        id: newId(),
        ticketId: tId,
        authorId: agentId,
        body: `Open Settings → Notifications → Blue Falcon → Enable. Then quote ${nonce} in the confirmation.`,
        internal: false,
      },
    });
    const candidate = await extractTicketKnowledge(tId, { createdBy: agentId });
    expect(candidate).toBeTruthy();
    if (!candidate) throw new Error("expected paraphrase knowledge candidate");
    paraphraseLearnedId = candidate.id;
    await approveKnowledgeSource(paraphraseLearnedId, { wait: true });
    const ready = await prisma.knowledgeSource.findUnique({ where: { id: paraphraseLearnedId } });
    expect(ready?.status).toBe("READY");
    const chunks = await prisma.knowledgeChunk.findMany({ where: { sourceId: paraphraseLearnedId } });
    expect(chunks.some((c) => c.text.includes("Answer:") && c.text.includes("Enable"))).toBe(true);

    const retrieved = await retrieveKnowledge({
      query: "Where can I turn on Blue Falcon notifications?",
      filters: { organizationId: DEFAULT_ORGANIZATION_ID },
    });
    const hit = retrieved.hits.find((h) => h.sourceId === paraphraseLearnedId);
    expect(hit).toBeTruthy();
    expect(hit!.score).toBeGreaterThanOrEqual(0.75);

    const turn = await handleCustomerAiTurn({
      userId: customerId,
      message: "Where can I turn on Blue Falcon notifications?",
      sessionId: `tix-blue-falcon-${Date.now()}`,
    });
    expect(turn.handedOff).toBe(false);
    expect(turn.knowledgeSufficient).toBe(true);
    expect(turn.response.toLowerCase()).toMatch(/settings|notifications|enable|blue falcon/);

    const unrelated = await handleCustomerAiTurn({
      userId: customerId,
      message: "How do I change my unpublished nebula billing constellation address?",
      sessionId: `tix-blue-unrelated-${Date.now()}`,
    });
    expect(unrelated.handedOff).toBe(true);
  }, 300_000);

  it("retrieves How do I create a ticket? at or above 0.75 after question-only embeddings", async () => {
    createTicketLearnedId = newId();
    await prisma.knowledgeSource.create({
      data: {
        id: createTicketLearnedId,
        organizationId: DEFAULT_ORGANIZATION_ID,
        type: "CONVERSATION",
        title: "How do I create a ticket?",
        status: "PENDING",
        question: "How do I create a ticket?",
        answer:
          "To create a ticket, open the Support section and click Create Ticket. Enter a clear title describing your issue, provide a detailed description of the problem, select the appropriate category and priority, then click Submit Ticket.",
        tags: ["ticket-learn", "conversation-learn"],
        createdBy: agentId,
        chunkCount: 0,
        metadata: { origin: "RESOLVED_TICKET", sourceTicketId: "diag-create-ticket" },
      },
    });
    await approveKnowledgeSource(createTicketLearnedId, { wait: true });
    const ready = await prisma.knowledgeSource.findUnique({ where: { id: createTicketLearnedId } });
    expect(ready?.status).toBe("READY");

    const retrieved = await retrieveKnowledge({
      query: "How do I create a ticket?",
      filters: { organizationId: DEFAULT_ORGANIZATION_ID },
    });
    const hit = retrieved.hits.find((h) => h.sourceId === createTicketLearnedId);
    expect(hit).toBeTruthy();
    expect(hit!.score).toBeGreaterThanOrEqual(0.75);

    const paraphrase = await retrieveKnowledge({
      query: "Where can I submit a new support request?",
      filters: { organizationId: DEFAULT_ORGANIZATION_ID },
    });
    const paraphraseHit = paraphrase.hits.find((h) => h.sourceId === createTicketLearnedId);
    expect(paraphraseHit).toBeTruthy();
    expect(paraphraseHit!.score).toBeGreaterThanOrEqual(0.75);

    const openTicket = await retrieveKnowledge({
      query: "How can I open a new support ticket?",
      filters: { organizationId: DEFAULT_ORGANIZATION_ID },
    });
    const openHit = openTicket.hits.find((h) => h.sourceId === createTicketLearnedId);
    expect(openHit).toBeTruthy();
    expect(openHit!.score).toBeGreaterThanOrEqual(0.75);

    const paraphraseTurn = await handleCustomerAiTurn({
      userId: customerId,
      message: "Where can I submit a new support request?",
      sessionId: `tix-create-para-${Date.now()}`,
    });
    expect(paraphraseTurn.handedOff).toBe(false);
    expect(paraphraseTurn.knowledgeSufficient).toBe(true);

    const turn = await handleCustomerAiTurn({
      userId: customerId,
      message: "How do I create a ticket?",
      sessionId: `tix-create-${Date.now()}`,
    });
    expect(turn.handedOff).toBe(false);
    expect(turn.knowledgeSufficient).toBe(true);
    expect(turn.response.toLowerCase()).toMatch(/support|create ticket|submit/);

    const unrelated = await handleCustomerAiTurn({
      userId: customerId,
      message: "How do I change my unpublished nebula billing constellation address?",
      sessionId: `tix-create-unrelated-${Date.now()}`,
    });
    expect(unrelated.handedOff).toBe(true);
  }, 300_000);

  it("retrieves how-to-reach-an-agent paraphrases at or above 0.75", async () => {
    connectAgentLearnedId = newId();
    await prisma.knowledgeSource.create({
      data: {
        id: connectAgentLearnedId,
        organizationId: DEFAULT_ORGANIZATION_ID,
        type: "CONVERSATION",
        title: "How can I connect with an agent?",
        status: "PENDING",
        question: "How can I connect with an agent?",
        answer: 'To connect with a support agent, open the chat and select "Talk to an Agent".',
        tags: ["conversation-learn"],
        createdBy: agentId,
        chunkCount: 0,
        metadata: { origin: "RESOLVED_CHAT", sourceConversationId: "diag-connect-agent" },
      },
    });
    await approveKnowledgeSource(connectAgentLearnedId, { wait: true });
    const ready = await prisma.knowledgeSource.findUnique({ where: { id: connectAgentLearnedId } });
    expect(ready?.status).toBe("READY");
    expect(ready?.type).toBe("CONVERSATION");

    for (const query of [
      "How do I talk to a human?",
      "I need to contact an agent",
      "How can I reach support?",
      "Where can I talk to customer service?",
    ]) {
      const retrieved = await retrieveKnowledge({
        query,
        filters: { organizationId: DEFAULT_ORGANIZATION_ID },
      });
      const hit = retrieved.hits.find((h) => h.sourceId === connectAgentLearnedId);
      expect(hit, query).toBeTruthy();
      expect(hit!.score, query).toBeGreaterThanOrEqual(0.75);
    }

    const howTo = await handleCustomerAiTurn({
      userId: customerId,
      message: "How do I talk to a human?",
      sessionId: `tix-agent-howto-${Date.now()}`,
    });
    expect(howTo.handedOff).toBe(false);
    expect(howTo.knowledgeSufficient).toBe(true);
  }, 300_000);
});
