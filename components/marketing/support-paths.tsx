import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SectionLabel } from "@/components/marketing/section-label";
import { SUPPORT_PATHS } from "@/components/marketing/landing-content";

export function SupportPaths() {
  return (
    <section id="support-paths" aria-labelledby="support-paths-heading" className="px-4 py-20 md:py-24">
      <div className="mx-auto max-w-6xl">
        <SectionLabel>SUPPORT PATHS</SectionLabel>
        <h2 id="support-paths-heading" className="text-center text-3xl font-bold tracking-tight md:text-4xl lg:text-5xl">
          What do you need help with today?
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-muted-foreground">
          Pick the path that matches your situation — your request reaches the right people and the right workflow from
          the first click.
        </p>
        <ul className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {SUPPORT_PATHS.map((path) => {
            const Icon = path.icon;
            return (
              <li key={path.title} data-reveal>
                <Link
                  href={path.href}
                  className="landing-arrow group block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Card className="landing-lift relative flex h-full flex-col border-border bg-card p-6 shadow-none">
                    <div className={`mb-5 flex h-11 w-11 items-center justify-center rounded-xl ${path.iconClass}`} aria-hidden>
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="text-lg font-semibold tracking-tight">{path.title}</h3>
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{path.description}</p>
                    <p className="mt-5 inline-flex w-fit rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
                      {path.badge}
                    </p>
                    <span
                      className="absolute right-4 bottom-4 flex h-9 w-9 items-center justify-center rounded-full border border-border text-foreground group-hover:border-primary group-hover:text-primary"
                      aria-hidden
                    >
                      <ArrowUpRight className="h-4 w-4" />
                    </span>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
