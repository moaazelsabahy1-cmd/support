/**
 * Read-only check: PENDING_REVIEW conversation sources vs admin org. No emails, no API keys.
 */
import { prisma, ensureAppDefaults } from "../lib/db";
import { knowledgeOrgId } from "../lib/ai/org";
import { DEFAULT_ORGANIZATION_ID } from "../types";

async function main() {
  await ensureAppDefaults();
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    select: { id: true, role: true, organizationId: true },
    orderBy: { createdAt: "asc" },
  });
  const adminOrg = admin?.organizationId || (admin ? await knowledgeOrgId(admin.id) : DEFAULT_ORGANIZATION_ID);
  const pending = await prisma.knowledgeSource.findMany({
    where: { status: "PENDING_REVIEW", organizationId: adminOrg },
    select: { id: true, type: true, status: true, organizationId: true, title: true, metadata: true },
    take: 20,
  });
  console.info(
    JSON.stringify(
      {
        adminRole: admin?.role,
        adminOrganizationId: admin?.organizationId,
        knowledgeOrgId: adminOrg,
        orgsMatch: (admin?.organizationId || DEFAULT_ORGANIZATION_ID) === adminOrg,
        pendingReviewCount: pending.length,
        pending: pending.map((s) => ({
          id: s.id,
          type: s.type,
          status: s.status,
          organizationId: s.organizationId,
          title: s.title.slice(0, 80),
          sourceConversationId: (s.metadata as { sourceConversationId?: string } | null)?.sourceConversationId || null,
        })),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
