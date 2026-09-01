import { prisma } from "@/lib/prisma";
import { getEnv, isConfigured } from "@/lib/env";
import { DEFAULT_ORGANIZATION_ID, DEFAULT_WIDGET_PUBLIC_KEY, DEFAULT_WIDGET_SITE_ID } from "@/types";

export const DEFAULT_WIDGET_TITLE = "Assistant";
export const DEFAULT_WIDGET_WELCOME = "Hi, how can I help?";
export const DEFAULT_WIDGET_ASSISTANT_NAME = "Assistant";
export const DEFAULT_WIDGET_PRIMARY = "#0f766e";

export type ResolvedWidgetSite = {
  id: string;
  publicKey: string;
  organizationId: string;
  enabled: boolean;
  title: string;
  welcomeMessage: string;
  assistantName: string;
  logoUrl: string | null;
  primaryColor: string;
  language: string;
  allowedOrigins: string[];
  envFallback: boolean;
};

export type PublicWidgetConfig = {
  title: string;
  welcomeMessage: string;
  assistantName: string;
  logoUrl: string | null;
  primaryColor: string;
  language: string;
};

export function normalizeOrigin(value: string | null | undefined) {
  if (!value) return "";
  const raw = value.trim();
  if (!raw) return "";
  if (raw === "*" || raw === "null") return raw;
  try {
    const url = raw.includes("://") ? new URL(raw) : new URL(`https://${raw}`);
    return url.origin;
  } catch {
    return raw.replace(/\/$/, "");
  }
}

export function originFromReferer(referer: string | null | undefined) {
  if (!referer) return "";
  try {
    return new URL(referer).origin;
  } catch {
    return "";
  }
}

export function isOriginAllowed(
  allowedOrigins: string[],
  candidates: Array<string | null | undefined>,
  opts?: { envFallback?: boolean },
) {
  const list = allowedOrigins.map(normalizeOrigin).filter(Boolean);
  const envWildcard = Boolean(opts?.envFallback) && (!list.length || list.includes("*"));
  if (envWildcard) return true;
  if (list.includes("*") && opts?.envFallback) return true;
  const normalized = candidates.map(normalizeOrigin).filter(Boolean);
  if (!normalized.length) return false;
  return normalized.some((origin) => list.includes(origin));
}

export function widgetAnswerInput(site: ResolvedWidgetSite, message: string, sessionId: string) {
  return {
    message,
    sessionId,
    userId: null as string | null,
    organizationId: site.organizationId,
    assistantName: site.assistantName,
    language: site.language,
  };
}

export function publicWidgetConfig(site: ResolvedWidgetSite): PublicWidgetConfig {
  return {
    title: site.title || DEFAULT_WIDGET_TITLE,
    welcomeMessage: site.welcomeMessage || DEFAULT_WIDGET_WELCOME,
    assistantName: site.assistantName || DEFAULT_WIDGET_ASSISTANT_NAME,
    logoUrl: site.logoUrl,
    primaryColor: site.primaryColor || DEFAULT_WIDGET_PRIMARY,
    language: site.language || "en",
  };
}

function envFallbackOrigins() {
  const env = getEnv();
  if (!isConfigured(env.WIDGET_ALLOWED_ORIGINS)) return ["*"];
  const list = env.WIDGET_ALLOWED_ORIGINS!.split(",").map((s) => s.trim()).filter(Boolean);
  return list.length ? list : ["*"];
}

async function envFallbackSite(publicKey: string): Promise<ResolvedWidgetSite> {
  const env = getEnv();
  const settings = await prisma.settings.findUnique({ where: { id: "app" } });
  const widget = (settings?.widget || {}) as {
    greeting?: string;
    allowedOrigins?: string[];
    title?: string;
    assistantName?: string;
    language?: string;
  };
  const branding = (settings?.branding || {}) as { primaryColor?: string; logoUrl?: string };
  const envOrigins = envFallbackOrigins();
  const settingsOrigins = Array.isArray(widget.allowedOrigins) ? widget.allowedOrigins : [];
  const allowedOrigins = envOrigins.includes("*") && settingsOrigins.length ? settingsOrigins : envOrigins;
  return {
    id: "env-fallback",
    publicKey,
    organizationId: DEFAULT_ORGANIZATION_ID,
    enabled: true,
    title: widget.title || settings?.appName || DEFAULT_WIDGET_TITLE,
    welcomeMessage: widget.greeting || DEFAULT_WIDGET_WELCOME,
    assistantName: widget.assistantName || DEFAULT_WIDGET_ASSISTANT_NAME,
    logoUrl: branding.logoUrl || null,
    primaryColor: branding.primaryColor || DEFAULT_WIDGET_PRIMARY,
    language: widget.language || "en",
    allowedOrigins,
    envFallback: true,
  };
}

