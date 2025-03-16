import { $, alchemize } from "../../src";
import { StaticSite, Worker } from "../../src/cloudflare";

import "dotenv/config";

const api = new Worker("api", {
  name: "alchemy-example-vite-api",
  entrypoint: "./src/index.ts",
  bindings: [
    {
      type: "durable_object_namespace",
      class_name: "Counter",
      name: "COUNTER",
    },
  ],
});

const website = new StaticSite("Website", {
  name: "alchemy-example-vite",
  dir: "./dist",
  build: {
    command: "bun run build",
  },
  // bundle: {
  //   minify: false,
  // },
  routes: {
    "/api/*": api,
  },
});

$(console).log({
  url: website.url,
});

await alchemize({
  mode: process.argv.includes("--destroy") ? "destroy" : "up",
  quiet: process.argv.includes("--verbose") ? false : true,
});
