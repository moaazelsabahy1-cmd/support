import { z } from "zod";

const optional = z.string().optional().or(z.literal(""));

export const LOCAL_DATABASE_URL = "postgresql://solvio:solvio@localhost:5433/solvio";

export const envSchema = z.object({
  DATABASE_URL: z.string().min(1).default(LOCAL_DATABASE_URL),
  BETTER_AUTH_SECRET: z.string().min(32).default("dev-secret-change-me-32chars-min"),
  BETTER_AUTH_URL: z.string().default("http://localhost:3000"),
  OPENROUTER_API_KEY: optional,
  OPENROUTER_MODEL: z.string().min(1).default("google/gemini-3.7-flash"),
  OPENROUTER_EMBEDDING_MODEL: z.string().min(1).default("openai/text-embedding-3-small"),
  /** Unused by the AI client. Chat and embeddings require OPENROUTER_API_KEY. */
  OPENAI_API_KEY: optional,
  OPENAI_CHAT_MODEL: optional,
  OPENAI_EMBEDDING_MODEL: optional,
  QDRANT_URL: optional,
  QDRANT_API_KEY: optional,
  QDRANT_COLLECTION: z.string().default("solvio_chunks"),
  FIRECRAWL_API_KEY: optional,
  R2_ACCOUNT_ID: optional,
  R2_ACCESS_KEY_ID: optional,
  R2_SECRET_ACCESS_KEY: optional,
  R2_BUCKET_NAME: optional,
  R2_PUBLIC_URL: optional,
  R2_ENDPOINT: optional,
  SMTP_HOST: optional,
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: optional,
  SMTP_PASSWORD: optional,
  SMTP_FROM: z.string().default("Solvio <noreply@solvio.local>"),
  NEXT_PUBLIC_APP_URL: z.string().default("http://localhost:3000"),
  NEXT_PUBLIC_SOCKET_PATH: z.string().default("/socket.io"),
  PUSH_PUBLIC_KEY: optional,
  PUSH_PRIVATE_KEY: optional,
  PUSH_SUBJECT: z.string().default("mailto:admin@solvio.local"),
  WIDGET_PUBLIC_KEY: z.string().default("solvio-widget-dev-key"),
  NEXT_PUBLIC_WIDGET_KEY: z.string().default("solvio-widget-dev-key"),
  WIDGET_ALLOWED_ORIGINS: optional,
  KNOWLEDGE_CHUNK_SIZE: z.coerce.number().int().min(200).max(8000).default(1000),
  KNOWLEDGE_CHUNK_OVERLAP: z.coerce.number().int().min(0).max(2000).default(150),
  KNOWLEDGE_TOP_K: z.coerce.number().int().min(1).max(20).default(6),
  KNOWLEDGE_MIN_SCORE: z.coerce.number().min(0).max(1).default(0.35),
  AI_KNOWLEDGE_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).optional(),
  KNOWLEDGE_AUTO_APPROVE: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  KNOWLEDGE_MAX_FILE_BYTES: z.coerce.number().int().min(1024).default(15 * 1024 * 1024),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default("localhost"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function resetEnvCache() {
  cached = null;
}

export function assertProductionEnv(env: Env, raw: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV !== "production") return;
  if (raw.NEXT_PHASE === "phase-production-build") return;
  if (!raw.DATABASE_URL || env.DATABASE_URL === LOCAL_DATABASE_URL) {
    throw new Error("DATABASE_URL must be set to production PostgreSQL (not the local default).");
  }
  if (env.BETTER_AUTH_SECRET === "dev-secret-change-me-32chars-min") {
    throw new Error("BETTER_AUTH_SECRET must be set in production.");
  }
}

export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    console.error("Invalid environment", parsed.error.flatten());
    throw new Error("Invalid environment variables");
  }
  assertProductionEnv(parsed.data, source);
  return parsed.data;
}

export function getEnv(): Env {
  if (cached) return cached;
  cached = parseEnv(process.env);
  return cached;
}

/** Answer vs handoff. Retrieval still uses KNOWLEDGE_MIN_SCORE (default 0.35). */
export const DEFAULT_ANSWER_CONFIDENCE_THRESHOLD = 0.75;

export function knowledgeConfidenceThreshold() {
  const env = getEnv();
  return env.AI_KNOWLEDGE_CONFIDENCE_THRESHOLD ?? DEFAULT_ANSWER_CONFIDENCE_THRESHOLD;
}

export function isConfigured(value?: string | null) {
  return Boolean(value && value.trim().length > 0);
}
