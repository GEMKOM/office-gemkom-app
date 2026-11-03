// Planning grid: an Excel-style sheet whose rows ARE its Gantt rows (React port
// of planning/project-planning/grid.js).
//
// The left columns and the timeline live in the same .pg-row, so a row and its
// bar cannot drift apart. One scroll container holds everything, with the
// header stuck to the top and the grid columns stuck to the left: a frozen-pane
// spreadsheet.
//
//   pg-scroll                     the only scroller (both axes)
//     pg-canvas                   gridWidth + timelineWidth
//       pg-header                 sticky top
//         pg-header-grid          sticky left, above everything
//         pg-header-time          two tiers: month/year over week/day
//       pg-row *                  fixed height, hence perfect alignment
//         pg-row-grid             sticky left, opaque
//         pg-row-time             the bar, positioned by date
//
// Speed: every row is a memoized component and its output is a pure function
// of its row object (plus the shared timeline and column set). The page hands
// over the same object for a row that did not change, so an edit re-renders
// only the rows whose values moved. The legacy grid rebuilt every row through
// innerHTML on each edit. Row-level callbacks (isCellEditable, rowClassName,
// bar, target, actions) must therefore read nothing but the row, and be stable.
//
// Bars are read-only: dates are typed into the grid cells, and the timeline
// reflects them.

import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import {
  DATE_ENTRY_PLACEHOLDER,
  formatDMY,
  maskDMY,
  optionsWithCurrentValue,
  parseDMY,
  shortDMY,
  type GridOption,
} from './dateEntry';
import {
  buildTimeline,
  headerTiers,
  nonWorkingBackground,
  sameTimeline,
  toKey,
  type GridLocale,
  type Timeline,
  type ZoomUnit,
} from './timeline';
import './grid.css';

export interface GridRowBase {
  key: string;
  /** Rows sharing a groupKey hide when that key is collapsed. */
  groupKey?: string | null;
}

export interface GridColumn<R> {
  field: string;
  label: string;
  /** CSS width, e.g. '96px'. */
  width: string;
  /** Takes the frozen table's spare width when the grip drags it wider. */
  grow?: boolean;
  type?: 'text' | 'number' | 'date' | 'select';
  options?: readonly GridOption[];
  min?: number;
  max?: number;
  step?: number;
  title?: string;
  headerClass?: string;
  cellClass?: string;
  render: (row: R) => ReactNode;
  /** The value the editor starts from; default `row[field]`. */
  value?: (row: R) => unknown;
}

export interface GridBar {
  start: string | null;
  end: string | null;
  progress?: number;
  state?: string;
  label?: string;
  title?: string;
  /** Printed just past the bar's right edge (dd.mm). */
  endDate?: string | null;
  hideEndLabel?: boolean;
}

/** The job's termin: a dashed line on the row, and on summary rows a tag. */
export interface GridTarget {
  date: string;
  tag: boolean;
  /** Working days the plan ends after (+) or before (−) the termin. */
  deltaWd?: number | null;
}

export interface GridAction<R> {
  key: string;
  icon: string;
  title: string | ((row: R) => string);
  className?: string;
  visible?: (row: R) => boolean;
  disabled?: (row: R) => boolean;
}

export interface PlanningGridHandle {
  /** Scroll a row into view (vertically centred), optionally pulsing it. */
  scrollToRow(key: string, options?: { pulse?: boolean }): boolean;
  /** The rendered sheet: the PDF export clones its rows. */
  element(): HTMLDivElement | null;
  timeline(): Timeline | null;
}

