export type Eval<U> = U extends Output<infer V> ? Eval<V> : U;

export type Outputs<P extends readonly any[]> = P extends [
  infer First,
  ...infer Rest,
]
  ? [Output<First>, ...Outputs<Rest>]
  : [];

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

export const Output = class<T, U> {
  constructor(
    public readonly parent: Output<T>,
    public readonly fn: (value: T) => U,
  ) {}

  public apply<V>(fn: (value: U) => V): Output<V> {
    // @ts-expect-error - we know we are an "Output"
    return new Output(this, fn);
  }
} as new <T, U>(
  parent: Output<T>,
  fn: (value: T) => U,
) => Output<U>;
