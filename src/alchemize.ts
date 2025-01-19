import { defaultStage, nodes, providers, state } from "./global";

import { evaluate } from "./apply";
import { destroy } from "./destroy";

let finalized = false;

export interface AlchemizeOptions {
  /**
   * Determines whether the resources will be created/updated or delted.
   *
   * @default "up"
   */
  mode?: "up" | "destroy";
  /**
   * Name to scope the resource state under (e.g. `.alchemy/{stage}/..`).
   *
   * @default - your POSIX username
   */
  stage?: string;
  /**
   * If true, will not prune resources that were dropped from the root stack.
   *
   * @default true
   */
  destroyOrphans?: boolean;
}

/**
 * Explicitly finalize the program by deleting any resources that were dropped from the root stack.
 *
 * By default, this will be called when
 */
export async function alchemize(options?: AlchemizeOptions) {
  if (finalized) {
    return;
  }
  finalized = true;

  const stage = options?.stage ?? defaultStage;

  const priorStates = await state.all(stage);
  const priorIDs = Object.keys(priorStates);

  await Promise.allSettled(
    Array.from(nodes.values())
      .reverse()
      .map((node) => evaluate(node.resource)),
  );

  if (options?.destroyOrphans === false) {
    return;
  }

  const aliveIDs = new Set(nodes.keys());

  const orphanIDs = Array.from(priorIDs).filter((id) => !aliveIDs.has(id));

  const orphanStates = Object.fromEntries(
    orphanIDs.map((id) => [id, priorStates[id]] as const),
  );

  // compute a map of resourceID -> upstream dependencies (resources that depend on it)
  const orphanGraph: Record<string, Set<string>> = {};
  for (const [orphanID, orphanState] of Object.entries(orphanStates)) {
    orphanGraph[orphanID] ??= new Set();
    for (const dep of orphanState.deps) {
      (orphanGraph[dep] ??= new Set()).add(orphanID);
    }
  }

  // Track in-progress deletions to avoid duplicate work
  const deletionPromises = new Map<string, Promise<void>>();

  // Start deletion from each orphan that has no upstream dependencies
  await Promise.all(
    orphanIDs
      .filter((id) => orphanGraph[id].size === 0)
      .map((id) => deleteOrphan(id)),
  );

  // Recursively delete orphans in dependency order
  async function deleteOrphan(orphanID: string): Promise<void> {
    // Return existing deletion promise if this orphan is already being deleted
    const existing = deletionPromises.get(orphanID);
    if (existing) {
      return existing;
    }

    // Create promise immediately to prevent race conditions
    let resolve: () => void;
    let reject: (error: any) => void;
    const promise = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    deletionPromises.set(orphanID, promise);

    try {
      // First delete all resources that depend on this one
      const dependents = orphanGraph[orphanID];
      if (dependents.size > 0) {
        await Promise.all(Array.from(dependents).map((id) => deleteOrphan(id)));
      }

      const orphanState = orphanStates[orphanID];
      const providerType = orphanStates[orphanID].provider;
      const provider = providers.get(providerType);
      if (!provider) {
        throw new Error(
          `No provider found for ${providerType}. Did you forget to import it?`,
        );
      }
      // Then delete this resource
      await destroy(stage, orphanID, orphanState, provider);
      delete orphanGraph[orphanID];
      resolve!();
    } catch (error) {
      reject!(error);
    }

    return promise;
  }
}

if (process.env.ALCHEMY_NO_DEPLOY !== "true") {
  // Listen for signals or events
  process.on("exit", () => alchemize());
}
