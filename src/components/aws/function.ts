import {
  Architecture,
  CreateFunctionCommand,
  DeleteFunctionCommand,
  GetFunctionCommand,
  GetFunctionConfigurationCommand,
  LambdaClient,
  ResourceNotFoundException,
  Runtime,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
} from "@aws-sdk/client-lambda";
import fs from "node:fs";
import path from "node:path";
import { ignore } from "../../error";
import { Resource, type Context } from "../../resource";

export interface FunctionProps {
  functionName: string;
  zipPath: string;
  role: string;
  handler?: string;
  runtime?: Runtime;
  architecture?: Architecture;
  description?: string;
  timeout?: number;
  memorySize?: number;
  environment?: Record<string, string>;
  tags?: Record<string, string>;
  url?: {
    authType?: "AWS_IAM" | "NONE";
    cors?: {
      allowCredentials?: boolean;
      allowHeaders?: string[];
      allowMethods?: string[];
      allowOrigins?: string[];
      exposeHeaders?: string[];
      maxAge?: number;
    };
  };
}

export interface FunctionOutput extends FunctionProps {
  id: string; // Same as functionName
  arn: string;
  lastModified: string;
  version: string;
  qualifiedArn: string; // ARN with version
  invokeArn: string; // ARN for API Gateway
  sourceCodeHash: string;
  sourceCodeSize: number;
  ephemeralStorageSize?: number;
  architectures: string[];
  masterArn?: string; // Only for Lambda@Edge
  revisionId: string;
  state?: string;
  stateReason?: string;
  stateReasonCode?: string;
  lastUpdateStatus?: string;
  lastUpdateStatusReason?: string;
  lastUpdateStatusReasonCode?: string;
  packageType: string;
  signingProfileVersionArn?: string;
  signingJobArn?: string;
}

