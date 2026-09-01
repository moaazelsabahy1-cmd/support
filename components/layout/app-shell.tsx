"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  BookOpen,
  Bot,
  Calendar,
  LayoutDashboard,
  Library,
  LifeBuoy,
  LogOut,
  Menu,
  MessageSquare,
  Search,
  Settings,
  Shield,
  Ticket,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { signOut } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import type { Role } from "@/types";

const NAV: { href: string; label: string; icon: typeof Ticket; roles: Role[] }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["CUSTOMER", "AGENT", "ADMIN", "SUPER_ADMIN"] },
  { href: "/tickets", label: "Tickets", icon: Ticket, roles: ["CUSTOMER", "AGENT", "ADMIN", "SUPER_ADMIN"] },
  { href: "/chat", label: "Chat", icon: MessageSquare, roles: ["CUSTOMER", "AGENT", "ADMIN", "SUPER_ADMIN"] },
  { href: "/assistant", label: "AI Assistant", icon: Bot, roles: ["CUSTOMER", "AGENT", "ADMIN", "SUPER_ADMIN"] },
  { href: "/knowledge-base", label: "Help center", icon: BookOpen, roles: ["CUSTOMER", "AGENT", "ADMIN", "SUPER_ADMIN"] },
  { href: "/admin/ai/knowledge", label: "AI Knowledge", icon: Library, roles: ["ADMIN", "SUPER_ADMIN"] },
  { href: "/meetings", label: "Meetings", icon: Calendar, roles: ["CUSTOMER", "AGENT", "ADMIN", "SUPER_ADMIN"] },
  { href: "/notifications", label: "Notifications", icon: Bell, roles: ["CUSTOMER", "AGENT", "ADMIN", "SUPER_ADMIN"] },
  { href: "/agent", label: "Agent", icon: LifeBuoy, roles: ["AGENT", "ADMIN", "SUPER_ADMIN"] },
  { href: "/admin", label: "Admin", icon: Shield, roles: ["ADMIN", "SUPER_ADMIN"] },
  { href: "/analytics", label: "Analytics", icon: LayoutDashboard, roles: ["ADMIN", "SUPER_ADMIN"] },
  { href: "/settings", label: "Settings", icon: Settings, roles: ["CUSTOMER", "AGENT", "ADMIN", "SUPER_ADMIN"] },
];

export function AppShell({
  user,
  unread,
  children,
}: {
  user: { name: string; email: string; role: Role };
  unread: number;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ tickets: { _id: string; title: string; number: string }[]; articles: { slug: string; title: string }[] } | null>(null);

  const items = useMemo(() => NAV.filter((n) => n.roles.includes(user.role)), [user.role]);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (q.length < 2) {
        setResults(null);
        return;
      }
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const json = await res.json();
      if (json.success) setResults(json.data);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="min-h-screen bg-background">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 border-r border-border bg-sidebar text-sidebar-foreground transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <Bot className="h-5 w-5 text-teal-400" /> Solvio
          </Link>
          <button className="lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="space-y-1 px-3">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-white/10",
                path === item.href || path.startsWith(`${item.href}/`) ? "bg-white/10 text-white" : "text-slate-300",
              )}
              onClick={() => setOpen(false)}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
              {item.href === "/notifications" && unread > 0 ? (
                <span className="ml-auto rounded-full bg-teal-500 px-2 text-xs text-white">{unread}</span>
              ) : null}
            </Link>
          ))}
        </nav>
        <div className="absolute bottom-4 left-3 right-3">
          <Button
            variant="secondary"
            className="w-full justify-start bg-white/10 text-white hover:bg-white/20"
            onClick={async () => {
              await signOut();
              router.push("/login");
            }}
          >
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur">
          <button className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              aria-label="Search"
              placeholder="Search tickets, knowledge, conversations..."
              className="pl-9"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {results ? (
              <div className="absolute mt-1 w-full rounded-xl border border-border bg-card p-3 shadow-lg">
                {results.tickets.map((t) => (
                  <Link key={t._id} href={`/tickets/${t._id}`} className="block rounded-md px-2 py-1 text-sm hover:bg-muted">
                    {t.number} · {t.title}
                  </Link>
                ))}
                {results.articles.map((a) => (
                  <Link key={a.slug} href={`/knowledge-base/${a.slug}`} className="block rounded-md px-2 py-1 text-sm hover:bg-muted">
                    KB · {a.title}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
          <ThemeToggle />
          <div className="hidden text-right text-sm sm:block">
            <div className="font-medium">{user.name}</div>
            <div className="text-xs text-muted-foreground">{user.role}</div>
          </div>
        </header>
        <main className="p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
