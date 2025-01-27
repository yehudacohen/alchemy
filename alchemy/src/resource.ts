import { deletions, providers } from "./global";
import type { Inputs } from "./input";
import { Output } from "./output";
import { getScope } from "./scope";
import type { State, StateStore } from "./state";

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
  stage: string;
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

export type Provider<
  Type extends ResourceType = ResourceType,
  In extends any[] = any[],
  Out = any,
> = {
  type: Type;
  update(
    stage: string,
    resource: Resource,
    deps: Set<ResourceID>,
    inputs: Inputs<In>,
    stateStore: StateStore,
  ): Promise<Awaited<Out>>;
  delete(
    stage: string,
    resourceID: ResourceID,
    state: State,
    inputs: Inputs<In>,
  ): Promise<void>;
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
  func: (ctx: Context<Out>, ...args: Args) => Promise<Out | void> | Out | void,
): Provider<Type, Args, Awaited<Out>> {
  if (providers.has(type)) {
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
      const scope = getScope();
      const node = {
        provider: Resource,
        resource: this,
      } as const;

      if (scope.nodes.has(id)) {
        // TODO(sam): do we want to throw?
        // it's kind of awesome that you can re-create a resource and call apply
        // console.warn(`Resource ${id} already exists in the stack: ${stack.id}`);
      }
      scope.nodes.set(id, node as any);

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
      return new Output<Out, U>(this as any, fn);
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
      stage: string,
      resource: Resource,
      deps: Set<ResourceID>,
      inputs: Args,
      stateStore: StateStore,
    ): Promise<Awaited<Out | void>> {
      // const stack = resource[ResourceStack];
      const resourceID = resource[ResourceID];

      let resourceState: State | undefined = await stateStore.get(resourceID);
      if (resourceState === undefined) {
        resourceState = {
          provider: type,
          status: "creating",
          data: {},
          output: undefined,
          deps: [...deps],
          inputs,
        };
        await stateStore.set(resourceID, resourceState);
      }

      // Skip update if inputs haven't changed and resource is in a stable state
      if (
        (resourceState.status === "created" ||
          resourceState.status === "updated") &&
        JSON.stringify(resourceState.inputs) === JSON.stringify(inputs)
      ) {
        console.log(`Skip:    ${resourceID} (no changes)`);
        if (resourceState.output !== undefined) {
          resource[Provide](resourceState.output);
        }
        return resourceState.output;
      }

      const event = resourceState.status === "creating" ? "create" : "update";
      resourceState.status = event === "create" ? "creating" : "updating";
      resourceState.oldInputs = resourceState.inputs;
      resourceState.inputs = inputs;

      console.log(
        `${event === "create" ? "Create" : "Update"}:  ${resourceID}`,
      );

      await stateStore.set(resourceID, resourceState);

      let isReplaced = false;

      const result = await func(
        {
          stage,
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
            await stateStore.set(resourceID, resourceState!);
          },
          delete: async (key) => {
            const value = resourceState!.data[key];
            delete resourceState!.data[key];
            await stateStore.set(resourceID, resourceState!);
            return value;
          },
        },
        ...inputs,
      );

      console.log(
        `${event === "create" ? "Created" : "Updated"}: ${resourceID}`,
      );
      await stateStore.set(resourceID, {
        provider: type,
        data: resourceState.data,
        status: event === "create" ? "created" : "updated",
        output: result,
        inputs,
        deps: [...deps],
      });
      if (result !== undefined) {
        resource[Provide](result);
      }
      return result;
    }

    static async delete(
      stage: string,
      resourceID: ResourceID,
      state: State,
      inputs: Args,
    ) {
      console.log(`Delete:  ${resourceID}`);
      await func(
        {
          stage,
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
      console.log(`Deleted: ${resourceID}`);
    }
  }
  providers.set(type, Resource as any);
  return Resource as any;
}
