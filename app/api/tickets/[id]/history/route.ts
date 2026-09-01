import { NextRequest } from "next/server";
import { jsonOk, toErrorResponse } from "@/lib/api-response";
import { getTicketAction } from "@/actions/tickets";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const data = await getTicketAction(id);
    return jsonOk(data.history);
  } catch (e) {
    return toErrorResponse(e);
  }
}
