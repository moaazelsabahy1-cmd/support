import { AnalyticsView } from "@/components/analytics/analytics-view";
import { analyticsAction } from "@/actions/analytics";
import { requireRoles } from "@/lib/session";
import { redirect } from "next/navigation";
export default async function Page() {
  try { await requireRoles(["ADMIN", "SUPER_ADMIN"]); } catch { redirect("/dashboard"); }
  const data = await analyticsAction();
  return <AnalyticsView data={data as Parameters<typeof AnalyticsView>[0]["data"]} />;
}
