import { generateText } from "ai";
import { mkdir, unlink, writeFile } from "fs/promises";
import { dirname } from "path";
import { z } from "zod";
import { Agent } from "./agent";
import { resolveModel } from "./model";

export const RequirementsInput = z.object({
  /**
   * The ID of the model to use for generating requirements documentation
   * @default "gpt-4o"
   */
  modelId: z.string().optional(),

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
  filePath: z.string(),
});

export const RequirementsOutput = z.object({
  /**
   * Generated markdown document containing organized and analyzed requirements
   */
  requirements: z.string(),
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
    if (ctx.event === "delete") {
      await unlink(input.filePath);
      return;
    }

    // Get the appropriate model based on the ID
    const { model } = await resolveModel(input.modelId ?? "gpt-4o");

    // Generate the requirements document
    const { text } = await generateText({
      model,
      temperature: input.temperature ?? 0.7,
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant that creates markdown documents from requirements.",
        },
        {
          role: "user",
          content: `Please analyze the following system requirements and create a comprehensive markdown document that covers all aspects:

Title: ${input.title}

Requirements:
${input.requirements.map((req) => `- ${req}`).join("\n")}

Please organize the requirements into logical sections and provide detailed explanations where needed.
Include any technical considerations, dependencies, or potential challenges.
Format the output in markdown with appropriate headers, lists, and sections, starting with the title as an H1 header.`,
        },
      ],
    });

    // Ensure the directory exists
    await mkdir(dirname(input.filePath), { recursive: true });

    // Write the requirements to the file
    await writeFile(input.filePath, text);

    return {
      requirements: text,
    };
  },
) {}
