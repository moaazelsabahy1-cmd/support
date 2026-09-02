import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

import { listKnowledgeSourcesAction, approveKnowledgeReviewAction, patchKnowledgeSourceAction } from "../actions/ai";
import { AppError } from "../lib/api-response";

async function expectAuthError(fn: () => Promise<unknown>, code: "UNAUTHENTICATED" | "FORBIDDEN") {
  try {
    await fn();
    throw new Error("expected auth error");
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
    expect((error as AppError).status).toBe(code === "UNAUTHENTICATED" ? 401 : 403);
  }
}

describe("knowledge review API auth", () => {
  it("rejects unauthenticated list, patch, and approve", async () => {
    await expectAuthError(() => listKnowledgeSourcesAction({ status: "PENDING_REVIEW" }), "UNAUTHENTICATED");
    await expectAuthError(() => patchKnowledgeSourceAction("missing", { question: "Edited question?" }), "UNAUTHENTICATED");
    await expectAuthError(() => approveKnowledgeReviewAction("missing"), "UNAUTHENTICATED");
  });
});
