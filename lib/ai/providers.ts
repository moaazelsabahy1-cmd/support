import { AppError } from "@/lib/api-response";
import {
  aiNotConfiguredError,
  getOpenRouterClient,
  isBadRequest,
  mapOpenRouterError,
  openrouterConfigured,
  requireOpenRouter,
  withOpenRouterRetry,
} from "@/lib/ai/openrouter";
import { getEnv, isConfigured } from "@/lib/env";

export { openrouterConfigured, aiNotConfiguredError };

export function llmConfigured() {
  return openrouterConfigured();
}

export function getChatModel() {
  return getEnv().OPENROUTER_MODEL;
}

export function getEmbeddingModel() {
  const env = getEnv();
  if (isConfigured(env.OPENROUTER_EMBEDDING_MODEL)) return env.OPENROUTER_EMBEDDING_MODEL;
  const legacy = env.OPENAI_EMBEDDING_MODEL?.trim();
  if (legacy === "text-embedding-3-small") return "openai/text-embedding-3-small";
  if (legacy) return legacy.startsWith("openai/") ? legacy : `openai/${legacy}`;
  return "openai/text-embedding-3-small";
}

export function embeddingModelAliases(model = getEmbeddingModel()) {
  const aliases = new Set([model]);
  if (model === "openai/text-embedding-3-small" || model === "text-embedding-3-small") {
    aliases.add("openai/text-embedding-3-small");
    aliases.add("text-embedding-3-small");
  }
  return [...aliases];
}

export type LlmMessage = { role: "system" | "user" | "assistant"; content: string };

export type LlmResult = {
  text: string;
  model: string;
  tokens?: number;
  promptTokens?: number;
  completionTokens?: number;
};

export interface LlmProvider {
  generateText(input: { messages: LlmMessage[]; temperature?: number }): Promise<LlmResult>;
  model: string;
}

export class OpenRouterLlmProvider implements LlmProvider {
  model = getChatModel();

  async generateText(input: { messages: LlmMessage[]; temperature?: number }): Promise<LlmResult> {
    const client = requireOpenRouter();
    const run = (temperature?: number) =>
      withOpenRouterRetry(async () => {
        const completion = await client.chat.completions.create({
          model: this.model,
          messages: input.messages,
          ...(temperature === undefined ? {} : { temperature }),
        });
        const text = completion.choices[0]?.message?.content?.trim() || "";
        if (!text) {
          throw mapOpenRouterError(new Error("Empty model response"));
        }
        return {
          text,
          model: completion.model || this.model,
          tokens: completion.usage?.total_tokens,
          promptTokens: completion.usage?.prompt_tokens,
          completionTokens: completion.usage?.completion_tokens,
        };
      });

    try {
      return await run(input.temperature);
    } catch (error) {
      if (input.temperature !== undefined && isBadRequest(error)) {
        return run(undefined);
      }
      throw error instanceof AppError ? error : mapOpenRouterError(error);
    }
  }
}

export function getLlmProvider(): LlmProvider | null {
  if (!llmConfigured()) return null;
  return new OpenRouterLlmProvider();
}

export function requireLlm(): LlmProvider {
  const provider = getLlmProvider();
  if (!provider) throw aiNotConfiguredError();
  return provider;
}

export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
  model: string;
}

export class OpenRouterEmbeddingProvider implements EmbeddingProvider {
  model = getEmbeddingModel();

  async embed(texts: string[]): Promise<number[][]> {
    const client = requireOpenRouter();
    return withOpenRouterRetry(async () => {
      const res = await client.embeddings.create({
        model: this.model,
        input: texts,
      });
      return res.data.map((d) => d.embedding);
    });
  }
}

export function getEmbeddingProvider(): EmbeddingProvider | null {
  if (!openrouterConfigured() || !getOpenRouterClient()) return null;
  return new OpenRouterEmbeddingProvider();
}

/** @deprecated use llmConfigured */
export function openaiConfigured() {
  return llmConfigured();
}
