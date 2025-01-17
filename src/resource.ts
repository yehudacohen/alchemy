import { stage } from "./config";
import type { Input, Output } from "./io";
import { currentStack, type Stack } from "./stack";
import type { State } from "./state";

export interface ResourceContext<Type extends ResourceType> {
  type: Type;
  id: string;
  event: "create" | "update" | "delete";
  stack: Stack;
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  delete<T>(key: string): Promise<T | undefined>;
  /**
   * Indicate that this resource is being replaced.
   * This will cause the resource to be deleted at the end of the stack's CREATE phase.
   */
  replace(): void;
}

export type ResourceType = string;

export type Resource<Type extends ResourceType, Args extends any[], Out> = {
  type: Type;
  delete(
    id: string,
    state: Record<string, any>,
    ...args: {
      [i in keyof Args]: Input<Args[i]>;
    }
  ): Promise<void>;
} & (new (
  id: string,
  ...args: {
    [i in keyof Args]: Input<Args[i]>;
  }
) => Output<Out>);

const resources = new Map<ResourceType, Resource<ResourceType, any[], any>>();

export function getResource<
  const Type extends ResourceType,
  Args extends any[],
  Out,
>(type: Type): Resource<Type, Args, Out> | undefined {
  return resources.get(type) as Resource<Type, Args, Out> | undefined;
}

export function Resource<
  const Type extends ResourceType,
  Args extends any[],
  Out,
>(
  type: Type,
  func: (ctx: ResourceContext<string>, ...args: Args) => Out,
): Resource<Type, Args, Awaited<Out>> {
  if (resources.has(type)) {
    throw new Error(`Resource ${type} already exists`);
  }

  class Resource {
    constructor(id: string, ...args: Args) {
      return new OutputProxy(id);
    }

    static readonly type = type;
    static async apply(id: string, ...args: Args): Promise<Awaited<Out>> {
      const stack = currentStack();

      const state: State = (await stack.state.get(stage, id)) ?? {
        status: "creating",
        data: {},
        output: undefined,
      };
      const event = state.status === "creating" ? "create" : "update";
      state.status = event === "create" ? "creating" : "updating";

      let isReplaced = false;

      const result = await func(
        {
          type,
          id,
          event,
          stack,
          replace: () => {
            if (isReplaced) {
              console.warn(
                `Resource ${type} ${id} is already marked as REPLACE`,
              );
              return;
            }
            isReplaced = true;
            stack.deletions.push({
              id,
              data: {
                ...state.data,
              },
              args,
            });
          },
          get: (key) => state.data[key],
          set: async (key, value) => {
            state.data[key] = value;
            await stack.state.set(stage, id, state);
          },
          delete: async (key) => {
            const value = state.data[key];
            delete state.data[key];
            await stack.state.set(stage, id, state);
            return value;
          },
        },
        ...args,
      );
      await stack.state.set(stage, id, {
        data: state.data,
        status: event === "create" ? "created" : "updated",
        output: result,
      });
      return result;
    }
    static async delete(id: string, state: Record<string, any>, ...args: Args) {
      await func(
        {
          type,
          id,
          event: "delete",
          stack: currentStack(),
          replace() {
            throw new Error("Cannot replace a resource that is being deleted");
          },
          get: (key) => {
            return state.data[key];
          },
          set: async (key, value) => {
            state.data[key] = value;
          },
          delete: async (key) => {
            const value = state.data[key];
            delete state.data[key];
            return value;
          },
        },
        ...args,
      );
    }
  }
  resources.set(type, Resource as any);
  return Resource as any;
}
