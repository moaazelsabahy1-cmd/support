"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { toast } from "sonner";

export function DepartmentsAdmin() {
  const [items, setItems] = useState<{ _id: string; name: string; isDefault: boolean; slaFirstResponseMinutes: number }[]>([]);
  function load() {
    fetch("/api/departments").then((r) => r.json()).then((j) => j.success && setItems(j.data));
  }
  useEffect(load, []);
  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <h1 className="text-2xl font-semibold">Departments</h1>
        <CreateDept onDone={load} />
      </div>
      <ul className="space-y-2">
        {items.map((d) => (
          <li key={d._id} className="flex items-center justify-between rounded-xl border p-4">
            <div>
              <p className="font-medium">{d.name} {d.isDefault ? "(default)" : ""}</p>
              <p className="text-sm text-muted-foreground">First response SLA: {d.slaFirstResponseMinutes}m</p>
            </div>
            <Button variant="destructive" size="sm" onClick={async () => {
              const res = await fetch(`/api/departments/${d._id}`, { method: "DELETE" });
              const json = await res.json();
              if (!json.success) toast.error(json.error?.message);
              load();
            }}>Delete</Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CreateDept({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Modal title="Create department" open={open} onOpenChange={setOpen} trigger={<Button>Create</Button>}>
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        await fetch("/api/departments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          name: f.get("name"), description: f.get("description"), isDefault: f.get("isDefault") === "on",
        }) });
        setOpen(false); onDone();
      }}>
        <div><Label>Name</Label><Input name="name" required /></div>
        <div><Label>Description</Label><Textarea name="description" /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isDefault" /> Default department</label>
        <Button className="w-full" type="submit">Save</Button>
      </form>
    </Modal>
  );
}
