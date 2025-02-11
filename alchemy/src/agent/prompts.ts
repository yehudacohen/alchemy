import fs from "node:fs/promises";
import path from "node:path";

// TODO: replace with import.meta.glob
// see: https://github.com/oven-sh/bun/issues/6060

const __dirname = new URL(".", import.meta.url).pathname;

const prompts = ["program"] as const;

export const Prompts = Object.fromEntries(
  await Promise.all(
    prompts.map(async (prompt) => [
      prompt,
      await fs.readFile(path.join(__dirname, `${prompt}.md`), "utf-8"),
    ]),
  ),
) as {
  [key in (typeof prompts)[number]]: string;
};
