import { NextRequest } from "next/server";
import { jsonFail, jsonOk, toErrorResponse } from "@/lib/api-response";
import { isUniqueViolation, prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { z } from "zod";
import { newId } from "@/lib/id";

const schema = z.object({
  email: z.string().email(),
});

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || "local";
    if (!rateLimit(`newsletter:${ip}`, 8, 60_000).ok) {
      return jsonFail("RATE_LIMIT", "Too many subscribe attempts", 429);
    }
    const { email } = schema.parse(await req.json());
    const normalized = email.toLowerCase();
    try {
      await prisma.newsletterSubscriber.create({
        data: { id: newId(), email: normalized },
      });
      return jsonOk({ ok: true, already: false });
    } catch (err) {
      if (isUniqueViolation(err)) {
        return jsonOk({ ok: true, already: true });
      }
      throw err;
    }
  } catch (e) {
    return toErrorResponse(e);
  }
}
