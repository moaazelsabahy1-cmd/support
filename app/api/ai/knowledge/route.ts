import { NextRequest } from "next/server";
import { jsonOk, toErrorResponse } from "@/lib/api-response";
import { knowledgeOverviewAction, listKnowledgeSourcesAction } from "@/actions/ai";

export async function GET(req: NextRequest) {
  try {
    const overview = req.nextUrl.searchParams.get("overview");
    if (overview === "1") return jsonOk(await knowledgeOverviewAction());
    const params = Object.fromEntries(req.nextUrl.searchParams.entries());
    return jsonOk(await listKnowledgeSourcesAction(params));
  } catch (e) {
    return toErrorResponse(e);
  }
}
