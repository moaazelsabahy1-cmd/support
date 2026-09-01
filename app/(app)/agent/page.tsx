import { requireRoles } from "@/lib/session";
import { redirect } from "next/navigation";
import { AgentBoard } from "@/components/agent/agent-board";

export default async function AgentPage() {
  try {
    await requireRoles(["AGENT", "ADMIN", "SUPER_ADMIN"]);
  } catch {
    redirect("/dashboard");
  }
  return <AgentBoard />;
}
