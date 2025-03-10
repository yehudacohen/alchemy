import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import * as fs from "fs/promises";
import * as path from "path";
import { apply } from "../../src/apply";
import { createCloudflareApi } from "../../src/cloudflare/api";
import { StaticSite } from "../../src/cloudflare/static-site";
import { destroy } from "../../src/destroy";

// Check that required environment variables are set
const apiKey =
  process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_API_KEY;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;

if (!apiKey) {
  console.warn(
    "Skipping tests: CLOUDFLARE_API_TOKEN or CLOUDFLARE_API_KEY is required",
  );
}

describe("StaticSite Resource", () => {
  const testId = `test-static-site`;
  let tempDir: string;

  // Create temp directory with test files
  beforeAll(async () => {
    // if (!apiKey) return; // Skip setup if no credentials

    tempDir = path.join(".test", `cf-static-site-test`);
    await fs.mkdir(tempDir, { recursive: true });

    // Create index.html
    await fs.writeFile(
      path.join(tempDir, "index.html"),
      "<html><body><h1>Hello World</h1></body></html>",
    );

    // Create styles.css
    await fs.writeFile(
      path.join(tempDir, "styles.css"),
      "body { font-family: Arial, sans-serif; }",
    );

    // Create a subfolder and file
    await fs.mkdir(path.join(tempDir, "js"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "js", "app.js"),
      "console.log('Hello from app.js');",
    );
  });

  // Clean up temp directory
  afterAll(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.warn("Error cleaning up temp directory:", error);
    }
  });

  test("create, verify, and delete static site", async () => {
    // Create a static site
    const site = new StaticSite(testId, {
      name: testId,
      directory: tempDir,
    });

    // Verify site was created by trying to access the Worker
    const api = await createCloudflareApi();
    try {
      // Apply to create the site
      const output = await apply(site, {
        quiet: false,
      });

      expect(output.id).toBeTruthy();
      expect(output.workerId).toBeTruthy(); // Verify worker ID is set
      expect(output.assets.length).toBeGreaterThan(0);
      expect(output.assets).toContain("index.html");
      expect(output.assets).toContain("styles.css");
      expect(output.assets).toContain("js/app.js");

      const getResponse = await api.get(
        `/accounts/${api.accountId}/workers/scripts/${testId}`,
      );
      expect(getResponse.status).toEqual(200);

      // Add a new file to the site for update testing
      // await fs.writeFile(
      //   path.join(tempDir, "new-page.html"),
      //   "<html><body><h1>New Page</h1></body></html>",
      // );

      // site = new StaticSite(testId, {
      //   name: testId,
      //   directory: tempDir,
      // });

      // // Update the site
      // const updateOutput = await apply(site);
      // expect(updateOutput.assets.length).toBeGreaterThan(output.assets.length);
      // expect(updateOutput.assets).toContain("new-page.html");
    } catch (error) {
      console.error("Error updating site:", error);
      throw error;
    } finally {
      // Clean up
      await destroy(site, {
        quiet: false,
      });

      // Verify site was deleted
      const getDeletedResponse = await api.get(
        `/accounts/${api.accountId}/workers/scripts/${testId}`,
      );
      expect(getDeletedResponse.status).toEqual(404);
    }
  });
});
