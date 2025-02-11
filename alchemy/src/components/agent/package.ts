import { generateObject } from "ai";
import { mkdir, writeFile } from "fs/promises";
import { dirname } from "path";
import { z } from "zod";
import type { Context } from "../../resource";
import { rm } from "../fs";
import { Agent } from "./agent";
import { dependenciesAsMessages } from "./dependencies";
import { FileContext } from "./file-context";
import { resolveModel } from "./model";

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

export const PackageJsonInput = z.object({
  /**
   * List of requirements for the package
   * Can include dependencies, dev dependencies, scripts, etc.
   */
  requirements: z.array(z.string()),

  /**
   * List of dependencies for the package
   */
  dependencies: z.array(FileContext).optional(),

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

export type PackageJsonInput = z.infer<typeof PackageJsonInput>;

export interface PackageJsonOutput {
  path: string;
  content: string;
  packageJson: z.infer<typeof PackageJsonSchema>;
}

export class PackageJson extends Agent(
  "code::Package",
  {
    description:
      "This Agent is responsible for generating package.json configuration based on requirements.",
    input: PackageJsonInput,
  },
  async (
    ctx: Context<PackageJsonOutput>,
    input: PackageJsonInput,
  ): Promise<PackageJsonOutput | void> => {
    if (ctx.event === "delete") {
      await rm(input.path);
      return;
    }

    // Get the appropriate model
    const model = await resolveModel(input.model ?? "gpt-4o");

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
        ...dependenciesAsMessages(input.dependencies ?? []),
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
5. Must use ESM modules (type: "module")

Output only the package.json code (do not emit any other files).`,
        },
      ],
    });

    // Ensure the directory exists
    await mkdir(dirname(input.path), { recursive: true });

    const content = JSON.stringify(result.object, null, 2);

    // Write the package.json file
    await writeFile(input.path, content);

    return {
      path: input.path,
      content,
      packageJson: result.object,
    };
  },
) {}
