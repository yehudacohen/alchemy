import { z } from "zod";
export const OpenAIModels = [
  "o3-mini",

  // O1 models
  "o1",
  "o1-2024-12-17",
  "o1-mini",
  "o1-mini-2024-09-12",
  "o1-preview",
  "o1-preview-2024-09-12",

  // GPT-4O models
  "gpt-4o",
  "gpt-4o-2024-05-13",
  "gpt-4o-2024-08-06",
  "gpt-4o-2024-11-20",
  "gpt-4o-audio-preview",
  "gpt-4o-audio-preview-2024-10-01",
  "gpt-4o-audio-preview-2024-12-17",
  "gpt-4o-mini",
  "gpt-4o-mini-2024-07-18",

  // GPT-4 models
  "gpt-4-turbo",
  "gpt-4-turbo-2024-04-09",
  "gpt-4-turbo-preview",
  "gpt-4-0125-preview",
  "gpt-4-1106-preview",
  "gpt-4",
  "gpt-4-0613",

  // GPT-3.5 models
  "gpt-3.5-turbo-0125",
  "gpt-3.5-turbo",
  "gpt-3.5-turbo-1106",
] as const;

export const OpenAIModel = z.enum(OpenAIModels);

export type OpenAIChatModelId = (typeof OpenAIModels)[number] | (string & {});

export function isOpenAIModel(model: string): model is OpenAIChatModelId {
  return (
    model.startsWith("gpt-") ||
    model.startsWith("o1") ||
    model.startsWith("o3") ||
    model.startsWith("gpt-4o")
  );
}
