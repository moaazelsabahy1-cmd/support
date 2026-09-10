import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { AppError, mapUnknownError, toErrorResponse } from "../lib/api-response";

describe("mapUnknownError", () => {
  it("maps Prisma connection failures", () => {
    const err = new Prisma.PrismaClientKnownRequestError("unreachable", {
      code: "P1001",
      clientVersion: "test",
    });
    expect(mapUnknownError(err)).toMatchObject({ code: "DATABASE_UNAVAILABLE", status: 503 });
  });

  it("maps missing-table schema errors", () => {
    const err = new Prisma.PrismaClientKnownRequestError("table", {
      code: "P2021",
      clientVersion: "test",
    });
    expect(mapUnknownError(err)).toMatchObject({ code: "SCHEMA_MISMATCH", status: 503 });
  });
});

describe("toErrorResponse", () => {
  it("keeps AppError messages and adds a request id", async () => {
    const res = toErrorResponse(new AppError("VALIDATION", "Choose a support agent", 400), "req-1");
    const json = await res.json();
    expect(json).toMatchObject({
      success: false,
      error: { code: "VALIDATION", message: "Choose a support agent", requestId: "req-1" },
    });
    expect(res.headers.get("x-request-id")).toBe("req-1");
  });

  it("does not put stack traces in the JSON body", async () => {
    const res = toErrorResponse(new Error("secret stack"), "req-2");
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error.requestId).toBe("req-2");
    expect(JSON.stringify(json)).not.toMatch(/secret stack/);
    expect(json.error.code).toBe("INTERNAL_ERROR");
  });
});
