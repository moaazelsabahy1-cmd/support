"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bot, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OPEN_ASSISTANT_EVENT, OPEN_HUMAN_HANDOFF_EVENT } from "@/components/marketing/open-assistant";
import { newBrowserId } from "@/lib/browser-id";
import { getWidgetSocket } from "@/lib/socket";
import { customerHandoffStatusLabel, handoffStatusCopy } from "@/lib/ai/handoff-copy";
import { HUMAN_SUPPORT_HOURS_MESSAGE, parseHandoffAgentsPayload } from "@/lib/ai/human-support-hours";
import { shouldAppendChatMessage } from "@/lib/chat-message-label";
import { AgentPicker, type AgentCard } from "@/components/chat/agent-picker";
import type { Socket } from "socket.io-client";

const KEY = process.env.NEXT_PUBLIC_WIDGET_KEY || "solvio-widget-dev-key";
const SESSION_KEY = "solvio-assistant-session";
const MESSAGES_KEY = "solvio-assistant-messages";
const FALLBACK =
  "I could not find a confirmed answer. Create a support ticket or talk to a human and we’ll pick this up.";

type ChatMessage = { role: "user" | "assistant"; text: string; sources?: { title: string }[] };
type LiveMsg = { _id: string; body: string; senderId: string; role?: string; conversationId?: string };
type Handoff = {
  status?: string | null;
  currentAttempt?: number | null;
  attempts?: { order?: number; status?: string }[];
};

function widgetHeaders() {
  return {
    "Content-Type": "application/json",
    "x-solvio-widget-key": KEY,
    "x-widget-parent-origin": typeof window !== "undefined" ? window.location.origin : "",
  };
}

function readStored(): { sessionId: string; messages: ChatMessage[] } {
  if (typeof window === "undefined") {
    return { sessionId: "", messages: [] };
  }
  try {
    const sessionId = sessionStorage.getItem(SESSION_KEY) || newBrowserId();
    sessionStorage.setItem(SESSION_KEY, sessionId);
    const raw = sessionStorage.getItem(MESSAGES_KEY);
    const messages: ChatMessage[] = raw ? JSON.parse(raw) : [];
    return { sessionId, messages };
  } catch {
    return { sessionId: newBrowserId(), messages: [] };
  }
}

