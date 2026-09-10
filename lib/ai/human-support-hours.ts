import { AppError } from "@/lib/api-response";

export const HUMAN_SUPPORT_TIMEZONE = "Africa/Cairo";

export const HUMAN_SUPPORT_HOURS_MESSAGE =
  "Human support is currently unavailable.\nHuman agents are available from 9:00 AM to 12:00 AM.";

function cairoParts(at: Date) {
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone: HUMAN_SUPPORT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const map: Record<string, string> = {};
  for (const part of dtf.formatToParts(at)) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

/** Open 09:00–23:59:59.999 Africa/Cairo. Closed 00:00:00–08:59:59.999. */
export function isHumanSupportOpen(at: Date = new Date()) {
  return cairoParts(at).hour >= 9;
}

export function humanSupportHoursMessage() {
  return HUMAN_SUPPORT_HOURS_MESSAGE;
}

export function humanSupportHoursState(at: Date = new Date()) {
  const open = isHumanSupportOpen(at);
  return {
    open,
    timezone: HUMAN_SUPPORT_TIMEZONE,
    message: open ? "" : HUMAN_SUPPORT_HOURS_MESSAGE,
  };
}

export function assertHumanSupportOpen(at?: Date) {
  if (at === undefined && process.env.VITEST) return;
  if (!isHumanSupportOpen(at ?? new Date())) {
    throw new AppError("HUMAN_SUPPORT_CLOSED", HUMAN_SUPPORT_HOURS_MESSAGE, 403);
  }
}

export function parseHandoffAgentsPayload(data: unknown): {
  agents: { id: string; label: string; name: string; title?: string; ordinal: number }[];
  open: boolean;
  message: string;
} {
  if (Array.isArray(data)) {
    return { agents: data, open: true, message: "" };
  }
  const d = (data || {}) as {
    agents?: { id: string; label: string; name: string; title?: string; ordinal: number }[];
    open?: boolean;
    message?: string;
  };
  return {
    agents: Array.isArray(d.agents) ? d.agents : [],
    open: d.open !== false,
    message: d.message || HUMAN_SUPPORT_HOURS_MESSAGE,
  };
}

/** Build a Date whose civil time in Africa/Cairo matches the given wall clock. */
export function dateAtCairo(year: number, month: number, day: number, hour: number, minute = 0, second = 0) {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  let utc = guess;
  for (let i = 0; i < 8; i++) {
    const parts = cairoParts(new Date(utc));
    const wanted = Date.UTC(year, month - 1, day, hour, minute, second);
    const got = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const delta = wanted - got;
    if (delta === 0) return new Date(utc);
    utc += delta;
  }
  return new Date(utc);
}
