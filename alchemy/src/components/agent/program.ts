import fs from "node:fs/promises";
import { Agent } from "./agent";
import type { ModelId } from "./model";
import { Module } from "./module";

export class Program extends Agent(
  "Program",
  {
    description: "Generate a markdown document",
    alwaysUpdate: true,
  },
  async (
    ctx,
    props: {
      path: string;
      model?: ModelId;
    },
  ) => {
    if (ctx.event === "delete") {
      return;
    }

    const content = await fs.readFile(props.path, "utf-8");

    const module = new Module("module", {
      path: props.path,
      content,
      model: props.model,
    });

    return {
      module,
    };
  },
) {}
