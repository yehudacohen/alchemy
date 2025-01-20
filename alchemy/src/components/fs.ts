import fs from "node:fs";
import path from "node:path";
import { ignore } from "../error";
import { Resource } from "../resource";

export class File extends Resource(
  "fs::File",
  async (ctx, filePath: string, content: string) => {
    if (ctx.event === "delete") {
      await ignore("ENOENT", () => fs.promises.unlink(filePath));
    } else {
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      await fs.promises.writeFile(filePath, content);
    }
    return filePath;
  },
) {}

export class Folder extends Resource(
  "fs::Folder",
  async (ctx, dirPath: string) => {
    if (ctx.event === "delete") {
      if (await ctx.get("isOwned")) {
        // only delete the folder if we own it (we created it)
        await ignore("ENOENT", () => fs.promises.rmdir(dirPath));
      }
    } else {
      try {
        await fs.promises.mkdir(dirPath, { recursive: true });
      } catch (error: any) {
        if (error.code === "EEXIST") {
          // record that we own the directory
          await ctx.set("isOwned", true);
        } else {
          throw error;
        }
      }
    }
    return dirPath;
  },
) {
  public file(filePath: string, content: string) {
    return new File(path.basename(filePath), filePath, content);
  }
}
