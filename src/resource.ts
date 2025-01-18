import {
  deletions,
  getResourceProviders,
  resources,
  stage,
  state,
  type ResourceNode,
} from "./global";
import type { Inputs } from "./input";
import type { Output } from "./output";
import type { State } from "./state";

export type ResourceID = string;
export type ResourceType = string;

export const ResourceID = Symbol.for("ResourceID");
export const Provider = Symbol.for("Provider");
export const Input = Symbol.for("Input");
export const Value = Symbol.for("Value");
export const Apply = Symbol.for("Apply");
export const Provide = Symbol.for("Provide");

// properties that pierce through the Proxy
const OrthogonalProperties = [
  ResourceID,
  Provider,
  Input,
  Value,
  Apply,
  Provide,
] as const;

export type Resource<In extends any[] = any[], Out = any> = {
  [ResourceID]: string;
  [Provider]: Provider<any, any[], any>;
  [Input]: Inputs<In>;
  [Value]?: Out;
  [Apply]: <O>(value: Out) => O;
  [Provide]: (value: Out) => void;
} & Output<Out>;

export type Context<Outputs> = {
  resourceID: ResourceID;
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

export type Provider<Type extends ResourceType, In extends any[], Out> = {
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
): Provider<Type, Args, Awaited<Out>> {
  if (getResourceProviders().has(type)) {
    throw new Error(`Resource ${type} already exists`);
  }

  interface Resource {
    [ResourceID]: ResourceID;
    [Provider]: Provider<Type, Args, Out>;
    [Input]: Inputs<Args>;
    [Value]?: Out;
  }

  class Resource {
    static readonly type = type;

    constructor(id: ResourceID, ...input: Inputs<Args>) {
      const node: ResourceNode = {
        // @ts-expect-error - we know this is a ResourceProvider
        provider: Resource,
        // @ts-expect-error - we know this is a Resource
        resource: this,
      };
      if (resources.has(id)) {
        // TODO(sam): do we want to throw?
        // it's kind of awesome that you can re-create a resource and call apply
        // console.warn(`Resource ${id} already exists in the stack: ${stack.id}`);
      }
      resources.set(id, node);

      this[ResourceID] = id;
      this[Provider] = Resource as any;
      this[Input] = input;
      this[Value] = undefined;
      this[Provide] = (value: Out) => {
        this[Value] = value;
      };

      return new Proxy(this, {
        // TODO(sam): this won't work for the sub-class (class Table extends Resource)
        getPrototypeOf() {
          return Resource.prototype;
        },
        get(target: any, prop) {
          if (OrthogonalProperties.includes(prop as any)) {
            return target[prop];
          } else {
            return target[Apply]((value: Out) => value[prop as keyof Out]);
          }
        },
      });
    }

    public [Apply]<U>(fn: (value: Out) => U): Output<U> {
      // @ts-expect-error - we know we are an "Output"
      return new OutputChain<Out, U>(this, fn);
    }

    private box?: {
      value: Out;
    } = undefined;

    public [Provide](value: Out) {
      if (this.box) {
        throw new Error(`Output ${this[ResourceID]} already has a value`);
      }
      this.box = { value };
      const subscribers = this.subscribers;
      this.subscribers = [];
      subscribers.forEach((fn) => fn(value));
    }

    private subscribers: ((value: Out) => void)[] = [];

    /**
     * @internal
     */
    public subscribe(fn: (value: Out) => Promise<void>) {
      if (this.box) {
        fn(this.box.value);
      } else {
        this.subscribers.push(fn);
      }
    }

    static async update(
      resource: Resource,
      deps: Set<ResourceID>,
      inputs: Args,
    ): Promise<Awaited<Out>> {
      // const stack = resource[ResourceStack];
      const resourceID = resource[ResourceID];
      console.log(`Update:  ${resourceID}`);
      let resourceState: State | undefined = await state.get(stage, resourceID);
      if (resourceState === undefined) {
        resourceState = {
          status: "creating",
          data: {},
          output: undefined,
          deps: [...deps],
          inputs,
        };
        await state.set(stage, resourceID, resourceState);
      }
      const event = resourceState.status === "creating" ? "create" : "update";
      resourceState.status = event === "create" ? "creating" : "updating";
      resourceState.oldInputs = resourceState.inputs;
      resourceState.inputs = inputs;

      await state.set(stage, resourceID, resourceState);

      let isReplaced = false;

      const result = await func(
        {
          resourceID,
          event,
          output: resourceState.output,
          replace: () => {
            if (isReplaced) {
              console.warn(
                `Resource ${type} ${resourceID} is already marked as REPLACE`,
              );
              return;
            }
            isReplaced = true;
            deletions.push({
              id: resourceID,
              data: {
                ...resourceState!.data,
              },
              inputs: inputs,
            });
          },
          get: (key) => resourceState!.data[key],
          set: async (key, value) => {
            resourceState!.data[key] = value;
            await state.set(stage, resourceID, resourceState!);
          },
          delete: async (key) => {
            const value = resourceState!.data[key];
            delete resourceState!.data[key];
            await state.set(stage, resourceID, resourceState!);
            return value;
          },
        },
        ...inputs,
      );
      console.log(`Updated: ${resourceID}`);
      await state.set(stage, resourceID, {
        data: resourceState.data,
        status: event === "create" ? "created" : "updated",
        output: result,
        inputs,
        deps: [...deps],
      });
      resource[Provide](result);
      return result;
    }

    static async delete(resource: Resource, state: State, inputs: Args) {
      const resourceID = resource[ResourceID];
      await func(
        {
          resourceID: resourceID,
          event: "delete",
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
