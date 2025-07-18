import type { AwsClient } from "aws4fetch";
import { XMLParser } from "fast-xml-parser";
import type { Context } from "../../context.ts";
import { Resource } from "../../resource.ts";
import { ignore } from "../../util/ignore.ts";
import { logger } from "../../util/logger.ts";
import {
  mergeTimeoutConfig,
  type TimeoutConfig,
  waitForResourceState,
} from "../../util/timeout.ts";
import type { AwsClientProps } from "../client-props.ts";
import { resolveAwsCredentials } from "../credentials.ts";
import { callEC2Api, createEC2Client } from "./utils.ts";

/**
 * Properties for creating or updating an Internet Gateway
 */
export interface InternetGatewayProps extends AwsClientProps {
  /**
   * Tags to apply to the Internet Gateway
   */
  tags?: Record<string, string>;

  /**
   * Timeout configuration for Internet Gateway operations
   * @default Internet Gateway-specific sensible defaults (60 attempts, 2000ms delay)
   */
  timeout?: Partial<TimeoutConfig>;
}

/**
 * Output returned after Internet Gateway creation/update
 */
export interface InternetGateway
  extends Resource<"aws::InternetGateway">,
    InternetGatewayProps {
  /**
   * The ID of the Internet Gateway
   */
  internetGatewayId: string;

  /**
   * The current state of the Internet Gateway
   */
  state: "available";

  /**
   * Information about the VPCs attached to the Internet Gateway
   */
  attachments?: Array<{
    vpcId: string;
    state: "attaching" | "attached" | "detaching" | "detached";
  }>;

  /**
   * The ID of the AWS account that owns the Internet Gateway
   */
  ownerId?: string;
}

/**
 * Wait for Internet Gateway to be in available state
 */
async function waitForInternetGatewayAvailable(
  client: AwsClient,
  internetGatewayId: string,
  timeoutConfig: TimeoutConfig,
): Promise<void> {
  const checkFunction = async () => {
    const response = await callEC2Api<DescribeInternetGatewaysResponse>(
      client,
      "DescribeInternetGateways",
      parseInternetGatewayXmlResponse,
      {
        "InternetGatewayId.1": internetGatewayId,
      },
    );
    return response.InternetGateways?.[0];
  };

  const isReady = (igw: AwsInternetGateway | undefined) => {
    return igw?.State === "available" || igw !== undefined; // IGWs are usually immediately available
  };

  await waitForResourceState(
    checkFunction,
    isReady,
    timeoutConfig,
    internetGatewayId,
    "Internet Gateway",
    "is now available",
  );
}

/**
 * Wait for Internet Gateway to be deleted
 */
async function waitForInternetGatewayDeleted(
  client: AwsClient,
  internetGatewayId: string,
  timeoutConfig: TimeoutConfig,
): Promise<void> {
  const checkFunction = async () => {
    try {
      const response = await callEC2Api<DescribeInternetGatewaysResponse>(
        client,
        "DescribeInternetGateways",
        parseInternetGatewayXmlResponse,
        {
          "InternetGatewayId.1": internetGatewayId,
        },
      );
      return response.InternetGateways?.[0];
    } catch (error: any) {
      // If Internet Gateway is not found, it's been deleted - return undefined
      if (
        error.code === "InvalidInternetGatewayID.NotFound" ||
        error.code === "InvalidInternetGateway.NotFound"
      ) {
        return undefined;
      }
      throw error;
    }
  };

  const isReady = (igw: AwsInternetGateway | undefined) => {
    // Internet Gateway is deleted if it doesn't exist
    return !igw;
  };

  await waitForResourceState(
    checkFunction,
    isReady,
    timeoutConfig,
    internetGatewayId,
    "Internet Gateway",
    "deletion completed",
  );
}

