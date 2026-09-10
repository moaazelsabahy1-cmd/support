"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { newBrowserId } from "@/lib/browser-id";
import { AgentPicker, type AgentCard } from "@/components/chat/agent-picker";
import { HUMAN_SUPPORT_HOURS_MESSAGE, parseHandoffAgentsPayload } from "@/lib/ai/human-support-hours";

type WidgetConfig = {
  title: string;
  welcomeMessage: string;
  assistantName: string;
  logoUrl: string | null;
  primaryColor: string;
  language: string;
};

function detectParentOrigin(queryParent: string) {
  try {
    const ancestors = window.location.ancestorOrigins;
    if (ancestors && ancestors.length) return new URL(ancestors[0]).origin;
  } catch {
    /* ignore */
  }
  try {
    if (document.referrer) return new URL(document.referrer).origin;
  } catch {
    /* ignore */
  }
  return queryParent;
}

function widgetHeaders(key: string, parent: string) {
  return {
    "Content-Type": "application/json",
    "x-widget-key": key,
    "x-solvio-widget-key": key,
    "x-widget-parent-origin": parent,
  };
}

export function EmbedWidget() {
  const params = useSearchParams();
  const key = params.get("key") || process.env.NEXT_PUBLIC_WIDGET_KEY || "";
  const queryParent = params.get("parent") || "";
  const sessionId = useMemo(() => newBrowserId(), []);
  const [parent, setParent] = useState(queryParent);
  const [config, setConfig] = useState<WidgetConfig>({
    title: "Assistant",
    welcomeMessage: "Hi, how can I help?",
    assistantName: "Assistant",
    logoUrl: null,
    primaryColor: "#0f766e",
    language: "en",
  });
  const [ready, setReady] = useState(false);
  const [messages, setMessages] = useState<{ role: string; text: string }[]>([]);
  const [offer, setOffer] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [human, setHuman] = useState(false);
  const [widgetToken, setWidgetToken] = useState("");
  const [status, setStatus] = useState("");
  const [picking, setPicking] = useState(false);
  const [agents, setAgents] = useState<AgentCard[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [supportOpen, setSupportOpen] = useState(true);
  const [hoursHint, setHoursHint] = useState("");

  useEffect(() => {
    const resolvedParent = detectParentOrigin(queryParent);
    setParent(resolvedParent);
    if (!key) {
      setError("Missing widget key");
      setReady(true);
      return;
    }
    fetch(`/api/widget/config?key=${encodeURIComponent(key)}&parent=${encodeURIComponent(resolvedParent)}`, {
      headers: widgetHeaders(key, resolvedParent),
    })
      .then((res) => res.json())
      .then((json) => {
        if (!json.success) {
          setError(json.error?.message || "Widget is not available on this site");
          return;
        }
        const next = json.data as WidgetConfig;
        setConfig(next);
        setMessages([{ role: "assistant", text: next.welcomeMessage }]);
      })
      .catch(() => setError("Could not load the assistant"))
      .finally(() => setReady(true));
    fetch("/api/widget/chat", {
      method: "POST",
      headers: widgetHeaders(key, resolvedParent),
      body: JSON.stringify({ listAgents: true, sessionId }),
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
  }, [key, queryParent]);

  async function send(message: string) {
    const text = message.trim();
    if (!text || busy) return;
    setBusy(true);
    setError("");
    setMessages((m) => [...m, { role: "user", text }]);
    try {
      const res = await fetch("/api/widget/chat", {
        method: "POST",
        headers: widgetHeaders(key, parent),
        body: JSON.stringify(
          human && widgetToken
            ? { send: true, message: text, sessionId, widgetToken }
            : { message: text, sessionId },
        ),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error?.message || "Error");
        return;
      }
      if (human) return;
      setMessages((m) => [...m, { role: "assistant", text: json.data.response }]);
      setOffer(Boolean(json.data.offerHuman));
    } catch {
      setError("Could not send that message");
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem("q") as HTMLInputElement;
    void send(input.value);
    input.value = "";
  }

  const color = config.primaryColor || "#0f766e";

  return (
    <div className="flex h-dvh flex-col p-3" style={{ ["--widget-accent" as string]: color }}>
      <div className="mb-2 flex items-center gap-2">
        {config.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={config.logoUrl} alt="" className="h-7 w-7 rounded object-contain" />
        ) : null}
        <div className="text-sm font-semibold">{config.title}</div>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto rounded-xl border p-3">
        {ready
          ? messages.map((m, i) => (
              <div
                key={i}
                className={`rounded-lg px-3 py-2 text-sm ${m.role === "user" ? "ml-8 text-white" : "mr-8 bg-muted"}`}
                style={m.role === "user" ? { background: color } : undefined}
              >
                {m.text}
              </div>
            ))
          : <p className="text-sm text-muted-foreground">Loading…</p>}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {human && status ? <p className="text-xs text-muted-foreground">{status}</p> : null}
      </div>
      <Button
        className="mt-2"
        variant="outline"
        type="button"
        disabled={!supportOpen}
        onClick={() => {
          if (!supportOpen) {
            setError(hoursHint || HUMAN_SUPPORT_HOURS_MESSAGE);
            return;
          }
          setPicking(true);
        }}
      >
        Talk to a human agent
      </Button>
      {!supportOpen ? (
        <p className="mt-2 whitespace-pre-line text-xs text-muted-foreground">{hoursHint || HUMAN_SUPPORT_HOURS_MESSAGE}</p>
      ) : null}
      {picking && !human ? (
        <AgentPicker
          agents={agents}
          selectedAgentId={selectedAgentId}
          onSelect={setSelectedAgentId}
          sending={busy}
          onSend={async () => {
            if (!selectedAgentId) return;
            setBusy(true);
            const res = await fetch("/api/widget/chat", {
              method: "POST",
              headers: widgetHeaders(key, parent),
              body: JSON.stringify({ escalate: true, sessionId, selectedAgentId }),
            });
            const json = await res.json();
            setBusy(false);
            if (!json.success) {
              setError(json.error?.message || "Could not start human support");
              return;
            }
            setHuman(true);
            setPicking(false);
            setWidgetToken(json.data.widgetToken || "");
            setStatus(`Request sent to Agent ${json.data.handoff?.currentAttempt || 1}. Waiting for Agent ${json.data.handoff?.currentAttempt || 1}...`);
            setOffer(false);
          }}
        />
      ) : null}
      <form className="mt-2 flex gap-2" onSubmit={onSubmit}>
        <Input name="q" aria-label="Message" disabled={!ready || Boolean(error && !messages.length)} />
        <Button type="submit" disabled={busy || !ready} style={{ background: color }}>
          Send
        </Button>
      </form>
    </div>
  );
}
