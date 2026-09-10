import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const protectedPrefixes = [
  "/dashboard",
  "/admin",
  "/agent",
  "/tickets",
  "/chat",
  "/settings",
  "/analytics",
  "/meetings",
  "/notifications",
];

export function middleware(req: NextRequest) {
  const requestId = req.headers.get("x-request-id") || crypto.randomUUID();
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-request-id", requestId);
  const session = getSessionCookie(req);
  const path = req.nextUrl.pathname;
  let res: NextResponse;
  if (protectedPrefixes.some((p) => path === p || path.startsWith(`${p}/`)) && !session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    res = NextResponse.redirect(url);
  } else {
    res = NextResponse.next({ request: { headers: requestHeaders } });
  }
  res.headers.set("x-request-id", requestId);
  return res;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/admin/:path*",
    "/agent/:path*",
    "/tickets/:path*",
    "/chat/:path*",
    "/settings/:path*",
    "/analytics/:path*",
    "/meetings/:path*",
    "/notifications/:path*",
    "/api/:path*",
  ],
};