export function AiWidget() {
  const initial = readStored();
  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState(initial.sessionId);
  const [messages, setMessages] = useState<ChatMessage[]>(initial.messages);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [offerHuman, setOfferHuman] = useState(false);
  const [human, setHuman] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [widgetToken, setWidgetToken] = useState("");
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [liveMessages, setLiveMessages] = useState<LiveMsg[]>([]);
  const [picking, setPicking] = useState(false);
  const [agents, setAgents] = useState<AgentCard[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [supportOpen, setSupportOpen] = useState(true);
  const [hoursHint, setHoursHint] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    try {
      sessionStorage.setItem(SESSION_KEY, sessionId);
      sessionStorage.setItem(MESSAGES_KEY, JSON.stringify(messages));
    } catch {
      /* ignore quota */
    }
  }, [sessionId, messages]);

  const openPanel = useCallback(() => {
    setOpen(true);
    window.setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  useEffect(() => {
    void fetch("/api/widget/chat", {
      method: "POST",
      headers: widgetHeaders(),
      body: JSON.stringify({ listAgents: true, sessionId: initial.sessionId }),
    })
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
    function onOpen() {
      openPanel();
    }
    window.addEventListener(OPEN_ASSISTANT_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_ASSISTANT_EVENT, onOpen);
  }, [openPanel]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }, [messages, liveMessages, open, loading, human]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setError("");
    setLoading(true);
    if (human && widgetToken) {
      try {
        const res = await fetch("/api/widget/chat", {
          method: "POST",
          headers: widgetHeaders(),
          body: JSON.stringify({ send: true, message: trimmed, sessionId, widgetToken, conversationId }),
        });
        const json = await res.json();
        if (!json.success) setError(json.error?.message || "Could not send");
        else if (json.data.handoff) setHandoff(json.data.handoff);
      } catch {
        setError("Could not send that message");
      } finally {
        setLoading(false);
      }
      return;
    }
    setMessages((m) => [...m, { role: "user", text: trimmed }]);
    try {
      const res = await fetch("/api/widget/chat", {
        method: "POST",
        headers: widgetHeaders(),
        body: JSON.stringify({ message: trimmed, sessionId }),
      });
      const json = await res.json();
      if (!json.success) {
        const setup =
          json.error?.message || "The assistant is unavailable right now. You can create a ticket instead.";
        setError(setup);
        setMessages((m) => [...m, { role: "assistant", text: setup }]);
        setOfferHuman(true);
        return;
      }
      if (json.data.sessionId) setSessionId(json.data.sessionId);
      const reply = String(json.data.response || "").trim() || FALLBACK;
      const sources = Array.isArray(json.data.sources)
        ? (json.data.sources as { title?: string }[])
            .map((s) => ({ title: String(s.title || "").trim() }))
            .filter((s) => s.title)
        : [];
      setMessages((m) => [...m, { role: "assistant", text: reply, sources }]);
      setOfferHuman(Boolean(json.data.offerHuman) || Boolean(json.data.escalated));
    } catch {
      const setup = "We couldn’t reach the assistant. Create a ticket and a teammate will follow up.";
      setError(setup);
      setMessages((m) => [...m, { role: "assistant", text: setup }]);
      setOfferHuman(true);
    } finally {
      setLoading(false);
    }
  }

  async function escalate() {
    if (!selectedAgentId) {
      setError("Choose a support agent");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/widget/chat", {
        method: "POST",
        headers: widgetHeaders(),
        body: JSON.stringify({ escalate: true, sessionId, selectedAgentId }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error?.message || "Could not start a human handoff.");
        setHuman(false);
        return;
      }
      setConversationId(json.data.conversationId);
      setWidgetToken(json.data.widgetToken || "");
      setHandoff(json.data.handoff || null);
      setPicking(false);
      setHuman(true);
      const listed = await fetch("/api/widget/chat", {
        method: "POST",
        headers: widgetHeaders(),
        body: JSON.stringify({ listMessages: true, sessionId, widgetToken: json.data.widgetToken }),
      });
      const listedJson = await listed.json();
      if (listedJson.success) {
        setLiveMessages(listedJson.data.messages || []);
        setHandoff(listedJson.data.handoff || json.data.handoff);
      }
    } catch {
      setError("Could not start a human handoff.");
      setHuman(false);
    } finally {
      setLoading(false);
    }
  }


  useEffect(() => {
    function onHandoffCta() {
      openPanel();
      if (supportOpen) setPicking(true);
      else setError(hoursHint || HUMAN_SUPPORT_HOURS_MESSAGE);
    }
    window.addEventListener(OPEN_HUMAN_HANDOFF_EVENT, onHandoffCta);
    return () => window.removeEventListener(OPEN_HUMAN_HANDOFF_EVENT, onHandoffCta);
  }, [openPanel, supportOpen, hoursHint]);

  useEffect(() => {
    if (!widgetToken || !conversationId) return;
    socketRef.current?.disconnect();
    const s = getWidgetSocket(widgetToken);
    socketRef.current = s;
    s?.emit("join", { conversationId });
    const onMsg = (msg: LiveMsg) => {
      const id = msg._id;
      if (!id) return;
      setLiveMessages((m) => (shouldAppendChatMessage(m, msg, conversationId) ? [...m, { ...msg, _id: id }] : m));
    };
    const refresh = async () => {
      const listed = await fetch("/api/widget/chat", {
        method: "POST",
        headers: widgetHeaders(),
        body: JSON.stringify({ listMessages: true, sessionId, widgetToken }),
      });
      const json = await listed.json();
      if (json.success) {
        setLiveMessages(json.data.messages || []);
        setHandoff(json.data.handoff || null);
      }
    };
    s?.on("message:new", onMsg);
    s?.on("handoff:offered", refresh);
    s?.on("handoff:declined", refresh);
    s?.on("handoff:accepted", refresh);
    s?.on("handoff:unavailable", refresh);
    return () => {
      s?.off("message:new", onMsg);
      s?.off("handoff:offered", refresh);
      s?.off("handoff:declined", refresh);
      s?.off("handoff:accepted", refresh);
      s?.off("handoff:unavailable", refresh);
      s?.emit("leave", { conversationId });
      s?.disconnect();
      socketRef.current = null;
    };
  }, [widgetToken, conversationId, sessionId]);

  function resetConversation() {
    socketRef.current?.disconnect();
    socketRef.current = null;
    const next = newBrowserId();
    setSessionId(next);
    setMessages([]);
    setError("");
    setOfferHuman(false);
    setHuman(false);
    setPicking(false);
    setSelectedAgentId(null);
    setConversationId(null);
    setWidgetToken("");
    setHandoff(null);
    setLiveMessages([]);
  }

  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-40 flex flex-col items-end gap-3">
      {open ? (
        <section
          aria-label="Solvio Assistant"
          className="pointer-events-auto flex w-[min(100vw-2rem,22rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl landing-widget-panel motion-reduce:animate-none"
        >
          <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <p className="flex items-center gap-2 font-semibold">
                <Bot className="h-4 w-4 text-primary" /> Solvio Assistant
              </p>
              <p className="text-xs text-emerald-400">{human ? "Live support" : "Online · ready to help"}</p>
            </div>
            <button
              type="button"
              className="rounded-lg p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Close AI Assistant"
              onClick={() => setOpen(false)}
            >
              <X className="h-4 w-4" />
            </button>
          </header>
          <div ref={listRef} className="max-h-80 min-h-48 space-y-2 overflow-y-auto px-3 py-3">
            {human ? (
              <>
                <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs" data-handoff-status>
                  {handoffStatusCopy(handoff)}
                  {handoff?.status ? (
                    <span className="mt-1 block">Status: {customerHandoffStatusLabel(handoff.status)}</span>
                  ) : null}
                </p>
                {liveMessages.map((m) => (
                  <div
                    key={m._id}
                    className={`rounded-2xl px-3 py-2 text-sm ${
                      m.role === "CUSTOMER" ? "ml-8 bg-primary text-primary-foreground" : "mr-6 border border-border bg-background"
                    }`}
                  >
                    {m.body}
                  </div>
                ))}
              </>
            ) : (
              <>
                {messages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Ask anything about the product. I’ll answer from our docs.</p>
                ) : null}
                {messages.map((m, i) => (
                  <div
                    key={`${m.role}-${i}`}
                    className={`landing-msg-in rounded-2xl px-3 py-2 text-sm ${
                      m.role === "user" ? "ml-8 bg-primary text-primary-foreground" : "mr-6 border border-border bg-background"
                    }`}
                  >
                    {m.text}
                    {m.role === "assistant" && m.sources?.length ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {m.sources.map((s) => s.title).join(" · ")}
                      </p>
                    ) : null}
                  </div>
                ))}
              </>
            )}
            {loading ? (
              <p className="landing-dots text-xs text-muted-foreground" aria-live="polite">
                <span /><span /><span />
                {human ? "Connecting" : "Thinking"}
              </p>
            ) : null}
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
            {picking && !human ? (
              <AgentPicker
                agents={agents}
                selectedAgentId={selectedAgentId}
                onSelect={setSelectedAgentId}
                onSend={() => void escalate()}
                sending={loading}
              />
            ) : null}
          </div>
          <div className="space-y-2 border-t border-border px-3 py-3">
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={resetConversation}>
                Start new conversation
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={loading || human || !supportOpen}
                onClick={() => {
                  if (!supportOpen) {
                    setError(hoursHint || HUMAN_SUPPORT_HOURS_MESSAGE);
                    return;
                  }
                  setPicking(true);
                  openPanel();
                }}
              >
                Talk to a human
              </Button>
              {!supportOpen ? (
                <p className="w-full whitespace-pre-line text-xs text-muted-foreground">{hoursHint || HUMAN_SUPPORT_HOURS_MESSAGE}</p>
              ) : null}
              {handoff?.status === "NO_AGENT_AVAILABLE" ? (
                <Button asChild size="sm" variant="ghost">
                  <Link href="/support/new">Create a ticket</Link>
                </Button>
              ) : null}
            </div>
            {!picking && (!human || handoff?.status === "ACCEPTED") ? (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const input = inputRef.current;
                if (!input) return;
                void send(input.value);
                input.value = "";
              }}
            >
              <Input
                ref={inputRef}
                name="q"
                aria-label="Message the AI assistant"
                placeholder={human ? "Message your agent…" : "Ask anything about the product…"}
                disabled={loading}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
              />
              <Button type="submit" size="icon" disabled={loading} aria-label="Send message">
                <Send className="h-4 w-4" />
              </Button>
            </form>
            ) : null}
          </div>
        </section>
      ) : null}
      <button
        type="button"
        aria-label={open ? "Close AI Assistant" : "Open AI Assistant"}
        aria-expanded={open}
        className="pointer-events-auto relative flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
        onClick={() => (open ? setOpen(false) : openPanel())}
      >
        <Bot className="h-6 w-6" />
        <span className="absolute right-1 top-1 h-3 w-3 rounded-full border-2 border-background bg-emerald-500" aria-hidden />
      </button>
    </div>
  );
}
