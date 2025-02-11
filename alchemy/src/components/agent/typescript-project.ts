import path from "path";
import { z } from "zod";
import { Agent } from "./agent";
import { PackageJson } from "./package";
import { Requirements } from "./requirements";
import { TypeScriptConfig } from "./tsconfig";
import { TypeScriptFile } from "./typescript";

export const TypeScriptProjectInput = z.object({
  name: z.string(),
  path: z.string(),
  requirements: z.array(z.string()),
});

export const TypeScriptProjectOutput = z.object({
  requirements: z.string(),
  packageJson: z.string(),
  tsconfig: z.string(),
  server: z.string(),
});

export class TypeScriptProject extends Agent(
  "code:typescript-project",
  {
    description:
      "Creates a TypeScript project root with package.json, tsconfig.json" +
      ", and a server.ts file.",
    input: TypeScriptProjectInput,
    output: TypeScriptProjectOutput,
  },
  async (ctx, input) => {
    const requirements = new Requirements("requirements", {
      file: path.join(input.path, "requirements.md"),
      title: "A simple TODO application",
      requirements: input.requirements,
    });

    const packageJson = new PackageJson("package.json", {
      path: path.join(input.path, "package.json"),
      requirements: [requirements.content],
      name: "alchemy-todo-app",
    });

    const tsconfig = new TypeScriptConfig("tsconfig.json", {
      path: path.join(input.path, "tsconfig.json"),
      requirements: [requirements.content],
    });

    const server = new TypeScriptFile("server.ts", {
      path: path.join(input.path, "server.ts"),
      requirements: requirements.content,
    });

    return {
      requirements: requirements.content,
      packageJson: packageJson.content,
      tsconfig: tsconfig.content,
      server: server.content,
    };
  },
) {}
