"use client";

import { useEffect, useRef, useState } from "react";
import { getSocket } from "@/lib/socket";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import { chatMessageLabel, shouldAppendChatMessage } from "@/lib/chat-message-label";
import { handoffStatusCopy, customerHandoffStatusLabel } from "@/lib/ai/handoff-copy";
import { HUMAN_SUPPORT_HOURS_MESSAGE, parseHandoffAgentsPayload } from "@/lib/ai/human-support-hours";
import { AgentPicker, type AgentCard } from "@/components/chat/agent-picker";
import type { Role } from "@/types";

type Handoff = {
  id?: string;
  _id?: string;
  status?: string;
  currentAttempt?: number;
  currentAgentId?: string | null;
  attempts?: { order?: number; status?: string }[];
};
type Conv = {
  _id: string;
  customerId: string;
  status: string;
  lastMessageAt?: string;
  aiPaused?: boolean;
  handoffReason?: string | null;
  lastQuestion?: string | null;
  sourceSessionId?: string | null;
  customer?: { id?: string; name?: string; email?: string } | null;
  humanHandoff?: Handoff | null;
};
type Msg = { _id: string; body: string; senderId: string; createdAt: string; role?: string; conversationId?: string };

export function ChatApp({
  userId,
  initialConversationId,
  role = "CUSTOMER",
}: {
  userId: string;
  initialConversationId?: string;
  role?: Role;
}) {
  const isAgent = role === "AGENT" || role === "ADMIN" || role === "SUPER_ADMIN";
  const [convs, setConvs] = useState<Conv[]>([]);
  const [active, setActive] = useState<string | null>(initialConversationId || null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);
  const [online, setOnline] = useState<Record<string, boolean>>({});
  const [picking, setPicking] = useState(false);
  const [agents, setAgents] = useState<AgentCard[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [sendingRequest, setSendingRequest] = useState(false);
  const [supportOpen, setSupportOpen] = useState(true);
  const [hoursHint, setHoursHint] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const joinedRef = useRef<string | null>(null);

  async function loadConvs() {
    const res = await fetch("/api/conversations");
    const json = await res.json();
    if (json.success) {
      setConvs(json.data);
      if (initialConversationId) setActive(initialConversationId);
      else if (!active && json.data[0]) setActive(json.data[0]._id);
    }
  }

  async function loadMessages(id: string) {
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listMessages: true, conversationId: id }),
    });
    const json = await res.json();
    if (json.success) setMessages(json.data);
  }

  useEffect(() => {
    loadConvs();
    void fetch("/api/ai/handoff-agents")
      .then((r) => r.json())
      .then((json) => {
        if (!json.success) return;
        const parsed = parseHandoffAgentsPayload(json.data);
        setAgents(parsed.agents);
        setSupportOpen(parsed.open);
        setHoursHint(parsed.message);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!active) return;
    loadMessages(active);
    const s = getSocket();
    const previous = joinedRef.current;
    if (previous && previous !== active) {
      s?.emit("leave", { conversationId: previous });
    }
    joinedRef.current = active;
    s?.emit("join", { conversationId: active });
    const onMsg = (msg: Msg) => {
      const id = msg._id;
      if (!id) return;
      setMessages((m) => (shouldAppendChatMessage(m, msg, active) ? [...m, { ...msg, _id: id }] : m));
    };
    s?.on("message:new", onMsg);
    const onHandoff = () => {
      void loadConvs();
    };
    s?.on("handoff:offered", onHandoff);
    s?.on("handoff:accepted", onHandoff);
    s?.on("handoff:declined", onHandoff);
    s?.on("handoff:unavailable", onHandoff);
    s?.on("typing:start", () => setTyping(true));
    s?.on("typing:stop", () => setTyping(false));
    s?.on("agent:status", (p: { userId: string; online: boolean }) => {
      setOnline((o) => ({ ...o, [p.userId]: p.online }));
    });
    s?.emit("message:read", { conversationId: active });
    return () => {
      s?.off("message:new", onMsg);
      s?.off("handoff:offered", onHandoff);
      s?.off("handoff:accepted", onHandoff);
      s?.off("handoff:declined", onHandoff);
      s?.off("handoff:unavailable", onHandoff);
      s?.emit("leave", { conversationId: active });
      if (joinedRef.current === active) joinedRef.current = null;
    };
  }, [active]);

  async function startChat() {
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const json = await res.json();
    if (json.success) {
      setActive(json.data._id);
      loadConvs();
    }
  }

  const activeConv = convs.find((c) => c._id === active);
  const roleClass = (m: Msg) => {
    if (m.senderId === userId) return "ml-auto bg-primary text-primary-foreground";
    if (m.role === "AI") return "bg-teal-500/15";
    if (m.role === "SYSTEM") return "bg-amber-500/15";
    return "bg-muted";
  };
  const roleLabel = (m: Msg) =>
    chatMessageLabel({
      role: m.role,
      senderId: m.senderId,
      viewerId: userId,
      customerId: activeConv?.customerId,
    });

  async function send() {
    const body = inputRef.current?.value || "";
    if (!active || !body.trim()) return;
    await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ send: true, conversationId: active, body }),
    });
    if (inputRef.current) inputRef.current.value = "";
    getSocket()?.emit("typing:stop", { conversationId: active });
  }

  const incoming = convs.filter(
    (c) => c.humanHandoff?.status === "OFFERED" && c.humanHandoff.currentAgentId === userId,
  );
  const waitingForAccept =
    activeConv?.customerId === userId &&
    activeConv.aiPaused &&
    activeConv.humanHandoff?.status === "OFFERED";
  const hideComposer = picking || waitingForAccept;

  async function actHandoff(handoffId: string, accept: boolean) {
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(accept ? { acceptHandoff: true, handoffId } : { declineHandoff: true, handoffId }),
    });
    const json = await res.json();
    if (!json.success) return;
    if (accept) {
      const convId = incoming.find((c) => (c.humanHandoff?.id || c.humanHandoff?._id) === handoffId)?._id;
      if (convId) setActive(convId);
    }
    void loadConvs();
  }

  return (
    <div className="space-y-4">
      {isAgent ? (
        <Card data-agent-chat-inbox>
          <h2 className="font-semibold">Chat</h2>
          <p className="mt-1 text-sm text-muted-foreground">Agents</p>
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            {agents.map((agent) => {
              const mine = agent.id === userId;
              return (
                <div
                  key={agent.id}
                  data-agent-tab={agent.ordinal}
                  className={`rounded-xl border px-3 py-2 text-sm ${mine ? "border-primary bg-primary/5" : "border-border"}`}
                >
                  <p className="font-semibold">{agent.label}</p>
                  <p className="text-xs text-muted-foreground">{agent.name}</p>
                  <p className="text-xs">{online[agent.id] ? "Online" : "Available"}</p>
                  {mine ? <p className="text-xs text-muted-foreground">Incoming Requests [{incoming.length}]</p> : null}
                </div>
              );
            })}
          </div>
          <h3 className="mt-4 font-semibold">Incoming Requests</h3>
          <p className="text-xs text-muted-foreground">New Customer Request</p>
          <ul className="mt-2 space-y-2">
            {incoming.map((c) => {
              const hid = c.humanHandoff?.id || c.humanHandoff?._id || "";
              return (
                <li key={c._id} className="rounded-lg border p-3 text-sm">
                  <p>Customer: {c.customer?.name || "Unknown"}</p>
                  <p className="text-xs text-muted-foreground">Customer wants to talk to a human.</p>
                  <p className="text-xs text-muted-foreground">Reason: {c.handoffReason || "Customer requested human support"}</p>
                  {c.lastMessageAt ? (
                    <p className="text-xs text-muted-foreground">Time: {formatDate(c.lastMessageAt)}</p>
                  ) : null}
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" onClick={() => void actHandoff(hid, true)}>Accept</Button>
                    <Button size="sm" variant="outline" onClick={() => void actHandoff(hid, false)}>Decline</Button>
                  </div>
                </li>
              );
            })}
            {!incoming.length ? <li className="text-sm text-muted-foreground">No incoming requests.</li> : null}
          </ul>
        </Card>
      ) : null}
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <Card>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Conversations</h2>
          <Button size="sm" onClick={startChat}>New</Button>
        </div>
        <ul className="mt-4 space-y-1">
          {convs.map((c) => (
            <li key={c._id}>
              <button
                className={`w-full rounded-lg px-3 py-2 text-left text-sm ${active === c._id ? "bg-muted" : ""}`}
                onClick={() => setActive(c._id)}
              >
                Chat {c.customer?.name || c._id.slice(-6)} {c.aiPaused ? "· waiting" : ""} {online[c.customerId] ? "•" : ""}
              </button>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="flex min-h-[60vh] flex-col">
        {activeConv ? (
          <div className="mb-3 space-y-2">
            <p className="text-sm">
              <span className="font-medium">{activeConv.customer?.name || "Customer"}</span>
              {activeConv.customer?.email ? (
                <span className="text-muted-foreground"> · {activeConv.customer.email}</span>
              ) : null}
            </p>
            {activeConv.aiPaused ? (
              <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
                {handoffStatusCopy(activeConv.humanHandoff)}
                <span className="mt-1 block text-xs">
                  Status: {customerHandoffStatusLabel(activeConv.humanHandoff?.status, activeConv.status === "CLOSED")}
                </span>
                {activeConv.handoffReason ? ` · ${activeConv.handoffReason}` : ""}
                {activeConv.lastQuestion ? (
                  <span className="mt-1 block text-xs text-muted-foreground">{activeConv.lastQuestion}</span>
                ) : null}
              </p>
            ) : null}
            {activeConv.humanHandoff?.status === "NO_AGENT_AVAILABLE" && activeConv.customerId === userId ? (
              <Button asChild size="sm" variant="outline">
                <a href="/support/new">Create Ticket</a>
              </Button>
            ) : null}
            {activeConv.customerId === userId && !activeConv.aiPaused ? (
              picking ? (
                <AgentPicker
                  agents={agents}
                  selectedAgentId={selectedAgentId}
                  onSelect={setSelectedAgentId}
                  sending={sendingRequest}
                  onSend={async () => {
                    if (!selectedAgentId) return;
                    setSendingRequest(true);
                    const res = await fetch("/api/ai/escalate", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        sessionId: activeConv.sourceSessionId || `chat-${activeConv._id}`,
                        selectedAgentId,
                      }),
                    });
                    const json = await res.json();
                    setSendingRequest(false);
                    if (!json.success) return;
                    setPicking(false);
                    void loadConvs();
                  }}
                />
              ) : supportOpen ? (
              <Button size="sm" variant="outline" onClick={() => setPicking(true)}>
                Talk to Human
              </Button>
              ) : (
                <p className="whitespace-pre-line text-xs text-muted-foreground">{hoursHint || HUMAN_SUPPORT_HOURS_MESSAGE}</p>
              )
            ) : null}
          </div>
        ) : null}
        <div className="flex-1 space-y-2 overflow-y-auto">
          {messages.map((m) => (
            <div key={m._id} className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${roleClass(m)}`}>
              <p className="text-[10px] opacity-70">{roleLabel(m)}</p>
              <p>{m.body}</p>
              <p className="mt-1 text-[10px] opacity-70">{formatDate(m.createdAt)}</p>
            </div>
          ))}
          {typing ? <p className="text-xs text-muted-foreground">Typing…</p> : null}
        </div>
        <div className="mt-4 flex gap-2">
          {!hideComposer ? (
          <>
          <Input
            ref={inputRef}
            aria-label="Message"
            onKeyDown={(e) => {
              if (e.key === "Enter") send();
              if (active) getSocket()?.emit("typing:start", { conversationId: active });
            }}
          />
          <Button onClick={send}>Send</Button>
          </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {picking ? "Choose an agent, then Send Request." : "Waiting for an agent to accept your request."}
            </p>
          )}
          {active ? (
            <Button
              variant="outline"
              onClick={async () => {
                await fetch("/api/conversations", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ close: true, conversationId: active }),
                });
                loadConvs();
              }}
            >
              Resolve
            </Button>
          ) : null}
        </div>
      </Card>
    </div>
    </div>
  );
}
