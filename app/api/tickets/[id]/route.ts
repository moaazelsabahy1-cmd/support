import { NextRequest } from "next/server";
import { jsonOk, toErrorResponse } from "@/lib/api-response";
import { getTicketAction, updateTicketAction } from "@/actions/tickets";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    return jsonOk(await getTicketAction(id));
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    return jsonOk(await updateTicketAction(id, await req.json()));
  } catch (e) {
    return toErrorResponse(e);
  }
}
