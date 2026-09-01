import { Card } from "@/components/ui/card";
import { TRUSTED_BRANDS, WORKFLOW_PILLARS } from "@/components/marketing/landing-content";

function BrandGroup({ hidden }: { hidden?: boolean }) {
  return (
    <div className="trusted-marquee__group ticker-group" aria-hidden={hidden || undefined}>
      {TRUSTED_BRANDS.map((brand) => (
        <span key={brand}>{brand}</span>
      ))}
    </div>
  );
}

export function TrustedBrands() {
  return (
    <section id="trusted-customers" aria-labelledby="trusted-brands-heading" className="px-4 py-12 md:py-16">
      <div className="mx-auto max-w-6xl">
        <h2
          id="trusted-brands-heading"
          className="text-center text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase"
        >
          Trusted by customers and teams worldwide
        </h2>
        <div className="trusted-marquee ticker-viewport mt-8">
          <div className="trusted-marquee__track ticker-track">
            <BrandGroup />
            <BrandGroup hidden />
          </div>
        </div>
        <ul className="mt-12 grid gap-5 sm:grid-cols-2 md:grid-cols-3">
          {WORKFLOW_PILLARS.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.title} data-reveal>
                <Card className="landing-lift h-full border-border bg-card p-6 shadow-none">
                  <div
                    className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-primary"
                    aria-hidden
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold tracking-tight">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.description}</p>
                </Card>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
