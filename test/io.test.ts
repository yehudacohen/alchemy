import { describe, expect, test } from "bun:test";
import { Output } from "../src/io";

/**
 * Basic tests from your original suite
 */
describe("Output", () => {
  test("basic value resolution", async () => {
    const output = Output.proxy<number>("test1");
    Output.resolve("test1", 42);

    const result = await Output.promise(output);
    expect(result).toBe(42);
  });

  test("apply transformation", async () => {
    const output = Output.proxy<number>("test2");
    const doubled = output.apply((x) => x * 2);

    Output.resolve("test2", 21);

    const result = await Output.promise(doubled);
    expect(result).toBe(42);
  });

  test("nested apply with multiple sources", async () => {
    const output1 = Output.proxy<number>("test3");
    const output2 = Output.proxy<number>("test4");

    const combined = output1.apply((a) => output2.apply((b) => a + b));

    Output.resolve("test3", 20);
    Output.resolve("test4", 22);

    const result = await Output.promise(combined);
    expect(result).toBe(42);

    const sources = Output.sources(combined);
    expect(sources.has("test3")).toBe(true);
    expect(sources.has("test4")).toBe(true);
    expect(sources.size).toBe(2);
  });

  test("property access transformation", async () => {
    const output = Output.proxy<string>("test5");
    const length = output.length;

    Output.resolve("test5", "hello");

    const result = await Output.promise(length);
    expect(result).toBe(5);
  });

  test("chained transformations", async () => {
    const output = Output.proxy<number>("test6");
    const final = output
      .apply((x) => x * 2)
      .apply((x) => x + 10)
      .apply((x) => x / 2);

    Output.resolve("test6", 16);

    const result = await Output.promise(final);
    expect(result).toBe(21);
  });

  test("error handling", async () => {
    const output = Output.proxy<number>("test7");
    const errored = output.apply((x) => {
      throw new Error("Test error");
    });

    Output.resolve("test7", 42);

    await expect(Output.promise(errored)).rejects.toThrow("Test error");
  });

  test("nested output flattening", async () => {
    const output1 = Output.proxy<number>("test8");
    const output2 = Output.proxy<number>("test9");

    // This should flatten to an output of number
    const combined = output1.apply((a) => output2);

    Output.resolve("test8", 20);
    Output.resolve("test9", 22);

    const result = await Output.promise(combined);
    expect(result).toBe(22);

    const sources = Output.sources(combined);
    expect(sources.has("test8")).toBe(true);
    expect(sources.has("test9")).toBe(true);
    expect(sources.size).toBe(2);
  });

  test("apply after resolve", async () => {
    const out = Output.proxy<number>("test10");
    // Resolve immediately
    Output.resolve("test10", 10);

    // Even though 'test10' is already resolved, we can still apply transformations
    const doubled = out.apply((x) => x * 2);
    const result = await Output.promise(doubled);
    expect(result).toBe(20);
  });

  test("property access after resolve", async () => {
    const arrOut = Output.proxy<number[]>("arr1");
    Output.resolve("arr1", [1, 2, 3]);

    // Accessing .length after the array is already resolved
    const lengthOut = arrOut.length;
    const lengthVal = await Output.promise(lengthOut);
    expect(lengthVal).toBe(3);

    // Accessing an index property
    const secondElementOut = arrOut[1];
    const secondElementVal = await Output.promise(secondElementOut);
    expect(secondElementVal).toBe(2);
  });

  test("method call on resolved string", async () => {
    const strOut = Output.proxy<string>("str1");
    Output.resolve("str1", "  Hello World  ");

    // We can chain multiple property calls
    // strOut.trim() -> new Output
    // then .toUpperCase() -> new Output
    const upperTrimmed = strOut.trim().toUpperCase();

    const result = await Output.promise(upperTrimmed);
    expect(result).toBe("HELLO WORLD");
  });

  test("method call on resolved array", async () => {
    const arrOut = Output.proxy<number[]>("arr2");
    Output.resolve("arr2", [1, 2, 3, 4]);

    // Let's call .join(',')
    const joined = arrOut.join(",");
    const joinedVal = await Output.promise(joined);
    expect(joinedVal).toBe("1,2,3,4");
  });

  test("error in a method call", async () => {
    const out = Output.proxy<{
      doSomething: () => void;
    }>("errMethod");
    Output.resolve("errMethod", {
      name: "test",
      doSomething() {
        throw new Error("Method failed");
      },
    });

    const callMethod = out.doSomething();
    await expect(Output.promise(callMethod)).rejects.toThrow("Method failed");
  });

  test("multiple nested sources and merges", async () => {
    const outA = Output.proxy<number>("mergeA");
    const outB = Output.proxy<number>("mergeB");
    const outC = Output.proxy<number>("mergeC");

    // We'll do a triple-nested combine
    const combined = outA.apply((a) =>
      outB.apply((b) => outC.apply((c) => a + b + c)),
    );

    // Resolve them in any order
    Output.resolve("mergeB", 10);
    Output.resolve("mergeA", 20);
    Output.resolve("mergeC", 12);

    const val = await Output.promise(combined);
    expect(val).toBe(42);

    const sources = Output.sources(combined);
    expect(sources.has("mergeA")).toBe(true);
    expect(sources.has("mergeB")).toBe(true);
    expect(sources.has("mergeC")).toBe(true);
    expect(sources.size).toBe(3);
  });

  test("property read that isn't a function, but we try to call it", async () => {
    const out = Output.proxy<{ someProp: number }>("notAFunction");
    Output.resolve("notAFunction", { someProp: 123 });

    // Accessing "someProp" is valid, but calling it is not
    const prop = out.someProp;
    const value = await Output.promise(prop);
    expect(value).toBe(123);

    // Attempting to call .someProp() should throw
    // @ts-expect-error
    await expect(Output.promise(out.someProp())).rejects.toThrow(
      "Tried to call a non-function value",
    );
  });

  test("chaining multiple method calls on resolved data", async () => {
    const out = Output.proxy<string>("strChain");
    Output.resolve("strChain", "   alpha beta gamma   ");

    // trim -> "alpha beta gamma"
    // replace -> "alpha|beta|gamma"
    // split -> ["alpha", "beta", "gamma"]
    // map -> length of each word [5,4,5]
    // join -> "5-4-5"
    const resultOutput = out
      .trim()
      // @ts-expect-error - TODO
      .replace(/\s+/g, "|")
      // @ts-expect-error - TODO
      .split("|")
      .map((word) => word.length)
      .join("-");

    const finalVal = await Output.promise(resultOutput);
    expect(finalVal).toBe("5-4-5");
  });

  test("apply returns an output from property read, flattening automatically", async () => {
    const parent = Output.proxy<{ child: number }>("parentObj");
    const childOut = parent.apply((p) => p.child); // This should flatten automatically

    Output.resolve("parentObj", { child: 99 });
    const val = await Output.promise(childOut);
    expect(val).toBe(99);

    const sources = Output.sources(childOut);
    expect(sources.has("parentObj")).toBe(true);
    expect(sources.size).toBe(1);
  });
});
