import { dashboardStatsAction } from "@/actions/tickets";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { CreateTicketButton } from "@/components/tickets/create-ticket-button";

export default async function DashboardPage() {
  const stats = await dashboardStatsAction();
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Live data from your workspace</p>
        </div>
        <CreateTicketButton />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="text-sm text-muted-foreground">Open</p>
          <p className="mt-2 text-3xl font-semibold">{stats.open}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">Pending</p>
          <p className="mt-2 text-3xl font-semibold">{stats.pending}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">Resolved</p>
          <p className="mt-2 text-3xl font-semibold">{stats.resolved}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">Unread</p>
          <p className="mt-2 text-3xl font-semibold">{stats.unread}</p>
        </Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Recent tickets</h2>
          <ul className="mt-4 space-y-2">
            {stats.recentTickets.map((t: { _id: string; number: string; title: string; status: string }) => (
              <li key={t._id}>
                <Link href={`/tickets/${t._id}`} className="flex justify-between text-sm hover:underline">
                  <span>{t.number} · {t.title}</span>
                  <span className="text-muted-foreground">{t.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="font-semibold">Upcoming meetings</h2>
          <ul className="mt-4 space-y-2 text-sm">
            {stats.upcoming.map((m: { _id: string; title: string; date: string }) => (
              <li key={m._id} className="flex justify-between">
                <span>{m.title}</span>
                <span className="text-muted-foreground">{formatDate(m.date)}</span>
              </li>
            ))}
          </ul>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/meetings">View meetings</Link>
          </Button>
        </Card>
      </div>
    </div>
  );
}
