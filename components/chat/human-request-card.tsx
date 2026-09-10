"use client";

import { Button } from "@/components/ui/button";

export type HumanRequestConv = {
  _id: string;
  lastQuestion?: string | null;
  customer?: { name?: string } | null;
  humanHandoff?: {
    id?: string;
    _id?: string;
    status?: string;
    currentAgent?: { id?: string; name?: string } | null;
  } | null;
};

export function HumanRequestCard({
  conv,
  onAccept,
  onDecline,
  openHref,
}: {
  conv: HumanRequestConv;
  onAccept: () => void;
  onDecline: () => void;
  openHref?: string;
}) {
  const agentName = conv.humanHandoff?.currentAgent?.name || "Agent";
  const status = conv.humanHandoff?.status === "ACCEPTED" ? "Accepted" : "Pending";
  return (
    <li className="rounded-lg border p-3 text-sm" data-human-request>
      <p className="font-semibold">Human Request</p>
      <p>Customer: {conv.customer?.name || "Unknown"}</p>
      <p className="text-xs text-muted-foreground">Requested Agent: {agentName}</p>
      <p className="text-xs text-muted-foreground">Status: {status}</p>
      {conv.lastQuestion ? <p className="mt-1">{conv.lastQuestion}</p> : null}
      <div className="mt-2 flex gap-2">
        <Button size="sm" onClick={onAccept}>
          Accept
        </Button>
        <Button size="sm" variant="outline" onClick={onDecline}>
          Decline
        </Button>
        {openHref ? (
          <Button size="sm" variant="outline" asChild>
            <a href={openHref}>Open conversation</a>
          </Button>
        ) : null}
      </div>
    </li>
  );
}
