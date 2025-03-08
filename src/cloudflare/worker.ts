import * as fs from "fs/promises";
import { apply } from "../apply";
import { Bundle, type BundleProps } from "../esbuild";
import { type Context, Resource } from "../resource";
import { createCloudflareApi } from "./api";
import type { WorkerBinding } from "./bindings";

/**
 * Properties for creating or updating a Worker
 */
export interface WorkerProps {
  /**
   * The worker script content (JavaScript or WASM)
   * One of script, entryPoint, or bundle must be provided
   */
  script?: string;

  /**
   * Path to the entry point file
   * Will be bundled using esbuild
   * One of script, entryPoint, or bundle must be provided
   */
  entrypoint?: string;

  /**
   * Reference to a pre-configured Bundle resource
   * One of script, entryPoint, or bundle must be provided
   */
  bundle?: Bundle;

  /**
   * Bundle options when using entryPoint
   * Ignored if bundle is provided
   */
  bundleOptions?: Omit<BundleProps, "entryPoint">;

  /**
   * Module format for the worker script
   * 'esm' - ECMAScript modules (default)
   * 'cjs' - CommonJS modules
   * @default 'esm'
   */
  format?: "esm" | "cjs";

  /**
   * Name for the worker
   * This is mandatory - must be explicitly specified
   */
  name: string;

  /**
   * Routes to associate with this worker
   * Format: example.com/* or *.example.com/*
   */
  routes?: string[];

  /**
   * Bindings to attach to the worker
   */
  bindings?: WorkerBinding[];

  /**
   * Whether the worker should be deployed to production
   * @default true
   */
  production?: boolean;
}

/**
 * Output returned after Worker creation/update
 */
export interface WorkerOutput extends WorkerProps {
  /**
   * The ID of the worker
   */
  id: string;

  /**
   * Time at which the worker was created
   */
  createdAt: number;

  /**
   * Time at which the worker was last updated
   */
  updatedAt: number;
}