/**
 * AWS Internet Gateway Resource
 *
 * An Internet Gateway is a horizontally scaled, redundant, and highly available VPC component
 * that allows communication between your VPC and the internet. It serves two purposes:
 * 1. Provide a target in your VPC route tables for internet-routable traffic
 * 2. Perform network address translation (NAT) for instances with public IPv4 addresses
 *
 * Supports AWS credential overrides at the resource level, allowing you to deploy Internet Gateways
 * to different AWS accounts or regions than the default scope configuration.
 *
 * @example
 * ```typescript
 * // Create a basic Internet Gateway
 * const igw = await InternetGateway("main-igw", {
 *   tags: {
 *     Name: "main-internet-gateway",
 *     Environment: "production"
 *   }
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Create Internet Gateway with AWS credential overrides
 * const crossAccountIgw = await InternetGateway("cross-account-igw", {
 *   // Override AWS credentials for this specific resource
 *   region: "us-east-1",
 *   profile: "production-account",
 *   tags: {
 *     Name: "cross-account-internet-gateway",
 *     Environment: "production"
 *   }
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Create Internet Gateway in different region with role assumption
 * const multiRegionIgw = await InternetGateway("multi-region-igw", {
 *   region: "eu-west-1",
 *   roleArn: "arn:aws:iam::123456789012:role/CrossRegionRole",
 *   roleSessionName: "internet-gateway-deployment",
 *   tags: {
 *     Name: "eu-internet-gateway",
 *     Region: "europe"
 *   }
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Create Internet Gateway with explicit credentials
 * const explicitCredsIgw = await InternetGateway("explicit-creds-igw", {
 *   accessKeyId: "AKIAIOSFODNN7EXAMPLE",
 *   secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
 *   region: "us-west-2",
 *   tags: {
 *     Name: "explicit-credentials-igw",
 *     Purpose: "testing"
 *   }
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Create Internet Gateway with custom timeout configuration
 * const customIgw = await InternetGateway("custom-igw", {
 *   timeout: {
 *     maxAttempts: 90,
 *     delayMs: 1500
 *   },
 *   tags: {
 *     Name: "custom-timeout-igw",
 *     Purpose: "high-availability"
 *   }
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Create Internet Gateway and attach to VPC
 * const vpc = await VPC("main-vpc", { cidrBlock: "10.0.0.0/16" });
 * const igw = await InternetGateway("vpc-igw", {
 *   tags: { Name: "vpc-internet-gateway" }
 * });
 * const attachment = await InternetGatewayAttachment("igw-attachment", {
 *   internetGatewayId: igw.internetGatewayId,
 *   vpcId: vpc.vpcId
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Multi-account deployment with scope-level and resource-level overrides
 * await alchemy.run("production", {
 *   aws: { region: "us-west-2", profile: "main-account" }
 * }, async () => {
 *   // This IGW uses scope credentials (main-account, us-west-2)
 *   const mainIgw = await InternetGateway("main-igw", {
 *     tags: { Name: "main-account-igw" }
 *   });
 *
 *   // This IGW overrides to use different account
 *   const crossAccountIgw = await InternetGateway("cross-account-igw", {
 *     profile: "secondary-account",
 *     region: "us-east-1", // Also override region
 *     tags: { Name: "secondary-account-igw" }
 *   });
 * });
 * ```
 */
