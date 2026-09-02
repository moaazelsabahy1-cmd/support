"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, Badge } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { toast } from "sonner";

type Source = {
  _id: string;
  type: "QA" | "FILE" | "WEB" | "CONVERSATION";
  title: string;
  status: string;
  organizationId?: string;
  chunkCount?: number;
  createdAt?: string;
  indexedAt?: string | null;
  errorMessage?: string | null;
  question?: string;
  answer?: string;
  sourceUrl?: string;
  filename?: string;
  category?: string;
  tags?: string[];
  metadata?: {
    crawlMode?: string;
    sourceConversationId?: string;
    replacesSourceId?: string;
    resolvedBy?: string | null;
    handoffReason?: string | null;
  };
};

type Overview = {
  total: number;
  ready: number;
  processing: number;
  failed: number;
  pendingReview?: number;
  chunkCount: number;
  lastIndexed: string | null;
  jobs: { jobId: string; status: string; error?: string | null; createdAt: string; sourceId: string }[];
};

const TABS = ["Overview", "Q&A", "Files", "Websites", "Review", "Indexing"] as const;
const CATEGORIES = ["Billing", "Technical Support", "Account", "Orders", "General"];

function statusTone(status: string): "success" | "warn" | "danger" | "info" | "default" {
  if (status === "READY") return "success";
  if (status === "FAILED" || status === "REJECTED") return "danger";
  if (status === "PROCESSING" || status === "PENDING" || status === "PENDING_REVIEW") return "warn";
  if (status === "DISABLED") return "default";
  return "info";
}

function isHubTab(value: string | null): value is (typeof TABS)[number] {
  return Boolean(value && (TABS as readonly string[]).includes(value));
}

