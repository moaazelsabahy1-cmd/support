"use client";

import { useEffect, useState } from "react";
import { TicketList } from "@/components/tickets/ticket-list";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { updateTicketAction } from "@/actions/tickets";
import { toast } from "sonner";
import { useSession } from "@/lib/auth-client";

export function AgentBoard() {
  const { data } = useSession();
  const [unassigned, setUnassigned] = useState<{ _id: string; number: string; title: string }[]>([]);
  const [chats, setChats] = useState<
    {
      _id: string;
      aiPaused?: boolean;
      status?: string;
      handoffReason?: string | null;
      lastQuestion?: string | null;
      customer?: { name?: string; email?: string } | null;
    }[]
  >([]);

  useEffect(() => {
    fetch("/api/tickets?assigned=unassigned").then((r) => r.json()).then((j) => j.success && setUnassigned(j.data.items));
    fetch("/api/conversations").then((r) => r.json()).then((j) => j.success && setChats(j.data));
  }, []);

  const waiting = chats.filter((c) => c.aiPaused && c.status === "OPEN");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Agent workspace</h1>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <p className="text-sm text-muted-foreground">Waiting / unassigned</p>
          <p className="mt-2 text-3xl font-semibold">{unassigned.length}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">Waiting for human</p>
          <p className="mt-2 text-3xl font-semibold">{waiting.length}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">Active chats</p>
          <p className="mt-2 text-3xl font-semibold">{chats.length}</p>
        </Card>
      </div>
      <Card>
        <h2 className="font-semibold">Waiting for human</h2>
        <ul className="mt-3 space-y-2">
          {waiting.map((c) => (
            <li key={c._id} className="flex items-center justify-between gap-3 text-sm">
              <span>
                {c.customer?.name ? `${c.customer.name} · ` : ""}
                {c.lastQuestion?.slice(0, 80) || `Chat ${c._id.slice(-6)}`}
                {c.handoffReason ? <span className="block text-xs text-muted-foreground">{c.handoffReason}</span> : null}
                {c.customer?.email ? <span className="block text-xs text-muted-foreground">{c.customer.email}</span> : null}
              </span>
              <Button size="sm" asChild>
                <a href={`/chat/${c._id}`}>Open chat</a>
              </Button>
            </li>
          ))}
          {!waiting.length ? <li className="text-sm text-muted-foreground">No AI handoffs waiting.</li> : null}
        </ul>
      </Card>
      <Card>
        <h2 className="font-semibold">Unassigned queue</h2>
        <ul className="mt-3 space-y-2">
          {unassigned.map((t) => (
            <li key={t._id} className="flex items-center justify-between text-sm">
              <span>{t.number} · {t.title}</span>
              <Button size="sm" onClick={async () => {
                if (!data?.user?.id) return;
                await updateTicketAction(t._id, { assignedAgentId: data.user.id, status: "IN_PROGRESS" });
                toast.success("Accepted");
                setUnassigned((u) => u.filter((x) => x._id !== t._id));
              }}>Accept</Button>
            </li>
          ))}
        </ul>
      </Card>
      <TicketList assigned="me" />
    </div>
  );
}
