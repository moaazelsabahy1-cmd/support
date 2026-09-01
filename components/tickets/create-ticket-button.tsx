"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { createTicketAction } from "@/actions/tickets";

export function CreateTicketButton() {
  return (
    <Suspense fallback={<Button>New ticket</Button>}>
      <CreateTicketButtonInner />
    </Suspense>
  );
}

function CreateTicketButtonInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultCategory = searchParams.get("category") || "";
  const [open, setOpen] = useState(() => Boolean(defaultCategory));

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      const ticket = await createTicketAction({
        title: form.get("title"),
        description: form.get("description"),
        priority: form.get("priority") || "MEDIUM",
        category: form.get("category") || undefined,
      });
      toast.success("Ticket created");
      setOpen(false);
      router.push(`/tickets/${ticket._id}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }
  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title="Create ticket"
      trigger={<Button>New ticket</Button>}
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="title">Title</Label>
          <Input id="title" name="title" required />
        </div>
        <div>
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" name="description" required />
        </div>
        <div>
          <Label htmlFor="priority">Priority</Label>
          <select id="priority" name="priority" className="h-10 w-full rounded-lg border border-border bg-card px-3">
            <option>LOW</option>
            <option>MEDIUM</option>
            <option>HIGH</option>
            <option>URGENT</option>
          </select>
        </div>
        <div>
          <Label htmlFor="category">Category</Label>
          <Input id="category" name="category" defaultValue={defaultCategory} />
        </div>
        <Button type="submit" className="w-full">Create</Button>
      </form>
    </Modal>
  );
}
