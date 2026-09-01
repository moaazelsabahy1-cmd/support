"use client";

import * as Accordion from "@radix-ui/react-accordion";
import { ChevronDown } from "lucide-react";
import { SectionLabel } from "@/components/marketing/section-label";
import { FAQ_ITEMS } from "@/components/marketing/landing-content";

export function FaqSection() {
  return (
    <section id="faq" aria-labelledby="faq-heading" className="px-4 py-20 md:py-24">
      <div className="mx-auto max-w-3xl">
        <SectionLabel>FAQ</SectionLabel>
        <h2 id="faq-heading" className="text-center text-3xl font-bold tracking-tight md:text-4xl">
          Answers before you open a ticket
        </h2>
        <Accordion.Root type="single" collapsible className="mt-10 space-y-3">
          {FAQ_ITEMS.map((item) => (
            <Accordion.Item
              key={item.question}
              value={item.question}
              className="overflow-hidden rounded-2xl border border-border bg-card"
              data-reveal
            >
              <Accordion.Header>
                <Accordion.Trigger className="group flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-medium tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {item.question}
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180 motion-reduce:transition-none" />
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content className="overflow-hidden px-5 pb-4 text-sm leading-relaxed text-muted-foreground data-[state=open]:animate-[landing-accordion-down_180ms_ease] motion-reduce:animate-none">
                {item.answer}
              </Accordion.Content>
            </Accordion.Item>
          ))}
        </Accordion.Root>
      </div>
    </section>
  );
}
