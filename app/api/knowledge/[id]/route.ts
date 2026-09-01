import { NextRequest } from "next/server";
import { jsonOk, toErrorResponse } from "@/lib/api-response";
import { deleteArticleAction, upsertArticleAction } from "@/actions/knowledge";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    return jsonOk(await upsertArticleAction(id, await req.json()));
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    return jsonOk(await deleteArticleAction(id));
  } catch (e) {
    return toErrorResponse(e);
  }
}
