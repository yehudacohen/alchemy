import type { Output } from "./output";

export type Inputs<P extends readonly any[]> = P extends [
  infer First,
  ...infer Rest,
]
  ? [Input<First>, ...Inputs<Rest>]
  : [];

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
