import { Print } from "./print";

export namespace $ {
  export function print(values: Record<string, any>) {
    new Print("print", values);
  }
}
