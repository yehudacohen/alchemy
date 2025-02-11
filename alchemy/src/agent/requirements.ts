import { mkdir, writeFile } from "fs/promises";
import { dirname } from "path";
import { z } from "zod";
import { rm } from "../fs";
import { Agent } from "./agent";
import { generateText } from "./ai";
import { dependenciesAsMessages } from "./dependencies";
import { FileContext } from "./file-context";
import { ModelId, resolveModel } from "./model";
export const ReasoningEffort = z.enum(["low", "medium", "high"]);

export const RequirementsInput = z.object({
  /**
   * The ID of the model to use for generating requirements documentation
   * @default "gpt-4o"
   */
  modelId: ModelId.optional(),

  /**
   * The effort to put into reasoning about the requirements
   */
  reasoningEffort: ReasoningEffort.optional(),

  /**
   * List of requirements to document and analyze
   */
  requirements: z.array(z.string()),

  /**
   * List of dependencies for the requirements document
   */
  dependencies: z.array(FileContext).optional(),

  /**
   * Temperature setting for model generation (higher = more creative, lower = more focused)
   * @default 0.7
   */
  temperature: z.number().optional(),

  /**
   * File path where the requirements document should be written
   */
  file: z.string().optional(),
});

export const RequirementsOutput = z.object({
  /**
   * Generated markdown document containing organized and analyzed requirements
   */
  content: z.string(),
});

export interface RequirementsInput extends z.infer<typeof RequirementsInput> {}
export type RequirementsOutput = z.infer<typeof RequirementsOutput>;

export class Requirements extends Agent(
  "code::Requirements",
  {
    description:
      "This Agent is responsible for writing and refining a detailed requirements document from a list of requirements.",
    input: RequirementsInput,
    output: RequirementsOutput,
  },
  async (ctx, input) => {
    if (ctx.event === "delete") {
      if (input.file) {
        await rm(input.file);
      }
      return;
    }

    // Get the appropriate model based on the ID
    const model = await resolveModel(input.modelId ?? "gpt-4o");

    // Generate the requirements document
    const { text } = await generateText({
      model,
      temperature: input.temperature ?? 0.7,
      maxSteps: 3, // Allow multiple steps for potential tool usage
      providerOptions: input.reasoningEffort
        ? {
            openai: {
              reasoningEffort: input.reasoningEffort,
            },
          }
        : undefined,
      tools: {
        // scrapeWebPage,
      },
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant that creates markdown documents from requirements. You can use the scrapeWebPage tool to get additional requirements from relevant URLs if needed.",
        },
        ...dependenciesAsMessages(input.dependencies ?? []),
        {
          role: "user",
          content: `Please analyze the following system requirements and create a comprehensive, unambiguous markdown document that covers all aspects:

Requirements:
${input.requirements.map((req) => `- ${req}`).join("\n")}

Guidelines:
1. Make explicit decisions for any ambiguous requirements - do not leave open questions
2. Document the reasoning behind key decisions
3. Be specific about technical choices and implementation details
4. Avoid phrases like "could be", "might need", or "possibly requires" - be definitive
5. Organize requirements into logical sections with clear dependencies and relationships

Format the output in markdown with appropriate headers, lists, and sections, starting with the title as an H1 header.
Include technical considerations and implementation details, ensuring every requirement has a clear, actionable specification.`,
        },
      ],
    });

    if (input.file) {
      // Ensure the directory exists
      await mkdir(dirname(input.file), { recursive: true });

      // Write the requirements to the file
      await writeFile(input.file, text);
    }

    return {
      content: text,
    };
  },
) {}
