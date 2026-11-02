import type { ReactNode } from 'react';
import classes from './charts.module.css';

export type DashSpan = 3 | 4 | 5 | 6 | 7 | 8 | 9 | 12;

/** A 12-column grid for dashboard panels; every cell is full width below 992px. */
export function DashGrid({ children }: { children: ReactNode }) {
  return <div className={classes.grid}>{children}</div>;
}

export interface DashCellProps {
  /** Columns out of 12 on a desktop. Default 12. */
  span?: DashSpan;
  /** Half width on a tablet (768–991px). */
  halfOnTablet?: boolean;
  children: ReactNode;
}

export function DashCell({ span = 12, halfOnTablet = false, children }: DashCellProps) {
  return (
    <div data-span={span} data-span-md={halfOnTablet ? 6 : undefined} style={{ minWidth: 0 }}>
      {children}
    </div>
  );
}
