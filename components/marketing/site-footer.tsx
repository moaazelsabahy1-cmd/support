import Link from "next/link";
import { Bot, ShieldCheck, Clock } from "lucide-react";
import { NewsletterForm } from "@/components/marketing/newsletter-form";

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Create Ticket", href: "/support/new" },
      { label: "Messages", href: "/dashboard/messages" },
      { label: "Knowledge Base", href: "/docs" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Overview", href: "/#overview" },
      { label: "Features", href: "/#features" },
      { label: "FAQ", href: "/#faq" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Home", href: "/" },
      { label: "Support Paths", href: "/#support-paths" },
      { label: "Contact", href: "/#contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Portal Access", href: "/login" },
      { label: "Create Account", href: "/register" },
      { label: "Contact Support", href: "/#contact" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer data-reveal className="border-t border-border bg-background py-14 text-sm">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 md:grid-cols-[1.2fr_repeat(4,minmax(0,1fr))]">
        <div>
          <Link href="/" className="inline-flex items-center gap-2 font-semibold tracking-tight">
            <Bot className="h-5 w-5 text-primary" /> Solvio
          </Link>
          <p className="mt-3 max-w-xs text-muted-foreground">
            Customer support with tickets, live chat, knowledge, and AI — one workspace for every request.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
              <ShieldCheck className="h-3 w-3" /> Secure customer portal
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" /> 24/7 self-service
            </span>
          </div>
          <p className="mt-6 text-xs font-medium text-muted-foreground">Product updates</p>
          <NewsletterForm />
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <p className="font-semibold tracking-tight">{col.title}</p>
            <ul className="mt-4 space-y-2">
              {col.links.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mx-auto mt-10 max-w-6xl px-4 text-xs text-muted-foreground">
        © {new Date().getFullYear()} Solvio. Built for production support teams.
      </p>
    </footer>
  );
}
