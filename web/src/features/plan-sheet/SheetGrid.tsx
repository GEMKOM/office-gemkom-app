/**
 * The plan sheet grid: a spreadsheet whose rows ARE its Gantt rows (the
 * İmalat Planlama grid of planning/project-planning/grid.js, cut down to what
 * the sheet needs, plus the sheet's own projection tails and termin pills
 * from projects/project-tracking/planSheet.js).
 *
 *   scroll                 ← the only scroller (both axes)
 *     canvas               ← gridWidth + timelineWidth
 *       header             ← sticky top: column heads | month tier over week/day tier
 *       row *              ← fixed height, so a row and its bar cannot drift apart
 *         rowGrid          ← sticky left, opaque
 *         rowTime          ← the bars, positioned by date
 *
 * One group row per job, the department tasks beneath it. The BAR is the plan
 * window with the progress fill; a hatched tail after it is the projected
 * overrun; the violet line is the termin; on a job row a pill after the
 * projection's end says how far that end sits from the termin ("+25g");
 * today is red. On an editable link every cell takes a click.
 */
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { FaIcon } from '@/ui/FaIcon';
import { DATE_ENTRY_PLACEHOLDER, formatDMY, maskDateInput, optionsWithCurrentValue, parseDMY } from './dateEntry';
import { fmtDateTr } from './planSheetText';
import { tr, wdText } from './sheetLang';
import { SheetCellContent } from './SheetCells';
import {
  applyRowOverrides,
  buildSheetRows,
  columnsWidth,
  domainBar,
  EDIT_TYPES,
  groupKeyOf,
  NUMBER_FIELDS,
  overrideFieldOf,
  rowBar,
  sheetColumns,
  STATUS_OPTIONS,
  visibleSheetRows,
  type SheetColumn,
  type SheetField,
  type SheetGridRow,
} from './sheetRows';
import {
  buildTimeline,
  dayWidth,
  nonWorkingBackground,
  timelineTiers,
  toKey,
  type Timeline,
  type ZoomUnit,
} from './timeline';
import type { PlanSheet, RowOverrides } from './types';
import { createWorkdayCalendar } from './workdays';
import classes from './SheetGrid.module.css';

const ROW_HEIGHT = 30;
const MIN_GRID_WIDTH = 260;
const ZOOM_ORDER: readonly ZoomUnit[] = ['month', 'week', 'day'];

export interface SheetGridProps {
  sheet: PlanSheet;
  /** Column fields to show (Görev always); null or [] = every column. */
  columns?: readonly string[] | null;
  /** Department tasks only: crews and subcontractors hidden. */
  mainOnly?: boolean;
  /** Folded job rows ("job-<job_no>"). */
  collapsed: ReadonlySet<string>;
  onCollapsedChange: (collapsed: Set<string>) => void;
  zoom: ZoomUnit;
  /** Ctrl/⌘ + wheel over the timeline asks for the next zoom. */
  onZoomChange?: (zoom: ZoomUnit) => void;
  /** The frozen table's width; by default the columns' own, then what the grip sets. */
  gridWidth?: number | null;
  onGridWidthChange?: (px: number) => void;
  /** Print geometry: the timeline's column width, and the host's width on paper. */
  colWidth?: number | null;
  hostWidth?: number | null;
  /** Editable link: row key → field → value, laid over the computed rows. */
  overrides?: RowOverrides | null;
  /** Editable link: every cell takes a click; `field` is the override field. */
  onEdit?: (row: SheetGridRow, field: string, value: string) => void | Promise<void>;
  onEditError?: (error: Error) => void;
  today?: Date;
  className?: string;
}

interface Editing {
  rowKey: string;
  field: SheetField;
}

const colStyle = (col: SheetColumn): CSSProperties =>
  col.grow ? { width: col.width, flex: `1 0 ${col.width}px` } : { width: col.width };

