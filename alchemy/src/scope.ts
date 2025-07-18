import { AsyncLocalStorage } from "node:async_hooks";
import util from "node:util";
import type { Phase } from "./alchemy.ts";
import { destroy, destroyAll } from "./destroy.ts";
import {
  ResourceFQN,
  ResourceID,
  ResourceKind,
  ResourceScope,
  ResourceSeq,
  type PendingResource,
  type Resource,
  type ResourceProps,
} from "./resource.ts";
import type { State, StateStore, StateStoreType } from "./state.ts";
import { D1StateStore } from "./state/d1-state-store.ts";
import { FileSystemStateStore } from "./state/file-system-state-store.ts";
import {
  createDummyLogger,
  createLoggerInstance,
  type LoggerApi,
} from "./util/cli.ts";
import { logger } from "./util/logger.ts";
import { AsyncMutex } from "./util/mutex.ts";
import type { ITelemetryClient } from "./util/telemetry/client.ts";

export class RootScopeStateAttemptError extends Error {
  constructor() {
    super("Root scope cannot contain state");
  }
}

export interface ScopeOptions {
  stage?: string;
  parent: Scope | undefined;
  scopeName: string;
  password?: string;
  stateStore?: StateStoreType;
  quiet?: boolean;
  phase?: Phase;
  dev?: "prefer-local" | "prefer-remote";
  telemetryClient?: ITelemetryClient;
  logger?: LoggerApi;
}

export type ScopeOptionsWithMetadata = ScopeOptions & Record<string, any>;

export type PendingDeletions = Array<{
  resource: Resource<string>;
  oldProps?: ResourceProps;
}>;

// TODO: support browser
export const DEFAULT_STAGE =
  process.env.ALCHEMY_STAGE ??
  process.env.USER ??
  process.env.USERNAME ??
  "dev";

declare global {
  var __ALCHEMY_STORAGE__: AsyncLocalStorage<Scope>;
  var __ALCHEMY_GLOBALS__: Scope[];
}

const ScopeSymbol = Symbol.for("alchemy::Scope");

export function isScope(value: any): value is Scope {
  return value instanceof Scope || value?.[ScopeSymbol] === true;
}

export class Scope {
  readonly [ScopeSymbol] = true;

  public static readonly KIND = "alchemy::Scope" as const;

  public static storage = (globalThis.__ALCHEMY_STORAGE__ ??=
    new AsyncLocalStorage<Scope>());
  public static globals: Scope[] = (globalThis.__ALCHEMY_GLOBALS__ ??= []);

  public static getScope(): Scope | undefined {
    const scope = Scope.storage.getStore();
    if (!scope) {
      if (Scope.globals.length > 0) {
        return Scope.globals[Scope.globals.length - 1];
      }
      return undefined;
    }
    return scope;
  }

  public static get root(): Scope {
    return Scope.current.root;
  }

  public static get current(): Scope {
    const scope = Scope.getScope();
    if (!scope) throw new Error("Not running within an Alchemy Scope");
    return scope;
  }

  public readonly resources = new Map<ResourceID, PendingResource>();
  public readonly children: Map<ResourceID, Scope> = new Map();
  public readonly stage: string;
  public readonly name: string;
  public readonly scopeName: string;
  public readonly parent: Scope | undefined;
  public readonly password: string | undefined;
  public readonly state: StateStore;
  public readonly stateStore: StateStoreType;
  public readonly quiet: boolean;
  public readonly phase: Phase;
  public readonly dev?: "prefer-local" | "prefer-remote";
  public readonly logger: LoggerApi;
  public readonly telemetryClient: ITelemetryClient;
  public readonly dataMutex: AsyncMutex;
  public readonly metadata: Record<string, any>;

  private isErrored = false;
  private finalized = false;
  private startedAt = performance.now();

  private deferred: (() => Promise<any>)[] = [];

