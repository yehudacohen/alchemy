import fs from "node:fs";
import path from "node:path";
import { defaultStore, type StateStore } from "./state";

export interface Config {
  stage: string;
  state: StateStore;
}

const iac = path.resolve(process.cwd(), "iac.ts");

let _config: Config | undefined;

if (await fs.promises.exists(iac)) {
  const mod = await import(iac);
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
  stage: process.env.IAC_STAGE ?? process.env.USER ?? "dev",
  state: defaultStore,
};

export const stage = config.stage;

export const state = config.state;

await state.init?.();
