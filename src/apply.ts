import { OutputChain, OutputSource, type Output } from "./io";
import {
  ResourceID,
  ResourceInput,
  ResourceProvider,
  isResource,
} from "./resource";

class Evaluated<T> {
  constructor(
    public readonly value: T,
    public readonly deps: string[] = [],
  ) {}
}

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

    const deps = new Set(evaluated.flatMap((input) => input.deps));
    const inputs = evaluated.map((input) => input.value);
    const result: T = await resource[ResourceProvider].update(
      resource,
      deps,
      inputs as [],
    );
    return new Evaluated(result, [resourceID, ...deps]);
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
    return new Evaluated<T>(output as T);
  }
}
