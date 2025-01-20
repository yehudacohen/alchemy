import path from "node:path";
import { fileURLToPath } from "node:url";
import { alchemize } from "../alchemy/src/alchemize";
import { Function, Queue, Role, Table } from "../alchemy/src/components/aws";
import { Bundle } from "../alchemy/src/components/esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const queue = new Queue("alchemy-items-queue", {
  queueName: "alchemy-items-queue",
  visibilityTimeout: 30,
  messageRetentionPeriod: 345600, // 4 days
});

// Create DynamoDB table
const table = new Table("alchemy-items-table", {
  tableName: "alchemy-items",
  partitionKey: {
    name: "id",
    type: "S",
  },
});

// Create Lambda execution role with DynamoDB access
const role = new Role("alchemy-api-role", {
  roleName: "alchemy-api-lambda-role",
  assumeRolePolicy: {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: {
          Service: "lambda.amazonaws.com",
        },
        Action: "sts:AssumeRole",
      },
    ],
  },
});

// Create Lambda function
const bundle = new Bundle("api-bundle", {
  entryPoint: path.join(__dirname, "handler.ts"),
  outdir: ".out",
  format: "esm",
  platform: "node",
  target: "node20",
  minify: true,
  sourcemap: true,
  // Don't bundle aws-sdk as it's provided by Lambda
  external: ["@aws-sdk/*"],
});

const api = new Function("api", {
  functionName: "alchemy-items-api",
  zipPath: bundle.path,
  roleArn: role.arn,
  handler: "index.handler",
  environment: {
    TABLE_NAME: table.tableName,
  },
  url: {
    // Enable public access
    authType: "NONE",
    cors: {
      allowOrigins: ["*"],
      allowMethods: ["GET", "POST", "PUT", "DELETE"],
      allowHeaders: ["content-type"],
    },
  },
});

await alchemize({
  // decide the mode/stage however you want
  mode: process.argv[2] === "destroy" ? "destroy" : "up",
  stage: process.argv[3],
});
