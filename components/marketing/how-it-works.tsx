import { SectionLabel } from "@/components/marketing/section-label";
import { HOW_IT_WORKS_STEPS } from "@/components/marketing/landing-content";

export function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-it-works-heading" className="px-4 py-20 md:py-24">
      <div className="mx-auto max-w-6xl">
        <SectionLabel>HOW IT WORKS</SectionLabel>
        <h2
          id="how-it-works-heading"
          className="text-center text-3xl font-bold tracking-tight md:text-4xl lg:text-5xl"
        >
          From first question to final resolution
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-muted-foreground">
          Here’s exactly what happens after you reach out — from your first message to the confirmed fix.
        </p>
        <ol className="mt-14 grid gap-10 md:grid-cols-4 md:gap-6">
          {HOW_IT_WORKS_STEPS.map((step, index) => {
            const Icon = step.icon;
            return (
              <li key={step.number} className="relative" data-reveal>
                {index < HOW_IT_WORKS_STEPS.length - 1 ? (
                  <span
                    aria-hidden
                    className="landing-connector absolute top-7 left-[calc(50%+2.25rem)] hidden h-px w-[calc(100%-1.5rem)] md:block"
                  />
                ) : null}
                <div className="relative flex flex-col items-center text-center md:items-start md:text-left">
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -top-2 right-2 select-none text-6xl font-bold text-white/10 md:right-auto md:left-16"
                  >
                    {step.number}
                  </span>
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-primary text-primary">
                    <Icon className="h-6 w-6" aria-hidden />
                  </div>
                  <h3 className="mt-6 text-lg font-semibold tracking-tight">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.description}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
