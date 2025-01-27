import fs from "node:fs";
import path from "node:path";

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
  list(stage: string): Promise<string[]>;
  get(stage: string, key: string): Promise<State | undefined>;
  getBatch(stage: string, ids: string[]): Promise<Record<string, State>>;
  all(stage: string): Promise<Record<string, State>>;
  set(stage: string, key: string, value: State): Promise<void>;
  delete(stage: string, key: string): Promise<void>;
}

const stateFile = path.join(process.cwd(), ".alchemy");

/**
 * @internal
 */
export const defaultStore: StateStore = {
  async init() {
    await fs.promises.mkdir(stateFile, { recursive: true });
  },
  async list(stage) {
    try {
      return (await fs.promises.readdir(path.join(stateFile, stage))).map(
        (file) => file.replace(/\.json$/, ""),
      );
    } catch (error: any) {
      if (error.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  },
  async get(stage, key) {
    try {
      const content = await fs.promises.readFile(
        await getPath(stage, key),
        "utf8",
      );
      return JSON.parse(content) as State;
    } catch (error: any) {
      if (error.code === "ENOENT") {
        return undefined;
      }
      throw error;
    }
  },
  async set(stage, key, value) {
    return fs.promises.writeFile(
      await getPath(stage, key),
      JSON.stringify(value, null, 2),
    );
  },
  async delete(stage, key) {
    return fs.promises.unlink(await getPath(stage, key));
  },
  async all(stage: string): Promise<Record<string, State>> {
    return this.getBatch(stage, await this.list(stage));
  },
  async getBatch(stage: string, ids: string[]): Promise<Record<string, State>> {
    return Object.fromEntries(
      (
        await Promise.all(
          Array.from(ids).flatMap(async (id) => {
            const s = await this.get(stage, id);
            if (s === undefined) {
              return [] as const;
            }
            return [[id, s]] as const;
          }),
        )
      ).flat(),
    );
  },
};

async function getPath(stage: string, key: string) {
  const file = path.join(stateFile, stage, `${key}.json`);
  const dir = path.dirname(file);
  await fs.promises.mkdir(dir, { recursive: true });
  return file;
}
