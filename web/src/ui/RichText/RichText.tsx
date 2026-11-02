import { useCallback, useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { GroupMembersPopover } from './GroupMembersPopover';
import { renderRichText, type MentionedGroup, type MentionedUser } from './renderRichText';
import classes from './RichText.module.css';

export interface RichTextProps {
  /** What the user typed: markdown-lite, never HTML. */
  content: string | null | undefined;
  /** Resolves @username to a full name (the API's mentioned_users_data). */
  mentionedUsers?: readonly MentionedUser[] | null;
  /** The groups the server found in the text (mentioned_groups_data). */
  mentionedGroups?: readonly MentionedGroup[] | null;
  className?: string;
}

type OpenGroup = { anchor: HTMLElement; id: string; name: string };

/**
 * Comment and discussion text: the markdown-lite markers, links and mention
 * badges, exactly as the legacy pages show them. Clicking a group badge lists
 * the people the mention notified.
 */
export function RichText({ content, mentionedUsers, mentionedGroups, className }: RichTextProps) {
  // renderRichText escapes the text first and only adds tags it wrote itself,
  // so its output is the one HTML string this app sets as innerHTML.
  const html = useMemo(
    () => renderRichText(content, { mentionedUsers, mentionedGroups }),
    [content, mentionedUsers, mentionedGroups],
  );
  const [open, setOpen] = useState<OpenGroup | null>(null);
  const close = useCallback(() => setOpen(null), []);

  const activate = (target: EventTarget) => {
    const badge = (target as Element).closest?.<HTMLElement>('.mention-badge-group');
    if (!badge?.dataset.groupId) return false;
    // Compare the badge, not the group: the same group can be mentioned twice,
    // and the second badge should move the popover rather than close it.
    setOpen((current) =>
      current?.anchor === badge
        ? null
        : { anchor: badge, id: badge.dataset.groupId ?? '', name: badge.dataset.groupName ?? '' },
    );
    return true;
  };

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    if (activate(event.target)) event.preventDefault();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.key === 'Enter' || event.key === ' ') && activate(event.target))
      event.preventDefault();
  };

  if (!html) return null;
  return (
    <>
      {/* Clicks are delegated: the badges (role="button") are inside the rendered HTML. */}
      <div
        className={className ? `${classes.richText} ${className}` : classes.richText}
        onClick={onClick}
        onKeyDown={onKeyDown}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {open ? (
        <GroupMembersPopover
          key={`${open.id}-${open.name}`}
          anchor={open.anchor}
          group={{ id: open.id, name: open.name }}
          onClose={close}
        />
      ) : null}
    </>
  );
}