  public get appName(): string {
    if (this.parent) {
      return this.parent.appName;
    }
    return this.scopeName;
  }

  constructor(options: ScopeOptionsWithMetadata) {
    // Extract known properties and store remaining properties as metadata
    const {
      scopeName,
      parent,
      stage,
      password,
      stateStore,
      quiet,
      phase,
      dev,
      telemetryClient,
      logger,
      ...metadata
    } = options;

    this.scopeName = scopeName;
    this.name = this.scopeName;
    this.parent = parent ?? Scope.getScope();
    this.metadata = metadata;

    const isChild = this.parent !== undefined;
    if (this.scopeName?.includes(":") && isChild) {
      // TODO(sam): relax this constraint once we move to SQLite3 store
      throw new Error(
        `Scope name "${this.scopeName}" cannot contain double colons`,
      );
    }

    this.stage = stage ?? this.parent?.stage ?? DEFAULT_STAGE;
    this.parent?.children.set(this.scopeName!, this);
    this.quiet = quiet ?? this.parent?.quiet ?? false;
    if (this.parent && !this.scopeName) {
      throw new Error("Scope name is required when creating a child scope");
    }
    this.password = password ?? this.parent?.password;
    const resolvedPhase = phase ?? this.parent?.phase;
    if (resolvedPhase === undefined) {
      throw new Error("Phase is required");
    }
    this.phase = resolvedPhase;

    this.logger = this.quiet
      ? createDummyLogger()
      : createLoggerInstance(
          {
            phase: this.phase,
            stage: this.stage,
            appName: this.appName ?? "",
          },
          logger,
        );

    this.dev = dev ?? this.parent?.dev;

    if (this.dev) {
      this.logger.warnOnce(
        "Development mode is in beta. Please report any issues to https://github.com/sam-goodwin/alchemy/issues.",
      );
    }

    this.stateStore =
      stateStore ?? this.parent?.stateStore ?? defaultStateStore;
    this.state = this.stateStore(this);
    if (!telemetryClient && !this.parent?.telemetryClient) {
      throw new Error("Telemetry client is required");
    }
    this.telemetryClient = telemetryClient ?? this.parent?.telemetryClient!;
    this.dataMutex = new AsyncMutex();
  }

  public get root(): Scope {
    let root: Scope = this;
    while (root.parent) {
      root = root.parent;
    }
    return root;
  }

  public async deleteResource(resourceID: ResourceID) {
    await this.state.delete(resourceID);
    this.resources.delete(resourceID);
  }

  private _seq = 0;

  public seq() {
    return this._seq++;
  }

  public get chain(): string[] {
    // Since the root scope name is the same as the app name, this ensures
    // the root scope chain is "<app-name>" instead of "<app-name>/<app-name>".
    if (
      !this.parent &&
      this.appName &&
      this.scopeName &&
      this.appName === this.scopeName
    ) {
      return [this.appName];
    }

    const thisScope = this.scopeName ? [this.scopeName] : [];
    if (this.parent) {
      return [...this.parent.chain, ...thisScope];
    }

    const app = this.appName ? [this.appName] : [];
    return [...app, ...thisScope];
  }

  public fail() {
    this.logger.error("Scope failed", this.chain.join("/"));
    this.isErrored = true;
  }

  public async init() {
    await Promise.all([
      this.state.init?.(),
      this.telemetryClient.ready.catch((error) => {
        this.logger.warn("Telemetry initialization failed:", error);
      }),
    ]);
  }

  public async deinit() {
    await this.parent?.state.delete(this.scopeName!);
    await this.state.deinit?.();
  }

  public fqn(resourceID: ResourceID): string {
    return [...this.chain, resourceID].join("/");
  }

