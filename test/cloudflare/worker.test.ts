import { describe, expect, test } from "bun:test";
import { apply } from "../../src/apply";
import { createCloudflareApi } from "../../src/cloudflare/api";
import type {
  WorkerBindingDurableObjectNamespace,
  WorkerBindingKVNamespace,
  WorkerBindingSecretText,
} from "../../src/cloudflare/bindings";
import { Worker } from "../../src/cloudflare/worker";
import { destroy } from "../../src/destroy";

describe("Worker Resource", () => {
  // Use a fixed name for the test worker
  const testName = "test-worker";
  const esmTestName = "test-worker-esm";
  const formatConversionTestName = "test-worker-format-conversion";
  const doBindingTestName = "test-worker-do-binding";
  const kvBindingTestName = "test-worker-kv-binding";
  const multiBindingsTestName = "test-worker-multi-bindings";

  // Sample worker script (CJS style)
  const workerScript = `
    addEventListener('fetch', event => {
      event.respondWith(new Response('Hello world!', { status: 200 }));
    });
  `;

  // Sample ESM worker script
  const esmWorkerScript = `
    export default {
      async fetch(request, env, ctx) {
        return new Response('Hello ESM world!', { status: 200 });
      }
    };
  `;

  // Sample ESM worker script with a Durable Object
  const durableObjectWorkerScript = `
    export class Counter {
      constructor(state, env) {
        this.state = state;
        this.env = env;
        this.counter = 0;
      }

      async fetch(request) {
        this.counter++;
        return new Response('Counter: ' + this.counter, { status: 200 });
      }
    }

    export default {
      async fetch(request, env, ctx) {
        // Use the DO binding if needed
        if (request.url.includes('/counter')) {
          const id = env.COUNTER.idFromName('default');
          const stub = env.COUNTER.get(id);
          return stub.fetch(request);
        }
        
        return new Response('Hello with Durable Object!', { status: 200 });
      }
    };
  `;

  // Sample ESM worker script with KV Namespace
  const kvWorkerScript = `
    export default {
      async fetch(request, env, ctx) {
        // Use the KV binding
        if (request.url.includes('/kv')) {
          const value = await env.TEST_KV.get('testKey');
          return new Response('KV Value: ' + (value || 'not found'), { status: 200 });
        }
        
        return new Response('Hello with KV Namespace!', { status: 200 });
      }
    };
  `;

  // Sample ESM worker script with multiple bindings
  const multiBindingsWorkerScript = `
    export class Counter {
      constructor(state, env) {
        this.state = state;
        this.env = env;
        this.counter = 0;
      }

      async fetch(request) {
        this.counter++;
        return new Response('Counter: ' + this.counter, { status: 200 });
      }
    }

    export default {
      async fetch(request, env, ctx) {
        // Path-based routing to demonstrate different bindings
        const url = new URL(request.url);
        
        if (url.pathname.includes('/counter')) {
          const id = env.COUNTER.idFromName('default');
          const stub = env.COUNTER.get(id);
          return stub.fetch(request);
        }
        
        if (url.pathname.includes('/kv')) {
          const value = await env.TEST_KV.get('testKey');
          return new Response('KV Value: ' + (value || 'not found'), { status: 200 });
        }
        
        if (url.pathname.includes('/secret')) {
          return new Response('Secret: ' + env.API_KEY, { status: 200 });
        }
        
        return new Response('Hello worker with multiple bindings!', { status: 200 });
      }
    };
  `;

  test("create, update, and delete worker (CJS format)", async () => {
    // Create a worker with an explicit name
    const worker = new Worker(testName, {
      name: testName, // Explicitly provide the name
      script: workerScript,
      format: "cjs",
    });

    // Apply to create the worker
    const output = await apply(worker);
    expect(output.id).toBeTruthy();
    expect(output.name).toEqual(testName);
    expect(output.format).toEqual("cjs");

    // Update the worker with a new script
    const updatedScript = `
      addEventListener('fetch', event => {
        event.respondWith(new Response('Hello updated world!', { status: 200 }));
      });
    `;

    const updatedWorker = new Worker(testName, {
      name: testName, // Explicitly provide the name
      script: updatedScript,
      format: "cjs",
    });

    const updateOutput = await apply(updatedWorker);
    expect(updateOutput.id).toEqual(output.id);

    // Delete the worker
    await destroy(worker);

    // Verify the worker was deleted by directly checking with the Cloudflare API
    const api = await createCloudflareApi();
    const response = await api.get(
      `/accounts/${api.accountId}/workers/scripts/${testName}`,
    );

    // Should be a 404 if properly deleted
    expect(response.status).toEqual(404);
  });

  test("create, update, and delete worker (ESM format)", async () => {
    // Create a worker with ESM format
    const worker = new Worker(esmTestName, {
      name: esmTestName,
      script: esmWorkerScript,
      format: "esm", // Explicitly using ESM
    });

    // Apply to create the worker
    const output = await apply(worker);
    expect(output.id).toBeTruthy();
    expect(output.name).toEqual(esmTestName);
    expect(output.format).toEqual("esm");

    // Update the worker with a new ESM script
    const updatedEsmScript = `
      export default {
        async fetch(request, env, ctx) {
          return new Response('Hello updated ESM world!', { status: 200 });
        }
      };
    `;

    const updatedWorker = new Worker(esmTestName, {
      name: esmTestName,
      script: updatedEsmScript,
      format: "esm",
    });

    const updateOutput = await apply(updatedWorker);
    expect(updateOutput.id).toEqual(output.id);

    // Delete the worker
    await destroy(worker);

    // Verify the worker was deleted
    const api = await createCloudflareApi();
    const response = await api.get(
      `/accounts/${api.accountId}/workers/scripts/${esmTestName}`,
    );
    expect(response.status).toEqual(404);
  });

  test("convert between ESM and CJS formats", async () => {
    // First create with ESM format
    let worker = new Worker(formatConversionTestName, {
      name: formatConversionTestName,
      script: esmWorkerScript,
      format: "esm",
    });

    // Apply to create the worker with ESM
    let output = await apply(worker);
    expect(output.format).toEqual("esm");

    // Update to CJS format
    worker = new Worker(formatConversionTestName, {
      name: formatConversionTestName,
      script: workerScript,
      format: "cjs",
    });

    // Apply to update to CJS
    output = await apply(worker);
    expect(output.format).toEqual("cjs");

    // Update back to ESM format
    worker = new Worker(formatConversionTestName, {
      name: formatConversionTestName,
      script: esmWorkerScript,
      format: "esm",
    });

    // Apply to update back to ESM
    output = await apply(worker);
    expect(output.format).toEqual("esm");

    // Clean up
    await destroy(worker);

    // Verify deletion
    const api = await createCloudflareApi();
    const response = await api.get(
      `/accounts/${api.accountId}/workers/scripts/${formatConversionTestName}`,
    );
    expect(response.status).toEqual(404);
  });

  test("fails when creating a worker with a duplicate name", async () => {
    // Define fixed names for this test
    const duplicateTestName = "test-worker-duplicate";

    // First, create a worker successfully
    const firstWorker = new Worker(duplicateTestName, {
      name: duplicateTestName,
      script: workerScript,
      format: "cjs",
    });

    await apply(firstWorker);

    // Try to create another worker with the same name, which should fail
    const duplicateWorker = new Worker("different-resource-id", {
      name: duplicateTestName, // Same name as firstWorker
      script: workerScript,
      format: "cjs",
    });

    // Expect the apply call to throw an error about duplicate worker
    await expect(apply(duplicateWorker)).rejects.toThrow(
      `Worker with name '${duplicateTestName}' already exists`,
    );

    // Clean up by deleting the first worker
    await destroy(firstWorker);
  });

  test("create and delete worker with Durable Object binding", async () => {
    try {
      // First create the worker without the DO binding
      const initialWorker = new Worker(doBindingTestName, {
        name: doBindingTestName,
        script: durableObjectWorkerScript,
        format: "esm",
        // No bindings yet
      });

      // Apply to create the worker first
      const initialOutput = await apply(initialWorker);
      expect(initialOutput.id).toBeTruthy();
      expect(initialOutput.name).toEqual(doBindingTestName);

      // Now that the worker exists, update it with the DO binding
      const doBinding: WorkerBindingDurableObjectNamespace = {
        name: "COUNTER",
        type: "durable_object_namespace",
        class_name: "Counter",
        script_name: doBindingTestName, // Now this reference is valid
      };

      const updatedWorker = new Worker(doBindingTestName, {
        name: doBindingTestName,
        script: durableObjectWorkerScript,
        format: "esm",
        bindings: [doBinding],
      });

      // Apply the update with the binding
      const output = await apply(updatedWorker);
      expect(output.id).toBeTruthy();
      expect(output.name).toEqual(doBindingTestName);
      expect(output.bindings).toHaveLength(1);
      expect(output.bindings?.[0].name).toEqual("COUNTER");
      expect(
        (output.bindings?.[0] as WorkerBindingDurableObjectNamespace)
          .class_name,
      ).toEqual("Counter");
    } finally {
      // Always clean up - delete the worker
      try {
        const cleanupWorker = new Worker(doBindingTestName, {
          name: doBindingTestName,
          script: durableObjectWorkerScript,
          format: "esm",
        });
        await destroy(cleanupWorker);

        // Verify the worker was deleted
        const api = await createCloudflareApi();
        const response = await api.get(
          `/accounts/${api.accountId}/workers/scripts/${doBindingTestName}`,
        );
        expect(response.status).toEqual(404);
      } catch (err) {
        console.log(`Error during cleanup: ${err}`);
      }
    }
  });

  test("create and delete worker with KV Namespace binding", async () => {
    // Skip test if no TEST_KV_NAMESPACE_ID environment variable
    const kvNamespaceId = process.env.TEST_KV_NAMESPACE_ID;
    if (!kvNamespaceId) {
      console.log("Skipping KV binding test: TEST_KV_NAMESPACE_ID not set");
      return;
    }

    // Create a worker with a KV Namespace binding
    const kvBinding: WorkerBindingKVNamespace = {
      name: "TEST_KV",
      type: "kv_namespace",
      namespace_id: kvNamespaceId,
    };

    const worker = new Worker(kvBindingTestName, {
      name: kvBindingTestName,
      script: kvWorkerScript,
      format: "esm",
      bindings: [kvBinding],
    });

    // Apply to create the worker
    const output = await apply(worker);
    expect(output.id).toBeTruthy();
    expect(output.name).toEqual(kvBindingTestName);
    expect(output.bindings).toHaveLength(1);
    expect(output.bindings?.[0].name).toEqual("TEST_KV");
    expect(
      (output.bindings?.[0] as WorkerBindingKVNamespace).namespace_id,
    ).toEqual(kvNamespaceId);

    // Delete the worker
    await destroy(worker);

    // Verify the worker was deleted
    const api = await createCloudflareApi();
    const response = await api.get(
      `/accounts/${api.accountId}/workers/scripts/${kvBindingTestName}`,
    );
    expect(response.status).toEqual(404);
  });

  test("create and delete worker with multiple bindings", async () => {
    // Skip test if no KV namespace ID
    const kvNamespaceId = process.env.TEST_KV_NAMESPACE_ID;
    if (!kvNamespaceId) {
      console.log("Skipping multi-binding test: TEST_KV_NAMESPACE_ID not set");
      return;
    }

    try {
      // First create the worker without the DO binding
      const initialWorker = new Worker(multiBindingsTestName, {
        name: multiBindingsTestName,
        script: multiBindingsWorkerScript,
        format: "esm",
      });

      // Apply to create the worker first
      const initialOutput = await apply(initialWorker);
      expect(initialOutput.id).toBeTruthy();
      expect(initialOutput.name).toEqual(multiBindingsTestName);

      // Now prepare all bindings for the update
      const durableObjectBinding: WorkerBindingDurableObjectNamespace = {
        name: "COUNTER",
        type: "durable_object_namespace",
        class_name: "Counter",
        script_name: multiBindingsTestName, // Now this is valid
      };

      const kvBinding: WorkerBindingKVNamespace = {
        name: "TEST_KV",
        type: "kv_namespace",
        namespace_id: kvNamespaceId,
      };

      const secretBinding: WorkerBindingSecretText = {
        name: "API_KEY",
        type: "secret_text",
        text: "test-api-key-value",
      };

      // Update the worker with all bindings
      const updatedWorker = new Worker(multiBindingsTestName, {
        name: multiBindingsTestName,
        script: multiBindingsWorkerScript,
        format: "esm",
        bindings: [durableObjectBinding, kvBinding, secretBinding],
      });

      // Apply the update
      const output = await apply(updatedWorker);
      expect(output.id).toBeTruthy();
      expect(output.name).toEqual(multiBindingsTestName);
      expect(output.bindings).toHaveLength(3);

      // Verify each binding
      const bindings = output.bindings || [];
      const doBinding = bindings.find((b) => b.name === "COUNTER");
      const kvNamespaceBinding = bindings.find((b) => b.name === "TEST_KV");
      const secretTextBinding = bindings.find((b) => b.name === "API_KEY");

      expect(doBinding).toBeTruthy();
      expect(kvNamespaceBinding).toBeTruthy();
      expect(secretTextBinding).toBeTruthy();
    } finally {
      // Clean up by deleting the worker
      try {
        const cleanupWorker = new Worker(multiBindingsTestName, {
          name: multiBindingsTestName,
          script: multiBindingsWorkerScript,
          format: "esm",
        });
        await destroy(cleanupWorker);

        // Verify the worker was deleted
        const api = await createCloudflareApi();
        const response = await api.get(
          `/accounts/${api.accountId}/workers/scripts/${multiBindingsTestName}`,
        );
        expect(response.status).toEqual(404);
      } catch (err) {
        console.log(`Error during cleanup: ${err}`);
      }
    }
  });
});
