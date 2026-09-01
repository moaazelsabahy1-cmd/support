import { requireRoles } from "@/lib/session";
import { redirect } from "next/navigation";
import { analyticsAction } from "@/actions/analytics";
import { AdminHome } from "@/components/admin/admin-home";

export default async function AdminPage() {
  try {
    await requireRoles(["ADMIN", "SUPER_ADMIN"]);
  } catch {
    redirect("/dashboard");
  }
  const stats = await analyticsAction();
  return <AdminHome stats={stats} />;
}
