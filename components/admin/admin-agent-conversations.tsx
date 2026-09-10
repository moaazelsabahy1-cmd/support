"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { readApiJson } from "@/lib/api-client";
import { getSocket } from "@/lib/socket";

type Listed = {
  _id: string;
  displayStatus: string;
  lastMessage: string | null;
  lastMessageAt: string;
  ticketId?: string | null;
  customer: { name: string; email: string };
};

const FILTERS = ["", "pending", "accepted", "declined", "connected", "closed"] as const;

export function AdminAgentConversations({ agentId }: { agentId: string }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [agentName, setAgentName] = useState("Agent");
  const [items, setItems] = useState<Listed[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  function load() {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (status) p.set("status", status);
    if (from) p.set("from", new Date(from).toISOString());
    if (to) p.set("to", new Date(to).toISOString());
    p.set("page", String(page));
    p.set("pageSize", "20");
    setLoading(true);
    fetch(`/api/admin/agents/${agentId}/conversations?${p}`)
      .then((r) => readApiJson<{ agent: { name: string }; items: Listed[]; total: number; pageSize: number }>(r))
      .then((json) => {
        if (!json.success) {
          setError(json.error?.message || "Could not load conversations.");
          return;
        }
        setError("");
        setAgentName(json.data.agent.name);
        setItems(json.data.items);
        setTotal(json.data.total);
        setPageSize(json.data.pageSize || 20);
      })
      .catch(() => setError("Could not load conversations."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [agentId, q, status, from, to, page]);

  useEffect(() => {
    const s = getSocket();
    const refresh = () => load();
    s?.on("handoff:offered", refresh);
    s?.on("handoff:accepted", refresh);
    s?.on("handoff:declined", refresh);
    s?.on("handoff:unavailable", refresh);
    s?.on("message:new", refresh);
    return () => {
      s?.off("handoff:offered", refresh);
      s?.off("handoff:accepted", refresh);
      s?.off("handoff:declined", refresh);
      s?.off("handoff:unavailable", refresh);
      s?.off("message:new", refresh);
    };
  }, [agentId, q, status, from, to, page]);

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">
          <Link href="/admin/agents" className="hover:underline">
            Conversation History
          </Link>
        </p>
        <h1 className="text-2xl font-semibold">{agentName}</h1>
        <p className="text-sm text-muted-foreground">Conversations</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Search email, conversation id, ticket id, or message"
          value={q}
          onChange={(e) => {
            setPage(1);
            setQ(e.target.value);
          }}
          className="max-w-lg"
        />
        <select
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
        >
          {FILTERS.map((f) => (
            <option key={f || "all"} value={f}>
              {f ? f[0].toUpperCase() + f.slice(1) : "All statuses"}
            </option>
          ))}
        </select>
        <Input type="date" value={from} onChange={(e) => { setPage(1); setFrom(e.target.value); }} />
        <Input type="date" value={to} onChange={(e) => { setPage(1); setTo(e.target.value); }} />
      </div>
      {loading ? <p className="text-sm text-muted-foreground">Loading conversations…</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <ul className="space-y-3">
        {items.map((c) => (
          <li key={c._id}>
            <Link
              href={`/admin/agents/${agentId}/conversations/${c._id}`}
              className="block rounded-xl border border-border bg-card p-4 hover:border-primary"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{c.customer.name}</p>
                  <p className="text-xs text-muted-foreground">{c.customer.email}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{c.lastMessage || "No messages yet"}</p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>Status: {c.displayStatus === "ACTIVE" ? "Active" : c.displayStatus === "CLOSED" ? "Closed" : "Pending"}</p>
                  {c.ticketId ? <p className="mt-1">Ticket: {c.ticketId}</p> : null}
                  <p className="mt-1">{formatDate(c.lastMessageAt)}</p>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {!loading && !items.length ? <p className="text-sm text-muted-foreground">No conversations for this agent.</p> : null}
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          Previous
        </Button>
        <span className="text-xs text-muted-foreground">
          Page {page} of {pages}
        </span>
        <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}