export function SheetGrid({
  sheet,
  columns: fields = null,
  mainOnly = false,
  collapsed,
  onCollapsedChange,
  zoom,
  onZoomChange,
  gridWidth: gridWidthProp = null,
  onGridWidthChange,
  colWidth = null,
  hostWidth: hostWidthProp = null,
  overrides = null,
  onEdit,
  onEditError,
  today: todayProp,
  className,
}: SheetGridProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const editable = typeof onEdit === 'function';

  const columns = useMemo(() => sheetColumns(fields), [fields]);
  const columnsKey = columns.map((c) => c.field).join(',');
  // What the grip set; a new column set takes its own width again.
  const [userWidth, setUserWidth] = useState<{ key: string; px: number } | null>(null);
  const gridWidth =
    gridWidthProp ?? (userWidth && userWidth.key === columnsKey ? userWidth.px : columnsWidth(columns));

  const [measured, setMeasured] = useState(0);
  const hostWidth = hostWidthProp ?? measured;
  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    setMeasured(el.clientWidth);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => setMeasured(el.clientWidth), 150);
    });
    observer.observe(el);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

  const [today] = useState(() => todayProp ?? new Date());
  const calendar = useMemo(() => createWorkdayCalendar(sheet.holidays || []), [sheet.holidays]);
  const allRows = useMemo(
    () => applyRowOverrides(buildSheetRows(sheet, collapsed, { mainOnly }), editable ? overrides : null),
    [sheet, collapsed, mainOnly, editable, overrides],
  );
  const rows = useMemo(() => visibleSheetRows(allRows, collapsed), [allRows, collapsed]);

  // The lane's own width decides how far the timeline has to run.
  const lane = Math.max(0, hostWidth - gridWidth - 2);
  const timeline = useMemo(
    () => buildTimeline(rows, zoom, today, domainBar, lane, colWidth),
    [rows, zoom, today, lane, colWidth],
  );
  const nonWork = useMemo(
    () => nonWorkingBackground(timeline, calendar.isNonWorkingDay),
    [timeline, calendar],
  );

  const groupKeys = useMemo(() => (sheet.nodes || []).map(groupKeyOf), [sheet.nodes]);
  const allCollapsed = groupKeys.length > 0 && groupKeys.every((k) => collapsed.has(k));

  const toggleGroup = useCallback(
    (key: string) => {
      const next = new Set(collapsed);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      onCollapsedChange(next);
    },
    [collapsed, onCollapsedChange],
  );

  // The header's double chevron: fold every job, or open every job.
  const toggleAll = () => {
    const next = new Set(collapsed);
    if (allCollapsed) groupKeys.forEach((k) => next.delete(k));
    else groupKeys.forEach((k) => next.add(k));
    onCollapsedChange(next);
  };

  // A plan that runs longer than the lane opens on the past otherwise; today
  // sits a third of the way in, with the recent weeks to its left.
  const scrolledToToday = useRef(false);
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (scrolledToToday.current || !scroller || !sheet.today || !hostWidth) return;
    scrolledToToday.current = true;
    const visibleLane = scroller.clientWidth - gridWidth;
    if (visibleLane <= 0 || timeline.width <= visibleLane) return;
    const x = timeline.xOf(String(sheet.today).slice(0, 10));
    if (x === null) return;
    scroller.scrollLeft = Math.max(0, Math.round(x - visibleLane / 3));
  }, [sheet.today, hostWidth, gridWidth, timeline]);

  // Ctrl/⌘ + wheel over the timeline zooms; the buttons stay.
  const wheelZoom = useEffectEvent((deltaY: number) => {
    const at = ZOOM_ORDER.indexOf(zoom);
    const next = ZOOM_ORDER[Math.min(ZOOM_ORDER.length - 1, Math.max(0, at + (deltaY < 0 ? 1 : -1)))];
    if (next && next !== zoom) onZoomChange?.(next);
  });
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      if (!(e.target instanceof Element) || !e.target.closest('[data-lane]')) return;
      e.preventDefault();
      wheelZoom(e.deltaY);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Dragging the grip re-sizes the frozen block, live through the CSS
  // variable; the timeline follows on release.
  const onGripDown = (e: ReactPointerEvent) => {
    e.preventDefault();
    const host = hostRef.current;
    if (!host) return;
    const startX = e.clientX;
    const startW = gridWidth;
    let width = startW;
    document.body.classList.add(classes.resizing!);
    const move = (ev: PointerEvent) => {
      width = Math.max(MIN_GRID_WIDTH, startW + (ev.clientX - startX));
      host.style.setProperty('--pg-grid-w', `${width}px`);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.classList.remove(classes.resizing!);
      host.style.removeProperty('--pg-grid-w');
      setUserWidth({ key: columnsKey, px: width });
      onGridWidthChange?.(width);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // Clicking a row's name scrolls the timeline to its bar: on a 31-week sheet
  // it is usually off-screen.
  const scrollToBar = (row: SheetGridRow) => {
    const bar = rowBar(row);
    const scroller = scrollRef.current;
    if (!bar || !scroller) return;
    const x = timeline.xOf(bar.start || bar.end);
    if (x === null) return;
    const visibleLane = scroller.clientWidth - gridWidth;
    scroller.scrollLeft = Math.max(0, x - Math.max(40, visibleLane * 0.15));
  };

  const [editing, setEditing] = useState<Editing | null>(null);

  const commitEdit = async (row: SheetGridRow, field: SheetField, value: string) => {
    setEditing(null);
    try {
      await onEdit?.(row, overrideFieldOf(row, field), value);
    } catch (error) {
      onEditError?.(error instanceof Error ? error : new Error(String(error)));
    }
  };

  const style = {
    '--pg-grid-w': `${gridWidth}px`,
    '--pg-row-h': `${ROW_HEIGHT}px`,
    '--pg-col-w': `${timeline.colWidth}px`,
    '--pg-time-w': `${timeline.width}px`,
    '--pg-nonwork-bg': nonWork,
  } as CSSProperties;

  const todayX = timeline.xOf(toKey(today));
  const tiers = timelineTiers(timeline);

  return (
    <div ref={hostRef} className={[classes.grid, className].filter(Boolean).join(' ')} style={style}>
      {!rows.length ? (
        <div className={classes.empty}>{tr('Bu iş emrinde plan satırı yok.', 'This job order has no plan rows.')}</div>
      ) : (
        <div ref={scrollRef} className={classes.scroll} data-sheet-scroll>
          <div className={classes.canvas}>
            <div className={classes.header}>
              <div className={classes.headerGrid}>
                {columns.map((col, i) => (
                  <div
                    key={col.field}
                    className={classes.hcell}
                    data-center={col.center || undefined}
                    style={colStyle(col)}
                    title={col.title}
                  >
                    {i === 0 && (
                      <button
                        type="button"
                        className={classes.toggleAll}
                        onClick={toggleAll}
                        title={
                          allCollapsed ? tr('Tümünü aç', 'Expand all') : tr('Tümünü kapat', 'Collapse all')
                        }
                        aria-label={
                          allCollapsed ? tr('Tümünü aç', 'Expand all') : tr('Tümünü kapat', 'Collapse all')
                        }
                      >
                        <FaIcon icon={allCollapsed ? 'fas fa-angles-down' : 'fas fa-angles-up'} />
                      </button>
                    )}
                    {col.label}
                  </div>
                ))}
                <div
                  className={classes.grip}
                  onPointerDown={onGripDown}
                  title={tr('Sürükleyerek sütun alanını genişletin', 'Drag to widen the columns')}
                />
              </div>
              <div className={classes.headerTime} style={{ width: timeline.width }} data-lane>
                <div className={classes.tierTop}>
                  {tiers.map((t, i) => (
                    <div key={i} className={classes.tierCell} style={{ width: t.span * timeline.colWidth }}>
                      <span>{t.label}</span>
                    </div>
                  ))}
                </div>
                <div className={classes.tierBottom}>
                  {timeline.columns.map((c, i) => (
                    <div key={i} className={classes.tierCell} style={{ width: timeline.colWidth }}>
                      {c.label}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className={classes.rows}>
              {todayX !== null && (
                <div className={classes.today} style={{ left: `calc(var(--pg-grid-w) + ${todayX}px)` }} />
              )}
              {rows.map((row) => (
                <SheetRow
                  key={row.key}
                  row={row}
                  columns={columns}
                  timeline={timeline}
                  editable={editable}
                  editingField={editing && editing.rowKey === row.key ? editing.field : null}
                  onStartEdit={(field) => setEditing({ rowKey: row.key, field })}
                  onCancelEdit={() => setEditing(null)}
                  onCommitEdit={(field, value) => void commitEdit(row, field, value)}
                  onEditError={onEditError}
                  onToggle={() => toggleGroup(row.key)}
                  onTitleClick={() => scrollToBar(row)}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface SheetRowProps {
  row: SheetGridRow;
  columns: SheetColumn[];
  timeline: Timeline;
  editable: boolean;
  editingField: SheetField | null;
  onStartEdit: (field: SheetField) => void;
  onCancelEdit: () => void;
  onCommitEdit: (field: SheetField, value: string) => void;
  onEditError?: (error: Error) => void;
  onToggle: () => void;
  onTitleClick: () => void;
}

function SheetRow({
  row,
  columns,
  timeline,
  editable,
  editingField,
  onStartEdit,
  onCancelEdit,
  onCommitEdit,
  onEditError,
  onToggle,
  onTitleClick,
}: SheetRowProps) {
  const task = row.kind === 'task' ? row.row : undefined;
  const late = !!task && Number(row.deviation || 0) > 0;
  const chain =
    !!task && Number(task.chain_deviation_wd || 0) > 0 && Number(task.own_deviation_wd || 0) <= 0;
  return (
    <div
      className={classes.row}
      data-row={row.key}
      data-kind={row.kind}
      data-indent={row.indent || 0}
      data-late={late || undefined}
      data-chain={chain || undefined}
      data-block={task?.kind === 'block' || undefined}
      data-dead={task?.dead || undefined}
    >
      <div className={classes.rowGrid}>
        {columns.map((col) => (
          <div
            key={col.field}
            className={classes.cell}
            data-field={col.field}
            data-center={col.center || undefined}
            data-editable={editable || undefined}
            style={colStyle(col)}
            onClick={() => {
              if (col.field === 'title') onTitleClick();
              if (editable && editingField !== col.field) onStartEdit(col.field);
            }}
          >
            {editingField === col.field ? (
              <CellEditor
                row={row}
                field={col.field}
                onCommit={(value) => onCommitEdit(col.field, value)}
                onCancel={onCancelEdit}
                onError={onEditError}
              />
            ) : (
              <SheetCellContent field={col.field} row={row} onToggle={onToggle} />
            )}
          </div>
        ))}
      </div>
      <div className={classes.rowTime} data-lane>
        <RowBars row={row} timeline={timeline} />
      </div>
    </div>
  );
}

/** The termin line, the plan bar, the projection tail and the termin pill. */
function RowBars({ row, timeline }: { row: SheetGridRow; timeline: Timeline }) {
  const oneUnit = dayWidth(timeline);
  const bar = rowBar(row);
  const startX = bar ? timeline.xOf(bar.start || bar.end) : null;
  const endX = bar ? timeline.xOf(bar.end || bar.start) : null;
  // The termin: the same hairline on every row of the job, so the group reads
  // as one continuous rule down the sheet.
  const tx = row.job_target ? timeline.xOf(row.job_target) : null;
  let barNode = null;
  if (bar && startX !== null && endX !== null) {
    // The end date is inclusive: a one-day task is one day wide.
    const width = Math.max(6, endX - startX + oneUnit);
    barNode = (
      <div className={classes.bar} data-state={bar.state} style={{ left: startX, width }} title={bar.title}>
        <div className={classes.barFill} style={{ width: `${bar.progress}%` }} />
        {width > 54 && <span className={classes.barLabel}>{bar.label}</span>}
      </div>
    );
  }
  return (
    <>
      {tx !== null && <div className={classes.targetLine} style={{ left: tx + oneUnit }} />}
      {barNode}
      <ProjectionTail row={row} timeline={timeline} />
      <TerminGapPill row={row} timeline={timeline} />
    </>
  );
}

// The projected overrun behind the plan bar: a hatched tail from the plan end
// to the projected end — red for the row's own loss, grey when it is only the
// chain (the row before it finishing late).
function ProjectionTail({ row, timeline }: { row: SheetGridRow; timeline: Timeline }) {
  const planEnd = row.plan_end;
  const projected = row.projected_end;
  if (!planEnd || !projected || projected <= planEnd) return null;
  if (row.kind === 'task' && row.row?.dead) return null;
  const x0 = timeline.xOf(planEnd);
  const x1 = timeline.xOf(projected);
  if (x0 === null || x1 === null) return null;
  const left = x0 + dayWidth(timeline);
  const width = Math.max(4, x1 - x0);
  const dev = Number(row.deviation || 0);
  const chainOnly =
    row.kind === 'task' &&
    !row.edited?.has('deviation') &&
    Number(row.row?.own_deviation_wd || 0) <= 0 &&
    Number(row.row?.chain_deviation_wd || 0) > 0;
  const label = `${dev > 0 ? '+' : ''}${dev}`;
  const title = tr(
    `Öngörülen bitiş ${fmtDateTr(projected)}: plana göre ${label} iş günü${chainOnly ? ' (zincir)' : ''}`,
    `Projected end ${fmtDateTr(projected)}: ${label} working days against the plan${chainOnly ? ' (chained)' : ''}`,
  );
  return (
    <div className={classes.barExt} data-chain={chainOnly || undefined} style={{ left, width }} title={title}>
      {row.kind !== 'group' && width > 34 && <span>{label}</span>}
    </div>
  );
}

// Job rows: "+25g" just past the end of the projection (the hatched tail, or
// the bar when there is no overrun): the space there is clear, and the pill
// reads as "ends here, 25 working days past the termin".
function TerminGapPill({ row, timeline }: { row: SheetGridRow; timeline: Timeline }) {
  if (row.kind !== 'group' || !row.job_target) return null;
  const delta = Number(row.job_target_delta_wd || 0);
  if (!delta) return null;
  const planEnd = row.plan_end;
  const projected = row.projected_end;
  const endDate = projected && planEnd && projected > planEnd ? projected : planEnd || projected;
  if (!endDate) return null;
  const x = timeline.xOf(endDate);
  if (x === null) return null;
  const late = delta > 0;
  const label = `${late ? '+' : '−'}${Math.abs(delta)}${tr('g', 'd')}`;
  const title = tr(
    `Termin ${fmtDateTr(row.job_target)}: öngörülen bitiş termini ${Math.abs(delta)} iş günü ${late ? 'aşıyor' : 'önce'}`,
    `Due date ${fmtDateTr(row.job_target)}: the projected end is ${wdText(delta)} ${late ? 'past it' : 'before it'}`,
  );
  return (
    <div
      className={classes.gapPill}
      data-state={late ? 'late' : 'early'}
      style={{ left: x + dayWidth(timeline) }}
      title={title}
    >
      {label}
    </div>
  );
}

interface CellEditorProps {
  row: SheetGridRow;
  field: SheetField;
  onCommit: (value: string) => void;
  onCancel: () => void;
  onError?: (error: Error) => void;
}

/** The in-cell editor: Enter or leaving saves, Escape cancels; a select saves
 *  on change and a blur without a change does not commit. */
function CellEditor({ row, field, onCommit, onCancel, onError }: CellEditorProps) {
  const type = EDIT_TYPES[field];
  // A job row's Görev cell shows its number and name; the name is what changes.
  const value = (row.kind === 'group' && field === 'title' ? row.job_title : row[field]) as
    | string
    | number
    | null
    | undefined;
  const done = useRef(false);
  const ref = useRef<HTMLInputElement & HTMLSelectElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    if (el instanceof HTMLInputElement) el.select();
  }, []);

  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    const el = ref.current;
    if (!commit || !el) {
      onCancel();
      return;
    }
    let next = el.value;
    if (type === 'date') {
      const parsed = parseDMY(next);
      if (parsed === null) {
        onCancel();
        onError?.(new Error(`Geçerli bir tarih girin (${DATE_ENTRY_PLACEHOLDER}).`));
        return;
      }
      next = parsed;
    }
    if (String(next) === String(value ?? '')) {
      onCancel();
      return;
    }
    onCommit(next);
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      finish(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      finish(false);
    }
  };

  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

  if (type === 'select') {
    return (
      <select
        ref={ref}
        className={classes.editor}
        defaultValue={value == null ? '' : String(value)}
        onChange={() => finish(true)}
        onBlur={() => finish(false)}
        onKeyDown={onKeyDown}
        onClick={stop}
      >
        {optionsWithCurrentValue(STATUS_OPTIONS, value).map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }
  if (type === 'date') {
    return (
      <input
        ref={ref}
        className={`${classes.editor} ${classes.editorDate}`}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        maxLength={10}
        placeholder={DATE_ENTRY_PLACEHOLDER}
        defaultValue={formatDMY(value)}
        onInput={(e) => maskDateInput(e.currentTarget)}
        onBlur={() => finish(true)}
        onKeyDown={onKeyDown}
        onClick={stop}
      />
    );
  }
  const isNumber = NUMBER_FIELDS.has(field);
  return (
    <input
      ref={ref}
      className={classes.editor}
      type={isNumber ? 'number' : 'text'}
      min={field === 'progress' ? 0 : undefined}
      max={field === 'progress' ? 100 : undefined}
      step={isNumber ? 'any' : undefined}
      defaultValue={value == null ? '' : String(value)}
      onBlur={() => finish(true)}
      onKeyDown={onKeyDown}
      onClick={stop}
    />
  );
}
