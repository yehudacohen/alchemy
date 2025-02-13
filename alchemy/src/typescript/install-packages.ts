import { tool } from "ai";
import { exec } from "child_process";
import { promisify } from "util";
import { z } from "zod";

const execAsync = promisify(exec);

export const installPackages = tool({
  description: "Installs one or more packages using bun add",
  parameters: z.object({
    packages: z.array(z.string()).describe("Array of package names to install"),
    isDev: z
      .boolean()
      .optional()
      .describe("Whether to install as dev dependencies"),
    cwd: z
      .string()
      .optional()
      .describe("Working directory where to run the install command"),
  }),
  execute: async ({ packages, isDev = false, cwd = process.cwd() }) => {
    if (packages.length === 0) {
      throw new Error("No packages specified for installation");
    }

    const command = `bun add ${isDev ? "-D " : ""}${packages.join(" ")}`;

    try {
      console.log(`Running command: ${command}`);
      const { stdout, stderr } = await execAsync(command, { cwd });

      if (stderr) {
        console.error("Installation stderr:", stderr);
      }

      return {
        success: true,
        command,
        output: stdout,
        packages,
        type: isDev ? "dev" : "regular",
      };
    } catch (error: any) {
      console.error("Installation error:", error);
      throw new Error(
        `Failed to install packages: ${error?.message || String(error)}`,
      );
    }
  },
});
