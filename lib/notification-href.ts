export type NotificationHrefInput = {
  id?: string;
  _id?: string;
  href?: string | null;
  data?: { url?: string | null; href?: string | null } | null;
};

function stripQuery(path: string) {
  const q = path.indexOf("?");
  return q >= 0 ? path.slice(0, q) : path;
}

/** Map stored notification targets onto routes that exist in this app. */
export function resolveNotificationHref(n: NotificationHrefInput): string | null {
  const raw = n.data?.url || n.data?.href || n.href || null;
  if (!raw || typeof raw !== "string") return null;
  const path = stripQuery(raw.trim());
  if (!path.startsWith("/")) return path;

  if (path === "/dashboard/messages" || path === "/dashboard/messages/") return "/chat";
  const dashMsg = path.match(/^\/dashboard\/messages\/([^/]+)$/);
  if (dashMsg) return `/chat/${dashMsg[1]}`;

  const dashTicket = path.match(/^\/dashboard\/tickets\/([^/]+)$/);
  if (dashTicket) return `/tickets/${dashTicket[1]}`;

  if (path === "/dashboard/notifications" || path === "/dashboard/notifications/") return "/notifications";
  if (path.match(/^\/dashboard\/notifications\/[^/]+$/)) return "/notifications";

  if (path.match(/^\/admin\/notifications\/[^/]+$/)) return "/admin/notifications";

  if (path === "/support-agent/notifications" || path === "/support-agent/notifications/") return "/notifications";
  if (path.match(/^\/support-agent\/notifications\/[^/]+$/)) return "/notifications";

  return path;
}
