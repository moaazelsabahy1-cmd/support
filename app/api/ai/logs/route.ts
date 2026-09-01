import { NextRequest } from "next/server";
import { jsonOk, toErrorResponse } from "@/lib/api-response";
import { listAiLogsAction } from "@/actions/ai";

export async function GET(req: NextRequest) {
  try {
    return jsonOk(await listAiLogsAction(req.nextUrl.searchParams.get("sessionId") || undefined));
  } catch (e) {
    return toErrorResponse(e);
  }
}
