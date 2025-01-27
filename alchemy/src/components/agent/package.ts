import { generateObject } from "ai";
import { mkdir, unlink, writeFile } from "fs/promises";
import { dirname } from "path";
import { z } from "zod";
import { Agent } from "./agent";
import type { AnthropicModelId } from "./anthropic";
import { resolveModel } from "./model";
import type { OpenAIChatModelId } from "./openai";

export type ModelId = OpenAIChatModelId | AnthropicModelId;

export const PackageJsonSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string().optional(),
  main: z.string().optional(),
  types: z.string().optional(),
  type: z.literal("module"),
  scripts: z.record(z.string()).optional(),
  peerDependencies: z.record(z.string()).optional(),
  peerDependenciesMeta: z
    .record(z.object({ optional: z.boolean() }))
    .optional(),
  devDependencies: z.record(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
  author: z.string().optional(),
  license: z.string().optional(),
  repository: z
    .object({
      type: z.string(),
      url: z.string(),
    })
    .optional(),
  exports: z.unknown().optional(),
  files: z.array(z.string()).optional(),
});

export const PackageInput = z.object({
  /**
   * List of requirements for the package
   * Can include dependencies, dev dependencies, scripts, etc.
   */
  requirements: z.array(z.string()),

  /**
   * Name of the package
   */
  name: z.string(),

  /**
   * The ID of the model to use for generating package configuration
   * @default "gpt-4o"
   */
  model: z.string().optional(),

  /**
   * Temperature setting for model generation
   * @default 0.3
   */
  temperature: z.number().optional(),

  /**
   * Path to the package.json file to generate
   */
  path: z.string(),
});

export type PackageInput = z.infer<typeof PackageInput>;

export type PackageOutput = z.infer<typeof PackageJsonSchema>;
export const PackageOutput = z.object({
  content: z.string(),
  packageJson: PackageJsonSchema,
});

export class PackageJson extends Agent(
  "code::Package",
  {
    description:
      "This Agent is responsible for generating package.json configuration based on requirements.",
    input: PackageInput,
    output: PackageOutput,
  },
  async (ctx, input) => {
    if (ctx.event === "delete") {
      await unlink(input.path);
      return;
    }

    // Get the appropriate model
    const { model } = await resolveModel(input.model ?? "gpt-4o");

    // Generate the package configuration using generateObject for type safety
    const result = await generateObject({
      model,
      schema: PackageJsonSchema,
      temperature: input.temperature ?? 0.3,
      messages: [
        {
          role: "system",
          content:
            "You are an expert at creating Node.js/TypeScript package configurations. You will generate a package.json configuration based on requirements.",
        },
        {
          role: "user",
          content: `Please generate a package.json configuration based on these requirements:

Package name: ${input.name}

Requirements:
${input.requirements.map((req) => `- ${req}`).join("\n")}

Rules:
1. All dependencies must be peer dependencies
2. Use latest stable versions for all dependencies
3. Include standard TypeScript configuration in devDependencies
4. Use "bun" as the package manager
5. Must use ESM modules (type: "module")`,
        },
      ],
    });

    // Ensure the directory exists
    await mkdir(dirname(input.path), { recursive: true });

    const content = JSON.stringify(result.object, null, 2);

    // Write the package.json file
    await writeFile(input.path, content);

    return {
      content,
      packageJson: result.object,
    };
  },
) {}
