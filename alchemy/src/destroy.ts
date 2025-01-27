import { defaultStage, defaultStateStore } from "./global";
import type { Output } from "./output";
import { Provider, ResourceID, isResource } from "./resource";
import { type Scope, getScope } from "./scope";
import type { State, StateStore } from "./state";

interface DestroyOptions {
  stage?: string;
  stateStore?: StateStore;
  scope?: Scope;
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
  stateStore: StateStore,
): Promise<void>;

export async function destroy<T>(
  ...args:
    | [Output<T>, DestroyOptions?]
    | [string, ResourceID, State, Provider, StateStore]
): Promise<void> {
  let resourceID: ResourceID;
  let resourceState: State;
  let resourceProvider: Provider;
  let stage: string;
  let stateStore: StateStore;
  if (args.length === 5) {
    stage = args[0];
    resourceID = args[1];
    resourceState = args[2];
    resourceProvider = args[3];
    stateStore = args[4];
  } else if (isResource(args[0])) {
    const resource = args[0];
    // stage = args[1]?.stage ?? defaultStage;
    resourceID = resource[ResourceID];
    stage = args[1]?.stage ?? defaultStage;
    const scope = args[1]?.scope ?? getScope();
    stateStore = args[1]?.stateStore ?? new defaultStateStore(stage, scope);
    // First destroy all dependencies
    const _resourceState = await stateStore.get(resourceID);
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
  await stateStore.delete(resourceID);
}
