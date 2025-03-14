// see: https://developers.cloudflare.com/workers/runtime-apis/cache/
declare var caches: any;

// injected by src/cloudflare/static-site.ts
declare var __ASSET_MANIFEST__: Record<string, string>;

export interface Env {
  ASSETS: KVNamespace;
  INDEX_PAGE: string;
  ERROR_PAGE?: string;
  /**
   * Optional backend worker bound to this static site
   * Used to handle requests that don't match any static files
   */
  BACKEND_WORKER?: Service;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/^\//, "");
    const filePath = pathname === "" ? env.INDEX_PAGE : pathname;

    if (pathname.startsWith("api/") && env.BACKEND_WORKER) {
      return env.BACKEND_WORKER.fetch(request);
    }

    // Return from cache if available
    const cachedResponse = await lookupCache();
    if (cachedResponse) {
      return cachedResponse;
    }

    // Fetch from KV
    {
      const object = await env.ASSETS.getWithMetadata(filePath);
      if (object.value) {
        return await respond(200, filePath, object);
      }
    }
    {
      const guess =
        filePath + (filePath.endsWith("/") ? "" : "/") + "index.html";
      const object = await env.ASSETS.getWithMetadata(guess);
      if (object.value) {
        return await respond(200, guess, object);
      }
    }
    {
      const guess = filePath + ".html";
      const object = await env.ASSETS.getWithMetadata(guess);
      if (object.value) {
        return await respond(200, guess, object);
      }
    }

    // Handle error page
    if (env.ERROR_PAGE) {
      const object = await env.ASSETS.getWithMetadata(env.ERROR_PAGE);
      if (object.value) {
        return await respond(404, env.ERROR_PAGE, object);
      }
    } else {
      const object = await env.ASSETS.getWithMetadata(env.INDEX_PAGE);
      if (object.value) {
        return await respond(200, env.INDEX_PAGE, object);
      }
    }

    if (env.BACKEND_WORKER) {
      // Fallback to the backend worker for server-side processing
      // if the request doesn't match any static files
      return env.BACKEND_WORKER.fetch(request);
    }

    return new Response("Page Not Found", { status: 404 });

    async function lookupCache() {
      const cache = caches.default;
      const r = await cache.match(request);

      // cache does not exist
      if (!r) return;

      // cache exists but etag does not match
      if (r.headers.get("etag") !== __ASSET_MANIFEST__[filePath]) return;

      // cache exists
      return r;
    }

    async function saveCache(response: Response) {
      const cache = caches.default;
      await cache.put(request, response.clone());
    }

    async function respond(
      status: number,
      filePath: string,
      object: KVNamespaceGetWithMetadataResult<any, any>,
    ) {
      // build response
      const headers = new Headers();
      if (__ASSET_MANIFEST__[filePath]) {
        headers.set("etag", __ASSET_MANIFEST__[filePath]);
        headers.set("content-type", object.metadata.contentType);
        headers.set("cache-control", object.metadata.cacheControl);
      }
      // TODO: do we need base64 encoded here?
      // const response = new Response(base64ToArrayBuffer(object.value), {
      const response = new Response(object.value, {
        status,
        headers,
      });

      if (request.method === "GET") {
        await saveCache(response);
      }

      return response;
    }
  },
};
