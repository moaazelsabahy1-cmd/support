"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { toast } from "sonner";
import { ROLES, type Role } from "@/types";

export function UsersAdmin() {
  const [role, setRole] = useState("");
  const [q, setQ] = useState("");
  const [data, setData] = useState<{ items: UserRow[] } | null>(null);

  function load() {
    const p = new URLSearchParams();
    if (role) p.set("role", role);
    if (q) p.set("q", q);
    fetch(`/api/users?${p}`).then((r) => r.json()).then((j) => j.success && setData(j.data));
  }
  useEffect(() => { load(); }, [role, q]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Users</h1>
        <CreateUser onDone={load} />
      </div>
      <div className="flex gap-2">
        <Input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <select className="h-10 rounded-lg border border-border bg-card px-2" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">All roles</option>
          {ROLES.map((r) => <option key={r}>{r}</option>)}
        </select>
      </div>
      <div className="overflow-x-auto rounded-2xl border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted"><tr><th className="p-3 text-left">Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {data?.items.map((u) => (
              <tr key={u._id} className="border-t">
                <td className="p-3">{u.name}</td>
                <td>{u.email}</td>
                <td>
                  <select defaultValue={u.role} onChange={async (e) => {
                    await fetch(`/api/users/${u._id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: e.target.value }) });
                    toast.success("Role updated");
                  }}>
                    {ROLES.map((r) => <option key={r}>{r}</option>)}
                  </select>
                </td>
                <td>{u.status}</td>
                <td className="space-x-2 p-3">
                  <Button size="sm" variant="outline" onClick={async () => {
                    await fetch(`/api/users/${u._id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: u.status === "ACTIVE" ? "DEACTIVATED" : "ACTIVE" }) });
                    load();
                  }}>{u.status === "ACTIVE" ? "Deactivate" : "Activate"}</Button>
                  <Button size="sm" variant="destructive" onClick={async () => {
                    if (!confirm("Delete user?")) return;
                    await fetch(`/api/users/${u._id}`, { method: "DELETE" });
                    load();
                  }}>Delete</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CreateUser({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Modal open={open} onOpenChange={setOpen} title="Create user" trigger={<Button>Create user</Button>}>
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const res = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          name: f.get("name"), email: f.get("email"), password: f.get("password"), role: f.get("role"),
        }) });
        const json = await res.json();
        if (!json.success) toast.error(json.error?.message);
        else { toast.success("Created"); setOpen(false); onDone(); }
      }}>
        <div><Label>Name</Label><Input name="name" required /></div>
        <div><Label>Email</Label><Input name="email" type="email" required /></div>
        <div><Label>Password</Label><Input name="password" type="password" minLength={8} required /></div>
        <div><Label>Role</Label><select name="role" className="h-10 w-full rounded-lg border px-2">{ROLES.map((r) => <option key={r}>{r}</option>)}</select></div>
        <Button type="submit" className="w-full">Create</Button>
      </form>
    </Modal>
  );
}

type UserRow = { _id: string; name: string; email: string; role: Role; status: string };
