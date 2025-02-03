import type { CoreMessage } from "ai";
import { generateText } from "./ai";
import { extractTypeScriptCode } from "./extract";

export async function repairTypeScriptCode(
  model: any,
  typeErrors: string,
  messages: CoreMessage[],
): Promise<string> {
  // If we have type check options, validate and potentially repair type errors
  console.log("[TypeScript] Fixing type errors...");

  messages.push({
    role: "user" as const,
    content: `Fix the type errors in this code:

Type errors found:
${typeErrors}

Provide a complete implementation that fixes these issues while preserving all functionality.`,
  });

  // Add the repair attempt to the message history
  const repairMessages: CoreMessage[] = [
    {
      role: "system" as const,
      content:
        "You are an expert TypeScript developer fixing type errors. Provide a complete implementation that resolves the identified issues.",
    },
    ...messages,
  ];

  const { text: repairAttempt } = await generateText({
    model,
    temperature: 0.1,
    messages: repairMessages,
  });

  const repairedCode = extractTypeScriptCode(repairAttempt);
  if (!repairedCode) {
    throw new Error("Failed to repair type errors");
  }

  return repairedCode;
}
