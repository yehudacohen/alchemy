import { tool } from "ai";
import { exec } from "child_process";
import { promisify } from "util";
import { z } from "zod";

const execAsync = promisify(exec);

export const installDependencies = tool({
  description:
    "Installs dependencies using bun with support for different dependency types (runtime, dev, or peer)",
  parameters: z.object({
    packages: z.array(z.string()).describe("Array of package names to install"),
    type: z
      .enum(["runtime", "dev", "peer"])
      .optional()
      .describe(
        "Type of dependency to install: runtime, dev, or peer. Default 'runtime'.",
      ),
  }),
  execute: async ({ packages, type }) => {
    if (packages.length === 0) {
      throw new Error("No packages specified for installation");
    }

    let command = "bun add";

    // Add appropriate flags based on dependency type
    switch (type) {
      case "dev":
        command += " -D";
        break;
      case "peer":
        command += " --peer";
        break;
      // runtime dependencies don't need a special flag
    }

    // Add packages to the command
    command += " " + packages.join(" ");

    try {
      console.log(`Executing: ${command}`);
      const { stdout, stderr } = await execAsync(command);

      if (stderr) {
        console.warn("Installation warnings:", stderr);
      }

      return {
        success: true,
        command,
        output: stdout,
        packages,
        type,
      };
    } catch (error: any) {
      console.error("Installation failed:", error);
      throw new Error(`Failed to install packages: ${error.message}`);
    }
  },
});
