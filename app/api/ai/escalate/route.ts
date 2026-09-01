import { NextRequest } from "next/server";
import { jsonOk, toErrorResponse } from "@/lib/api-response";
import { escalateAction } from "@/actions/ai";

export async function POST(req: NextRequest) {
  try {
    const { sessionId } = await req.json();
    return jsonOk(await escalateAction(sessionId));
  } catch (e) {
    return toErrorResponse(e);
  }
}
