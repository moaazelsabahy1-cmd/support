"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function NewsletterForm() {
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    const form = e.currentTarget;
    const email = String(new FormData(form).get("email") || "");
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || "Could not subscribe");
      setDone(true);
      form.reset();
      toast.success(json.data?.already ? "You’re already subscribed" : "You’re on the list");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not subscribe");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-2 sm:flex-row">
      <Input
        name="email"
        type="email"
        required
        aria-label="Email for newsletter"
        placeholder="you@company.com"
        className="bg-[#202020]"
        disabled={pending || done}
      />
      <Button type="submit" disabled={pending || done}>
        {done ? "Subscribed" : pending ? "Joining…" : "Subscribe"}
      </Button>
    </form>
  );
}
