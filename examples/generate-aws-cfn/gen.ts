import { alchemize } from "alchemy";
import { AWSService, loadServices } from "alchemy/aws/auto";
import { Folder } from "alchemy/fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const __root = path.resolve(__dirname, "..", "..");

const awsServices = await loadServices();

const requirementsDir = new Folder(
  "requirements",
  path.join(__dirname, "requirements"),
);

const srcDir = new Folder("src", path.join(__dirname, "src"));

const iam = new AWSService("AWS::IAM", {
  ...awsServices.IAM,
  requirementsDir: requirementsDir.path,
  srcDir: srcDir.path,
  rootDir: __root,
});

await alchemize({
  mode: process.argv.includes("destroy") ? "destroy" : "up",
});
