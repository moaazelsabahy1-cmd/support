function addMongoStyleId(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(addMongoStyleId);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      next[key] = addMongoStyleId(val);
    }
    if (typeof obj.id === "string" && next._id === undefined) {
      next._id = obj.id;
    }
    return next;
  }
  return value;
}

export function serialize(doc: unknown) {
  return JSON.parse(JSON.stringify(addMongoStyleId(doc)));
}
