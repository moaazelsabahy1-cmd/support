import OpenAI, { APIError } from "openai";
import { AppError } from "@/lib/api-response";
import { getEnv, isConfigured } from "@/lib/env";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export function openrouterConfigured() {
  return isConfigured(getEnv().OPENROUTER_API_KEY);
}

export function aiNotConfiguredError() {
  const dev = getEnv().NODE_ENV !== "production";
  return new AppError(
    "AI_NOT_CONFIGURED",
    dev
      ? "Set OPENROUTER_API_KEY in .env (see .env.example), then restart the server. Do not put the key in client-side code."
      : "The assistant is unavailable right now. Create a support ticket or talk to a human.",
    503,
  );
}

export function getOpenRouterClient(): OpenAI | null {
  const env = getEnv();
  const key = (env.OPENROUTER_API_KEY || "").trim();
  if (!isConfigured(key)) return null;
  return new OpenAI({
    apiKey: key,
    baseURL: OPENROUTER_BASE_URL,
    defaultHeaders: {
      "HTTP-Referer": env.NEXT_PUBLIC_APP_URL || env.BETTER_AUTH_URL,
      "X-Title": "Solvio",
    },
  });
}

export function requireOpenRouter(): OpenAI {
  if (!openrouterConfigured()) throw aiNotConfiguredError();
  const client = getOpenRouterClient();
  if (!client) throw aiNotConfiguredError();
  return client;
}

export function mapOpenRouterError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const status = error instanceof APIError ? error.status : undefined;
  if (status === 401) return new AppError("AI_UNAUTHORIZED", "The AI provider rejected the request.", 502);
  if (status === 402) return new AppError("AI_CREDITS", "The AI provider has insufficient credits.", 502);
  if (status === 429) return new AppError("AI_RATE_LIMIT", "The AI provider is rate limited. Try again shortly.", 429);
  if (status === 404) return new AppError("AI_MODEL", "The configured AI model is unavailable.", 502);
  if (status && status >= 500) return new AppError("AI_PROVIDER", "The AI provider is temporarily unavailable.", 502);
  return new AppError(
    "AI_PROVIDER",
    error instanceof Error ? error.message.slice(0, 180) : "The AI provider request failed.",
    502,
  );
}

function isTransient(error: unknown) {
  const status = error instanceof APIError ? error.status : undefined;
  return status === 429 || status === 502 || status === 503;
}

export async function withOpenRouterRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (isBadRequest(error)) throw error;
    if (!isTransient(error)) throw mapOpenRouterError(error);
    await new Promise((r) => setTimeout(r, 600));
    try {
      return await fn();
    } catch (retryError) {
      throw mapOpenRouterError(retryError);
    }
  }
}

export function isBadRequest(error: unknown) {
  return error instanceof APIError && error.status === 400;
}
