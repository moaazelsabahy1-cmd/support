import { NextRequest } from "next/server";
import { jsonFail, jsonOk, toErrorResponse } from "@/lib/api-response";
import { createPublicTicket } from "@/lib/public-tickets";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || "local";
    if (!rateLimit(`public-ticket:${ip}`, 8, 60_000).ok) {
      return jsonFail("RATE_LIMIT", "Too many tickets from this network", 429);
    }
    const data = await createPublicTicket(await req.json());
    return jsonOk(data, 201);
  } catch (e) {
    return toErrorResponse(e);
  }
}
