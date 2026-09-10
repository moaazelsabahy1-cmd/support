import { jsonOk, toErrorResponse } from "@/lib/api-response";
import { listHandoffAgentCardsAction } from "@/actions/messages";

export async function GET() {
  try {
    return jsonOk(await listHandoffAgentCardsAction());
  } catch (e) {
    return toErrorResponse(e);
  }
}
