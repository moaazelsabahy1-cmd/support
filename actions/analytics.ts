"use server";

import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { serialize } from "@/lib/serialize";
import { Prisma } from "@prisma/client";

export async function analyticsAction() {
  await requirePermission("analytics.view");
  const now = new Date();
  const from = new Date(now.getTime() - 30 * 86400000);

  const [
    totalTickets,
    openTickets,
    resolvedTickets,
    pendingTickets,
    customers,
    agents,
    aiConversations,
    escalations,
    upcomingMeetings,
  ] = await Promise.all([
    prisma.ticket.count(),
    prisma.ticket.count({ where: { status: "OPEN" } }),
    prisma.ticket.count({ where: { status: { in: ["RESOLVED", "CLOSED"] } } }),
    prisma.ticket.count({ where: { status: { in: ["IN_PROGRESS", "WAITING_CUSTOMER", "WAITING_AGENT"] } } }),
    prisma.user.count({ where: { role: "CUSTOMER" } }),
    prisma.user.count({ where: { role: "AGENT", status: "ACTIVE" } }),
    prisma.aiChatLog.count(),
    prisma.aiChatLog.count({ where: { escalated: true } }),
    prisma.meeting.count({ where: { status: { in: ["REQUESTED", "CONFIRMED"] }, date: { gte: now } } }),
  ]);

  const [byStatus, byPriority, byDepartment, meetingStats] = await Promise.all([
    prisma.ticket.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.ticket.groupBy({ by: ["priority"], _count: { _all: true } }),
    prisma.ticket.groupBy({ by: ["departmentId"], _count: { _all: true } }),
    prisma.meeting.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const departments = await prisma.department.findMany();
  const deptMap = new Map(departments.map((d) => [d.id, d.name]));

  const overTime = await prisma.$queryRaw<Array<{ _id: string; count: number; resolved: number }>>(
    Prisma.sql`
      SELECT to_char("createdAt", 'YYYY-MM-DD') AS "_id",
             COUNT(*)::int AS count,
             COUNT(*) FILTER (WHERE status IN ('RESOLVED', 'CLOSED'))::int AS resolved
      FROM tickets
      WHERE "createdAt" >= ${from}
      GROUP BY 1
      ORDER BY 1
    `,
  );

  const resolved = await prisma.ticket.findMany({
    where: { resolvedAt: { not: null } },
    select: { createdAt: true, resolvedAt: true },
  });
  const avgResolutionHours =
    resolved.length === 0
      ? 0
      : resolved.reduce((sum, t) => {
          const end = t.resolvedAt ? t.resolvedAt.getTime() : 0;
          return sum + (end - t.createdAt.getTime()) / 3600000;
        }, 0) / resolved.length;

  const agentPerf = await prisma.ticket.groupBy({
    by: ["assignedAgentId"],
    where: { assignedAgentId: { not: null } },
    _count: { _all: true },
  });
  const resolvedByAgent = await prisma.ticket.groupBy({
    by: ["assignedAgentId"],
    where: { assignedAgentId: { not: null }, status: { in: ["RESOLVED", "CLOSED"] } },
    _count: { _all: true },
  });
  const resolvedMap = new Map(resolvedByAgent.map((a) => [a.assignedAgentId, a._count._all]));
  const agentIds = agentPerf.map((a) => a.assignedAgentId).filter((id): id is string => Boolean(id));
  const agentUsers = agentIds.length
    ? await prisma.user.findMany({ where: { id: { in: agentIds } } })
    : [];
  const agentName = new Map(agentUsers.map((u) => [u.id, u.name]));

  const csatAgg = await prisma.ticket.aggregate({
    where: { csat: { gte: 1 } },
    _avg: { csat: true },
  });

  return serialize({
    totals: {
      totalTickets,
      openTickets,
      resolvedTickets,
      pendingTickets,
      customers,
      agents,
      aiConversations,
      escalations,
      upcomingMeetings,
      avgResolutionHours: Math.round(avgResolutionHours * 10) / 10,
      csat: csatAgg._avg.csat,
    },
    byStatus: byStatus.map((s) => ({ _id: s.status, count: s._count._all })),
    byPriority: byPriority.map((s) => ({ _id: s.priority, count: s._count._all })),
    byDepartment: byDepartment.map((d) => ({
      name: d.departmentId ? deptMap.get(d.departmentId) || "Unassigned" : "Unassigned",
      count: d._count._all,
    })),
    overTime,
    agentPerformance: agentPerf.map((a) => ({
      name: agentName.get(String(a.assignedAgentId)) || "Agent",
      total: a._count._all,
      resolved: resolvedMap.get(a.assignedAgentId) || 0,
    })),
    meetingStats: meetingStats.map((s) => ({ _id: s.status, count: s._count._all })),
  });
}

export async function agentWorkloadAction(agentId: string) {
  await requirePermission("ticket.view");
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const [assigned, today] = await Promise.all([
    prisma.ticket.count({
      where: { assignedAgentId: agentId, status: { notIn: ["CLOSED", "RESOLVED"] } },
    }),
    prisma.ticket.count({
      where: { assignedAgentId: agentId, updatedAt: { gte: todayStart } },
    }),
  ]);
  return { assigned, today };
}
