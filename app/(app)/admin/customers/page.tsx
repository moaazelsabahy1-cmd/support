import { UsersAdmin } from "@/components/admin/users-admin";
import { requireRoles } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function Page() {
  try { await requireRoles(["ADMIN", "SUPER_ADMIN"]); } catch { redirect("/dashboard"); }
  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">Filtered view of customer accounts.</p>
      <UsersAdmin />
    </div>
  );
}
