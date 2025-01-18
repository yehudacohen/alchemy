import { OutputChain, OutputSource, type Output } from "./io";
import { ResourceInput, ResourceProvider, isResource } from "./resource";

/**
 * Apply a sub-graph to produce a resource.
 * @param output A sub-graph that produces a resource.
 * @returns The resource.
 */
export async function apply<Out>(output: Output<Out>): Promise<Out> {
  if (isResource(output)) {
    const inputs = await Promise.all(output[ResourceInput].map(apply));
    // @ts-expect-error - update is thought to have empty inputs
    return output[ResourceProvider].update(output, ...inputs);
  } else if (output instanceof OutputSource) {
    return apply(output.resource);
  } else if (output instanceof OutputChain) {
    return output.fn(await apply(output.parent));
  } else {
    return output as Out;
  }
}
