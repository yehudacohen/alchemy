import type { CoreMessage } from "ai";
import { mkdir, writeFile } from "fs/promises";
import { dirname, resolve } from "path";
import * as ts from "typescript";
import { z } from "zod";
import { rm } from "../fs";
import { Agent } from "./agent";
import { generateText } from "./ai";
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
4. Be ready to use with the provided context files`,
      },
    ];

    const maxAttempts = 3;

    // Try generating and validating code up to maxAttempts times
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Generate the TypeScript code
        const { text } = await generateText({
          model,
          temperature: Math.max(
            0.1,
            (props.temperature ?? 0.7) * (1 - attempt * 0.2),
          ),
          messages,
        });

        const content = extractTypeScriptCode(text);
        if (!content) {
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
          continue;
        }

        // Ensure the directory exists
        await mkdir(dirname(props.path), { recursive: true });

        // Write the TypeScript file
        await writeFile(props.path, content);

        // If type checking is enabled, validate the written file
        if (props.typeCheck) {
          const diagnostics = await validateTypeScript(props.path, {
            dependencies: props.dependencies,
            tsconfigPath: props.tsconfigPath,
            projectRoot: props.projectRoot,
          });

          if (diagnostics.length > 0) {
            // Format the type errors
            const formatHost: ts.FormatDiagnosticsHost = {
              getCanonicalFileName: (path) => path,
              getCurrentDirectory: () =>
                props.projectRoot ?? dirname(props.path),
              getNewLine: () => ts.sys.newLine,
            };

            const errorMessages = ts.formatDiagnosticsWithColorAndContext(
              diagnostics,
              formatHost,
            );
            console.log(errorMessages);

            if (attempt === maxAttempts) {
              throw new Error(
                "Failed to generate type-safe code after maximum attempts. Last type errors:\n" +
                  errorMessages,
              );
            }

            // Add the failed attempt and type errors to the conversation
            messages.push(
              {
                role: "assistant",
                content: text,
              },
              {
                role: "user",
                content: `The code has TypeScript errors that need to be fixed. Here are the errors:\n\n${errorMessages}\n\nPlease generate a new version that fixes these issues.`,
              },
            );
            continue;
          }
        }

        // If we get here, the code is valid (or type checking is disabled)
        return {
          path: props.path,
          content: content,
        };
      } catch (error) {
        // On the last attempt, rethrow the error
        if (attempt === maxAttempts) {
          throw error;
        }
        // Otherwise continue to the next attempt
        console.log(`Attempt ${attempt} failed:`, error);

        messages.push(
          {
            role: "assistant",
            content: "An error occurred while generating the code.",
          },
          {
            role: "user",
            content:
              "Please try again with proper error handling and type safety.",
          },
        );
      }
    }

    // This should never be reached due to the throws above
    throw new Error("Unexpected code generation failure");
  },
) {}

/**
 * Validates TypeScript code using the compiler API and returns any type errors
 */
async function validateTypeScript(
  filePath: string,
  options: {
    dependencies?: File[];
    tsconfigPath?: string;
    projectRoot?: string;
  },
): Promise<ts.Diagnostic[]> {
  const projectRoot = options.projectRoot ?? dirname(filePath);
  const tsconfigPath =
    options.tsconfigPath ?? resolve(projectRoot, "tsconfig.json");

  // Load tsconfig.json if it exists
  let compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    noEmit: true,
  };

  if (ts.sys.fileExists(tsconfigPath)) {
    const { config, error } = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
    if (error) {
      throw new Error(`Error reading tsconfig.json: ${error.messageText}`);
    }

    const { options: parsedOptions, errors } = ts.parseJsonConfigFileContent(
      config,
      ts.sys,
      projectRoot,
    );

    if (errors.length) {
      throw new Error(
        `Error parsing tsconfig.json: ${errors.map((e) => e.messageText).join("\n")}`,
      );
    }

    compilerOptions = parsedOptions;
  }

  // Create program
  const program = ts.createProgram({
    rootNames: [filePath],
    options: compilerOptions,
  });

  // Get diagnostics
  const diagnostics = [
    ...program.getSemanticDiagnostics(),
    ...program.getSyntacticDiagnostics(),
  ];

  return diagnostics;
}

/**
 * Attempts to generate valid TypeScript code with retries
 */
async function generateCodeWithRetries(
  model: any,
  props: CodeProps,
  maxAttempts = 3,
): Promise<string> {
  const messages: CoreMessage[] = [
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
    if (!code) {
      if (attempt === maxAttempts) {
        throw new Error(
          "Failed to generate valid TypeScript code after maximum attempts",
        );
      }

      // Add feedback about the format
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
      continue;
    }

    return code;
  }

  // This should never be reached due to the throws above
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
