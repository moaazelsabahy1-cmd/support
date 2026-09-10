/**
 * Non-destructive: create login accounts via Better Auth only if missing.
 * Does not seed tickets/knowledge or delete users. Not npm run db:seed.
 */
import { connectDb, prisma } from "../lib/db";
import { auth } from "../lib/auth";
import { DEMO_ACCOUNTS } from "../lib/demo-accounts";
import { DEFAULT_ORGANIZATION_ID } from "../types";
import { ensureHandoffAgents } from "./ensure-handoff-agents";
import type { Role } from "@prisma/client";

const ROLES: Record<(typeof DEMO_ACCOUNTS)[number]["email"], Role> = {
  "admin@solvio.local": "ADMIN",
  "customer@solvio.local": "CUSTOMER",
};

const NAMES: Record<(typeof DEMO_ACCOUNTS)[number]["email"], string> = {
  "admin@solvio.local": "Noah Adler",
  "customer@solvio.local": "Ava Patel",
};

async function main() {
  await connectDb();
  for (const account of DEMO_ACCOUNTS) {
    const existing = await prisma.user.findUnique({ where: { email: account.email } });
    const accounts = existing
      ? await prisma.account.count({ where: { userId: existing.id } })
      : 0;
    if (!existing) {
      await auth.api.signUpEmail({
        body: { name: NAMES[account.email], email: account.email, password: account.password },
      });
      console.log("created_user", account.email);
    } else if (accounts === 0) {
      console.log("skip_no_password_attach", account.email, "(exists without credential; not deleting)");
      continue;
    } else {
      console.log("exists", account.email);
    }
    await prisma.user.update({
      where: { email: account.email },
      data: {
        role: ROLES[account.email],
        status: "ACTIVE",
        emailVerified: true,
        organizationId: DEFAULT_ORGANIZATION_ID,
      },
    });
  }
  await ensureHandoffAgents();
  const users = await prisma.user.findMany({
    where: { email: { in: DEMO_ACCOUNTS.map((a) => a.email) } },
    select: { id: true, email: true, role: true },
  });
  for (const u of users) {
    const n = await prisma.account.count({ where: { userId: u.id } });
    console.log("ready", u.email, u.role, "accounts", n);
  }
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("ensure-demo-logins failed", err instanceof Error ? err.message : "error");
  process.exit(1);
});
