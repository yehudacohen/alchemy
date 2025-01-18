import { describe, expect, test } from "bun:test";
import { Output } from "../src/io";

describe("Output", () => {
  test("apply", async () => {
    const name = Output.source<string>("test:name");

    const message = name.apply((value) => `Hello, ${value}!`);

    Output.provide(name, "sam");

    const evaluated = await Output.evaluate(message);

    expect(evaluated.value).toBe("Hello, sam!");
    expect(evaluated.deps).toEqual(new Set(["test:name"]));
  });

  test("carry forward chained dependencies", async () => {
    const first = Output.source<string>("test:first");
    const second = Output.source<string>("test:second");

    const message = first.apply((value) =>
      second.apply((value2) => `${value} ${value2}`),
    );

    Output.provide(first, "sam");
    Output.provide(second, "bob");

    const evaluated = await Output.evaluate(message);

    expect(evaluated.value).toBe("sam bob");
    expect(evaluated.deps).toEqual(new Set(["test:first", "test:second"]));
  });
});