export class Function extends Resource(
  "lambda::Function",
  async (ctx: Context<FunctionOutput>, props: FunctionProps) => {
    const client = new LambdaClient({});

    // Helper to zip the code
    async function zipCode(filePath: string): Promise<Buffer> {
      const fileContent = await fs.promises.readFile(filePath);
      const fileName = path.basename(filePath);

      // Create a zip buffer in memory
      const chunks: Buffer[] = [];
      const zip = require("jszip")();
      zip.file(fileName, fileContent);
      return zip.generateAsync({
        type: "nodebuffer",
        compression: "DEFLATE",
        platform: "UNIX",
      });
    }

    const code = await zipCode(props.zipPath);

    if (ctx.event === "delete") {
      await ignore(ResourceNotFoundException.name, () =>
        client.send(
          new DeleteFunctionCommand({
            FunctionName: props.functionName,
          }),
        ),
      );

      // Return a minimal FunctionOutput for deleted state
      return {
        ...props,
        id: props.functionName,
        arn: `arn:aws:lambda:${client.config.region}:${process.env.AWS_ACCOUNT_ID}:function:${props.functionName}`,
        lastModified: new Date().toISOString(),
        version: "$LATEST",
        qualifiedArn: `arn:aws:lambda:${client.config.region}:${process.env.AWS_ACCOUNT_ID}:function:${props.functionName}:$LATEST`,
        invokeArn: `arn:aws:apigateway:${client.config.region}:lambda:path/2015-03-31/functions/arn:aws:lambda:${client.config.region}:${process.env.AWS_ACCOUNT_ID}:function:${props.functionName}/invocations`,
        sourceCodeHash: "",
        sourceCodeSize: 0,
        architectures: props.architecture
          ? [props.architecture]
          : [Architecture.x86_64],
        revisionId: "",
        state: "Inactive",
        packageType: "Zip",
      };
    } else {
      try {
        // Check if function exists
        const func = await client.send(
          new GetFunctionCommand({
            FunctionName: props.functionName,
          }),
        );

        if (ctx.event === "update") {
          // Update function code
          await client.send(
            new UpdateFunctionCodeCommand({
              FunctionName: props.functionName,
              ZipFile: code,
            }),
          );

          // Update function configuration
          await client.send(
            new UpdateFunctionConfigurationCommand({
              FunctionName: props.functionName,
              Handler: props.handler,
              Runtime: props.runtime,
              Role: props.role,
              Description: props.description,
              Timeout: props.timeout,
              MemorySize: props.memorySize,
              Environment: props.environment
                ? { Variables: props.environment }
                : undefined,
            }),
          );

          // Wait for update to complete
          let isUpdating = true;
          while (isUpdating) {
            const config = await client.send(
              new GetFunctionConfigurationCommand({
                FunctionName: props.functionName,
              }),
            );
            isUpdating = config.LastUpdateStatus === "InProgress";
            if (isUpdating) {
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }
          }
        }
      } catch (error: any) {
        if (error.name === "ResourceNotFoundException") {
          // Create function if it doesn't exist
          const startTime = Date.now();
          let delay = 100; // Start with 100ms delay

          while (true) {
            try {
              await client.send(
                new CreateFunctionCommand({
                  FunctionName: props.functionName,
                  Code: { ZipFile: code },
                  Handler: props.handler || "index.handler",
                  Runtime: props.runtime || Runtime.nodejs20x,
                  Role: props.role,
                  Description: props.description,
                  Timeout: props.timeout || 3,
                  MemorySize: props.memorySize || 128,
                  Environment: props.environment
                    ? { Variables: props.environment }
                    : undefined,
                  Architectures: props.architecture
                    ? [props.architecture]
                    : [Architecture.x86_64],
                  Tags: props.tags,
                }),
              );
              break; // Success - exit retry loop
            } catch (createError: any) {
              if (
                createError.name !== "InvalidParameterValueException" ||
                !createError.message?.includes("cannot be assumed by Lambda")
              ) {
                throw createError; // Different error - rethrow
              }

              if (Date.now() - startTime > 10000) {
                throw new Error(
                  "Timeout waiting for IAM role to be assumable by Lambda after 10s",
                );
              }

              await new Promise((resolve) => setTimeout(resolve, delay));
              delay = Math.min(delay * 2, 1000); // Exponential backoff capped at 1s
            }
          }

          // Wait for function to be active
          let isCreating = true;
          while (isCreating) {
            const config = await client.send(
              new GetFunctionConfigurationCommand({
                FunctionName: props.functionName,
              }),
            );
            isCreating = config.State === "Pending";
            if (isCreating) {
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }
          }
        } else {
          throw error;
        }
      }

      // Get complete function details
      const [func, config] = await Promise.all([
        client.send(
          new GetFunctionCommand({
            FunctionName: props.functionName,
          }),
        ),
        client.send(
          new GetFunctionConfigurationCommand({
            FunctionName: props.functionName,
          }),
        ),
      ]);

      const output: FunctionOutput = {
        ...props,
        id: props.functionName,
        arn: config.FunctionArn!,
        lastModified: config.LastModified!,
        version: config.Version!,
        qualifiedArn: `${config.FunctionArn}:${config.Version}`,
        invokeArn: `arn:aws:apigateway:${client.config.region}:lambda:path/2015-03-31/functions/${config.FunctionArn}/invocations`,
        sourceCodeHash: config.CodeSha256!,
        sourceCodeSize: config.CodeSize!,
        ephemeralStorageSize: config.EphemeralStorage?.Size,
        architectures: config.Architectures || [],
        masterArn: config.MasterArn,
        revisionId: config.RevisionId!,
        state: config.State,
        stateReason: config.StateReason,
        stateReasonCode: config.StateReasonCode,
        lastUpdateStatus: config.LastUpdateStatus,
        lastUpdateStatusReason: config.LastUpdateStatusReason,
        lastUpdateStatusReasonCode: config.LastUpdateStatusReasonCode,
        packageType: config.PackageType!,
        signingProfileVersionArn: config.SigningProfileVersionArn,
        signingJobArn: config.SigningJobArn,
      };

      return output;
    }
  },
) {}
