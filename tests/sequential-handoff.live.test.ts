/**
 * Selected-agent receive + Decline wrap (no re-offer). Requires Postgres.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, ensureAppDefaults } from "../lib/db";
import { persistAiHandoff } from "../lib/ai/handoff";
import { acceptHandoff, declineHandoff, listHandoffAgents } from "../lib/ai/handoff-queue";
import { dateAtCairo } from "../lib/ai/human-support-hours";
import { canAccessConversation } from "../lib/chat/conversation-access";
import { AppError } from "../lib/api-response";
import { newId } from "../lib/id";

const ORG = `org_handoff_${Date.now().toString(36)}`;

describe("handoff receive and decline wrap", () => {
  const agentIds: string[] = [];
  let customerId = "";

  async function cleanupConv(conversationId: string) {
    await prisma.humanHandoffEvent.deleteMany({ where: { conversationId } }).catch(() => undefined);
    await prisma.agentHandoffAttempt.deleteMany({ where: { handoff: { conversationId } } }).catch(() => undefined);
    await prisma.humanHandoff.deleteMany({ where: { conversationId } }).catch(() => undefined);
    await prisma.message.deleteMany({ where: { conversationId } }).catch(() => undefined);
    await prisma.conversation.deleteMany({ where: { id: conversationId } }).catch(() => undefined);
  }

  beforeAll(async () => {
    await ensureAppDefaults();
    await prisma.organization.create({ data: { id: ORG, name: "Handoff Org" } });
    customerId = newId();
    await prisma.user.create({
      data: {
        id: customerId,
        name: "Handoff Customer",
        email: `handoff-cust-${Date.now()}@solvio.local`,
        emailVerified: true,
        role: "CUSTOMER",
        organizationId: ORG,
      },
    });
    for (let i = 1; i <= 4; i++) {
      const id = newId();
      agentIds.push(id);
      await prisma.user.create({
        data: {
          id,
          name: `Queue Agent ${i}`,
          email: `handoff-agent-${i}-${Date.now()}@solvio.local`,
          emailVerified: true,
          role: "AGENT",
          status: "ACTIVE",
          organizationId: ORG,
          createdAt: new Date(Date.now() + i * 1000),
        },
      });
    }
  }, 30_000);

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: [...agentIds, customerId] } } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: [...agentIds, customerId] } } }).catch(() => undefined);
    await prisma.organization.deleteMany({ where: { id: ORG } }).catch(() => undefined);
  }, 30_000);

  it("rejects an ineligible selected agent before creating a handoff", async () => {
    const conv = await prisma.conversation.create({
      data: { id: newId(), customerId, organizationId: ORG, status: "OPEN" },
    });
    await expect(
      persistAiHandoff({
        userId: customerId,
        conversationId: conv.id,
        sessionId: `handoff-bad-${Date.now()}`,
        reason: "CUSTOMER_REQUESTED_HUMAN",
        lastQuestion: "Talk to Human",
        turnKey: `handoff:bad:${Date.now()}`,
        startAgentId: customerId,
      }),
    ).rejects.toBeInstanceOf(AppError);
    expect(await prisma.humanHandoff.count({ where: { conversationId: conv.id } })).toBe(0);
    await prisma.conversation.delete({ where: { id: conv.id } });
  }, 30_000);

  it("rejects handoff creation when human support is closed in Africa/Cairo", async () => {
    const conv = await prisma.conversation.create({
      data: { id: newId(), customerId, organizationId: ORG, status: "OPEN" },
    });
    await expect(
      persistAiHandoff({
        userId: customerId,
        conversationId: conv.id,
        sessionId: `handoff-closed-${Date.now()}`,
        reason: "CUSTOMER_REQUESTED_HUMAN",
        lastQuestion: "Talk to Human",
        turnKey: `handoff:closed:${Date.now()}`,
        startAgentId: agentIds[0],
        at: dateAtCairo(2026, 1, 16, 2, 0),
      }),
    ).rejects.toMatchObject({ code: "HUMAN_SUPPORT_CLOSED", status: 403 });
    expect(await prisma.humanHandoff.count({ where: { conversationId: conv.id } })).toBe(0);
    await prisma.conversation.delete({ where: { id: conv.id } });
  }, 30_000);

  it.each([0, 1, 2, 3] as const)(
    "offers the selected agent index %s and only that agent can see it (A–D)",
    async (idx) => {
      const queue = await listHandoffAgents(ORG);
      expect(queue.map((a) => a.id)).toEqual(agentIds);
      const conv = await prisma.conversation.create({
        data: { id: newId(), customerId, organizationId: ORG, status: "OPEN" },
      });
      await persistAiHandoff({
        userId: customerId,
        conversationId: conv.id,
        sessionId: `handoff-sel-${idx}-${Date.now()}`,
        reason: "CUSTOMER_REQUESTED_HUMAN",
        lastQuestion: "Talk to Human",
        turnKey: `handoff:sel:${idx}:${Date.now()}`,
        startAgentId: agentIds[idx],
      });
      const row = await prisma.humanHandoff.findUniqueOrThrow({ where: { conversationId: conv.id } });
      expect(row.status).toBe("OFFERED");
      expect(row.currentAgentId).toBe(agentIds[idx]);
      expect(await prisma.humanHandoff.count({ where: { conversationId: conv.id } })).toBe(1);
      const loaded = await prisma.conversation.findUniqueOrThrow({
        where: { id: conv.id },
        include: { humanHandoff: true },
      });
      expect(canAccessConversation({ id: agentIds[idx], role: "AGENT" }, loaded)).toBe(true);
      for (let j = 0; j < 4; j++) {
        if (j === idx) continue;
        expect(canAccessConversation({ id: agentIds[j], role: "AGENT" }, loaded)).toBe(false);
      }
      await cleanupConv(conv.id);
    },
    30_000,
  );

  it("forwards Agent 2 decline to Agent 3 on the same HumanHandoff (E, H)", async () => {
    const conv = await prisma.conversation.create({
      data: { id: newId(), customerId, organizationId: ORG, status: "OPEN" },
    });
    await persistAiHandoff({
      userId: customerId,
      conversationId: conv.id,
      sessionId: `handoff-e-${Date.now()}`,
      reason: "CUSTOMER_REQUESTED_HUMAN",
      lastQuestion: "Talk to Human",
      turnKey: `handoff:e:${Date.now()}`,
      startAgentId: agentIds[1],
    });
    const row = await prisma.humanHandoff.findUniqueOrThrow({ where: { conversationId: conv.id } });
    await declineHandoff(row.id, agentIds[1]);
    const next = await prisma.humanHandoff.findUniqueOrThrow({ where: { id: row.id } });
    expect(next.status).toBe("OFFERED");
    expect(next.currentAgentId).toBe(agentIds[2]);
    expect(await prisma.humanHandoff.count({ where: { conversationId: conv.id } })).toBe(1);
    const loaded = await prisma.conversation.findUniqueOrThrow({
      where: { id: conv.id },
      include: { humanHandoff: true },
    });
    expect(canAccessConversation({ id: agentIds[2], role: "AGENT" }, loaded)).toBe(true);
    expect(canAccessConversation({ id: agentIds[1], role: "AGENT" }, loaded)).toBe(false);
    await cleanupConv(conv.id);
  }, 60_000);

  it("wraps Agent 2→3→4→1 and never re-offers Agent 2 (F)", async () => {
    const conv = await prisma.conversation.create({
      data: { id: newId(), customerId, organizationId: ORG, status: "OPEN" },
    });
    await persistAiHandoff({
      userId: customerId,
      conversationId: conv.id,
      sessionId: `handoff-f-${Date.now()}`,
      reason: "CUSTOMER_REQUESTED_HUMAN",
      lastQuestion: "Talk to Human",
      turnKey: `handoff:f:${Date.now()}`,
      startAgentId: agentIds[1],
    });
    const row = await prisma.humanHandoff.findUniqueOrThrow({ where: { conversationId: conv.id } });
    await declineHandoff(row.id, agentIds[1]);
    expect((await prisma.humanHandoff.findUniqueOrThrow({ where: { id: row.id } })).currentAgentId).toBe(agentIds[2]);
    await declineHandoff(row.id, agentIds[2]);
    expect((await prisma.humanHandoff.findUniqueOrThrow({ where: { id: row.id } })).currentAgentId).toBe(agentIds[3]);
    await declineHandoff(row.id, agentIds[3]);
    const toOne = await prisma.humanHandoff.findUniqueOrThrow({ where: { id: row.id } });
    expect(toOne.status).toBe("OFFERED");
    expect(toOne.currentAgentId).toBe(agentIds[0]);
    expect(toOne.currentAgentId).not.toBe(agentIds[1]);
    await declineHandoff(row.id, agentIds[0]);
    const done = await prisma.humanHandoff.findUniqueOrThrow({ where: { id: row.id } });
    expect(done.status).toBe("NO_AGENT_AVAILABLE");
    expect(done.currentAgentId).toBe(agentIds[0]);
    expect(await prisma.humanHandoff.count({ where: { conversationId: conv.id } })).toBe(1);
    await expect(acceptHandoff(row.id, agentIds[1])).rejects.toMatchObject({ status: 409 });
    await cleanupConv(conv.id);
  }, 60_000);

  it("lets Agent 3 accept after Agent 2 decline and send a visible message (G, H)", async () => {
    const { sendConversationMessage } = await import("../lib/chat/conversation-message");
    const conv = await prisma.conversation.create({
      data: { id: newId(), customerId, organizationId: ORG, status: "OPEN" },
    });
    await persistAiHandoff({
      userId: customerId,
      conversationId: conv.id,
      sessionId: `handoff-g-${Date.now()}`,
      reason: "CUSTOMER_REQUESTED_HUMAN",
      lastQuestion: "Talk to Human",
      turnKey: `handoff:g:${Date.now()}`,
      startAgentId: agentIds[1],
    });
    const row = await prisma.humanHandoff.findUniqueOrThrow({ where: { conversationId: conv.id } });
    await declineHandoff(row.id, agentIds[1]);
    await acceptHandoff(row.id, agentIds[2]);
    const accepted = await prisma.humanHandoff.findUniqueOrThrow({ where: { id: row.id } });
    expect(accepted.status).toBe("ACCEPTED");
    expect(accepted.currentAgentId).toBe(agentIds[2]);
    const convRow = await prisma.conversation.findUniqueOrThrow({ where: { id: conv.id } });
    expect(convRow.agentId).toBe(agentIds[2]);
    const reply = await sendConversationMessage({
      user: { id: agentIds[2], role: "AGENT" },
      conversationId: conv.id,
      body: "Hello from Agent 3 after forward.",
    });
    expect(reply.body).toMatch(/Agent 3/);
    const visible = await prisma.message.findMany({
      where: { conversationId: conv.id, internal: false, role: "HUMAN" },
    });
    expect(visible.some((m) => m.body.includes("after forward"))).toBe(true);
    expect(await prisma.humanHandoff.count({ where: { conversationId: conv.id } })).toBe(1);
    await cleanupConv(conv.id);
  }, 60_000);
});
