"use client";

import { useEffect, useRef, useState } from "react";
import { getSocket } from "@/lib/socket";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import { chatMessageLabel, shouldAppendChatMessage } from "@/lib/chat-message-label";

type Conv = {
  _id: string;
  customerId: string;
  status: string;
  lastMessageAt?: string;
  aiPaused?: boolean;
  handoffReason?: string | null;
};
type Msg = { _id: string; body: string; senderId: string; createdAt: string; role?: string; conversationId?: string };

export function ChatApp({ userId, initialConversationId }: { userId: string; initialConversationId?: string }) {
  const [convs, setConvs] = useState<Conv[]>([]);
  const [active, setActive] = useState<string | null>(initialConversationId || null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);
  const [online, setOnline] = useState<Record<string, boolean>>({});
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
    s?.on("typing:start", () => setTyping(true));
    s?.on("typing:stop", () => setTyping(false));
    s?.on("agent:status", (p: { userId: string; online: boolean }) => {
      setOnline((o) => ({ ...o, [p.userId]: p.online }));
    });
    s?.emit("message:read", { conversationId: active });
    return () => {
      s?.off("message:new", onMsg);
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

  return (
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
                Chat {c._id.slice(-6)} {c.aiPaused ? "· waiting" : ""} {online[c.customerId] ? "•" : ""}
              </button>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="flex min-h-[60vh] flex-col">
        {activeConv?.aiPaused ? (
          <p className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
            Waiting for a human agent{activeConv.handoffReason ? ` · ${activeConv.handoffReason}` : ""}.
          </p>
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
          <Input
            ref={inputRef}
            aria-label="Message"
            onKeyDown={(e) => {
              if (e.key === "Enter") send();
              if (active) getSocket()?.emit("typing:start", { conversationId: active });
            }}
          />
          <Button onClick={send}>Send</Button>
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
  );
}
