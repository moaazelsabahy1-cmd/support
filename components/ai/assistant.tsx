"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { newBrowserId } from "@/lib/browser-id";
import { getSocket } from "@/lib/socket";
import { handoffStatusCopy, customerHandoffStatusLabel } from "@/lib/ai/handoff-copy";
import { HUMAN_SUPPORT_HOURS_MESSAGE, parseHandoffAgentsPayload } from "@/lib/ai/human-support-hours";
import { chatMessageLabel, shouldAppendChatMessage } from "@/lib/chat-message-label";
import { formatDate } from "@/lib/utils";
import { AgentPicker, type AgentCard } from "@/components/chat/agent-picker";

type Handoff = {
  status?: string | null;
  currentAttempt?: number | null;
  attempts?: { order?: number; status?: string }[];
};
type Msg = { _id: string; body: string; senderId: string; createdAt: string; role?: string; conversationId?: string };

export function AiAssistant() {
  const sessionId = useMemo(() => {
    if (typeof window === "undefined") return "ssr";
    const key = "solvio-ai-session";
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const id = newBrowserId();
    sessionStorage.setItem(key, id);
    return id;
  }, []);
  const [messages, setMessages] = useState<{ role: string; text: string; sources?: { title: string; type?: string; url?: string }[] }[]>([]);
  const [human, setHuman] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [liveMessages, setLiveMessages] = useState<Msg[]>([]);
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [picking, setPicking] = useState(false);
  const [agents, setAgents] = useState<AgentCard[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [supportOpen, setSupportOpen] = useState(true);
  const [hoursHint, setHoursHint] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
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

  async function loadLive(id: string) {
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listMessages: true, conversationId: id }),
    });
    const json = await res.json();
    if (json.success) setLiveMessages(json.data);
    const convs = await fetch("/api/conversations").then((r) => r.json());
    if (convs.success) {
      const conv = convs.data.find((c: { _id: string }) => c._id === id);
      if (conv) {
        setHandoff(conv.humanHandoff || null);
        setCustomerId(conv.customerId || conv.customer?.id || null);
      }
    }
  }

  async function escalate() {
    if (!selectedAgentId) {
      toast.error("Choose a support agent");
      return;
    }
    setConnecting(true);
    const res = await fetch("/api/ai/escalate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, selectedAgentId }),
    });
    const json = await res.json();
    if (!json.success) {
      toast.error(json.error?.message || "Could not start human support");
      setConnecting(false);
      return;
    }
    const id = json.data._id || json.data.id;
    setConversationId(id);
    setUserId(json.data.customerId);
    setCustomerId(json.data.customerId);
    setHandoff(json.data.humanHandoff || null);
    setPicking(false);
    setHuman(true);
    await loadLive(id);
    setConnecting(false);
  }

  useEffect(() => {
    if (!conversationId) return;
    void loadLive(conversationId);
    const s = getSocket();
    s?.emit("join", { conversationId });
    const onMsg = (msg: Msg) => {
      const id = msg._id;
      if (!id) return;
      setLiveMessages((m) => (shouldAppendChatMessage(m, msg, conversationId) ? [...m, { ...msg, _id: id }] : m));
    };
    const onHandoff = () => {
      void loadLive(conversationId);
    };
    s?.on("message:new", onMsg);
    s?.on("handoff:offered", onHandoff);
    s?.on("handoff:declined", onHandoff);
    s?.on("handoff:accepted", onHandoff);
    s?.on("handoff:unavailable", onHandoff);
    return () => {
      s?.off("message:new", onMsg);
      s?.off("handoff:offered", onHandoff);
      s?.off("handoff:declined", onHandoff);
      s?.off("handoff:accepted", onHandoff);
      s?.off("handoff:unavailable", onHandoff);
      s?.emit("leave", { conversationId });
    };
  }, [conversationId]);

  async function sendAi(form: HTMLFormElement) {
    const input = form.elements.namedItem("q") as HTMLInputElement;
    const message = input.value;
    if (!message) return;
    input.value = "";
    setMessages((m) => [...m, { role: "user", text: message }]);
    const res = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, sessionId }),
    });
    const json = await res.json();
    if (!json.success) {
      toast.error(json.error?.message);
      return;
    }
    setMessages((m) => [...m, { role: "assistant", text: json.data.response, sources: json.data.sources }]);
    if (json.data.handedOff || json.data.aiPaused) {
      const id = json.data.conversationId;
      if (id) {
        setHuman(true);
        setConversationId(id);
        await loadLive(id);
      }
    }
  }

  async function sendHuman() {
    const body = inputRef.current?.value || "";
    if (!conversationId || !body.trim()) return;
    await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ send: true, conversationId, body }),
    });
    if (inputRef.current) inputRef.current.value = "";
  }

  const banner = connecting && !handoff ? "Connecting..." : handoffStatusCopy(handoff);
  const viewerId = userId || customerId || "";
  const waiting = human && handoff?.status !== "ACCEPTED";

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">AI support assistant</h1>
      {human ? (
        <Card className="flex min-h-[50vh] flex-col space-y-3">
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm" data-handoff-status>
            {banner}
            {handoff ? (
              <span className="mt-1 block text-xs">Status: {customerHandoffStatusLabel(handoff.status)}</span>
            ) : null}
          </p>
          {handoff?.status === "NO_AGENT_AVAILABLE" ? (
            <Button asChild size="sm" variant="outline">
              <Link href="/support/new">Create Ticket</Link>
            </Button>
          ) : null}
          <div className="flex-1 space-y-2 overflow-y-auto">
            {liveMessages.map((m) => (
              <div
                key={m._id}
                className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                  m.senderId === viewerId ? "ml-auto bg-primary text-primary-foreground" : "bg-muted"
                }`}
              >
                <p className="text-[10px] opacity-70">
                  {chatMessageLabel({
                    role: m.role,
                    senderId: m.senderId,
                    viewerId,
                    customerId,
                  })}
                </p>
                <p>{m.body}</p>
                <p className="mt-1 text-[10px] opacity-70">{formatDate(m.createdAt)}</p>
              </div>
            ))}
          </div>
          {handoff?.status === "ACCEPTED" ? (
          <div className="flex gap-2">
            <Input ref={inputRef} aria-label="Message the agent" placeholder="Message your agent" onKeyDown={(e) => { if (e.key === "Enter") void sendHuman(); }} />
            <Button type="button" onClick={() => void sendHuman()}>Send</Button>
          </div>
          ) : waiting ? (
            <p className="text-sm text-muted-foreground">Waiting for an agent to accept your request.</p>
          ) : null}
        </Card>
      ) : (
        <>
          <Card className="min-h-[50vh] space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "text-right" : ""}>
                <div className={`inline-block rounded-xl px-3 py-2 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{m.text}</div>
                {m.role === "assistant" && m.sources?.length ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {m.sources.map((s) => s.title + (s.url ? ` (${s.url})` : "")).join(" · ")}
                  </p>
                ) : null}
              </div>
            ))}
            {picking ? (
              <AgentPicker
                agents={agents}
                selectedAgentId={selectedAgentId}
                onSelect={setSelectedAgentId}
                onSend={() => void escalate()}
                sending={connecting}
              />
            ) : null}
          </Card>
          {!picking ? (
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void sendAi(e.currentTarget); }}>
            <Input name="q" aria-label="Ask Solvio" placeholder="Ask a question" />
            <Button type="submit">Send</Button>
          </form>
          ) : null}
        </>
      )}
      {!supportOpen ? (
        <p className="whitespace-pre-line text-sm text-muted-foreground">{hoursHint || HUMAN_SUPPORT_HOURS_MESSAGE}</p>
      ) : null}
      <Button
        variant="outline"
        disabled={!supportOpen}
        onClick={() => {
          if (!supportOpen) {
            toast.error(hoursHint || HUMAN_SUPPORT_HOURS_MESSAGE);
            return;
          }
          setPicking(true);
        }}
      >
        Talk to Human
      </Button>
    </div>
  );
}
