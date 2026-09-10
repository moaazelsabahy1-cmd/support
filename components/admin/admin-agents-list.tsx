"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { readApiJson } from "@/lib/api-client";

type AgentRow = {
  _id: string;
  label?: string;
  name: string;
  email: string;
  status: string;
  availability?: string;
  conversationCount?: number;
  pending?: number;
  accepted?: number;
  declined?: number;
  connected?: number;
  closed?: number;
};

export function AdminAgentsList() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams();
      if (q.trim()) p.set("q", q.trim());
      setLoading(true);
      fetch(`/api/admin/agents?${p}`)
        .then((r) => readApiJson<{ items: AgentRow[] }>(r))
        .then((json) => {
          if (!json.success) {
            setError(json.error?.message || "Could not load agents.");
            return;
          }
          setError("");
          setItems(json.data.items);
        })
        .catch(() => setError("Could not load agents."))
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Conversation History</h1>
      <p className="text-sm text-muted-foreground">Four support agents. Open an agent to review every conversation they handled.</p>
      <Input placeholder="Search agents" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
      {loading ? <p className="text-sm text-muted-foreground">Loading agents…</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {!loading && !items.length ? <p className="text-sm text-muted-foreground">No support agents found.</p> : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((a) => (
          <Link key={a._id} href={`/admin/agents/${a._id}`}>
            <Card className="h-full hover:border-primary">
              <p className="text-xs text-muted-foreground">{a.label || "Agent"}</p>
              <p className="mt-1 font-semibold">{a.name}</p>
              <p className="text-xs text-muted-foreground">{a.availability || a.status}</p>
              <p className="mt-2 text-sm">Conversations: {a.conversationCount ?? 0}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Pending {a.pending ?? 0} · Accepted {a.accepted ?? 0} · Declined {a.declined ?? 0}
              </p>
              <p className="text-xs text-muted-foreground">
                Connected {a.connected ?? 0} · Closed {a.closed ?? 0}
              </p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
