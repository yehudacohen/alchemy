import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { apply } from "../src/apply";
import { Bundle } from "../src/components/esbuild";
import { prune } from "../src/prune";

describe("esbuild", () => {
  describe("Bundle", () => {
    const outputDir = ".output";
    const outputFile = path.join(outputDir, "handler.js");

    test("bundle and cleanup", async () => {
      const bundle = new Bundle("test-bundle", {
        entryPoint: path.join("test", "handler.ts"),
        outdir: outputDir,
        format: "esm",
        platform: "node",
        target: "node18",
      });

      // Apply the bundle
      const output = await apply(bundle);
      expect(output.path).toBe(outputFile);
      expect(output.hash).toBeTruthy();

      // Verify the file exists and contains our code
      expect(fs.existsSync(outputFile)).toBe(true);
      const contents = await fs.promises.readFile(outputFile, "utf-8");
      expect(contents).toContain("Hello from bundled handler");

      // Destroy the bundle
      await prune(bundle);

      // Verify the file is deleted
      expect(fs.existsSync(outputFile)).toBe(false);
    });
  });
});
