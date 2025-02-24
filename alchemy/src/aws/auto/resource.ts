import { Resource } from "alchemy";
import { kebabCase } from "change-case";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { generateObject } from "../../agent/ai";
import { resolveModel } from "../../agent/model";
import { Requirements } from "../../markdown/requirements";
import { TypeScriptFile } from "../../typescript";
import { AWSDocReference } from "./docs";
import type { CfnResource } from "./spec";

export class AWSResource extends Resource(
  "cfn-resource",
  async (
    ctx,
    props: CfnResource & {
      ServiceName: string;
      requirementsDir: string;
      srcDir: string;
      rootDir: string;
    },
  ) => {
    if (ctx.event === "delete") {
      return;
    }

    // Load relevant Terraform provider implementation files for this resource
    const terraformServicePath = path.join(
      props.rootDir,
      "3p",
      "terraform-provider-aws",
      "internal",
      "service",
      props.ServiceName.toLowerCase(),
    );

    const files = await fs.readdir(terraformServicePath);
    const resourcePrefix = kebabCase(props.ResourceName).toLowerCase();
    const goFiles = files.filter(
      (file) => file.endsWith(".go") && !file.endsWith("_test.go"),
    );

    if (goFiles.length === 0) {
      throw new Error(
        `No Terraform implementation files found for resource ${props.ResourceName} in ${terraformServicePath}. Expected files starting with "${resourcePrefix}"`,
      );
    }

    // Identify relevant files using AI
    const { relevantFiles } = await identifyRelevantFiles(
      props.ResourceName,
      props.ServiceName,
      goFiles,
      resourcePrefix,
      props,
    );

    if (relevantFiles.length === 0) {
      throw new Error(
        `No relevant Terraform implementation files identified for resource ${props.ResourceName}`,
      );
    }

    console.log(
      `Found ${relevantFiles.length} relevant files for ${props.ResourceFQN}:`,
    );
    for (const file of relevantFiles) {
      console.log(`  - ${file}`);
    }

    const fileContents = await Promise.all(
      relevantFiles.map(async (file) => {
        const content = await fs.readFile(
          path.join(terraformServicePath, file),
          "utf-8",
        );
        return `// ${file}\n${content}`;
      }),
    );

    const terraformImplementation = fileContents.join("\n\n");

    const requirements = new Requirements("requirements", {
      modelId: "o3-mini",
      reasoningEffort: "high",
      file: path.join(
        props.requirementsDir,
        kebabCase(props.ResourceName) + ".md",
      ),
      requirements: [
        `Due to problems relying on the AWS CloudFormation Service, we have decided
to reproduce the CRUD lifecycle of the ${props.ResourceName} resource locally using
TypeScript and the AWS SDK v3.

Before proceeding, we need to clearly define the requirements for this Resource's lifecycle handler, covering the following aspects:
1. Input and Output contract. These are the input properties that are accepted by CloudFormation
and the output Attributes produced and referenceable after the resource has been created. Don't be lazy by just referencing the documentation, you should describe the property and its behavior explicitly in the requirements document.
2. Update lifecycle for each property. This determines the behavior of the CRUD lifecycle when
a property changes, e.g. when a resource must be REPLACED when a property changes, or whether it can be mutated with a PUT.
3. AWS APIs that must be called to create this "CloudFormation Resource". This is not always 1:1, e.g. an IAM Role may have Policies that need to be created and attached.
4. Waiting for stabilization - AWS resources can take time to fully stabilize and be ready for use. Our Resource should wait and poll until the resource is ready. Please identify the resources that require stabilization check and which API call can be used to check the status reliably.
Note: ideally, stabilization checks are performed downstream where they are used (i.e. optimistically instead of pessimistically), so we should analyze this Resource's upstream dependencies and define any checks that should be performed.
5. Create, Update and Delete lifecycle procedure. What operations should be performed on CREATE, UPDATE and DELETE?
6. Error handling. Point out specific error codes for AWS APIs that require special handling an describe how.

Don't be vague. This is a specific requirements doc. Information like "robust" blah-blah is not relevant. Simply focus on the details of the AWS Resource, its contract, composite parts, error handling and lifecycle.

Based on analysis of the Terraform AWS Provider implementation below, be sure to identify:
- Important edge cases and error conditions that need special handling
- API call patterns and sequences that have been proven to work
- Stabilization and wait conditions that are necessary
- Any specific error codes or scenarios that require retry logic or special handling

Here is the relevant Terraform implementation:
${terraformImplementation}

Below is the CloudFormation Resource Specification for the ${props.ResourceName} resource:
${JSON.stringify(props, null, 2)}
`,
      ],
    });

    // First, fetch AWS SDK documentation
    const docReference = new AWSDocReference("docs", {
      serviceName: props.ServiceName,
      resourceName: props.ResourceName,
      requirements: requirements.content,
    });

    const exampleDir = path.join(props.rootDir, "alchemy", "src", "aws");
    const fewShotExamples = await Promise.all(
      (await fs.readdir(exampleDir))
        .filter((file) => file.endsWith(".ts"))
        .map(async (file) => {
          const content = await fs.readFile(
            path.join(exampleDir, file),
            "utf-8",
          );
          return `// ${file}\n${content}`;
        }),
    );

    const implementation = new TypeScriptFile("implementation", {
      modelId: "claude-3-5-sonnet-20241022",
      path: path.join(props.srcDir, kebabCase(props.ResourceName) + ".ts"),
      projectRoot: __dirname,
      typeCheck: true,
      requirements: requirements.content.apply((requirements) =>
        docReference.content.apply(
          (
            docs,
          ) => `Implement the ${props.ResourceName} using TypeScript and AWS SDK V3.

Requirements:
${requirements}

API SDK v3 Documentation:
${docs}

Here is the Terraform Go implementation that we can learn from:
${terraformImplementation}

Here are some examples of how this has been done before. Make sure to follow the same structure and style of defining input and output contracts as types and then export a class using the mixin pattern and implement the lifecycle as a function, using ctx.event to detect CREATE, UPDATE and DELETE events:
${fewShotExamples.join("\n")}

One slight difference from the example is that the \`ignore\` and \`Resource\` functions should be imported from alchemy

import { type Context, Resource, ignore } from "alchemy";

Make sure to add an explicit type for Context<T>

async (ctx: Context<OutputType>, props: InputType) => Promise<OutputType> { .. }

It must be the OutputType. This avoids problems like it ctx.output being \`unknown\`.

Another common gotcha is that ctx.outputs only exists when ctx.event is update | delete. You will get type error when it is create.

For reference, here is what the Context object looks like:
export type Context<Outputs> = {
  stage: string;
  resourceID: ResourceID;
  scope: IScope;
  /**
   * Indicate that this resource is being replaced.
   * This will cause the resource to be deleted at the end of the stack's CREATE phase.
   */
  replace(): void;
} & (
  | {
      event: "create";
    }
  | {
      event: "update" | "delete";
      output: Outputs;
    }
);
`,
        ),
      ),
    });

    return {
      requirements,
      implementation,
    };
  },
) {}

