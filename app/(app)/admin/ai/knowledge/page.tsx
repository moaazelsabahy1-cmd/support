import { KnowledgeHub } from "@/components/admin/knowledge-hub";
import { getSessionUser } from "@/lib/session";
import { forbidden } from "next/navigation";

export default async function Page() {
  const user = await getSessionUser();
  if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
    forbidden();
  }
  return <KnowledgeHub />;
}
