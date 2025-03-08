// Define the Durable Object class for an atomic counter
export class Counter {
  private state: DurableObjectState;
  private value = 0;

  constructor(state: DurableObjectState) {
    this.state = state;
    // Restore value from storage on initialization
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<number>("value");
      this.value = stored || 0;
    });
  }

  // Handle HTTP requests to the Durable Object
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle different operations based on the path
    if (path === "/increment") {
      // Increment the counter
      this.value++;
      await this.state.storage.put("value", this.value);
      return new Response(this.value.toString());
    } else if (path === "/decrement") {
      // Decrement the counter
      this.value--;
      await this.state.storage.put("value", this.value);
      return new Response(this.value.toString());
    } else if (path === "/reset") {
      // Reset the counter
      this.value = 0;
      await this.state.storage.put("value", this.value);
      return new Response(this.value.toString());
    } else {
      // Default: return the current value
      return new Response(this.value.toString());
    }
  }
}

// Worker script that uses the Counter Durable Object
export default {
  async fetch(request: Request, env: any): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Create a fixed ID for our counter
    const id = env.COUNTER.idFromName("THE_COUNTER");
    const counterObject = env.COUNTER.get(id);

    // Forward the request to the Durable Object
    if (path.startsWith("/counter")) {
      // Rewrite the URL to remove the /counter prefix
      const newUrl = new URL(request.url);
      newUrl.pathname = path.replace("/counter", "");
      const newRequest = new Request(newUrl.toString(), request);
      return counterObject.fetch(newRequest);
    }

    // Default response for other paths
    return new Response(
      `
      <html>
        <body>
          <h1>Atomic Counter Example</h1>
          <p>Use these endpoints to interact with the counter:</p>
          <ul>
            <li><a href="/counter">/counter</a> - Get the current value</li>
            <li><a href="/counter/increment">/counter/increment</a> - Increment the counter</li>
            <li><a href="/counter/decrement">/counter/decrement</a> - Decrement the counter</li>
            <li><a href="/counter/reset">/counter/reset</a> - Reset the counter</li>
          </ul>
        </body>
      </html>
      `,
      {
        headers: {
          "Content-Type": "text/html",
        },
      },
    );
  },
};

// Export the Durable Object class
export { Counter as DurableObject };
