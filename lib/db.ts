import { Prisma } from "@prisma/client";
import { DEFAULT_ORGANIZATION_ID, SYSTEM_AI_USER_ID } from "@/types";
import { prisma } from "@/lib/prisma";
import { ensureDefaultWidgetSite } from "@/lib/ai/widget-site";

export { prisma };

export async function connectDb() {
  await prisma.$connect();
  await ensureAppDefaults();
}

export async function closeDb() {
  await prisma.$disconnect();
}

export async function nextTicketNumber() {
  const year = new Date().getFullYear();
  const row = await prisma.$transaction(async (tx) => {
    return tx.ticketCounter.upsert({
      where: { year },
      create: { year, seq: 1 },
      update: { seq: { increment: 1 } },
    });
  });
  return `SOL-${year}-${String(row.seq).padStart(6, "0")}`;
}

export async function ensureAppDefaults() {
  await prisma.organization.upsert({
    where: { id: DEFAULT_ORGANIZATION_ID },
    create: { id: DEFAULT_ORGANIZATION_ID, name: "Solvio" },
    update: {},
  });
  await prisma.user.upsert({
    where: { id: SYSTEM_AI_USER_ID },
    create: {
      id: SYSTEM_AI_USER_ID,
      name: "Solvio Assistant",
      email: "ai@solvio.local",
      emailVerified: true,
      role: "AGENT",
      status: "ACTIVE",
      organizationId: DEFAULT_ORGANIZATION_ID,
    },
    update: { organizationId: DEFAULT_ORGANIZATION_ID },
  });
  await prisma.settings.upsert({
    where: { id: "app" },
    create: {
      id: "app",
      appName: "Solvio",
      branding: { primaryColor: "#14b8a6" },
      widget: {
        publicKey: "solvio-widget-dev-key",
        allowedOrigins: ["*"],
        greeting: "Hi, I'm the Solvio assistant.",
      },
      integrations: {},
    },
    update: {},
  });
  await ensureDefaultWidgetSite();
}

export function ilike(q: string): Prisma.StringFilter {
  return { contains: q, mode: "insensitive" };
}

export function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
