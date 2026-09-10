"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { newBrowserId } from "@/lib/browser-id";
import { getSocket, joinConversationRoom } from "@/lib/socket";
import { HUMAN_SUPPORT_HOURS_MESSAGE, parseHandoffAgentsPayload } from "@/lib/ai/human-support-hours";
import { chatMessageLabel, shouldAppendChatMessage } from "@/lib/chat-message-label";
import { formatDate } from "@/lib/utils";
import { AgentPicker, type AgentCard } from "@/components/chat/agent-picker";
import { HumanSupportHeader } from "@/components/chat/human-support-header";
import { apiErrorMessage, readApiJson } from "@/lib/api-client";

type Handoff = {
  status?: string | null;
  currentAttempt?: number | null;
  currentAgentId?: string | null;
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
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [agentsError, setAgentsError] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [supportOpen, setSupportOpen] = useState(true);
  const [hoursHint, setHoursHint] = useState("");
  const [asking, setAsking] = useState(false);
  const [sendingHuman, setSendingHuman] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
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

  async function loadLive(id: string) {
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listMessages: true, conversationId: id }),
      });
      const json = await readApiJson<Msg[]>(res);
      if (json.success) setLiveMessages(json.data);
      const convsRes = await fetch("/api/conversations");
      const convs = await readApiJson<{ _id: string; humanHandoff?: Handoff; customerId?: string; customer?: { id?: string } }[]>(convsRes);
      if (convs.success) {
        const conv = convs.data.find((c) => c._id === id);
        if (conv) {
          setHandoff(conv.humanHandoff || null);
          setCustomerId(conv.customerId || conv.customer?.id || null);
        }
      }
    } catch {
      toast.error("Could not load this conversation.");
    }
  }

  async function escalate() {
    if (!selectedAgentId) {
      toast.error("Choose a support agent");
      return;
    }
    setConnecting(true);
    try {
      const res = await fetch("/api/ai/escalate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, selectedAgentId }),
      });
      const json = await readApiJson<{ _id?: string; id?: string; customerId?: string; humanHandoff?: Handoff }>(res);
      if (!json.success) {
        toast.error(apiErrorMessage(json, "Could not start human support"));
        return;
      }
      const id = json.data._id || json.data.id;
      setConversationId(id || null);
      setUserId(json.data.customerId || null);
      setCustomerId(json.data.customerId || null);
      setHandoff(json.data.humanHandoff || null);
      setPicking(false);
      setHuman(true);
      if (id) await loadLive(id);
    } catch {
      toast.error("Could not start human support");
    } finally {
      setConnecting(false);
    }
  }

  useEffect(() => {
    if (!conversationId) return;
    void loadLive(conversationId);
    const s = getSocket();
    const unjoin = joinConversationRoom(s, conversationId);
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
      unjoin();
    };
  }, [conversationId]);

  async function sendAi(form: HTMLFormElement) {
    const input = form.elements.namedItem("q") as HTMLInputElement;
    const message = input.value;
    if (!message || asking) return;
    input.value = "";
    setMessages((m) => [...m, { role: "user", text: message }]);
    setAsking(true);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, sessionId }),
      });
      const json = await readApiJson<{
        response: string;
        sources?: { title: string; type?: string; url?: string }[];
        handedOff?: boolean;
        aiPaused?: boolean;
        conversationId?: string;
      }>(res);
      if (!json.success) {
        toast.error(apiErrorMessage(json, "Could not send that message"));
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
    } catch {
      toast.error("Could not reach the assistant.");
    } finally {
      setAsking(false);
    }
  }

  async function sendHuman() {
    const body = inputRef.current?.value || "";
    if (!conversationId || !body.trim() || sendingHuman) return;
    setSendingHuman(true);
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ send: true, conversationId, body }),
      });
      const json = await readApiJson<Msg>(res);
      if (!json.success) {
        toast.error(apiErrorMessage(json, "Could not send that message"));
        return;
      }
      const msg = json.data;
      const id = msg._id;
      if (id) {
        setLiveMessages((m) => (shouldAppendChatMessage(m, msg, conversationId) ? [...m, { ...msg, _id: id }] : m));
      }
      if (inputRef.current) inputRef.current.value = "";
    } catch {
      toast.error("Could not send that message");
    } finally {
      setSendingHuman(false);
    }
  }

  const viewerId = userId || customerId || "";
  const selectedCard = agents.find((a) => a.id === selectedAgentId);
  const closedHuman =
    handoff?.status === "COMPLETED" || handoff?.status === "NO_AGENT_AVAILABLE";
  const canTypeToHuman = human && (handoff?.status === "OFFERED" || handoff?.status === "ACCEPTED" || !handoff);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">AI support assistant</h1>
      {human ? (
        <Card className="flex min-h-[50vh] flex-col space-y-3">
          <HumanSupportHeader
            agentLabel={selectedCard?.label || agents.find((a) => a.id === handoff?.currentAgentId)?.label}
            agentName={selectedCard?.name || agents.find((a) => a.id === handoff?.currentAgentId)?.name}
            avatarUrl={selectedCard?.avatarUrl || agents.find((a) => a.id === handoff?.currentAgentId)?.avatarUrl}
            status={handoff?.status}
            currentAttempt={handoff?.currentAttempt}
            attempts={handoff?.attempts}
          />
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
          {canTypeToHuman ? (
          <div className="mt-auto flex shrink-0 gap-2 pt-3">
            <Input ref={inputRef} aria-label="Type your message" placeholder="Type your message..." onKeyDown={(e) => { if (e.key === "Enter") void sendHuman(); }} />
            <Button type="button" disabled={sendingHuman} onClick={() => void sendHuman()}>{sendingHuman ? "Sending…" : "Send"}</Button>
          </div>
          ) : closedHuman ? (
            <p className="text-sm text-muted-foreground">Conversation closed</p>
          ) : connecting ? (
            <p className="text-sm text-muted-foreground">Connecting...</p>
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
                loading={agentsLoading}
                error={agentsError || null}
              />
            ) : null}
          </Card>
          {!picking ? (
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void sendAi(e.currentTarget); }}>
            <Input name="q" aria-label="Ask Solvio" placeholder="Ask a question" />
            <Button type="submit" disabled={asking}>{asking ? "Sending…" : "Send"}</Button>
          </form>
          ) : null}
        </>
      )}
      {!supportOpen ? (
        <p className="whitespace-pre-line text-sm text-muted-foreground">{hoursHint || HUMAN_SUPPORT_HOURS_MESSAGE}</p>
      ) : null}
      {!human ? (
      <Button
        variant="outline"
        disabled={!supportOpen || connecting}
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
      ) : null}
    </div>
  );
}
