import type { CoreMessage } from "ai";
import { mkdir, writeFile } from "fs/promises";
import { dirname } from "path";
import { z } from "zod";
import { rm } from "../fs";
import { Agent } from "./agent";
import { generateText } from "./ai";
import { checkForCodeOmission } from "./check-omission";
import { consultExpert } from "./consult-expert";
import { extractTypeScriptCode } from "./extract";
import { ModelId, resolveModel } from "./model";
import { repairTypeScriptCode } from "./repair-typescript";
import { validateTypeScript } from "./validate-typescript";

import { File } from "./file";
import { repairCodeOmissions } from "./repair-omissions";

export type CodeProps = z.infer<typeof CodeProps>;

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

  /**
   * Whether to perform TypeScript type checking on the generated code
   * @default false
   */
  typeCheck: z.boolean().optional(),

  /**
   * Path to the tsconfig.json file to use for validation
   * If not provided, will look for tsconfig.json in the project root
   * Only used if typeCheck is true
   */
  tsconfigPath: z.string().optional(),

  /**
   * Project root directory. Used to resolve tsconfig.json and module imports
   * If not provided, will use the directory of the target file
   * Only used if typeCheck is true
   */
  projectRoot: z.string().optional(),
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

    const messages: CoreMessage[] = [
      {
        role: "system" as const,
        content:
          "You are an expert TypeScript developer that generates clean, well-documented code following best practices. " +
          "Your response must follow this exact format:\n" +
          "1. A single sentence describing what the code will do\n" +
          "2. A single TypeScript code block surrounded by ```ts and ``` tags containing the COMPLETE implementation\n" +
          "IMPORTANT: You must ALWAYS provide the ENTIRE file contents, including ALL imports, types, and implementations.\n" +
          "NEVER output partial code or omit any functionality from the original file when making changes.\n" +
          "Do not include any other explanations or multiple code blocks.",
      },
      {
        role: "user" as const,
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
5. Include ALL necessary imports and dependencies
6. Contain the COMPLETE implementation with no omissions`,
      },
    ];

    const maxAttempts = 3;
    let code: string | undefined;
    let typeErrors: string | undefined;

    // Try generating and validating code up to maxAttempts times
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // After 2 failed attempts, consult o3-mini for analysis
        if (attempt === maxAttempts) {
          const diagnosis = await consultExpert(messages, typeErrors!);

          messages.push({
            role: "user",
            content: diagnosis,
          });
        }

        // Generate the TypeScript code
        console.log(`[TypeScript] Generating code attempt ${attempt}...`);
        const { text } = await generateText({
          model,
          temperature: Math.max(
            0.1,
            (props.temperature ?? 0.7) * (1 - attempt * 0.2),
          ),
          messages,
        });

        code = extractTypeScriptCode(text);
        if (!code) {
          console.log("Format mismatch");
          messages.push(
            {
              role: "assistant" as const,
              content: text,
            },
            {
              role: "user" as const,
              content:
                "Your response did not match the required format. Please provide your response with exactly one sentence summary" +
                " followed by a single TypeScript code block surrounded by ```ts and ``` tags containing the COMPLETE implementation. No other text or explanations.",
            },
          );
          continue;
        }

        // First check for omissions
        const hasOmissions = await checkForCodeOmission(model, code);
        if (hasOmissions) {
          code = await repairCodeOmissions(model, messages);
        }

        // Ensure the directory exists
        await mkdir(dirname(props.path), { recursive: true });

        // Write the TypeScript file
        await writeFile(props.path, code);

        if (props.typeCheck) {
          typeErrors = await validateTypeScript(props.path, {
            dependencies: props.dependencies,
            tsconfigPath: props.tsconfigPath,
            projectRoot: props.projectRoot,
          });
          if (typeErrors) {
            if (attempt === maxAttempts) {
              throw new Error(
                `Failed to generate type-safe code after maximum attempts. Errors:\n${typeErrors}`,
              );
            } else {
              code = await repairTypeScriptCode(model, typeErrors, messages);
              continue;
            }
          }
        }

        // If we get here, the code is valid
        return {
          path: props.path,
          content: code,
        };
      } catch (error) {
        // On the last attempt, rethrow the error
        if (attempt === maxAttempts) {
          throw error;
        }
        // Otherwise continue to the next attempt
        console.log(`Attempt ${attempt} failed:`, error);
      }
    }

    // This should never be reached due to the throws above
    throw new Error("Unexpected code generation failure");
  },
) {}
