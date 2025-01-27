import { type AnthropicModelId, isAnthropicModel } from "./anthropic";
import { type OpenAIChatModelId, isOpenAIModel } from "./openai";

export type ModelId = OpenAIChatModelId | AnthropicModelId;

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