export interface PlanningGridProps<R extends GridRowBase> {
  rows: readonly R[];
  columns: readonly GridColumn<R>[];
  collapsed?: ReadonlySet<string>;
  rowHeight?: number;
  gridWidth?: number;
  /** How far the grip may drag the frozen table. */
  maxGridWidth?: number;
  zoom?: ZoomUnit;
  /** Fixed column width (the PDF export fits a plan to the page). */
  colWidth?: number | null;
  /** Width the timeline must at least fill; default the measured lane. */
  minTimelineWidth?: number;
  isCellEditable?: (row: R, field: string) => boolean;
  rowClassName?: (row: R) => string;
  actions?: readonly GridAction<R>[];
  bar: (row: R) => GridBar | null;
  target?: (row: R) => GridTarget | null;
  isNonWorkingDay?: ((date: string) => boolean) | null;
  today?: Date;
  locale?: GridLocale;
  onEdit?: (row: R, field: string, value: string) => void | Promise<unknown>;
  onEditError?: (error: unknown, row: R, field: string) => void;
  onToggleGroup?: (row: R) => void;
  onToggleAll?: () => void;
  allCollapsed?: boolean;
  onZoomChange?: (zoom: ZoomUnit) => void;
  onGridWidthChange?: (px: number) => void;
  onAction?: (action: string, row: R) => void;
  /** Rendered at the right end of the frozen header (the column picker). */
  headerActions?: ReactNode;
  emptyText?: ReactNode;
  /** false: no grip, no toggles, no editing (the export copy). */
  interactive?: boolean;
  className?: string;
  ref?: Ref<PlanningGridHandle>;
}

// Event handlers the rows call; one stable object that reads the latest props.
interface GridCtx<R> {
  edit(row: R, field: string, value: string): void;
  editError(error: unknown, row: R, field: string): void;
  toggleGroup(row: R): void;
  action(key: string, row: R): void;
  scrollToBar(row: R): void;
}

function colStyle(col: { width: string; grow?: boolean }): CSSProperties {
  return col.grow ? { width: col.width, flex: `1 0 ${col.width}` } : { width: col.width };
}

function fieldValue<R>(row: R, col: GridColumn<R>): unknown {
  return col.value ? col.value(row) : (row as Record<string, unknown>)[col.field];
}

/** Keeps the previous value while `same(prev, next)` holds, so memoized
 *  children see one object until something they draw actually changes. */
function useStable<T>(value: T, same: (a: T, b: T) => boolean): T {
  const [kept, setKept] = useState(value);
  const keep = kept === value || same(kept, value);
  if (!keep) setKept(value);
  return keep ? kept : value;
}

// ---- cell editor ------------------------------------------------------------

interface EditorProps {
  type: GridColumn<unknown>['type'];
  options?: readonly GridOption[];
  min?: number;
  max?: number;
  step?: number;
  initial: unknown;
  onDone: (commit: boolean, raw: string) => void;
}

