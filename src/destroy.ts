import { stage, state } from "./global";
import { Output } from "./output";
import { Provider, ResourceID, isResource } from "./resource";

/**
 * Destroy a resource and its dependencies in reverse dependency order.
 * @param output A sub-graph that produces a resource.
 */
export async function destroy<T>(output: T | Output<T>): Promise<void> {
  if (isResource(output)) {
    const resource = output;
    const resourceID = output[ResourceID];
    // First destroy all dependencies
    const resourceState = await state.get(stage, resourceID);
    if (resourceState === undefined) {
      // we have no record of this resource, we must assume it's already deleted
      return;
    }
    await resource[Provider].delete(
      resource,
      resourceState,
      resourceState.inputs as [],
    );
    await state.delete(stage, resourceID);
  } else if (output instanceof Output) {
  }
}
