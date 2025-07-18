import { type } from "arktype";

/**
 * AWS client properties for credential configuration.
 *
 * This interface defines the properties that can be used to configure AWS credentials
 * at different levels of your application. It supports the three-tier credential resolution
 * system (global → scope → resource) and enables multi-account and multi-region deployments.
 *
 * These properties can be specified at:
 * 1. Resource level - directly in resource creation parameters
 * 2. Scope level - in alchemy.run() options (using awsRegion, awsProfile, etc.)
 * 3. Global level - through environment variables (AWS_REGION, AWS_PROFILE, etc.)
 *
 * The credential resolution follows a precedence order where resource-level credentials
 * override scope-level credentials, which override global environment variables.
 *
 * @example
 * ```typescript
 * // Resource-level credential overrides
 * const vpc = await Vpc("main-vpc", {
 *   cidrBlock: "10.0.0.0/16",
 *   region: "us-west-2",      // Override region
 *   profile: "production",    // Override profile
 *   tags: { Name: "main-vpc" }
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Scope-level credential configuration
 * await alchemy.run("production", {
 *   // Scope-level AWS credential overrides
 *   awsRegion: "us-west-2",
 *   awsProfile: "production",
 * }, async () => {
 *   // Resources created here will use the scope credentials by default
 *   const vpc = await Vpc("main-vpc", {
 *     cidrBlock: "10.0.0.0/16"
 *   });
 * });
 * ```
 */
export interface AwsClientProps {
  /**
   * AWS access key ID for authentication.
   *
   * This corresponds to the AWS_ACCESS_KEY_ID environment variable.
   * When provided at the resource or scope level, it overrides the environment variable.
   */
  accessKeyId?: string;

  /**
   * AWS secret access key for authentication.
   *
   * This corresponds to the AWS_SECRET_ACCESS_KEY environment variable.
   * When provided at the resource or scope level, it overrides the environment variable.
   */
  secretAccessKey?: string;

  /**
   * AWS session token for temporary credentials.
   *
   * This corresponds to the AWS_SESSION_TOKEN environment variable.
   * Used with temporary credentials from STS or when assuming a role.
   */
  sessionToken?: string;

  /**
   * AWS region to use for API calls.
   *
   * This corresponds to the AWS_REGION or AWS_DEFAULT_REGION environment variables.
   * When provided at the resource or scope level, it overrides the environment variables.
   *
   * @example
   * ```typescript
   * // Resource in a specific region
   * const euVpc = await Vpc("eu-vpc", {
   *   cidrBlock: "10.0.0.0/16",
   *   region: "eu-west-1",
   *   tags: { Name: "eu-vpc" }
   * });
   * ```
   */
  region?: string;

  /**
   * AWS profile name to use from credentials file.
   *
   * This corresponds to the AWS_PROFILE environment variable.
   * Profiles are defined in ~/.aws/credentials or ~/.aws/config files.
   *
   * @example
   * ```typescript
   * // Resource using a specific profile
   * const prodVpc = await Vpc("prod-vpc", {
   *   cidrBlock: "10.0.0.0/16",
   *   profile: "production-account",
   *   tags: { Name: "prod-vpc" }
   * });
   * ```
   */
  profile?: string;

  /**
   * AWS role ARN to assume for authentication.
   *
   * This corresponds to the AWS_ROLE_ARN environment variable.
   * Used for cross-account access or for assuming roles with specific permissions.
   *
   * @example
   * ```typescript
   * // Resource using role assumption
   * const crossAccountVpc = await Vpc("cross-account-vpc", {
   *   cidrBlock: "10.0.0.0/16",
   *   roleArn: "arn:aws:iam::123456789012:role/DeploymentRole",
   *   roleSessionName: "alchemy-deployment",
   *   tags: { Name: "cross-account-vpc" }
   * });
   * ```
   */
  roleArn?: string;

  /**
   * External ID to use when assuming a role.
   *
   * This corresponds to the AWS_EXTERNAL_ID environment variable.
   * Used as an additional security measure when assuming roles across accounts.
   */
  externalId?: string;

  /**
   * Session name to use when assuming a role.
   *
   * This corresponds to the AWS_ROLE_SESSION_NAME environment variable.
   * Helps identify who/what is using the assumed role in AWS CloudTrail logs.
   */
  roleSessionName?: string;
}

/**
 * Arktype schema for runtime validation of AWS client properties.
 * All properties are optional strings to allow flexible credential configuration.
 */
export const AwsClientPropsSchema = type({
  "accessKeyId?": "string",
  "secretAccessKey?": "string",
  "sessionToken?": "string",
  "region?": "string",
  "profile?": "string",
  "roleArn?": "string",
  "externalId?": "string",
  "roleSessionName?": "string",
});

/**
 * Type alias for the validated AWS client properties from arktype schema.
 */
export type ValidatedAwsClientProps = typeof AwsClientPropsSchema.infer;