function CellEditor({ type, options, min, max, step, initial, onDone }: EditorProps) {
  const [text, setText] = useState(() =>
    type === 'date' ? formatDMY(initial as string | null) : String(initial ?? ''),
  );
  const done = useRef(false);
  const input = useRef<HTMLInputElement & HTMLSelectElement>(null);

  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.focus();
    if (el instanceof HTMLInputElement) el.select();
  }, []);

  const finish = (commit: boolean, raw: string) => {
    if (done.current) return;
    done.current = true;
    onDone(commit, raw);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      finish(true, e.currentTarget.value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      finish(false, e.currentTarget.value);
    }
  };

  if (type === 'select') {
    const opts = optionsWithCurrentValue(options, initial);
    // Selects commit on change. Blur without a change must not commit: an
    // unmatched current value used to look like "pending" and a click away
    // would write that.
    return (
      <select
        ref={input}
        className="pg-editor pg-editor-select"
        defaultValue={String(initial ?? '')}
        onChange={(e) => finish(true, e.currentTarget.value)}
        onBlur={(e) => finish(false, e.currentTarget.value)}
        onKeyDown={onKeyDown}
      >
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  if (type === 'date') {
    // Day-first text, never a native date input: see dateEntry.ts.
    return (
      <input
        ref={input}
        className="pg-editor pg-editor-date"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        maxLength={10}
        placeholder={DATE_ENTRY_PLACEHOLDER}
        value={text}
        onChange={(e) => {
          const el = e.currentTarget;
          // Only reformat while the caret is at the end: masking mid-string
          // would jump it, and a pasted ISO date has to survive to be parsed.
          setText(el.selectionStart !== el.value.length ? el.value : maskDMY(el.value));
        }}
        onBlur={(e) => finish(true, e.currentTarget.value)}
        onKeyDown={onKeyDown}
      />
    );
  }

  return (
    <input
      ref={input}
      className="pg-editor"
      type={type === 'number' ? 'number' : 'text'}
      min={min}
      max={max}
      step={step}
      value={text}
      onChange={(e) => setText(e.currentTarget.value)}
      onBlur={(e) => finish(true, e.currentTarget.value)}
      onKeyDown={onKeyDown}
    />
  );
}

// ---- bar lane ---------------------------------------------------------------

function BarLane({
  bar,
  target,
  timeline,
}: {
  bar: GridBar | null;
  target: GridTarget | null;
  timeline: Timeline;
}) {
  const oneUnit =
    timeline.unit === 'day'
      ? timeline.colWidth
      : timeline.colWidth / (timeline.unit === 'week' ? 7 : 30);
  const startX = bar ? timeline.xOf(bar.start || bar.end) : null;
  const endX = bar ? timeline.xOf(bar.end || bar.start) : null;
  const drawn = bar && startX !== null && endX !== null ? { startX, endX } : null;

  let targetLine: ReactNode = null;
  let targetTag: ReactNode = null;
  if (target) {
    const tx = timeline.xOf(target.date);
    if (tx !== null) {
      // A GUIDE, not a mark: one hairline on every row of the job, so it
      // reads as one continuous rule down the group.
      const x = tx + oneUnit;
      targetLine = <div className="pg-target-line" style={{ left: x }} />;
      // ONE tag per job, on the line, carrying the termin and how far the
      // plan sits from it.
      if (target.tag) {
        const delta = Number(target.deltaWd || 0);
        const late = delta > 0;
        const tone = delta ? (late ? ' is-late' : ' is-early') : '';
        const gap = delta ? ` ${late ? '+' : '−'}${Math.abs(delta)}g` : '';
        const why = delta
          ? ` — planlanan bitiş ${Math.abs(delta)} iş günü ${late ? 'sonra' : 'önce'}`
          : '';
        // Right of the line by default; flip left only when a bar starting
        // after the line makes that the clear side.
        const flip = !!drawn && drawn.startX >= x;
        targetTag = (
          <div
            className={`pg-target-tag${tone}${flip ? ' flip' : ''}`}
            style={{ left: x }}
            title={`Termin ${formatDMY(target.date)}${why}`}
          >
            <i className="fas fa-flag-checkered" />
            {formatDMY(target.date)}
            {gap}
          </div>
        );
      }
    }
  }

  if (!bar || !drawn) {
    return (
      <div className="pg-row-time">
        {targetLine}
        {targetTag}
      </div>
    );
  }
  // The end date is inclusive (a same-day task is one day long), so the bar
  // runs to the END of that unit.
  const width = Math.max(6, drawn.endX - drawn.startX + oneUnit);
  const pct = Math.max(0, Math.min(100, Number(bar.progress || 0)));
  const barEnd = drawn.startX + width;
  return (
    <div className="pg-row-time">
      {targetLine}
      {targetTag}
      <div
        className={`pg-bar pg-bar-${bar.state || 'on-time'}`}
        style={{ left: drawn.startX, width }}
        title={bar.title || ''}
      >
        <div className="pg-bar-fill" style={{ width: `${pct}%` }} />
        {width > 54 ? <span className="pg-bar-label">{bar.label || ''}</span> : null}
      </div>
      {bar.endDate && !bar.hideEndLabel ? (
        <div
          className="pg-bar-end"
          style={{ left: barEnd }}
          title={`Bitiş: ${formatDMY(bar.endDate)}`}
        >
          {shortDMY(bar.endDate)}
        </div>
      ) : null}
    </div>
  );
}

// ---- row --------------------------------------------------------------------

interface GridRowProps<R extends GridRowBase> {
  row: R;
  columns: readonly GridColumn<R>[];
  timeline: Timeline;
  isCellEditable?: (row: R, field: string) => boolean;
  rowClassName?: (row: R) => string;
  actions?: readonly GridAction<R>[];
  bar: (row: R) => GridBar | null;
  target?: (row: R) => GridTarget | null;
  ctx: GridCtx<R>;
  interactive: boolean;
}

function GridRowInner<R extends GridRowBase>({
  row,
  columns,
  timeline,
  isCellEditable,
  rowClassName,
  actions,
  bar,
  target,
  ctx,
  interactive,
}: GridRowProps<R>) {
  const [editing, setEditing] = useState<string | null>(null);

  const finish = (col: GridColumn<R>, commit: boolean, raw: string) => {
    setEditing(null);
    if (!commit) return;
    let next = raw;
    if (col.type === 'date') {
      const parsed = parseDMY(raw);
      if (parsed === null) {
        // Same channel as a rule the page refuses: the old value stays and
        // the planner is told why.
        ctx.editError(
          new Error(`Geçerli bir tarih girin (${DATE_ENTRY_PLACEHOLDER}).`),
          row,
          col.field,
        );
        return;
      }
      next = parsed;
    }
    if (String(next) === String(fieldValue(row, col) ?? '')) return;
    ctx.edit(row, col.field, next);
  };

  const onGridClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const target = e.target as HTMLElement;
    if (target.closest('.pg-toggle')) {
      e.preventDefault();
      e.stopPropagation();
      ctx.toggleGroup(row);
    }
  };

  const cells = columns.map((col) => {
    const canEdit = interactive && !!isCellEditable?.(row, col.field);
    const isEditing = canEdit && editing === col.field;
    const cls = ['pg-cell', col.cellClass, col.grow ? 'pg-grow' : '', canEdit ? 'pg-editable' : '']
      .filter(Boolean)
      .join(' ');
    return (
      <div
        key={col.field}
        className={cls}
        style={colStyle(col)}
        data-field={col.field}
        data-row={row.key}
        onClick={
          interactive
            ? (e) => {
                if ((e.target as HTMLElement).closest('.pg-toggle')) return;
                // Clicking a row's name scrolls the timeline to its bar.
                if (col.field === 'title') ctx.scrollToBar(row);
                if (canEdit && !isEditing) setEditing(col.field);
              }
            : undefined
        }
      >
        {isEditing ? (
          <CellEditor
            type={col.type}
            options={col.options}
            min={col.min}
            max={col.max}
            step={col.step}
            initial={fieldValue(row, col)}
            onDone={(commit, raw) => finish(col, commit, raw)}
          />
        ) : (
          col.render(row)
        )}
      </div>
    );
  });

  const buttons = interactive
    ? (actions || [])
        .filter((a) => !a.visible || a.visible(row))
        .map((a) => (
          <button
            key={a.key}
            type="button"
            className={`pg-action-btn${a.className ? ` ${a.className}` : ''}`}
            data-pg-action={a.key}
            title={(typeof a.title === 'function' ? a.title(row) : a.title) || ''}
            aria-label={(typeof a.title === 'function' ? a.title(row) : a.title) || a.key}
            disabled={!!a.disabled?.(row)}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              ctx.action(a.key, row);
            }}
          >
            <i className={a.icon} />
          </button>
        ))
    : null;

  return (
    <div className={`pg-row${rowClassName ? ` ${rowClassName(row)}` : ''}`} data-row={row.key}>
      <div className="pg-row-grid" onClick={onGridClick}>
        {cells}
        <div className="pg-cell pg-cell-actions">{buttons}</div>
      </div>
      <BarLane bar={bar(row)} target={target ? target(row) : null} timeline={timeline} />
    </div>
  );
}

