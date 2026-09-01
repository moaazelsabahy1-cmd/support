"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CreateTicketButton } from "@/components/tickets/create-ticket-button";
import { TICKET_PRIORITIES, TICKET_STATUSES } from "@/types";

export function TicketList({ assigned }: { assigned?: "me" | "unassigned" }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: TicketRow[]; total: number; pageSize: number } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page) });
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (priority) params.set("priority", priority);
    if (assigned) params.set("assigned", assigned);
    fetch(`/api/tickets?${params}`)
      .then((r) => r.json())
      .then((j) => j.success && setData(j.data));
  }, [q, status, priority, page, assigned]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Tickets</h1>
        <CreateTicketButton />
      </div>
      <div className="flex flex-wrap gap-2">
        <Input placeholder="Search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className="max-w-xs" />
        <select className="h-10 rounded-lg border border-border bg-card px-2" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {TICKET_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className="h-10 rounded-lg border border-border bg-card px-2" value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="">All priorities</option>
          {TICKET_PRIORITIES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="p-3">Number</th>
              <th>Title</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((t) => (
              <tr key={t._id} className="border-t border-border">
                <td className="p-3 font-mono text-xs">{t.number}</td>
                <td><Link className="text-primary hover:underline" href={`/tickets/${t._id}`}>{t.title}</Link></td>
                <td><Badge>{t.status}</Badge></td>
                <td><Badge tone={t.priority === "URGENT" || t.priority === "HIGH" ? "danger" : "default"}>{t.priority}</Badge></td>
                <td className="text-muted-foreground">{new Date(t.updatedAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
        <Button variant="outline" disabled={!data || page * data.pageSize >= data.total} onClick={() => setPage((p) => p + 1)}>Next</Button>
      </div>
    </div>
  );
}

type TicketRow = {
  _id: string;
  number: string;
  title: string;
  status: string;
  priority: string;
  updatedAt: string;
};
