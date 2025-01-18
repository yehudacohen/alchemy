import type { FQN } from "./fqn";
import { ResourceFQN, type Resource } from "./resource";

export type Input<T> =
  | T
  | Output<T>
  | (T extends string | number | boolean
      ? Output<T>
      : T extends any[]
        ? Inputs<T>
        : {
            [k in keyof T]: Input<T[k]>;
          });

export type Eval<U> = U extends Output<infer V> ? Eval<V> : U;

export namespace Output {
  export function source<T>(fqn: FQN): Output<T> {
    // @ts-expect-error - we know we are an "Output"
    return new OutputSource<T>(fqn);
  }

  export function provide<T>(output: Output<T>, value: T) {
    if (output instanceof OutputSource) {
      output.supply(value);
    } else {
      throw new Error("Cannot supply a non-source output");
    }
  }

  export async function evaluate<T>(
    output: T | Output<T>,
  ): Promise<Evaluated<T>> {
    if (output instanceof OutputSource) {
      return new Promise((resolve) => {
        output.subscribe(async (value) => {
          const evaluated = await evaluate(value);
          resolve(
            new Evaluated<T>(
              evaluated.value,
              // TODO: immutable set that is m log(n) to merge m elements into a set size n
              new Set([...evaluated.deps, output.resource[ResourceFQN]]),
            ),
          );
        });
      });
    } else if (output instanceof OutputChain) {
      const parent = await evaluate(output.parent);
      const ret = output.fn(parent.value);
      // the ret may be an Output (e.g. in the flatMap case), so we need to evaluate it and include its deps
      const evaluated = await evaluate(ret);

      return new Evaluated<T>(
        evaluated.value,
        new Set([...parent.deps, ...evaluated.deps]),
      );
    } else {
      return new Evaluated<T>(output as T);
    }
  }
}

export type Output<T> = {
  apply<U>(fn: (value: T) => U): Output<Eval<U>>;
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
        ? Outputs<T>
        : {
            [k in keyof T]: Output<T[k]>;
          });

export type Inputs<P extends readonly any[]> = P extends [
  infer First,
  ...infer Rest,
]
  ? [Input<First>, ...Inputs<Rest>]
  : [];

export type Outputs<P extends readonly any[]> = P extends [
  infer First,
  ...infer Rest,
]
  ? [Output<First>, ...Outputs<Rest>]
  : [];

export class OutputSource<T> {
  private box?: {
    value: T;
  } = undefined;

  constructor(public readonly resource: Resource<any[], T>) {}

  public apply<U>(fn: (value: T) => U): Output<U> {
    // @ts-expect-error - we know we are an "Output"
    return new OutputChain<T, U>(this, fn);
  }

  public supply(value: T) {
    if (this.box) {
      throw new Error(
        `OutputSource ${this.resource[ResourceFQN]} already has a value`,
      );
    }
    this.box = { value };
    const subscribers = this.subscribers;
    this.subscribers = [];
    subscribers.forEach((fn) => fn(value));
  }

  private subscribers: ((value: T) => void)[] = [];

  /**
   * @internal
   */
  public subscribe(fn: (value: T) => Promise<void>) {
    if (this.box) {
      fn(this.box.value);
    } else {
      this.subscribers.push(fn);
    }
  }
}

export class OutputChain<T, U> {
  constructor(
    public readonly parent: Output<T>,
    public readonly fn: (value: T) => U,
  ) {}

  public apply<V>(fn: (value: U) => V): OutputChain<U, V> {
    return new OutputChain<U, V>(this as any as Output<U>, fn);
  }
}

export class Evaluated<T> {
  constructor(
    public readonly value: T,
    public readonly deps: Set<string> = new Set(),
  ) {}
}
