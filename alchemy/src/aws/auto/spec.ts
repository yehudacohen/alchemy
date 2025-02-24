import path from "node:path";

export interface CfnSpec {
  PropertyTypes: {
    [propertyFQN: `${keyof CfnSpec["ResourceTypes"]}.${string}`]: PropertySpec;
  };
  ResourceTypes: {
    [key: `AWS::${string}::${string}`]: ResourceSpec;
  };
  ResourceSpecificationVersion: string;
}

export type UpdateType = "Immutable" | "Mutable" | "Conditional";

export type PrimitiveType = "String" | "Double" | "Integer" | "Json";

export type PropertySpec =
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

export type ResourceProperty = {
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

export type ResourceSpec = {
  Documentation: string;
  Properties: ResourceProperty;
  Attributes?: {
    [attributeName: string]: {
      PrimitiveType: PrimitiveType;
    };
  };
};

export type CfnResource = ResourceSpec & {
  ServiceName: string;
  ResourceName: string;
  ResourceFQN: string;
  Properties: {
    [propertyName: string]: ResourceProperty & {
      Spec: PropertySpec;
    };
  };
};

export type CfnService = {
  ServiceName: string;
  Resources: {
    [resourceName: string]: CfnResource;
  };
};
export type CfnServices = Record<string, CfnService>;

export async function loadServices(): Promise<CfnServices> {
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
        const propFQN =
          `${spec.ResourceFQN}.${propertyName}` as keyof typeof cfnSpec.PropertyTypes;
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

  return awsServiceGroups;
}

export async function loadSpec(): Promise<CfnSpec> {
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
