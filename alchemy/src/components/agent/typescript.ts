import type { CoreMessage } from "ai";
import { generateText } from "ai";
import { mkdir, writeFile } from "fs/promises";
import { dirname } from "path";
import { z } from "zod";
import { rm } from "../fs";
import { Agent } from "./agent";
import { ModelId, resolveModel } from "./model";

export type CodeProps = z.infer<typeof CodeProps>;

export type File = z.infer<typeof File>;
export const File = z.object({
  path: z.string(),
  content: z.string(),
});

const CodeProps = z.object({
  /**
   * The ID of the model to use for generating TypeScript code
   * @default "gpt-4o"
   */
  modelId: ModelId.optional(),

  /**
   * The name of the file to write the code to
   */
  path: z.string(),

  /**
   * The requirements for the TypeScript file
   */
  requirements: z.string(),

  /**
   * List of other code files that it depends on
   */
  dependencies: z.array(File).optional(),

  /**
   * Temperature setting for model generation (higher = more creative, lower = more focused)
   * @default 0.7
   */
  temperature: z.number().optional(),
});

export type CodeOutput = z.infer<typeof CodeOutput>;
export const CodeOutput = File;

export class TypeScriptFile extends Agent(
  "code::TypeScriptFile",
  {
    description:
      "This Agent is responsible for generating TypeScript code based on requirements and context from other code files.",
    input: CodeProps,
    output: CodeOutput,
  },
  async (ctx, props) => {
    if (ctx.event === "delete") {
      await rm(props.path);
      return;
    }

    // Get the appropriate model based on the ID
    const { model } = await resolveModel(props.modelId ?? "gpt-4o");

    // Generate the TypeScript code with retries
    try {
      const content = await generateCodeWithRetries(model, props);
      // Ensure the directory exists
      await mkdir(dirname(props.path), { recursive: true });

      // Write the TypeScript file
      await writeFile(props.path, content);

      return {
        path: props.path,
        content: content,
      };
    } catch (error) {
      console.log(error);
      throw error;
    }
  },
) {}

/**
 * Attempts to generate valid TypeScript code with retries
 */
async function generateCodeWithRetries(
  model: any,
  props: CodeProps,
  maxAttempts = 3,
): Promise<string> {
  const baseMessages: CoreMessage[] = [
    {
      role: "system",
      content:
        "You are an expert TypeScript developer that generates clean, well-documented code following best practices. " +
        "Your response must follow this exact format:\n" +
        "1. A single sentence describing what the code will do\n" +
        "2. A single TypeScript code block surrounded by ```ts and ``` tags\n" +
        "Do not include any other explanations or multiple code blocks.",
    },
    {
      role: "user",
      content: `Please generate TypeScript code based on the following specifications:

Requirements:
${props.requirements}

${
  props.dependencies?.length
    ? `Context (other code files):
${props.dependencies.map((dep) => dep.content).join("\n\n")}`
    : ""
}

The code should:
1. Be well-documented with JSDoc comments
2. Follow TypeScript best practices
3. Include proper type definitions
4. Be ready to use with the provided context files

Your response MUST follow this format:
- One sentence summary of what the code will do
- Single TypeScript code block surrounded by \`\`\`ts and \`\`\` tags
- No other explanations or multiple code blocks`,
    },
  ];

  const messages = [...baseMessages];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { text } = await generateText({
      model,
      temperature: Math.max(
        0.1,
        (props.temperature ?? 0.7) * (1 - attempt * 0.2),
      ), // Reduce temperature with each attempt
      messages,
    });

    const code = extractTypeScriptCode(text);
    if (code) {
      return code;
    }

    if (attempt === maxAttempts) {
      throw new Error(
        "Failed to generate valid TypeScript code after maximum attempts",
      );
    }

    // Add the failed attempt and correction request to the message chain
    messages.push(
      {
        role: "assistant",
        content: text,
      },
      {
        role: "user",
        content:
          "Your response did not match the required format. Please provide your response with exactly one sentence summary" +
          " followed by a single TypeScript code block surrounded by ```ts and ``` tags. No other text or explanations.",
      },
    );
  }

  // This should never be reached due to the throw above
  throw new Error("Unexpected code generation failure");
}

/**
 * Extracts TypeScript code from a markdown code block
 * @param text Response text that may contain markdown
 * @returns The TypeScript code if found, undefined otherwise
 */
function extractTypeScriptCode(text: string): string | undefined {
  const matches = text.match(/```(?:ts|typescript)\n([\s\S]*?)```/);
  return matches?.[1]?.trim();
}
