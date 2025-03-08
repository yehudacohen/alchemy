/**
 * Extracts markdown content from a code block or returns the full content
 * @param text Response text that may contain markdown code blocks
 * @returns The markdown content from code block if found, otherwise returns the full text
 */
export function extractMarkdown(text: string): string {
  const matches = text.match(/```md\n([\s\S]*?)```/);
  return matches?.[1]?.trim() ?? text.trim();
}
