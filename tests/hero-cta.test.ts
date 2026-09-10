import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { customerHandoffStatusLabel, handoffStatusCopy, humanSupportStatusLine } from "../lib/ai/handoff-copy";

describe("homepage hero CTAs", () => {
  it("does not include Browse Knowledge Base in the landing hero", () => {
    const src = readFileSync(path.join(process.cwd(), "app/page.tsx"), "utf8");
    const start = src.indexOf('<section id="overview"');
    const end = src.indexOf("</section>", start);
    expect(start).toBeGreaterThan(-1);
    const hero = src.slice(start, end);
    expect(hero).not.toMatch(/Browse Knowledge Base/);
    expect(hero).toMatch(/Ask AI/);
    expect(hero).toMatch(/Talk to Human/);
  });
});

describe("Talk to Human picker UI", () => {
  it("opens an agent selection screen with Send Request instead of immediate escalate", () => {
    const assistant = readFileSync(path.join(process.cwd(), "components/ai/assistant.tsx"), "utf8");
    expect(assistant).toMatch(/AgentPicker/);
    expect(assistant).toMatch(/setPicking\(true\)/);
    expect(assistant).not.toMatch(/offerHuman \|\| json.data.handoffReason/);
    expect(assistant).not.toMatch(/offerHuman[\s\S]{0,80}setPicking\(true\)/);
    expect(assistant).toMatch(/HumanSupportHeader/);
    expect(assistant).toMatch(/Type your message/);
    expect(assistant).toMatch(/disabled=\{!supportOpen \|\| connecting\}/);
    const picker = readFileSync(path.join(process.cwd(), "components/chat/agent-picker.tsx"), "utf8");
    expect(picker).toMatch(/Choose a Support Agent/);
    expect(picker).toMatch(/Send Request/);
    expect(picker).toMatch(/data-agent-card/);
    expect(picker).toMatch(/agent\.name/);
    expect(picker).toMatch(/agent\.label/);
    const widget = readFileSync(path.join(process.cwd(), "components/marketing/ai-widget.tsx"), "utf8");
    expect(widget).toMatch(/AgentPicker/);
    expect(widget).not.toMatch(/offerHuman \|\| json.data.handoffReason/);
    expect(widget).not.toMatch(/offerHuman[\s\S]{0,80}setPicking\(true\)/);
  });
});

describe("handoffStatusCopy", () => {
  it("describes the selected agent wait, join, and none available", () => {
    expect(handoffStatusCopy({ currentAttempt: 1, status: "OFFERED" })).toBe(
      "You requested help from Agent 1. Request sent to Agent 1. Waiting for Agent 1...",
    );
    expect(handoffStatusCopy({ currentAttempt: 3, status: "OFFERED", attempts: [{ order: 3, status: "OFFERED" }] })).toBe(
      "You requested help from Agent 3. Request sent to Agent 3. Waiting for Agent 3...",
    );
    expect(handoffStatusCopy({ currentAttempt: 1, status: "ACCEPTED" })).toBe("Agent 1 has joined the conversation.");
    expect(handoffStatusCopy({ status: "NO_AGENT_AVAILABLE", currentAttempt: 4 })).toBe(
      "All human agents are currently unavailable.",
    );
    expect(customerHandoffStatusLabel("OFFERED")).toBe("PENDING");
    expect(customerHandoffStatusLabel("ACCEPTED")).toBe("ACTIVE");
    expect(customerHandoffStatusLabel("COMPLETED")).toBe("CLOSED");
    expect(humanSupportStatusLine("OFFERED")).toBe("Request Pending");
    expect(humanSupportStatusLine("ACCEPTED")).toBe("Connected");
    expect(humanSupportStatusLine("COMPLETED", true)).toBe("Conversation closed");
  });
});
