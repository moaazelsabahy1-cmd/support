/**
 * Sequential Agent 1→4 ACCEPT/DECLINE. Requires Postgres.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, ensureAppDefaults } from "../lib/db";
import { persistAiHandoff } from "../lib/ai/handoff";
import { acceptHandoff, declineHandoff, listHandoffAgents } from "../lib/ai/handoff-queue";
import { dateAtCairo } from "../lib/ai/human-support-hours";
import { AppError } from "../lib/api-response";
import { newId } from "../lib/id";

const ORG = `org_handoff_${Date.now().toString(36)}`;

describe("sequential human handoff", () => {
  const agentIds: string[] = [];
  let customerId = "";
  let conversationId = "";
  let handoffId = "";

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
    const conv = await prisma.conversation.create({
      data: {
        id: newId(),
        customerId,
        organizationId: ORG,
        status: "OPEN",
      },
    });
    conversationId = conv.id;
  }, 30_000);

  afterAll(async () => {
    await prisma.agentHandoffAttempt.deleteMany({ where: { handoff: { conversationId } } }).catch(() => undefined);
    await prisma.humanHandoff.deleteMany({ where: { conversationId } }).catch(() => undefined);
    await prisma.message.deleteMany({ where: { conversationId } }).catch(() => undefined);
    await prisma.conversation.deleteMany({ where: { id: conversationId } }).catch(() => undefined);
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

  it("returns the existing handoff on a duplicate Send Request", async () => {
    const conv = await prisma.conversation.create({
      data: { id: newId(), customerId, organizationId: ORG, status: "OPEN" },
    });
    await persistAiHandoff({
      userId: customerId,
      conversationId: conv.id,
      sessionId: `handoff-dup-${Date.now()}`,
      reason: "CUSTOMER_REQUESTED_HUMAN",
      lastQuestion: "Talk to Human",
      turnKey: `handoff:dup-a:${Date.now()}`,
      startAgentId: agentIds[0],
    });
    const first = await prisma.humanHandoff.findUniqueOrThrow({ where: { conversationId: conv.id } });
    await persistAiHandoff({
      userId: customerId,
      conversationId: conv.id,
      sessionId: `handoff-dup-${Date.now()}`,
      reason: "CUSTOMER_REQUESTED_HUMAN",
      lastQuestion: "Talk to Human",
      turnKey: `handoff:dup-b:${Date.now()}`,
      startAgentId: agentIds[1],
    });
    expect(await prisma.humanHandoff.count({ where: { conversationId: conv.id } })).toBe(1);
    const again = await prisma.humanHandoff.findUniqueOrThrow({ where: { conversationId: conv.id } });
    expect(again.id).toBe(first.id);
    expect(again.currentAgentId).toBe(agentIds[0]);
    await prisma.agentHandoffAttempt.deleteMany({ where: { handoffId: first.id } });
    await prisma.humanHandoff.delete({ where: { id: first.id } });
    await prisma.message.deleteMany({ where: { conversationId: conv.id } });
    await prisma.conversation.delete({ where: { id: conv.id } });
  }, 30_000);

  it("offers Agent 1 then 2 on decline, accepts once, and never wraps", async () => {
    const queue = await listHandoffAgents(ORG);
    expect(queue.map((a) => a.id)).toEqual(agentIds);

    await persistAiHandoff({
      userId: customerId,
      conversationId,
      sessionId: `handoff-seq-${Date.now()}`,
      reason: "CUSTOMER_REQUESTED_HUMAN",
      lastQuestion: "Talk to Human",
      turnKey: `handoff:seq:${Date.now()}`,
      startAgentId: agentIds[0],
    });
    const offered = await prisma.humanHandoff.findUniqueOrThrow({ where: { conversationId } });
    handoffId = offered.id;
    expect(offered.status).toBe("OFFERED");
    expect(offered.currentAgentId).toBe(agentIds[0]);
    expect(offered.currentAttempt).toBe(1);

    try {
      await acceptHandoff(handoffId, agentIds[1]);
      throw new Error("agent 2 must not accept while offered to agent 1");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).status).toBe(409);
    }

    await declineHandoff(handoffId, agentIds[0]);
    const second = await prisma.humanHandoff.findUniqueOrThrow({ where: { id: handoffId } });
    expect(second.currentAgentId).toBe(agentIds[1]);
    expect(second.currentAttempt).toBe(2);

    await acceptHandoff(handoffId, agentIds[1]);
    const accepted = await prisma.humanHandoff.findUniqueOrThrow({ where: { id: handoffId } });
    expect(accepted.status).toBe("ACCEPTED");
    const conv = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    expect(conv.agentId).toBe(agentIds[1]);
    expect(conv.aiPaused).toBe(true);

    try {
      await acceptHandoff(handoffId, agentIds[0]);
      throw new Error("agent 1 must not accept after agent 2");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).status).toBe(409);
    }
  }, 60_000);

  it("reaches NO_AGENT_AVAILABLE after four declines and does not loop", async () => {
    const conv = await prisma.conversation.create({
      data: { id: newId(), customerId, organizationId: ORG, status: "OPEN" },
    });
    await persistAiHandoff({
      userId: customerId,
      conversationId: conv.id,
      sessionId: `handoff-none-${Date.now()}`,
      reason: "KNOWLEDGE_NOT_FOUND",
      lastQuestion: "Need a human",
      turnKey: `handoff:none:${Date.now()}`,
    });
    const row = await prisma.humanHandoff.findUniqueOrThrow({ where: { conversationId: conv.id } });
    for (let i = 0; i < 4; i++) {
      const current = await prisma.humanHandoff.findUniqueOrThrow({ where: { id: row.id } });
      expect(current.status).toBe("OFFERED");
      await declineHandoff(row.id, current.currentAgentId!);
    }
    const done = await prisma.humanHandoff.findUniqueOrThrow({ where: { id: row.id } });
    expect(done.status).toBe("NO_AGENT_AVAILABLE");
    expect(done.currentAgentId).toBeNull();
    await prisma.agentHandoffAttempt.deleteMany({ where: { handoffId: row.id } });
    await prisma.humanHandoff.delete({ where: { id: row.id } });
    await prisma.message.deleteMany({ where: { conversationId: conv.id } });
    await prisma.conversation.delete({ where: { id: conv.id } });
  }, 60_000);

  it("starts at Agent 3 then 4 then NO_AGENT_AVAILABLE with no wrap", async () => {
    const conv = await prisma.conversation.create({
      data: { id: newId(), customerId, organizationId: ORG, status: "OPEN" },
    });
    await persistAiHandoff({
      userId: customerId,
      conversationId: conv.id,
      sessionId: `handoff-start3-${Date.now()}`,
      reason: "CUSTOMER_REQUESTED_HUMAN",
      lastQuestion: "Talk to Human",
      turnKey: `handoff:start3:${Date.now()}`,
      startAgentId: agentIds[2],
    });
    const row = await prisma.humanHandoff.findUniqueOrThrow({ where: { conversationId: conv.id } });
    expect(row.currentAgentId).toBe(agentIds[2]);
    expect(row.currentAttempt).toBe(3);
    await declineHandoff(row.id, agentIds[2]);
    const fourth = await prisma.humanHandoff.findUniqueOrThrow({ where: { id: row.id } });
    expect(fourth.currentAgentId).toBe(agentIds[3]);
    expect(fourth.currentAttempt).toBe(4);
    await declineHandoff(row.id, agentIds[3]);
    const done = await prisma.humanHandoff.findUniqueOrThrow({ where: { id: row.id } });
    expect(done.status).toBe("NO_AGENT_AVAILABLE");
    expect(done.currentAgentId).toBeNull();
    await prisma.agentHandoffAttempt.deleteMany({ where: { handoffId: row.id } });
    await prisma.humanHandoff.delete({ where: { id: row.id } });
    await prisma.message.deleteMany({ where: { conversationId: conv.id } });
    await prisma.conversation.delete({ where: { id: conv.id } });
  }, 60_000);

  it("offers only Agent 2, then Agent 2 reply is visible on the same conversation", async () => {
    const { sendConversationMessage } = await import("../lib/chat/conversation-message");
    const { canAccessConversation } = await import("../lib/chat/conversation-access");
    const conv = await prisma.conversation.create({
      data: { id: newId(), customerId, organizationId: ORG, status: "OPEN" },
    });
    await persistAiHandoff({
      userId: customerId,
      conversationId: conv.id,
      sessionId: `handoff-agent2-${Date.now()}`,
      reason: "CUSTOMER_REQUESTED_HUMAN",
      lastQuestion: "Talk to Human",
      turnKey: `handoff:agent2:${Date.now()}`,
      startAgentId: agentIds[1],
    });
    const row = await prisma.humanHandoff.findUniqueOrThrow({ where: { conversationId: conv.id } });
    expect(await prisma.humanHandoff.count({ where: { conversationId: conv.id } })).toBe(1);
    expect(row.customerId).toBe(customerId);
    expect(row.currentAgentId).toBe(agentIds[1]);
    expect(row.status).toBe("OFFERED");
    expect(
      await prisma.humanHandoff.count({
        where: { conversationId: conv.id, currentAgentId: agentIds[0], status: "OFFERED" },
      }),
    ).toBe(0);
    const loaded = await prisma.conversation.findUniqueOrThrow({
      where: { id: conv.id },
      include: { humanHandoff: true },
    });
    expect(canAccessConversation({ id: agentIds[1], role: "AGENT" }, loaded)).toBe(true);
    expect(canAccessConversation({ id: agentIds[0], role: "AGENT" }, loaded)).toBe(false);

    await expect(
      sendConversationMessage({
        user: { id: agentIds[1], role: "AGENT" },
        conversationId: conv.id,
        body: "Hello before accept",
      }),
    ).rejects.toMatchObject({ status: 403 });

    await acceptHandoff(row.id, agentIds[1]);
    const accepted = await prisma.conversation.findUniqueOrThrow({ where: { id: conv.id } });
    expect(accepted.agentId).toBe(agentIds[1]);
    expect(accepted.aiPaused).toBe(true);

    await expect(
      sendConversationMessage({
        user: { id: agentIds[0], role: "AGENT" },
        conversationId: conv.id,
        body: "Agent 1 should not reply here",
      }),
    ).rejects.toMatchObject({ status: 403 });

    const reply = await sendConversationMessage({
      user: { id: agentIds[1], role: "AGENT" },
      conversationId: conv.id,
      body: "Hello, I'm Agent 2. I'll help you with this.",
    });
    expect(reply.body).toMatch(/Agent 2/);
    const visible = await prisma.message.findMany({
      where: { conversationId: conv.id, internal: false, role: "HUMAN" },
    });
    expect(visible.some((m) => m.body.includes("I'll help you with this"))).toBe(true);
    expect(visible[0]?.senderId).toBe(agentIds[1]);

    await persistAiHandoff({
      userId: customerId,
      conversationId: conv.id,
      sessionId: `handoff-agent2-dup-${Date.now()}`,
      reason: "CUSTOMER_REQUESTED_HUMAN",
      lastQuestion: "Talk to Human again",
      turnKey: `handoff:agent2-dup:${Date.now()}`,
      startAgentId: agentIds[0],
    });
    expect(await prisma.humanHandoff.count({ where: { conversationId: conv.id } })).toBe(1);
    const still = await prisma.humanHandoff.findUniqueOrThrow({ where: { conversationId: conv.id } });
    expect(still.id).toBe(row.id);
    expect(still.currentAgentId).toBe(agentIds[1]);

    await prisma.agentHandoffAttempt.deleteMany({ where: { handoffId: row.id } });
    await prisma.humanHandoff.delete({ where: { id: row.id } });
    await prisma.message.deleteMany({ where: { conversationId: conv.id } });
    await prisma.conversation.delete({ where: { id: conv.id } });
  }, 60_000);
});