export function KnowledgeHub({ initialTab = "Overview" }: { initialTab?: (typeof TABS)[number] }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>(initialTab);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [items, setItems] = useState<Source[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [preview, setPreview] = useState<Source | null>(null);

  useEffect(() => {
    const next = new URLSearchParams(window.location.search).get("tab");
    if (isHubTab(next)) setTab(next);
  }, []);

  function goTab(next: (typeof TABS)[number]) {
    setTab(next);
    const params = new URLSearchParams(window.location.search);
    if (next === "Overview") params.delete("tab");
    else params.set("tab", next);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
  }

  const loadOverview = useCallback(async () => {
    const res = await fetch("/api/ai/knowledge?overview=1");
    const json = await res.json();
    if (json.success) setOverview(json.data);
  }, []);

  const typeFilter = useMemo(() => {
    if (tab === "Q&A") return "QA";
    if (tab === "Files") return "FILE";
    if (tab === "Websites") return "WEB";
    if (tab === "Review") return "CONVERSATION";
    return "";
  }, [tab]);

  const loadList = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("pageSize", "50");
    if (typeFilter) params.set("type", typeFilter);
    if (q) params.set("q", q);
    if (tab === "Review") params.set("status", status || "PENDING_REVIEW");
    else if (status) params.set("status", status);
    const res = await fetch(`/api/ai/knowledge?${params}`);
    const json = await res.json();
    if (json.success) setItems(json.data.items);
  }, [typeFilter, q, status, tab]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (tab !== "Overview" && tab !== "Indexing") void loadList();
  }, [tab, loadList]);

  async function act(id: string, action: string, body?: unknown) {
    const res = await fetch(`/api/ai/knowledge/${id}`, {
      method: action === "delete" ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: action === "delete" ? undefined : JSON.stringify(body ?? { action }),
    });
    const json = await res.json();
    if (!json.success) toast.error(json.error?.message);
    else toast.success(action === "delete" ? "Deleted" : "Updated");
    void loadList();
    void loadOverview();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">AI Knowledge</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Q&amp;A, files, websites, and conversation Review share one index. Approve Review items to ingest them.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Button key={t} size="sm" variant={tab === t ? "default" : "outline"} onClick={() => goTab(t)}>
            {t}
          </Button>
        ))}
      </div>

      {tab === "Overview" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["Total sources", overview?.total],
            ["Ready", overview?.ready],
            ["Processing", overview?.processing],
            ["Failed", overview?.failed],
            ["Pending review", overview?.pendingReview],
            ["Total chunks", overview?.chunkCount],
            ["Last indexed", overview?.lastIndexed ? new Date(overview.lastIndexed).toLocaleString() : "Never"],
          ].map(([label, value]) =>
            label === "Pending review" ? (
              <button
                key={String(label)}
                type="button"
                className="rounded-2xl border border-border bg-card p-5 text-left shadow-sm hover:border-primary"
                onClick={() => goTab("Review")}
              >
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-2 text-2xl font-semibold">{value ?? 0}</p>
                <p className="mt-1 text-xs text-muted-foreground">Open Review</p>
              </button>
            ) : (
            <Card key={String(label)}>
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="mt-2 text-2xl font-semibold">{value ?? 0}</p>
            </Card>
            ),
          )}
        </div>
      ) : null}

      {tab === "Q&A" ? (
        <QaPanel onSaved={() => { void loadList(); void loadOverview(); }} items={items} onAct={act} onPreview={setPreview} q={q} setQ={setQ} />
      ) : null}

      {tab === "Files" || tab === "Websites" ? (
        <div className="flex gap-2">
          <select className="h-10 rounded-lg border bg-card px-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {["PENDING", "PROCESSING", "READY", "FAILED", "DISABLED"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
      ) : null}

      {tab === "Files" ? (
        <FilesPanel onSaved={() => { void loadList(); void loadOverview(); }} items={items} onAct={act} onPreview={setPreview} />
      ) : null}

      {tab === "Websites" ? (
        <WebPanel onSaved={() => { void loadList(); void loadOverview(); }} items={items} onAct={act} onPreview={setPreview} />
      ) : null}

      {tab === "Review" ? (
        <ReviewPanel items={items} onAct={act} onPreview={setPreview} />
      ) : null}

      {tab === "Indexing" ? (
        <ul className="space-y-2">
          {(overview?.jobs || []).map((job) => (
            <li key={job.jobId} className="rounded-xl border p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs">{job.jobId.slice(0, 8)}</span>
                <Badge tone={statusTone(job.status)}>{job.status}</Badge>
              </div>
              <p className="mt-1 text-muted-foreground">{new Date(job.createdAt).toLocaleString()}</p>
              {job.error ? <p className="mt-1 text-destructive">{job.error}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}

      {preview ? (
        <Card>
          <div className="flex justify-between gap-2">
            <h2 className="font-semibold">Preview</h2>
            <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>Close</Button>
          </div>
          <p className="mt-2 font-medium">{preview.title}</p>
          {preview.question ? <p className="mt-2 text-sm"><strong>Q:</strong> {preview.question}</p> : null}
          {preview.answer ? <p className="mt-1 text-sm"><strong>A:</strong> {preview.answer}</p> : null}
          {preview.sourceUrl ? <p className="mt-1 text-sm">{preview.sourceUrl}</p> : null}
          {preview.errorMessage ? <p className="mt-2 text-sm text-destructive">{preview.errorMessage}</p> : null}
        </Card>
      ) : null}
    </div>
  );
}

function ReviewPanel({
  items,
  onAct,
  onPreview,
}: {
  items: Source[];
  onAct: (id: string, action: string, body?: unknown) => void;
  onPreview: (s: Source) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ question: "", answer: "", category: "General", tags: "" });

  function startEdit(item: Source) {
    setEditingId(item._id);
    setDraft({
      question: item.question || "",
      answer: item.answer || "",
      category: item.category || "General",
      tags: (item.tags || []).join(", "),
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Conversation extracts wait here until you approve them into the same Q&amp;A index. Approving a candidate that
        versions an older source disables the previous READY item after the new one is indexed.
      </p>
      {!items.length ? (
        <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
          No conversation extracts waiting for review.
        </p>
      ) : null}
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item._id} className="rounded-xl border p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{item.title}</p>
                <Badge tone={statusTone(item.status)}>{item.status}</Badge>
                {editingId === item._id ? (
                  <div className="mt-3 space-y-2">
                    <div>
                      <Label>Question</Label>
                      <Textarea value={draft.question} onChange={(e) => setDraft((d) => ({ ...d, question: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Answer</Label>
                      <Textarea value={draft.answer} onChange={(e) => setDraft((d) => ({ ...d, answer: e.target.value }))} />
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <Label>Category</Label>
                        <select
                          className="h-10 w-full rounded-lg border bg-card px-2 text-sm"
                          value={draft.category}
                          onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
                        >
                          {CATEGORIES.map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <Label>Tags</Label>
                        <Input value={draft.tags} onChange={(e) => setDraft((d) => ({ ...d, tags: e.target.value }))} />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          onAct(item._id, "patch", {
                            question: draft.question,
                            answer: draft.answer,
                            category: draft.category,
                            tags: draft.tags.split(",").map((t) => t.trim()).filter(Boolean),
                            title: draft.question.slice(0, 120),
                          });
                          setEditingId(null);
                        }}
                      >
                        Save
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    {item.question ? <p className="mt-2 text-sm"><strong>Q:</strong> {item.question}</p> : null}
                    {item.answer ? <p className="mt-1 text-sm"><strong>A:</strong> {item.answer}</p> : null}
                  </>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  {item.category ? `${item.category}` : "Uncategorized"}
                  {item.tags?.length ? ` · ${item.tags.join(", ")}` : ""}
                  {item.organizationId ? ` · org ${item.organizationId}` : ""}
                  {item.createdAt ? ` · ${new Date(item.createdAt).toLocaleString()}` : ""}
                </p>
                {item.metadata?.sourceConversationId ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Conversation {item.metadata.sourceConversationId.slice(-8)}
                    {item.metadata.resolvedBy ? ` · resolved by ${item.metadata.resolvedBy.slice(-8)}` : ""}
                    {item.metadata.handoffReason ? ` · ${item.metadata.handoffReason}` : ""}
                    {item.metadata.replacesSourceId ? ` · versions ${item.metadata.replacesSourceId.slice(-8)}` : ""}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => onPreview(item)}>View</Button>
              {item.status === "PENDING_REVIEW" ? (
                <>
                  <Button size="sm" variant="outline" onClick={() => startEdit(item)}>Edit</Button>
                  <Button size="sm" onClick={() => onAct(item._id, "approve")}>Approve</Button>
                  <Button size="sm" variant="outline" onClick={() => onAct(item._id, "reject")}>Reject</Button>
                </>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SourceRow({
  item,
  onAct,
  onPreview,
}: {
  item: Source;
  onAct: (id: string, action: string, body?: unknown) => void;
  onPreview: (s: Source) => void;
}) {
  return (
    <li className="rounded-xl border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{item.title}</p>
          <p className="text-xs text-muted-foreground">
            {item.type}
            {item.filename ? ` · ${item.filename}` : ""}
            {item.sourceUrl ? ` · ${item.sourceUrl}` : ""}
            {item.metadata?.crawlMode === "single_page" ? " · Single-page fallback" : ""}
            {item.chunkCount != null ? ` · ${item.chunkCount} chunks` : ""}
            {item.indexedAt ? ` · indexed ${new Date(item.indexedAt).toLocaleString()}` : ""}
            {item.createdAt ? ` · created ${new Date(item.createdAt).toLocaleDateString()}` : ""}
          </p>
          {item.errorMessage ? <p className="mt-1 text-sm text-destructive">{item.errorMessage}</p> : null}
        </div>
        <Badge tone={statusTone(item.status)}>{item.status === "PROCESSING" || item.status === "PENDING" ? item.status : item.status}</Badge>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => onPreview(item)}>View</Button>
        <Button size="sm" variant="outline" onClick={() => onAct(item._id, "reindex")}>Reindex</Button>
        {item.status === "FAILED" ? (
          <Button size="sm" variant="outline" onClick={() => onAct(item._id, "retry")}>Retry</Button>
        ) : null}
        {item.status === "DISABLED" ? (
          <Button size="sm" variant="outline" onClick={() => onAct(item._id, "patch", { enabled: true })}>Enable</Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => onAct(item._id, "patch", { enabled: false })}>Disable</Button>
        )}
        <Button size="sm" variant="destructive" onClick={() => onAct(item._id, "delete")}>Delete</Button>
      </div>
    </li>
  );
}

function QaPanel({
  items,
  onSaved,
  onAct,
  onPreview,
  q,
  setQ,
}: {
  items: Source[];
  onSaved: () => void;
  onAct: (id: string, action: string, body?: unknown) => void;
  onPreview: (s: Source) => void;
  q: string;
  setQ: (v: string) => void;
}) {
  const [editId, setEditId] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <Input placeholder="Search Q&A" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
      <form
        className="grid gap-3 rounded-2xl border p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const payload = {
            question: f.get("question"),
            answer: f.get("answer"),
            category: f.get("category"),
            tags: String(f.get("tags") || "")
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean),
            enabled: true,
          };
          const res = await fetch("/api/ai/training", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(editId ? { ...payload, id: editId } : payload),
          });
          const json = await res.json();
          if (!json.success) toast.error(json.error?.message);
          else {
            toast.success(editId ? "Updated" : "Created");
            setEditId(null);
            (e.target as HTMLFormElement).reset();
            onSaved();
          }
        }}
      >
        <div>
          <Label>Question</Label>
          <Input name="question" required defaultValue={items.find((i) => i._id === editId)?.question} />
        </div>
        <div>
          <Label>Answer</Label>
          <Textarea name="answer" required defaultValue={items.find((i) => i._id === editId)?.answer} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Category</Label>
            <select name="category" className="mt-1 h-10 w-full rounded-lg border bg-card px-2 text-sm" defaultValue="General">
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Tags</Label>
            <Input name="tags" placeholder="refunds, billing" />
          </div>
        </div>
        <Button type="submit">{editId ? "Save changes" : "Add Q&A"}</Button>
      </form>
      <ul className="space-y-2">
        {items.map((item) => (
          <SourceRow
            key={item._id}
            item={item}
            onAct={onAct}
            onPreview={(s) => {
              setEditId(s._id);
              onPreview(s);
            }}
          />
        ))}
      </ul>
    </div>
  );
}

function FilesPanel({
  items,
  onSaved,
  onAct,
  onPreview,
}: {
  items: Source[];
  onSaved: () => void;
  onAct: (id: string, action: string, body?: unknown) => void;
  onPreview: (s: Source) => void;
}) {
  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const file = (form.elements.namedItem("file") as HTMLInputElement).files?.[0];
          if (!file) return;
          const fd = new FormData();
          fd.set("file", file);
          fd.set("category", String(new FormData(form).get("category") || "General"));
          const res = await fetch("/api/ai/sources", { method: "POST", body: fd });
          const json = await res.json();
          if (!json.success) toast.error(json.error?.message);
          else toast.success("Upload queued");
          onSaved();
        }}
      >
        <Input name="file" type="file" accept=".pdf,.txt,.md,.docx" required />
        <select name="category" className="h-10 rounded-lg border bg-card px-2 text-sm">
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <Button type="submit">Upload file</Button>
      </form>
      <ul className="space-y-2">
        {items.map((item) => (
          <SourceRow key={item._id} item={item} onAct={onAct} onPreview={onPreview} />
        ))}
      </ul>
    </div>
  );
}

function WebPanel({
  items,
  onSaved,
  onAct,
  onPreview,
}: {
  items: Source[];
  onSaved: () => void;
  onAct: (id: string, action: string, body?: unknown) => void;
  onPreview: (s: Source) => void;
}) {
  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const res = await fetch("/api/ai/sources", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: f.get("url"), category: f.get("category") }),
          });
          const json = await res.json();
          if (!json.success) toast.error(json.error?.message);
          else toast.success("Website queued");
          onSaved();
        }}
      >
        <Input name="url" type="url" placeholder="https://example.com/help" required className="min-w-64 flex-1" />
        <select name="category" className="h-10 rounded-lg border bg-card px-2 text-sm">
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <Button type="submit">Add website</Button>
      </form>
      <p className="text-xs text-muted-foreground">
        Firecrawl is used when configured. Otherwise a single page is fetched (shown as Single-page fallback).
      </p>
      <ul className="space-y-2">
        {items.map((item) => (
          <SourceRow key={item._id} item={item} onAct={onAct} onPreview={onPreview} />
        ))}
      </ul>
    </div>
  );
}
