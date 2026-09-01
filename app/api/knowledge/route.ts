import { NextRequest } from "next/server";
import { jsonOk, toErrorResponse } from "@/lib/api-response";
import { listArticlesAction, upsertArticleAction } from "@/actions/knowledge";

export async function GET(req: NextRequest) {
  try {
    const published = req.nextUrl.searchParams.get("published") === "1";
    return jsonOk(await listArticlesAction({ q: req.nextUrl.searchParams.get("q") || undefined, publishedOnly: published }));
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    return jsonOk(await upsertArticleAction(null, await req.json()), 201);
  } catch (e) {
    return toErrorResponse(e);
  }
}
