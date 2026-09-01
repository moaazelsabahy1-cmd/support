"use client";

import Link from "next/link";
import { OpenAssistantButton } from "@/components/marketing/open-assistant-button";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/marketing/section-label";

export function FinalCta() {
  return (
    <section aria-labelledby="final-cta-heading" className="px-4 pb-20">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-[linear-gradient(135deg,#1d4ed8_0%,#2563eb_42%,#0891b2_100%)] px-6 py-16 text-center text-white md:px-12 md:py-20">
        <div
          className="landing-cta-grid pointer-events-none absolute inset-0 opacity-25 [background-image:linear-gradient(to_right,rgba(255,255,255,.18)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,.18)_1px,transparent_1px)] [background-size:32px_32px]"
          aria-hidden
        />
        <div className="relative">
          <SectionLabel className="mx-auto border-white/25 text-white/80">WE’RE HERE TO HELP</SectionLabel>
          <h2 id="final-cta-heading" className="text-3xl font-bold tracking-tight md:text-4xl lg:text-5xl">
            Still need a hand? We’re one message away.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-white/85 md:text-lg">
            Open a ticket, search the knowledge base, or ask the AI assistant — no account required, no waiting on hold.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="landing-btn-motion bg-white text-blue-700 hover:bg-white/90">
              <Link href="/support/new">Create Ticket</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-white/40 bg-transparent text-white hover:bg-white/10">
              <Link href="/docs">Browse Knowledge Base</Link>
            </Button>
            <OpenAssistantButton size="lg" variant="ghost" className="text-white hover:bg-white/10 hover:text-white">
              Ask AI Assistant
            </OpenAssistantButton>
          </div>
        </div>
      </div>
    </section>
  );
}
