/**
 * One-off Mongo → Postgres copy. Preserves 24-char hex IDs.
 * Reads MONGODB_URI / MONGODB_DB_NAME from the environment; does not wipe Mongo.
 *
 *   npx tsx scripts/migrate-mongo-to-postgres.ts
 */
import { MongoClient, type Document, type ObjectId } from "mongodb";
import { PrismaClient, type Prisma } from "@prisma/client";
import { newId } from "../lib/id";

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://solvio:solvio@localhost:5433/solvio";
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || "solvio";

type Counts = { mongo: number; migrated: number; skipped: number; failed: number };

function hex(id: unknown): string | null {
  if (!id) return null;
  if (typeof id === "string") return id;
  if (typeof id === "object" && id && "toHexString" in id) {
    return (id as ObjectId).toHexString();
  }
  return String(id);
}

function asDate(value: unknown, fallback = new Date()) {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return fallback;
}

function mapStatus(status: unknown, allowed: string[], fallback: string) {
  const s = String(status || fallback);
  return allowed.includes(s) ? s : fallback;
}

async function main() {
  const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
  const mongo = new MongoClient(MONGODB_URI);
  const report: Record<string, Counts> = {};

  const tally = (name: string, patch: Partial<Counts>) => {
    report[name] ||= { mongo: 0, migrated: 0, skipped: 0, failed: 0 };
    Object.assign(report[name], {
      mongo: report[name].mongo + (patch.mongo || 0),
      migrated: report[name].migrated + (patch.migrated || 0),
      skipped: report[name].skipped + (patch.skipped || 0),
      failed: report[name].failed + (patch.failed || 0),
    });
  };

  try {
    await mongo.connect();
    const db = mongo.db(MONGODB_DB_NAME);
    await prisma.$connect();

    await prisma.organization.upsert({
      where: { id: "default" },
      create: { id: "default", name: "Solvio" },
      update: {},
    });
    tally("organizations", { mongo: 0, migrated: 1 });

    async function copyCollection(
      name: string,
      map: (doc: Document) => Promise<"migrated" | "skipped">,
    ) {
      const docs = await db.collection(name).find().toArray();
      tally(name, { mongo: docs.length });
      for (const doc of docs) {
        try {
          const result = await map(doc);
          tally(name, { [result]: 1 });
        } catch (error) {
          tally(name, { failed: 1 });
          console.warn(`Failed ${name} ${hex(doc._id)}`, error instanceof Error ? error.message : error);
        }
      }
    }

    await copyCollection("users", async (doc) => {
      const id = hex(doc._id);
      if (!id) return "skipped";
      const existing = await prisma.user.findUnique({ where: { id } });
      if (existing) return "skipped";
      await prisma.user.create({
        data: {
          id,
          name: String(doc.name || "User"),
          email: String(doc.email || `${id}@migrated.local`).toLowerCase(),
          emailVerified: Boolean(doc.emailVerified),
          image: doc.image ? String(doc.image) : null,
          createdAt: asDate(doc.createdAt),
          updatedAt: asDate(doc.updatedAt),
          role: mapStatus(doc.role, ["CUSTOMER", "AGENT", "ADMIN", "SUPER_ADMIN"], "CUSTOMER") as Prisma.UserCreateInput["role"],
          status: mapStatus(doc.status, ["ACTIVE", "DEACTIVATED"], "ACTIVE") as Prisma.UserCreateInput["status"],
          avatarUrl: doc.avatarUrl ? String(doc.avatarUrl) : null,
          phone: doc.phone ? String(doc.phone) : null,
          lastSeenAt: doc.lastSeenAt ? asDate(doc.lastSeenAt) : null,
        },
      });
      return "migrated";
    });

    for (const name of ["sessions", "accounts", "verifications"] as const) {
      await copyCollection(name, async (doc) => {
        const id = hex(doc._id) || newId();
        if (name === "sessions") {
          const token = String(doc.token || id);
          const exists = await prisma.session.findFirst({ where: { OR: [{ id }, { token }] } });
          if (exists) return "skipped";
          const userId = hex(doc.userId);
          if (!userId) return "skipped";
          await prisma.session.create({
            data: {
              id,
              expiresAt: asDate(doc.expiresAt),
              token,
              createdAt: asDate(doc.createdAt),
              updatedAt: asDate(doc.updatedAt),
              ipAddress: doc.ipAddress ? String(doc.ipAddress) : null,
              userAgent: doc.userAgent ? String(doc.userAgent) : null,
              userId,
            },
          });
        } else if (name === "accounts") {
          const exists = await prisma.account.findUnique({ where: { id } });
          if (exists) return "skipped";
          const userId = hex(doc.userId);
          if (!userId) return "skipped";
          await prisma.account.create({
            data: {
              id,
              accountId: String(doc.accountId || id),
              providerId: String(doc.providerId || "credential"),
              userId,
              accessToken: doc.accessToken ? String(doc.accessToken) : null,
              refreshToken: doc.refreshToken ? String(doc.refreshToken) : null,
              idToken: doc.idToken ? String(doc.idToken) : null,
              accessTokenExpiresAt: doc.accessTokenExpiresAt ? asDate(doc.accessTokenExpiresAt) : null,
              refreshTokenExpiresAt: doc.refreshTokenExpiresAt ? asDate(doc.refreshTokenExpiresAt) : null,
              scope: doc.scope ? String(doc.scope) : null,
              password: doc.password ? String(doc.password) : null,
              createdAt: asDate(doc.createdAt),
              updatedAt: asDate(doc.updatedAt),
            },
          });
        } else {
          const exists = await prisma.verification.findUnique({ where: { id } });
          if (exists) return "skipped";
          await prisma.verification.create({
            data: {
              id,
              identifier: String(doc.identifier || ""),
              value: String(doc.value || ""),
              expiresAt: asDate(doc.expiresAt),
              createdAt: asDate(doc.createdAt),
              updatedAt: asDate(doc.updatedAt),
            },
          });
        }
        return "migrated";
      });
    }

    await copyCollection("departments", async (doc) => {
      const id = hex(doc._id);
      if (!id) return "skipped";
      const exists = await prisma.department.findUnique({ where: { id } });
      if (exists) return "skipped";
      await prisma.department.create({
        data: {
          id,
          name: String(doc.name),
          slug: String(doc.slug),
          description: doc.description ? String(doc.description) : null,
          isDefault: Boolean(doc.isDefault),
          slaFirstResponseMinutes: Number(doc.slaFirstResponseMinutes || 60),
          slaResolveMinutes: Number(doc.slaResolveMinutes || 1440),
          createdAt: asDate(doc.createdAt),
          updatedAt: asDate(doc.updatedAt),
        },
      });
      return "migrated";
    });

    await prisma.$executeRawUnsafe(`
      UPDATE "user" u SET department_id = d.id
      FROM departments d
      WHERE u.department_id IS NOT NULL AND u.department_id = d.id
    `).catch(() => undefined);

    const mongoUsers = await db.collection("users").find().toArray();
    for (const u of mongoUsers) {
      const id = hex(u._id);
      const deptId = hex(u.departmentId);
      if (!id || !deptId) continue;
      const dept = await prisma.department.findUnique({ where: { id: deptId } });
      if (!dept) continue;
      await prisma.user.update({ where: { id }, data: { departmentId: deptId } }).catch(() => undefined);
    }

    await copyCollection("tickets", async (doc) => {
      const id = hex(doc._id);
      if (!id) return "skipped";
      const exists = await prisma.ticket.findUnique({ where: { id } });
      if (exists) return "skipped";
      const customerId = hex(doc.customerId);
      if (!customerId) return "skipped";
      await prisma.ticket.create({
        data: {
          id,
          number: String(doc.number),
          title: String(doc.title),
          description: String(doc.description),
          customerId,
          assignedAgentId: hex(doc.assignedAgentId),
          departmentId: hex(doc.departmentId),
          status: mapStatus(doc.status, ["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER", "WAITING_AGENT", "RESOLVED", "CLOSED"], "OPEN") as Prisma.TicketCreateInput["status"],
          priority: mapStatus(doc.priority, ["LOW", "MEDIUM", "HIGH", "URGENT"], "MEDIUM") as Prisma.TicketCreateInput["priority"],
          category: doc.category ? String(doc.category) : null,
          tags: Array.isArray(doc.tags) ? doc.tags.map(String) : [],
          csat: typeof doc.csat === "number" ? doc.csat : null,
          createdAt: asDate(doc.createdAt),
          updatedAt: asDate(doc.updatedAt),
          resolvedAt: doc.resolvedAt ? asDate(doc.resolvedAt) : null,
          closedAt: doc.closedAt ? asDate(doc.closedAt) : null,
          firstResponseAt: doc.firstResponseAt ? asDate(doc.firstResponseAt) : null,
        },
      });
      return "migrated";
    });

    await copyCollection("ticket_history", async (doc) => {
      const id = hex(doc._id) || newId();
      const exists = await prisma.ticketHistory.findUnique({ where: { id } });
      if (exists) return "skipped";
      const ticketId = hex(doc.ticketId);
      const actorId = hex(doc.actorId);
      if (!ticketId || !actorId) return "skipped";
      await prisma.ticketHistory.create({
        data: {
          id,
          ticketId,
          actorId,
          action: String(doc.action || "updated"),
          from: doc.from ? String(doc.from) : null,
          to: doc.to ? String(doc.to) : null,
          meta: (doc.meta as Prisma.InputJsonValue) ?? undefined,
          createdAt: asDate(doc.createdAt),
        },
      });
      return "migrated";
    });

    await copyCollection("comments", async (doc) => {
      const id = hex(doc._id);
      if (!id) return "skipped";
      if (await prisma.comment.findUnique({ where: { id } })) return "skipped";
      const ticketId = hex(doc.ticketId);
      const authorId = hex(doc.authorId);
      if (!ticketId || !authorId) return "skipped";
      await prisma.comment.create({
        data: {
          id,
          ticketId,
          authorId,
          body: String(doc.body || ""),
          internal: Boolean(doc.internal),
          createdAt: asDate(doc.createdAt),
          updatedAt: asDate(doc.updatedAt),
        },
      });
      return "migrated";
    });

    await copyCollection("attachments", async (doc) => {
      const id = hex(doc._id);
      if (!id) return "skipped";
      if (await prisma.attachment.findUnique({ where: { id } })) return "skipped";
      const ownerId = hex(doc.ownerId);
      if (!ownerId) return "skipped";
      await prisma.attachment.create({
        data: {
          id,
          ownerId,
          ticketId: hex(doc.ticketId),
          messageId: hex(doc.messageId),
          filename: String(doc.filename),
          mimeType: String(doc.mimeType || "application/octet-stream"),
          size: Number(doc.size || 0),
          key: String(doc.key),
          createdAt: asDate(doc.createdAt),
        },
      });
      return "migrated";
    });

    await copyCollection("conversations", async (doc) => {
      const id = hex(doc._id);
      if (!id) return "skipped";
      if (await prisma.conversation.findUnique({ where: { id } })) return "skipped";
      const customerId = hex(doc.customerId);
      if (!customerId) return "skipped";
      await prisma.conversation.create({
        data: {
          id,
          customerId,
          agentId: hex(doc.agentId),
          ticketId: hex(doc.ticketId),
          status: doc.status === "CLOSED" ? "CLOSED" : "OPEN",
          lastMessageAt: doc.lastMessageAt ? asDate(doc.lastMessageAt) : null,
          createdAt: asDate(doc.createdAt),
          updatedAt: asDate(doc.updatedAt),
        },
      });
      return "migrated";
    });

    await copyCollection("messages", async (doc) => {
      const id = hex(doc._id);
      if (!id) return "skipped";
      if (await prisma.message.findUnique({ where: { id } })) return "skipped";
      const conversationId = hex(doc.conversationId);
      const senderId = hex(doc.senderId);
      if (!conversationId || !senderId) return "skipped";
      await prisma.message.create({
        data: {
          id,
          conversationId,
          senderId,
          body: String(doc.body || ""),
          attachmentIds: Array.isArray(doc.attachmentIds) ? doc.attachmentIds.map((x) => hex(x)!).filter(Boolean) : [],
          readBy: Array.isArray(doc.readBy) ? doc.readBy.map((x) => hex(x)!).filter(Boolean) : [],
          internal: Boolean(doc.internal),
          createdAt: asDate(doc.createdAt),
        },
      });
      return "migrated";
    });

    await copyCollection("meetings", async (doc) => {
      const id = hex(doc._id);
      if (!id) return "skipped";
      if (await prisma.meeting.findUnique({ where: { id } })) return "skipped";
      const customerId = hex(doc.customerId);
      if (!customerId) return "skipped";
      await prisma.meeting.create({
        data: {
          id,
          customerId,
          agentId: hex(doc.agentId),
          title: String(doc.title),
          description: doc.description ? String(doc.description) : null,
          date: asDate(doc.date),
          startTime: String(doc.startTime || "09:00"),
          endTime: String(doc.endTime || "09:30"),
          status: mapStatus(doc.status, ["REQUESTED", "CONFIRMED", "CANCELLED", "COMPLETED"], "REQUESTED") as Prisma.MeetingCreateInput["status"],
          notes: doc.notes ? String(doc.notes) : null,
          createdAt: asDate(doc.createdAt),
          updatedAt: asDate(doc.updatedAt),
        },
      });
      return "migrated";
    });

    await copyCollection("kb_categories", async (doc) => {
      const id = hex(doc._id);
      if (!id) return "skipped";
      if (await prisma.kbCategory.findUnique({ where: { id } })) return "skipped";
      await prisma.kbCategory.create({
        data: {
          id,
          name: String(doc.name),
          slug: String(doc.slug),
          description: doc.description ? String(doc.description) : null,
          createdAt: asDate(doc.createdAt),
          updatedAt: asDate(doc.updatedAt),
        },
      });
      return "migrated";
    });

    await copyCollection("kb_articles", async (doc) => {
      const id = hex(doc._id);
      if (!id) return "skipped";
      if (await prisma.kbArticle.findUnique({ where: { id } })) return "skipped";
      const categoryId = hex(doc.categoryId);
      const authorId = hex(doc.authorId);
      if (!categoryId || !authorId) return "skipped";
      await prisma.kbArticle.create({
        data: {
          id,
          title: String(doc.title),
          slug: String(doc.slug),
          excerpt: String(doc.excerpt || ""),
          body: String(doc.body || ""),
          categoryId,
          tags: Array.isArray(doc.tags) ? doc.tags.map(String) : [],
          featured: Boolean(doc.featured),
          published: Boolean(doc.published),
          authorId,
          createdAt: asDate(doc.createdAt),
          updatedAt: asDate(doc.updatedAt),
        },
      });
      return "migrated";
    });

    const mapLegacyStatus = (status: unknown) => {
      if (status === "INDEXED") return "READY" as const;
      return mapStatus(status, ["PENDING", "PROCESSING", "READY", "FAILED", "DISABLED"], "PENDING") as Prisma.KnowledgeSourceCreateInput["status"];
    };

    async function upsertSource(id: string, data: Omit<Prisma.KnowledgeSourceUncheckedCreateInput, "id">) {
      const exists = await prisma.knowledgeSource.findUnique({ where: { id } });
      if (exists) return "skipped" as const;
      await prisma.knowledgeSource.create({ data: { ...data, id } });
      return "migrated" as const;
    }

    await copyCollection("ai_knowledge_sources", async (doc) => {
      const id = hex(doc._id);
      if (!id) return "skipped";
      return upsertSource(id, {
        organizationId: String(doc.organizationId || "default"),
        type: mapStatus(doc.type, ["QA", "FILE", "WEB"], "QA") as Prisma.KnowledgeSourceUncheckedCreateInput["type"],
        title: String(doc.title || "Source"),
        description: doc.description ? String(doc.description) : null,
        status: mapLegacyStatus(doc.status),
        sourceUrl: doc.sourceUrl ? String(doc.sourceUrl) : null,
        fileId: hex(doc.fileId),
        storageKey: doc.storageKey ? String(doc.storageKey) : null,
        filename: doc.filename ? String(doc.filename) : null,
        mimeType: doc.mimeType ? String(doc.mimeType) : null,
        size: typeof doc.size === "number" ? doc.size : null,
        category: doc.category ? String(doc.category) : null,
        categoryId: hex(doc.categoryId),
        tags: Array.isArray(doc.tags) ? doc.tags.map(String) : [],
        question: doc.question ? String(doc.question) : null,
        answer: doc.answer ? String(doc.answer) : null,
        createdBy: hex(doc.createdBy),
        createdAt: asDate(doc.createdAt),
        updatedAt: asDate(doc.updatedAt),
        indexedAt: doc.indexedAt ? asDate(doc.indexedAt) : null,
        errorCode: doc.errorCode ? String(doc.errorCode) : null,
        errorMessage: doc.errorMessage ? String(doc.errorMessage) : null,
        chunkCount: Number(doc.chunkCount || 0),
        embeddingModel: doc.embeddingModel ? String(doc.embeddingModel) : null,
        embeddingDims: typeof doc.embeddingDims === "number" ? doc.embeddingDims : null,
        metadata: (doc.metadata as Prisma.InputJsonValue) ?? undefined,
      });
    });

    for (const [col, type] of [
      ["ai_training_pairs", "QA"],
      ["ai_files", "FILE"],
      ["ai_web_sources", "WEB"],
    ] as const) {
      await copyCollection(col, async (doc) => {
        const id = hex(doc._id);
        if (!id) return "skipped";
        if (type === "QA") {
          return upsertSource(id, {
            organizationId: "default",
            type: "QA",
            title: String(doc.question || "Q&A").slice(0, 120),
            status: doc.enabled === false ? "DISABLED" : "PENDING",
            question: String(doc.question || ""),
            answer: String(doc.answer || ""),
            tags: [],
            chunkCount: 0,
            createdAt: asDate(doc.createdAt),
            updatedAt: asDate(doc.updatedAt),
          });
        }
        if (type === "FILE") {
          return upsertSource(id, {
            organizationId: "default",
            type: "FILE",
            title: String(doc.filename || "File"),
            status: mapLegacyStatus(doc.status),
            storageKey: doc.key ? String(doc.key) : null,
            filename: doc.filename ? String(doc.filename) : null,
            mimeType: doc.mimeType ? String(doc.mimeType) : null,
            size: typeof doc.size === "number" ? doc.size : null,
            fileId: id,
            tags: [],
            chunkCount: 0,
            errorMessage: doc.error ? String(doc.error) : null,
            createdAt: asDate(doc.createdAt),
            updatedAt: asDate(doc.updatedAt),
          });
        }
        return upsertSource(id, {
          organizationId: "default",
          type: "WEB",
          title: String(doc.title || doc.url || "Web"),
          status: mapLegacyStatus(doc.status),
          sourceUrl: doc.url ? String(doc.url) : null,
          tags: [],
          chunkCount: 0,
          errorMessage: doc.error ? String(doc.error) : null,
          createdAt: asDate(doc.createdAt),
          updatedAt: asDate(doc.updatedAt),
        });
      });
    }

    await copyCollection("ai_chunks", async (doc) => {
      const id = hex(doc._id);
      if (!id) return "skipped";
      if (await prisma.knowledgeChunk.findUnique({ where: { id } })) return "skipped";
      const sourceId = hex(doc.sourceId);
      if (!sourceId) return "skipped";
      const sourceTypeRaw = String(doc.sourceType || "QA");
      const sourceType =
        sourceTypeRaw === "file" || sourceTypeRaw === "FILE"
          ? "FILE"
          : sourceTypeRaw === "web" || sourceTypeRaw === "WEB"
            ? "WEB"
            : "QA";
      const embedding = Array.isArray(doc.embedding) ? doc.embedding.map(Number) : [];
      await prisma.knowledgeChunk.create({
        data: {
          id,
          organizationId: String(doc.organizationId || "default"),
          sourceType,
          sourceId,
          chunkId: String(doc.chunkId || id),
          text: String(doc.text || ""),
          order: Number(doc.order || 0),
          metadata: (doc.metadata as Prisma.InputJsonValue) ?? undefined,
          embedding,
          embeddingStatus: embedding.length ? "READY" : "PENDING",
          embeddingModel: doc.embeddingModel ? String(doc.embeddingModel) : null,
          embeddingDims: embedding.length || null,
          qdrantId: doc.qdrantId ? String(doc.qdrantId) : null,
          createdAt: asDate(doc.createdAt),
        },
      });
      return "migrated";
    });

    await copyCollection("ai_index_jobs", async (doc) => {
      const id = hex(doc._id) || newId();
      if (await prisma.knowledgeIndexJob.findFirst({ where: { OR: [{ id }, { jobId: String(doc.jobId || id) }] } })) {
        return "skipped";
      }
      const sourceId = hex(doc.sourceId);
      if (!sourceId) return "skipped";
      await prisma.knowledgeIndexJob.create({
        data: {
          id,
          jobId: String(doc.jobId || id),
          sourceId,
          organizationId: String(doc.organizationId || "default"),
          status: mapStatus(doc.status, ["PENDING", "PROCESSING", "COMPLETED", "FAILED"], "PENDING") as Prisma.KnowledgeIndexJobCreateInput["status"],
          startedAt: doc.startedAt ? asDate(doc.startedAt) : null,
          completedAt: doc.completedAt ? asDate(doc.completedAt) : null,
          error: doc.error ? String(doc.error) : null,
          createdAt: asDate(doc.createdAt),
        },
      });
      return "migrated";
    });

    await copyCollection("ai_chat_logs", async (doc) => {
      const id = hex(doc._id) || newId();
      if (await prisma.aiChatLog.findUnique({ where: { id } })) return "skipped";
      await prisma.aiChatLog.create({
        data: {
          id,
          userId: hex(doc.userId),
          sessionId: String(doc.sessionId || newId()),
          question: doc.question ? String(doc.question) : null,
          answer: doc.answer ? String(doc.answer) : null,
          message: String(doc.message || doc.question || ""),
          response: String(doc.response || doc.answer || ""),
          sources: (doc.sources as Prisma.InputJsonValue) ?? [],
          retrievalScores: Array.isArray(doc.retrievalScores) ? doc.retrievalScores.map(Number) : [],
          tokens: typeof doc.tokens === "number" ? doc.tokens : null,
          model: doc.model ? String(doc.model) : null,
          embeddingModel: doc.embeddingModel ? String(doc.embeddingModel) : null,
          escalated: Boolean(doc.escalated),
          fallbackUsed: doc.fallbackUsed == null ? null : Boolean(doc.fallbackUsed),
          confidence: typeof doc.confidence === "number" ? doc.confidence : null,
          createdAt: asDate(doc.createdAt),
        },
      });
      return "migrated";
    });

    await copyCollection("notifications", async (doc) => {
      const id = hex(doc._id);
      if (!id) return "skipped";
      if (await prisma.notification.findUnique({ where: { id } })) return "skipped";
      const userId = hex(doc.userId);
      if (!userId) return "skipped";
      await prisma.notification.create({
        data: {
          id,
          userId,
          title: String(doc.title),
          body: String(doc.body),
          href: doc.href ? String(doc.href) : null,
          type: String(doc.type || "info"),
          read: Boolean(doc.read),
          createdAt: asDate(doc.createdAt),
        },
      });
      return "migrated";
    });

    await copyCollection("push_subscriptions", async (doc) => {
      const id = hex(doc._id) || newId();
      if (await prisma.pushSubscription.findFirst({ where: { OR: [{ id }, { endpoint: String(doc.endpoint) }] } })) {
        return "skipped";
      }
      const userId = hex(doc.userId);
      if (!userId) return "skipped";
      await prisma.pushSubscription.create({
        data: {
          id,
          userId,
          endpoint: String(doc.endpoint),
          keys: (doc.keys as Prisma.InputJsonValue) ?? {},
          createdAt: asDate(doc.createdAt),
        },
      });
      return "migrated";
    });

    await copyCollection("contact_submissions", async (doc) => {
      const id = hex(doc._id) || newId();
      if (await prisma.contactSubmission.findUnique({ where: { id } })) return "skipped";
      await prisma.contactSubmission.create({
        data: {
          id,
          name: String(doc.name),
          email: String(doc.email),
          message: String(doc.message),
          sessionId: doc.sessionId ? String(doc.sessionId) : null,
          ticketNumber: doc.ticketNumber ? String(doc.ticketNumber) : null,
          aiContext: doc.aiContext ? String(doc.aiContext) : null,
          createdAt: asDate(doc.createdAt),
        },
      });
      return "migrated";
    });

    await copyCollection("newsletter_subscribers", async (doc) => {
      const id = hex(doc._id) || newId();
      const email = String(doc.email || "").toLowerCase();
      if (await prisma.newsletterSubscriber.findFirst({ where: { OR: [{ id }, { email }] } })) return "skipped";
      await prisma.newsletterSubscriber.create({
        data: { id, email, createdAt: asDate(doc.createdAt) },
      });
      return "migrated";
    });

    const settings = await db.collection("settings").findOne({ _id: "app" as never });
    if (settings) {
      await prisma.settings.upsert({
        where: { id: "app" },
        create: {
          id: "app",
          appName: String(settings.appName || "Solvio"),
          branding: (settings.branding as Prisma.InputJsonValue) ?? { primaryColor: "#14b8a6" },
          widget: (settings.widget as Prisma.InputJsonValue) ?? {},
          integrations: (settings.integrations as Prisma.InputJsonValue) ?? {},
        },
        update: {
          appName: String(settings.appName || "Solvio"),
          branding: (settings.branding as Prisma.InputJsonValue) ?? { primaryColor: "#14b8a6" },
          widget: (settings.widget as Prisma.InputJsonValue) ?? {},
        },
      });
      tally("settings", { mongo: 1, migrated: 1 });
    }

    const counters = await db.collection("counters").find().toArray();
    tally("counters", { mongo: counters.length });
    for (const c of counters) {
      const year = Number(String(c._id).replace("ticket-", "")) || new Date().getFullYear();
      await prisma.ticketCounter.upsert({
        where: { year },
        create: { year, seq: Number(c.seq || 0) },
        update: { seq: Number(c.seq || 0) },
      });
      tally("counters", { migrated: 1 });
    }

    console.log("Mongo → Postgres copy report");
    console.table(report);
  } finally {
    await mongo.close();
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
