import { NextRequest } from "next/server";
import { jsonOk, toErrorResponse } from "@/lib/api-response";
import {
  deleteKnowledgeSourceAction,
  patchKnowledgeSourceAction,
  reindexKnowledgeSourceAction,
  approveKnowledgeReviewAction,
  rejectKnowledgeReviewAction,
} from "@/actions/ai";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    return jsonOk(await patchKnowledgeSourceAction(id, await req.json()));
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    return jsonOk(await deleteKnowledgeSourceAction(id));
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    if (body.action === "reindex" || body.action === "retry") {
      return jsonOk(await reindexKnowledgeSourceAction(id));
    }
    if (body.action === "approve") {
      return jsonOk(await approveKnowledgeReviewAction(id));
    }
    if (body.action === "reject") {
      return jsonOk(await rejectKnowledgeReviewAction(id));
    }
    return jsonOk(await patchKnowledgeSourceAction(id, body));
  } catch (e) {
    return toErrorResponse(e);
  }
}
