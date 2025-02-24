import TurndownService from "turndown";
import { generateText } from "../../agent/ai";
import { resolveModel } from "../../agent/model";
import { type Context, Resource } from "../../resource";

export class AWSDocReference extends Resource(
  "AWSDocReference",
  async (
    ctx: Context<{ content: string }>,
    props: {
      serviceName: string;
      resourceName: string;
      requirements: string;
    },
  ): Promise<{
    content: string;
  } | void> => {
    if (ctx.event === "delete") {
      return;
    }

    const serviceNameLower = props.serviceName.toLowerCase();
    const url = `https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/${serviceNameLower}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    }

    const html = await response.text();
    const turndownService = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
    });
    const markdown = turndownService.turndown(html);

    // Use AI to analyze the docs and extract relevant API information
    const model = await resolveModel("gpt-4o");
    const apiSummary = await generateText({
      model,
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content:
            "You are an expert at analyzing AWS SDK documentation and identifying relevant APIs for CloudFormation resource implementations.",
        },
        {
          role: "user",
          content: `Please analyze the AWS SDK v3 documentation for the ${props.serviceName} service and identify APIs that would be relevant for implementing the ${props.resourceName} resource's CRUD lifecycle.

Requirements for the CRUD lifecycle:
${props.requirements}

For each relevant API, extract:
1. The command name (e.g., CreateUserCOMmand, DeleteRoleCommand)
2. A brief description of what it does
3. The Input type name (e.g. CreateUserCommandInput)
4. The Output type name (e.g. CreateUserCommandOutput)

Also include the written documentation for the API.

Documentation:
${markdown}`,
        },
      ],
    });

    return {
      content: apiSummary.text,
    };
  },
) {}
