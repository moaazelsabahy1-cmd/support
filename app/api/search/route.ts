import { NextRequest } from "next/server";
import { jsonOk, toErrorResponse } from "@/lib/api-response";
import { globalSearchAction } from "@/actions/search";

export async function GET(req: NextRequest) {
  try {
    return jsonOk(await globalSearchAction(req.nextUrl.searchParams.get("q") || ""));
  } catch (e) {
    return toErrorResponse(e);
  }
}
