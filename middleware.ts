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
  const session = getSessionCookie(req);
  const path = req.nextUrl.pathname;
  if (protectedPrefixes.some((p) => path === p || path.startsWith(`${p}/`)) && !session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/agent/:path*", "/tickets/:path*", "/chat/:path*", "/settings/:path*", "/analytics/:path*", "/meetings/:path*", "/notifications/:path*"],
};
