"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/card";
import { toast } from "sonner";

export function SourcesAdmin() {
  const [data, setData] = useState<{ files: Src[]; web: Src[] } | null>(null);
  function load() {
    fetch("/api/ai/sources").then((r) => r.json()).then((j) => j.success && setData(j.data));
  }
  useEffect(load, []);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">AI sources</h1>
      <form className="flex gap-2" onSubmit={async (e) => {
        e.preventDefault();
        const url = String(new FormData(e.currentTarget).get("url"));
        const res = await fetch("/api/ai/sources", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
        const json = await res.json();
        if (!json.success) toast.error(json.error?.message);
        else toast.success("Indexed");
        load();
      }}>
        <Input name="url" type="url" placeholder="https://example.com/help" required />
        <Button type="submit">Crawl URL</Button>
      </form>
      <form className="flex gap-2" onSubmit={async (e) => {
        e.preventDefault();
        const file = (e.currentTarget.elements.namedItem("file") as HTMLInputElement).files?.[0];
        if (!file) return;
        const fd = new FormData();
        fd.set("file", file);
        const res = await fetch("/api/ai/sources", { method: "POST", body: fd });
        const json = await res.json();
        if (!json.success) toast.error(json.error?.message);
        else toast.success("Uploaded");
        load();
      }}>
        <Input name="file" type="file" accept=".pdf,.txt,.md,.docx" required />
        <Button type="submit">Upload file</Button>
      </form>
      <section>
        <h2 className="font-semibold">Files</h2>
        <ul className="mt-2 space-y-2">{data?.files.map((f) => <li key={f._id} className="flex justify-between rounded-xl border p-3"><span>{f.filename}</span><Badge>{f.status}</Badge></li>)}</ul>
      </section>
      <section>
        <h2 className="font-semibold">Websites</h2>
        <ul className="mt-2 space-y-2">{data?.web.map((f) => <li key={f._id} className="flex justify-between rounded-xl border p-3"><span>{f.url}</span><Badge>{f.status}</Badge></li>)}</ul>
      </section>
    </div>
  );
}

type Src = { _id: string; filename?: string; url?: string; status: string };
