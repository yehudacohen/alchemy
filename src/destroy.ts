import { stage, state } from "./global";
import type { Output } from "./output";
import { Provider, ResourceID, isResource } from "./resource";
import type { State } from "./state";

/**
 * Prune all resources from an Output and "down", i.e. that branches from it.
 */
export async function destroy<T>(output: Output<T>): Promise<void>;

export async function destroy<T>(
  resourceID: ResourceID,
  resourceState: State,
  resourceProvider: Provider,
): Promise<void>;

export async function destroy<T>(
  ...args: [Output<T>] | [ResourceID, State, Provider]
): Promise<void> {
  let resourceID: ResourceID;
  let resourceState: State;
  let resourceProvider: Provider;

  if (args.length === 3) {
    resourceID = args[0];
    resourceState = args[1];
    resourceProvider = args[2];
  } else if (isResource(args[0])) {
    const resource = args[0];
    resourceID = resource[ResourceID];
    // First destroy all dependencies
    const _resourceState = await state.get(stage, resourceID);
    if (_resourceState === undefined) {
      // we have no record of this resource, we must assume it's already deleted
      return;
    }
    resourceState = _resourceState;
    resourceProvider = resource[Provider];
  } else {
    throw new Error("Not implemented: must handle destroy a Output chain");
  }
  await resourceProvider.delete(
    resourceID,
    resourceState,
    resourceState.inputs as [],
  );
  await state.delete(stage, resourceID);
}
