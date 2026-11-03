import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import classes from './Gantt.module.css';

export interface GanttTooltipRect {
  left: number;
  top: number;
  bottom: number;
  width: number;
}

export interface GanttTooltipProps {
  /** The hovered element's viewport box (getBoundingClientRect). */
  rect: GanttTooltipRect;
  title?: ReactNode;
  children?: ReactNode;
}

/**
 * The chart's dark hover card, for timelines drawn outside <Gantt> (the
 * İmalat Planlama sheet). Above the element, or below it near the top of the
 * window; portalled so a scroller or a contained row cannot clip it. Importing
 * it also brings the Gantt's [data-tone] bar families.
 */
export function GanttTooltip({ rect, title, children }: GanttTooltipProps) {
  const below = rect.top < 140;
  return createPortal(
    <div
      className={classes.tooltip}
      role="tooltip"
      style={{
        left: Math.max(
          8,
          Math.min(rect.left + Math.min(rect.width, 240) / 2, window.innerWidth - 160),
        ),
        top: below ? rect.bottom + 8 : rect.top - 8,
        transform: below ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
      }}
    >
      {title ? <div className={classes.tooltipTitle}>{title}</div> : null}
      {children}
    </div>,
    document.body,
  );
}
