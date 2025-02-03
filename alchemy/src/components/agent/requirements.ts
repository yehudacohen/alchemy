import { mkdir, unlink, writeFile } from "fs/promises";
import { dirname } from "path";
import { z } from "zod";
import { Agent } from "./agent";
import { generateText } from "./ai";
import { ModelId, resolveModel } from "./model";
import { scrapeWebPage } from "./scrape";

export const RequirementsInput = z.object({
  /**
   * The ID of the model to use for generating requirements documentation
   * @default "gpt-4o"
   */
  modelId: ModelId.optional(),

  /**
   * List of requirements to document and analyze
   */
  requirements: z.array(z.string()),

  /**
   * One-line summary of the requirements document
   */
  title: z.string(),

  /**
   * Temperature setting for model generation (higher = more creative, lower = more focused)
   * @default 0.7
   */
  temperature: z.number().optional(),

  /**
   * File path where the requirements document should be written
   */
  path: z.string(),
});

export const RequirementsOutput = z.object({
  /**
   * Generated markdown document containing organized and analyzed requirements
   */
  content: z.string(),
});

export type RequirementsInput = z.infer<typeof RequirementsInput>;
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
    console.log("Requirements input", ctx.event);
    if (ctx.event === "delete") {
      await unlink(input.path);
      return;
    }

    // Get the appropriate model based on the ID
    const { model } = await resolveModel(input.modelId ?? "gpt-4o");

    // Generate the requirements document
    const { text } = await generateText({
      model,
      temperature: input.temperature ?? 0.7,
      maxSteps: 3, // Allow multiple steps for potential tool usage
      tools: {
        scrapeWebPage,
      },
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant that creates markdown documents from requirements. You can use the scrapeWebPage tool to get additional requirements from relevant URLs if needed.",
        },
        {
          role: "user",
          content: `Please analyze the following system requirements and create a comprehensive, unambiguous markdown document that covers all aspects:

Title: ${input.title}

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

    // Ensure the directory exists
    await mkdir(dirname(input.path), { recursive: true });

    // Write the requirements to the file
    await writeFile(input.path, text);

    return {
      content: text,
    };
  },
) {}
