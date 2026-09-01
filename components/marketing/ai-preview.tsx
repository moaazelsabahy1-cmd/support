import { BookOpen, Send } from "lucide-react";
import { SectionLabel } from "@/components/marketing/section-label";
import { AI_BENEFITS } from "@/components/marketing/landing-content";
import { OpenAssistantButton } from "@/components/marketing/open-assistant-button";

export function AiPreview() {
  return (
    <section id="ai-assistant" aria-labelledby="ai-assistant-heading" className="px-4 py-20 md:py-24">
      <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2" data-reveal>
        <div>
          <SectionLabel className="mx-0">AI ASSISTANT</SectionLabel>
          <h2 id="ai-assistant-heading" className="text-3xl font-bold tracking-tight md:text-4xl lg:text-5xl">
            Get answers in seconds, any hour.
          </h2>
          <p className="mt-4 max-w-xl text-muted-foreground">
            Before you wait in any queue, ask our AI assistant. It answers instantly from our documentation — and
            brings in a real person the moment one is needed.
          </p>
          <ul className="mt-8 space-y-5">
            {AI_BENEFITS.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.title} className="flex gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary" aria-hidden>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold tracking-tight">{item.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                  </div>
                </li>
              );
            })}
          </ul>
          <OpenAssistantButton className="mt-8">Ask AI Assistant</OpenAssistantButton>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5" aria-hidden>
          <div className="mb-4 flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
            <p className="text-sm font-medium">Solvio Assistant</p>
            <span className="text-xs text-emerald-400">Online</span>
          </div>
          <div className="space-y-3">
            <div className="ml-8 rounded-2xl bg-primary px-4 py-3 text-sm text-primary-foreground">
              How do I reset my password?
            </div>
            <div className="mr-8 rounded-2xl border border-border bg-background px-4 py-3 text-sm">
              Use Forgot password on the sign-in page. We email a reset link that expires soon.
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                  <BookOpen className="h-3 w-3" /> Docs · Password reset
                </span>
                <span className="inline-flex rounded-full border border-emerald-500/40 px-2 py-0.5 text-xs text-emerald-400">
                  Human handoff ready
                </span>
              </div>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <div className="h-10 flex-1 rounded-lg border border-border bg-[#202020] px-3 py-2 text-sm text-muted-foreground">
              Ask a question…
            </div>
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Send className="h-4 w-4" />
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
