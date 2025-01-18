import path from "node:path";
import { apply } from "../src/apply.js";
import { File, Folder } from "../src/components/fs.js";

const output = new Folder("output", ".output");

const index = new File(
  "index",
  // $(path).join(output, "index.ts"),
  output.apply((output) => path.join(output, "index.ts")),
  "console.log('Hello, world!');",
);

const indexPath = await apply(index);

console.log(indexPath);
