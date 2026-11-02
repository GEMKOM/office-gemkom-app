import type { ReactNode } from 'react';
import classes from './ui.module.css';

/**
 * Meaning, not colour: green done / active, blue in progress, yellow waiting,
 * orange needs attention, red rejected / blocked, purple special routing,
 * grey neutral / inactive.
 */
export type StatusFamily = 'green' | 'blue' | 'yellow' | 'orange' | 'red' | 'purple' | 'grey';

export interface StatusBadgeProps {
  color: StatusFamily;
  children: ReactNode;
}

/** Names the state of a record in a soft pill; the word is always there. */
export function StatusBadge({ color, children }: StatusBadgeProps) {
  return (
    <span className={classes.status} data-family={color}>
      {children}
    </span>
  );
}
