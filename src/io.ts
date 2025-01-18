import {
  ResourceID,
  ResourceOutput,
  isResource,
  type Resource,
} from "./resource";

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
  /**
   * @internal
   */
  export function source<T>(resource: Resource<any[], T>): Output<T> {
    // @ts-expect-error - we know we are an "Output"
    return new OutputSource<T>(resource);
  }

  /**
   * @internal
   */
  export function provide<T>(output: Output<T>, value: T) {
    if (output instanceof OutputSource) {
      output.provide(value);
    } else if (isResource(output)) {
      provide(output[ResourceOutput], value);
    } else {
      throw new Error(
        "Can only provide a value to an OutputSource or Resource",
      );
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

  public provide(value: T) {
    if (this.box) {
      throw new Error(
        `OutputSource ${this.resource[ResourceID]} already has a value`,
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
