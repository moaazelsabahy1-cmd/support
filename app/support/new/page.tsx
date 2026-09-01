"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Bot } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";

export default function PublicTicketPage() {
  return (
    <Suspense>
      <PublicTicketForm />
    </Suspense>
  );
}

function PublicTicketForm() {
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const categoryParam = searchParams.get("category") || "technical";
  const category =
    categoryParam === "installation" ||
    categoryParam === "customization" ||
    categoryParam === "bug" ||
    categoryParam === "technical"
      ? categoryParam
      : "technical";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email"),
          title: form.get("title"),
          description: form.get("description"),
          priority: form.get("priority") || "MEDIUM",
          category: form.get("category") || undefined,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || "Could not create ticket");
      setCreated(json.data.number);
      toast.success(`Ticket ${json.data.number} created`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create ticket");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="landing min-h-screen bg-background px-4 py-12 text-foreground">
      <div className="mx-auto max-w-lg">
        <Link href="/" className="mb-8 inline-flex items-center gap-2 font-semibold">
          <Bot className="h-5 w-5 text-primary" /> Solvio
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Create a support ticket</h1>
        <p className="mt-2 text-sm text-muted-foreground">No account required. We’ll email you the ticket number.</p>
        {created ? (
          <div className="mt-8 rounded-2xl border border-border bg-card p-6">
            <p className="font-semibold">Request received</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Your ticket number is <span className="font-mono text-foreground">{created}</span>. Sign in later to track
              status.
            </p>
            <div className="mt-4 flex gap-3">
              <Button asChild>
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/">Back home</Link>
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-8 space-y-4 rounded-2xl border border-border bg-card p-6">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required minLength={2} />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <div>
              <Label htmlFor="title">Title</Label>
              <Input id="title" name="title" required minLength={3} />
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" name="description" required minLength={3} />
            </div>
            <div>
              <Label htmlFor="category">Category</Label>
              <select
                id="category"
                name="category"
                className="h-10 w-full rounded-lg border border-border px-3"
                defaultValue={category}
              >
                <option value="technical">Technical Support</option>
                <option value="installation">Installation Help</option>
                <option value="customization">Customization Request</option>
                <option value="bug">Report a Bug</option>
              </select>
            </div>
            <div>
              <Label htmlFor="priority">Priority</Label>
              <select id="priority" name="priority" className="h-10 w-full rounded-lg border border-border px-3" defaultValue="MEDIUM">
                <option>LOW</option>
                <option>MEDIUM</option>
                <option>HIGH</option>
                <option>URGENT</option>
              </select>
            </div>
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Submitting…" : "Submit ticket"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
