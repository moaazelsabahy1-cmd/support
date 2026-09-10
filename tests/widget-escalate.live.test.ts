/**
 * Widget escalate must open sequential Agent 1 handoff, not a public ticket.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, ensureAppDefaults } from "../lib/db";
import { escalateWidgetToHuman } from "../lib/ai/widget-handoff";
import { dateAtCairo } from "../lib/ai/human-support-hours";
import { widgetGuestEmail } from "../lib/ai/widget-guest";
import { newId } from "../lib/id";
import type { ResolvedWidgetSite } from "../lib/ai/widget-site";

const ORG = `org_widget_${Date.now().toString(36)}`;

describe("widget escalate to live agents", () => {
  const sessionId = `widget-sess-${Date.now()}`;
  let agentId = "";
  let conversationId = "";
  let guestId = "";

  beforeAll(async () => {
    await ensureAppDefaults();
    await prisma.organization.create({ data: { id: ORG, name: "Widget Handoff Org" } });
    agentId = newId();
    await prisma.user.create({
      data: {
        id: agentId,
        name: "Widget Agent 1",
        email: `widget-agent-${Date.now()}@solvio.local`,
        emailVerified: true,
        role: "AGENT",
        status: "ACTIVE",
        organizationId: ORG,
      },
    });
  }, 30_000);

  afterAll(async () => {
    await prisma.agentHandoffAttempt.deleteMany({ where: { handoff: { conversationId } } }).catch(() => undefined);
    await prisma.humanHandoff.deleteMany({ where: { conversationId } }).catch(() => undefined);
    await prisma.message.deleteMany({ where: { conversationId } }).catch(() => undefined);
    await prisma.conversation.deleteMany({ where: { id: conversationId } }).catch(() => undefined);
    await prisma.notification.deleteMany({ where: { userId: { in: [agentId, guestId].filter(Boolean) } } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: [agentId, guestId].filter(Boolean) } } }).catch(() => undefined);
    await prisma.organization.deleteMany({ where: { id: ORG } }).catch(() => undefined);
  }, 30_000);

  it("does not create a handoff before Send Request / selectedAgentId", async () => {
    const site: ResolvedWidgetSite = {
      id: "widget-test-site",
      publicKey: "wk_test",
      organizationId: ORG,
      enabled: true,
      title: "Help",
      welcomeMessage: "Hi",
      assistantName: "Bot",
      logoUrl: null,
      primaryColor: "#111",
      language: "en",
      allowedOrigins: ["*"],
      envFallback: true,
    };
    const before = await prisma.humanHandoff.count();
    await expect(escalateWidgetToHuman({ site, sessionId: `${sessionId}-none`, name: "Visitor" })).rejects.toMatchObject({
      status: 400,
    });
    expect(await prisma.humanHandoff.count()).toBe(before);
  });

  it("rejects widget escalate when human support is closed", async () => {
    const site: ResolvedWidgetSite = {
      id: "widget-test-site",
      publicKey: "wk_test",
      organizationId: ORG,
      enabled: true,
      title: "Help",
      welcomeMessage: "Hi",
      assistantName: "Bot",
      logoUrl: null,
      primaryColor: "#111",
      language: "en",
      allowedOrigins: ["*"],
      envFallback: true,
    };
    const before = await prisma.humanHandoff.count();
    await expect(
      escalateWidgetToHuman({
        site,
        sessionId: `${sessionId}-closed`,
        name: "Visitor",
        selectedAgentId: agentId,
        at: dateAtCairo(2026, 1, 16, 0, 0),
      }),
    ).rejects.toMatchObject({ code: "HUMAN_SUPPORT_CLOSED", status: 403 });
    expect(await prisma.humanHandoff.count()).toBe(before);
  });

  it("creates a conversation and HumanHandoff at the selected agent, not a ticket", async () => {
    const ticketsBefore = await prisma.ticket.count();
    const site: ResolvedWidgetSite = {
      id: "widget-test-site",
      publicKey: "wk_test",
      organizationId: ORG,
      enabled: true,
      title: "Help",
      welcomeMessage: "Hi",
      assistantName: "Bot",
      logoUrl: null,
      primaryColor: "#111",
      language: "en",
      allowedOrigins: ["*"],
      envFallback: true,
    };
    const result = await escalateWidgetToHuman({ site, sessionId, name: "Visitor", selectedAgentId: agentId });
    conversationId = result.conversationId;
    const guest = await prisma.user.findUniqueOrThrow({ where: { email: widgetGuestEmail(sessionId) } });
    guestId = guest.id;
    expect(result.widgetToken).toBeTruthy();
    expect(result.handoff).toMatchObject({ currentAttempt: 1, status: "OFFERED" });
    const conv = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    expect(conv.aiPaused).toBe(true);
    expect(conv.handoffReason).toBe("CUSTOMER_REQUESTED_HUMAN");
    const handoff = await prisma.humanHandoff.findUniqueOrThrow({ where: { conversationId } });
    expect(handoff.currentAttempt).toBe(1);
    expect(handoff.currentAgentId).toBe(agentId);
    const ticketsForGuest = await prisma.ticket.count({ where: { customerId: guest.id } });
    expect(ticketsForGuest).toBe(0);
    const ticketsAfter = await prisma.ticket.count();
    expect(ticketsAfter).toBe(ticketsBefore);
  });

  it("returns the existing handoff on a duplicate widget Send Request", async () => {
    const site: ResolvedWidgetSite = {
      id: "widget-test-site",
      publicKey: "wk_test",
      organizationId: ORG,
      enabled: true,
      title: "Help",
      welcomeMessage: "Hi",
      assistantName: "Bot",
      logoUrl: null,
      primaryColor: "#111",
      language: "en",
      allowedOrigins: ["*"],
      envFallback: true,
    };
    const again = await escalateWidgetToHuman({ site, sessionId, name: "Visitor", selectedAgentId: agentId });
    expect(again.conversationId).toBe(conversationId);
    expect(await prisma.humanHandoff.count({ where: { conversationId } })).toBe(1);
  });
});
