# AccountId

The AccountId resource retrieves a Cloudflare account ID from the API token or environment variables.

# Minimal Example

Gets the account ID using environment variables:

```ts
import { AccountId } from "alchemy/cloudflare";

const accountId = await AccountId("my-account", {});
```

# Custom API Token

Uses a specific API token to get the account ID:

```ts
import { AccountId } from "alchemy/cloudflare";

const accountId = await AccountId("my-account", {
  apiKey: alchemy.secret(process.env.CF_API_TOKEN)
});
```

# Bind to a Worker

Provides the account ID to a Cloudflare Worker:

```ts
import { Worker, AccountId } from "alchemy/cloudflare";

const accountId = await AccountId("my-account", {});

await Worker("my-worker", {
  name: "my-worker", 
  script: "console.log('Hello, world!')",
  bindings: {
    ACCOUNT_ID: accountId
  }
});
```