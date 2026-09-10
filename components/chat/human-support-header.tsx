"use client";

import { handoffStatusCopy, humanSupportStatusLine } from "@/lib/ai/handoff-copy";

export function HumanSupportHeader({
  agentLabel,
  agentName,
  customerName,
  avatarUrl,
  status,
  currentAttempt,
  attempts,
  conversationClosed,
}: {
  agentLabel?: string;
  agentName?: string;
  customerName?: string;
  avatarUrl?: string | null;
  status?: string | null;
  currentAttempt?: number | null;
  attempts?: { order?: number; status?: string }[] | null;
  conversationClosed?: boolean;
}) {
  const phase =
    conversationClosed || status === "COMPLETED" || status === "NO_AGENT_AVAILABLE"
      ? "closed"
      : status === "ACCEPTED"
        ? "connected"
        : "pending";
  const dot = phase === "connected" ? "bg-emerald-500" : phase === "pending" ? "bg-amber-500" : "bg-muted-foreground";
  const n = currentAttempt || 1;
  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm" data-handoff-status>
      <div className="flex items-center gap-2">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
        ) : null}
        <div>
          <p className="font-semibold">Human Support</p>
          <p className="text-xs text-muted-foreground">{agentName || agentLabel || `Agent ${n}`}</p>
          {customerName ? <p className="text-xs text-muted-foreground">{customerName}</p> : null}
        </div>
      </div>
      <p className="mt-2 flex items-center gap-2 text-xs">
        <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
        {humanSupportStatusLine(status, conversationClosed)}
        {` · Agent ${n}`}
      </p>
      <p className="mt-1 text-xs">{handoffStatusCopy({ status, currentAttempt: n, attempts })}</p>
    </div>
  );
}
