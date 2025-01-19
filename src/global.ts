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

const exists =
  fs.promises.exists ??
  async function exists(path: string): Promise<boolean> {
    try {
      await fs.promises.access(path);
      return true;
    } catch {
      return false;
    }
  };

if (await exists(alchemy)) {
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

export const defaultStage = config.stage;

export const state = config.state;

export const nodes = new Map<
  ResourceID,
  {
    provider: Provider<any, any[], any>;
    resource: Resource<any, any>;
  }
>();

export const providers = new Map<
  ResourceType,
  Provider<ResourceType, any[], any>
>();

export const deletions: {
  id: string;
  data: Record<string, any>;
  inputs: any[];
}[] = [];

await state.init?.();
