"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";

export function AiLogs() {
  const [items, setItems] = useState<{ _id: string; message: string; response: string; question?: string; answer?: string; escalated: boolean; model?: string; createdAt: string }[]>([]);
  useEffect(() => {
    fetch("/api/ai/logs").then((r) => r.json()).then((j) => j.success && setItems(j.data));
  }, []);
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold">AI conversations</h1>
      {items.map((l) => (
        <Card key={l._id}>
          <p className="text-xs text-muted-foreground">{new Date(l.createdAt).toLocaleString()} · {l.model} {l.escalated ? "· escalated" : ""}</p>
          <p className="mt-2 font-medium">{l.question || l.message}</p>
          <p className="mt-1 text-sm text-muted-foreground">{l.answer || l.response}</p>
        </Card>
      ))}
    </div>
  );
}
