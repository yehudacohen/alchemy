# Alchemy

Alchemy is a JS-native, embeddable Infrastructure as Code (IaC) framework designed to run in any JavaScript runtime, including the browser.

Alchemy fully embraces AI code generation at its core, even going so far as to encourage you to fork this repo and include it in your project as a Git submodule (instead of installing as a dependency) so that you can modify the core resources to fit your needs. Contribute 'em back if you want, or not - that's fine too!

AI is so damn good at CRUD, so good that we no longer need to shackle ourselves to heavy toolchains like Pulumi and Terraform. All of the pre-built components in [./src/components](./src/components) were generated in less than a few minutes. Use them if you want, or create your own. It's that easy.

[![Demo](./alchemy.gif)](./alchemy.gif)

# Features

- **JS-native** - no second language, toolchains, dependencies, processes, services, etc. to lug around.
- **ESM-native** - built exclusively on ESM, with a slight preference for modern JS runtimes like Bun.
- **Embeddable** - runs in any JavaScript/TypeScript environment, including the browser!
- **Extensible** - implement your own resources with a simple function.
- **AI-first** - since Cursor (and other AI IDEs) are exceptional at CRUD, Alchemy actively encourages you create/copy/fork/modify resources to fit your needs. No more waiting around for a provider to be implemented - just do it yourself.
- **No dependencies** - All you need is a JavaScript runtime and the `alchemy` core package (which has 0 required dependencies).
- **No service** - It's just a library that runs JavaScript. State files are stored locally in your project and can be easily inspected, modified, checked into your repo, etc.
- **No strong opinions** - Structure your codebase however you want, store state anywhere - we don't care!

# Getting Started

> [!NOTE]
> You can see a comprehensive example involving a DynamoDB Table, IAM Role, Bundling and AWS Lambda [here](./examples/app.ts).

An alchemy "app" (if you want to call it that) is just an ordinary TypeScript or JavaScript script. Once you've installed the `alchemy` package, you can start using it however you want.

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

Then, call `alchemize` at the end to trigger the Create/Update/Delete lifecycle.

```ts
await alchemize();
```

Finally, run your script.

```sh
bun ./my-app.ts
```

You'll notice some files show up in your repo:

```
.alchemy/
  - sam/
    - my-role.json
```

Go ahead, click on one and take a look. Here's how my role looks:

```jsonc
{
  "provider": "iam::Role",
  "data": {},
  "deps": [],
  "status": "updated",
  "output": {
    "roleName": "alchemy-api-lambda-role"
    // ..
  },
  "inputs": [
    {
      "roleName": "alchemy-api-lambda-role",
      "assumeRolePolicy": {
        "Version": "2012-10-17"
        // ..
      }
    }
  ]
}
```

> [!TIP]
> Alchemy goes to great effort to be fully transparent. State is just a JSON file, nothing more. You can inspect it, modify it, commit it to your repo, etc.

## `alchemize`

Calling `alchemize` will create new resources, update modified resources and then delete "orphaned" resources at the end. This is equivalent to `terraform apply`, `pulumi up`, `cdk deploy`, etc. except really fast and in your control.

## Creating a Resource Provider

Adding new resources is the whole point of Alchemy, and is therefore very simple.

A Resource provider is just a function with a globally unique name, e.g. `dynamo::Table`, and an implementation of the Create, Update, Delete lifecycle operations.

E.g. below we show what a simple `dynamo::Table` provider might look like.

> [!NOTE]
> See [table.ts](./src/components/aws/table.ts) for the full implementation.

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

> [!TIP]
> Use Cursor or an LLM like Claude/OpenAI to generate the implementation of your resource. I think you'll be pleasantly surprised at how well it works, especially if you provide the API reference docs in your context.

```ts
const table = new Table("items", {
  name: "items",
  //..
});

table.tableArn; // Output<string>
```

You may have noticed the odd pattern of extending the result of a function call, `extends Resource(..)`. This is called the "mix-in" pattern and is optional. You are free to just use a `const` instead:

```ts
const Table = Resource("dynamo::Table", async (ctx, inputs) => {
  //..
});

const table = new Table("items", {
  name: "items",
  //..
});
```

