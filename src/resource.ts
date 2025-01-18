import { stage } from "./config";
import type { Inputs, Output } from "./io";
import { currentStack, type Stack } from "./stack";
import type { State } from "./state";

export type ResourceID = string;
export const ResourceID = Symbol.for("ResourceID");

export const ResourceInputs = Symbol.for("ResourceInputs");
export const ResourceStack = Symbol.for("ResourceStack");

export type Resource<In extends readonly any[] = any[], Out = any> = {
  [ResourceID]: string;
  [ResourceInputs]: Inputs<In>;
  [ResourceStack]: Stack;
} & Output<Out>;

export type ResourceType = string;

export interface ResourceContext<Type extends ResourceType> {
  type: Type;
  id: ResourceID;
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

export type ResourceProvider<
  Type extends ResourceType,
  In extends any[],
  Out,
> = {
  type: Type;
  apply(stack: Stack, id: string, ...inputs: Inputs<In>): Promise<Awaited<Out>>;
  delete(
    stack: Stack,
    id: string,
    state: Record<string, any>,
    ...inputs: Inputs<In>
  ): Promise<void>;
} & (new (
  id: string,
  ...inputs: Inputs<In>
) => Resource<In, Out>);

export interface ResourceNode {
  stack: Stack;
  provider: ResourceProvider<any, any[], any>;
  inputs: Inputs<any[]>;
}

export function Resource<
  const Type extends ResourceType,
  Args extends any[],
  Out,
>(
  type: Type,
  func: (ctx: ResourceContext<string>, ...args: Args) => Out,
): ResourceProvider<Type, Args, Awaited<Out>> {
  if (getResources().has(type)) {
    throw new Error(`Resource ${type} already exists`);
  }

  class Resource {
    constructor(id: ResourceID, ...input: Inputs<Args>) {
      const stack = currentStack();
      const resources = stack.resources;
      if (resources.has(id)) {
        throw new Error(
          `Resource ${id} already exists in the stack: ${stack.id}`,
        );
      }
      // @ts-expect-error - we have a module initialization circle
      this[Symbol.for("ResourceID")] = id;
      // @ts-expect-error
      this[Symbol.for("ResourceStack")] = stack;
      // @ts-expect-error
      this[Symbol.for("ResourceInputs")] = input;

      resources.set(id, {
        // @ts-expect-error - break the rules
        provider: Resource,
        inputs: input,
        stack,
      });
    }

    static readonly type = type;
    static async apply(
      stack: Stack,
      id: string,
      ...args: Args
    ): Promise<Awaited<Out>> {
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
              inputs: args,
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

    static async delete(
      stack: Stack,
      id: string,
      state: Record<string, any>,
      ...args: Args
    ) {
      await func(
        {
          type,
          id,
          event: "delete",
          stack,
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
  getResources().set(type, Resource as any);
  return Resource as any;
}

type ResourceTypeMap = Map<
  ResourceType,
  ResourceProvider<ResourceType, any[], any>
>;

export function getResources(): ResourceTypeMap {
  const IAC = Symbol.for("IAC");

  return ((global as any)[IAC] ??= new Map<
    ResourceType,
    ResourceProvider<ResourceType, any[], any>
  >());
}

export function getResource(
  type: ResourceType,
): ResourceProvider<ResourceType, any[], any> | undefined {
  return getResources().get(type);
}
