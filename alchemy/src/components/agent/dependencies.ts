import type { CoreMessage } from "ai";
import type { FileContext } from "./file-context";

export function dependenciesAsMessages(
  dependencies: FileContext[],
): CoreMessage[] {
  return dependencies.length
    ? [
        {
          role: "user" as const,
          content: [
            `Here are some relevant upstream files that you may need to reference:`,
            dependencies
              .map((dep) =>
                dep.content
                  ? `// ${dep.path}\n${dep.content}`
                  : `// ${dep.path}`,
              )
              .join("\n\n"),
          ].join("\n"),
        },
        {
          role: "assistant" as const,
          content: "Thanks, I'll refer to those where relevant.",
        },
      ]
    : [];
}
