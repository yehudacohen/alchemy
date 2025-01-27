import { generateText } from "ai";
import { z } from "zod";
import { Agent } from "./agent";
import { type ModelId, resolveModel } from "./model";

export interface RequirementsProps {
  /**
   * The ID of the model to use for generating requirements documentation
   * @default "gpt-4o"
   */
  modelId?: ModelId;

  /**
   * List of requirements to document and analyze
   */
  requirements: string[];

  /**
   * One-line summary of the requirements document
   */
  title: string;

  /**
   * Temperature setting for model generation (higher = more creative, lower = more focused)
   * @default 0.7
   */
  temperature?: number;
}

export interface RequirementsOutput {
  /**
   * Generated markdown document containing organized and analyzed requirements
   */
  requirements: string;
}

export class Requirements extends Agent(
  "code::Requirements",
  {
    description:
      "This Agent is responsible for writing and refining a detailed requirements document from a list of requirements.",
    input: z.object({
      modelId: z.string().optional(),
      requirements: z.array(z.string()),
      title: z.string(),
      temperature: z.number().optional(),
    }),
    output: z.object({
      requirements: z.string(),
    }),
  },
  async (ctx, props) => {
    console.log("requirements", ctx.event);
    if (ctx.event === "delete") {
      return;
    }

    // Get the appropriate model based on the ID
    const { model } = await resolveModel(props.modelId ?? "gpt-4o");

    // Generate the requirements document
    const { text } = await generateText({
      model,
      temperature: props.temperature ?? 0.7,
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant that creates markdown documents from requirements.",
        },
        {
          role: "user",
          content: `Please analyze the following system requirements and create a comprehensive markdown document that covers all aspects:

Title: ${props.title}

Requirements:
${props.requirements.map((req) => `- ${req}`).join("\n")}

Please organize the requirements into logical sections and provide detailed explanations where needed.
Include any technical considerations, dependencies, or potential challenges.
Format the output in markdown with appropriate headers, lists, and sections, starting with the title as an H1 header.`,
        },
      ],
    });

    return {
      requirements: text,
    };
  },
) {}
