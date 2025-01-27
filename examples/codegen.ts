import { alchemize } from "alchemy";
import { Requirements } from "alchemy/agent";

import "dotenv/config";

const requirements = new Requirements("requirements", {
  filePath: ".out/requirements.md",
  title: "A simple TODO application",
  requirements: [
    "The application must be able to create, read, update, and delete TODO items",
    "The application must be able to list all TODO items",
    "The application must be able to mark a TODO item as complete",
  ],
});

await alchemize({
  stage: "codegen",
  mode: process.argv.includes("destroy") ? "destroy" : "up",
});
