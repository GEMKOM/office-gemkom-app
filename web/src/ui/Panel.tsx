import type { ReactNode } from 'react';
import { FaIcon } from './FaIcon';
import classes from './ui.module.css';

export interface PanelProps {
  title?: ReactNode;
  /** Font Awesome classes, shown in red before the title. */
  icon?: string;
  /** Small buttons on the right of the header. */
  actions?: ReactNode;
  /** Replaces the title on the header's left (e.g. an inline FilterBar). */
  headerLeft?: ReactNode;
  /** A bar under the body (pagination, totals). */
  footer?: ReactNode;
  /** Body padding; false for edge-to-edge content such as a table. */
  padded?: boolean;
  children?: ReactNode;
  className?: string;
}

/** The white card that holds a block of a page, with an optional header bar. */
export function Panel({ title, icon, actions, headerLeft, footer, padded = true, children, className }: PanelProps) {
  const hasHead = Boolean(title || headerLeft || actions);
  return (
    <section className={className ? `${classes.panel} ${className}` : classes.panel}>
      {hasHead ? (
        <div className={classes.panelHead}>
          {headerLeft ?? (
            <h2 className={classes.panelTitle}>
              {icon ? <FaIcon icon={icon} /> : null}
              {title}
            </h2>
          )}
          {actions ? <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{actions}</div> : null}
        </div>
      ) : null}
      {padded ? <div className={classes.panelBody}>{children}</div> : children}
      {footer ? <div className={classes.panelFoot}>{footer}</div> : null}
    </section>
  );
}
