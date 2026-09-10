import { NextRequest } from "next/server";
import { jsonOk, toErrorResponse, requestIdFrom } from "@/lib/api-response";
import { listHandoffAgentCardsAction } from "@/actions/messages";

export async function GET(req: NextRequest) {
  try {
    return jsonOk(await listHandoffAgentCardsAction());
  } catch (e) {
    return toErrorResponse(e, requestIdFrom(req));
  }
}
