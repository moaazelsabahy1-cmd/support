import { describe, expect, it } from "vitest";
import { signWidgetToken, verifyWidgetToken, widgetGuestEmail } from "../lib/ai/widget-guest";

describe("widget guest identity", () => {
  it("maps a session to a stable guest email", () => {
    expect(widgetGuestEmail("abc-123")).toBe("guest+abc123@widget.solvio.local");
  });

  it("signs and verifies a conversation-scoped HMAC token", () => {
    const token = signWidgetToken({
      sessionId: "sess1",
      conversationId: "conv1",
      userId: "user1",
    });
    expect(verifyWidgetToken(token)).toMatchObject({
      sessionId: "sess1",
      conversationId: "conv1",
      userId: "user1",
    });
    expect(verifyWidgetToken(`${token}x`)).toBeNull();
    const other = signWidgetToken({
      sessionId: "sess1",
      conversationId: "conv2",
      userId: "user1",
    });
    expect(verifyWidgetToken(other)?.conversationId).toBe("conv2");
    expect(verifyWidgetToken(other)?.conversationId).not.toBe(verifyWidgetToken(token)?.conversationId);
  });
});
