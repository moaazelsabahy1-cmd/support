import { NextRequest } from "next/server";
import { jsonOk, toErrorResponse } from "@/lib/api-response";
import { cancelOwnMeetingAction, updateMeetingAction } from "@/actions/meetings";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    if (body.status === "CANCELLED") {
      return jsonOk(await cancelOwnMeetingAction(id));
    }
    return jsonOk(await updateMeetingAction(id, body));
  } catch (e) {
    return toErrorResponse(e);
  }
}
