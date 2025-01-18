import { describe, expect, test } from "bun:test";
import { Output } from "../src/io";

describe("Output", () => {
  test("apply", async () => {
    const name = Output.source<string>("test");

    const message = name.apply((value) => `Hello, ${value}!`);

    Output.supply(name, "sam");

    const evaluated = await Output.evaluate(message);

    expect(evaluated.value).toBe("Hello, sam!");
    expect(evaluated.deps).toEqual(new Set(["test"]));
  });

  test("carry forward chained dependencies", async () => {
    const first = Output.source<string>("first");
    const second = Output.source<string>("second");

    const message = first.apply((value) =>
      second.apply((value2) => `${value} ${value2}`),
    );

    Output.supply(first, "sam");
    Output.supply(second, "bob");

    const evaluated = await Output.evaluate(message);

    expect(evaluated.value).toBe("sam bob");
    expect(evaluated.deps).toEqual(new Set(["first", "second"]));
  });
});
