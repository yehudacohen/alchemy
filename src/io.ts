export type Input<T> =
  | T
  | Output<T>
  | (T extends string | number | boolean
      ? Output<T>
      : {
          [k in keyof T]: Input<T[k]>;
        });

type UnwrapOutput<T> = T extends Output<infer U> ? UnwrapOutput<U> : T;

export type Output<T> = {
  apply<U>(fn: (value: T) => U): Output<UnwrapOutput<U>>;
} & (T extends string
  ? {
      [k in keyof typeof String.prototype]: Output<
        (typeof String.prototype)[k]
      >;
    }
  : T extends number
    ? {
        [K in keyof typeof Number.prototype]: Output<
          (typeof Number.prototype)[K]
        >;
      }
    : T extends boolean
      ? {
          [K in keyof typeof Boolean.prototype]: Output<
            (typeof Boolean.prototype)[K]
          >;
        }
      : T extends any[]
        ? {
            length: Output<T["length"]>;
          } & {
            [K in Exclude<keyof T, "length">]: Output<T[K]>;
          }
        : T extends (...args: any[]) => any
          ? (...args: Parameters<T>) => Output<ReturnType<T>>
          : {
              [k in keyof T]: Output<T[k]>;
            });

/* ---------------------------------------
   Global Data Store + Event-based Resolution
---------------------------------------- */

const dataStore = new Map<string, unknown>();
const waitingCallbacks = new Map<string, Array<(val: unknown) => void>>();

/**
 * Wait for the value of a specific sourceId.
 * If already resolved, returns immediately.
 * Otherwise, enqueues a callback in waitingCallbacks until .resolve is called.
 */
function waitForValue<T>(id: string): Promise<T> {
  return new Promise((resolve) => {
    if (dataStore.has(id)) {
      // Already resolved
      resolve(dataStore.get(id) as T);
    } else {
      // Not resolved yet, queue the resolver
      let list = waitingCallbacks.get(id);
      if (!list) {
        list = [];
        waitingCallbacks.set(id, list);
      }
      list.push((val) => {
        resolve(val as T);
      });
    }
  });
}

/**
 * Resolves a particular source ID with a given value, unblocking any waiters.
 */
function resolveValue<T>(id: string, val: T) {
  dataStore.set(id, val);
  const list = waitingCallbacks.get(id);
  if (list) {
    for (const cb of list) {
      cb(val);
    }
    waitingCallbacks.delete(id);
  }
}

/* ---------------------------------------
   Internal RealOutput Class
---------------------------------------- */

const INTERNAL_SYMBOL = Symbol("REAL_OUTPUT_INTERNAL");

class RealOutput<T> {
  constructor(
    private computeFn: () => Promise<T>,
    private sourceIds: Set<string>,
  ) {}

  getValue(): Promise<T> {
    return this.computeFn();
  }

  getSources(): Set<string> {
    return this.sourceIds;
  }

  apply<U>(fn: (val: T) => U | any): RealOutput<U> {
    const nextSources = new Set(this.sourceIds);

    // Recursively flatten nested outputs and collect all sources
    const flatten = async (val: any): Promise<any> => {
      if (!isProxyOutput(val)) {
        return val;
      }
      const nested = getRealOutput(val);

      // First await the value to ensure nested sources are discovered
      const innerVal = await nested.getValue();

      // Then merge the sources after the value is computed
      for (const s of nested.getSources()) {
        nextSources.add(s);
      }

      return flatten(innerVal);
    };

    const nextCompute = async () => {
      const val = await this.getValue();
      try {
        const result = fn(val);
        if (isProxyOutput(result)) {
          const flattened = await flatten(result);
          return flattened;
        }
        return result;
      } catch (err) {
        if (
          err instanceof Error &&
          err.message.includes("Symbol.toPrimitive")
        ) {
          // If we hit a Symbol.toPrimitive error, try to handle the value directly
          return fn(val);
        }
        throw err;
      }
    };

    return new RealOutput<U>(nextCompute, nextSources);
  }
}

/* ---------------------------------------
   Proxy + Helpers
---------------------------------------- */

function isProxyOutput(obj: any): boolean {
  return !!(obj && obj[INTERNAL_SYMBOL] instanceof RealOutput);
}

function getRealOutput<T>(obj: any): RealOutput<T> {
  return obj[INTERNAL_SYMBOL] as RealOutput<T>;
}

function createProxy<T>(real: RealOutput<T>): any {
  // Create a dummy function with Symbol.toPrimitive defined
  const dummyFn = () => {};
  Object.defineProperty(dummyFn, Symbol.toPrimitive, {
    value: () => "[ProxyOutput]",
    writable: false,
    enumerable: false,
    configurable: true,
  });

  return new Proxy(dummyFn, {
    get(_target, prop, _receiver) {
      if (prop === INTERNAL_SYMBOL) {
        return real;
      }
      if (prop === "apply") {
        return (fn: (val: T) => any) => {
          const newReal = real.apply(fn);
          return createProxy(newReal);
        };
      }
      if (prop === "promise") {
        return () => real.getValue();
      }
      if (prop === "sources") {
        return () => real.getSources();
      }
      if (prop === "resolve") {
        return (callback: (s: Set<string>, v: T) => void) => {
          real.getValue().then((val) => callback(real.getSources(), val));
        };
      }
      if (prop === Symbol.toPrimitive) {
        return () => "[ProxyOutput]";
      }

      // For property access (like .length or .trim), create a new proxy
      const childReal = real.apply((val) => {
        const propVal = (val as any)[prop];
        if (typeof propVal === "function") {
          return propVal.bind(val);
        }
        return propVal;
      });
      return createProxy(childReal);
    },

    apply(_target, thisArg, argArray) {
      // Handle method calls (e.g., output.trim())
      const newReal = real.apply((val) => {
        if (typeof val !== "function") {
          throw new Error("Tried to call a non-function value");
        }
        return val.apply(thisArg, argArray);
      });
      return createProxy(newReal);
    },
  });
}

/* ---------------------------------------
   Public API
---------------------------------------- */

export const Output = {
  /**
   * Create a new output that depends on a single source ID.
   */
  proxy<T>(id: string): Output<T> {
    const real = new RealOutput<T>(() => waitForValue<T>(id), new Set([id]));
    return createProxy(real);
  },

  /**
   * Provide a value for a given source ID, unblocking any waiting calls.
   */
  resolve<T>(id: string, val: T): void {
    resolveValue(id, val);
  },

  /**
   * Return a promise of the final value for a given proxy-based output.
   */
  promise<T>(obj: any): Promise<T> {
    return getRealOutput<T>(obj).getValue();
  },

  /**
   * Return the set of source IDs for a given proxy-based output.
   */
  sources(obj: any): Set<string> {
    return getRealOutput(obj).getSources();
  },
};
