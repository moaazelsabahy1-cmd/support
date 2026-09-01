"use client";

import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/card";

export function AnalyticsView({ data }: { data: Analytics }) {
  const t = data.totals;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Analytics</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Total tickets", t.totalTickets],
          ["Open", t.openTickets],
          ["Resolved", t.resolvedTickets],
          ["Avg resolution (h)", t.avgResolutionHours],
          ["AI chats", t.aiConversations],
          ["Escalations", t.escalations],
          ["CSAT", t.csat ? t.csat.toFixed(1) : "n/a"],
          ["Meetings upcoming", t.upcomingMeetings],
        ].map(([l, v]) => (
          <Card key={String(l)}>
            <p className="text-sm text-muted-foreground">{l}</p>
            <p className="mt-2 text-2xl font-semibold">{v}</p>
          </Card>
        ))}
      </div>
      <Card className="h-80">
        <h2 className="mb-4 font-semibold">Tickets over time</h2>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.overTime.map((d) => ({ day: d._id, count: d.count, resolved: d.resolved }))}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="day" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line dataKey="count" stroke="#14b8a6" name="Created" />
            <Line dataKey="resolved" stroke="#0f172a" name="Resolved" />
          </LineChart>
        </ResponsiveContainer>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="h-80">
          <h2 className="mb-4 font-semibold">By status</h2>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.byStatus.map((d) => ({ name: d._id, count: d.count }))}>
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#14b8a6" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card className="h-80">
          <h2 className="mb-4 font-semibold">By priority</h2>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.byPriority.map((d) => ({ name: d._id, count: d.count }))}>
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#0d9488" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
      <Card>
        <h2 className="font-semibold">Agent performance</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {data.agentPerformance.map((a) => (
            <li key={a.name} className="flex justify-between"><span>{a.name}</span><span>{a.resolved}/{a.total} resolved</span></li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

type Analytics = {
  totals: Record<string, number | null>;
  overTime: { _id: string; count: number; resolved: number }[];
  byStatus: { _id: string; count: number }[];
  byPriority: { _id: string; count: number }[];
  agentPerformance: { name: string; total: number; resolved: number }[];
};
