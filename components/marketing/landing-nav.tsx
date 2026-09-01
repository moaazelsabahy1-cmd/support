"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LandingThemeToggle } from "@/components/marketing/landing-theme-toggle";
import { cn } from "@/lib/utils";

export const LANDING_NAV = [
  { id: "overview", href: "/#overview", label: "Overview" },
  { id: "support-paths", href: "/#support-paths", label: "Support Paths" },
  { id: "how-it-works", href: "/#how-it-works", label: "How It Works" },
  { id: "features", href: "/#features", label: "Features" },
  { id: "faq", href: "/#faq", label: "FAQ" },
  { id: "contact", href: "/#contact", label: "Contact" },
] as const;

function sectionFromHash() {
  if (typeof window === "undefined") return "overview";
  const id = window.location.hash.replace("#", "");
  return LANDING_NAV.some((item) => item.id === id) ? id : "overview";
}

const pillClass = (isActive: boolean, size: "sm" | "xs") =>
  cn(
    "whitespace-nowrap rounded-full text-muted-foreground transition-all duration-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
    size === "sm" ? "px-3 py-1.5 text-sm" : "px-3 py-1.5 text-xs",
    isActive && "bg-[#DBEAFE] text-[#1D4ED8] dark:bg-[#101C4A] dark:text-[#3B82F6]",
  );

export function LandingNav() {
  const [active, setActive] = useState("overview");
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    setActive(sectionFromHash());

    function onHash() {
      setActive(sectionFromHash());
    }
    function onScroll() {
      setScrolled(window.scrollY > 8);
    }
    onScroll();
    window.addEventListener("hashchange", onHash);
    window.addEventListener("scroll", onScroll, { passive: true });

    const observed = LANDING_NAV.map((item) => document.getElementById(item.id)).filter(
      (el): el is HTMLElement => Boolean(el),
    );
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        const top = visible[0]?.target.id;
        if (top) setActive(top);
      },
      { rootMargin: "-30% 0px -55% 0px", threshold: [0, 0.2, 0.4, 0.6] },
    );
    observed.forEach((el) => observer.observe(el));
    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b border-border bg-background",
        scrolled && "shadow-sm",
      )}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold tracking-tight text-foreground">
          <Bot className="h-5 w-5 text-primary" /> Solvio
        </Link>
        <nav
          aria-label="Landing sections"
          className="hidden max-w-[min(100%,42rem)] overflow-x-auto rounded-full border border-border bg-muted p-1 lg:flex"
        >
          {LANDING_NAV.map((item) => {
            const isActive = active === item.id;
            return (
              <a
                key={item.id}
                href={item.href}
                aria-current={isActive ? "location" : undefined}
                className={pillClass(isActive, "sm")}
              >
                {item.label}
              </a>
            );
          })}
        </nav>
        <div className="flex shrink-0 items-center gap-2">
          <LandingThemeToggle />
          <Button asChild size="sm" className="landing-btn-motion">
            <Link href="/support/new">Create Ticket</Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="landing-btn-motion">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </div>
      <nav aria-label="Landing sections" className="mx-auto max-w-6xl overflow-x-auto px-4 pb-3 lg:hidden">
        <div className="flex w-max min-w-full gap-1 rounded-full border border-border bg-muted p-1">
          {LANDING_NAV.map((item) => {
            const isActive = active === item.id;
            return (
              <a
                key={item.id}
                href={item.href}
                aria-current={isActive ? "location" : undefined}
                className={pillClass(isActive, "xs")}
              >
                {item.label}
              </a>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
