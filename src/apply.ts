import { Output } from "./io";
import type { Resource } from "./resource";
import { ResourceID, ResourceStack } from "./resource";

export function apply<Out>(resource: Resource<any, Out>): Promise<Out> {
  const stack = resource[ResourceStack];
  const resourceID = resource[ResourceID];
  const node = stack.resources.get(resourceID);
  if (!node) {
    throw new Error(`Resource ${resourceID} not found in stack: ${stack.id}`);
  }
  const sources = node.inputs.map((input) => Output.sources(input));
  return node.provider.apply(stack, resourceID, ...node.inputs);
}
