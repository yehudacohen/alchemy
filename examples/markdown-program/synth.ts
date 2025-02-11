import { alchemize } from "alchemy";
import { Program } from "alchemy/agent";
import "dotenv/config";

new Program("index.md", {
  path: "./index.md",
  model: "claude-3-5-sonnet-20241022",
});

await alchemize({
  mode: process.argv.includes("destroy") ? "destroy" : "up",
  stage: "md",
});
