import type { Input } from "./input";
import { type Output, isOutput } from "./output";

type Primitive = string | number | boolean;
type _Input = Primitive | Output<Primitive>;

export function $(
  template: TemplateStringsArray,
  ...args: _Input[]
): Input<string> {
  const inputs = args.reduce<Output<Primitive[]> | Primitive[]>((acc, arg) => {
    if (isOutput(arg)) {
      if (arg === null) {
        return acc;
      } else {
        return arg.apply((arg) => [...acc, arg]);
      }
    } else if (isOutput(acc)) {
      return acc.apply((acc) => [...acc, arg]);
    } else {
      return [...acc, arg];
    }
  }, null as any);

  function interpolate(inputs: Primitive[]) {
    return template.reduce((acc, str, i) => {
      return acc + str + (inputs[i] ?? "");
    }, "");
  }

  if (isOutput(inputs)) {
    return inputs.apply(interpolate);
  } else {
    return interpolate(inputs);
  }
}
