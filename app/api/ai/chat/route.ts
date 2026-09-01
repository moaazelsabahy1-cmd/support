import { NextRequest } from "next/server";
import { jsonOk, toErrorResponse } from "@/lib/api-response";
import { aiChatAction, listAiLogsAction } from "@/actions/ai";
import { rateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/session";
import { jsonFail } from "@/lib/api-response";

export async function GET() {
  try {
    return jsonOk(await listAiLogsAction());
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const limited = rateLimit(`ai:${user.id}`, 30, 60_000);
    if (!limited.ok) return jsonFail("RATE_LIMIT", "Too many AI requests", 429);
    const { message, sessionId } = await req.json();
    return jsonOk(await aiChatAction(message, sessionId));
  } catch (e) {
    return toErrorResponse(e);
  }
}
