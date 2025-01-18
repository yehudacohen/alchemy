import fs from "node:fs";
import path from "node:path";
import type { Provider, Resource, ResourceID, ResourceType } from "./resource";
import { defaultStore, type StateStore } from "./state";

export interface Config {
  stage: string;
  state: StateStore;
}

const alchemy = path.resolve(process.cwd(), "alchemy.ts");

let _config: Config | undefined;

// Add exists() to fs.promises for older Node versions
if (!fs.promises.exists) {
  fs.promises.exists = async function exists(path: string): Promise<boolean> {
    try {
      await fs.promises.access(path);
      return true;
    } catch {
      return false;
    }
  };
}

if (await fs.promises.exists(alchemy)) {
  const mod = await import(alchemy);
  if (mod) {
    const config = mod.default as Config | undefined;
    if (config) {
      if (typeof config !== "object") {
        throw new Error("Config is not an object");
      }
      if (typeof config.stage !== "string") {
        throw new Error("Config.stage is not a string");
      }
      _config = config;
    }
  }
}

export const config: Config = _config ?? {
  stage: process.env.ALCHEMY_STAGE ?? process.env.USER ?? "dev",
  state: defaultStore,
};

export const stage = config.stage;

export const state = config.state;

export const resources = new Map<ResourceID, ResourceNode>();

export const providers: ResourceTypeMap = new Map<
  ResourceType,
  Provider<ResourceType, any[], any>
>();

export const deletions: {
  id: string;
  data: Record<string, any>;
  inputs: any[];
}[] = [];

await state.init?.();

type ResourceTypeMap = Map<ResourceType, Provider<ResourceType, any[], any>>;

export function getResourceProviders(): ResourceTypeMap {
  return providers;
}

export function getResourceProvider(
  type: ResourceType,
): Provider<ResourceType, any[], any> | undefined {
  return getResourceProviders().get(type);
}

export interface ResourceNode {
  provider: Provider<any, any[], any>;
  resource: Resource<any, any>;
}
