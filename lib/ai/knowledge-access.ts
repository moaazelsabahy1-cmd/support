import { prisma } from "@/lib/db";
import { AppError } from "@/lib/api-response";
import { knowledgeOrgId } from "@/lib/ai/org";
import { requireRoles } from "@/lib/session";
import type { SessionUser } from "@/types";

export async function requireKnowledgeAdmin(): Promise<SessionUser> {
  return requireRoles(["ADMIN", "SUPER_ADMIN"]);
}

/** Admin Q&A tab: manual pairs plus approved chat/ticket Q&A. */
export function knowledgeQaSurfaceWhere() {
  return {
    OR: [{ type: "QA" as const }, { type: "CONVERSATION" as const, status: "READY" as const }],
  };
}

export function assertSameKnowledgeOrg(sourceOrganizationId: string, userOrganizationId: string) {
  if (sourceOrganizationId !== userOrganizationId) {
    throw new AppError("FORBIDDEN", "You cannot access this knowledge source", 403);
  }
}

export async function loadOrgKnowledgeSource(id: string, userId: string) {
  const source = await prisma.knowledgeSource.findUnique({ where: { id } });
  if (!source) throw new AppError("NOT_FOUND", "Source not found", 404);
  const org = await knowledgeOrgId(userId);
  assertSameKnowledgeOrg(source.organizationId, org);
  return source;
}
