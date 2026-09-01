import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { ingestSource } from "@/lib/ai/ingest";
import { aiLog, aiWarn } from "@/lib/ai/log";
import { AppError } from "@/lib/api-response";
import { knowledgeOrgId } from "@/lib/ai/org";
import { newId } from "@/lib/id";

/**
 * In-process index queue. Jobs are lost if the Node process restarts.
 * No Redis/worker is configured; suitable for a single custom `server.ts` instance.
 */
export async function enqueueIndexJob(sourceId: string, opts?: { wait?: boolean }) {
  const jobId = randomUUID();
  const source = await prisma.knowledgeSource.findUnique({
    where: { id: sourceId },
    select: { organizationId: true },
  });
  await prisma.knowledgeIndexJob.create({
    data: {
      id: newId(),
      jobId,
      sourceId,
      organizationId: source?.organizationId || (await knowledgeOrgId()),
      status: "PENDING",
    },
  });
  if (opts?.wait) {
    await runIndexJob(jobId);
  } else {
    setImmediate(() => {
      void runIndexJob(jobId);
    });
  }
  aiLog("knowledge", "enqueued index job", { jobId, wait: Boolean(opts?.wait) });
  return jobId;
}

export async function approveKnowledgeSource(id: string, opts?: { wait?: boolean }) {
  const source = await prisma.knowledgeSource.findUnique({ where: { id } });
  if (!source) throw new AppError("NOT_FOUND", "Source not found", 404);
  await prisma.knowledgeSource.update({
    where: { id: source.id },
    data: { status: "PENDING", errorCode: null, errorMessage: null },
  });
  const jobId = await enqueueIndexJob(source.id, { wait: opts?.wait });
  if (opts?.wait) {
    const job = await prisma.knowledgeIndexJob.findUnique({ where: { jobId } });
    if (job?.status === "FAILED") {
      throw new Error(job.error || "Index job failed");
    }
  }
  return { id: source.id, jobId };
}

export async function runIndexJob(jobId: string) {
  const job = await prisma.knowledgeIndexJob.findUnique({ where: { jobId } });
  if (!job) return;
  await prisma.knowledgeIndexJob.update({
    where: { jobId },
    data: { status: "PROCESSING", startedAt: new Date() },
  });
  try {
    await ingestSource(job.sourceId);
    await prisma.knowledgeIndexJob.update({
      where: { jobId },
      data: { status: "COMPLETED", completedAt: new Date(), error: null },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Index job failed";
    aiWarn("knowledge", "index job failed", { jobId, error: message });
    await prisma.knowledgeIndexJob.update({
      where: { jobId },
      data: { status: "FAILED", completedAt: new Date(), error: message },
    });
  }
}
