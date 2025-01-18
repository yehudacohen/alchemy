import { AsyncLocalStorage } from "node:async_hooks";
import { config } from "./config";
import { deleteOrphanedResources } from "./delete";
import type { ResourceID, ResourceNode } from "./resource";
import type { StateStore } from "./state";

/**
 * The context for a stack.
 */
export interface Stack {
  id: string;
  state: StateStore;
  resources: Map<ResourceID, ResourceNode>;
  deletions: {
    id: string;
    data: Record<string, any>;
    inputs: any[];
  }[];
}

export const root: Stack = {
  id: "root",
  resources: new Map(),
  deletions: [],
  state: config.state,
};

/**
 * A stack is a scoped context for resources.
 *
 * Useful for when you want to isolate a set of resources from each other.
 */
export async function stack<T>(
  id: string,
  func: (ctx: Stack) => Promise<T>,
  options?: {
    store?: StateStore;
  },
): Promise<T> {
  if (id === "root") {
    // root is reserved for the root context (resources run without a stack)
    throw new Error("Cannot use 'root' as a stack id");
  }
  const ctx: Stack = {
    id,
    resources: new Map(),
    deletions: [],
    state: options?.store ?? config.state,
  };
  const result = await scope.run(ctx, () => func(ctx));
  await deleteOrphanedResources(ctx);
  return result;
}

/**
 * We use async local storage to store the stack context for each
 * constructed resource in a {@link stack} scope.
 */
const scope = new AsyncLocalStorage<Stack>();

/**
 * Get the current stack context.
 *
 * @returns The current stack context.
 */
export function currentStack(): Stack {
  return scope.getStore() ?? root;
}