const RelevantFilesSchema = z.object({
  /**
   * List of Go file names that are relevant for implementing the CRUD lifecycle
   * for this resource
   */
  relevantFiles: z.array(z.string()),
});

async function identifyRelevantFiles(
  resourceName: string,
  serviceName: string,
  files: string[],
  resourcePrefix: string,
  cfnSpec: CfnResource,
): Promise<z.infer<typeof RelevantFilesSchema>> {
  const model = await resolveModel("gpt-4o");

  const result = await generateObject({
    model,
    schema: RelevantFilesSchema,
    temperature: 0.1,
    messages: [
      {
        role: "system",
        content:
          "You are an expert at AWS service implementations and Go code analysis. Your task is to identify ONLY the Go files that are specifically implementing the given AWS resource's CRUD lifecycle, excluding any files that work with other resources.",
      },
      {
        role: "user",
        content: `Please identify which Go files are specifically implementing the CRUD lifecycle for the AWS::${serviceName}::${resourceName} resource.

Available files (all in the ${serviceName.toLowerCase()} package):
${files.map((f) => `- ${f}`).join("\n")}

CloudFormation Resource Specification:
${JSON.stringify(cfnSpec, null, 2)}

Selection Rules:
1. ONLY select files that are specifically implementing this exact resource type (AWS::${serviceName}::${resourceName})
2. Files must handle one or more of:
   - Resource creation and deletion
   - Resource updates and modifications
   - Resource state checking and stabilization
   - Resource validation
3. Strict Exclusions:
   - Test files
   - Files working with other resource types
   - General utility files (unless they are ONLY used by this resource)
   - Files that just happen to share a similar prefix but work with different resources
4. Files should start with the prefix: ${resourcePrefix}

Important: Be very strict about only including files that are specifically working with this exact resource type. If a file works with multiple resources or similar resources, exclude it unless it's absolutely essential for this resource's implementation.

Return ONLY the list of relevant file names.`,
      },
    ],
  });

  return result.object;
}
