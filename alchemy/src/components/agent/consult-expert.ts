import type { CoreMessage } from "ai";
import { generateText } from "./ai";
import { resolveModel } from "./model";

export async function consultExpert(
  messages: CoreMessage[],
  typeErrors: string,
): Promise<string> {
  console.log("[TypeScript] Consulting expert for code analysis...");
  const o3Model = await resolveModel("o3-mini");

  // Get diagnostic analysis from o3-mini
  const consultationMessages: CoreMessage[] = [
    ...messages,
    {
      role: "user",
      content: `Analyze these TypeScript errors and the code to identify the root causes:

TypeScript errors:
${typeErrors}

Please help by:
1. Diagnosing the root cause of any type errors
2. Identifying specific sections of code that need to change
3. Providing step-by-step guidance on how to fix them

Focus only on type-related issues and necessary fixes.`,
    },
  ];

  const { text: analysis } = await generateText({
    model: o3Model,
    temperature: 0.1,
    providerOptions: {
      openai: {
        reasoningEffort: "high",
      },
    },
    messages: consultationMessages,
  });

  return analysis;
}