  /**
   * Centralizes the "lock → locate the right scope → hand the caller a live
   * ScopeState instance and a persist() helper".
   *
   * @param fn   Your operation on the scope state.
   *             • `state` is already resolved and, if we're at the root, created.
   *             • `persist` will write the (possibly-mutated) state back.
   */
  private async withScopeState<R>(
    fn: (
      state: State<string, ResourceProps | undefined, Resource<string>>, // current state for this.scopeName
      persist: (
        next: State<string, ResourceProps | undefined, Resource<string>>,
      ) => Promise<void>, // helper to save changes
    ) => Promise<R>,
  ): Promise<R> {
    return this.dataMutex.lock(async () => {
      // 1. We must know where to look.
      if (!this.parent || !this.scopeName) {
        throw new RootScopeStateAttemptError();
      }

      // 2. Pull (or lazily create) the state bucket we care about.
      const isRoot = this.parent.scopeName === this.root.scopeName;
      const state =
        (await this.parent.state.get(this.scopeName)) ??
        (isRoot
          ? {
              //todo(michael): should this have a different type cause its root?
              kind: "alchemy::Scope",
              id: this.scopeName!,
              fqn: this.root.fqn(this.scopeName!),
              seq: this.seq(),
              status: "created",
              data: {},
              output: {
                [ResourceID]: this.scopeName!,
                [ResourceFQN]: this.root.fqn(this.scopeName!),
                [ResourceKind]: "alchemy::Scope",
                [ResourceScope]: this,
                [ResourceSeq]: this.seq(),
              },
              props: {},
            }
          : undefined);

      if (!state) throw new RootScopeStateAttemptError();

      return fn(state, (updated) =>
        this.parent!.state.set(this.scopeName!, updated),
      );
    });
  }

  public async set<T>(key: string, value: T): Promise<void> {
    return this.withScopeState<void>(async (state, persist) => {
      state.data[key] = value;
      await persist(state); // only one line to save!
    });
  }

  public async get<T>(key: string): Promise<T> {
    return this.withScopeState<T>(async (state) => state.data[key]);
  }

  public async delete(key: string): Promise<void> {
    return this.withScopeState<void>(async (state, persist) => {
      delete state.data[key];
      await persist(state);
    });
  }

  public async run<T>(fn: (scope: Scope) => Promise<T>): Promise<T> {
    return Scope.storage.run(this, () => fn(this));
  }

  [util.inspect.custom]() {
    return `Scope(${this.chain.join("/")})`;
  }

  [Symbol.asyncDispose]() {
    return this.finalize();
  }

  /**
   * The telemetry client for the root scope.
   * This is used so that app-level hooks are only called once.
   */
  private get rootTelemetryClient(): ITelemetryClient | null {
    if (!this.parent) {
      return this.telemetryClient;
    }
    return null;
  }

  public async finalize(force?: boolean) {
    const shouldForce =
      force ||
      this.parent === undefined ||
      this?.parent?.scopeName === this.root.scopeName;
    if (this.phase === "read") {
      this.rootTelemetryClient?.record({
        event: "app.success",
        elapsed: performance.now() - this.startedAt,
      });
      return;
    }
    if (this.finalized && !shouldForce) {
      return;
    }
    if (this.parent === undefined && Scope.globals.length > 0) {
      const last = Scope.globals.pop();
      if (last !== this) {
        throw new Error(
          "Running in AsyncLocaStorage.enterWith emulation mode and attempted to finalize a global Scope that wasn't top of the stack",
        );
      }
    }
    this.finalized = true;
    // trigger and await all deferred promises
    await Promise.all(this.deferred.map((fn) => fn()));
    if (!this.isErrored) {
      // TODO: need to detect if it is in error
      const resourceIds = await this.state.list();
      const aliveIds = new Set(this.resources.keys());
      const orphanIds = Array.from(
        resourceIds.filter((id) => !aliveIds.has(id)),
      );

      if (shouldForce) {
        await this.destroyPendingDeletions();
        await Promise.all(
          Array.from(this.children.values()).map((child) =>
            child.finalize(shouldForce),
          ),
        );
      }

      const orphans = await Promise.all(
        orphanIds.map(async (id) => (await this.state.get(id))!.output),
      ).then((orphans) =>
        orphans.filter(
          (orphan) =>
            //we never want to mark the stage scope as an orphan
            !(
              orphan[ResourceKind] === "alchemy::Scope" &&
              orphan[ResourceFQN] === this.root.fqn(this.stage)
            ),
        ),
      );
      await destroyAll(orphans, {
        quiet: this.quiet,
        strategy: "sequential",
        force: shouldForce,
      });
      this.rootTelemetryClient?.record({
        event: "app.success",
        elapsed: performance.now() - this.startedAt,
      });
    } else {
      this.logger.warn("Scope is in error, skipping finalize");
      this.rootTelemetryClient?.record({
        event: "app.error",
        error: new Error("Scope failed"),
        elapsed: performance.now() - this.startedAt,
      });
    }

    await this.rootTelemetryClient?.finalize()?.catch((error) => {
      this.logger.warn("Telemetry finalization failed:", error);
    });
  }

