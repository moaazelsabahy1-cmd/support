import { KnowledgeAdmin } from "@/components/admin/knowledge-admin";
import { requireRoles } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function Page() {
  try { await requireRoles(["ADMIN", "SUPER_ADMIN"]); } catch { redirect("/dashboard"); }
  return <KnowledgeAdmin />;
}
