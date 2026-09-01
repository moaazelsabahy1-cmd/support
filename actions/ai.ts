"use server";

import { prisma } from "@/lib/db";
import { requirePermission, requireUser } from "@/lib/session";
import { serialize } from "@/lib/serialize";
import {
  knowledgeListSchema,
  knowledgeSourcePatchSchema,
  trainingPairSchema,
  webSourceSchema,
} from "@/lib/validation";
import { handleCustomerAiTurn } from "@/lib/ai/customer-turn";
import { enqueueIndexJob, approveKnowledgeSource } from "@/lib/ai/jobs";
import { deleteKnowledgeSource, removeSourceVectors } from "@/lib/ai/ingest";
import { knowledgeOrgId } from "@/lib/ai/org";
import { escalateAiToHumanAction } from "@/actions/messages";
import { AppError } from "@/lib/api-response";
import { assertSafeHttpUrl } from "@/lib/ai/ssrf";
import { newId } from "@/lib/id";
import type { IndexStatus, KnowledgeSourceType, Prisma } from "@prisma/client";

export async function aiChatAction(message: string, sessionId: string) {
  const user = await requireUser();
  return handleCustomerAiTurn({ userId: user.id, message, sessionId });
}

export async function listKnowledgeSourcesAction(input?: unknown) {
  const user = await requirePermission("ai.sources.manage");
  const raw = (input || {}) as Record<string, unknown>;
  const cleaned = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== "" && v != null));
  const q = knowledgeListSchema.parse(cleaned);
  const where: Prisma.KnowledgeSourceWhereInput = { organizationId: await knowledgeOrgId(user.id) };
  if (q.type) where.type = q.type as KnowledgeSourceType;
  if (q.status) where.status = q.status as IndexStatus;
  if (q.category) where.category = q.category;
  if (q.q) {
    where.OR = [
      { title: { contains: q.q, mode: "insensitive" } },
      { question: { contains: q.q, mode: "insensitive" } },
      { sourceUrl: { contains: q.q, mode: "insensitive" } },
      { filename: { contains: q.q, mode: "insensitive" } },
    ];
  }
  const [items, total] = await Promise.all([
    prisma.knowledgeSource.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.knowledgeSource.count({ where }),
  ]);
  return serialize({ items, total, page: q.page, pageSize: q.pageSize });
}

