import { alchemize } from "alchemy";
import { Agent, Requirements, TypeScriptFile } from "alchemy/agent";
import { Folder } from "alchemy/fs";
import { kebabCase } from "change-case";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type UpdateType = "Immutable" | "Mutable" | "Conditional";

type PrimitiveType = "String" | "Double" | "Integer" | "Json";

type PropertySpec =
  | {
      Type?: never;
      PrimitiveType?: never;
      Documentation: string;
      Properties: {
        [propertyName: string]: {
          Documentation: string;
          Type: "Extensions" | "Subject";
          UpdateType: UpdateType;
          Required: boolean;
        };
      };
    }
  | {
      Type: "List" | "Map";
      PrimitiveType?: PrimitiveType;
      Required: boolean;
      ItemType: string;
      UpdateType: UpdateType;
    }
  | {
      Type?: never;
      PrimitiveType: PrimitiveType;
      Documentation: string;
      UpdateType: UpdateType;
      Required: boolean;
    };

type ResourceProperty = {
  [propertyName: string]: {
    Documentation: string;
    UpdateType: UpdateType;
    Required: boolean;
  } & (
    | {
        Type: string;
        PrimitiveType?: never;
      }
    | {
        Type: "List";
        ItemType?: string;
        PrimitiveItemType?: PrimitiveType;
        DuplicatesAllowed: boolean;
      }
    | {
        Type?: never;
        PrimitiveType: PrimitiveType;
      }
  );
};

type ResourceSpec = {
  Documentation: string;
  Properties: ResourceProperty;
  Attributes?: {
    [attributeName: string]: {
      PrimitiveType: PrimitiveType;
    };
  };
};

interface CfnSpec {
  PropertyTypes: {
    [propertyFQN: `${keyof CfnSpec["ResourceTypes"]}.${string}`]: PropertySpec;
  };
  ResourceTypes: {
    [key: `AWS::${string}::${string}`]: ResourceSpec;
  };
  ResourceSpecificationVersion: string;
}

async function loadSpec(): Promise<CfnSpec> {
  const awsSpecURL =
    "https://dnwj8swjjbsbt.cloudfront.net/latest/gzip/CloudFormationResourceSpecification.json";

  const specPath = path.join(__dirname, "cfn.json");

  let awsSpec;
  try {
    awsSpec = JSON.parse(await Bun.file(specPath).text());
  } catch {
    awsSpec = await (await fetch(awsSpecURL)).json();
    await Bun.write(specPath, JSON.stringify(awsSpec, null, 2));
  }
  return awsSpec as CfnSpec;
}

const cfnSpec = await loadSpec();

const resources = Object.keys(cfnSpec.ResourceTypes).map((resourceType) => {
  const [partition, service, resource] = resourceType.split("::");

  return {
    partition,
    service,
    resource,
  };
});
const awsServices = resources.filter(({ partition }) => partition === "AWS");
const awsServiceGroups = awsServices.reduce<CfnServices>((acc, service) => {
  if (!acc[service.service]) {
    acc[service.service] = {
      ServiceName: service.service,
      Resources: {},
    };
  }
  const spec = {
    ...cfnSpec.ResourceTypes[`AWS::${service.service}::${service.resource}`],
    ServiceName: service.service,
    ResourceName: service.resource,
    ResourceFQN: `AWS::${service.service}::${service.resource}`,
  } as CfnResource;
  for (const [propertyName, property] of Object.entries(spec.Properties)) {
    if (property.Type && !["List", "Map"].includes(property.Type)) {
      const propFQN = `${spec.ResourceFQN}.${propertyName}`;
      const propertySpec = {
        ...cfnSpec.PropertyTypes[propFQN],
        PropertyFQN: propFQN,
      };
      // @ts-ignore
      property.Spec = propertySpec;
      if (propertySpec === undefined) {
        throw new Error(`Property ${propertyName} has no spec`);
      }
    }
  }
  acc[service.service].Resources[service.resource] = spec;
  return acc;
}, {} as CfnServices);

// console.log(awsServiceGroups.Lambda.Version);

type CfnResource = ResourceSpec & {
  ServiceName: string;
  ResourceName: string;
  ResourceFQN: string;
  Properties: {
    [propertyName: string]: ResourceProperty & {
      Spec: PropertySpec;
    };
  };
};

type CfnService = {
  ServiceName: string;
  Resources: {
    [resourceName: string]: CfnResource;
  };
};
type CfnServices = Record<string, CfnService>;

class AWSService extends Agent(
  "aws-service",
  {
    description: "Generate a Service implementation for a given AWS service",
  },
  async (
    ctx,
    props: CfnService & {
      requirementsDir: string;
      srcDir: string;
    },
  ) => {
    const serviceDir = new Folder(
      "service",
      path.join(props.requirementsDir, kebabCase(props.ServiceName)),
    ).path;
    const srcDir = new Folder(
      "src",
      path.join(props.srcDir, kebabCase(props.ServiceName)),
    ).path;
    return Object.entries(props.Resources).map(([resourceName, resource]) => {
      return new AWSResource(resourceName, {
        ...resource,
        requirementsDir: serviceDir,
        srcDir,
      });
    });
  },
) {}

class AWSResource extends Agent(
  "cfn-resource",
  {
    description: "Generate a Resource implementation for a given AWS resource",
  },
  async (
    ctx,
    props: CfnResource & {
      requirementsDir: string;
      srcDir: string;
    },
  ) => {
    const requirements = new Requirements("requirements", {
      modelId: "gpt-4o",
      path: path.join(
        props.requirementsDir,
        kebabCase(props.ResourceName) + ".md",
      ),
      title: props.ResourceName,
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

Below is the CloudFormation Resource Specification for the ${props.ResourceName} resource:
${JSON.stringify(props, null, 2)}
`,
      ],
    });

    const exampleDir = path.join(
      __dirname,
      "..",
      "alchemy",
      "src",
      "components",
      "aws",
    );
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
      requirements: requirements.content.apply(
        (
          content,
        ) => `Implement the ${props.ResourceName} using TypeScript and AWS SDK V3.

Requirements:
${content}

Here are some examples of how this has been done before. Make sure to follow the same structure and style of defining input and output contracts as types and then export a class using the mixin pattern and implement the lifecycle as a function, using ctx.event to detect CREATE, UPDATE and DELETE events:
${fewShotExamples.join("\n")}

One slight difference from the example is that the \`ignore\` and \`Resource\` functions should be imported from alchemy

import { Resource, ignore } from "alchemy";`,
      ),
    });

    return {
      requirements,
      implementation,
    };
  },
) {}

const requirementsDir = new Folder(
  "requirementsDir",
  path.join(__dirname, "requirements"),
);

const srcDir = new Folder("src", path.join(__dirname, "src"));

const iam = new AWSService("AWS::IAM", {
  ...awsServiceGroups.IAM,
  requirementsDir: requirementsDir.path,
  srcDir: srcDir.path,
});

await alchemize({
  mode: process.argv.includes("destroy") ? "destroy" : "up",
});
