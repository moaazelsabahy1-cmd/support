"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { newBrowserId } from "@/lib/browser-id";

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
        body: JSON.stringify({ message: text, sessionId }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error?.message || "Error");
        return;
      }
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
      </div>
      {offer ? (
        <Button
          className="mt-2"
          variant="outline"
          type="button"
          onClick={async () => {
            await fetch("/api/widget/chat", {
              method: "POST",
              headers: widgetHeaders(key, parent),
              body: JSON.stringify({ escalate: true, sessionId }),
            });
            setMessages((m) => [...m, { role: "assistant", text: "A human teammate will follow up. Thank you." }]);
            setOffer(false);
          }}
        >
          Talk to a human agent
        </Button>
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
