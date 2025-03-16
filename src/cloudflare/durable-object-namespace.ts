import type { WorkerBinding } from "./bindings";

export interface DurableObjectNamespaceInput {
  bindingName: string;
  className: string;
  scriptName?: string | undefined;
  environment?: string | undefined;
  useSqlite?: boolean | undefined;
  namespaceId?: string | undefined;
}

export function isDurableObjectNamespace(
  binding: WorkerBinding,
): binding is DurableObjectNamespace {
  return (
    binding.type === "durable_object_namespace" &&
    typeof (binding as any).bindingName === "string"
  );
}

export class DurableObjectNamespace implements DurableObjectNamespaceInput {
  public readonly type = "durable_object_namespace" as const;
  // alias for bindingName to be consistent with other bindings
  public readonly name: string;
  public readonly bindingName: string;
  public readonly className: string;
  public readonly scriptName?: string | undefined;
  public readonly environment?: string | undefined;
  public readonly useSqlite?: boolean | undefined;
  public readonly namespaceId?: string | undefined;

  constructor(
    public readonly id: string,
    input: DurableObjectNamespaceInput,
  ) {
    this.bindingName = input.bindingName;
    this.name = this.bindingName;
    this.className = input.className;
    this.scriptName = input.scriptName;
    this.environment = input.environment;
    this.useSqlite = input.useSqlite;
  }
}
