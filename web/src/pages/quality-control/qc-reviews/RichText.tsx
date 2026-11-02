import { renderRichText } from '@legacy/utils/richText.js';
import { useMemo } from 'react';
import type { MentionedGroup, MentionedUser } from '@/api/quality-control/qcReviews';
import classes from './RichText.module.css';

export interface RichTextProps {
  content: string | null | undefined;
  mentionedUsers?: MentionedUser[];
  mentionedGroups?: MentionedGroup[];
}

/** Discussion text with the legacy markdown-lite markers and mention badges. */
export function RichText({ content, mentionedUsers, mentionedGroups }: RichTextProps) {
  const html = useMemo(
    () => renderRichText(content, { mentionedUsers, mentionedGroups }),
    [content, mentionedUsers, mentionedGroups],
  );
  // renderRichText escapes the user's text before adding its own tags.
  return (
    <div className={`rich-text ${classes.richText}`} dangerouslySetInnerHTML={{ __html: html }} />
  );
}
