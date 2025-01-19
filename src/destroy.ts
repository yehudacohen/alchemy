import { defaultStage, stateStore } from "./global";
import type { Output } from "./output";
import { Provider, ResourceID, isResource } from "./resource";
import type { State } from "./state";

interface DestroyOptions {
  stage?: string;
}

/**
 * Prune all resources from an Output and "down", i.e. that branches from it.
 */
export async function destroy<T>(
  output: Output<T>,
  options?: DestroyOptions,
): Promise<void>;

/**
 * @internal
 */
export async function destroy<T>(
  stage: string,
  resourceID: ResourceID,
  resourceState: State,
  resourceProvider: Provider,
): Promise<void>;

export async function destroy<T>(
  ...args: [Output<T>, DestroyOptions?] | [string, ResourceID, State, Provider]
): Promise<void> {
  let resourceID: ResourceID;
  let resourceState: State;
  let resourceProvider: Provider;
  let stage: string;

  if (args.length === 4) {
    stage = args[0];
    resourceID = args[1];
    resourceState = args[2];
    resourceProvider = args[3];
  } else if (isResource(args[0])) {
    const resource = args[0];
    stage = args[1]?.stage ?? defaultStage;
    resourceID = resource[ResourceID];
    // First destroy all dependencies
    const _resourceState = await stateStore.get(stage, resourceID);
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
    stage,
    resourceID,
    resourceState,
    resourceState.inputs as [],
  );
  await stateStore.delete(stage, resourceID);
}
