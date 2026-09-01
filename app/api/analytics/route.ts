import { jsonOk, toErrorResponse } from "@/lib/api-response";
import { analyticsAction } from "@/actions/analytics";

export async function GET() {
  try {
    return jsonOk(await analyticsAction());
  } catch (e) {
    return toErrorResponse(e);
  }
}
