"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { addCommentAction, updateTicketAction } from "@/actions/tickets";
import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea, Input, Label } from "@/components/ui/input";
import { getSocket } from "@/lib/socket";
import { TICKET_PRIORITIES, TICKET_STATUSES } from "@/types";
import { formatDate } from "@/lib/utils";

type Payload = {
  ticket: {
    _id: string;
    number: string;
    title: string;
    description: string;
    status: string;
    priority: string;
    tags: string[];
    category?: string;
  };
  comments: { _id: string; body: string; internal: boolean; createdAt: string; authorId: string }[];
  history: { _id: string; action: string; from?: string; to?: string; createdAt: string }[];
  attachments: { _id: string; filename: string; key: string }[];
  customer?: { name: string; email: string };
  agent?: { name: string; email: string } | null;
  department?: { name: string } | null;
};

export function TicketWorkspace({ id, role }: { id: string; role: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [pending, start] = useTransition();
  const staff = role !== "CUSTOMER";

  async function load() {
    const res = await fetch(`/api/tickets/${id}`);
    const json = await res.json();
    if (json.success) setData(json.data);
  }

  useEffect(() => {
    load();
    const s = getSocket();
    s?.emit("join", { ticketId: id });
    s?.on("ticket:updated", load);
    return () => {
      s?.off("ticket:updated", load);
    };
  }, [id]);

  if (!data) return <p>Loading ticket…</p>;
  const t = data.ticket;

  async function mutate(patch: Record<string, unknown>) {
    start(async () => {
      try {
        await updateTicketAction(id, patch);
        toast.success("Ticket updated");
        load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Update failed");
      }
    });
  }

  async function comment(internal: boolean, form: HTMLFormElement) {
    const fd = new FormData(form);
    await addCommentAction(id, { body: fd.get("body"), internal });
    form.reset();
    load();
  }

  async function upload(file: File) {
    const fd = new FormData();
    fd.set("file", file);
    fd.set("ticketId", id);
    const res = await fetch("/api/attachments", { method: "POST", body: fd });
    const json = await res.json();
    if (!json.success) toast.error(json.error?.message);
    else toast.success("Uploaded");
    load();
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[280px_1fr_280px]">
      <Card className="order-2 xl:order-1">
        <h2 className="font-semibold">Ticket</h2>
        <p className="mt-2 font-mono text-xs">{t.number}</p>
        <h1 className="mt-2 text-xl font-semibold">{t.title}</h1>
        <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{t.description}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {t.tags?.map((tag) => <Badge key={tag}>{tag}</Badge>)}
        </div>
        <h3 className="mt-6 text-sm font-semibold">History</h3>
        <ul className="mt-2 space-y-2 text-xs text-muted-foreground">
          {data.history.map((h) => (
            <li key={h._id}>{h.action} {h.from || ""} → {h.to || ""} · {formatDate(h.createdAt)}</li>
          ))}
        </ul>
      </Card>

      <Card className="order-1 xl:order-2">
        <h2 className="font-semibold">Conversation</h2>
        <div className="mt-4 max-h-[50vh] space-y-3 overflow-y-auto">
          {data.comments.map((c) => (
            <div key={c._id} className={`rounded-xl p-3 text-sm ${c.internal ? "bg-amber-50 dark:bg-amber-950/40" : "bg-muted"}`}>
              {c.internal ? <span className="text-xs font-medium text-amber-700">Internal note</span> : null}
              <p className="whitespace-pre-wrap">{c.body}</p>
              <p className="mt-1 text-xs text-muted-foreground">{formatDate(c.createdAt)}</p>
            </div>
          ))}
        </div>
        <form className="mt-4 space-y-2" onSubmit={async (e) => { e.preventDefault(); await comment(false, e.currentTarget); }}>
          <Label htmlFor="body">Reply</Label>
          <Textarea id="body" name="body" required />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>Reply</Button>
            {staff ? (
              <Button type="button" variant="secondary" onClick={async (e) => {
                const form = (e.currentTarget as HTMLButtonElement).form!;
                await comment(true, form);
              }}>Internal note</Button>
            ) : null}
          </div>
        </form>
        <div className="mt-4">
          <Label htmlFor="file">Attach file</Label>
          <Input id="file" type="file" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <ul className="mt-2 text-sm">
            {data.attachments.map((a) => (
              <li key={a._id} className="flex items-center justify-between">
                <a className="text-primary" href={`/api/files/${a.key}`}>{a.filename}</a>
                <Button size="sm" variant="ghost" onClick={async () => {
                  await fetch("/api/attachments", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: a._id }) });
                  load();
                }}>Delete</Button>
              </li>
            ))}
          </ul>
        </div>
      </Card>

      <Card className="order-3">
        <h2 className="font-semibold">Details</h2>
        <p className="mt-3 text-sm"><span className="text-muted-foreground">Customer</span><br />{data.customer?.name}<br />{data.customer?.email}</p>
        <p className="mt-3 text-sm"><span className="text-muted-foreground">Agent</span><br />{data.agent?.name || "Unassigned"}</p>
        <p className="mt-3 text-sm"><span className="text-muted-foreground">Department</span><br />{data.department?.name || "—"}</p>
        {staff ? (
          <div className="mt-4 space-y-3">
            <div>
              <Label>Status</Label>
              <select className="mt-1 h-10 w-full rounded-lg border border-border bg-card px-2" value={t.status} onChange={(e) => mutate({ status: e.target.value })}>
                {TICKET_STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <Label>Priority</Label>
              <select className="mt-1 h-10 w-full rounded-lg border border-border bg-card px-2" value={t.priority} onChange={(e) => mutate({ priority: e.target.value })}>
                {TICKET_PRIORITIES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <Button variant="outline" onClick={() => mutate({ assignedAgentId: null })}>Unassign</Button>
            <Button onClick={() => mutate({ status: "CLOSED" })}>Close ticket</Button>
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            <Badge>{t.status}</Badge>
            <Badge tone="info">{t.priority}</Badge>
            {t.status === "RESOLVED" ? (
              <div>
                <Label>Satisfaction (1-5)</Label>
                <Input type="number" min={1} max={5} onBlur={(e) => mutate({ csat: Number(e.target.value) })} />
              </div>
            ) : null}
          </div>
        )}
      </Card>
    </div>
  );
}
