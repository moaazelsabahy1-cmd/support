import { AgentBoard } from "@/components/agent/agent-board";
import { requireRoles } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function Page() {
  try { await requireRoles(["ADMIN", "SUPER_ADMIN"]); } catch { redirect("/dashboard"); }
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Agents</h1>
      <AgentBoard />
    </div>
  );
}
