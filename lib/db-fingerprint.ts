/** Host + database name only. Never log userinfo or the full URL. */
export function redactedDatabaseFingerprint(url = process.env.DATABASE_URL || "") {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.port ? `:${u.port}` : ""}${u.pathname}`;
  } catch {
    return "unknown";
  }
}
