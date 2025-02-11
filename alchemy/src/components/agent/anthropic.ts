import { z } from "zod";

/**
 * @see https://docs.anthropic.com/en/docs/about-claude/models#model-comparison-table
 */
export const AnthropicModels = [
  // Claude 3.5 Sonnet models
  "claude-3-5-sonnet-latest",
  "claude-3-5-sonnet-20241022",
  "claude-3-5-sonnet-20240620",

  // Claude 3.5 Haiku models
  "claude-3-5-haiku-latest",
  "claude-3-5-haiku-20241022",

  // Claude 3 models
  "claude-3-opus",
  "claude-3-opus-20240229",
  "claude-3-sonnet",
  "claude-3-sonnet-20240229",
  "claude-3-haiku",
  "claude-3-haiku-20240307",
] as const;

export const AnthropicModel = z.enum(AnthropicModels);

export type AnthropicModelId = (typeof AnthropicModels)[number] | (string & {});

export function isAnthropicModel(model: string): model is AnthropicModelId {
  return model.startsWith("claude-");
}
