// utils/richText.js, used as-is for discussion text (it escapes first, so its
// output is safe for innerHTML). Same shape as the module's JSDoc.
declare module '@legacy/utils/richText.js' {
  export const RICH_TEXT_HINT: string;
  export function renderRichText(
    content: string | null | undefined,
    options?: {
      mentionedUsers?: { username: string; full_name?: string }[];
      mentionedGroups?: { id: number | string; name: string; slug?: string }[];
    },
  ): string;
}
