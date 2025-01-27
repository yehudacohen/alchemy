import { alchemize } from "alchemy";
import { TypeScriptProject } from "alchemy/agent";

new TypeScriptProject("alchemy-todo-app", {
  path: ".out",
  name: "alchemy-todo-app",
  requirements: [
    "The application must be able to create, read, update, and delete TODO items",
    "The application must be able to list all TODO items",
    "The application must be able to mark a TODO item as complete",
    "Build the app with Bun's HTTP server. https://bun.sh/guides/ecosystem/express",
    "Store state in memory, we don't care about persistence",
    "The web server should be a simple express server",
  ],
});

await alchemize({
  stage: "codegen-recursive",
  mode: process.argv.includes("destroy") ? "destroy" : "up",
});
