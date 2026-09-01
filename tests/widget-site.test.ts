import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  authorizeWidgetSite,
  isOriginAllowed,
  normalizeOrigin,
  publicWidgetConfig,
  widgetAnswerInput,
  type ResolvedWidgetSite,
} from "../lib/ai/widget-site";
import { groundedPrompt } from "../lib/ai/prompts";

function site(over: Partial<ResolvedWidgetSite> = {}): ResolvedWidgetSite {
  return {
    id: "s1",
    publicKey: "wk_test",
    organizationId: "org-a",
    enabled: true,
    title: "Help",
    welcomeMessage: "Hello",
    assistantName: "HelpBot",
    logoUrl: null,
    primaryColor: "#111111",
    language: "en",
    allowedOrigins: ["https://customer.example"],
    envFallback: false,
    ...over,
  };
}

describe("widget origin allowlist", () => {
  it("normalizes origins", () => {
    expect(normalizeOrigin("https://customer.example/path")).toBe("https://customer.example");
  });

  it("rejects unknown origins on DB sites", () => {
    expect(isOriginAllowed(["https://customer.example"], ["https://evil.example"])).toBe(false);
    expect(isOriginAllowed(["https://customer.example"], ["https://customer.example"])).toBe(true);
  });

  it("allows wildcard only for env fallback", () => {
    expect(isOriginAllowed(["*"], ["https://anywhere.test"], { envFallback: true })).toBe(true);
    expect(isOriginAllowed(["*"], ["https://anywhere.test"], { envFallback: false })).toBe(false);
    expect(isOriginAllowed([], ["https://anywhere.test"], { envFallback: true })).toBe(true);
  });
});

describe("authorizeWidgetSite", () => {
  const appUrl = "http://localhost:3000";

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", appUrl);
    vi.stubEnv("BETTER_AUTH_URL", appUrl);
  });

  it("requires parent origin for DB keys and ignores spoofed Origin", () => {
    const headers = new Headers({
      origin: "https://evil.example",
      "x-widget-parent-origin": "https://customer.example",
    });
    expect(authorizeWidgetSite(site(), headers).allowed).toBe(false);
  });

  it("allows iframe chat when Origin is the app and parent is allowlisted", () => {
    const headers = new Headers({
      origin: appUrl,
      "x-widget-parent-origin": "https://customer.example",
    });
    expect(authorizeWidgetSite(site(), headers).allowed).toBe(true);
  });

  it("rejects missing parent on DB sites even if Origin is the app", () => {
    const headers = new Headers({ origin: appUrl });
    expect(authorizeWidgetSite(site(), headers).allowed).toBe(false);
  });

  it("rejects unknown parent", () => {
    const headers = new Headers({
      origin: appUrl,
      "x-widget-parent-origin": "https://evil.example",
    });
    expect(authorizeWidgetSite(site(), headers).allowed).toBe(false);
  });
});

describe("tenant routing", () => {
  it("passes organizationId into the answer payload", () => {
    const input = widgetAnswerInput(site({ organizationId: "org-b" }), "How do I reset?", "sess-1");
    expect(input.organizationId).toBe("org-b");
    expect(input.userId).toBeNull();
    expect(input.assistantName).toBe("HelpBot");
  });
});

describe("public widget config", () => {
  it("does not include secrets", () => {
    const cfg = publicWidgetConfig(site());
    expect(JSON.stringify(cfg)).not.toMatch(/OPENROUTER|DATABASE|QDRANT|apiKey/i);
    expect(cfg.title).toBe("Help");
  });
});

describe("widget grounded prompt", () => {
  it("uses a custom assistant name only when provided", () => {
    const custom = groundedPrompt("Hi", [{ title: "A", text: "B" }], [], { assistantName: "Acme Bot" });
    expect(custom[0].content).toContain("You are Acme Bot");
    expect(custom[0].content).not.toContain("You are Solvio");
    const loggedIn = groundedPrompt("Hi", [{ title: "A", text: "B" }]);
    expect(loggedIn[0].content).toContain("You are Solvio");
  });
});
