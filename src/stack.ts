import { AsyncLocalStorage } from "node:async_hooks";
import { config } from "./config";
import type { ResourceID, ResourceNode } from "./resource";
import type { StateStore } from "./state";

export type StackID = string;

/**
 * The context for a stack.
 */
export interface Stack<T = any> {
  id: StackID;
  state: StateStore;
  resources: Map<ResourceID, ResourceNode>;
  deletions: {
    id: string;
    data: Record<string, any>;
    inputs: any[];
  }[];
  func?: (ctx: StackContext) => Promise<T>;
}

export const root: Stack<never> = {
  id: "root",
  resources: new Map(),
  deletions: [],
  state: config.state,
};

export interface StackContext {
  id: string;
}

/**
 * A stack is a scoped context for resources.
 *
 * Useful for when you want to isolate a set of resources from each other.
 */
export function stack<T>(
  id: string,
  func: (ctx: StackContext) => Promise<T>,
  options?: {
    store?: StateStore;
  },
): Stack<T> {
  if (id === "root") {
    // root is reserved for the root context (resources run without a stack)
    throw new Error("Cannot use 'root' as a stack id");
  }
  if (getStack(id)) {
    throw new Error(`Stack ${id} already exists`);
  }
  const stack: Stack<T> = {
    id,
    resources: new Map(),
    deletions: [],
    state: options?.store ?? config.state,
    func,
  };
  getStacks().set(id, stack);
  return stack;
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

export type StackMap = Map<string, Stack>;

export function getStacks(): StackMap {
  const IAC = Symbol.for("IAC::Stacks");
  return ((global as any)[IAC] ??= new Map<string, Stack>());
}

export function getStack(id: string): Stack | undefined {
  return getStacks().get(id) ?? root;
}
