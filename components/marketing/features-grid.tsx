import Link from "next/link";
import { Card } from "@/components/ui/card";
import { SectionLabel } from "@/components/marketing/section-label";
import { FEATURES } from "@/components/marketing/landing-content";

export function FeaturesGrid() {
  return (
    <section id="features" aria-labelledby="features-heading" className="px-4 py-20 md:py-24">
      <div className="mx-auto max-w-6xl">
        <SectionLabel>FEATURES</SectionLabel>
        <h2 id="features-heading" className="text-center text-3xl font-bold tracking-tight md:text-4xl lg:text-5xl">
          Everything you can do from the portal
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-muted-foreground">
          Open and track tickets, search the docs, message support, share files, and book meetings — every way to get
          help, in one place.
        </p>
        <ul className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <li key={feature.title} data-reveal>
                <Link
                  href={feature.href}
                  className="group block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                <Card className="landing-lift h-full border-border bg-card p-6 shadow-none">
                  <div
                    className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-[#1D5FD1]/25 text-primary"
                    aria-hidden
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-semibold tracking-tight text-foreground">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
                  <p className="mt-5 inline-flex rounded-full border border-border bg-background/40 px-3 py-1 text-xs text-muted-foreground">
                    {feature.badge}
                  </p>
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
