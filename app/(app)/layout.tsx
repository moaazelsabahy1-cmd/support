import { AppShell } from "@/components/layout/app-shell";
import { requirePageUser } from "@/lib/session";
import { unreadCount } from "@/lib/notifications";

export default async function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  const unread = await unreadCount(user.id);
  return <AppShell user={user} unread={unread}>{children}</AppShell>;
}
