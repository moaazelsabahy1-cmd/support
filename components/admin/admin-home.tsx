"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";

export function AdminHome({ stats }: { stats: { totals: Record<string, number | null> } }) {
  const t = stats.totals;
  const links = [
    ["/admin/agents", "Conversation History"],
    ["/admin/users", "Users"],
    ["/admin/departments", "Departments"],
    ["/admin/knowledge", "Knowledge Base"],
    ["/admin/ai/knowledge", "AI Knowledge Hub"],
    ["/admin/ai/logs", "AI logs"],
    ["/tickets", "Tickets"],
    ["/meetings", "Meetings"],
    ["/notifications", "Notifications"],
    ["/analytics", "Analytics"],
    ["/settings", "Settings"],
  ];
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Admin</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Customers", t.customers],
          ["Active agents", t.agents],
          ["Open tickets", t.openTickets],
          ["Pending", t.pendingTickets],
          ["Resolved", t.resolvedTickets],
          ["AI conversations", t.aiConversations],
          ["Escalations", t.escalations],
          ["Upcoming meetings", t.upcomingMeetings],
        ].map(([label, value]) => (
          <Card key={String(label)}>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 text-3xl font-semibold">{value ?? 0}</p>
          </Card>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {links.map(([href, label]) => (
          <Link key={href} href={href} className="rounded-2xl border border-border bg-card p-4 hover:border-primary">
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}
