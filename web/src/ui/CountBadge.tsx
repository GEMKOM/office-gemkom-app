import { VisuallyHidden } from '@mantine/core';
import classes from './ui.module.css';

/** "99+" past 99, so the pill stays small. */
export const badgeText = (count: number) => (count > 99 ? '99+' : String(count));

export interface CountBadgeProps {
  /** Nothing is drawn for 0, undefined (still loading) or a failed count. */
  count: number | undefined;
  /** Read out after the number ("onay bekliyor"). */
  label?: string;
}

/**
 * The red app-style badge for things that wait on the user: it shows the
 * count, and disappears when there is nothing left.
 */
export function CountBadge({ count, label }: CountBadgeProps) {
  if (!count || count < 0) return null;
  return (
    <span className={classes.countBadge} data-count-badge>
      <span aria-hidden={label ? true : undefined}>{badgeText(count)}</span>
      {label ? <VisuallyHidden>{`${count} ${label}`}</VisuallyHidden> : null}
    </span>
  );
}
