import { z } from "zod";
import {
  AnthropicModel,
  type AnthropicModelId,
  isAnthropicModel,
} from "./anthropic";
import { type OpenAIChatModelId, OpenAIModel, isOpenAIModel } from "./openai";

export type ModelId = OpenAIChatModelId | AnthropicModelId;

export const ModelId = z.union([OpenAIModel, AnthropicModel]);

export async function resolveModel(modelId: ModelId) {
  if (isOpenAIModel(modelId)) {
    const { openai } = await import("@ai-sdk/openai");
    return {
      type: "openai" as const,
      model: openai(modelId as OpenAIChatModelId),
    };
  }
  if (isAnthropicModel(modelId)) {
    const { anthropic } = await import("@ai-sdk/anthropic");
    return {
      type: "anthropic" as const,
      model: anthropic(modelId as AnthropicModelId),
    };
  }
  throw new Error(`Unsupported model ID: ${modelId}`);
}
