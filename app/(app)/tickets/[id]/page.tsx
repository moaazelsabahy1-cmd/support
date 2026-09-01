import { TicketWorkspace } from "@/components/tickets/ticket-workspace";
import { requirePageUser } from "@/lib/session";

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;
  return <TicketWorkspace id={id} role={user.role} />;
}
