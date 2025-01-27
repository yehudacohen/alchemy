import { generateObject } from "ai";
import { mkdir, unlink, writeFile } from "fs/promises";
import { dirname } from "path";
import { z } from "zod";
import { Agent } from "./agent";
import { resolveModel } from "./model";

export type TsConfigProps = z.infer<typeof TsConfigProps>;

export const TsConfigProps = z.object({
  /**
   * The ID of the model to use for generating tsconfig configuration
   * @default "gpt-4o"
   */
  modelId: z.string().optional(),

  /**
   * List of requirements for the TypeScript configuration
   * Can include module settings, compilation options, etc.
   */
  requirements: z.array(z.string()),

  /**
   * Temperature setting for model generation
   * @default 0.3
   */
  temperature: z.number().optional(),

  /**
   * Path to the tsconfig.json file to generate
   */
  path: z.string(),
});

export type TsConfigJson = z.infer<typeof TsConfigSchema>;
export const TsConfigSchema = z.object({
  $schema: z.string().optional(),
  compilerOptions: z.object({
    target: z.enum([
      "es2015",
      "es2016",
      "es2017",
      "es2018",
      "es2019",
      "es2020",
      "es2021",
      "es2022",
      "esnext",
    ]),
    module: z.enum([
      "commonjs",
      "es2015",
      "es2020",
      "es2022",
      "esnext",
      "node16",
      "nodenext",
    ]),
    lib: z.array(z.string()).optional(),
    declaration: z.boolean().optional(),
    declarationMap: z.boolean().optional(),
    sourceMap: z.boolean().optional(),
    outDir: z.string().optional(),
    rootDir: z.string().optional(),
    strict: z.boolean(),
    esModuleInterop: z.boolean().optional(),
    skipLibCheck: z.boolean().optional(),
    forceConsistentCasingInFileNames: z.boolean().optional(),
    moduleResolution: z
      .enum(["node", "node16", "nodenext", "bundler"])
      .optional(),
    resolveJsonModule: z.boolean().optional(),
    isolatedModules: z.boolean().optional(),
    allowJs: z.boolean().optional(),
    checkJs: z.boolean().optional(),
    noEmit: z.boolean().optional(),
    incremental: z.boolean().optional(),
    composite: z.boolean().optional(),
    tsBuildInfoFile: z.string().optional(),
    paths: z.record(z.array(z.string())).optional(),
    baseUrl: z.string().optional(),
    types: z.array(z.string()).optional(),
    typeRoots: z.array(z.string()).optional(),
  }),
  include: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
  references: z
    .array(
      z.object({
        path: z.string(),
      }),
    )
    .optional(),
});

export class TypeScriptConfig extends Agent(
  "code::tsconfig",
  {
    description:
      "This Agent is responsible for generating tsconfig.json configuration based on requirements.",
    input: TsConfigProps,
    output: TsConfigSchema,
  },
  async (ctx, props) => {
    if (ctx.event === "delete") {
      await unlink(props.path);
      return;
    }

    // Get the appropriate model
    const { model } = await resolveModel(props.modelId ?? "gpt-4o");

    // Generate the tsconfig configuration using generateObject for type safety
    const result = await generateObject({
      model,
      schema: TsConfigSchema,
      temperature: props.temperature ?? 0.3,
      messages: [
        {
          role: "system",
          content:
            "You are an expert at creating TypeScript configurations. You will generate a tsconfig.json configuration based on requirements.",
        },
        {
          role: "user",
          content: `Please generate a tsconfig.json configuration based on these requirements:

Requirements:
${props.requirements.map((req) => `- ${req}`).join("\n")}

Rules:
1. Use modern TypeScript features
2. Enable strict type checking
3. Use ESM modules by default
4. Include source maps for better debugging
5. Infer appropriate settings for declarations, module resolution, and other options based on the requirements
6. Use appropriate paths for source and output directories`,
        },
      ],
    });

    // Ensure the directory exists
    await mkdir(dirname(props.path), { recursive: true });

    // Write the tsconfig.json file
    await writeFile(props.path, JSON.stringify(result.object, null, 2));

    return result.object;
  },
) {}
