"use server";

import { prisma } from "@/lib/db";
import { requirePermission, requireUser } from "@/lib/session";
import { serialize } from "@/lib/serialize";
import { getEnv, isConfigured } from "@/lib/env";
import { storageMode } from "@/lib/storage";
import { llmConfigured, getChatModel } from "@/lib/ai/providers";
import { qdrantConfigured } from "@/lib/ai/qdrant";
import { pushConfigured } from "@/lib/push";
import {
  DEFAULT_WIDGET_ASSISTANT_NAME,
  DEFAULT_WIDGET_PRIMARY,
  DEFAULT_WIDGET_TITLE,
  DEFAULT_WIDGET_WELCOME,
  defaultWidgetAllowedOrigins,
  ensureDefaultWidgetSite,
} from "@/lib/ai/widget-site";
import { DEFAULT_ORGANIZATION_ID, DEFAULT_WIDGET_PUBLIC_KEY, DEFAULT_WIDGET_SITE_ID } from "@/types";
import type { Prisma } from "@prisma/client";

type Branding = { primaryColor: string; logoUrl?: string };
type Widget = {
  publicKey?: string;
  allowedOrigins: string[];
  greeting: string;
  title?: string;
  assistantName?: string;
  language?: string;
};

function embedSnippet(appUrl: string, publicKey: string) {
  const src = `${appUrl.replace(/\/$/, "")}/ai-widget.js`;
  return `<script src="${src}" data-widget-key="${publicKey}" data-position="bottom-right"></script>`;
}

export async function getPublicSettingsAction() {
  const env = getEnv();
  const doc = await prisma.settings.findUnique({ where: { id: "app" } });
  const branding = (doc?.branding || { primaryColor: DEFAULT_WIDGET_PRIMARY }) as Branding;
  const widget = (doc?.widget || {}) as Partial<Widget>;
  await ensureDefaultWidgetSite();
  const site = await prisma.widgetSite.findUnique({ where: { id: DEFAULT_WIDGET_SITE_ID } });
  return {
    appName: doc?.appName || "Solvio",
    branding,
    widget: {
      publicKey: site?.publicKey || env.WIDGET_PUBLIC_KEY,
      greeting: site?.welcomeMessage || widget.greeting || DEFAULT_WIDGET_WELCOME,
    },
    pushPublicKey: env.PUSH_PUBLIC_KEY || "",
    storageMode: storageMode(),
  };
}

export async function getAdminSettingsAction() {
  await requirePermission("settings.manage");
  const env = getEnv();
  await ensureDefaultWidgetSite();
  const doc = await prisma.settings.findUnique({ where: { id: "app" } });
  const site = await prisma.widgetSite.findUnique({ where: { id: DEFAULT_WIDGET_SITE_ID } });
  const widget = (doc?.widget || { allowedOrigins: ["*"], greeting: DEFAULT_WIDGET_WELCOME }) as Widget;
  const appUrl = env.NEXT_PUBLIC_APP_URL || env.BETTER_AUTH_URL;
  const publicKey = site?.publicKey || env.WIDGET_PUBLIC_KEY;
  return serialize({
    appName: doc?.appName || "Solvio",
    branding: doc?.branding || { primaryColor: DEFAULT_WIDGET_PRIMARY },
    widget: {
      publicKey,
      greeting: site?.welcomeMessage || widget.greeting,
      allowedOrigins: site?.allowedOrigins?.length ? site.allowedOrigins : widget.allowedOrigins,
      title: site?.title || DEFAULT_WIDGET_TITLE,
      assistantName: site?.assistantName || DEFAULT_WIDGET_ASSISTANT_NAME,
      language: site?.language || "en",
      logoUrl: site?.logoUrl || "",
    },
    embedSnippet: embedSnippet(appUrl, publicKey),
    integrations: {
      openrouterConfigured: llmConfigured(),
      openaiConfigured: llmConfigured(),
      qdrantConfigured: qdrantConfigured(),
      r2Configured: storageMode() === "r2",
      smtpConfigured: isConfigured(env.SMTP_HOST),
      firecrawlConfigured: isConfigured(env.FIRECRAWL_API_KEY),
      pushConfigured: pushConfigured(),
    },
    openaiChatModel: getChatModel(),
    openrouterModel: getChatModel(),
  });
}

export async function saveAdminSettingsAction(input: {
  appName?: string;
  branding?: Branding;
  widget?: {
    allowedOrigins: string[];
    greeting: string;
    title?: string;
    assistantName?: string;
    language?: string;
    logoUrl?: string;
  };
}) {
  await requirePermission("settings.manage");
  const existing = await prisma.settings.findUnique({ where: { id: "app" } });
  const currentWidget = (existing?.widget || {}) as Widget;
  const origins = (input.widget?.allowedOrigins || [])
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s === "*" ? s : s.replace(/\/$/, "")));
  const allowedOrigins = origins.length ? origins.filter((o) => o !== "*") : await defaultWidgetAllowedOrigins();
  if (!allowedOrigins.length) allowedOrigins.push(...(await defaultWidgetAllowedOrigins()));
  const branding = (input.branding || { primaryColor: DEFAULT_WIDGET_PRIMARY }) as Branding;
  const welcome = input.widget?.greeting ?? currentWidget.greeting ?? DEFAULT_WIDGET_WELCOME;
  const title = input.widget?.title || DEFAULT_WIDGET_TITLE;
  const assistantName = input.widget?.assistantName || DEFAULT_WIDGET_ASSISTANT_NAME;
  const language = input.widget?.language || "en";
  const logoUrl = input.widget?.logoUrl || branding.logoUrl || null;

  await prisma.settings.upsert({
    where: { id: "app" },
    create: {
      id: "app",
      appName: input.appName || "Solvio",
      branding: { ...branding, logoUrl } as Prisma.InputJsonValue,
      widget: {
        greeting: welcome,
        allowedOrigins,
        title,
        assistantName,
        language,
      } as Prisma.InputJsonValue,
      integrations: {},
    },
    update: {
      appName: input.appName,
      branding: { ...branding, logoUrl } as Prisma.InputJsonValue,
      widget: {
        ...currentWidget,
        greeting: welcome,
        allowedOrigins,
        title,
        assistantName,
        language,
      } as Prisma.InputJsonValue,
    },
  });

  await prisma.widgetSite.upsert({
    where: { id: DEFAULT_WIDGET_SITE_ID },
    create: {
      id: DEFAULT_WIDGET_SITE_ID,
      publicKey: currentWidget.publicKey || DEFAULT_WIDGET_PUBLIC_KEY,
      organizationId: DEFAULT_ORGANIZATION_ID,
      enabled: true,
      title,
      welcomeMessage: welcome,
      assistantName,
      logoUrl,
      primaryColor: branding.primaryColor || DEFAULT_WIDGET_PRIMARY,
      language,
      allowedOrigins,
    },
    update: {
      title,
      welcomeMessage: welcome,
      assistantName,
      logoUrl,
      primaryColor: branding.primaryColor || DEFAULT_WIDGET_PRIMARY,
      language,
      allowedOrigins,
    },
  });
  return { ok: true };
}

export async function notificationPrefsPlaceholder() {
  await requireUser();
  return { email: true, push: true, inApp: true };
}
