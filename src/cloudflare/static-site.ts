import { promises as fs } from "fs";
import path from "path";
import { apply } from "../apply";
import { type Context, Resource } from "../resource";
import { createCloudflareApi } from "./api";
import type { WorkerBinding } from "./bindings";
import { generateAssetManifest } from "./generate-asset-manifest";
import { KVNamespace } from "./kv-namespace";
import { uploadAssetManifest } from "./upload-asset-manifest";
import type { WorkerProps } from "./worker";
import { Worker } from "./worker";

/**
 * Idea of using KV with timeout inspired by SST: https://github.com/sst/sst/blob/dev/platform/src/components/cloudflare/static-site.ts
 */

/**
 * Properties for creating or updating a StaticSite
 */
export interface StaticSiteProps {
  /**
   * Name for the site
   * This is mandatory - must be explicitly specified
   */
  name: string;

  /**
   * Path to the directory containing static assets
   */
  directory: string;

  /**
   * Routes to associate with this site
   * Format: example.com/* or *.example.com/*
   */
  routes?: string[];

  /**
   * Custom Worker script to serve the site
   * If not provided, a default script will be used
   */
  workerScript?: string;

  /**
   * Worker script format
   * 'esm' - ECMAScript modules (default)
   * 'cjs' - CommonJS modules
   * @default 'esm'
   */
  format?: "esm" | "cjs";

  /**
   * Custom error page path (relative to directory)
   * @example "404.html"
   */
  errorPage?: string;

  /**
   * Index page filename
   * @default "index.html"
   */
  indexPage?: string;

  /**
   * Configure how the static site's assets are uploaded to KV
   */
  assets?: {
    /**
     * File options for configuring caching behavior
     */
    fileOptions?: {
      /**
       * File pattern(s) to match
       * Can be a glob string or array of glob strings
       */
      files: string | string[];

      /**
       * Files to ignore (glob patterns)
       */
      ignore?: string | string[];

      /**
       * Cache-Control header to set for matching files
       */
      cacheControl: string;

      /**
       * Content-Type to set (overrides auto-detection)
       */
      contentType?: string;
    }[];
  };

  /**
   * Additional Worker bindings to include
   */
  additionalBindings?: WorkerProps["bindings"];

  /**
   * Whether the site should be deployed to production
   * @default true
   */
  production?: boolean;

  /**
   * Custom domain for the site
   */
  domain?:
    | string
    | {
        name: string;
        redirects?: string[];
      };
}

/**
 * Output returned after StaticSite creation/update
 */
export interface StaticSiteOutput {
  /**
   * The ID of the site
   */
  id: string;

  /**
   * The ID of the worker
   */
  workerId: string;

  /**
   * Name for the site
   */
  name: string;

  /**
   * Path to the directory containing static assets
   */
  directory: string;

  /**
   * Routes to associate with this site
   */
  routes?: string[];

  /**
   * Worker script format
   */
  format?: "esm" | "cjs";

  /**
   * Custom error page path
   */
  errorPage?: string;

  /**
   * Index page filename
   */
  indexPage?: string;

  /**
   * Time at which the site was created
   */
  createdAt: number;

  /**
   * Time at which the site was last updated
   */
  updatedAt: number;

  /**
   * List of uploaded asset files
   */
  assets: string[];

  /**
   * Custom domain for the site
   */
  domain?:
    | string
    | {
        name: string;
        redirects?: string[];
      };

  /**
   * Whether the site is deployed to production
   */
  production?: boolean;

  /**
   * The URL of the deployed site
   */
  url?: string;
}

export class StaticSite extends Resource(
  "cloudflare::StaticSite",
  async (ctx: Context<StaticSiteOutput>, props: StaticSiteProps) => {
    if (ctx.event === "delete") {
      // For delete operations, we'll rely on the Worker delete to clean up
      // Return empty output for deleted state
      return;
    }

    // Validate that a name is provided
    if (!props.name) {
      throw new Error(
        "StaticSite name is required - must be explicitly specified",
      );
    }

    // Validate directory exists
    if (!props.directory) {
      throw new Error("Directory is required for StaticSite");
    }

    try {
      const dirStat = await fs.stat(props.directory);
      if (!dirStat.isDirectory()) {
        throw new Error(`"${props.directory}" is not a directory`);
      }
    } catch (error: any) {
      throw new Error(
        `Directory "${props.directory}" does not exist: ${error.message}`,
      );
    }

    // Use the provided name
    const siteName = props.name;
    const indexPage = props.indexPage || "index.html";

    // Create Cloudflare API client with automatic account discovery
    const api = await createCloudflareApi();

    // Step 1: Create or get the KV namespace for assets
    const namespace = new KVNamespace("assets", {
      title: `${siteName}-assets`,
    });

    const [{ id: kvNamespaceId }, assetManifest] = await Promise.all([
      apply(namespace),
      generateAssetManifest(props.directory),
    ]);

    // Step 3: Upload assets to KV
    await uploadAssetManifest(api, kvNamespaceId, assetManifest);

    // Define the worker script path
    const routerScriptPath = path.resolve(__dirname, "static-site-router.ts");

    // Prepare the bindings for the worker
    const bindings: WorkerBinding[] = [
      {
        name: "ASSETS",
        type: "kv_namespace",
        namespace_id: kvNamespaceId,
      },
      {
        name: "INDEX_PAGE",
        type: "plain_text",
        text: indexPage,
      },
    ];

    // Add error page binding if specified
    if (props.errorPage) {
      bindings.push({
        name: "ERROR_PAGE",
        type: "plain_text",
        text: props.errorPage,
      });
    }

    // Add any additional bindings
    if (props.additionalBindings) {
      bindings.push(...props.additionalBindings);
    }

    const worker = new Worker(
      "worker",
      {
        name: siteName,
        format: props.format || "esm",
        routes: props.routes || [],
        // If a custom worker script is provided, use it, otherwise use the entrypoint from router
        ...(props.workerScript
          ? { script: props.workerScript }
          : { entrypoint: routerScriptPath }),
        bindings,
        url: true,
      },
      // place a dependency on the namespace
      namespace.id,
    );

    // Step 4: Create or update the worker
    const { id: workerId, url } = await apply(worker);

    // Get current timestamp
    const now = Date.now();

    // Construct the output
    const output: StaticSiteOutput = {
      id: siteName,
      workerId,
      name: siteName,
      directory: props.directory,
      routes: props.routes || [],
      format: props.format || "esm",
      errorPage: props.errorPage,
      indexPage,
      assets: assetManifest.map((item) => item.key),
      createdAt: ctx.output?.createdAt || now,
      updatedAt: now,
      domain: props.domain,
      production: props.production !== false,
      url,
    };

    return output;
  },
) {}