export class Worker extends Resource(
  "cloudflare::Worker",
  async (ctx: Context<WorkerOutput>, props: WorkerProps) => {
    // Create Cloudflare API client with automatic account discovery
    const api = await createCloudflareApi();

    // Validate that a name is provided
    if (!props.name) {
      throw new Error("Worker name is required - must be explicitly specified");
    }

    // Use the provided name
    const workerName = props.name;

    // Validate input - we need either script, entryPoint, or bundle
    if (!props.script && !props.entrypoint && !props.bundle) {
      throw new Error("One of script, entryPoint, or bundle must be provided");
    }

    // For create operations, check if a worker with the same name already exists
    if (ctx.event === "create") {
      const checkExistsResponse = await api.get(
        `/accounts/${api.accountId}/workers/scripts/${workerName}`,
      );

      if (checkExistsResponse.ok) {
        throw new Error(
          `Worker with name '${workerName}' already exists. Please use a unique name.`,
        );
      } else if (checkExistsResponse.status !== 404) {
        // If it's neither a success nor a 404, it's an unexpected error
        const errorData = await checkExistsResponse.json().catch(() => ({
          errors: [{ message: checkExistsResponse.statusText }],
        }));
        throw new Error(
          `Error checking if worker exists: ${errorData.errors?.[0]?.message || checkExistsResponse.statusText}`,
        );
      }
      // If it's a 404, that means the worker doesn't exist yet, which is what we want
    }

    // Get the script content - either from props.script, or by bundling
    let scriptContent: string;

    if (props.script) {
      // Use the provided script
      scriptContent = props.script;
    } else if (props.bundle) {
      // Use a pre-configured Bundle resource
      const bundleOutput = await apply(props.bundle);
      scriptContent = await fs.readFile(bundleOutput.path, "utf-8");
    } else if (props.entrypoint) {
      // Create and use a Bundle resource with worker-optimized configuration
      const defaultBundleOptions: Omit<BundleProps, "entryPoint"> = {
        format: props.format === "cjs" ? "cjs" : "esm", // Use the specified format or default to ESM
        target: "es2020",
        platform: "browser",
        minify: true,
        options: {
          keepNames: true, // Important for Durable Object classes
        },
      };

      // Merge with user-provided options
      const bundleOptions = {
        ...defaultBundleOptions,
        ...(props.bundleOptions || {}),
      };

      // Create the bundle
      const bundle = new Bundle("bundle", {
        entryPoint: props.entrypoint,
        ...bundleOptions,
      });

      // Get the bundled content
      const bundleOutput = await apply(bundle);
      scriptContent = await fs.readFile(bundleOutput.path, "utf-8");
    } else {
      throw new Error("No script source provided"); // Shouldn't reach here due to earlier validation
    }

    if (ctx.event === "delete") {
      // Delete worker
      const deleteResponse = await api.delete(
        `/accounts/${api.accountId}/workers/scripts/${workerName}`,
      );

      // Check for success (2xx status code)
      if (!deleteResponse.ok && deleteResponse.status !== 404) {
        const errorData = await deleteResponse
          .json()
          .catch(() => ({ errors: [{ message: deleteResponse.statusText }] }));
        console.error(
          "Error deleting worker:",
          errorData.errors?.[0]?.message || deleteResponse.statusText,
        );
      }

      // Also remove any associated routes if they exist
      if (ctx.output?.routes && ctx.output.routes.length > 0 && api.zoneId) {
        // First get existing routes to find their IDs
        const routesResponse = await api.get(
          `/zones/${api.zoneId}/workers/routes`,
        );

        if (routesResponse.ok) {
          const routesData = await routesResponse.json();
          const existingRoutes = routesData.result || [];

          for (const route of existingRoutes) {
            if (ctx.output.routes.includes(route.pattern)) {
              // Delete the route
              const routeDeleteResponse = await api.delete(
                `/zones/${api.zoneId}/workers/routes/${route.id}`,
              );

              if (!routeDeleteResponse.ok) {
                console.warn(
                  `Failed to delete route ${route.pattern}: ${routeDeleteResponse.status} ${routeDeleteResponse.statusText}`,
                );
              }
            }
          }
        } else {
          console.warn(
            "Could not fetch routes for cleanup:",
            routesResponse.status,
            routesResponse.statusText,
          );
        }
      }

      // Return minimal output for deleted state
      return {
        ...props,
        id: "",
        createdAt: 0,
        updatedAt: 0,
      };
    } else {
      // Prepare metadata with bindings
      const metadata: any = {
        bindings: [],
      };

      // Convert bindings to the format expected by the API
      if (props.bindings && props.bindings.length > 0) {
        for (const binding of props.bindings) {
          const bindingData: any = {
            name: binding.name,
            type: binding.type,
          };

          // Map binding properties to the API format based on binding type
          switch (binding.type) {
            case "kv_namespace":
              bindingData.namespace_id = (binding as any).namespace_id;
              break;
            case "durable_object_namespace":
              bindingData.class_name = (binding as any).class_name;
              if ((binding as any).namespace_id) {
                bindingData.namespace_id = (binding as any).namespace_id;
              }
              if ((binding as any).script_name) {
                bindingData.script_name = (binding as any).script_name;
              }
              if ((binding as any).environment) {
                bindingData.environment = (binding as any).environment;
              }
              break;
            case "secret_text":
              bindingData.text = (binding as any).text;
              break;
            case "r2_bucket":
              bindingData.bucket_name = (binding as any).bucket_name;
              break;
            case "analytics_engine":
              bindingData.dataset = (binding as any).dataset;
              break;
            case "service":
              bindingData.service = (binding as any).service;
              if ((binding as any).environment) {
                bindingData.environment = (binding as any).environment;
              }
              if ((binding as any).namespace) {
                bindingData.namespace = (binding as any).namespace;
              }
              break;
            case "d1":
              bindingData.id = (binding as any).id;
              break;
            case "queue":
              bindingData.queue_name = (binding as any).queue_name;
              break;
            case "json":
              bindingData.json = (binding as any).json;
              break;
            case "hyperdrive":
              bindingData.id = (binding as any).id;
              break;
            case "vectorize":
              bindingData.index_name = (binding as any).index_name;
              break;
            case "dispatch_namespace":
              bindingData.namespace = (binding as any).namespace;
              if ((binding as any).outbound) {
                bindingData.outbound = (binding as any).outbound;
              }
              break;
            case "mtls_certificate":
              bindingData.certificate_id = (binding as any).certificate_id;
              break;
            case "plain_text":
              bindingData.text = (binding as any).text;
              break;
            case "wasm_module":
              bindingData.module = (binding as any).module;
              break;
            case "tail_consumer":
              bindingData.service = (binding as any).service;
              break;
          }

          metadata.bindings.push(bindingData);
        }
      }

      // Create FormData for the upload
      const formData = new FormData();

      // Determine if we're using ESM or service worker format
      const isEsModule = props.format !== "cjs"; // Default to ESM unless CJS is specified
      const scriptName = isEsModule ? "worker.js" : "script";
      const contentType = isEsModule
        ? "application/javascript+module"
        : "application/javascript";

      // Prepare metadata
      const updatedMetadata = {
        ...metadata,
      };

      // Add Durable Object migrations if there are any DO bindings
      const durableObjectBindings = props.bindings?.filter(
        (binding) =>
          binding.type === "durable_object_namespace" &&
          // Only include self-referencing DOs (ones defined in this script)
          (binding as any).script_name === props.name,
      );

      if (durableObjectBindings && durableObjectBindings.length > 0) {
        // Add migrations metadata for Durable Objects
        updatedMetadata.migrations = {
          new_classes: durableObjectBindings.map(
            (binding) => (binding as any).class_name, // Just the class name as a string
          ),
          deleted_classes: [],
          renamed_classes: [],
          // Version 2 migrations
          new_sqlite_classes: [],
          updated_sqlite_classes: [],
          renamed_sqlite_classes: [],
        };
      }

      if (isEsModule) {
        // For ES modules format
        updatedMetadata.main_module = scriptName;
      } else {
        // For service worker format (CJS)
        updatedMetadata.body_part = scriptName;
      }

      // Add the actual script content as a named file part
      formData.append(
        scriptName,
        new Blob([scriptContent], { type: contentType }),
        scriptName,
      );

      // Add metadata as JSON
      formData.append(
        "metadata",
        new Blob([JSON.stringify(updatedMetadata)], {
          type: "application/json",
        }),
      );

      // Upload worker script with bindings
      const uploadResponse = await api.put(
        `/accounts/${api.accountId}/workers/scripts/${workerName}`,
        formData,
      );

      // Check if the upload was successful
      if (!uploadResponse.ok) {
        const errorData = await uploadResponse
          .json()
          .catch(() => ({ errors: [{ message: uploadResponse.statusText }] }));
        throw new Error(
          `Error uploading worker script: ${errorData.errors?.[0]?.message || uploadResponse.statusText}`,
        );
      }

      // Set up routes if provided
      if (props.routes && props.routes.length > 0 && api.zoneId) {
        // First get existing routes
        const routesResponse = await api.get(
          `/zones/${api.zoneId}/workers/routes`,
        );

        if (routesResponse.ok) {
          const routesData = await routesResponse.json();
          const existingRoutes = routesData.result || [];

          // For each desired route
          for (const pattern of props.routes) {
            const existingRoute = existingRoutes.find(
              (r: any) => r.pattern === pattern,
            );

            if (existingRoute) {
              // Update if script name doesn't match
              if (existingRoute.script !== workerName) {
                const updateRouteResponse = await api.put(
                  `/zones/${api.zoneId}/workers/routes/${existingRoute.id}`,
                  {
                    pattern,
                    script: workerName,
                  },
                );

                if (!updateRouteResponse.ok) {
                  console.warn(
                    `Failed to update route ${pattern}: ${updateRouteResponse.status} ${updateRouteResponse.statusText}`,
                  );
                }
              }
            } else {
              // Create new route
              const createRouteResponse = await api.post(
                `/zones/${api.zoneId}/workers/routes`,
                {
                  pattern,
                  script: workerName,
                },
              );

              if (!createRouteResponse.ok) {
                console.warn(
                  `Failed to create route ${pattern}: ${createRouteResponse.status} ${createRouteResponse.statusText}`,
                );
              }
            }
          }
        } else {
          console.warn(
            "Could not fetch routes:",
            routesResponse.status,
            routesResponse.statusText,
          );
        }
      }

      // Get current timestamp
      const now = Date.now();

      // Construct the output
      const output: WorkerOutput = {
        id: workerName,
        name: workerName,
        script: scriptContent,
        format: props.format || "esm", // Include format in the output
        routes: props.routes || [],
        bindings: props.bindings || [],
        production: props.production !== false,
        createdAt: now,
        updatedAt: now,
      };

      return output;
    }
  },
) {}
