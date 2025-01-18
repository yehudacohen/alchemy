import { stage } from "./config";
import { OutputChain, OutputSource, type Output } from "./io";
import {
  ResourceID,
  ResourceProvider,
  ResourceStack,
  isResource,
} from "./resource";

/**
 * Destroy a resource and its dependencies in reverse dependency order.
 * @param output A sub-graph that produces a resource.
 */
export async function destroy<T>(output: T | Output<T>): Promise<void> {
  if (isResource(output)) {
    const resource = output;
    // const resourceFQN = output[ResourceFQN];
    const resourceID = output[ResourceID];
    // First destroy all dependencies
    const stack = resource[ResourceStack];
    const state = await stack.state.get(stage, resourceID);
    if (state === undefined) {
      // we have no record of this resource, we must assume it's already deleted
      return;
    }
    await resource[ResourceProvider].delete(
      resource,
      state,
      state.inputs as [],
    );
    await stack.state.delete(stage, resourceID);
  } else if (output instanceof OutputSource) {
  } else if (output instanceof OutputChain) {
  }
}
