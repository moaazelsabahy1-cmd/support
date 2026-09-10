import { AdminAgentConversations } from "@/components/admin/admin-agent-conversations";
import { requireRoles } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function Page({ params }: { params: Promise<{ agentId: string }> }) {
  try {
    await requireRoles(["ADMIN", "SUPER_ADMIN"]);
  } catch {
    redirect("/dashboard");
  }
  const { agentId } = await params;
  return <AdminAgentConversations agentId={agentId} />;
}
