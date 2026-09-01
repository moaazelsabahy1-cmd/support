import { connectDb, nextTicketNumber, prisma } from "../lib/db";
import { auth } from "../lib/auth";
import { ALL_PERMISSIONS, ROLE_PERMISSIONS } from "../lib/permissions";
import { ingestSource } from "../lib/ai/ingest";
import { DEFAULT_ORGANIZATION_ID } from "../types";
import { newId } from "../lib/id";
import type { Role } from "@prisma/client";

const ACCOUNTS = [
  { name: "Sofia Reyes", email: "superadmin@solvio.local", password: "SolvioSuper1!", role: "SUPER_ADMIN" as const },
  { name: "Noah Adler", email: "admin@solvio.local", password: "SolvioAdmin1!", role: "ADMIN" as const },
  { name: "Maya Chen", email: "agent@solvio.local", password: "SolvioAgent1!", role: "AGENT" as const },
  { name: "Luis Park", email: "agent2@solvio.local", password: "SolvioAgent1!", role: "AGENT" as const },
  { name: "Ava Patel", email: "customer@solvio.local", password: "SolvioCustomer1!", role: "CUSTOMER" as const },
  { name: "Ben Ortiz", email: "customer2@solvio.local", password: "SolvioCustomer1!", role: "CUSTOMER" as const },
];

async function upsertUser(account: (typeof ACCOUNTS)[number], departmentId?: string) {
  const existing = await prisma.user.findUnique({ where: { email: account.email } });
  if (!existing) {
    await auth.api.signUpEmail({
      body: { name: account.name, email: account.email, password: account.password },
    });
  }
  return prisma.user.update({
    where: { email: account.email },
    data: {
      role: account.role,
      status: "ACTIVE",
      departmentId: account.role === "AGENT" ? departmentId ?? null : null,
    },
  });
}

