import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { HANDOFF_AGENT_ACCOUNTS, postLoginPath } from "../lib/demo-accounts";
import { MAX_HANDOFF_AGENTS, publicHandoffAgentCards } from "../lib/ai/handoff-queue";
import { DEFAULT_ORGANIZATION_ID } from "../types";

describe("four handoff agents", () => {
  it("defines four real agent accounts and labels Agent 1–4", () => {
    expect(HANDOFF_AGENT_ACCOUNTS).toHaveLength(4);
    expect(MAX_HANDOFF_AGENTS).toBe(4);
    const cards = publicHandoffAgentCards(HANDOFF_AGENT_ACCOUNTS.map((a, i) => ({ id: `id-${i}`, name: a.name })));
    expect(cards.map((c) => c.label)).toEqual(["Agent 1", "Agent 2", "Agent 3", "Agent 4"]);
  });

  it("renders every API agent card instead of a two-agent slice", () => {
    const picker = readFileSync(path.join(process.cwd(), "components/chat/agent-picker.tsx"), "utf8");
    expect(picker).toMatch(/data-agent-card=\{agent\.ordinal\}/);
    expect(picker).not.toMatch(/slice\(0,\s*2\)/);
    expect(picker).not.toMatch(/take:\s*2/);
    const chat = readFileSync(path.join(process.cwd(), "components/chat/chat-app.tsx"), "utf8");
    expect(chat).toMatch(/joinConversationRoom/);
    expect(chat).toMatch(/Type your message/);
    const board = readFileSync(path.join(process.cwd(), "components/agent/agent-board.tsx"), "utf8");
    expect(board).toMatch(/handoff:unavailable/);
  });

  it("exposes requested agent on conversation list and Human Request inbox copy", () => {
    const list = readFileSync(path.join(process.cwd(), "actions/messages.ts"), "utf8");
    expect(list).toMatch(/currentAgent:\s*\{\s*select:\s*\{\s*id:\s*true,\s*name:\s*true/);
    const card = readFileSync(path.join(process.cwd(), "components/chat/human-request-card.tsx"), "utf8");
    expect(card).toMatch(/Human Request/);
    expect(card).toMatch(/Requested Agent/);
    expect(card).toMatch(/Pending/);
    const board = readFileSync(path.join(process.cwd(), "components/agent/agent-board.tsx"), "utf8");
    expect(board).toMatch(/HumanRequestCard/);
    const chat = readFileSync(path.join(process.cwd(), "components/chat/chat-app.tsx"), "utf8");
    expect(chat).toMatch(/HumanRequestCard/);
  });

  it("defines four agent emails/names and Sign In buttons for Maya/Luis/Nina/Omar", () => {
    expect(HANDOFF_AGENT_ACCOUNTS.map((a) => a.email)).toEqual([
      "agent@solvio.local",
      "agent2@solvio.local",
      "agent3@solvio.local",
      "agent4@solvio.local",
    ]);
    expect(HANDOFF_AGENT_ACCOUNTS.map((a) => a.label)).toEqual(["Maya", "Luis", "Nina", "Omar"]);
    expect(HANDOFF_AGENT_ACCOUNTS.map((a) => a.name)).toEqual([
      "Maya Chen",
      "Luis Park",
      "Nina Okonkwo",
      "Omar Haddad",
    ]);
    const accounts = readFileSync(path.join(process.cwd(), "lib/demo-accounts.ts"), "utf8");
    expect(accounts).toMatch(/Maya/);
    expect(accounts).toMatch(/Luis/);
    expect(accounts).toMatch(/Nina/);
    expect(accounts).toMatch(/Omar/);
    expect(accounts).toMatch(/agent2@solvio\.local/);
    expect(accounts).toMatch(/agent3@solvio\.local/);
    expect(accounts).toMatch(/agent4@solvio\.local/);
    const form = readFileSync(path.join(process.cwd(), "components/auth/auth-form.tsx"), "utf8");
    expect(form).toMatch(/HANDOFF_AGENT_ACCOUNTS/);
    expect(form).toMatch(/Support Agents/);
    expect(form).toMatch(/account\.label/);
    expect(form).toMatch(/agent2@solvio\.local|account\.email/);
    expect(postLoginPath("ADMIN")).toBe("/admin");
    expect(postLoginPath("AGENT")).toBe("/agent");
    expect(postLoginPath("CUSTOMER")).toBe("/dashboard");
    expect(postLoginPath(undefined, "agent3@solvio.local")).toBe("/agent");
  });

  it("default org ACTIVE agents match HANDOFF_AGENT_ACCOUNTS and listHandoffAgents", async () => {
    const { prisma } = await import("../lib/db");
    const { listHandoffAgents } = await import("../lib/ai/handoff-queue");
    const emails = HANDOFF_AGENT_ACCOUNTS.map((a) => a.email);
    const rows = await prisma.user.findMany({
      where: { organizationId: DEFAULT_ORGANIZATION_ID, email: { in: [...emails] } },
      select: { id: true, email: true, role: true, status: true },
    });
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.role === "AGENT" && r.status === "ACTIVE")).toBe(true);
    const listed = await listHandoffAgents(DEFAULT_ORGANIZATION_ID);
    const listedEmails = listed.map((a) => a.email).sort();
    expect(listedEmails).toEqual([...emails].sort());
    expect(listed.map((a) => a.id).sort()).toEqual(rows.map((r) => r.id).sort());
  });
});
