"use client";

import { useEffect, useRef, useState } from "react";
import { getSocket, joinConversationRoom } from "@/lib/socket";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import { chatMessageLabel, shouldAppendChatMessage } from "@/lib/chat-message-label";
import { HUMAN_SUPPORT_HOURS_MESSAGE, parseHandoffAgentsPayload } from "@/lib/ai/human-support-hours";
import { AgentPicker, type AgentCard } from "@/components/chat/agent-picker";
import { HumanSupportHeader } from "@/components/chat/human-support-header";
import { HumanRequestCard } from "@/components/chat/human-request-card";
import { apiErrorMessage, readApiJson } from "@/lib/api-client";
import type { Role } from "@/types";

type Handoff = {
  id?: string;
  _id?: string;
  status?: string;
  currentAttempt?: number;
  currentAgentId?: string | null;
  currentAgent?: { id?: string; name?: string } | null;
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
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [agentsError, setAgentsError] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [sendingRequest, setSendingRequest] = useState(false);
  const [supportOpen, setSupportOpen] = useState(true);
  const [hoursHint, setHoursHint] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const joinedRef = useRef<string | null>(null);

  async function loadConvs() {
    try {
      const res = await fetch("/api/conversations");
      const json = await readApiJson<Conv[]>(res);
      if (json.success) {
        setConvs(json.data);
        if (initialConversationId) setActive(initialConversationId);
        else if (!active && json.data[0]) setActive(json.data[0]._id);
      }
    } catch {
      /* ignore */
    }
  }

  async function loadMessages(id: string) {
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listMessages: true, conversationId: id }),
      });
      const json = await readApiJson<Msg[]>(res);
      if (json.success) setMessages(json.data);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    loadConvs();
    void fetch("/api/ai/handoff-agents")
      .then((r) => readApiJson(r))
      .then((json) => {
        if (!json.success) {
          setAgentsError(apiErrorMessage(json, "Could not load support agents"));
          return;
        }
        const parsed = parseHandoffAgentsPayload(json.data);
        setAgents(parsed.agents);
        setSupportOpen(parsed.open);
        setHoursHint(parsed.message);
      })
      .catch(() => setAgentsError("Could not load support agents"))
      .finally(() => setAgentsLoading(false));
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
    const unjoin = joinConversationRoom(s, active);
    const onMsg = (msg: Msg) => {
      const id = msg._id;
      if (!id) return;
      setMessages((m) => (shouldAppendChatMessage(m, msg, active) ? [...m, { ...msg, _id: id }] : m));
    };
    s?.on("message:new", onMsg);
    const onHandoff = () => {
      void loadConvs();
      void loadMessages(active);
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
      unjoin();
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
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ send: true, conversationId: active, body }),
    });
    const json = await readApiJson<Msg>(res);
    if (json.success) {
      const msg = json.data;
      const id = msg._id;
      if (id) {
        setMessages((m) => (shouldAppendChatMessage(m, msg, active) ? [...m, { ...msg, _id: id }] : m));
      }
      if (inputRef.current) inputRef.current.value = "";
    }
    getSocket()?.emit("typing:stop", { conversationId: active });
  }

  const incoming = convs.filter(
    (c) => c.humanHandoff?.status === "OFFERED" && c.humanHandoff.currentAgentId === userId,
  );
  const closedThread =
    activeConv?.status === "CLOSED" ||
    activeConv?.humanHandoff?.status === "COMPLETED" ||
    activeConv?.humanHandoff?.status === "NO_AGENT_AVAILABLE";
  const hideComposer =
    picking || closedThread || (isAgent && activeConv?.humanHandoff?.status === "OFFERED");

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
      if (convId) {
        setActive(convId);
        void loadMessages(convId);
      }
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
          <p className="text-xs text-muted-foreground">Human Request</p>
          <ul className="mt-2 space-y-2">
            {incoming.map((c) => {
              const hid = c.humanHandoff?.id || c.humanHandoff?._id || "";
              return (
                <HumanRequestCard
                  key={c._id}
                  conv={c}
                  onAccept={() => void actHandoff(hid, true)}
                  onDecline={() => void actHandoff(hid, false)}
                />
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
            {activeConv.humanHandoff ? (
              <HumanSupportHeader
                agentLabel={agents.find((a) => a.id === activeConv.humanHandoff?.currentAgentId)?.label}
                agentName={
                  activeConv.humanHandoff?.currentAgent?.name ||
                  agents.find((a) => a.id === activeConv.humanHandoff?.currentAgentId)?.name
                }
                customerName={isAgent ? activeConv.customer?.name : undefined}
                avatarUrl={agents.find((a) => a.id === activeConv.humanHandoff?.currentAgentId)?.avatarUrl}
                status={activeConv.humanHandoff?.status}
                currentAttempt={activeConv.humanHandoff?.currentAttempt}
                attempts={activeConv.humanHandoff?.attempts}
                conversationClosed={activeConv.status === "CLOSED"}
              />
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
                  loading={agentsLoading}
                  error={agentsError || null}
                  onSend={async () => {
                    if (!selectedAgentId) return;
                    setSendingRequest(true);
                    try {
                    const res = await fetch("/api/ai/escalate", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        sessionId: activeConv.sourceSessionId || `chat-${activeConv._id}`,
                        selectedAgentId,
                      }),
                    });
                    const json = await readApiJson(res);
                    if (!json.success) return;
                    setPicking(false);
                    void loadConvs();
                    } finally {
                    setSendingRequest(false);
                    }
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
        <div className="mt-auto flex shrink-0 gap-2 pt-3">
          {!hideComposer ? (
          <>
          <Input
            ref={inputRef}
            aria-label="Type your message"
            placeholder="Type your message..."
            onKeyDown={(e) => {
              if (e.key === "Enter") send();
              if (active) getSocket()?.emit("typing:start", { conversationId: active });
            }}
          />
          <Button onClick={send}>Send</Button>
          </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {picking ? "Choose an agent, then Send Request." : closedThread ? "Conversation closed" : "Accept the request to reply."}
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
