import { prisma } from "@/lib/db";
import { newId } from "@/lib/id";

export async function findOrCreateCustomerConversation(opts: {
  customerId: string;
  organizationId: string;
  sessionId?: string;
  /** When true (AI turns), do not reuse an already-paused thread unless it matches sessionId. */
  attachUnpausedOnly?: boolean;
}) {
  if (opts.sessionId) {
    const bySession = await prisma.conversation.findFirst({
      where: { customerId: opts.customerId, sourceSessionId: opts.sessionId },
    });
    if (bySession) return bySession;
  }

  const unpaused = await prisma.conversation.findFirst({
    where: { customerId: opts.customerId, status: "OPEN", aiPaused: false },
    orderBy: { updatedAt: "desc" },
  });
  let conv = unpaused;
  if (!conv && !opts.attachUnpausedOnly) {
    conv = await prisma.conversation.findFirst({
      where: { customerId: opts.customerId, status: "OPEN" },
      orderBy: { updatedAt: "desc" },
    });
  }
  if (!conv) {
    return prisma.conversation.create({
      data: {
        id: newId(),
        customerId: opts.customerId,
        organizationId: opts.organizationId,
        status: "OPEN",
        sourceSessionId: opts.sessionId || null,
      },
    });
  }
  if (opts.sessionId && !conv.sourceSessionId) {
    return prisma.conversation.update({
      where: { id: conv.id },
      data: { sourceSessionId: opts.sessionId, organizationId: opts.organizationId },
    });
  }
  return conv;
}
