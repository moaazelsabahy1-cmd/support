"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type AgentCard = {
  id: string;
  label: string;
  name: string;
  title?: string;
  ordinal: number;
  avatarUrl?: string | null;
};

export function AgentPicker({
  agents,
  selectedAgentId,
  onSelect,
  onSend,
  sending,
}: {
  agents: AgentCard[];
  selectedAgentId: string | null;
  onSelect: (id: string) => void;
  onSend: () => void;
  sending?: boolean;
}) {
  return (
    <div className="space-y-3" data-agent-picker>
      <h2 className="text-lg font-semibold">Talk to Human</h2>
      <p className="text-sm text-muted-foreground">Choose a Support Agent</p>
      <div className="grid grid-cols-2 gap-2">
        {(agents.length ? agents : [1, 2, 3, 4].map((n) => ({ id: "", label: `Agent ${n}`, name: `Agent ${n}`, title: "Support Agent", ordinal: n, avatarUrl: null }))).map((agent) => {
          const id = agent.id || `placeholder-${agent.ordinal}`;
          const selected = Boolean(agent.id) && selectedAgentId === agent.id;
          return (
            <button
              key={id}
              type="button"
              disabled={!agent.id}
              data-agent-card={agent.ordinal}
              onClick={() => agent.id && onSelect(agent.id)}
              className={cn(
                "rounded-xl border px-3 py-3 text-left text-sm transition",
                selected ? "border-primary bg-primary/10 ring-2 ring-primary" : "border-border bg-card hover:border-primary/50",
                !agent.id && "opacity-50",
              )}
            >
              <div className="flex items-start gap-2">
                {agent.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={agent.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                ) : null}
                <div>
                  <p className="font-semibold">{agent.name}</p>
                  <p className="text-xs text-muted-foreground">{agent.label}</p>
                  <p className="text-xs text-muted-foreground">{agent.title || "Support Agent"}</p>
                  <p className="mt-1 text-xs text-emerald-500">Available</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <Button type="button" className="w-full" disabled={!selectedAgentId || sending} onClick={onSend}>
        Send Request
      </Button>
    </div>
  );
}
