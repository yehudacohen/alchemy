import type { LanguageModelV1 } from "ai";
import { z } from "zod";
import { generateObject } from "./ai";

const CodeOmissionCheck = z.object({
  hasOmittedCode: z.boolean(),
  explanation: z.string(),
});

export async function checkForCodeOmission(
  model: LanguageModelV1,
  code: string,
): Promise<boolean> {
  console.log("[TypeScript] Checking for code omissions...");
  const result = await generateObject({
    model,
    schema: CodeOmissionCheck,
    temperature: 0.1,
    messages: [
      {
        role: "system",
        content:
          "You are checking for signs of code omission in TypeScript code. Look for comments that indicate abbreviated or omitted content.",
      },
      {
        role: "user",
        content: `Check this code for any signs of content being lazily omitted:

\`\`\`typescript
${code}
\`\`\`

Look for patterns like:
- "// rest of the ..."
- "// remaining code ..."
- "// ... existing code ..."
- "// other methods ..."
- "// etc ..."
- "// Implementation would go here"
- "// For now just ..."
- Any similar comments that indicate code was abbreviated

Only answer true if you find such comments indicating omitted content. Otherwise answer false.`,
      },
    ],
  });

  return result.object.hasOmittedCode;
}
