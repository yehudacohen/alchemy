import {
  DescribeInternetGatewaysCommand,
  EC2Client,
} from "@aws-sdk/client-ec2";
import { describe, expect } from "vitest";
import { alchemy } from "../../../src/alchemy.ts";
import { InternetGatewayAttachment } from "../../../src/aws/ec2/internet-gateway-attachment.ts";
import {
  INTERNET_GATEWAY_TIMEOUT,
  InternetGateway,
} from "../../../src/aws/ec2/internet-gateway.ts";
import { Vpc } from "../../../src/aws/ec2/vpc.ts";
import { destroy } from "../../../src/destroy.ts";
import { BRANCH_PREFIX } from "../../util.ts";

import "../../../src/test/vitest.ts";

const test = alchemy.test(import.meta, {
  prefix: BRANCH_PREFIX,
});

const ec2 = new EC2Client({});

describe("InternetGatewayAttachment", () => {
  test(
    "attach internet gateway to VPC",
    async (scope) => {
      const vpcName = `${BRANCH_PREFIX}-alchemy-test-igw-vpc`;
      const igwName = `${BRANCH_PREFIX}-alchemy-test-igw`;
      const attachmentName = `${BRANCH_PREFIX}-alchemy-test-igw-attachment`;
      let vpc: Awaited<ReturnType<typeof Vpc>>;
      let internetGateway: Awaited<ReturnType<typeof InternetGateway>>;
      let attachment: Awaited<ReturnType<typeof InternetGatewayAttachment>>;

      try {
        // First create a VPC
        vpc = await Vpc(vpcName, {
          cidrBlock: "10.0.0.0/16",
          tags: { Name: vpcName },
        });

        // Create the Internet Gateway
        internetGateway = await InternetGateway(igwName, {
          tags: {
            Name: igwName,
            Environment: "test",
          },
        });

        // Attach the Internet Gateway to the VPC
        attachment = await InternetGatewayAttachment(attachmentName, {
          internetGateway,
          vpc,
        });

        expect(attachment.internetGatewayId).toBe(
          internetGateway.internetGatewayId,
        );
        expect(attachment.vpcId).toBe(vpc.vpcId);
        expect(attachment.state).toBe("attached");

        // Verify Internet Gateway is attached to VPC
        const describeResponse = await ec2.send(
          new DescribeInternetGatewaysCommand({
            InternetGatewayIds: [internetGateway.internetGatewayId],
          }),
        );
        const igw = describeResponse.InternetGateways?.[0];
        expect(igw?.InternetGatewayId).toBe(internetGateway.internetGatewayId);
        expect(igw?.Attachments?.[0]?.VpcId).toBe(vpc.vpcId);
        expect(igw?.Attachments?.[0]?.State).toBe("available");
      } finally {
        // Always clean up, even if test fails
        await destroy(scope);
      }
    },
    INTERNET_GATEWAY_TIMEOUT.maxAttempts * INTERNET_GATEWAY_TIMEOUT.delayMs +
      30000, // Resource timeout + 30s buffer
  ); // Internet Gateway Attachment uses same timeout as IGW

  test(
    "attach internet gateway to VPC with credential overrides",
    async (scope) => {
      const vpcName = `${BRANCH_PREFIX}-alchemy-test-igw-creds-vpc`;
      const igwName = `${BRANCH_PREFIX}-alchemy-test-igw-creds`;
      const attachmentName = `${BRANCH_PREFIX}-alchemy-test-igw-creds-attachment`;
      let vpc: Awaited<ReturnType<typeof Vpc>>;
      let internetGateway: Awaited<ReturnType<typeof InternetGateway>>;
      let attachment: Awaited<ReturnType<typeof InternetGatewayAttachment>>;

      try {
        // First create a VPC with region override
        vpc = await Vpc(vpcName, {
          cidrBlock: "10.0.0.0/16",
          region: "us-west-2", // Override region
          tags: { Name: vpcName },
        });

        // Create the Internet Gateway with region override
        internetGateway = await InternetGateway(igwName, {
          region: "us-west-2", // Override region
          tags: {
            Name: igwName,
            Environment: "test",
          },
        });

        // Attach the Internet Gateway to the VPC with region override
        attachment = await InternetGatewayAttachment(attachmentName, {
          internetGateway,
          vpc,
          region: "us-west-2", // Override region
        });

        expect(attachment.internetGatewayId).toBe(
          internetGateway.internetGatewayId,
        );
        expect(attachment.vpcId).toBe(vpc.vpcId);
        expect(attachment.state).toBe("attached");

        // Verify Internet Gateway is attached to VPC in the specified region
        const regionalEc2 = new EC2Client({ region: "us-west-2" });
        const describeResponse = await regionalEc2.send(
          new DescribeInternetGatewaysCommand({
            InternetGatewayIds: [internetGateway.internetGatewayId],
          }),
        );
        const igw = describeResponse.InternetGateways?.[0];
        expect(igw?.InternetGatewayId).toBe(internetGateway.internetGatewayId);
        expect(igw?.Attachments?.[0]?.VpcId).toBe(vpc.vpcId);
        expect(igw?.Attachments?.[0]?.State).toBe("available");
      } finally {
        // Always clean up, even if test fails
        await destroy(scope);
      }
    },
    INTERNET_GATEWAY_TIMEOUT.maxAttempts * INTERNET_GATEWAY_TIMEOUT.delayMs +
      30000, // Resource timeout + 30s buffer
  );

  test(
    "attach internet gateway to VPC with profile override",
    async (scope) => {
      const vpcName = `${BRANCH_PREFIX}-alchemy-test-igw-profile-vpc`;
      const igwName = `${BRANCH_PREFIX}-alchemy-test-igw-profile`;
      const attachmentName = `${BRANCH_PREFIX}-alchemy-test-igw-profile-attachment`;
      let vpc: Awaited<ReturnType<typeof Vpc>>;
      let internetGateway: Awaited<ReturnType<typeof InternetGateway>>;
      let attachment: Awaited<ReturnType<typeof InternetGatewayAttachment>>;

      try {
        // First create a VPC with profile override
        vpc = await Vpc(vpcName, {
          cidrBlock: "10.0.0.0/16",
          profile: "test9-374080338393", // Override profile
          region: "us-west-2",
          tags: { Name: vpcName },
        });

        // Create the Internet Gateway with profile override
        internetGateway = await InternetGateway(igwName, {
          profile: "test9-374080338393", // Override profile
          region: "us-west-2",
          tags: {
            Name: igwName,
            Environment: "test",
          },
        });

        // Attach the Internet Gateway to the VPC with profile override
        attachment = await InternetGatewayAttachment(attachmentName, {
          internetGateway,
          vpc,
          profile: "test9-374080338393", // Override profile
          region: "us-west-2",
        });

        expect(attachment.internetGatewayId).toBe(
          internetGateway.internetGatewayId,
        );
        expect(attachment.vpcId).toBe(vpc.vpcId);
        expect(attachment.state).toBe("attached");

        // Verify Internet Gateway is attached to VPC
        const describeResponse = await ec2.send(
          new DescribeInternetGatewaysCommand({
            InternetGatewayIds: [internetGateway.internetGatewayId],
          }),
        );
        const igw = describeResponse.InternetGateways?.[0];
        expect(igw?.InternetGatewayId).toBe(internetGateway.internetGatewayId);
        expect(igw?.Attachments?.[0]?.VpcId).toBe(vpc.vpcId);
        expect(igw?.Attachments?.[0]?.State).toBe("available");
      } finally {
        // Always clean up, even if test fails
        await destroy(scope);
      }
    },
    INTERNET_GATEWAY_TIMEOUT.maxAttempts * INTERNET_GATEWAY_TIMEOUT.delayMs +
      30000, // Resource timeout + 30s buffer
  );
});
