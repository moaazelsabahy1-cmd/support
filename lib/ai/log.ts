const PREFIX = {
  knowledge: "[KNOWLEDGE]",
  ingest: "[INGEST]",
  chunk: "[CHUNK]",
  embedding: "[EMBEDDING]",
  qdrant: "[QDRANT]",
  retrieval: "[RETRIEVAL]",
  ai: "[AI]",
} as const;

type Channel = keyof typeof PREFIX;

function safe(value: unknown) {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value.slice(0, 500);
  try {
    return JSON.stringify(value).slice(0, 500);
  } catch {
    return "unserializable";
  }
}

export function aiLog(channel: Channel, message: string, extra?: Record<string, unknown>) {
  const bits = extra
    ? Object.entries(extra)
        .filter(([k]) => !/key|secret|password|token|authorization/i.test(k))
        .map(([k, v]) => `${k}=${safe(v)}`)
        .join(" ")
    : "";
  console.info(`${PREFIX[channel]} ${message}${bits ? ` ${bits}` : ""}`);
}

export function aiWarn(channel: Channel, message: string, extra?: Record<string, unknown>) {
  const bits = extra
    ? Object.entries(extra)
        .filter(([k]) => !/key|secret|password|token|authorization/i.test(k))
        .map(([k, v]) => `${k}=${safe(v)}`)
        .join(" ")
    : "";
  console.warn(`${PREFIX[channel]} ${message}${bits ? ` ${bits}` : ""}`);
}
