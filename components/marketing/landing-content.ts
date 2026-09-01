import type { LucideIcon } from "lucide-react";
import {
  Bell,
  BookOpen,
  Bug,
  CalendarCheck,
  Clock,
  Download,
  FileText,
  FolderOpen,
  Headphones,
  LayoutDashboard,
  MessageCircle,
  Paperclip,
  ShieldCheck,
  Ticket,
  Users,
  Wrench,
  Zap,
} from "lucide-react";

export const HOW_IT_WORKS_STEPS: {
  number: string;
  title: string;
  description: string;
  icon: LucideIcon;
}[] = [
  {
    number: "01",
    title: "Submit your request",
    description: "Create a support ticket with category, priority, and the details your team needs.",
    icon: FileText,
  },
  {
    number: "02",
    title: "Attach context",
    description: "Upload screenshots, documents, or purchase details to speed up diagnosis.",
    icon: Paperclip,
  },
  {
    number: "03",
    title: "Collaborate in real time",
    description: "Use comments, messaging, and notifications to stay aligned as work progresses.",
    icon: MessageCircle,
  },
  {
    number: "04",
    title: "Resolve or schedule next steps",
    description: "Track status changes, schedule meetings when needed, and close the loop with clarity.",
    icon: CalendarCheck,
  },
];

export const FEATURES: {
  title: string;
  description: string;
  badge: string;
  icon: LucideIcon;
  href: string;
}[] = [
  {
    title: "Structured ticket management",
    description: "Track issue status, ownership, priority, and history from one shared record.",
    badge: "Clear progress for every request",
    icon: Ticket,
    href: "/dashboard/tickets",
  },
  {
    title: "Knowledge base access",
    description: "Let customers solve common questions through searchable documentation and guides.",
    badge: "Self-service before escalation",
    icon: FolderOpen,
    href: "/docs",
  },
  {
    title: "Real-time communication",
    description: "Keep conversations moving with comments, chat, and live follow-ups inside the portal.",
    badge: "Fewer back-and-forth delays",
    icon: MessageCircle,
    href: "/dashboard/messages",
  },
  {
    title: "File attachments",
    description: "Share screenshots, logs, and supporting files directly with each request.",
    badge: "Better issue context",
    icon: Paperclip,
    href: "/support/new",
  },
  {
    title: "Notifications and updates",
    description: "Stay informed when status changes, replies arrive, or meetings are scheduled.",
    badge: "Never miss follow-up",
    icon: Bell,
    href: "/dashboard/notifications",
  },
  {
    title: "Team operations and analytics",
    description: "Support teams can assign work, monitor trends, and improve response performance.",
    badge: "Built for support staff too",
    icon: LayoutDashboard,
    href: "/admin",
  },
];

export const SUPPORT_PATHS: {
  title: string;
  description: string;
  badge: string;
  icon: LucideIcon;
  href: string;
  iconClass: string;
}[] = [
  {
    title: "Technical Support",
    description: "Open a ticket for product issues, account questions, or troubleshooting help.",
    badge: "Best for active customer issues",
    icon: Headphones,
    href: "/support/new?category=technical",
    iconClass: "bg-sky-500/20 text-sky-300",
  },
  {
    title: "Installation Help",
    description: "Get guided setup support, environment checks, and deployment assistance.",
    badge: "Fast onboarding support",
    icon: Download,
    href: "/support/new?category=installation",
    iconClass: "bg-emerald-500/20 text-emerald-300",
  },
  {
    title: "Customization Request",
    description: "Discuss feature tailoring, workflow changes, or scoped implementation support.",
    badge: "For custom requirements",
    icon: Wrench,
    href: "/support/new?category=customization",
    iconClass: "bg-amber-500/20 text-amber-300",
  },
  {
    title: "Report a Bug",
    description: "Share reproducible issues with screenshots and attachments for faster triage.",
    badge: "Track fixes clearly",
    icon: Bug,
    href: "/support/new?category=bug",
    iconClass: "bg-red-500/20 text-red-300",
  },
];

export const TRUSTED_BRANDS = ["Airbnb", "Slack", "Discord", "Walmart", "Notion", "Shopify"];

export const WORKFLOW_PILLARS: {
  title: string;
  description: string;
  icon: LucideIcon;
}[] = [
  {
    title: "Fast first response",
    description:
      "Your request is routed to the right person the moment you submit it — no generic inbox, no black hole.",
    icon: Zap,
  },
  {
    title: "You always know where things stand",
    description:
      "Follow live status changes and get notified about every reply — by email, push, and right here in the portal.",
    icon: Bell,
  },
  {
    title: "Your context never gets lost",
    description:
      "Files, screenshots, and the full conversation stay attached to your request from first message to resolution.",
    icon: ShieldCheck,
  },
];

export const AI_BENEFITS: {
  title: string;
  description: string;
  icon: LucideIcon;
}[] = [
  {
    title: "Instant help, 24/7",
    description: "Common questions get answered in seconds — nights, weekends, and holidays included.",
    icon: Clock,
  },
  {
    title: "Grounded in real documentation",
    description: "Every answer comes from our docs and guides, with links to the source so you can read more.",
    icon: BookOpen,
  },
  {
    title: "A human is always one step away",
    description:
      "If the assistant can’t solve it, it opens a ticket with the conversation attached — you never have to repeat yourself.",
    icon: Users,
  },
];

export const STATS: { value: string; label: string }[] = [
  { value: "20,000+", label: "portal visits supported" },
  { value: "98%", label: "tickets updated with clear status changes" },
  { value: "24/7", label: "self-service help center access" },
];

export const FAQ_ITEMS: { question: string; answer: string }[] = [
  {
    question: "Can I create a ticket without signing in?",
    answer:
      "Yes. Use Create Ticket or any Support Path card. We store your request in MongoDB and email you the ticket number. Sign in later to track status.",
  },
  {
    question: "Where do I find product documentation?",
    answer:
      "Open Browse Knowledge Base or /docs. That route goes to the live knowledge base with searchable articles.",
  },
  {
    question: "How does the AI assistant work?",
    answer:
      "Solvio Assistant answers from indexed docs and training pairs. If it is not confident, it will offer a ticket or a human handoff instead of guessing.",
  },
  {
    question: "How do I reach a person?",
    answer:
      "Use Talk to a human in the assistant, or submit a ticket. Logged-in customers can also use live chat after signing in.",
  },
  {
    question: "How do I follow an existing request?",
    answer:
      "Sign in with the email you used when creating the ticket. Your dashboard lists status, comments, and history for every request.",
  },
];

export const TESTIMONIALS: {
  quote: string;
  name: string;
  role: string;
  initials: string;
}[] = [
  {
    quote:
      "We can see exactly where a request sits, who owns it, and what changed last. Follow-up no longer lives in scattered inboxes.",
    name: "Jordan Hale",
    role: "Operations lead",
    initials: "JH",
  },
  {
    quote:
      "Customers self-serve from the knowledge base first, then escalate with files already attached. Our queue is calmer and clearer.",
    name: "Riley Okonkwo",
    role: "Support manager",
    initials: "RO",
  },
];

