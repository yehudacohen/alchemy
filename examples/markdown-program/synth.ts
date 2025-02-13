import { alchemize } from "alchemy";
import { Program } from "alchemy/agent";
import "dotenv/config";

new Program("index.md", {
  path: "./index.md",
  model: "claude-3-5-sonnet-latest",
});

await alchemize({
  mode: process.argv.includes("destroy") ? "destroy" : "up",
  stage: "md",
  quiet: !process.argv.includes("--verbose"),
});
