import { DEFAULT_ORGANIZATION_ID } from "@/types";
import { prisma } from "@/lib/prisma";

/** Tenant scope for knowledge. Logged-in users use User.organizationId. */
export async function knowledgeOrgId(userId?: string | null) {
  if (!userId) return DEFAULT_ORGANIZATION_ID;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { organizationId: true },
  });
  return user?.organizationId || DEFAULT_ORGANIZATION_ID;
}
