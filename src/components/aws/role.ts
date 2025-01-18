import {
  CreateRoleCommand,
  DeleteRoleCommand,
  GetRoleCommand,
  IAMClient,
  NoSuchEntityException,
  PutRolePolicyCommand,
  TagRoleCommand,
  UpdateAssumeRolePolicyCommand,
  UpdateRoleCommand,
  type Tag,
} from "@aws-sdk/client-iam";
import { ignore } from "../../error";
import { Resource } from "../../resource";
import type { PolicyDocument } from "./policy";

export interface RoleProps {
  roleName: string;
  assumeRolePolicy: PolicyDocument;
  description?: string;
  path?: string;
  maxSessionDuration?: number;
  permissionsBoundary?: string;
  policies?: Array<{
    policyName: string;
    policyDocument: PolicyDocument;
  }>;
  managedPolicyArns?: string[];
  tags?: Record<string, string>;
}

export interface RoleOutput extends RoleProps {
  id: string; // Same as roleName
  arn: string;
  uniqueId: string; // Unique identifier for the role
  roleId: string; // The stable and unique string identifying the role
  createDate: Date;
}

export class Role extends Resource(
  "iam::Role",
  async (ctx, props: RoleProps): Promise<RoleOutput> => {
    const client = new IAMClient({});

    if (ctx.event === "delete") {
      await ignore(NoSuchEntityException.name, () =>
        client.send(
          new DeleteRoleCommand({
            RoleName: props.roleName,
          }),
        ),
      );
      return {
        ...props,
        id: props.roleName,
        arn: `arn:aws:iam::${process.env.AWS_ACCOUNT_ID}:role/${props.roleName}`,
        uniqueId: "",
        roleId: "",
        createDate: new Date(),
      };
    } else {
      const assumeRolePolicyDocument = JSON.stringify(props.assumeRolePolicy);

      try {
        // Check if role exists
        const existingRole = await client.send(
          new GetRoleCommand({
            RoleName: props.roleName,
          }),
        );

        if (ctx.event === "update") {
          // Update assume role policy if it changed
          if (
            existingRole.Role?.AssumeRolePolicyDocument !==
            assumeRolePolicyDocument
          ) {
            await client.send(
              new UpdateAssumeRolePolicyCommand({
                RoleName: props.roleName,
                PolicyDocument: assumeRolePolicyDocument,
              }),
            );
          }

          // Update role description and max session duration if they changed
          if (
            existingRole.Role?.Description !== props.description ||
            existingRole.Role?.MaxSessionDuration !== props.maxSessionDuration
          ) {
            await client.send(
              new UpdateRoleCommand({
                RoleName: props.roleName,
                Description: props.description,
                MaxSessionDuration: props.maxSessionDuration,
              }),
            );
          }

          // Update tags if they changed
          if (props.tags) {
            const tags: Tag[] = Object.entries(props.tags).map(
              ([Key, Value]) => ({
                Key,
                Value,
              }),
            );
            await client.send(
              new TagRoleCommand({
                RoleName: props.roleName,
                Tags: tags,
              }),
            );
          }

          // Update inline policies
          if (props.policies) {
            for (const policy of props.policies) {
              await client.send(
                new PutRolePolicyCommand({
                  RoleName: props.roleName,
                  PolicyName: policy.policyName,
                  PolicyDocument: JSON.stringify(policy.policyDocument),
                }),
              );
            }
          }
        } else {
          // Create role if it doesn't exist
          await client.send(
            new CreateRoleCommand({
              RoleName: props.roleName,
              AssumeRolePolicyDocument: assumeRolePolicyDocument,
              Description: props.description,
              Path: props.path,
              MaxSessionDuration: props.maxSessionDuration,
              PermissionsBoundary: props.permissionsBoundary,
              Tags: props.tags
                ? Object.entries(props.tags).map(([Key, Value]) => ({
                    Key,
                    Value,
                  }))
                : undefined,
            }),
          );

          // Attach inline policies
          if (props.policies) {
            for (const policy of props.policies) {
              await client.send(
                new PutRolePolicyCommand({
                  RoleName: props.roleName,
                  PolicyName: policy.policyName,
                  PolicyDocument: JSON.stringify(policy.policyDocument),
                }),
              );
            }
          }
        }

        // Get role details
        const role = await client.send(
          new GetRoleCommand({
            RoleName: props.roleName,
          }),
        );

        return {
          ...props,
          id: props.roleName,
          arn: role.Role!.Arn!,
          uniqueId: role.Role!.RoleId!,
          roleId: role.Role!.RoleId!,
          createDate: role.Role!.CreateDate!,
        };
      } catch (error: any) {
        if (error.name === "NoSuchEntity") {
          // Create role if it doesn't exist
          await client.send(
            new CreateRoleCommand({
              RoleName: props.roleName,
              AssumeRolePolicyDocument: assumeRolePolicyDocument,
              Description: props.description,
              Path: props.path,
              MaxSessionDuration: props.maxSessionDuration,
              PermissionsBoundary: props.permissionsBoundary,
              Tags: props.tags
                ? Object.entries(props.tags).map(([Key, Value]) => ({
                    Key,
                    Value,
                  }))
                : undefined,
            }),
          );

          // Attach inline policies
          if (props.policies) {
            for (const policy of props.policies) {
              await client.send(
                new PutRolePolicyCommand({
                  RoleName: props.roleName,
                  PolicyName: policy.policyName,
                  PolicyDocument: JSON.stringify(policy.policyDocument),
                }),
              );
            }
          }

          // Get role details
          const role = await client.send(
            new GetRoleCommand({
              RoleName: props.roleName,
            }),
          );

          return {
            ...props,
            id: props.roleName,
            arn: role.Role!.Arn!,
            uniqueId: role.Role!.RoleId!,
            roleId: role.Role!.RoleId!,
            createDate: role.Role!.CreateDate!,
          };
        }
        throw error;
      }
    }
  },
) {}
