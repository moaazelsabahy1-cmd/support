/**
 * Non-destructive: create/activate four Human Support agents on the default org.
 * Does not delete conversations or messages. Not prisma migrate reset / db:seed.
 */
import { connectDb, prisma } from "../lib/db";
import { auth } from "../lib/auth";
import { HANDOFF_AGENT_ACCOUNTS } from "../lib/demo-accounts";
import { DEFAULT_ORGANIZATION_ID } from "../types";

export async function ensureHandoffAgents() {
  for (const account of HANDOFF_AGENT_ACCOUNTS) {
    const existing = await prisma.user.findUnique({ where: { email: account.email } });
    const accounts = existing ? await prisma.account.count({ where: { userId: existing.id } }) : 0;
    if (!existing) {
      await auth.api.signUpEmail({
        body: { name: account.name, email: account.email, password: account.password },
      });
    } else if (accounts === 0) {
      continue;
    }
    await prisma.user.update({
      where: { email: account.email },
      data: {
        name: account.name,
        role: "AGENT",
        status: "ACTIVE",
        emailVerified: true,
        organizationId: DEFAULT_ORGANIZATION_ID,
        createdAt: new Date(Date.UTC(2024, 0, 1, 0, 0, HANDOFF_AGENT_ACCOUNTS.indexOf(account))),
      },
    });
  }
}

async function main() {
  await connectDb();
  await ensureHandoffAgents();
  const users = await prisma.user.findMany({
    where: { email: { in: HANDOFF_AGENT_ACCOUNTS.map((a) => a.email) } },
    select: { email: true, role: true, status: true, organizationId: true },
    orderBy: { createdAt: "asc" },
  });
  for (const u of users) {
    console.log("handoff_agent", u.email, u.role, u.status, u.organizationId);
  }
  await prisma.$disconnect();
}

if (process.argv[1]?.includes("ensure-handoff-agents")) {
  main().catch((err) => {
    console.error("ensure-handoff-agents failed", err instanceof Error ? err.message : "error");
    process.exit(1);
  });
}
