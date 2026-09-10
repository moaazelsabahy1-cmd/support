"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSocket, joinConversationRoom } from "@/lib/socket";
import { formatDate } from "@/lib/utils";
import { HumanSupportHeader } from "@/components/chat/human-support-header";
import { shouldAppendChatMessage } from "@/lib/chat-message-label";
import { readApiJson } from "@/lib/api-client";

type Sender = { id?: string; _id?: string; name?: string; role?: string };
type Msg = {
  _id: string;
  body: string;
  senderId: string;
  createdAt: string;
  role?: string;
  internal?: boolean;
  attachmentIds?: string[];
  conversationId?: string;
  sender?: Sender | null;
};
type EventRow = {
  _id?: string;
  type?: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  reason?: string | null;
  createdAt?: string;
};
type Detail = {
  _id: string;
  ticketId?: string | null;
  displayStatus: string;
  status: string;
  customer: { name: string; email?: string };
  assignedAgent: { name: string } | null;
  humanHandoff?: {
    status?: string;
    currentAttempt?: number;
    attempts?: { agentId?: string; order?: number; status?: string }[];
    events?: EventRow[];
  } | null;
  messages: Msg[];
};

const EVENT_LABEL: Record<string, string> = {
  HUMAN_REQUESTED: "Customer requested a human",
  REQUEST_SENT: "Request sent to selected agent",
  OFFERED: "Offered to agent",
  ACCEPTED: "Agent accepted",
  DECLINED: "Agent declined",
  UNAVAILABLE: "Agent unavailable",
  CONNECTED: "Conversation connected",
  CLOSED: "Conversation closed",
};

function senderKind(m: Msg, customerName: string) {
  if (m.role === "CUSTOMER") return { label: customerName || "Customer", kind: "CUSTOMER" as const };
  if (m.role === "HUMAN") return { label: m.sender?.name || "Agent", kind: "AGENT" as const };
  if (m.role === "AI") return { label: "Assistant", kind: "AI" as const };
  if (m.role === "SYSTEM") return { label: "Handoff", kind: "SYSTEM" as const };
  return { label: m.sender?.name || "Customer", kind: "CUSTOMER" as const };
}

function bubbleClass(kind: string, internal?: boolean) {
  if (kind === "AGENT") return "bg-primary/10";
  if (kind === "AI") return "bg-teal-500/15";
  if (kind === "SYSTEM") return "bg-amber-500/15";
  if (internal) return "border border-dashed border-border bg-muted/60";
  return "bg-muted";
}

export function AdminConversationHistory({
  agentId,
  conversationId,
}: {
  agentId: string;
  conversationId: string;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    fetch(`/api/admin/conversations/${conversationId}?agentId=${encodeURIComponent(agentId)}`)
      .then((r) => readApiJson<Detail>(r))
      .then((json) => {
        if (!json.success) {
          setError(json.error?.message || "Could not load conversation.");
          return;
        }
        setError("");
        setDetail(json.data);
      })
      .catch(() => setError("Could not load conversation."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, [agentId, conversationId]);

  useEffect(() => {
    const s = getSocket();
    const unjoin = joinConversationRoom(s, conversationId);
    const onMsg = (msg: Msg) => {
      const id = msg._id;
      if (!id) return;
      setDetail((d) => {
        if (!d) return d;
        if (!shouldAppendChatMessage(d.messages, msg, conversationId)) return d;
        return { ...d, messages: [...d.messages, { ...msg, _id: id }] };
      });
    };
    const refresh = () => load();
    s?.on("message:new", onMsg);
    s?.on("handoff:offered", refresh);
    s?.on("handoff:accepted", refresh);
    s?.on("handoff:declined", refresh);
    s?.on("handoff:unavailable", refresh);
    return () => {
      s?.off("message:new", onMsg);
      s?.off("handoff:offered", refresh);
      s?.off("handoff:accepted", refresh);
      s?.off("handoff:declined", refresh);
      s?.off("handoff:unavailable", refresh);
      unjoin();
    };
  }, [conversationId, agentId]);

  const closed = detail?.status === "CLOSED" || detail?.displayStatus === "CLOSED";
  const customerName = detail?.customer.name || "Customer";

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        <Link href="/admin/agents" className="hover:underline">
          Conversation History
        </Link>
        {" · "}
        <Link href={`/admin/agents/${agentId}`} className="hover:underline">
          Conversations
        </Link>
      </p>
      {loading && !detail ? <p className="text-sm text-muted-foreground">Loading conversation…</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {detail ? (
        <div className="rounded-xl border border-border bg-card p-3 text-sm">
          <p>
            <span className="text-muted-foreground">Visitor:</span> {customerName}
            {detail.customer.email ? ` · ${detail.customer.email}` : ""}
          </p>
          <p className="text-xs text-muted-foreground">Conversation ID: {detail._id}</p>
          {detail.ticketId ? <p className="text-xs text-muted-foreground">Ticket ID: {detail.ticketId}</p> : null}
        </div>
      ) : null}
      {detail ? (
        <HumanSupportHeader
          agentName={detail.assignedAgent?.name}
          customerName={customerName}
          status={detail.humanHandoff?.status}
          currentAttempt={detail.humanHandoff?.currentAttempt}
          attempts={detail.humanHandoff?.attempts}
          conversationClosed={closed}
        />
      ) : null}
      {detail?.humanHandoff?.events?.length ? (
        <ul className="rounded-xl border border-border bg-card p-3 text-sm" data-handoff-audit>
          <li className="mb-2 font-semibold">Handoff audit</li>
          {detail.humanHandoff.events.map((e, i) => (
            <li key={e._id || `${e.type}-${i}`}>
              {EVENT_LABEL[e.type || ""] || e.type} · {e.toStatus || ""} · {e.createdAt ? formatDate(e.createdAt) : ""}
              {e.reason ? ` · ${e.reason}` : ""}
            </li>
          ))}
        </ul>
      ) : detail?.humanHandoff?.attempts?.length ? (
        <ul className="rounded-xl border border-border bg-card p-3 text-sm" data-handoff-attempts>
          {detail.humanHandoff.attempts.map((a, i) => (
            <li key={`${a.order || i}-${a.status}`}>
              Agent {a.order || i + 1}: {a.status === "ACCEPTED" ? "Accepted" : a.status === "DECLINED" ? "Declined" : a.status}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-muted-foreground">Read-only conversation history</p>
      <div className="max-h-[70vh] space-y-3 overflow-y-auto rounded-2xl border border-border bg-card p-4">
        {(detail?.messages || []).map((m) => {
          const who = senderKind(m, customerName);
          return (
            <div key={m._id} className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${bubbleClass(who.kind, m.internal)}`}>
              <p className="text-xs font-semibold">
                {who.kind === "CUSTOMER" ? "Customer" : who.kind === "AGENT" ? "Agent" : who.label}
                {who.kind === "CUSTOMER" || who.kind === "AGENT" ? ` · ${who.label}` : null}
                {m.internal ? " · Internal" : null}
              </p>
              <p className="text-[11px] text-muted-foreground">{formatDate(m.createdAt)}</p>
              <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
              {m.attachmentIds?.length ? (
                <p className="mt-1 text-xs text-muted-foreground">{m.attachmentIds.length} attachment(s)</p>
              ) : null}
            </div>
          );
        })}
        {detail && !detail.messages.length ? <p className="text-sm text-muted-foreground">No messages yet.</p> : null}
      </div>
    </div>
  );
}
