const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit = 60, windowMs = 60_000) {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1 };
  }
  if (current.count >= limit) {
    return { ok: false, remaining: 0, retryAfter: current.resetAt - now };
  }
  current.count += 1;
  return { ok: true, remaining: limit - current.count };
}
