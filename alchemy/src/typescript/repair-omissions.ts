import type { CoreMessage, LanguageModelV1 } from "ai";
import { generateText } from "../agent/ai";
import { extractTypeScriptCode } from "./extract";

export async function repairCodeOmissions(
  model: LanguageModelV1,
  messages: CoreMessage[] = [],
): Promise<string> {
  console.log("[TypeScript] Repairing code omissions...");

  const repairMessages: CoreMessage[] = [
    ...messages,
    {
      role: "user" as const,
      content: `Do not omit implementation or leave placeholders. Complete the implementation fully.`,
    },
  ];

  const { text } = await generateText({
    model,
    temperature: 0.1,
    messages: repairMessages,
  });

  const repairedCode = extractTypeScriptCode(text);
  if (!repairedCode) {
    throw new Error("Failed to repair code omissions");
  }

  return repairedCode;
}