> [!TIP]
> I recommend using a class so each resource has a type, e.g. `Table`, and a place to add helper/utility methods. Totally optional, though. Knock yourself out.

## Lazy Outputs

A Resource is evaluated lazily (not when you call `new`), so you can't immediately access the value of a property like `tableArn` or `functionArn`. Instead you reference properties using the `Output<T>` interface.

```ts
const table = new Table("my-table", { .. });

const tableArn = table.tableArn; // Output<string>
```

Outputs can be chained explicitly and implicitly:

1. _Explicitly_ with `.apply`

```ts
const tableArn: Output<string> = table.tableArn.apply((arn: string) =>
  // do something with the arn string value
  arn.replace("table", "arn:aws:dynamodb:")
);
```

2. _Implicitly_ chained

```ts
const tableArn = table.attributeDefinitions[0].attributeName; // Output<string>
// equivalent to:
// table.apply(t => t.attributeDefinitions[0].attributeName);
```

> [!NOTE]
> Output is inspired by Pulumi, with a little extra added sugar.

## `apply` and `destroy`

Calling `alchemize` is optional. Any object in your graph (`Resource` or `Output<T>`) can be "applied" or "destroyed" individually and programmatically.

Say, you've got some two resources, a `Role` and a `Function`.

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
```

Each of these Resources is known as a "sub-graph".

In this case we have `Role` (a 1-node graph, `Role`), and `Function` (a 2-node graph, `Role → Function`).

Each sub-graph can be "applied" or "destroyed" individually using the `apply` and `destroy` functions:

```ts
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

To destroy the whole app (aka. the whole graph), you can call `alchemize` with the `mode: "destroy"` option. This will delete all resources in the specified or default stage.

```ts
await alchemize({ mode: "destroy", stage: <optional> });
```

> [!TIP]
> Alchemy is designed to have the minimum number of opinions as possible. This "embeddable" design is so that you can implement your own tools around Alchemy, e.g. a CLI or UI, instead of being stuck with a specific tool.
>
> ```ts
> await alchemize({
>   // decide the mode/stage however you want, e.g. a CLI parser
>   mode: process.argv[2] === "destroy" ? "destroy" : "up",
>   stage: process.argv[3],
> });
> ```

## "Stage" and State

Alchemy supports a "stage" concept to help isolate different environments from each other. E.g. a `"user"` or `"dev"` or `"prod"` stage.

By default, the stage is assumed to be your user name (a sensible default for local development).

