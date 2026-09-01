"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Badge, Card } from "@/components/ui/card";
import { toast } from "sonner";

export function MeetingsBoard() {
  const [items, setItems] = useState<Meeting[]>([]);
  function load() {
    fetch("/api/meetings").then((r) => r.json()).then((j) => j.success && setItems(j.data));
  }
  useEffect(load, []);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Meetings</h1>
      <form className="grid gap-3 rounded-2xl border p-4 md:grid-cols-2" onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const res = await fetch("/api/meetings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          title: f.get("title"), description: f.get("description"), date: f.get("date"), startTime: f.get("startTime"), endTime: f.get("endTime"),
        }) });
        const json = await res.json();
        if (!json.success) toast.error(json.error?.message);
        else { toast.success("Requested"); load(); }
      }}>
        <div className="md:col-span-2"><Label>Title</Label><Input name="title" required /></div>
        <div className="md:col-span-2"><Label>Description</Label><Textarea name="description" /></div>
        <div><Label>Date</Label><Input name="date" type="date" required /></div>
        <div><Label>Start</Label><Input name="startTime" type="time" required /></div>
        <div><Label>End</Label><Input name="endTime" type="time" required /></div>
        <div className="md:col-span-2"><Button type="submit">Request meeting</Button></div>
      </form>
      <div className="grid gap-3">
        {items.map((m) => (
          <Card key={m._id} className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">{m.title}</p>
              <p className="text-sm text-muted-foreground">{new Date(m.date).toLocaleDateString()} {m.startTime}–{m.endTime}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge>{m.status}</Badge>
              <Button size="sm" onClick={async () => { await fetch(`/api/meetings/${m._id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "CONFIRMED" }) }); load(); }}>Confirm</Button>
              <Button size="sm" variant="outline" onClick={async () => { await fetch(`/api/meetings/${m._id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "CANCELLED" }) }); load(); }}>Cancel</Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

type Meeting = { _id: string; title: string; date: string; startTime: string; endTime: string; status: string };
