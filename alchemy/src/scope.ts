import { AsyncLocalStorage } from "node:async_hooks";
import path from "node:path";
import { rootScope } from "./global";
import type { Provider, Resource, ResourceID } from "./resource";

const scopeGlobal = new Map<string | null, Scope>();

const scopeStorage = new AsyncLocalStorage<Scope>();

export class Scope {
  public readonly nodes = new Map<
    ResourceID,
    {
      provider: Provider<any, any[], any>;
      resource: Resource<any, any>;
    }
  >();

  constructor(
    public readonly scopeName: string | null = null,
    public readonly parent: Scope | undefined = undefined,
  ) {}

  public getScopePath(root: string): string {
    if (this.scopeName) {
      return path.join(root, this.scopeName);
    }
    return root;
  }
}

export function getScope(): Scope {
  return scopeStorage.getStore() ?? rootScope;
}

export function withScope<T>(
  scope: Scope,
  fn: () => T | Promise<T>,
): Promise<T> {
  return scopeStorage.run(scope, async () => {
    try {
      return await fn();
    } catch (error) {
      throw new Error(`Error in scope ${scope.scopeName}: ${error}`);
    }
  });
}

export function pushScope<T>(
  parent: Scope,
  scopeName: string,
  fn: () => T | Promise<T>,
): Promise<T> {
  const newScope = new Scope(scopeName, parent);
  return withScope(newScope, fn);
}
