import { jsonOk } from "@/lib/api-response";
import { requireUser } from "@/lib/session";
import { dashboardStatsAction } from "@/actions/tickets";

export async function GET() {
  try {
    await requireUser();
    return jsonOk(await dashboardStatsAction());
  } catch (e) {
    const { toErrorResponse } = await import("@/lib/api-response");
    return toErrorResponse(e);
  }
}
