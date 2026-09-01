"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export function AiAssistant() {
  const sessionId = useMemo(() => {
    if (typeof window === "undefined") return "ssr";
    const key = "solvio-ai-session";
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
    return id;
  }, []);
  const [messages, setMessages] = useState<{ role: string; text: string; sources?: { title: string; type?: string; url?: string }[] }[]>([]);
  const [offer, setOffer] = useState(false);
  const [handedOff, setHandedOff] = useState(false);

  async function send(form: HTMLFormElement) {
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
    setOffer(Boolean(json.data.offerHuman));
    setHandedOff(Boolean(json.data.handedOff || json.data.aiPaused));
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">AI support assistant</h1>
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
      </Card>
      {handedOff ? (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          A human agent has been notified. Continue in Chat.
        </p>
      ) : null}
      {offer ? (
        <Button variant="outline" onClick={async () => {
          await fetch("/api/ai/escalate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId }) });
          toast.success("A human agent will take over in Chat");
        }}>Talk to a human agent</Button>
      ) : null}
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); send(e.currentTarget); }}>
        <Input name="q" aria-label="Ask Solvio" placeholder="Ask a question" />
        <Button type="submit">Send</Button>
      </form>
    </div>
  );
}