export async function knowledgeOverviewAction() {
  const user = await requirePermission("ai.sources.manage");
  const org = await knowledgeOrgId(user.id);
  const [total, ready, processing, failed, disabled, pending, pendingReview, chunkCount, last, jobs] = await Promise.all([
    prisma.knowledgeSource.count({ where: { organizationId: org } }),
    prisma.knowledgeSource.count({ where: { organizationId: org, status: "READY" } }),
    prisma.knowledgeSource.count({ where: { organizationId: org, status: "PROCESSING" } }),
    prisma.knowledgeSource.count({ where: { organizationId: org, status: "FAILED" } }),
    prisma.knowledgeSource.count({ where: { organizationId: org, status: "DISABLED" } }),
    prisma.knowledgeSource.count({ where: { organizationId: org, status: "PENDING" } }),
    prisma.knowledgeSource.count({ where: { organizationId: org, status: "PENDING_REVIEW" } }),
    prisma.knowledgeChunk.count({ where: { organizationId: org } }),
    prisma.knowledgeSource.findFirst({
      where: { organizationId: org, indexedAt: { not: null } },
      orderBy: { indexedAt: "desc" },
    }),
    prisma.knowledgeIndexJob.findMany({
      where: { organizationId: org },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);
  return serialize({
    total,
    ready,
    processing,
    failed,
    disabled,
    pending,
    pendingReview,
    chunkCount,
    lastIndexed: last?.indexedAt ?? null,
    jobs,
  });
}

export async function listTrainingPairsAction(q?: string) {
  const user = await requirePermission("ai.train");
  const where: Prisma.KnowledgeSourceWhereInput = { organizationId: await knowledgeOrgId(user.id), type: "QA" };
  if (q) {
    where.OR = [
      { question: { contains: q, mode: "insensitive" } },
      { answer: { contains: q, mode: "insensitive" } },
      { title: { contains: q, mode: "insensitive" } },
    ];
  }
  const items = await prisma.knowledgeSource.findMany({ where, orderBy: { updatedAt: "desc" } });
  return serialize(
    items.map((s) => ({
      _id: s.id,
      question: s.question,
      answer: s.answer,
      enabled: s.status !== "DISABLED",
      category: s.category,
      tags: s.tags,
      status: s.status,
      chunkCount: s.chunkCount,
      errorMessage: s.errorMessage,
      updatedAt: s.updatedAt,
      createdAt: s.createdAt,
    })),
  );
}

export async function upsertTrainingPairAction(id: string | null, input: unknown) {
  const user = await requirePermission("ai.train");
  const data = trainingPairSchema.parse(input);
  const org = await knowledgeOrgId(user.id);
  if (id) {
    const existing = await prisma.knowledgeSource.findFirst({ where: { id, type: "QA" } });
    if (!existing) throw new AppError("NOT_FOUND", "Training pair not found", 404);
    const status = data.enabled === false ? "DISABLED" : "PENDING";
    await prisma.knowledgeSource.update({
      where: { id: existing.id },
      data: {
        question: data.question,
        answer: data.answer,
        title: data.question.slice(0, 120),
        category: data.category,
        tags: data.tags,
        status,
      },
    });
    if (status === "DISABLED") {
      await removeSourceVectors(existing.id);
      return { id };
    }
    await enqueueIndexJob(existing.id);
    return { id };
  }
  const created = await prisma.knowledgeSource.create({
    data: {
      id: newId(),
      organizationId: org,
      type: "QA",
      title: data.question.slice(0, 120),
      status: data.enabled === false ? "DISABLED" : "PENDING",
      question: data.question,
      answer: data.answer,
      category: data.category,
      tags: data.tags,
      createdBy: user.id,
      chunkCount: 0,
    },
  });
  if (data.enabled !== false) await enqueueIndexJob(created.id);
  return { id: created.id };
}

export async function deleteTrainingPairAction(id: string) {
  await requirePermission("ai.train");
  await deleteKnowledgeSource(id);
  return { ok: true };
}

export async function listAiSourcesAction() {
  const user = await requirePermission("ai.sources.manage");
  const org = await knowledgeOrgId(user.id);
  const [files, web] = await Promise.all([
    prisma.knowledgeSource.findMany({ where: { organizationId: org, type: "FILE" }, orderBy: { createdAt: "desc" } }),
    prisma.knowledgeSource.findMany({ where: { organizationId: org, type: "WEB" }, orderBy: { createdAt: "desc" } }),
  ]);
  return serialize({
    files: files.map((f) => ({
      _id: f.id,
      filename: f.filename,
      status: f.status,
      chunkCount: f.chunkCount,
      errorMessage: f.errorMessage,
      indexedAt: f.indexedAt,
    })),
    web: web.map((w) => {
      const meta = (w.metadata || {}) as Record<string, unknown>;
      return {
        _id: w.id,
        url: w.sourceUrl,
        title: w.title,
        status: w.status,
        chunkCount: w.chunkCount,
        errorMessage: w.errorMessage,
        crawlMode: meta.crawlMode,
        indexedAt: w.indexedAt,
      };
    }),
  });
}

export async function ingestWebSourceAction(input: unknown) {
  const user = await requirePermission("ai.sources.manage");
  const data = webSourceSchema.parse(input);
  assertSafeHttpUrl(data.url);
  const created = await prisma.knowledgeSource.create({
    data: {
      id: newId(),
      organizationId: await knowledgeOrgId(user.id),
      type: "WEB",
      title: data.title || data.url,
      status: "PENDING",
      sourceUrl: data.url,
      category: data.category,
      tags: data.tags || [],
      createdBy: user.id,
      chunkCount: 0,
    },
  });
  await enqueueIndexJob(created.id);
  return { id: created.id };
}

export async function patchKnowledgeSourceAction(id: string, input: unknown) {
  await requirePermission("ai.sources.manage");
  const data = knowledgeSourcePatchSchema.parse(input);
  const source = await prisma.knowledgeSource.findUnique({ where: { id } });
  if (!source) throw new AppError("NOT_FOUND", "Source not found", 404);
  const set: Prisma.KnowledgeSourceUpdateInput = {};
  if (data.title) set.title = data.title;
  if (data.description !== undefined) set.description = data.description;
  if (data.category !== undefined) set.category = data.category;
  if (data.tags) set.tags = data.tags;
  if (data.question) set.question = data.question;
  if (data.answer) set.answer = data.answer;
  if (data.enabled === false) {
    set.status = "DISABLED";
    await prisma.knowledgeSource.update({ where: { id: source.id }, data: set });
    await removeSourceVectors(source.id);
    return { id };
  }
  if (data.enabled === true && source.status === "DISABLED") {
    set.status = "PENDING";
  }
  await prisma.knowledgeSource.update({ where: { id: source.id }, data: set });
  const skipIndex = source.status === "PENDING_REVIEW" || source.status === "REJECTED";
  if (!skipIndex && (data.question || data.answer || data.enabled === true)) {
    await enqueueIndexJob(source.id);
  }
  return { id };
}

export async function approveKnowledgeReviewAction(id: string) {
  await requirePermission("ai.sources.manage");
  return approveKnowledgeSource(id);
}

export async function rejectKnowledgeReviewAction(id: string) {
  await requirePermission("ai.sources.manage");
  const source = await prisma.knowledgeSource.findUnique({ where: { id } });
  if (!source) throw new AppError("NOT_FOUND", "Source not found", 404);
  await prisma.knowledgeSource.update({
    where: { id: source.id },
    data: { status: "REJECTED" },
  });
  return { id };
}

export async function reindexKnowledgeSourceAction(id: string) {
  await requirePermission("ai.sources.manage");
  const source = await prisma.knowledgeSource.findUnique({ where: { id } });
  if (!source) throw new AppError("NOT_FOUND", "Source not found", 404);
  await prisma.knowledgeSource.update({
    where: { id: source.id },
    data: { status: "PENDING", errorCode: null, errorMessage: null },
  });
  await enqueueIndexJob(source.id);
  return { id };
}

export async function deleteKnowledgeSourceAction(id: string) {
  await requirePermission("ai.sources.manage");
  await deleteKnowledgeSource(id);
  return { ok: true };
}

export async function listAiLogsAction(sessionId?: string) {
  await requirePermission("ai.manage");
  const items = await prisma.aiChatLog.findMany({
    where: sessionId ? { sessionId } : {},
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return serialize(items);
}

export async function escalateAction(sessionId: string) {
  return escalateAiToHumanAction(sessionId);
}
