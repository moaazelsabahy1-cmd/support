/**
 * Admin reads the same Conversation/Message rows as Customer and Agent 1.
 * Requires Postgres. Does not delete seed/production data — only this test org.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, ensureAppDefaults } from "../lib/db";
import { persistAiHandoff } from "../lib/ai/handoff";
import { acceptHandoff } from "../lib/ai/handoff-queue";
import { sendConversationMessage } from "../lib/chat/conversation-message";
import { assertCanAccessConversation, canAccessConversation } from "../lib/chat/conversation-access";
import {
  getConversationForAdmin,
  listAdminAgents,
  listConversationsForAgent,
} from "../lib/admin/agent-conversations";
import { AppError } from "../lib/api-response";
import { newId } from "../lib/id";
import { readFileSync } from "fs";
import path from "path";

const ORG = `org_admin_hist_${Date.now().toString(36)}`;

describe("admin conversation history", () => {
  const agentIds: string[] = [];
  let customerId = "";
  let otherCustomerId = "";
  let adminId = "";
  let conversationId = "";
  let handoffId = "";

  const admin = () => ({ id: adminId, role: "ADMIN" as const });

  beforeAll(async () => {
    await ensureAppDefaults();
    await prisma.organization.create({ data: { id: ORG, name: "Admin History Org" } });
    customerId = newId();
    otherCustomerId = newId();
    adminId = newId();
    await prisma.user.create({
      data: {
        id: customerId,
        name: "Customer A",
        email: `admin-hist-cust-${Date.now()}@solvio.local`,
        emailVerified: true,
        role: "CUSTOMER",
        organizationId: ORG,
      },
    });
    await prisma.user.create({
      data: {
        id: otherCustomerId,
        name: "Customer Other",
        email: `admin-hist-other-${Date.now()}@solvio.local`,
        emailVerified: true,
        role: "CUSTOMER",
        organizationId: ORG,
      },
    });
    await prisma.user.create({
      data: {
        id: adminId,
        name: "History Admin",
        email: `admin-hist-admin-${Date.now()}@solvio.local`,
        emailVerified: true,
        role: "ADMIN",
        organizationId: ORG,
      },
    });
    for (let i = 1; i <= 2; i++) {
      const id = newId();
      agentIds.push(id);
      await prisma.user.create({
        data: {
          id,
          name: `History Agent ${i}`,
          email: `admin-hist-agent-${i}-${Date.now()}@solvio.local`,
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
    const convs = await prisma.conversation.findMany({ where: { organizationId: ORG }, select: { id: true } });
    const ids = convs.map((c) => c.id);
    await prisma.humanHandoffEvent.deleteMany({ where: { conversationId: { in: ids } } }).catch(() => undefined);
    await prisma.agentHandoffAttempt.deleteMany({ where: { handoff: { conversationId: { in: ids } } } }).catch(() => undefined);
    await prisma.humanHandoff.deleteMany({ where: { conversationId: { in: ids } } }).catch(() => undefined);
    await prisma.message.deleteMany({ where: { conversationId: { in: ids } } }).catch(() => undefined);
    await prisma.conversation.deleteMany({ where: { organizationId: ORG } }).catch(() => undefined);
    const userIds = [customerId, otherCustomerId, adminId, ...agentIds];
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => undefined);
    await prisma.organization.deleteMany({ where: { id: ORG } }).catch(() => undefined);
  }, 30_000);

  it("persists customer and agent messages on one conversation and admin can read them", async () => {
    const conv = await prisma.conversation.create({
      data: { id: newId(), customerId, organizationId: ORG, status: "OPEN" },
    });
    conversationId = conv.id;
    await persistAiHandoff({
      userId: customerId,
      conversationId: conv.id,
      sessionId: `admin-hist-${Date.now()}`,
      reason: "CUSTOMER_REQUESTED_HUMAN",
      lastQuestion: "I cannot reset my password",
      turnKey: `handoff:admin-hist:${Date.now()}`,
      startAgentId: agentIds[0],
    });
    const row = await prisma.humanHandoff.findUniqueOrThrow({ where: { conversationId: conv.id } });
    handoffId = row.id;
    expect(row.currentAgentId).toBe(agentIds[0]);

    const customerMsg = await sendConversationMessage({
      user: { id: customerId, role: "CUSTOMER" },
      conversationId: conv.id,
      body: "I cannot reset my password.",
    });
    expect(customerMsg.conversationId).toBe(conv.id);

    await acceptHandoff(handoffId, agentIds[0]);
    const accepted = await prisma.conversation.findUniqueOrThrow({ where: { id: conv.id } });
    expect(accepted.agentId).toBe(agentIds[0]);

    const agentMsg = await sendConversationMessage({
      user: { id: agentIds[0], role: "AGENT" },
      conversationId: conv.id,
      body: "Sure, I'll help you with that.",
    });
    expect(agentMsg.conversationId).toBe(conv.id);

    const persisted = await prisma.message.findMany({
      where: { conversationId: conv.id, role: { in: ["CUSTOMER", "HUMAN"] } },
      orderBy: { createdAt: "asc" },
    });
    expect(persisted.map((m) => m.body)).toEqual(["I cannot reset my password.", "Sure, I'll help you with that."]);
    expect(persisted[0].senderId).toBe(customerId);
    expect(persisted[1].senderId).toBe(agentIds[0]);

    const beforeConv = await prisma.conversation.count({ where: { id: conv.id } });
    const beforeMsg = await prisma.message.count({ where: { conversationId: conv.id } });

    const listed = await listConversationsForAgent(admin(), agentIds[0]);
    expect(listed.items.some((c: { _id: string }) => c._id === conv.id)).toBe(true);
    const mine = listed.items.find((c: { _id: string; assignedAgentId?: string }) => c._id === conv.id);
    expect(mine.assignedAgentId).toBe(agentIds[0]);

    const detail = await getConversationForAdmin(admin(), conv.id, agentIds[0]);
    expect(detail._id).toBe(conv.id);
    expect(detail.humanHandoff.attempts.some((a: { status: string; order: number }) => a.status === "ACCEPTED" && a.order === 1)).toBe(true);
    const bodies = detail.messages.map((m: { body: string }) => m.body);
    expect(bodies).toContain("I cannot reset my password.");
    expect(bodies).toContain("Sure, I'll help you with that.");
    const human = detail.messages.find((m: { role: string }) => m.role === "HUMAN");
    expect(human.senderId).toBe(agentIds[0]);
    expect(detail.assignedAgentId).toBe(agentIds[0]);
    expect(detail.humanHandoff.events.some((e: { type: string }) => e.type === "ACCEPTED")).toBe(true);
    expect(detail.humanHandoff.events.some((e: { type: string }) => e.type === "CONNECTED")).toBe(true);

    expect(await prisma.conversation.count({ where: { id: conv.id } })).toBe(beforeConv);
    expect(await prisma.message.count({ where: { conversationId: conv.id } })).toBe(beforeMsg);

    const agent2List = await listConversationsForAgent(admin(), agentIds[1]);
    expect(agent2List.items.some((c: { _id: string }) => c._id === conv.id)).toBe(false);

    const loaded = await prisma.conversation.findUniqueOrThrow({
      where: { id: conv.id },
      include: { humanHandoff: true },
    });
    expect(canAccessConversation({ id: agentIds[1], role: "AGENT" }, loaded)).toBe(false);
    expect(canAccessConversation({ id: agentIds[0], role: "AGENT" }, loaded)).toBe(true);

    await expect(
      getConversationForAdmin(admin(), conv.id, agentIds[1]),
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
  }, 60_000);

  it("keeps closed conversations visible to admin and search matches message content", async () => {
    expect(conversationId).toBeTruthy();
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { status: "CLOSED" },
    });
    await prisma.humanHandoff.updateMany({
      where: { conversationId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    const listed = await listConversationsForAgent(admin(), agentIds[0]);
    const row = listed.items.find((c: { _id: string; displayStatus: string }) => c._id === conversationId);
    expect(row).toBeTruthy();
    expect(row.displayStatus).toBe("CLOSED");

    const searched = await listConversationsForAgent(admin(), agentIds[0], "cannot reset");
    expect(searched.items.some((c: { _id: string }) => c._id === conversationId)).toBe(true);

    const byEmail = await listConversationsForAgent(admin(), agentIds[0], "admin-hist-cust-");
    expect(byEmail.items.some((c: { _id: string }) => c._id === conversationId)).toBe(true);
  }, 30_000);

  it("blocks customers, other customers, agents, and unauthenticated admin APIs", async () => {
    const otherConv = await prisma.conversation.create({
      data: { id: newId(), customerId: otherCustomerId, organizationId: ORG, status: "OPEN" },
    });
    const loaded = await prisma.conversation.findUniqueOrThrow({
      where: { id: otherConv.id },
      include: { humanHandoff: true },
    });
    expect(() => assertCanAccessConversation({ id: customerId, role: "CUSTOMER" }, loaded)).toThrow(AppError);

    await expect(listConversationsForAgent({ id: customerId, role: "CUSTOMER" }, agentIds[0])).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
    await expect(listConversationsForAgent({ id: agentIds[0], role: "AGENT" }, agentIds[0])).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
    await expect(getConversationForAdmin({ id: agentIds[0], role: "AGENT" }, conversationId)).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
    await expect(listAdminAgents({ id: customerId, role: "CUSTOMER" })).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });

    const agentsRoute = readFileSync(path.join(process.cwd(), "app/api/admin/agents/route.ts"), "utf8");
    expect(agentsRoute).toMatch(/METHOD_NOT_ALLOWED/);
    expect(agentsRoute).not.toMatch(/sendConversationMessage/);
    const detailRoute = readFileSync(
      path.join(process.cwd(), "app/api/admin/conversations/[conversationId]/route.ts"),
      "utf8",
    );
    expect(detailRoute).toMatch(/GET/);
    expect(detailRoute).toMatch(/METHOD_NOT_ALLOWED/);
    expect(detailRoute).not.toMatch(/sendConversationMessage/);
  }, 30_000);

  it("records decline then OFFERED to the next agent on the same handoff", async () => {
    const { declineHandoff } = await import("../lib/ai/handoff-queue");
    const conv = await prisma.conversation.create({
      data: { id: newId(), customerId, organizationId: ORG, status: "OPEN" },
    });
    await persistAiHandoff({
      userId: customerId,
      conversationId: conv.id,
      sessionId: `admin-hist-dec-${Date.now()}`,
      reason: "CUSTOMER_REQUESTED_HUMAN",
      lastQuestion: "Need human",
      turnKey: `handoff:admin-dec:${Date.now()}`,
      startAgentId: agentIds[0],
    });
    const row = await prisma.humanHandoff.findUniqueOrThrow({ where: { conversationId: conv.id } });
    await declineHandoff(row.id, agentIds[0]);
    const done = await prisma.humanHandoff.findUniqueOrThrow({ where: { id: row.id } });
    expect(done.status).toBe("OFFERED");
    expect(done.currentAgentId).toBe(agentIds[1]);
    expect(await prisma.humanHandoff.count({ where: { conversationId: conv.id } })).toBe(1);
    const listed = await listConversationsForAgent(admin(), agentIds[0], { status: "declined" });
    expect(listed.items.some((c: { _id: string }) => c._id === conv.id)).toBe(true);
    const nextList = await listConversationsForAgent(admin(), agentIds[1]);
    expect(nextList.items.some((c: { _id: string }) => c._id === conv.id)).toBe(true);
    const detail = await getConversationForAdmin(admin(), conv.id, agentIds[0]);
    expect(detail.humanHandoff.events.some((e: { type: string }) => e.type === "DECLINED")).toBe(true);
    expect(detail.humanHandoff.events.some((e: { type: string }) => e.type === "OFFERED")).toBe(true);
  }, 60_000);
});
