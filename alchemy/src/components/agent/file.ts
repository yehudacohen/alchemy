import { z } from "zod";

export type File = z.infer<typeof File>;

export const File = z.object({
  path: z.string(),
  content: z.string(),
});
