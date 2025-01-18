import type { ResourceID } from "./resource";
import type { StackID } from "./stack";

export type FQN = `${StackID}:${ResourceID}`;

export function fqn(stackId: StackID, resourceId: ResourceID): FQN {
  return `${stackId}:${resourceId}`;
}

export function parseFQN(fqn: FQN): [StackID, ResourceID] {
  const split = fqn.split(":");
  if (split.length !== 2) {
    throw new Error(`Invalid FQN: ${fqn}`);
  }
  return [split[0], split[1]];
}
