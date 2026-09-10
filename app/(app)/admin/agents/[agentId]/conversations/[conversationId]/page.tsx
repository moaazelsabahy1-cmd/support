import { AdminConversationHistory } from "@/components/admin/admin-conversation-history";
import { requireRoles } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function Page({
  params,
}: {
  params: Promise<{ agentId: string; conversationId: string }>;
}) {
  try {
    await requireRoles(["ADMIN", "SUPER_ADMIN"]);
  } catch {
    redirect("/dashboard");
  }
  const { agentId, conversationId } = await params;
  return <AdminConversationHistory agentId={agentId} conversationId={conversationId} />;
}
