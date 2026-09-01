import { lookup } from "dns/promises";
import { isIP } from "net";
import { AppError } from "@/lib/api-response";

const BLOCKED_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);

export function isPrivateIp(ip: string) {
  const v = ip.toLowerCase().replace(/^::ffff:/, "");
  if (v === "127.0.0.1" || v === "::1" || v === "0.0.0.0") return true;
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(v);
  if (!m) {
    if (v.startsWith("fe80:") || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("::1")) return true;
    return false;
  }
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

export function assertSafeHttpUrl(raw: string) {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new AppError("INVALID_URL", "Enter a valid http(s) URL", 400);
  }
  const proto = parsed.protocol.toLowerCase();
  if (proto !== "http:" && proto !== "https:") {
    throw new AppError("INVALID_URL", "Only http and https URLs are allowed", 400);
  }
  if (parsed.username || parsed.password) {
    throw new AppError("INVALID_URL", "URLs with credentials are not allowed", 400);
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (BLOCKED_HOSTS.has(host) || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new AppError("INVALID_URL", "This host is not allowed", 400);
  }
  if (isIP(host) && isPrivateIp(host)) {
    throw new AppError("INVALID_URL", "Private network addresses are not allowed", 400);
  }
  return parsed;
}

export async function resolvePublicHost(url: URL) {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) {
    if (isPrivateIp(host)) throw new AppError("INVALID_URL", "Private network addresses are not allowed", 400);
    return;
  }
  const records = await lookup(host, { all: true }).catch(() => {
    throw new AppError("FETCH_FAILED", "Could not resolve website host", 400);
  });
  for (const rec of records) {
    if (isPrivateIp(rec.address)) {
      throw new AppError("INVALID_URL", "This host resolves to a private address", 400);
    }
  }
}

export async function assertSafeFetchUrl(raw: string) {
  const url = assertSafeHttpUrl(raw);
  await resolvePublicHost(url);
  return url;
}
