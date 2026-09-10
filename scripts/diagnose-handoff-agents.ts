/**
 * Prints handoff agent eligibility for the default org. Never logs passwords or DATABASE_URL.
 */
import { connectDb, prisma } from "../lib/db";
import { HANDOFF_AGENT_ACCOUNTS } from "../lib/demo-accounts";
import { DEFAULT_ORGANIZATION_ID } from "../types";
import { listHandoffAgents } from "../lib/ai/handoff-queue";
import { redactedDatabaseFingerprint } from "../lib/db-fingerprint";

async function main() {
  await connectDb();
  const emails = HANDOFF_AGENT_ACCOUNTS.map((a) => a.email);
  const rows = await prisma.user.findMany({
    where: { email: { in: [...emails] } },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      organizationId: true,
      departmentId: true,
    },
  });
  console.log("env", process.env.NODE_ENV);
  console.log("db", redactedDatabaseFingerprint());
  console.log("rows", rows.length);
  for (const email of emails) {
    const u = rows.find((r) => r.email === email);
    if (!u) {
      console.log("missing", email);
      continue;
    }
    console.log(
      "user",
      u.email,
      u.id,
      u.name,
      u.role,
      u.status,
      u.organizationId,
      u.departmentId || "none",
    );
  }
  const listed = await listHandoffAgents(DEFAULT_ORGANIZATION_ID);
  console.log(
    "listed",
    listed.length,
    listed.map((a) => a.email).join(","),
  );
  const eligible = rows.filter(
    (r) => r.role === "AGENT" && r.status === "ACTIVE" && r.organizationId === DEFAULT_ORGANIZATION_ID,
  );
  await prisma.$disconnect();
  if (eligible.length !== 4 || listed.length !== 4) {
    console.error("expected 4 ACTIVE AGENT users on default org matching listHandoffAgents");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("diagnose-handoff-agents failed", err instanceof Error ? err.message : "error");
  process.exit(1);
});
