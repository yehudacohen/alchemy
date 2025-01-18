import path from "node:path";
import { fileURLToPath } from "node:url";
import { alchemize } from "../src/alchemize";
import { Function } from "../src/components/aws/function";
import { Role } from "../src/components/aws/role";
import { Table } from "../src/components/aws/table";
import { Bundle } from "../src/components/esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const environment = process.env.ENVIRONMENT ?? "dev";

// Create DynamoDB table
const table = new Table("alchemy-items-table", {
  tableName: "alchemy-items",
  partitionKey: {
    name: "id",
    type: "S",
  },
  tags: {
    Environment: environment,
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
  tags: {
    Environment: environment,
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
  tags: {
    Environment: "production",
  },
});

await alchemize();