async function main() {
  await connectDb();

  await prisma.permissionRecord.deleteMany();
  await prisma.roleRecord.deleteMany();
  await prisma.permissionRecord.createMany({
    data: ALL_PERMISSIONS.map((key) => ({ id: newId(), key, description: key })),
  });
  await prisma.roleRecord.createMany({
    data: (Object.keys(ROLE_PERMISSIONS) as Role[]).map((name) => ({
      id: newId(),
      name,
      permissions: ROLE_PERMISSIONS[name],
    })),
  });

  await prisma.comment.deleteMany();
  await prisma.ticketHistory.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.ticketCounter.deleteMany();
  await prisma.knowledgeChunk.deleteMany();
  await prisma.knowledgeIndexJob.deleteMany();
  await prisma.knowledgeSource.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.meeting.deleteMany();
  await prisma.kbArticle.deleteMany();
  await prisma.kbCategory.deleteMany();
  await prisma.user.updateMany({ data: { departmentId: null } });
  await prisma.department.deleteMany();

  const now = new Date();
  const deptDocs = [
    { name: "Technical Support", slug: "technical-support", isDefault: true, slaFirstResponseMinutes: 30, slaResolveMinutes: 480 },
    { name: "Sales", slug: "sales", isDefault: false, slaFirstResponseMinutes: 60, slaResolveMinutes: 1440 },
    { name: "Billing", slug: "billing", isDefault: false, slaFirstResponseMinutes: 45, slaResolveMinutes: 720 },
    { name: "General Support", slug: "general-support", isDefault: false, slaFirstResponseMinutes: 60, slaResolveMinutes: 1440 },
  ];
  await prisma.department.createMany({
    data: deptDocs.map((d) => ({
      id: newId(),
      ...d,
      description: d.name,
    })),
  });
  const tech = await prisma.department.findUnique({ where: { slug: "technical-support" } });

  const users = [];
  for (const account of ACCOUNTS) {
    users.push(await upsertUser(account, tech?.id));
  }
  const superAdmin = users[0];
  const agent = users[2];
  const customer = users[4];
  const customer2 = users[5];

  const statuses = ["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER", "RESOLVED", "CLOSED"] as const;
  for (let i = 0; i < 12; i++) {
    const number = await nextTicketNumber();
    const createdAt = new Date(Date.now() - i * 86400000);
    const status = statuses[i % statuses.length];
    const ticket = await prisma.ticket.create({
      data: {
        id: newId(),
        number,
        title: i % 2 === 0 ? `Cannot access billing portal ${i}` : `Live chat dropped ${i}`,
        description: "Seeded ticket for local development. Steps to reproduce and expected behavior are included.",
        customerId: i % 2 === 0 ? customer.id : customer2.id,
        assignedAgentId: i % 3 === 0 ? null : agent.id,
        departmentId: tech?.id ?? null,
        status,
        priority: (["LOW", "MEDIUM", "HIGH", "URGENT"] as const)[i % 4],
        category: "support",
        tags: ["seed", i % 2 ? "chat" : "billing"],
        createdAt,
        updatedAt: createdAt,
        resolvedAt: status === "RESOLVED" || status === "CLOSED" ? createdAt : null,
        closedAt: status === "CLOSED" ? createdAt : null,
      },
    });
    await prisma.ticketHistory.create({
      data: {
        id: newId(),
        ticketId: ticket.id,
        actorId: customer.id,
        action: "created",
        to: "OPEN",
        createdAt,
      },
    });
    await prisma.comment.create({
      data: {
        id: newId(),
        ticketId: ticket.id,
        authorId: customer.id,
        body: "This started this morning after the last deploy.",
        internal: false,
        createdAt,
        updatedAt: createdAt,
      },
    });
  }

  const conv = await prisma.conversation.create({
    data: {
      id: newId(),
      customerId: customer.id,
      agentId: agent.id,
      status: "OPEN",
      lastMessageAt: now,
    },
  });
  await prisma.message.createMany({
    data: [
      {
        id: newId(),
        conversationId: conv.id,
        senderId: customer.id,
        body: "Hi, the portal is timing out.",
        attachmentIds: [],
        readBy: [customer.id],
        createdAt: now,
      },
      {
        id: newId(),
        conversationId: conv.id,
        senderId: agent.id,
        body: "Thanks Ava — I am looking at your account now.",
        attachmentIds: [],
        readBy: [agent.id],
        createdAt: new Date(now.getTime() + 60000),
      },
    ],
  });

  const cat = await prisma.kbCategory.create({
    data: {
      id: newId(),
      name: "Getting started",
      slug: "getting-started",
      description: "New to Solvio",
    },
  });
  const cat2 = await prisma.kbCategory.create({
    data: {
      id: newId(),
      name: "Billing",
      slug: "billing",
      description: "Invoices and plans",
    },
  });
  await prisma.kbArticle.createMany({
    data: [
      {
        id: newId(),
        title: "How to create a ticket",
        slug: "how-to-create-a-ticket",
        excerpt: "Open a support ticket from your dashboard.",
        body: "Sign in, choose New ticket, add a title, description, and priority. You can attach files and track status in real time.",
        categoryId: cat.id,
        tags: ["tickets"],
        featured: true,
        published: true,
        authorId: superAdmin.id,
      },
      {
        id: newId(),
        title: "Understanding invoice dates",
        slug: "understanding-invoice-dates",
        excerpt: "When invoices are generated and due.",
        body: "Invoices generate on your plan anniversary. Net-15 terms apply unless a custom contract says otherwise.",
        categoryId: cat2.id,
        tags: ["billing"],
        featured: true,
        published: true,
        authorId: superAdmin.id,
      },
    ],
  });

  const passwordQuestion = "How do I reset my password?";
  const existingPair = await prisma.knowledgeSource.findFirst({
    where: { organizationId: DEFAULT_ORGANIZATION_ID, type: "QA", question: passwordQuestion },
  });
  const pair =
    existingPair ||
    (await prisma.knowledgeSource.create({
      data: {
        id: newId(),
        organizationId: DEFAULT_ORGANIZATION_ID,
        type: "QA",
        title: passwordQuestion,
        status: "PENDING",
        question: passwordQuestion,
        answer: "Use Forgot password on the sign-in page. We email a reset link that expires soon.",
        category: "Account",
        tags: ["password"],
        chunkCount: 0,
      },
    }));
  await ingestSource(pair.id);

  await prisma.notification.create({
    data: {
      id: newId(),
      userId: customer.id,
      title: "Welcome to Solvio",
      body: "Your demo workspace is ready.",
      href: "/dashboard",
      type: "welcome",
      read: false,
    },
  });

  await prisma.meeting.create({
    data: {
      id: newId(),
      customerId: customer.id,
      agentId: agent.id,
      title: "Onboarding call",
      description: "Walk through ticketing and chat",
      date: new Date(Date.now() + 86400000 * 3),
      startTime: "10:00",
      endTime: "10:30",
      status: "REQUESTED",
    },
  });

  await prisma.settings.upsert({
    where: { id: "app" },
    create: {
      id: "app",
      appName: "Solvio",
      branding: { primaryColor: "#14b8a6" },
      widget: { publicKey: "solvio-widget-dev-key", allowedOrigins: ["*"], greeting: "Hi, I'm the Solvio assistant." },
      integrations: {},
    },
    update: {
      appName: "Solvio",
      branding: { primaryColor: "#14b8a6" },
      widget: { publicKey: "solvio-widget-dev-key", allowedOrigins: ["*"], greeting: "Hi, I'm the Solvio assistant." },
    },
  });

  const { ensureDefaultWidgetSite } = await import("../lib/ai/widget-site");
  await ensureDefaultWidgetSite();

  console.log("Seed complete.");
  console.log("  superadmin@solvio.local / SolvioSuper1!");
  console.log("  admin@solvio.local / SolvioAdmin1!");
  console.log("  agent@solvio.local / SolvioAgent1!");
  console.log("  customer@solvio.local / SolvioCustomer1!");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
