import { Function } from "../src/components/aws/function";
import { Role } from "../src/components/aws/role";
import { Table } from "../src/components/aws/table";
import { Bundle } from "../src/components/esbuild";

const environment = process.env.ENVIRONMENT ?? "dev";

// Create DynamoDB table
const table = new Table("items-table", {
  tableName: "items",
  partitionKey: {
    name: "id",
    type: "S",
  },
  tags: {
    Environment: environment,
  },
});

// Create Lambda execution role with DynamoDB access
const role = new Role("api-role", {
  roleName: "api-lambda-role",
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
  entryPoint: "./api-handler.ts",
  format: "esm",
  platform: "node",
  target: "node20",
  minify: true,
  sourcemap: true,
  // Don't bundle aws-sdk as it's provided by Lambda
  external: ["@aws-sdk/*"],
});

const api = new Function("api", {
  functionName: "items-api",
  zipPath: bundle.path,
  role: role.roleName,
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
