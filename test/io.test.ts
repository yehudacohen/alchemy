import { describe, expect, test } from "bun:test";
import { apply } from "../src/apply";
import { Output } from "../src/io";
import { Resource } from "../src/resource";

class Name extends Resource("test::Name", async (ctx, name: string) => {
  return name;
}) {}

describe("apply", () => {
  test("capture first order dependencies", async () => {
    const name = new Name("id_1", "sam");

    const message = name.apply((value) => `Hello, ${value}!`);

    Output.provide(name, "sam");

    const evaluated = await apply(message);

    expect(evaluated.value).toBe("Hello, sam!");
    expect(evaluated.deps).toEqual(["root:id_1"]);
  });

  test("carry forward chained dependencies", async () => {
    const first = new Name("id_2", "sam");
    const second = new Name("id_3", "bob");

    const message = first.apply((value) =>
      second.apply((value2) => `${value} ${value2}`),
    );

    Output.provide(first, "sam");
    Output.provide(second, "bob");

    const evaluated = await apply(message);

    expect(evaluated.value).toBe("sam bob");
    expect(evaluated.deps).toEqual(["root:id_2", "root:id_3"]);
  });
});
