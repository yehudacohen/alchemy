import dotenv from "dotenv";
import path from "node:path";
import { $, alchemize } from "../../src";
import { StaticSite, Worker } from "../../src/cloudflare";

dotenv.config({
  path: path.join(__dirname, "..", "..", ".env"),
});

const api = new Worker("api", {
  name: "alchemy-example-vite-api",
  entrypoint: "./src/index.ts",
});

const website = new StaticSite("Website", {
  name: "alchemy-example-vite",
  dir: "./dist",
  build: {
    command: "bun run build",
  },
  bundle: {
    minify: false,
  },
  routes: {
    "/api/*": api,
  },
});

$.print({
  url: website.url,
});

// new Worker("worker", {
//   name: "alchemy-examples",
//   entrypoint: "./src/index.ts",
//   bindings: [
//     {
//       type: "durable_object_namespace",
//       class_name: "Counter",
//       name: "COUNTER",
//     },
//   ],
// });

await alchemize({
  mode: process.argv.includes("--destroy") ? "destroy" : "up",
  quiet: true,
});
