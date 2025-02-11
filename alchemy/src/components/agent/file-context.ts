import { z } from "zod";

export type FileContext = z.infer<typeof FileContext>;

export const FileContext = z.object({
  path: z.string(),
  content: z.string().optional(),
});
