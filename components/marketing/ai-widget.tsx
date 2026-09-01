"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bot, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OPEN_ASSISTANT_EVENT } from "@/components/marketing/open-assistant";

const KEY = process.env.NEXT_PUBLIC_WIDGET_KEY || "solvio-widget-dev-key";
const SESSION_KEY = "solvio-assistant-session";
const MESSAGES_KEY = "solvio-assistant-messages";
const FALLBACK =
  "I could not find a confirmed answer. Create a support ticket or talk to a human and we’ll pick this up.";

type ChatMessage = { role: "user" | "assistant"; text: string; sources?: { title: string }[] };

function readStored(): { sessionId: string; messages: ChatMessage[] } {
  if (typeof window === "undefined") {
    return { sessionId: "", messages: [] };
  }
  try {
    const sessionId = sessionStorage.getItem(SESSION_KEY) || crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, sessionId);
    const raw = sessionStorage.getItem(MESSAGES_KEY);
    const messages: ChatMessage[] = raw ? JSON.parse(raw) : [];
    return { sessionId, messages };
  } catch {
    return { sessionId: crypto.randomUUID(), messages: [] };
  }
}

export function AiWidget() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [offerHuman, setOfferHuman] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = readStored();
    setSessionId(stored.sessionId);
    setMessages(stored.messages);
  }, []);

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
  }, [messages, open, loading]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setError("");
    setLoading(true);
    setMessages((m) => [...m, { role: "user", text: trimmed }]);
    try {
      const res = await fetch("/api/widget/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-solvio-widget-key": KEY,
          "x-widget-parent-origin": typeof window !== "undefined" ? window.location.origin : "",
        },
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
    setLoading(true);
    try {
      await fetch("/api/widget/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-solvio-widget-key": KEY,
          "x-widget-parent-origin": typeof window !== "undefined" ? window.location.origin : "",
        },
        body: JSON.stringify({ escalate: true, sessionId }),
      });
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: "A teammate can take it from here. Opening a ticket so nothing is lost.",
        },
      ]);
      router.push("/support/new");
    } catch {
      setError("Could not start a human handoff. Please create a ticket.");
    } finally {
      setLoading(false);
    }
  }

  function resetConversation() {
    const next = crypto.randomUUID();
    setSessionId(next);
    setMessages([]);
    setError("");
    setOfferHuman(false);
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
              <p className="text-xs text-emerald-400">Online · ready to help</p>
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
            {loading ? (
              <p className="landing-dots text-xs text-muted-foreground" aria-live="polite">
                <span /><span /><span />
                Thinking
              </p>
            ) : null}
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
            {offerHuman ? (
              <p className="text-xs text-muted-foreground">
                I may not have a full answer. Create a ticket or talk to a human.
              </p>
            ) : null}
          </div>
          <div className="space-y-2 border-t border-border px-3 py-3">
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={resetConversation}>
                Start new conversation
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={escalate} disabled={loading}>
                Talk to a human
              </Button>
              <Button asChild size="sm" variant="ghost">
                <Link href="/support/new">Create a ticket</Link>
              </Button>
            </div>
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
                placeholder="Ask anything about the product…"
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
