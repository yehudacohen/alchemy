import { deleteOrphanedResources } from "./delete";
import { root } from "./stack";

let finalized = false;

/**
 * Explicitly finalize the program by deleting any resources that were dropped from the root stack.
 *
 * By default, this will be called when
 */
export async function finalize(code?: number) {
  if (finalized) {
    return;
  }
  finalized = true;

  await deleteOrphanedResources(root);
}

// Listen for signals or events
process.on("exit", () => finalize(0));
