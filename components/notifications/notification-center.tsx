"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import Link from "next/link";
import { resolveNotificationHref } from "@/lib/notification-href";

export function NotificationCenter() {
  const [data, setData] = useState<{ items: Item[]; unread: number } | null>(null);
  function load() {
    fetch("/api/notifications").then((r) => r.json()).then((j) => j.success && setData(j.data));
  }
  useEffect(load, []);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Notifications</h1>
        <Button variant="outline" onClick={async () => { await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); load(); }}>Mark all read</Button>
      </div>
      {data?.items.map((n) => {
        const open = resolveNotificationHref(n);
        return (
          <Card key={n._id || n.id} className={n.read ? "opacity-70" : ""}>
            <p className="font-medium">{n.title}</p>
            <p className="text-sm text-muted-foreground">{n.body}</p>
            {open ? <Link className="text-sm text-primary" href={open}>Open</Link> : null}
          </Card>
        );
      })}
    </div>
  );
}

type Item = {
  id?: string;
  _id?: string;
  title: string;
  body: string;
  href?: string;
  read: boolean;
  data?: { url?: string; href?: string };
};
