import fs from "node:fs/promises";
import type { Context } from "../resource";
import { Resource } from "../resource";
import type { ModelId } from "./model";
import { Module } from "./module";

export class Program extends Resource(
  "Program",
  {
    alwaysUpdate: true,
  },
  async (
    ctx: Context<{
      module: Module;
    }>,
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
