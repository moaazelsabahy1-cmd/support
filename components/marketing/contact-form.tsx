"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";

export function ContactForm() {
  const [pending, setPending] = useState(false);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        email: form.get("email"),
        message: form.get("message"),
      }),
    });
    const json = await res.json();
    setPending(false);
    if (json.success) toast.success("Message received");
    else toast.error(json.error?.message || "Could not send");
  }
  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-3">
      <div>
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" required />
      </div>
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div>
        <Label htmlFor="message">Message</Label>
        <Textarea id="message" name="message" required minLength={10} />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send"}
      </Button>
    </form>
  );
}
