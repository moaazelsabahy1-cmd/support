import { NextRequest } from "next/server";
import { jsonFail, jsonOk, toErrorResponse } from "@/lib/api-response";
import {
  authorizeWidgetSite,
  corsHeadersForOrigin,
  publicWidgetConfig,
  resolveWidgetSite,
  widgetRequestKey,
} from "@/lib/ai/widget-site";

function withCors(res: Response, origin: string | null, allowed: boolean) {
  const headers = corsHeadersForOrigin(origin, allowed);
  Object.entries(headers).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin");
  const key = widgetRequestKey(req.headers, req.nextUrl.searchParams);
  const site = await resolveWidgetSite(key);
  const auth = site ? authorizeWidgetSite(site, req.headers, req.nextUrl.searchParams) : { allowed: false };
  const allowed = Boolean(site && auth.allowed);
  return withCors(new Response(null, { status: allowed ? 204 : 401 }), origin, allowed);
}

export async function GET(req: NextRequest) {
  try {
    const origin = req.headers.get("origin");
    const key = widgetRequestKey(req.headers, req.nextUrl.searchParams);
    const site = await resolveWidgetSite(key);
    if (!site) {
      return withCors(jsonFail("UNAUTHORIZED", "Invalid widget key", 401), origin, false);
    }
    const auth = authorizeWidgetSite(site, req.headers, req.nextUrl.searchParams);
    if (!auth.allowed) {
      return withCors(jsonFail("UNAUTHORIZED", "This website is not allowed to use this widget", 401), origin, false);
    }
    return withCors(jsonOk(publicWidgetConfig(site)), origin, true);
  } catch (e) {
    return toErrorResponse(e);
  }
}
