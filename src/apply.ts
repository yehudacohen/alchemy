import { OutputChain, OutputSource, type Output } from "./io";
import {
  ResourceFQN,
  ResourceInput,
  ResourceOutput,
  ResourceProvider,
  isResource,
} from "./resource";

/**
 * Apply a sub-graph to produce a resource.
 * @param output A sub-graph that produces a resource.
 * @returns The resource.
 */
export async function apply<Out>(output: Output<Out>): Promise<Out> {
  if (isResource(output)) {
    const evaluated = await Promise.all(
      output[ResourceInput].map(evaluate<any>),
    );
    const deps = new Set(evaluated.flatMap((input) => input.deps));
    const inputs = evaluated.map((input) => input.value);
    // @ts-expect-error - update is thought to have empty inputs
    return output[ResourceProvider].update(output, deps, ...inputs);
  } else if (output instanceof OutputSource) {
    return apply(output.resource);
  } else if (output instanceof OutputChain) {
    return output.fn(await apply(output.parent));
  } else {
    return output as Out;
  }
}

export async function evaluate<T>(
  output: T | Output<T>,
): Promise<Evaluated<T>> {
  if (isResource(output)) {
    return evaluate(output[ResourceOutput]);
  } else if (output instanceof OutputSource) {
    return new Promise((resolve) => {
      output.subscribe(async (value) => {
        const evaluated = await evaluate(value);
        resolve(
          new Evaluated<T>(
            evaluated.value,
            // TODO: immutable set that is m log(n) to merge m elements into a set size n
            new Set([...evaluated.deps, output.resource[ResourceFQN]]),
          ),
        );
      });
    });
  } else if (output instanceof OutputChain) {
    const parent = await evaluate(output.parent);
    const ret = output.fn(parent.value);
    // the ret may be an Output (e.g. in the flatMap case), so we need to evaluate it and include its deps
    const evaluated = await evaluate(ret);

    return new Evaluated<T>(
      evaluated.value,
      new Set([...parent.deps, ...evaluated.deps]),
    );
  } else {
    return new Evaluated<T>(output as T);
  }
}

class Evaluated<T> {
  constructor(
    public readonly value: T,
    public readonly deps: Set<string> = new Set(),
  ) {}
}
