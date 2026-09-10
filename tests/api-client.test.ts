import { describe, expect, it } from "vitest";
import { UNEXPECTED_API_RESPONSE, readApiJson } from "../lib/api-client";

describe("readApiJson", () => {
  it("parses a successful JSON envelope", async () => {
    const res = new Response(JSON.stringify({ success: true, data: { ok: true } }), {
      headers: { "content-type": "application/json" },
    });
    await expect(readApiJson(res)).resolves.toEqual({ success: true, data: { ok: true } });
  });

  it("parses API failures including status codes", async () => {
    const res = new Response(
      JSON.stringify({ success: false, error: { code: "FORBIDDEN", message: "No", requestId: "r1" } }),
      { status: 403, headers: { "content-type": "application/json" } },
    );
    await expect(readApiJson(res)).resolves.toMatchObject({
      success: false,
      error: { code: "FORBIDDEN", message: "No" },
    });
  });

  it("does not throw on HTML error pages", async () => {
    const res = new Response("<html>502 Bad Gateway</html>", {
      status: 502,
      headers: { "content-type": "text/html", "x-request-id": "abc" },
    });
    const json = await readApiJson(res);
    expect(json.success).toBe(false);
    if (!json.success) {
      expect(json.error.message).toBe(UNEXPECTED_API_RESPONSE);
      expect(json.error.requestId).toBe("abc");
    }
  });
});
