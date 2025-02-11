/**
 * Extracts TypeScript code from a markdown code block
 * @param text Response text that may contain markdown
 * @returns The TypeScript code if found, undefined otherwise
 */
export function extractTypeScriptCode(text: string): string | undefined {
  const matches = text.match(/```(?:ts|typescript)\n([\s\S]*?)```/);
  return matches?.[1]?.trim();
}

/**
 * Extracts markdown content from a code block or returns the full content
 * @param text Response text that may contain markdown code blocks
 * @returns The markdown content from code block if found, otherwise returns the full text
 */
export function extractMarkdown(text: string): string {
  const matches = text.match(/```md\n([\s\S]*?)```/);
  return matches?.[1]?.trim() ?? text.trim();
}