  public async destroyPendingDeletions() {
    const pendingDeletions =
      (await this.get<PendingDeletions>("pendingDeletions").catch((e) => {
        if (e instanceof RootScopeStateAttemptError) {
          return [];
        }
        throw e;
      })) ?? [];
    //todo(michael): remove once we deprecate doss; see: https://github.com/sam-goodwin/alchemy/issues/585
    let hasCorruptedResources = false;
    if (pendingDeletions) {
      for (const { resource, oldProps } of pendingDeletions) {
        //todo(michael): ugly hack due to the way scope is serialized
        const realResource = this.resources.get(resource[ResourceID])!;
        resource[ResourceScope] = realResource?.[ResourceScope] ?? this;
        if (realResource == null && resource[ResourceID] == null) {
          logger.warn(
            "A replaced resource pending deletion is corrupted and will NOT be deleted. This is likely a bug with the state store.",
          );
          hasCorruptedResources = true;
          continue;
        }
        await destroy(resource, {
          quiet: this.quiet,
          strategy: "sequential",
          replace: {
            props: oldProps,
            output: resource,
          },
        });
      }
    }
    if (hasCorruptedResources) {
      const newPendingDeletions =
        (await this.get<PendingDeletions>("pendingDeletions").catch(
          () => [],
        )) ?? [];
      await this.set(
        "pendingDeletions",
        newPendingDeletions.filter((d) => d.resource[ResourceID] != null),
      );
    }
  }

  /**
   * Defers execution of a function until the Alchemy application finalizes.
   */
  public defer<T>(fn: () => Promise<T>): Promise<T> {
    let _resolve: (value: T) => void;
    let _reject: (reason?: any) => void;
    const promise = new Promise<T>((resolve, reject) => {
      _resolve = resolve;
      _reject = reject;
    });
    this.deferred.push(() => {
      if (!this.finalized) {
        throw new Error(
          "Attempted to await a deferred Promise before finalization",
        );
      }
      // lazily trigger the worker on first await
      return this.run(() => fn()).then(_resolve, _reject);
    });
    return promise;
  }

  /**
   * Returns a string representation of the scope.
   */
  public toString() {
    return `Scope(
  chain=${this.chain.join("/")},
  resources=[${Array.from(this.resources.values())
    .map((r) => r[ResourceID])
    .join(",\n  ")}]
)`;
  }
}

const defaultStateStore: StateStoreType = (scope: Scope) => {
  switch (process.env.ALCHEMY_STATE_STORE) {
    case "d1":
      return new D1StateStore(scope);
    default:
      return new FileSystemStateStore(scope);
  }
};

declare global {
  // for runtime
  // TODO(sam): maybe inject is a better way to achieve this
  var __ALCHEMY_SCOPE__: typeof Scope;
}

globalThis.__ALCHEMY_SCOPE__ = Scope;