export async function resolveWidgetSite(publicKey: string | null | undefined): Promise<ResolvedWidgetSite | null> {
  const key = (publicKey || "").trim();
  if (!key) return null;
  const row = await prisma.widgetSite.findUnique({ where: { publicKey: key } });
  if (row) {
    if (!row.enabled) return null;
    return {
      id: row.id,
      publicKey: row.publicKey,
      organizationId: row.organizationId,
      enabled: row.enabled,
      title: row.title,
      welcomeMessage: row.welcomeMessage,
      assistantName: row.assistantName,
      logoUrl: row.logoUrl,
      primaryColor: row.primaryColor,
      language: row.language,
      allowedOrigins: row.allowedOrigins,
      envFallback: false,
    };
  }
  const env = getEnv();
  const envKeys = [env.WIDGET_PUBLIC_KEY, env.NEXT_PUBLIC_WIDGET_KEY].map((k) => (k || "").trim()).filter(Boolean);
  if (envKeys.includes(key)) return envFallbackSite(key);
  return null;
}

export function widgetRequestKey(headers: Headers, searchParams?: URLSearchParams) {
  return (
    headers.get("x-widget-key") ||
    headers.get("x-solvio-widget-key") ||
    searchParams?.get("key") ||
    ""
  );
}

export function widgetParentOrigin(headers: Headers, searchParams?: URLSearchParams) {
  return headers.get("x-widget-parent-origin") || searchParams?.get("parent") || "";
}

export function authorizeWidgetSite(
  site: ResolvedWidgetSite,
  headers: Headers,
  searchParams?: URLSearchParams,
) {
  const explicitParent = widgetParentOrigin(headers, searchParams);
  const requestOrigin = headers.get("origin");
  const refererOrigin = originFromReferer(headers.get("referer"));
  const appOrigin = normalizeOrigin(getEnv().NEXT_PUBLIC_APP_URL || getEnv().BETTER_AUTH_URL);

  if (site.envFallback) {
    const allowed = isOriginAllowed(
      site.allowedOrigins,
      [explicitParent, requestOrigin, refererOrigin],
      { envFallback: true },
    );
    return { allowed, parent: normalizeOrigin(explicitParent || requestOrigin) };
  }

  const parent = normalizeOrigin(explicitParent);
  if (!parent || !isOriginAllowed(site.allowedOrigins, [parent], { envFallback: false })) {
    return { allowed: false, parent };
  }
  const origin = normalizeOrigin(requestOrigin);
  if (origin && origin !== appOrigin && origin !== parent) {
    return { allowed: false, parent };
  }
  return { allowed: true, parent };
}

export function corsHeadersForOrigin(origin: string | null | undefined, allowed: boolean) {
  const normalized = normalizeOrigin(origin);
  if (!allowed || !normalized || normalized === "*") return { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": normalized,
    "Access-Control-Allow-Headers": "Content-Type, x-widget-key, x-widget-parent-origin, x-solvio-widget-key",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  };
}

export async function defaultWidgetAllowedOrigins() {
  const env = getEnv();
  const app = normalizeOrigin(env.NEXT_PUBLIC_APP_URL || env.BETTER_AUTH_URL || "http://localhost:3000");
  const origins = new Set<string>([app, "http://localhost:3000", "http://127.0.0.1:3000"]);
  return [...origins].filter(Boolean);
}

export async function ensureDefaultWidgetSite() {
  const origins = await defaultWidgetAllowedOrigins();
  await prisma.widgetSite.upsert({
    where: { id: DEFAULT_WIDGET_SITE_ID },
    create: {
      id: DEFAULT_WIDGET_SITE_ID,
      publicKey: DEFAULT_WIDGET_PUBLIC_KEY,
      organizationId: DEFAULT_ORGANIZATION_ID,
      enabled: true,
      title: DEFAULT_WIDGET_TITLE,
      welcomeMessage: DEFAULT_WIDGET_WELCOME,
      assistantName: DEFAULT_WIDGET_ASSISTANT_NAME,
      primaryColor: DEFAULT_WIDGET_PRIMARY,
      language: "en",
      allowedOrigins: origins,
    },
    update: {},
  });
}
