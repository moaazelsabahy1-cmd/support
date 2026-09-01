"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpen, CalendarCheck, CreditCard, MessageCircle, Paperclip, Search, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionLabel } from "@/components/marketing/section-label";

const KB_PREVIEWS = [
  { title: "Installation & setup guide", views: "2.4k", href: "/docs?q=installation", icon: Wrench },
  { title: "Known issues & workarounds", views: "1.8k", href: "/docs?q=known+issues", icon: BookOpen },
  { title: "Billing & license questions", views: "1.1k", href: "/docs?q=billing", icon: CreditCard },
];

const HUMAN_ROWS = [
  {
    title: "Live replies & notifications",
    description: "Real-time replies and notifications keep your request moving — no email ping-pong.",
    icon: MessageCircle,
  },
  {
    title: "Files attached to the issue",
    description: "Your screenshots, logs, and documents stay connected to the same request — always easy to find.",
    icon: Paperclip,
  },
  {
    title: "Meetings for the big stuff",
    description: "Move to a scheduled call without re-explaining anything.",
    icon: CalendarCheck,
  },
];

export function SelfService() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;
      e.preventDefault();
      inputRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function goSearch(q: string) {
    const query = q.trim();
    router.push(query ? `/docs?q=${encodeURIComponent(query)}` : "/docs");
  }

  return (
    <section aria-labelledby="self-service-heading" className="px-4 py-20 md:py-24">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-2">
        <article data-reveal className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <SectionLabel className="mx-0">SELF-SERVICE FIRST</SectionLabel>
          <h2 id="self-service-heading" className="text-2xl font-bold tracking-tight md:text-3xl">
            Find answers in seconds — no waiting required.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-base">
            Search the knowledge base for setup steps, known issues, and how-to guides any time. And if you don’t find
            it, ticket creation is one click away.
          </p>
          <form
            className="relative mt-6"
            onSubmit={(e) => {
              e.preventDefault();
              goSearch(inputRef.current?.value || "");
            }}
          >
            <Search className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-muted-foreground" aria-hidden />
            <Input
              ref={inputRef}
              name="q"
              aria-label="Search the knowledge base"
              placeholder="Search guides, known issues, setup steps…"
              className="h-11 pl-9 pr-14"
            />
            <kbd className="pointer-events-none absolute top-2.5 right-2 hidden rounded-md border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">
              /
            </kbd>
          </form>
          <ul className="mt-5 space-y-2">
            {KB_PREVIEWS.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.title}>
                  <Link
                    href={item.href}
                    className="flex items-center justify-between gap-3 rounded-xl border border-transparent px-3 py-3 transition hover:border-border hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary" aria-hidden>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="text-sm font-medium">{item.title}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">Views: {item.views}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <Link
            href="/docs"
            className="landing-arrow mt-5 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Browse the knowledge base <ArrowRight className="h-4 w-4" />
          </Link>
        </article>

        <article data-reveal className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <SectionLabel className="mx-0">HUMAN WHEN IT MATTERS</SectionLabel>
          <h2 id="human-when-it-matters" className="text-2xl font-bold tracking-tight md:text-3xl">
            Bring the tricky problems straight to our team.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-base">
            Open a ticket, message support, share files, and schedule a meeting — your context follows the whole way, so
            you never have to start over.
          </p>
          <ul className="mt-8 space-y-5">
            {HUMAN_ROWS.map((item) => {
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
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/support/new" className="landing-btn-motion">Create Ticket</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard/messages" className="landing-btn-motion">Open Messages</Link>
            </Button>
          </div>
        </article>
      </div>
    </section>
  );
}
