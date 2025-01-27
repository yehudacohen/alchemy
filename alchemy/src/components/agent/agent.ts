import type { ZodType } from "zod";
import { type Context, type Provider, Resource } from "../../resource";

export function Agent<Type extends string, TInput, TOutput>(
  type: Type,
  {
    description,
    input,
    output,
  }: {
    description: string;
    input: ZodType<TInput>;
    output: ZodType<TOutput>;
  },
  handler: (ctx: Context<TOutput>, props: TInput) => Promise<TOutput | void>,
): Provider<Type, [TInput], Awaited<TOutput>> & {
  description: string;
  input: ZodType<TInput>;
  output: ZodType<TOutput>;
} {
  // @ts-expect-error - we don't care that the props are not statically known, they will be visible outside this scope
  return class Agent extends Resource(
    type,
    async (ctx: Context<TOutput>, props: TInput): Promise<TOutput | void> => {
      // Validate input
      const validatedInput = input.parse(props);

      // Call handler with validated input
      const result = await handler(ctx, validatedInput);

      if (ctx.event === "delete") {
        return;
      }

      // Validate output
      const validatedOutput = output.parse(result);

      return validatedOutput;
    },
  ) {
    static readonly description = description;
    static readonly input = input;
    static readonly output = output;
  };
}
