import type { ZodType } from "zod";
import { apply } from "../../apply";
import type { Input } from "../../input";
import type { Output } from "../../output";
import { type Context, type Provider, Resource } from "../../resource";

export function Agent<Type extends string, TInput, TOutput>(
  type: Type,
  {
    description,
    input,
    output,
    alwaysUpdate = false,
  }: {
    description: string;
    input?: ZodType<TInput>;
    output?: ZodType<TOutput>;
    alwaysUpdate?: boolean;
  },
  handler: (
    ctx: Context<TOutput>,
    props: TInput,
  ) => Promise<Input<TOutput> | void>,
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
      const validatedInput = input ? input.parse(props) : props;

      // Call handler with validated input
      const result = await handler(ctx, validatedInput);

      if (result === undefined) {
        return;
      } else if (ctx.event === "delete") {
        return;
      }

      const evaluated = await apply(result as Output<TOutput>, {
        stage: ctx.stage,
        scope: ctx.scope,
        quiet: ctx.quiet,
      });

      // Validate output
      const validatedOutput = output ? output.parse(evaluated) : evaluated;

      return validatedOutput;
    },
    {
      alwaysUpdate,
    },
  ) {
    static readonly description = description;
    static readonly input = input;
    static readonly output = output;
  };
}
