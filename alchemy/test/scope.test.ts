import { describe, expect, it } from "bun:test";
import { File } from "../src/components/fs";
import { rootScope } from "../src/global";
import { Scope, getScope, withScope } from "../src/scope";

describe("Scope", () => {
  it("should maintain scope context and track resources", async () => {
    const testScope = new Scope("test");

    await withScope(testScope, async () => {
      new File("test-file", "test.txt", "Hello World");

      const currentScope = getScope();
      expect(currentScope).toEqual(testScope);
    });
    expect(testScope.nodes.size).toBe(1);
    expect(testScope).toBe(testScope);
    expect(testScope).not.toBe(rootScope);
  });
});
