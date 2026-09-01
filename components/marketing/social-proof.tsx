import { ShieldCheck, Star } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SectionLabel } from "@/components/marketing/section-label";
import { STATS, TESTIMONIALS } from "@/components/marketing/landing-content";

export function SocialProof() {
  return (
    <div>
      <section aria-labelledby="trusted-workflows-heading" className="px-4 py-16 md:py-20">
        <div className="mx-auto max-w-6xl">
          <SectionLabel>TRUSTED WORKFLOWS</SectionLabel>
          <h2
            id="trusted-workflows-heading"
            className="mx-auto max-w-4xl text-center text-3xl font-bold tracking-tight md:text-4xl"
          >
            Built for customers who need answers quickly and teams who need support operations that stay organized.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-muted-foreground">
            The portal is designed so people can see progress, find answers, and reach a human when it matters — while
            teams keep assignment, status, and follow-up in one workspace.
          </p>
        </div>
      </section>

      <section aria-labelledby="trusted-stats-heading" className="px-4 pb-16">
        <h2 id="trusted-stats-heading" className="sr-only">
          Support statistics
        </h2>
        <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-3 md:gap-0">
          {STATS.map((stat, index) => (
            <div
              key={stat.label}
              className={`text-center md:px-6 ${index > 0 ? "md:border-l md:border-border" : ""}`}
              data-reveal
            >
              <p className="text-4xl font-bold tracking-tight text-primary md:text-5xl">{stat.value}</p>
              <p className="mt-2 text-sm text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="testimonials-heading" className="px-4 pb-20 md:pb-24">
        <h2 id="testimonials-heading" className="sr-only">
          Customer testimonials
        </h2>
        <ul className="mx-auto grid max-w-6xl gap-5 md:grid-cols-2">
          {TESTIMONIALS.map((item) => (
            <li key={item.name} data-reveal>
              <Card className="h-full border-border bg-card p-6 shadow-none">
                <div className="flex gap-1" aria-label="5 out of 5 stars">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-[#E8C547] text-[#E8C547]" aria-hidden />
                  ))}
                </div>
                <blockquote className="mt-4 text-sm leading-relaxed text-foreground">
                  <p>{item.quote}</p>
                </blockquote>
                <hr className="my-5 border-border" />
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary"
                    aria-hidden
                  >
                    {item.initials}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.role}</p>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
        <p className="mx-auto mt-10 flex max-w-3xl items-start justify-center gap-2 px-4 text-center text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
          <span>
            Customers can see progress clearly while support teams manage assignments, updates, and follow-up from one
            workspace.
          </span>
        </p>
      </section>
    </div>
  );
}
