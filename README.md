# Alchemy

Alchemy is a TypeScript-native, embeddable Infrastructure as Code (IaC) framework designed for the AI-era where the cost of implementing CRUD operations is quickly approaching 0 thanks to generative AI.

The only requirement to use Alchemy is a JavaScript runtime. There's no mandatory CLI, service, or any strict opinions on how you structure your codebase.

# Features

- **JS-native** - no second languages, toolchains, dependencies, processes, services, etc. to lug around.
- **ESM-native** - built exclusively on ESM, with a preference for modern JS runtimes like Bun.
- **Embeddable** - runs in any JavaScript/TypeScript environment, including the browser!
- **Extensible** - implement your own resources with a simple function.
- **AI-first** - Since Cursor (and other AI IDEs) are exceptional at CRUD, Alchemy actively encourages you create/copy/fork/modify resources to fit your needs. No more waiting around for a provider to be implemented.
- **No dependencies** - All you need is a JavaScript runtime and the `alchemy` core package.
- **No service** - It's just a library that runs JavaScript. State files are stored locally in your project and can be easily inspected, modified, checked into your repo, etc.
- **No strong opinions** - Structure your codebase however you want, store state anywhere - we don't care!

# Getting Started

> [!NOTE]
> You can see a comprehensive example involving a DynamoDB Table, IAM Role, Bundling and AWS Lambda [here](./examples/app.ts).

An alchemy "app" (if you want to call it that) is just an ordinary TypeScript script. Once you've installed the `alchemy` package, you can start using it however you want.

```bash
# I recommend bun, but you can use any JavaScript runtime.
bun add alchemy
```

Usually, you'll want to create a script where you'll define your resources.

```ts
import { Role } from "alchemy/aws";

const role = new Role("my-role", {
  name: "my-role",
  //..
});
```

## `alchemize`

And, then call `alchemize` at the end to trigger the Create/Update/Delete lifecycle.

```ts
await alchemize();
```

`alchemize` will walk the graph, create new resources, update modified resources and then delete "orphaned" resources at the end. This is equivalent to `terraform apply`, `pulumi up`, `cdk deploy`, etc.

## `apply` and `destroy`

Even `alchemize` is optional. Any object in your graph (`Resource` or `Output<T>`) can be "applied" or "destroyed" individually.

```ts
const role = new Role("my-role", {
  name: "my-role",
  //..
});

const func = new Function("my-function", {
  name: "my-function",
  role: role.roleArn,
  //..
});

import { apply, destroy } from "alchemy";

// will create Role and then Function (in that order)
const { functionArn } = await apply(func);

// you can destroy it right after if you want ☠️
await destroy(func); // will delete just the Function

// destroy deletes the resource and any downstream dependencies
// so, if you want to delete Role AND Function, you should call destroy(role)
await destroy(role); // will delete Role and then Function
```

## Destroying the app

To destroy the app, you can call `alchemize` with the `mode: "destroy"` option. This will delete all resources in the specified or default stage.

```ts
await alchemize({ mode: "destroy", stage: <optional> });
```

## "Stage" and State

Alchemy supports a "stage" concept so that you can isolate different environments from each other. E.g. a "user" or "dev" or "prod" stage.

Stage is designed to be as simple as possible. Its only responsibility is to isolate the state files from each other which are stored in `.alchemy/{stage}/{resourceID}.json`.

By default, the stage is assumed to be your user name. This is a sensible default for developing locally. To override the stage, you have two options:

1. Pass the `stage` option to `alchemize`/`apply`/`destroy` (recommended)

```ts
// alchemize the entire app
await alchemize({ stage: "production" });

// apply a single resource
await apply(func, { stage: "production" });
```

2. Set the `ALCHEMY_STAGE` environment variable (not recommended, but available as an escape hatch)

```sh
ALCHEMY_STAGE=production bun ./my-app.ts
```

Each Resource has access to the stage it's being deployed

> [!CAUTION]
> It is up to you to ensure that the physical names of resources don't conflict - alchemy does not (yet) offer any help or opinions here. You must decide on physical names. But, you're free to come add name generation logic to your resources if you so desire.

## Philosophy and comparison with existing IaC frameworks

Today's IaC frameworks are extremely complex, heavy and slow. You can't integrate them into your workflow without bringing in a large toolchain. You also can't easily build your own resources (although it is possible).

Alchemy is in direct contrast to Terraform, Pulumi, SST and the AWS CDK, which all provide similar capabilities, but come with high cost in terms of performance, portability, extensibility and ease of use:

- Terraform requires you to learn a custom language and adopt a custom toolchain
- Pulumi wraps Terraform and relies on complicated "providers" implemented in Go running in a separate process.
- SST wraps Pulumi 😅 and is primarily designed for deploying a single web app.
- The CDK generates CloudFormation templates and can only do what the CloudFormation JSON DSL allows.

Most importantly, none (!) of these frameworks are TypeScript/JavaScript-native. You can't run them in the browser and you can't easily extend them without either dipping down to Go or deploying Custom Resources to AWS Lambda and waiting an eternity.

Alchemy, on the other hand, is a small TypeScript code-base that can run anywhere. Instead of relying on large catalogs of "Resource Providers", Alchemy actively encourages you to implement your own. All resources are "custom resources", so to speak.

## Creating a Resource Provider

To implement your own resources, you just need one function that implements the Create, Update, Delete lifecycle operations.

```ts
interface TableInputs {
  name: string;
  //..
}
interface TableOutput {
  tableArn: string;
}
class Table extends Resource(
  "dynamo::Table",
  async (ctx: Context<TableOutput>, inputs: TableInputs) => {
    if (ctx.event === "create") {
      // create logic
    } else if (ctx.event === "update") {
      // update logic
    } else if (ctx.event === "delete") {
      // delete logic
    }
    // ..
    return output;
  }
) {}
```

That's it! Now you can instantiate tables in your app.

```ts
const table = new Table("items", {
  name: "items",
  //..
});

table.tableArn; // Output<string>
```