export const InternetGateway = Resource(
  "aws::InternetGateway",
  async function (
    this: Context<InternetGateway>,
    _id: string,
    props: InternetGatewayProps,
  ): Promise<InternetGateway> {
    // Resolve AWS credentials from global, scope, and resource levels
    const credentials = resolveAwsCredentials(props);
    const client = await createEC2Client(credentials);
    const timeoutConfig = mergeTimeoutConfig(
      INTERNET_GATEWAY_TIMEOUT,
      props.timeout,
    );

    if (this.phase === "delete") {
      if (this.output?.internetGatewayId) {
        logger.log(
          `🗑️ Deleting Internet Gateway: ${this.output.internetGatewayId}`,
        );

        // Simply delete the Internet Gateway - attachments should handle themselves
        await ignore("InvalidInternetGatewayID.NotFound", async () => {
          await callEC2Api(
            client,
            "DeleteInternetGateway",
            parseInternetGatewayXmlResponse,
            {
              InternetGatewayId: this.output.internetGatewayId,
            },
          );
        });

        // Wait for Internet Gateway to be fully deleted
        await waitForInternetGatewayDeleted(
          client,
          this.output.internetGatewayId,
          timeoutConfig,
        );

        logger.log(
          `  ✅ Internet Gateway ${this.output.internetGatewayId} deletion completed`,
        );
      }
      return this.destroy();
    }

    let internetGateway: AwsInternetGateway;

    if (this.phase === "update" && this.output?.internetGatewayId) {
      // Get existing Internet Gateway
      const response = await callEC2Api<DescribeInternetGatewaysResponse>(
        client,
        "DescribeInternetGateways",
        parseInternetGatewayXmlResponse,
        {
          "InternetGatewayId.1": this.output.internetGatewayId,
        },
      );

      if (!response.InternetGateways?.[0]) {
        throw new Error(
          `Internet Gateway ${this.output.internetGatewayId} not found`,
        );
      }

      internetGateway = response.InternetGateways[0];
    } else {
      // Create new Internet Gateway
      const createInternetGatewayParams: CreateInternetGatewayParams = {};

      // Add tags if provided
      if (props.tags) {
        createInternetGatewayParams.TagSpecifications = [
          {
            ResourceType: "internet-gateway",
            Tags: Object.entries(props.tags).map(([key, value]) => ({
              Key: key,
              Value: value,
            })),
          },
        ];
      }

      const createParams = convertCreateInternetGatewayParamsToAwsFormat(
        createInternetGatewayParams,
      );

      const response = await callEC2Api<CreateInternetGatewayResponse>(
        client,
        "CreateInternetGateway",
        parseInternetGatewayXmlResponse,
        createParams,
      );

      if (!response.InternetGateway) {
        throw new Error("Failed to create Internet Gateway");
      }

      internetGateway = response.InternetGateway;

      // Wait for Internet Gateway to be available
      await waitForInternetGatewayAvailable(
        client,
        internetGateway.InternetGatewayId!,
        timeoutConfig,
      );
    }

    return this({
      internetGatewayId: internetGateway.InternetGatewayId!,
      state: "available",
      attachments: internetGateway.Attachments?.map((att) => ({
        vpcId: att.VpcId,
        state: att.State,
      })),
      ownerId: internetGateway.OwnerId,
      ...props,
    });
  },
);

/**
 * Internet Gateway timeout constants
 */
export const INTERNET_GATEWAY_TIMEOUT: TimeoutConfig = {
  maxAttempts: 60,
  delayMs: 2000, // 2 seconds - IGWs are medium speed resources
};

/**
 * Comprehensive AWS Internet Gateway API Parameter Types
 */

// Common structures
interface TagSpecification {
  ResourceType: string;
  Tags: Array<{
    Key: string;
    Value: string;
  }>;
}

// Internet Gateway API Request Parameters
interface CreateInternetGatewayParams {
  TagSpecifications?: TagSpecification[];
  DryRun?: boolean;
}

/**
 * Helper functions to convert typed parameters to AWS API format
 */
function convertCreateInternetGatewayParamsToAwsFormat(
  params: CreateInternetGatewayParams,
): Record<string, string> {
  const awsParams: Record<string, string> = {};

  if (params.DryRun !== undefined) {
    awsParams.DryRun = params.DryRun.toString();
  }

  // Handle TagSpecifications
  if (params.TagSpecifications) {
    params.TagSpecifications.forEach((tagSpec, specIndex) => {
      const specNum = specIndex + 1;
      awsParams[`TagSpecification.${specNum}.ResourceType`] =
        tagSpec.ResourceType;

      tagSpec.Tags.forEach((tag, tagIndex) => {
        const tagNum = tagIndex + 1;
        awsParams[`TagSpecification.${specNum}.Tag.${tagNum}.Key`] = tag.Key;
        awsParams[`TagSpecification.${specNum}.Tag.${tagNum}.Value`] =
          tag.Value;
      });
    });
  }

  return awsParams;
}

/**
 * AWS Internet Gateway API response types
 */
interface AwsInternetGateway {
  InternetGatewayId: string;
  State: "available";
  Attachments: Array<{
    VpcId: string;
    State: "attaching" | "attached" | "detaching" | "detached";
  }>;
  Tags?: Array<{
    Key: string;
    Value: string;
  }>;
  OwnerId?: string;
}

