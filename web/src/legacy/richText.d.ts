// utils/richText.js, used as-is by the React pages that show AI or discussion
// text (it/feedback, it/neo). Delete with the module's TypeScript port.

declare module '@legacy/utils/richText.js' {
  /**
   * Markdown-lite to HTML. Escapes the input first and only adds its own tags,
   * so the result is safe for dangerouslySetInnerHTML.
   */
  export function renderRichText(
    content: unknown,
    options?: { mentionedUsers?: unknown[]; mentionedGroups?: unknown[] },
  ): string;
}
