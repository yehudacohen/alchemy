import type { LanguageModelV1 } from "ai";
import { z } from "zod";
import {
  AnthropicModel,
  type AnthropicModelId,
  isAnthropicModel,
} from "./anthropic";
import { type OpenAIChatModelId, OpenAIModel, isOpenAIModel } from "./openai";

export type ModelId = OpenAIChatModelId | AnthropicModelId;

export const ModelId = z.union([OpenAIModel, AnthropicModel]);

type ModelClient = {
  type: "openai" | "anthropic";
  model: LanguageModelV1;
};

const modelCache = new Map<ModelId, Promise<ModelClient>>();

export async function resolveModel(modelId: ModelId) {
  const cached = modelCache.get(modelId);
  if (cached) {
    return await cached;
  }

  const client = (async () => {
    let client: ModelClient;
    if (isOpenAIModel(modelId)) {
      const { openai } = await import("@ai-sdk/openai");
      client = {
        type: "openai" as const,
        model: openai(modelId as OpenAIChatModelId),
      };
    } else if (isAnthropicModel(modelId)) {
      const { anthropic } = await import("@ai-sdk/anthropic");
      client = {
        type: "anthropic" as const,
        model: anthropic(modelId as AnthropicModelId),
      };
    } else {
      throw new Error(`Unsupported model ID: ${modelId}`);
    }

    return client;
  })();

  modelCache.set(modelId, client);
  return client;
}
