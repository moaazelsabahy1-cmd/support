"use client";

import { useEffect, useState } from "react";
import { TicketList } from "@/components/tickets/ticket-list";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { updateTicketAction } from "@/actions/tickets";
import { toast } from "sonner";
import { useSession } from "@/lib/auth-client";
import { getSocket } from "@/lib/socket";

type ChatRow = {
  _id: string;
  aiPaused?: boolean;
  status?: string;
  handoffReason?: string | null;
  lastQuestion?: string | null;
  customer?: { name?: string; email?: string } | null;
  humanHandoff?: {
    id?: string;
    _id?: string;
    status?: string;
    currentAttempt?: number;
    currentAgentId?: string | null;
  } | null;
};

export function AgentBoard() {
  const { data } = useSession();
  const [unassigned, setUnassigned] = useState<{ _id: string; number: string; title: string }[]>([]);
  const [chats, setChats] = useState<ChatRow[]>([]);

  async function load() {
    const tickets = await fetch("/api/tickets?assigned=unassigned").then((r) => r.json());
    if (tickets.success) setUnassigned(tickets.data.items);
    const convs = await fetch("/api/conversations").then((r) => r.json());
    if (convs.success) setChats(convs.data);
  }

  useEffect(() => {
    void load();
    const s = getSocket();
    const refresh = () => void load();
    s?.on("handoff:offered", refresh);
    s?.on("handoff:accepted", refresh);
    s?.on("handoff:declined", refresh);
    s?.on("notification:new", refresh);
    return () => {
      s?.off("handoff:offered", refresh);
      s?.off("handoff:accepted", refresh);
      s?.off("handoff:declined", refresh);
      s?.off("notification:new", refresh);
    };
  }, []);

  const myId = data?.user?.id;
  const incoming = chats.filter(
    (c) => c.humanHandoff?.status === "OFFERED" && c.humanHandoff.currentAgentId === myId,
  );
  const waiting = chats.filter((c) => c.aiPaused && c.status === "OPEN");

  async function act(handoffId: string, accept: boolean) {
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(accept ? { acceptHandoff: true, handoffId } : { declineHandoff: true, handoffId }),
    });
    const json = await res.json();
    if (!json.success) {
      toast.error(json.error?.message || "Handoff update failed");
      return;
    }
    toast.success(accept ? "Accepted" : "Declined");
    if (accept) {
      const convId = incoming.find((c) => (c.humanHandoff?.id || c.humanHandoff?._id) === handoffId)?._id;
      if (convId) window.location.href = `/chat/${convId}`;
    }
    void load();
  }

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
        <h2 className="font-semibold">NEW CUSTOMER REQUEST</h2>
        <ul className="mt-3 space-y-2">
          {incoming.map((c) => {
            const hid = c.humanHandoff?.id || c.humanHandoff?._id || "";
            return (
              <li key={c._id} className="rounded-lg border p-3 text-sm">
                <p>
                  Customer: {c.customer?.name || "Unknown"}
                </p>
                <p className="text-xs text-muted-foreground">Customer wants to talk to a human.</p>
                <p className="text-xs text-muted-foreground">Reason: {c.handoffReason || "CUSTOMER_REQUESTED_HUMAN"}</p>
                {c.lastQuestion ? <p className="mt-1">{c.lastQuestion}</p> : null}
                <div className="mt-2 flex gap-2">
                  <Button size="sm" onClick={() => act(hid, true)}>Accept</Button>
                  <Button size="sm" variant="outline" onClick={() => act(hid, false)}>Decline</Button>
                  <Button size="sm" variant="outline" asChild>
                    <a href={`/chat/${c._id}`}>Open conversation</a>
                  </Button>
                </div>
              </li>
            );
          })}
          {!incoming.length ? <li className="text-sm text-muted-foreground">No handoff offered to you.</li> : null}
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
      <TicketList />
    </div>
  );
}