interface CreateInternetGatewayResponse {
  InternetGateway: AwsInternetGateway;
}

interface DescribeInternetGatewaysResponse {
  InternetGateways: AwsInternetGateway[];
}

/**
 * Raw XML parsing interfaces for type safety
 */
interface RawInternetGatewayXmlItem {
  internetGatewayId: string;
  attachmentSet?: {
    item?:
      | Array<{
          vpcId: string;
          state: string;
        }>
      | {
          vpcId: string;
          state: string;
        };
  };
  tagSet?: {
    item?:
      | Array<{
          key: string;
          value: string;
        }>
      | {
          key: string;
          value: string;
        };
  };
  ownerId?: string;
}

/**
 * Parse XML responses specifically for Internet Gateway operations
 */
function parseInternetGatewayXmlResponse<T>(xmlText: string): T {
  const parser = new XMLParser({
    ignoreAttributes: true,
    parseAttributeValue: true,
    parseTagValue: true,
    trimValues: true,
  });

  const parsed = parser.parse(xmlText);
  const result: Record<string, unknown> = {};

  // Parse CreateInternetGatewayResponse
  if (parsed.CreateInternetGatewayResponse) {
    const internetGateway = parsed.CreateInternetGatewayResponse
      .internetGateway as RawInternetGatewayXmlItem;
    if (internetGateway) {
      result.InternetGateway = {
        InternetGatewayId: internetGateway.internetGatewayId,
        State: "available" as const, // Internet Gateways are immediately available
        Attachments: internetGateway.attachmentSet?.item
          ? (Array.isArray(internetGateway.attachmentSet.item)
              ? internetGateway.attachmentSet.item
              : [internetGateway.attachmentSet.item]
            ).map((attachment) => ({
              VpcId: attachment.vpcId,
              State: attachment.state as
                | "attaching"
                | "attached"
                | "detaching"
                | "detached",
            }))
          : [],
        Tags: internetGateway.tagSet?.item
          ? Array.isArray(internetGateway.tagSet.item)
            ? internetGateway.tagSet.item.map((tag) => ({
                Key: tag.key,
                Value: tag.value,
              }))
            : [
                {
                  Key: internetGateway.tagSet.item.key,
                  Value: internetGateway.tagSet.item.value,
                },
              ]
          : undefined,
        OwnerId: internetGateway.ownerId,
      };
    }
  }

  // Parse DescribeInternetGatewaysResponse
  if (parsed.DescribeInternetGatewaysResponse) {
    const internetGatewaySet =
      parsed.DescribeInternetGatewaysResponse.internetGatewaySet;
    if (internetGatewaySet?.item) {
      const igws = Array.isArray(internetGatewaySet.item)
        ? internetGatewaySet.item
        : [internetGatewaySet.item];
      result.InternetGateways = igws.map((igw: RawInternetGatewayXmlItem) => ({
        InternetGatewayId: igw.internetGatewayId,
        State: "available" as const,
        Attachments: igw.attachmentSet?.item
          ? (Array.isArray(igw.attachmentSet.item)
              ? igw.attachmentSet.item
              : [igw.attachmentSet.item]
            ).map((attachment) => ({
              VpcId: attachment.vpcId,
              State: attachment.state as
                | "attaching"
                | "attached"
                | "detaching"
                | "detached",
            }))
          : [],
        Tags: igw.tagSet?.item
          ? Array.isArray(igw.tagSet.item)
            ? igw.tagSet.item.map((tag) => ({ Key: tag.key, Value: tag.value }))
            : [{ Key: igw.tagSet.item.key, Value: igw.tagSet.item.value }]
          : undefined,
        OwnerId: igw.ownerId,
      }));
    } else {
      result.InternetGateways = [];
    }
  }

  // Handle success responses
  if (
    parsed.AttachInternetGatewayResponse ||
    parsed.DetachInternetGatewayResponse ||
    parsed.DeleteInternetGatewayResponse
  ) {
    result.success = true;
  }

  return result as T;
}
