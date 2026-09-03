import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: async () => ({
        user: {
          id: "agent-cannot-approve",
          name: "Agent",
          email: "agent-cannot-approve@solvio.local",
          role: "AGENT",
          status: "ACTIVE",
        },
      }),
    },
  },
}));

import { approveKnowledgeReviewAction } from "../actions/ai";
import { AppError } from "../lib/api-response";

describe("knowledge review agent auth", () => {
  it("forbids AGENT from approving knowledge", async () => {
    try {
      await approveKnowledgeReviewAction("000000000000000000000000");
      throw new Error("expected forbidden");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("FORBIDDEN");
      expect((error as AppError).status).toBe(403);
    }
  });
});
