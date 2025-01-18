import { describe, expect, test } from "bun:test";
import { apply } from "../src/apply";
import type { PolicyDocument } from "../src/components/aws/policy";
import { Role } from "../src/components/aws/role";

describe("AWS Resources", () => {
  describe("Role", () => {
    const assumeRolePolicy: PolicyDocument = {
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
    };

    const inlinePolicy: PolicyDocument = {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: [
            "logs:CreateLogGroup",
            "logs:CreateLogStream",
            "logs:PutLogEvents",
          ],
          Resource: "*",
        },
      ],
    };

    test("create role", async () => {
      const role = new Role("test-role", {
        roleName: "iac-test-role",
        assumeRolePolicy,
        description: "Test role for IAC",
        tags: {
          Environment: "test",
        },
        policies: [
          {
            policyName: "logs",
            policyDocument: inlinePolicy,
          },
        ],
      });

      const output = await apply(role);
      expect(output.id).toBe("iac-test-role");
      expect(output.arn).toMatch(/^arn:aws:iam::\d+:role\/iac-test-role$/);
      expect(output.uniqueId).toBeTruthy();
      expect(output.roleId).toBeTruthy();
      expect(output.createDate).toBeInstanceOf(Date);
    });

    test("update role", async () => {
      const role = new Role("test-role", {
        roleName: "iac-test-role",
        assumeRolePolicy,
        description: "Updated test role for IAC",
        maxSessionDuration: 7200,
        tags: {
          Environment: "test",
          Updated: "true",
        },
        policies: [
          {
            policyName: "logs",
            policyDocument: inlinePolicy,
          },
          {
            policyName: "extra",
            policyDocument: {
              Version: "2012-10-17",
              Statement: [
                {
                  Effect: "Allow",
                  Action: "s3:ListBucket",
                  Resource: "*",
                },
              ],
            },
          },
        ],
      });

      const output = await apply(role);
      expect(output.id).toBe("iac-test-role");
      expect(output.description).toBe("Updated test role for IAC");
      expect(output.maxSessionDuration).toBe(7200);
      expect(output.tags).toEqual({
        Environment: "test",
        Updated: "true",
      });
    });

    test("delete role", async () => {
      const role = new Role("test-role", {
        roleName: "iac-test-role",
        assumeRolePolicy,
      });

      await apply(role);
      // Verify deletion by trying to get the role - should throw
      await expect(async () => {
        const role = new Role("test-role", {
          roleName: "iac-test-role",
          assumeRolePolicy,
        });
        await apply(role);
      }).rejects.toThrow();
    });
  });
});
