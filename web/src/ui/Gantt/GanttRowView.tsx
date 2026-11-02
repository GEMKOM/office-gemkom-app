import { memo, useMemo } from 'react';
import { FaIcon } from '../FaIcon';
import { barGaps, type WorkingWindows } from './calendar';
import { shallowEqualArrays } from './layout';
import type { Store } from './store';
import { useStore } from './store';
import { barBox, formatSpan, type GanttScale, type TimeRange } from './timeScale';
import type { GanttBar, GanttRow } from './types';
import classes from './Gantt.module.css';

export interface DragPreview {
  barId: string;
  start: number;
  end: number;
  rowId: string;
}

export interface GanttStores {
  selected: Store<string | null>;
  drag: Store<DragPreview | null>;
}

interface RowViewProps {
  row: GanttRow;
  bars: readonly GanttBar[];
  top: number;
  height: number;
  labelWidth: number;
  timelineWidth: number;
  scale: GanttScale;
  range: TimeRange;
  pxPerMs: number;
  /** Horizontal window (px in the timeline) whose bars are rendered. */
  winFrom: number;
  winTo: number;
  workingWindows: WorkingWindows | null;
  canDrag: boolean;
  canResize: boolean;
  reorderable: boolean;
  stores: GanttStores;
}

function RowViewImpl(props: RowViewProps) {
  const { row, bars, top, height, labelWidth, timelineWidth, range, pxPerMs, winFrom, winTo } =
    props;
  const title = row.title ?? [row.label, row.sublabel].filter(Boolean).join(' – ');
  return (
    <div
      className={classes.row}
      data-group={row.group || undefined}
      data-row-id={row.id}
      style={{ top, height, width: labelWidth + timelineWidth }}
    >
      <div
        className={classes.label}
        data-row-label={row.id}
        data-muted={row.muted || undefined}
        style={{ width: labelWidth }}
        title={title}
      >
        {props.reorderable && !row.group ? (
          <span
            className={classes.grip}
            data-reorder={row.id}
            aria-hidden
            title="Sürükleyerek sırala"
          >
            <FaIcon icon="fas fa-grip-vertical" />
          </span>
        ) : null}
        <span className={classes.labelText}>
          <span className={classes.labelKey}>
            {row.label}
            {row.locked ? (
              <FaIcon icon="fas fa-lock" className={classes.labelLock} aria-label="Kilitli" />
            ) : null}
          </span>
          {row.sublabel ? <span className={classes.labelSub}>{row.sublabel}</span> : null}
        </span>
      </div>
      <div className={classes.lane} style={{ width: timelineWidth }}>
        {bars.map((bar) => {
          const box = barBox(bar.start, bar.end, range, pxPerMs);
          if (!box || box.left + box.width < winFrom || box.left > winTo) return null;
          const editable = !bar.locked;
          return (
            <BarView
              key={bar.id}
              bar={bar}
              left={box.left}
              width={box.width}
              clippedStart={box.clippedStart}
              clippedEnd={box.clippedEnd}
              scale={props.scale}
              rangeStart={range.start}
              rangeEnd={range.end}
              pxPerMs={pxPerMs}
              workingWindows={props.workingWindows}
              draggable={props.canDrag && editable}
              resizable={props.canResize && editable}
              stores={props.stores}
            />
          );
        })}
      </div>
    </div>
  );
}

/** A row re-renders only when its row object, its bars or the layout change. */
export const GanttRowView = memo(RowViewImpl, (a, b) => {
  for (const key of Object.keys(a) as (keyof RowViewProps)[]) {
    if (key === 'bars') {
      if (!shallowEqualArrays(a.bars, b.bars)) return false;
    } else if (key === 'range') {
      if (a.range.start !== b.range.start || a.range.end !== b.range.end) return false;
    } else if (a[key] !== b[key]) {
      return false;
    }
  }
  return true;
});

interface BarViewProps {
  bar: GanttBar;
  left: number;
  width: number;
  clippedStart: boolean;
  clippedEnd: boolean;
  scale: GanttScale;
  rangeStart: number;
  rangeEnd: number;
  pxPerMs: number;
  workingWindows: WorkingWindows | null;
  draggable: boolean;
  resizable: boolean;
  stores: GanttStores;
}

function BarViewImpl({
  bar,
  left,
  width,
  clippedStart,
  clippedEnd,
  scale,
  rangeStart,
  rangeEnd,
  pxPerMs,
  workingWindows,
  draggable,
  resizable,
  stores,
}: BarViewProps) {
  // Each bar listens for itself only: selecting or dragging one bar re-renders it alone.
  const selected = useStore(stores.selected, (id) => id === bar.id);
  const dragging = useStore(stores.drag, (d) => d?.barId === bar.id);

  const gaps = useMemo(() => {
    if (!workingWindows) return [];
    return barGaps(bar, scale, { start: rangeStart, end: rangeEnd }, workingWindows);
  }, [bar, scale, rangeStart, rangeEnd, workingWindows]);

  const progress = bar.progress == null ? null : Math.min(100, Math.max(0, bar.progress));
  const name = bar.title ?? bar.label ?? bar.id;
  return (
    <div
      role="button"
      tabIndex={selected ? 0 : -1}
      className={classes.bar}
      data-bar-id={bar.id}
      data-tone={bar.tone ?? 'brand'}
      data-selected={selected || undefined}
      data-dragging={dragging || undefined}
      data-dashed={bar.dashed || undefined}
      data-draggable={draggable || undefined}
      data-clipped-start={clippedStart || undefined}
      data-clipped-end={clippedEnd || undefined}
      aria-label={`${name}, ${formatSpan(bar.start, bar.end)}${progress != null ? `, %${Math.round(progress)}` : ''}${bar.locked ? ', kilitli' : ''}`}
      style={{ left, width }}
    >
      {progress != null ? (
        <span
          className={classes.progress}
          data-tone={bar.progressTone ?? bar.tone ?? 'brand'}
          style={{ width: `${progress}%` }}
        />
      ) : null}
      {gaps.map((gap) => {
        const gapLeft =
          (Math.max(gap.start, rangeStart) - Math.max(bar.start, rangeStart)) * pxPerMs;
        return (
          <span
            key={gap.start}
            className={classes.gap}
            style={{ left: gapLeft, width: (gap.end - gap.start) * pxPerMs }}
          />
        );
      })}
      <span className={classes.barText}>
        {bar.locked ? <FaIcon icon="fas fa-lock" className={classes.barLock} /> : null}
        {bar.label}
        {progress != null && progress > 20 && width > 70 ? (
          <span className={classes.barPct}>%{Math.round(progress)}</span>
        ) : null}
      </span>
      {resizable && !clippedStart ? (
        <span className={classes.handle} data-handle="start" data-side="start" />
      ) : null}
      {resizable && !clippedEnd ? (
        <span className={classes.handle} data-handle="end" data-side="end" />
      ) : null}
    </div>
  );
}

const BarView = memo(BarViewImpl);
