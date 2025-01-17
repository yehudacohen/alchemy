import path from "node:path";
import { File, Folder } from "../src/components/fs.js";

const output = new Folder("output", ".output");

const index = new File(
  "index",
  output.apply((output) => path.join(output, "index.ts")),
  "console.log('Hello, world!');",
);
