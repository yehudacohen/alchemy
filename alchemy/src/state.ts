import fs from "node:fs";
import path from "node:path";
import type { Scope } from "./scope";

export interface State {
  status:
    | `creating`
    | `created`
    | `updating`
    | `updated`
    | `deleting`
    | `deleted`;
  provider: string;
  data: Record<string, any>;
  deps: string[];
  inputs: any[];
  oldInputs?: any[];
  output: any;
}

export interface StateStore {
  init?(): Promise<void>;
  /** List all resources in the given stage. */
  list(): Promise<string[]>;
  get(key: string): Promise<State | undefined>;
  getBatch(ids: string[]): Promise<Record<string, State>>;
  all(): Promise<Record<string, State>>;
  set(key: string, value: State): Promise<void>;
  delete(key: string): Promise<void>;
}

const stateFile = path.join(process.cwd(), ".alchemy");

export type StateStoreType = new (stage: string, scope: Scope) => StateStore;

export class FileSystemStateStore implements StateStore {
  constructor(
    public readonly stage: string,
    public readonly scope: Scope,
  ) {}

  async init(): Promise<void> {
    await fs.promises.mkdir(stateFile, { recursive: true });
  }

  async list(): Promise<string[]> {
    try {
      return (await fs.promises.readdir(path.join(stateFile, this.stage))).map(
        (file) => file.replace(/\.json$/, ""),
      );
    } catch (error: any) {
      if (error.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  async get(key: string): Promise<State | undefined> {
    try {
      const content = await fs.promises.readFile(
        await this.getPath(key),
        "utf8",
      );
      return JSON.parse(content) as State;
    } catch (error: any) {
      if (error.code === "ENOENT") {
        return undefined;
      }
      throw error;
    }
  }

  async set(key: string, value: State): Promise<void> {
    return fs.promises.writeFile(
      await this.getPath(key),
      JSON.stringify(value, null, 2),
    );
  }

  async delete(key: string): Promise<void> {
    return fs.promises.unlink(await this.getPath(key));
  }

  async all(): Promise<Record<string, State>> {
    return this.getBatch(await this.list());
  }

  async getBatch(ids: string[]): Promise<Record<string, State>> {
    return Object.fromEntries(
      (
        await Promise.all(
          Array.from(ids).flatMap(async (id) => {
            const s = await this.get(id);
            if (s === undefined) {
              return [] as const;
            }
            return [[id, s]] as const;
          }),
        )
      ).flat(),
    );
  }

  private async getPath(key: string): Promise<string> {
    const file = path.join(stateFile, this.stage, `${key}.json`);
    const dir = path.dirname(file);
    await fs.promises.mkdir(dir, { recursive: true });
    return file;
  }
}
