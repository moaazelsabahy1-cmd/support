import { describe, expect, it } from "vitest";
import { chatMessageLabel, shouldAppendChatMessage } from "../lib/chat-message-label";
import { shouldSkipHandoff } from "../lib/ai/handoff";

describe("chatMessageLabel", () => {
  const customerId = "cust-1";
  const agentId = "agent-1";

  it("labels the viewer as You before any role", () => {
    expect(
      chatMessageLabel({ role: "HUMAN", senderId: agentId, viewerId: agentId, customerId }),
    ).toBe("You");
    expect(
      chatMessageLabel({ role: "CUSTOMER", senderId: customerId, viewerId: customerId, customerId }),
    ).toBe("You");
  });

  it("never labels customer-authored messages as Agent", () => {
    expect(
      chatMessageLabel({ role: "CUSTOMER", senderId: customerId, viewerId: agentId, customerId }),
    ).toBe("Customer");
    expect(
      chatMessageLabel({ role: "HUMAN", senderId: customerId, viewerId: agentId, customerId }),
    ).toBe("Customer");
    expect(
      chatMessageLabel({ role: undefined, senderId: customerId, viewerId: agentId, customerId }),
    ).toBe("Customer");
  });

  it("labels system, AI, and human agent messages", () => {
    expect(
      chatMessageLabel({ role: "SYSTEM", senderId: "ai-system", viewerId: customerId, customerId }),
    ).toBe("Handoff");
    expect(
      chatMessageLabel({ role: "AI", senderId: "ai-system", viewerId: customerId, customerId }),
    ).toBe("Assistant");
    expect(
      chatMessageLabel({ role: "HUMAN", senderId: agentId, viewerId: customerId, customerId }),
    ).toBe("Agent");
  });
});

describe("shouldSkipHandoff", () => {
  it("skips when the conversation is already paused or has a system handoff", () => {
    expect(shouldSkipHandoff({ aiPaused: true, handoffReason: "KNOWLEDGE_NOT_FOUND" })).toBe(true);
    expect(shouldSkipHandoff({ aiPaused: false, hasSystemHandoff: true })).toBe(true);
    expect(shouldSkipHandoff({ aiPaused: false, handoffReason: "CUSTOMER_REQUESTED_HUMAN" })).toBe(true);
    expect(shouldSkipHandoff({ aiPaused: false, handoffReason: null })).toBe(false);
  });
});

describe("shouldAppendChatMessage", () => {
  const active = "conv-a";
  const existing = [{ _id: "m1" }];

  it("ignores other conversations, missing ids, and duplicates", () => {
    expect(shouldAppendChatMessage(existing, { _id: "m2", conversationId: "conv-b" }, active)).toBe(false);
    expect(shouldAppendChatMessage(existing, { conversationId: active }, active)).toBe(false);
    expect(shouldAppendChatMessage(existing, { _id: "m1", conversationId: active }, active)).toBe(false);
    expect(shouldAppendChatMessage(existing, { _id: "m2", conversationId: active }, active)).toBe(true);
    expect(shouldAppendChatMessage(existing, { id: "m3", conversationId: active }, active)).toBe(true);
  });
});
