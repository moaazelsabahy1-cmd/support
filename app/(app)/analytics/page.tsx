import { analyticsAction } from "@/actions/analytics";
import { AnalyticsView } from "@/components/analytics/analytics-view";
import { requirePermission } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function Page() {
  try {
    await requirePermission("analytics.view");
  } catch {
    redirect("/dashboard");
  }
  const data = await analyticsAction();
  return <AnalyticsView data={data as Parameters<typeof AnalyticsView>[0]["data"]} />;
}
