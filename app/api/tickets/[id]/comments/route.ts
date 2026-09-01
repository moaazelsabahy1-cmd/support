import { NextRequest } from "next/server";
import { jsonOk, toErrorResponse } from "@/lib/api-response";
import { addCommentAction } from "@/actions/tickets";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    return jsonOk(await addCommentAction(id, await req.json()), 201);
  } catch (e) {
    return toErrorResponse(e);
  }
}
