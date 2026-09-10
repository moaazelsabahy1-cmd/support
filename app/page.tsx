import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ContactForm } from "@/components/marketing/contact-form";
import { FeaturesGrid } from "@/components/marketing/features-grid";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { SocialProof } from "@/components/marketing/social-proof";
import { SupportPaths } from "@/components/marketing/support-paths";
import { TrustedBrands } from "@/components/marketing/trusted-brands";
import { AiPreview } from "@/components/marketing/ai-preview";
import { FinalCta } from "@/components/marketing/final-cta";
import { SiteFooter } from "@/components/marketing/site-footer";
import { FaqSection } from "@/components/marketing/faq-section";
import { AiWidget } from "@/components/marketing/ai-widget";
import { OpenAssistantButton } from "@/components/marketing/open-assistant-button";
import { OpenHumanHandoffButton } from "@/components/marketing/open-human-handoff-button";
import { LandingNav } from "@/components/marketing/landing-nav";
import { SelfService } from "@/components/marketing/self-service";
import { RevealRoot } from "@/components/marketing/reveal";

export default function HomePage() {
  return (
    <div className="landing min-h-screen bg-background text-foreground">
      <LandingNav />
      <RevealRoot>
      <section id="overview" className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-2 md:py-24">
        <div>
          <p className="landing-hero-item landing-hero-item-1 mb-3 text-sm font-medium text-primary">Customer support, fully connected</p>
          <h1 className="landing-hero-item landing-hero-item-2 text-4xl font-bold tracking-tight md:text-6xl">
            Resolve every conversation in one workspace.
          </h1>
          <p className="landing-hero-item landing-hero-item-3 mt-5 max-w-xl text-lg text-muted-foreground">
            Tickets, live chat, knowledge, AI assistance, meetings, and analytics — built as a real SaaS system, not a
            mockup.
          </p>
          <div className="landing-hero-item landing-hero-item-4 mt-8 flex flex-wrap gap-3">
            <OpenAssistantButton size="lg" className="landing-btn-motion">
              Ask AI
            </OpenAssistantButton>
            <Button asChild size="lg" variant="outline" className="landing-btn-motion">
              <Link href="/chat">Chat</Link>
            </Button>
            <OpenHumanHandoffButton size="lg" className="landing-btn-motion">
              Talk to Human
            </OpenHumanHandoffButton>
          </div>
        </div>
        <div className="landing-hero-item landing-hero-item-4 rounded-2xl border border-border bg-card p-6">
          <div className="mb-4 flex items-center justify-between text-sm text-muted-foreground">
            <span>Ticket SOL-2026-000042</span>
            <span className="rounded-full border border-border px-2 py-0.5 text-xs text-emerald-400">In progress</span>
          </div>
          <h3 className="text-xl font-semibold tracking-tight">Billing portal timeout</h3>
          <p className="mt-2 text-sm text-muted-foreground">Assigned to Maya Chen · High priority · Technical Support</p>
          <div className="mt-6 space-y-3">
            {[
              "Customer reported checkout 504s",
              "Agent requested HAR file",
              "AI suggested KB article on timeouts",
            ].map((t) => (
              <div key={t} className="rounded-xl border border-border bg-background px-4 py-3 text-sm">
                {t}
              </div>
            ))}
          </div>
        </div>
      </section>

      <HowItWorks />
      <FeaturesGrid />
      <SupportPaths />
      <TrustedBrands />
      <SocialProof />
      <SelfService />
      <AiPreview />

      <section id="pricing" className="mx-auto max-w-6xl px-4 pb-20">
        <h2 className="text-center text-3xl font-bold tracking-tight md:text-4xl">Pricing</h2>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {[
            { name: "Starter", price: "$0", items: ["3 agents", "Ticketing", "Knowledge base"] },
            { name: "Growth", price: "$49", items: ["Unlimited agents", "Live chat", "AI assistant"] },
            { name: "Scale", price: "$149", items: ["SLA analytics", "Widget", "Priority support"] },
          ].map((p) => (
            <div key={p.name} data-reveal className="landing-lift rounded-2xl border border-border bg-card p-6">
              <h3 className="font-semibold tracking-tight">{p.name}</h3>
              <p className="mt-2 text-3xl font-bold">
                {p.price}
                <span className="text-sm font-normal text-muted-foreground">/mo</span>
              </p>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                {p.items.map((i) => (
                  <li key={i}>• {i}</li>
                ))}
              </ul>
              <Button className="mt-6 w-full" asChild>
                <Link href="/register">Choose {p.name}</Link>
              </Button>
            </div>
          ))}
        </div>
      </section>

      <FaqSection />

      <section id="contact" className="border-t border-border py-16">
        <div className="mx-auto max-w-xl px-4" data-reveal>
          <h2 className="text-3xl font-bold tracking-tight">Talk to us</h2>
          <p className="mt-2 text-muted-foreground">
            Tell us about your support volume. We store submissions in MongoDB.
          </p>
          <ContactForm />
        </div>
      </section>

      <FinalCta />
      <SiteFooter />
      </RevealRoot>
      <AiWidget />
    </div>
  );
}
