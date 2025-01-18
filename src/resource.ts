import { stage } from "./config";
import type { FQN } from "./fqn";
import { Output, type Inputs } from "./io";
import { currentStack, type Stack } from "./stack";
import type { State } from "./state";

export type ResourceID = string;
export type ResourceType = string;

export const ResourceID = Symbol.for("ResourceID");
export const ResourceFQN = Symbol.for("ResourceFQN");
export const ResourceProvider = Symbol.for("ResourceProvider");
export const ResourceType = Symbol.for("ResourceType");
export const ResourceInput = Symbol.for("ResourceInput");
export const ResourceStack = Symbol.for("ResourceStack");
export const ResourceOutput = Symbol.for("ResourceOutput");

export type Resource<In extends any[] = any[], Out = any> = {
  [ResourceFQN]: FQN;
  [ResourceID]: string;
  [ResourceProvider]: ResourceProvider<any, any[], any>;
  [ResourceType]: ResourceType;
  [ResourceStack]: Stack;
  [ResourceInput]: Inputs<In>;
  [ResourceOutput]: Output<Out>;
} & Output<Out>;

export type Context<Outputs> = {
  resourceID: ResourceID;
  stack: Stack;
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  delete<T>(key: string): Promise<T | undefined>;
  /**
   * Indicate that this resource is being replaced.
   * This will cause the resource to be deleted at the end of the stack's CREATE phase.
   */
  replace(): void;
} & (
  | {
      event: "create";
    }
  | {
      event: "update" | "delete";
      output: Outputs;
    }
);

export type ResourceProvider<
  Type extends ResourceType,
  In extends any[],
  Out,
> = {
  type: Type;
  update(
    resource: Resource,
    deps: Set<ResourceID>,
    inputs: Inputs<In>,
  ): Promise<Awaited<Out>>;
  delete(resource: Resource, state: State, inputs: Inputs<In>): Promise<void>;
} & (new (
  id: string,
  ...inputs: Inputs<In>
) => Resource<In, Out>);

export function isResource(value: any): value is Resource {
  return value?.[ResourceID] !== undefined;
}

export function Resource<
  const Type extends ResourceType,
  Args extends any[],
  Out,
>(
  type: Type,
  func: (ctx: Context<Out>, ...args: Args) => Promise<Out> | Out,
): ResourceProvider<Type, Args, Awaited<Out>> {
  if (getResourceProviders().has(type)) {
    throw new Error(`Resource ${type} already exists`);
  }

  interface Resource {
    [ResourceFQN]: FQN;
    [ResourceID]: ResourceID;
    [ResourceProvider]: ResourceProvider<Type, Args, Out>;
    [ResourceType]: Type;
    [ResourceStack]: Stack;
    [ResourceInput]: Inputs<Args>;
    [ResourceOutput]: Output<Out>;
  }

  class Resource {
    static readonly type = type;

    constructor(id: ResourceID, ...input: Inputs<Args>) {
      const stack = currentStack();
      const fqn = `${stack.id}:${id}` as const;
      const node: ResourceNode = {
        // @ts-expect-error - we know this is a ResourceProvider
        provider: Resource,
        // @ts-expect-error - we know this is a Resource
        resource: this,
      };
      if (stack.resources.has(id)) {
        // TODO(sam): do we want to throw?
        // it's kind of awesome that you can re-create a resource and call apply
        // console.warn(`Resource ${id} already exists in the stack: ${stack.id}`);
      }
      stack.resources.set(id, node);

      const output = Output.source<Out>(this as any);

      this[ResourceFQN] = fqn;
      this[ResourceID] = id;
      this[ResourceProvider] = Resource as any;
      this[ResourceType] = type;
      this[ResourceStack] = stack;
      this[ResourceInput] = input;
      this[ResourceOutput] = output;

      return new Proxy(this, {
        // TODO(sam): this won't work for the sub-class (class Table extends Resource)
        getPrototypeOf() {
          return Resource.prototype;
        },
        get(target: any, prop) {
          if (prop in target) {
            return target[prop];
          } else if (prop === "apply") {
            return output.apply;
          } else {
            return output.apply((value) => value[prop as keyof Out]);
          }
        },
      });
    }

    static async update(
      resource: Resource,
      deps: Set<ResourceID>,
      inputs: Args,
    ): Promise<Awaited<Out>> {
      const stack = resource[ResourceStack];
      const resourceID = resource[ResourceID];
      let state: State | undefined = await stack.state.get(stage, resourceID);
      if (state === undefined) {
        state = {
          status: "creating",
          data: {},
          output: undefined,
          deps: [...deps],
          inputs,
        };
        await stack.state.set(stage, resourceID, state);
      }
      const event = state.status === "creating" ? "create" : "update";
      state.status = event === "create" ? "creating" : "updating";
      state.oldInputs = state.inputs;
      state.inputs = inputs;

      await stack.state.set(stage, resourceID, state);

      let isReplaced = false;

      const result = await func(
        {
          resourceID,
          event,
          stack,
          output: state.output,
          replace: () => {
            if (isReplaced) {
              console.warn(
                `Resource ${type} ${resourceID} is already marked as REPLACE`,
              );
              return;
            }
            isReplaced = true;
            stack.deletions.push({
              id: resourceID,
              data: {
                ...state!.data,
              },
              inputs: inputs,
            });
          },
          get: (key) => state!.data[key],
          set: async (key, value) => {
            state!.data[key] = value;
            await stack.state.set(stage, resourceID, state!);
          },
          delete: async (key) => {
            const value = state!.data[key];
            delete state!.data[key];
            await stack.state.set(stage, resourceID, state!);
            return value;
          },
        },
        ...inputs,
      );
      await stack.state.set(stage, resourceID, {
        data: state.data,
        status: event === "create" ? "created" : "updated",
        output: result,
        inputs,
        deps: [...deps],
      });
      return result;
    }

    static async delete(resource: Resource, state: State, inputs: Args) {
      const stack = resource[ResourceStack];
      const resourceID = resource[ResourceID];
      await func(
        {
          resourceID: resourceID,
          event: "delete",
          stack,
          output: state.output,
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
        ...inputs,
      );
    }
  }
  getResourceProviders().set(type, Resource as any);
  return Resource as any;
}

type ResourceTypeMap = Map<
  ResourceType,
  ResourceProvider<ResourceType, any[], any>
>;

export function getResourceProviders(): ResourceTypeMap {
  const IAC = Symbol.for("IAC::ResourceProviders");

  return ((global as any)[IAC] ??= new Map<
    ResourceType,
    ResourceProvider<ResourceType, any[], any>
  >());
}

export function getResourceProvider(
  type: ResourceType,
): ResourceProvider<ResourceType, any[], any> | undefined {
  return getResourceProviders().get(type);
}

export interface ResourceNode {
  stack: Stack;
  provider: ResourceProvider<any, any[], any>;
  resource: Resource<any, any>;
}
