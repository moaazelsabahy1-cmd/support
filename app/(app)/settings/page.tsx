import { SettingsForm } from "@/components/settings/settings-form";
import { requirePageUser } from "@/lib/session";

export default async function Page() {
  const user = await requirePageUser();
  return <SettingsForm isAdmin={user.role === "ADMIN" || user.role === "SUPER_ADMIN"} />;
}
