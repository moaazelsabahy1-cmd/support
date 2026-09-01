"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { toast } from "sonner";

export function KnowledgeAdmin() {
  const [data, setData] = useState<{ items: Article[]; categories: Cat[] } | null>(null);
  const [title, setTitle] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [body, setBody] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [id, setId] = useState<string | null>(null);

  function load() {
    fetch("/api/knowledge").then((r) => r.json()).then((j) => j.success && setData(j.data));
  }
  useEffect(load, []);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <h1 className="text-2xl font-semibold">Knowledge Base</h1>
        <form className="mt-4 space-y-3" onSubmit={async (e) => {
          e.preventDefault();
          const payload = { title, excerpt, body, categoryId, tags: [], featured: false, published: true };
          const res = await fetch(id ? `/api/knowledge/${id}` : "/api/knowledge", {
            method: id ? "PATCH" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const json = await res.json();
          if (!json.success) toast.error(json.error?.message);
          else { toast.success("Saved"); setId(null); setTitle(""); setExcerpt(""); setBody(""); load(); }
        }}>
          <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} required /></div>
          <div><Label>Excerpt</Label><Input value={excerpt} onChange={(e) => setExcerpt(e.target.value)} required /></div>
          <div><Label>Body</Label><Textarea value={body} onChange={(e) => setBody(e.target.value)} required /></div>
          <div>
            <Label>Category</Label>
            <select className="h-10 w-full rounded-lg border px-2" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
              <option value="">Select</option>
              {data?.categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
          </div>
          <Button type="submit">Save article</Button>
        </form>
        <form className="mt-6 flex gap-2" onSubmit={async (e) => {
          e.preventDefault();
          const name = new FormData(e.currentTarget).get("name");
          const { upsertCategoryAction } = await import("@/actions/knowledge");
          await upsertCategoryAction({ name: String(name) });
          toast.success("Category added");
          load();
        }}>
          <Input name="name" placeholder="New category" required />
          <Button type="submit" variant="outline">Add category</Button>
        </form>
      </div>
      <ul className="space-y-2">
        {data?.items.map((a) => (
          <li key={a._id} className="rounded-xl border p-3">
            <p className="font-medium">{a.title}</p>
            <p className="text-xs text-muted-foreground">{a.published ? "Published" : "Draft"}</p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => { setId(a._id); setTitle(a.title); setExcerpt(a.excerpt); setBody(a.body); setCategoryId(a.categoryId); }}>Edit</Button>
              <Button size="sm" variant="destructive" onClick={async () => { await fetch(`/api/knowledge/${a._id}`, { method: "DELETE" }); load(); }}>Delete</Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

type Article = { _id: string; title: string; excerpt: string; body: string; categoryId: string; published: boolean };
type Cat = { _id: string; name: string };