> [!NOTE]
> Stage is inspired by [SST](https://sst.dev)'s stage concept.

To override the stage, you have two options:

1. Pass the `stage` option to `alchemize`/`apply`/`destroy` (recommended)

```ts
// alchemize the entire app
await alchemize({ stage: "production" });

// apply a single resource
await apply(func, { stage: "production" });
```

2. Config in `./alchemy.ts` (up to you if you want to have a global config). See the [alchemy.ts section](#global-values-and-the-alchemy-ts-config-file) for more details.

```ts
export default {
  defaultStage: "production",
};
```

3. Set the `ALCHEMY_STAGE` environment variable (not recommended, but available as an escape hatch)

```sh
ALCHEMY_STAGE=production bun ./my-app.ts
```

Each Resource "provider" can access the stage it's being deployed to via the `ctx.stage` property.

```ts
class Table extends Resource("dynamo::Table", async (ctx, inputs) => {
  ctx.stage; // "production"
});
```

> [!CAUTION]
> It is up to you to ensure that the physical names of resources don't conflict - alchemy does not (yet) offer any help or opinions here. You must decide on physical names, but you're free to add name generation logic to your resources if you so desire.
>
> ```ts
> class Table extends Resource("dynamo::Table", async (ctx, inputs) => {
>   const tableName = `${ctx.stage}-${inputs.tableName}`;
>
>   // ..
> });
> ```

## Global values and the `alchemy.ts` config file.

Alchemy looks for a `${cwd}/alchemy.ts` file and imports it if it finds it. This can be useful for emulating SST's `sst.config.ts` file as a convention for global configuration.

It supports overriding the `defaultStage` (instead of defaulting to your username) and providing a custom `stateStore` (instead of writing to the local file system).

```ts
import type { Config } from "alchemy";

export default {
  defaultStage: "dev",
  stateStore: myCustomStateStore,
} satisfies Config;
```

> [!NOTE]
> See [global.ts](./src/global.ts).

## Philosophy and comparison with existing IaC frameworks

I built alchemy after years of working with every other option. IaC is non-negotiable in my opinion, and has been one of my favorite technologies as a developer.

I started with CloudFormation (since I worked at Amazon) and hated that. Fuck deploying JSON to a slow service, am I right? The CDK was a huge upgrade on that (yay for TypeScript) but it is limited by the CloudFormation service (which is slow to change and slow to use) and has very strong opinions on how and where it should be used.

For example, the CDK is written in a "meta" language called JSII. Which is a subset of TypeScript designed to be compiled to Java, Python, etc. This means you're not free to use all TypeScript features (which are ideal for configuration as code). It's also coupled to synchronous I/O - it is damn near impossible to do anything async, making it slow and clunky. Finally, the CDK is still tied to CJS and doesn't support ESM. Taking a dependency on the CDK will 10x the size of your bundle and destroy your DX.

Later, I moved on to Pulumi, which was a nice change of pace since it runs locally and is much faster. You can cancel a deployment by hitting Ctrl+C (hallelujah!). It also supported more than just AWS, which is useful for managing all your resources, such as Stripe, GitHub or another provider like Cloudflare.

However, Pulumi is largely a wrapper around Terraform and relies on complicated "providers" implemented with Go, running in a separate process. It can't run anywhere (like the browser). Different languages work better/worse than others and always have "sharp edge" limitations and gotchas. Custom Resources are possible but more of an afterthought and a PITA to implement.

I've used Terraform when I've been forced into it, e.g by the Coder service. It's ... ok ... but I don't love it. It's a custom DSL and a heavy toolchain for what, calling a few CRUD APIs? Way overkill. Every time I think about implementing a custom resource for Terraform, I just can't bring myself to do it. Let me just write a function please!

Now, I've been using SST because I've been doing a ton of web development. At first, I really liked SST, especially because of its local development experience. `sst dev` gives you live deploy, a TUI multiplexer and a proxy from the cloud to your local code. This is great for building web apps in AWS.

But, as my app grew, SST's bugs ate away at me. I got blocked by broken resources that have race conditions and it was impossible to workaround. I also wanted to deploy a nested app (another `sst.config.ts`) which didn't gel well with the generated `sst-env.d.ts` files.

Again, I was let down by the complexity and opinions of my chosen IaC framework. And for what? To help me call a few CRUD APIs? Honestly, it just seems insane how far we've drifted away from simplicity in this area.

This started to become even more apparent as I started using Cursor more and more to write code.

You see, lately I've found myself doing more frontend than I've ever done before. And, I'm not a good frontend developer. So, I relied on Cursor to write most of the code for me. And, as many others have experienced, Cursor totaly blew my mind 🤯. Cursor is just really, really, really good at TypeScript, React and Tailwind. I've built a functioning and (if i don't say so myself) good looking SPA. It's been a blast.

But, this got me thinking ... you know what else Cursor is really great at? Perhaps even better at? Interacting with CRUD APIs. While there's a ton of frontend training data for LLMs, there's just as much (if not more) training data for CRUD lifecycle operations. There's also all of Terraform, Pulumi, SST and the AWS CDK's training data. All. Of. It.

Long story short, I discovered that Cursor can pretty much one-shot the implementation of Resources. All of the resources in [./src/components](./src/components) are entirely generated on-demand (1 minute time investment, tops). When I run into a bug, I just explained it to Cursor who fixed it immediately.

This is a game changer. It means we don't need tools like Terraform to build suites of "provider" libraries for us. We just need the engine - the bit that tracks state and decides what to create/update/delete. The rest can be generated at near zero cost.

This story is ultimately why I built Alchemy - I just wanted total control and freedom over how I deploy my resources. And, I wanted it to be in TypeScript, so I can use its amazing type system. And I wanted it to be embeddable, so I can use it anywhere, maybe even in a React app. "Reactive IaC", anyone?
