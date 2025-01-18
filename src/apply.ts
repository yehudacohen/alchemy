import { OutputChain, OutputSource, type Output } from "./io";
import {
  ResourceID,
  ResourceInput,
  ResourceProvider,
  isResource,
  type Resource,
} from "./resource";

class Evaluated<T> {
  constructor(
    public readonly value: T,
    public readonly deps: string[] = [],
  ) {}
}

const applied = new WeakMap<Resource, Promise<Evaluated<any>>>();

/**
 * Apply a sub-graph to produce a resource.
 * @param output A sub-graph that produces a resource.
 * @returns The resource.
 */
export async function apply<T>(output: T | Output<T>): Promise<Evaluated<T>> {
  if (isResource(output)) {
    const resource = output;
    const resourceID = resource[ResourceID];
    const evaluated = await Promise.all(
      resource[ResourceInput].map(apply<any>),
    );

    if (applied.has(resource)) {
      return await applied.get(resource)!;
    }
    let resolve: (value: Evaluated<any>) => void;
    let reject: (reason?: any) => void;
    const promise = new Promise<Evaluated<any>>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    // set this eagerly to avoid double-apply (caused by recursive applies to inputs)
    applied.set(resource, promise);

    const deps = new Set(evaluated.flatMap((input) => input.deps));
    const inputs = evaluated.map((input) => input.value);
    try {
      const result: T = await resource[ResourceProvider].update(
        resource,
        deps,
        inputs as [],
      );
      resolve!(new Evaluated(result, [resourceID, ...deps]));
    } catch (error) {
      reject!(error);
    }
    return promise;
  } else if (output instanceof OutputSource) {
    return new Promise((resolve, reject) => {
      output.subscribe(async (value) => {
        try {
          const evaluated = await apply(value);
          resolve(
            new Evaluated<T>(evaluated.value, [
              ...evaluated.deps,
              output.resource[ResourceID],
            ]),
          );
        } catch (error) {
          reject(error);
        }
      });
    });
  } else if (output instanceof OutputChain) {
    const parent = await apply(output.parent);
    const ret = output.fn(parent.value);
    // the ret may be an Output (e.g. in the flatMap case), so we need to evaluate it and include its deps
    const evaluated = await apply(ret);
    return new Evaluated<T>(evaluated.value, [
      ...parent.deps,
      ...evaluated.deps,
    ]);
  } else {
    // Handle arrays and objects recursively
    if (Array.isArray(output)) {
      const evaluatedItems = await Promise.all(
        output.map((item) => apply(item)),
      );
      return new Evaluated(
        evaluatedItems.map((e) => e.value) as unknown as T,
        evaluatedItems.flatMap((e) => e.deps),
      );
    } else if (output && typeof output === "object") {
      const entries = Object.entries(output);
      const evaluatedEntries = await Promise.all(
        entries.map(async ([key, value]) => [key, await apply(value)] as const),
      );

      const result = Object.fromEntries(
        evaluatedEntries.map(([key, evaluated]) => [key, evaluated.value]),
      ) as unknown as T;

      const deps = evaluatedEntries.flatMap(([_, evaluated]) => evaluated.deps);

      return new Evaluated(result, deps);
    }

    // Base case: primitive value
    return new Evaluated<T>(output as T);
  }
}
