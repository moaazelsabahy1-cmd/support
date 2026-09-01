import { describe, expect, it } from "vitest";
import { hasPermission, ROLE_PERMISSIONS } from "../lib/permissions";
import { cosine } from "../lib/ai/embeddings";
import { objectIdString } from "../lib/validation";

describe("permissions", () => {
  it("grants super admin everything", () => {
    expect(hasPermission("SUPER_ADMIN", "user.delete")).toBe(true);
  });
  it("blocks customers from assigning tickets", () => {
    expect(hasPermission("CUSTOMER", "ticket.assign")).toBe(false);
  });
  it("agents can update tickets", () => {
    expect(ROLE_PERMISSIONS.AGENT.includes("ticket.update")).toBe(true);
  });
});

describe("embeddings fallback math", () => {
  it("computes cosine of identical vectors as 1", () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
  });
});

describe("validation", () => {
  it("accepts ObjectIds", () => {
    expect(objectIdString.safeParse("64b1c2d3e4f5a6b7c8d9e0f1").success).toBe(true);
    expect(objectIdString.safeParse("nope").success).toBe(false);
  });
});
