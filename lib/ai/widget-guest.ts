import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { newId } from "@/lib/id";

const GUEST_DOMAIN = "widget.solvio.local";

export function widgetGuestEmail(sessionId: string) {
  const safe = sessionId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 48) || "anon";
  return `guest+${safe}@${GUEST_DOMAIN}`;
}

export async function upsertWidgetGuest(opts: { sessionId: string; organizationId: string; name?: string }) {
  const email = widgetGuestEmail(opts.sessionId);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.organizationId !== opts.organizationId) {
      return prisma.user.update({
        where: { id: existing.id },
        data: { organizationId: opts.organizationId },
      });
    }
    return existing;
  }
  return prisma.user.create({
    data: {
      id: newId(),
      name: opts.name || "Visitor",
      email,
      emailVerified: false,
      role: "CUSTOMER",
      status: "ACTIVE",
      organizationId: opts.organizationId,
    },
  });
}

export type WidgetSocketClaims = {
  sessionId: string;
  conversationId: string;
  userId: string;
  exp: number;
};

export function signWidgetToken(claims: Omit<WidgetSocketClaims, "exp">) {
  const payload: WidgetSocketClaims = { ...claims, exp: Date.now() + 12 * 60 * 60 * 1000 };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", getEnv().BETTER_AUTH_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyWidgetToken(token: string): WidgetSocketClaims | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", getEnv().BETTER_AUTH_SECRET).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, "base64url").toString()) as WidgetSocketClaims;
    if (!claims.sessionId || !claims.conversationId || !claims.userId) return null;
    if (claims.exp < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}
