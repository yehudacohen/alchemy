import { tool } from "ai";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  type FileContext,
  type ModelId,
  dependenciesAsMessages,
  generateText,
  resolveModel,
} from "../agent";
import { Prompts } from "../agent/prompts";
import { rm } from "../fs";
import { extractMarkdown } from "../markdown/extract";
import { type Context, Resource } from "../resource";

export interface DesignInput {
  prompt: string;
  path: string;
  deps?: any[];
  model?: ModelId;
  dependencies: FileContext[];
}

export interface DesignOutput {
  path: string;
  content: string;
}

export class Design extends Resource(
  "design",
  async (ctx: Context<DesignOutput>, props: DesignInput) => {
    if (ctx.event === "delete") {
      await rm(props.path);
      return;
    }
    const model = await resolveModel(props.model ?? "gpt-4o");

    const importFile = tool({
      description: "Imports a relevant file into context",
      parameters: z.object({
        file: z.string(),
      }),
      execute: async ({ file }) => fs.readFile(file, "utf-8"),
    });

    let existingContent: string | undefined = undefined;
    if (ctx.event === "update") {
      if (props.path) {
        try {
          existingContent = await fs.readFile(props.path, "utf-8");
        } catch {
          // File doesn't exist yet, continue with empty content
        }
      } else {
        existingContent = ctx.output.content;
      }
    }

    console.log(
      ctx.event === "create" ? "Designing" : "Revising design",
      ":",
      props.path,
    );

    const result = await generateText({
      model,
      // tools: {
      //   import: importFile,
      // },
      providerOptions:
        props.model === "o3-mini"
          ? {
              openai: {
                reasoningEffort: "high",
              },
            }
          : undefined,
      messages: [
        {
          role: "system",
          content: Prompts.program,
        },
        ...dependenciesAsMessages(props.dependencies),
        ...(existingContent
          ? [
              {
                role: "user" as const,
                content: `Here is the prior version of ${props.path}:\n${existingContent}`,
              },
              {
                role: "assistant" as const,
                content:
                  "Thanks, I'll make sure to consider this when producing the next revision.",
              },
            ]
          : []),
        {
          role: "user",
          content: props.prompt,
        },
        {
          role: "user",
          content: [
            `Make sure to list each of the files that need to be implemented and`,
            "and to follow best practices in term of separation of concerns.",
            "Ideally, each component has its own dedicated file.",
            "Each file should be referenced using markdown links, e.g. [file.ts](./file.ts).",
          ].join(" "),
        },
      ],
    });

    const content = extractMarkdown(result.text);

    await fs.mkdir(path.dirname(props.path), { recursive: true });

    await fs.writeFile(props.path, content);

    return {
      path: props.path,
      content,
    };
  },
) {}
