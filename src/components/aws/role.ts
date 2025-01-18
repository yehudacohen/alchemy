import {
  CreateRoleCommand,
  DeleteRoleCommand,
  DeleteRolePolicyCommand,
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
      // Delete any inline policies first
      if (props.policies) {
        for (const policy of props.policies) {
          await ignore(NoSuchEntityException.name, () =>
            client.send(
              new DeleteRolePolicyCommand({
                RoleName: props.roleName,
                PolicyName: policy.policyName,
              }),
            ),
          );
        }
      }

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
    }

    const assumeRolePolicyDocument = JSON.stringify(props.assumeRolePolicy);
    let role;

    try {
      // Try to get the existing role first
      role = await client.send(
        new GetRoleCommand({
          RoleName: props.roleName,
        }),
      );

      // If we're here, the role exists
      if (ctx.event === "create") {
        throw new Error(`Role ${props.roleName} already exists`);
      }

      // If we're here, the role exists and we're updating
      if (ctx.event === "update") {
        // Update assume role policy if it changed
        if (role.Role?.AssumeRolePolicyDocument !== assumeRolePolicyDocument) {
          await client.send(
            new UpdateAssumeRolePolicyCommand({
              RoleName: props.roleName,
              PolicyDocument: assumeRolePolicyDocument,
            }),
          );
        }

        // Update role description and max session duration if they changed
        if (
          role.Role?.Description !== props.description ||
          role.Role?.MaxSessionDuration !== props.maxSessionDuration
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
      }
    } catch (error: any) {
      if (error.name !== NoSuchEntityException.name) {
        throw error;
      }

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

      // Get the newly created role
      role = await client.send(
        new GetRoleCommand({
          RoleName: props.roleName,
        }),
      );
    }

    // Update inline policies in both create and update cases
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

    return {
      ...props,
      id: props.roleName,
      arn: role.Role!.Arn!,
      uniqueId: role.Role!.RoleId!,
      roleId: role.Role!.RoleId!,
      createDate: role.Role!.CreateDate!,
    };
  },
) {}
