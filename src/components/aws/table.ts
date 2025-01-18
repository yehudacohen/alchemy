import {
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  ResourceInUseException,
  ResourceNotFoundException,
  type KeySchemaElement,
} from "@aws-sdk/client-dynamodb";
import { ignore } from "../../error";
import { Resource } from "../../resource";

export interface TableProps {
  tableName: string;
  partitionKey: {
    name: string;
    type: "S" | "N" | "B";
  };
  sortKey?: {
    name: string;
    type: "S" | "N" | "B";
  };
  billingMode?: "PROVISIONED" | "PAY_PER_REQUEST";
  readCapacity?: number;
  writeCapacity?: number;
  tags?: Record<string, string>;
}

export class Table extends Resource(
  "dynamo::Table",
  async (ctx, props: TableProps) => {
    const client = new DynamoDBClient({});

    if (ctx.event === "delete") {
      await ignore(ResourceNotFoundException.name, () =>
        client.send(
          new DeleteTableCommand({
            TableName: props.tableName,
          }),
        ),
      );
    } else {
      try {
        const attributeDefinitions = [
          {
            AttributeName: props.partitionKey.name,
            AttributeType: props.partitionKey.type,
          },
        ];

        const keySchema: KeySchemaElement[] = [
          {
            AttributeName: props.partitionKey.name,
            KeyType: "HASH",
          },
        ];

        if (props.sortKey) {
          attributeDefinitions.push({
            AttributeName: props.sortKey.name,
            AttributeType: props.sortKey.type,
          });
          keySchema.push({
            AttributeName: props.sortKey.name,
            KeyType: "RANGE",
          });
        }

        await client.send(
          new CreateTableCommand({
            TableName: props.tableName,
            AttributeDefinitions: attributeDefinitions,
            KeySchema: keySchema,
            BillingMode: props.billingMode || "PAY_PER_REQUEST",
            ProvisionedThroughput:
              props.billingMode === "PROVISIONED"
                ? {
                    ReadCapacityUnits: props.readCapacity || 5,
                    WriteCapacityUnits: props.writeCapacity || 5,
                  }
                : undefined,
            Tags: props.tags
              ? Object.entries(props.tags).map(([Key, Value]) => ({
                  Key,
                  Value,
                }))
              : undefined,
          }),
        );

        // Wait for table to be active
        let tableActive = false;
        while (!tableActive) {
          const response = await client.send(
            new DescribeTableCommand({
              TableName: props.tableName,
            }),
          );
          tableActive = response.Table?.TableStatus === "ACTIVE";
          if (!tableActive) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }
      } catch (error) {
        if (error instanceof ResourceInUseException) {
          // Table already exists
          return props;
        }
        throw error;
      }
    }
    return props;
  },
) {}
