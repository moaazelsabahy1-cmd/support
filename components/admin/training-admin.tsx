"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { toast } from "sonner";

export function TrainingAdmin() {
  const [items, setItems] = useState<{ _id: string; question: string; answer: string; enabled: boolean }[]>([]);
  const [q, setQ] = useState("");
  function load() {
    fetch(`/api/ai/training?q=${encodeURIComponent(q)}`).then((r) => r.json()).then((j) => j.success && setItems(j.data));
  }
  useEffect(load, [q]);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">AI training pairs</h1>
      <Input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
      <form className="grid gap-3 rounded-2xl border p-4" onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const res = await fetch("/api/ai/training", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          question: f.get("question"), answer: f.get("answer"), enabled: true,
        }) });
        const json = await res.json();
        if (!json.success) toast.error(json.error?.message);
        else { toast.success("Saved"); (e.target as HTMLFormElement).reset(); load(); }
      }}>
        <div><Label>Question</Label><Input name="question" required /></div>
        <div><Label>Answer</Label><Textarea name="answer" required /></div>
        <Button type="submit">Add pair</Button>
      </form>
      <ul className="space-y-2">
        {items.map((p) => (
          <li key={p._id} className="rounded-xl border p-3">
            <p className="font-medium">{p.question}</p>
            <p className="text-sm text-muted-foreground">{p.answer}</p>
            <Button size="sm" variant="destructive" className="mt-2" onClick={async () => {
              await fetch("/api/ai/training", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deleteId: p._id }) });
              load();
            }}>Delete</Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
