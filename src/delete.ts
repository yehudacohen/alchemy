import { getResource } from "./resource";
import type { Stack } from "./stack";

/**
 * Delete all resources that have been scheduled for deletion.
 *
 * All deletions are done in parallel. It is the responsibility of the
 * caller to wait for any downstream dependencies to be deleted.
 *
 * TODO(sam): can we delete in dependency order without adding abstractions like pulumi.Output<T>?
 *
 * @param stack - The stack context.
 */
export async function deleteOrphanedResources(stack: Stack) {
  await Promise.allSettled(
    stack.deletions.map(({ id, data, args }) => {
      const resource = getResource(id);
      if (!resource) {
        // TODO(sam): log orphaned resources that cannot be deleted.
        throw new Error("Not Implemented");
      }
      return resource.delete(id, data, ...args);
    }),
  );
}
