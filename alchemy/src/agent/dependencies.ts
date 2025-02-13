import type { CoreMessage } from "ai";
import type { FileContext } from "./file-context";

export function dependenciesAsMessages(
  dependencies: FileContext[] | undefined,
): CoreMessage[] {
  if (!dependencies?.length) return [];

  const fileTree = generateFileTree(dependencies);

  return [
    {
      role: "user" as const,
      content: [
        `Here are some relevant upstream files that you may need to reference.`,
        `Existing file structure:`,
        fileTree,
        `File contents:`,
        dependencies
          .flatMap((dep) =>
            dep.content ? [`// ${dep.path}\n${dep.content}`] : [],
          )
          .join("\n\n"),
      ].join("\n"),
    },
    {
      role: "assistant" as const,
      content: "Thanks, I'll refer to those where relevant.",
    },
  ];
}

function generateFileTree(dependencies: FileContext[]): string {
  const tree: { [key: string]: boolean } = {};

  // Sort dependencies by path for consistent ordering
  dependencies.sort((a, b) => a.path.localeCompare(b.path));

  for (const dep of dependencies) {
    const parts = dep.path.split("/");
    let currentPath = "";

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const newPath = currentPath ? `${currentPath}/${part}` : part;
      tree[newPath] = true;
      currentPath = newPath;
    }
  }

  const paths = Object.keys(tree);
  let result = "";

  for (const path of paths) {
    const depth = path.split("/").length - 1;
    const prefix = "  ".repeat(depth);
    const name = path.split("/").pop()!;
    result += `${prefix}${depth > 0 ? "└─ " : ""}${name}\n`;
  }

  return result;
}