const GridRow = memo(GridRowInner) as <R extends GridRowBase>(
  props: GridRowProps<R>,
) => ReactElement;

// ---- header -----------------------------------------------------------------

interface HeaderProps {
  columns: readonly {
    field: string;
    label: string;
    width: string;
    grow?: boolean;
    title?: string;
    headerClass?: string;
  }[];
  timeline: Timeline;
  allCollapsed: boolean;
  locale: GridLocale;
  interactive: boolean;
  headerActions?: ReactNode;
  onToggleAll?: () => void;
  onGripDown?: (e: ReactPointerEvent<HTMLDivElement>) => void;
}

const GridHeader = memo(function GridHeader({
  columns,
  timeline,
  allCollapsed,
  locale,
  interactive,
  headerActions,
  onToggleAll,
  onGripDown,
}: HeaderProps) {
  const tiers = headerTiers(timeline);
  const toggleTitle =
    locale === 'en'
      ? allCollapsed
        ? 'Expand all'
        : 'Collapse all'
      : allCollapsed
        ? 'Tümünü aç'
        : 'Tümünü kapat';
  return (
    <div className="pg-header">
      <div className="pg-header-grid">
        {columns.map((c, i) => (
          <div
            key={c.field}
            className={['pg-hcell', c.headerClass, c.grow ? 'pg-grow' : '']
              .filter(Boolean)
              .join(' ')}
            style={colStyle(c)}
            title={c.title}
          >
            {i === 0 && interactive ? (
              <i
                className={`fas ${allCollapsed ? 'fa-angles-down' : 'fa-angles-up'} pg-toggle-all`}
                title={toggleTitle}
                role="button"
                aria-label={toggleTitle}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggleAll?.();
                }}
              />
            ) : null}
            {c.label}
          </div>
        ))}
        <div className="pg-hcell pg-hcell-actions">{interactive ? headerActions : null}</div>
        {interactive ? (
          <div
            className="pg-grip"
            title="Sürükleyerek sütun alanını genişletin"
            onPointerDown={onGripDown}
          />
        ) : null}
      </div>
      <div className="pg-header-time" style={{ width: timeline.width }}>
        <div className="pg-tier pg-tier-top">
          {tiers.map((t, i) => (
            <div
              key={`${t.label}-${i}`}
              className="pg-tier-cell"
              style={{ width: t.span * timeline.colWidth }}
            >
              <span>{t.label}</span>
            </div>
          ))}
        </div>
        <div className="pg-tier pg-tier-bottom">
          {timeline.columns.map((c) => (
            <div
              key={c.start.getTime()}
              className="pg-tier-cell"
              style={{ width: timeline.colWidth }}
            >
              {c.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

// ---- grid -------------------------------------------------------------------

const ZOOM_ORDER: ZoomUnit[] = ['month', 'week', 'day'];

export function PlanningGrid<R extends GridRowBase>(props: PlanningGridProps<R>) {
  const {
    rows,
    columns,
    collapsed,
    rowHeight = 30,
    gridWidth = 560,
    zoom = 'week',
    colWidth = null,
    minTimelineWidth,
    isCellEditable,
    rowClassName,
    actions,
    bar,
    target,
    isNonWorkingDay,
    today,
    locale = 'tr',
    allCollapsed = false,
    headerActions,
    emptyText = 'Bu kaynağa atanmış iş yok. "İş Ekle" ile başlayın.',
    interactive = true,
    className,
    ref,
  } = props;

  const hostRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });

  const [todayDate] = useState(() => today ?? new Date());
  const effectiveToday = today ?? todayDate;

  // The lane's own width decides how far the timeline has to run.
  const [hostWidth, setHostWidth] = useState(0);
  useEffect(() => {
    const el = hostRef.current;
    if (!el || minTimelineWidth != null || typeof ResizeObserver === 'undefined') return;
    // Fires once on observe, then on every resize of the pane.
    const observer = new ResizeObserver(() => setHostWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, [minTimelineWidth]);
  const lane = minTimelineWidth ?? Math.max(0, hostWidth - gridWidth - 2);

  // Rows inside a collapsed group are dropped before render: the canvas
  // height and the today line depend on the real row count.
  const visible = useMemo(
    () => (collapsed?.size ? rows.filter((r) => !(r.groupKey && collapsed.has(r.groupKey))) : rows),
    [rows, collapsed],
  );

  const rawTimeline = useMemo(
    () => buildTimeline(visible, zoom, effectiveToday, bar, lane, colWidth, locale),
    [visible, zoom, effectiveToday, bar, lane, colWidth, locale],
  );
  const timeline = useStable(rawTimeline, sameTimeline);
  const timelineRef = useRef<Timeline | null>(null);
  useLayoutEffect(() => {
    timelineRef.current = timeline;
  }, [timeline]);

  const nonWorkBg = useMemo(
    () => nonWorkingBackground(timeline, isNonWorkingDay),
    [timeline, isNonWorkingDay],
  );

  const toggleAll = useCallback(() => latest.current.onToggleAll?.(), []);

  const scrollToBar = useCallback((row: R) => {
    const tl = timelineRef.current;
    const scroller = scrollRef.current;
    const b = latest.current.bar(row);
    if (!b || !tl || !scroller) return;
    const x = tl.xOf(b.start || b.end);
    if (x === null) return;
    const lane = scroller.clientWidth - (latest.current.gridWidth ?? 560);
    // Left-ish rather than centred so what comes after it is visible too.
    // Assigned, not animated: a jump is the useful answer to "take me there".
    scroller.scrollLeft = Math.max(0, x - Math.max(40, lane * 0.15));
  }, []);

  const ctx = useMemo<GridCtx<R>>(
    () => ({
      edit(row, field, value) {
        const p = latest.current;
        try {
          const result = p.onEdit?.(row, field, value);
          if (result && typeof (result as Promise<unknown>).catch === 'function') {
            (result as Promise<unknown>).catch((err) =>
              latest.current.onEditError?.(err, row, field),
            );
          }
        } catch (err) {
          // The page owns the rules; it hands the reason back so the planner
          // is told WHY the edit was refused.
          p.onEditError?.(err, row, field);
        }
      },
      editError(error, row, field) {
        latest.current.onEditError?.(error, row, field);
      },
      toggleGroup(row) {
        latest.current.onToggleGroup?.(row);
      },
      action(key, row) {
        latest.current.onAction?.(key, row);
      },
      scrollToBar,
    }),
    [scrollToBar],
  );

  useImperativeHandle(
    ref,
    () => ({
      scrollToRow(key, options) {
        const el = hostRef.current?.querySelector<HTMLElement>(
          `.pg-row[data-row="${CSS.escape(key)}"]`,
        );
        if (!el) return false;
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        if (options?.pulse) {
          el.classList.add('pg-row-pulse');
          window.setTimeout(() => el.classList.remove('pg-row-pulse'), 1600);
        }
        return true;
      },
      element: () => hostRef.current,
      timeline: () => timelineRef.current,
    }),
    [],
  );

  // Ctrl/⌘ + wheel over the timeline zooms. Native and non-passive: React's
  // wheel listener cannot preventDefault.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !interactive) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      if (!(e.target as HTMLElement).closest('.pg-row-time, .pg-header-time')) return;
      e.preventDefault();
      const current = latest.current.zoom ?? 'week';
      const at = ZOOM_ORDER.indexOf(current);
      const next =
        ZOOM_ORDER[Math.min(ZOOM_ORDER.length - 1, Math.max(0, at + (e.deltaY < 0 ? 1 : -1)))];
      if (next && next !== current) latest.current.onZoomChange?.(next);
    };
    host.addEventListener('wheel', onWheel, { passive: false });
    return () => host.removeEventListener('wheel', onWheel);
  }, [interactive]);

  // Dragging the grip re-sizes the frozen column block, live: the CSS
  // variable moves under the pointer and React hears the final width.
  const onGripDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const host = hostRef.current;
    if (!host) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = latest.current.gridWidth ?? 560;
    const maxW = latest.current.maxGridWidth ?? 1100;
    let width = startW;
    document.body.classList.add('pg-resizing');
    const move = (ev: PointerEvent) => {
      width = Math.max(260, Math.min(maxW, startW + (ev.clientX - startX)));
      host.style.setProperty('--pg-grid-w', `${width}px`);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.classList.remove('pg-resizing');
      latest.current.onGridWidthChange?.(width);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, []);

  const todayX = timeline.xOf(toKey(effectiveToday));
  const style = {
    '--pg-grid-w': `${gridWidth}px`,
    '--pg-row-h': `${rowHeight}px`,
    '--pg-col-w': `${timeline.colWidth}px`,
    '--pg-time-w': `${timeline.width}px`,
    '--pg-nonwork-bg': nonWorkBg,
  } as CSSProperties;

  return (
    <div ref={hostRef} className={className ? `pg ${className}` : 'pg'} style={style}>
      {visible.length ? (
        <div ref={scrollRef} className="pg-scroll">
          <div className="pg-canvas">
            <GridHeader
              columns={columns}
              timeline={timeline}
              allCollapsed={allCollapsed}
              locale={locale}
              interactive={interactive}
              headerActions={headerActions}
              onToggleAll={toggleAll}
              onGripDown={onGripDown}
            />
            <div className="pg-rows">
              {todayX === null ? null : (
                <div
                  className="pg-today"
                  style={{ left: `calc(var(--pg-grid-w) + ${todayX}px)` }}
                />
              )}
              {visible.map((row) => (
                <GridRow
                  key={row.key}
                  row={row}
                  columns={columns}
                  timeline={timeline}
                  isCellEditable={isCellEditable}
                  rowClassName={rowClassName}
                  actions={actions}
                  bar={bar}
                  target={target}
                  ctx={ctx}
                  interactive={interactive}
                />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="pg-empty">
          <i className="fas fa-inbox fa-2x" style={{ display: 'block', marginBottom: 8 }} />
          {emptyText}
        </div>
      )}
    </div>
  );
}
