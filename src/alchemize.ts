import { apply } from "./apply";

let finalized = false;

/**
 * Explicitly finalize the program by deleting any resources that were dropped from the root stack.
 *
 * By default, this will be called when
 */
export async function alchemize() {
  if (finalized) {
    return;
  }
  finalized = true;

  const { resources } = await import("./global");

  await Promise.all(
    Array.from(resources.values())
      .reverse()
      .map((resource) => apply(resource.resource)),
  );

  // await deleteOrphanedResources(root);
}

if (process.env.ALCHEMY_NO_DEPLOY !== "true") {
  // Listen for signals or events
  process.on("exit", () => alchemize());
}
