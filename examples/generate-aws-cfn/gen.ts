import { alchemize } from "alchemy";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const __root = path.resolve(__dirname, "..", "..");

// TODO

await alchemize({
  mode: process.argv.includes("destroy") ? "destroy" : "up",
});
