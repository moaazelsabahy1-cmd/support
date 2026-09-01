import { NextRequest } from "next/server";
import { jsonOk, jsonFail, toErrorResponse } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { z } from "zod";
import { newId } from "@/lib/id";

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  message: z.string().min(10),
});

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || "local";
    if (!rateLimit(`contact:${ip}`, 8, 60_000).ok) return jsonFail("RATE_LIMIT", "Slow down", 429);
    const data = schema.parse(await req.json());
    await prisma.contactSubmission.create({ data: { id: newId(), ...data } });
    return jsonOk({ ok: true });
  } catch (e) {
    return toErrorResponse(e);
  }
}
