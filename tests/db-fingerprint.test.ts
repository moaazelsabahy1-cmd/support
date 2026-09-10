import { describe, expect, it } from "vitest";
import { redactedDatabaseFingerprint } from "../lib/db-fingerprint";
import { AppError } from "../lib/api-response";
import { HANDOFF_AGENTS_QUERY_MESSAGE, handoffAgentsQueryFailed } from "../lib/ai/handoff-queue";

describe("handoff agent diagnostics", () => {
  it("redacts credentials from DATABASE_URL", () => {
    expect(redactedDatabaseFingerprint("postgresql://solvio:secret@127.0.0.1:5433/solvio")).toBe(
      "127.0.0.1:5433/solvio",
    );
    expect(redactedDatabaseFingerprint("not a url")).toBe("unknown");
  });

  it("maps a query failure to a useful AppError", () => {
    try {
      handoffAgentsQueryFailed(new Error("connect ECONNREFUSED"));
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("HANDOFF_AGENTS_QUERY_FAILED");
      expect((err as AppError).message).toBe(HANDOFF_AGENTS_QUERY_MESSAGE);
      expect((err as AppError).status).toBe(503);
      return;
    }
    throw new Error("expected throw");
  });
});
