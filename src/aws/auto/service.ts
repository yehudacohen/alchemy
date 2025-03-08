import { kebabCase } from "change-case";
import path from "node:path";
import { Folder } from "../../fs";
import { Resource } from "../../resource";
import { AWSResource } from "./resource";
import type { CfnService } from "./spec";

export class AWSService extends Resource(
  "aws-service",
  async (
    ctx,
    props: CfnService & {
      requirementsDir: string;
      srcDir: string;
      rootDir: string;
    },
  ) => {
    const serviceDir = new Folder(
      "service",
      path.join(props.requirementsDir, kebabCase(props.ServiceName)),
    ).path;
    const srcDir = new Folder(
      "src",
      path.join(props.srcDir, kebabCase(props.ServiceName)),
    ).path;

    const resources = Object.entries(props.Resources);
    if (process.env.DEBUG) {
      // Only instantiate first resource in debug mode
      const [resourceName, resource] = resources[0];
      return [
        new AWSResource(resourceName, {
          ...resource,
          ServiceName: props.ServiceName,
          requirementsDir: serviceDir,
          srcDir,
          rootDir: props.rootDir,
        }),
      ];
    }
    return resources.map(([resourceName, resource]) => {
      return new AWSResource(resourceName, {
        ...resource,
        ServiceName: props.ServiceName,
        rootDir: props.rootDir,
        srcDir,
        requirementsDir: serviceDir,
      });
    });
  },
) {}
