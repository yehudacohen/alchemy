import type { Agent } from "undici";
import { logger } from "./logger.ts";

export async function safeFetch(
  url: string | URL | Request,
  options: RequestInit = {},
  retries = 10,
) {
  let latestErr: any;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fetch(url, {
        ...options,
        // Type assertion to work around Cloudflare Workers type definitions
        dispatcher: await dispatcher(),
      } as RequestInit);
    } catch (err: any) {
      console.log("err", err);
      latestErr = err;
      const shouldRetry =
        isTransientNetworkError(err) || isTransientNetworkError(err.cause);

      if (!shouldRetry || attempt === retries) {
        throw err;
      }

      logger.warn(`Retry ${attempt}/${retries} for ${url}: ${err.code}`);
      await new Promise((r) => setTimeout(r, 250 * attempt)); // exponential backoff
    }
  }
  throw latestErr;
}

function isTransientNetworkError(err: any) {
  return (
    err?.code === "UND_ERR_SOCKET" ||
    err?.code === "ECONNRESET" ||
    err?.code === "UND_ERR_CONNECT_TIMEOUT" ||
    err?.code === "EPIPE" ||
    err?.name === "FetchError"
  );
}

let agent:
  | {
      value: Agent | undefined;
    }
  | undefined;

async function dispatcher() {
  if (agent) {
    return agent.value;
  }
  try {
    // undici not available in all runtimes
    const { Agent } = await import("undici");

    if (!agent) {
      // Configure agent with connection limits to avoid socket errors
      agent = {
        value: new Agent({
          pipelining: 0, // Disable pipelining to avoid connection issues
          // connections: 5, // Limit concurrent connections per host
        }),
      };
    }
  } catch {
    agent = { value: undefined };
  }
  return agent.value;
}
