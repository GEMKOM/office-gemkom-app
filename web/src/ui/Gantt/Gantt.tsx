import { ActionIcon, Group, LoadingOverlay, SegmentedControl, Text, Tooltip } from '@mantine/core';
import { defaultRangeExtractor, useVirtualizer, type Range } from '@tanstack/react-virtual';
import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { FaIcon } from '../FaIcon';
import { Panel } from '../Panel';
import { offIntervals, weekendsOff, type OffInterval, type WorkingWindows } from './calendar';
import { GanttRowView, type DragPreview, type GanttStores } from './GanttRowView';
import { groupBarsByRow, navigate, type NavKey } from './layout';
import { createStore, useStore, type Store } from './store';
import {
  autoMonthSpan,
  barBox,
  DAY,
  dragResult,
  formatHours,
  formatSpan,
  HOUR,
  MINUTE,
  periodLabel,
  pxPerMs as computePxPerMs,
  reorderTarget,
  rowIndexAt,
  SCALE_LABELS,
  shiftAnchor,
  snapStep,
  startOfDay,
  ticks as computeTicks,
  viewRange,
  type DragMode,
  type GanttScale,
  type Tick,
  type TimeRange,
} from './timeScale';
import type { GanttBar, GanttEditing, GanttProps, GanttRow } from './types';
import classes from './Gantt.module.css';

const HEADER_HEIGHT = 48;
const DEFAULT_SCALES: readonly GanttScale[] = ['day', 'week', 'month', 'year'];
const EMPTY_BARS: readonly GanttBar[] = [];
/** Pointer travel before a press becomes a drag (a shorter one is a click). */
const DRAG_THRESHOLD = 4;
/** Distance from the scroll area's edge that starts auto-scrolling during a drag. */
const EDGE = 40;

interface ReorderPreview {
  rowId: string;
  index: number;
  position: 'before' | 'after';
}

interface ChartStores extends GanttStores {
  hover: Store<HoverState | null>;
  reorder: Store<ReorderPreview | null>;
}

interface HoverState {
  barId: string;
  rect: { left: number; top: number; bottom: number; width: number };
}

type Gesture =
  | {
      kind: 'bar';
      bar: GanttBar;
      mode: DragMode;
      editable: boolean;
      pointerId: number;
      startX: number;
      startY: number;
      startScrollLeft: number;
      lastX: number;
      lastY: number;
      active: boolean;
    }
  | {
      kind: 'row';
      rowId: string;
      pointerId: number;
      startY: number;
      lastX: number;
      lastY: number;
      active: boolean;
    }
  | { kind: 'label'; rowId: string; pointerId: number; startX: number; startY: number };

function resolveEditing(editable: GanttProps['editable']): Required<GanttEditing> {
  if (editable === true) return { move: true, resize: true, changeRow: false };
  if (!editable) return { move: false, resize: false, changeRow: false };
  return {
    move: Boolean(editable.move),
    resize: Boolean(editable.resize),
    changeRow: Boolean(editable.changeRow),
  };
}

const NAV_KEYS: Record<string, NavKey> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  Home: 'home',
  End: 'end',
  PageUp: 'pageUp',
  PageDown: 'pageDown',
};

/**
 * Timeline chart: rows (machines, tasks) with bars over a day / week / month /
 * year axis. Replaces components/gantt/gantt.js.
 *
 * Built to stay fast with thousands of bars: rows are virtualized and the time
 * axis, shading and bars are windowed horizontally; rows and bars are
 * memoized, so changing one bar re-renders only its row. Pointer and keyboard
 * input is handled once, on the scroll area; the drag preview, hover and
 * selection live in small stores so a pointer move touches one element.
 */
export function Gantt<B extends GanttBar = GanttBar>(props: GanttProps<B>) {
  const {
    rows,
    bars,
    title,
    icon,
    toolbar,
    labelHeader = 'Görev',
    scales = DEFAULT_SCALES,
    monthsPerView = 1,
    rowHeight = 44,
    labelWidth = 220,
    height,
    showToday = true,
    loading = false,
    emptyMessage = 'Planlanmış görev bulunmuyor',
    ariaLabel = 'Zaman çizelgesi',
  } = props;
  const workingWindows: WorkingWindows | null =
    props.workingWindows === undefined ? weekendsOff : props.workingWindows;
  const editing = resolveEditing(props.editable);
  const reorderable = Boolean(props.onRowReorder);
  const helpId = useId();

  // ---- view (scale + period) ----
  const [scaleState, setScaleState] = useState<GanttScale>(() => {
    const initial = props.defaultScale ?? 'month';
    return scales.includes(initial) ? initial : (scales[0] ?? 'month');
  });
  const scale = props.scale ?? scaleState;
  const [anchorState, setAnchorState] = useState<number>(() => props.defaultAnchor ?? Date.now());
  const [navigated, setNavigated] = useState(false);

  const auto = useMemo(() => {
    if (monthsPerView !== 'auto') return null;
    const times: number[] = [];
    for (const b of bars) times.push(b.start, b.end);
    return autoMonthSpan(times, Date.now());
  }, [bars, monthsPerView]);
  const months =
    scale !== 'month'
      ? 1
      : monthsPerView === 'auto'
        ? (auto?.months ?? 1)
        : Math.max(1, monthsPerView);
  // 'auto' opens at the first month with work until the planner navigates.
  const anchor =
    props.anchor ?? (auto && !navigated && scale === 'month' ? auto.start : anchorState);
  const computedRange = viewRange(scale, anchor, months);
  const rangeStart = computedRange.start;
  const rangeEnd = computedRange.end;
  const range = useMemo<TimeRange>(
    () => ({ start: rangeStart, end: rangeEnd }),
    [rangeStart, rangeEnd],
  );

  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });

  // View changes come from memoized controls and the keyboard; they read the
  // current view from a ref so their identity never changes.
  const view = useRef({ scale, anchor, months });
  useLayoutEffect(() => {
    view.current = { scale, anchor, months };
  });
  const onViewAction = useCallback((action: ViewAction) => {
    const { scale: currentScale, anchor: currentAnchor, months: currentMonths } = view.current;
    let nextScale = currentScale;
    let nextAnchor = currentAnchor;
    if (action.type === 'scale') nextScale = action.scale;
    else {
      setNavigated(true);
      nextAnchor =
        action.type === 'today'
          ? Date.now()
          : shiftAnchor(currentScale, currentAnchor, action.direction);
    }
    const p = latest.current;
    if (p.scale === undefined) setScaleState(nextScale);
    if (p.anchor === undefined) setAnchorState(nextAnchor);
    p.onViewChange?.({
      scale: nextScale,
      anchor: nextAnchor,
      range: viewRange(nextScale, nextAnchor, nextScale === 'month' ? currentMonths : 1),
    });
  }, []);

  // ---- sizes ----
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const measure = () => setViewportWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const timelineViewport = Math.max(0, viewportWidth - labelWidth);
  const scalePx = computePxPerMs(scale, range, { viewportWidth: timelineViewport, months });
  const timelineWidth = Math.ceil((range.end - range.start) * scalePx);
  const canvasWidth = labelWidth + timelineWidth;
  const bodyHeight = Math.max(rows.length, 1) * rowHeight;

  // ---- horizontal window: re-render rows only when scrolling crosses a chunk ----
  const chunkWidth = Math.max(400, timelineViewport || 800);
  const [chunk, setChunk] = useState(0);
  const winFrom = (chunk - 1) * chunkWidth;
  const winTo = (chunk + 2) * chunkWidth;

  // ---- data bookkeeping ----
  const barsByRow = useMemo(() => groupBarsByRow(bars as readonly GanttBar[]), [bars]);
  const barsById = useMemo(() => new Map(bars.map((b) => [b.id, b])), [bars]);
  const rowIndexById = useMemo(() => new Map(rows.map((r, i) => [r.id, i])), [rows]);

  const [stores] = useState<ChartStores>(() => ({
    selected: createStore<string | null>(null),
    drag: createStore<DragPreview | null>(null),
    hover: createStore<HoverState | null>(null),
    reorder: createStore<ReorderPreview | null>(null),
  }));
  // Selection lives in a store: changing it re-renders the two bars involved,
  // not the chart. The selected row's index is kept for the virtualizer.
  const selectedRow = useRef(-1);
  useLayoutEffect(() => {
    const sync = () => {
      const bar = barsById.get(stores.selected.get() ?? '');
      selectedRow.current = bar ? (rowIndexById.get(bar.rowId) ?? -1) : -1;
    };
    // The first bar is the chart's tab stop until another one is selected.
    if (!barsById.has(stores.selected.get() ?? '')) {
      const first = rows.map((r) => barsByRow.get(r.id)?.[0]).find(Boolean);
      stores.selected.set(first?.id ?? null);
    }
    sync();
    return stores.selected.subscribe(sync);
  }, [barsById, barsByRow, rowIndexById, rows, stores]);

  // ---- vertical virtualization (the selected row stays mounted for focus) ----
  const rangeExtractor = useCallback((r: Range) => {
    const indexes = defaultRangeExtractor(r);
    const selected = selectedRow.current;
    if (selected >= 0 && selected < r.count && !indexes.includes(selected)) {
      indexes.push(selected);
      indexes.sort((a, b) => a - b);
    }
    return indexes;
  }, []);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => rowHeight,
    overscan: 8,
    paddingStart: HEADER_HEIGHT,
    rangeExtractor,
    // Until the scroll area is measured (and in tests, where nothing is).
    initialRect: { width: 1200, height: 600 },
  });
  const virtualRows = virtualizer.getVirtualItems();

  // ---- open where the work is: 07:00 in the day view, today on a long strip ----
  const scrolledFor = useRef('');
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el || timelineViewport <= 0) return;
    const key = `${scale}|${range.start}|${range.end}`;
    if (scrolledFor.current === key) return;
    scrolledFor.current = key;
    let left = 0;
    if (scale === 'day') left = 7 * HOUR * scalePx;
    else if (scale === 'month' && months > 1) {
      const days = Math.floor((startOfDay(Date.now()) - range.start) / DAY);
      if (days > 0) left = (days - 2) * DAY * scalePx;
    }
    el.scrollLeft = Math.max(0, left);
    setChunk(Math.floor(el.scrollLeft / chunkWidth));
  }, [scale, range, months, scalePx, timelineViewport, chunkWidth]);

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const next = Math.floor(el.scrollLeft / chunkWidth);
    if (next !== chunk) setChunk(next);
    if (stores.hover.get()) stores.hover.set(null);
  };

  // ---- background: ticks, time off, today ----
  const allTicks = useMemo(() => computeTicks(scale, range), [scale, range]);
  const visibleTicks = useMemo(
    () =>
      allTicks.filter((t) => {
        const x0 = (t.start - range.start) * scalePx;
        const x1 = (t.end - range.start) * scalePx;
        return x1 >= winFrom && x0 <= winTo;
      }),
    [allTicks, range, scalePx, winFrom, winTo],
  );
  const offs = useMemo(
    () => (workingWindows ? offIntervals(scale, range, workingWindows) : []),
    [scale, range, workingWindows],
  );
  const visibleOffs = useMemo(
    () =>
      offs.filter((o) => {
        const x0 = (o.start - range.start) * scalePx;
        const x1 = (o.end - range.start) * scalePx;
        return x1 >= winFrom && x0 <= winTo;
      }),
    [offs, range, scalePx, winFrom, winTo],
  );

  // ---- pointer input (one delegated handler set) ----
  const gesture = useRef<Gesture | null>(null);
  const autoScroll = useRef<number | null>(null);

  const pointInBody = (clientX: number, clientY: number) => {
    const el = scrollerRef.current!;
    const rect = el.getBoundingClientRect();
    return {
      x: clientX - rect.left + el.scrollLeft - labelWidth,
      y: clientY - rect.top + el.scrollTop - HEADER_HEIGHT,
    };
  };

  const updatePreview = (g: Gesture) => {
    const el = scrollerRef.current;
    if (!el || g.kind === 'label') return;
    if (g.kind === 'row') {
      const { y } = pointInBody(g.lastX, g.lastY);
      const target = reorderTarget(y, rowHeight, rows.length);
      stores.reorder.set(target ? { rowId: g.rowId, ...target } : null);
      return;
    }
    const step =
      (latest.current.snapMinutes ?? 0) > 0
        ? latest.current.snapMinutes! * MINUTE
        : snapStep(scale);
    const dx = g.lastX - g.startX + (el.scrollLeft - g.startScrollLeft);
    const next = dragResult(g.mode, g.bar, dx / scalePx, step, range.start);
    let rowId = g.bar.rowId;
    if (editing.changeRow && g.mode === 'move') {
      const { y } = pointInBody(g.lastX, g.lastY);
      const target = rows[rowIndexAt(y, rowHeight, rows.length)];
      if (target && !target.group) rowId = target.id;
    }
    stores.drag.set({ barId: g.bar.id, start: next.start, end: next.end, rowId });
  };

  const stopAutoScroll = () => {
    if (autoScroll.current !== null) cancelAnimationFrame(autoScroll.current);
    autoScroll.current = null;
  };

  const runAutoScroll = () => {
    const el = scrollerRef.current;
    const g = gesture.current;
    if (!el || !g || g.kind === 'label' || !g.active) {
      stopAutoScroll();
      return;
    }
    const rect = el.getBoundingClientRect();
    let dx = 0;
    let dy = 0;
    if (g.kind === 'bar') {
      if (g.lastX < rect.left + labelWidth + EDGE) dx = -12;
      else if (g.lastX > rect.right - EDGE) dx = 12;
    }
    if (g.lastY < rect.top + HEADER_HEIGHT + EDGE / 2) dy = -10;
    else if (g.lastY > rect.bottom - EDGE / 2) dy = 10;
    if (dx || dy) {
      el.scrollLeft += dx;
      el.scrollTop += dy;
      updatePreview(g);
      autoScroll.current = requestAnimationFrame(runAutoScroll);
    } else {
      autoScroll.current = null;
    }
  };

  const endGesture = (commit: boolean) => {
    const g = gesture.current;
    gesture.current = null;
    stopAutoScroll();
    const el = scrollerRef.current;
    if (g && el?.hasPointerCapture?.(g.pointerId)) el.releasePointerCapture(g.pointerId);
    if (!g) return;
    if (g.kind === 'bar') {
      const preview = stores.drag.get();
      stores.drag.set(null);
      if (!g.active) {
        if (commit) {
          stores.selected.set(g.bar.id);
          latest.current.onBarOpen?.(g.bar as B);
        }
        return;
      }
      if (
        commit &&
        preview &&
        (preview.start !== g.bar.start ||
          preview.end !== g.bar.end ||
          preview.rowId !== g.bar.rowId)
      ) {
        latest.current.onBarChange?.({
          bar: g.bar as B,
          start: preview.start,
          end: preview.end,
          rowId: preview.rowId,
          via: 'drag',
        });
      }
      return;
    }
    if (g.kind === 'row') {
      const preview = stores.reorder.get();
      stores.reorder.set(null);
      if (commit && g.active && preview) {
        const target = rows[preview.index];
        if (target && target.id !== g.rowId)
          latest.current.onRowReorder?.(g.rowId, target.id, preview.position);
      }
      return;
    }
    if (commit) openRow(g.rowId);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || gesture.current) return;
    const target = e.target as HTMLElement;
    const grip = target.closest<HTMLElement>('[data-reorder]');
    const barEl = target.closest<HTMLElement>('[data-bar-id]');
    const labelEl = target.closest<HTMLElement>('[data-row-label]');
    const base = { pointerId: e.pointerId, lastX: e.clientX, lastY: e.clientY, active: false };
    if (grip && reorderable) {
      const row = rows[rowIndexById.get(grip.dataset.reorder!) ?? -1];
      if (!row || (latest.current.canReorderRow && !latest.current.canReorderRow(row))) return;
      gesture.current = { kind: 'row', rowId: row.id, startY: e.clientY, ...base };
      e.preventDefault();
    } else if (barEl) {
      const bar = barsById.get(barEl.dataset.barId!);
      if (!bar) return;
      const handle = target.closest<HTMLElement>('[data-handle]')?.dataset.handle as
        DragMode | undefined;
      const mode: DragMode = handle ?? 'move';
      const editable =
        !bar.locked && (mode === 'move' ? editing.move || editing.changeRow : editing.resize);
      gesture.current = {
        kind: 'bar',
        bar,
        mode,
        editable,
        startX: e.clientX,
        startY: e.clientY,
        startScrollLeft: e.currentTarget.scrollLeft,
        ...base,
      };
      // Keep text from being selected while dragging; focus follows the press.
      if (editable) e.preventDefault();
      barEl.focus({ preventScroll: true });
    } else if (labelEl) {
      gesture.current = {
        kind: 'label',
        rowId: labelEl.dataset.rowLabel!,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
      };
      return;
    } else {
      return;
    }
    e.currentTarget.setPointerCapture?.(e.pointerId);
    stores.hover.set(null);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId || g.kind === 'label') return;
    g.lastX = e.clientX;
    g.lastY = e.clientY;
    if (!g.active) {
      const travel =
        g.kind === 'bar'
          ? Math.hypot(e.clientX - g.startX, e.clientY - g.startY)
          : Math.abs(e.clientY - g.startY);
      if (travel < DRAG_THRESHOLD) return;
      if (g.kind === 'bar' && !g.editable) {
        // Not editable: the press was neither a click nor a drag.
        gesture.current = null;
        return;
      }
      g.active = true;
    }
    updatePreview(g);
    if (autoScroll.current === null) autoScroll.current = requestAnimationFrame(runAutoScroll);
  };

  const onPointerOver = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (gesture.current?.kind === 'bar' && gesture.current.active) return;
    const barEl = (e.target as HTMLElement).closest<HTMLElement>('[data-bar-id]');
    if (!barEl) return;
    const r = barEl.getBoundingClientRect();
    stores.hover.set({
      barId: barEl.dataset.barId!,
      rect: { left: r.left, top: r.top, bottom: r.bottom, width: r.width },
    });
  };
  const onPointerOut = (e: ReactPointerEvent<HTMLDivElement>) => {
    const from = (e.target as HTMLElement).closest('[data-bar-id]');
    const to = (e.relatedTarget as HTMLElement | null)?.closest?.('[data-bar-id]');
    if (from && from !== to) stores.hover.set(null);
  };

  useEffect(() => stopAutoScroll, []);

  // ---- keyboard ----
  const focusBar = (id: string, tries = 4) => {
    requestAnimationFrame(() => {
      const el = scrollerRef.current?.querySelector<HTMLElement>(
        `[data-bar-id="${CSS.escape(id)}"]`,
      );
      if (el) el.focus({ preventScroll: true });
      else if (tries > 0) focusBar(id, tries - 1);
    });
  };

  const revealBar = (bar: GanttBar) => {
    const el = scrollerRef.current;
    if (!el) return;
    const index = rowIndexById.get(bar.rowId);
    if (index !== undefined) virtualizer.scrollToIndex(index, { align: 'auto' });
    const box = barBox(bar.start, bar.end, range, scalePx);
    if (box) {
      const viewLeft = el.scrollLeft;
      const viewRight = viewLeft + timelineViewport;
      if (box.left < viewLeft || box.left + Math.min(box.width, timelineViewport) > viewRight) {
        const target =
          box.width < timelineViewport
            ? box.left - (timelineViewport - box.width) / 2
            : box.left - 40;
        el.scrollLeft = Math.max(0, Math.min(target, timelineWidth - timelineViewport));
        setChunk(Math.floor(el.scrollLeft / chunkWidth));
      }
    }
  };

  const selectBar = (bar: GanttBar) => {
    stores.selected.set(bar.id);
    revealBar(bar);
    focusBar(bar.id);
  };

  const openRow = (rowId: string) => {
    const row = rows[rowIndexById.get(rowId) ?? -1];
    if (!row) return;
    if (latest.current.onRowOpen) {
      latest.current.onRowOpen(row);
      return;
    }
    // Legacy: a label click takes the timeline to the row's bar.
    const first = barsByRow.get(row.id)?.[0];
    if (first) selectBar(first);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && gesture.current) {
      e.preventDefault();
      endGesture(false);
      return;
    }
    const barEl = (e.target as HTMLElement).closest<HTMLElement>('[data-bar-id]');
    const current = barsById.get(barEl?.dataset.barId ?? stores.selected.get() ?? '');
    if ((e.key === 'Enter' || e.key === ' ') && current && barEl) {
      e.preventDefault();
      latest.current.onBarOpen?.(current as B);
      return;
    }
    const nav = NAV_KEYS[e.key];
    if (!nav) return;
    e.preventDefault();
    if (e.altKey && current && (nav === 'left' || nav === 'right')) {
      // Alt+←/→ moves the bar one snap step, Alt+Shift+←/→ changes its end.
      const mode: DragMode = e.shiftKey ? 'end' : 'move';
      if (current.locked || !(mode === 'move' ? editing.move : editing.resize)) return;
      const step =
        (latest.current.snapMinutes ?? 0) > 0
          ? latest.current.snapMinutes! * MINUTE
          : snapStep(scale);
      const next = dragResult(mode, current, nav === 'left' ? -step : step, step, range.start);
      latest.current.onBarChange?.({
        bar: current as B,
        start: next.start,
        end: next.end,
        rowId: current.rowId,
        via: 'keyboard',
      });
      focusBar(current.id);
      return;
    }
    if (e.altKey && current && (nav === 'up' || nav === 'down')) {
      // Alt+↑/↓: reorder the row (queue order) or move the bar to the next row.
      const index = rowIndexById.get(current.rowId) ?? -1;
      const step = nav === 'up' ? -1 : 1;
      let targetIndex = index + step;
      while (rows[targetIndex]?.group) targetIndex += step;
      const target = rows[targetIndex];
      if (!target) return;
      const row = rows[index];
      if (
        reorderable &&
        row &&
        (!latest.current.canReorderRow || latest.current.canReorderRow(row))
      ) {
        latest.current.onRowReorder?.(row.id, target.id, nav === 'up' ? 'before' : 'after');
        focusBar(current.id);
      } else if (editing.changeRow && !current.locked) {
        latest.current.onBarChange?.({
          bar: current as B,
          start: current.start,
          end: current.end,
          rowId: target.id,
          via: 'keyboard',
        });
        focusBar(current.id);
      }
      return;
    }
    const next = navigate(rows, barsByRow, current?.id ?? null, nav);
    if (next) selectBar(next);
  };

  const onFocus = (e: ReactFocusEvent<HTMLDivElement>) => {
    const barEl = (e.target as HTMLElement).closest<HTMLElement>('[data-bar-id]');
    if (!barEl) return;
    stores.selected.set(barEl.dataset.barId!);
    if (barEl.matches(':focus-visible')) {
      const r = barEl.getBoundingClientRect();
      stores.hover.set({
        barId: barEl.dataset.barId!,
        rect: { left: r.left, top: r.top, bottom: r.bottom, width: r.width },
      });
    }
  };
  const onBlur = () => {
    if (stores.hover.get()) stores.hover.set(null);
  };

  // ---- render ----
  const viewportHeight = height ?? `min(70vh, ${HEADER_HEIGHT + bodyHeight + 18}px)`;
  const label = periodLabel(scale, anchor, months);

  return (
    <Panel
      title={title}
      icon={icon ?? 'fas fa-chart-gantt'}
      actions={
        <ViewControls
          toolbar={toolbar}
          scales={scales}
          scale={scale}
          label={label}
          onAction={onViewAction}
        />
      }
      padded={false}
      className={classes.panel}
    >
      <div className={classes.root}>
        <LoadingOverlay visible={loading} zIndex={20} overlayProps={{ blur: 1 }} />
        <span id={helpId} className={classes.srOnly}>
          Ok tuşları görevler arasında gezer, Enter görevi açar.
          {editing.move ? ' Alt ile sol/sağ ok görevi taşır.' : ''}
          {editing.resize ? ' Alt ve Shift ile sol/sağ ok bitişi değiştirir.' : ''}
          {reorderable ? ' Alt ile yukarı/aşağı ok sırayı değiştirir.' : ''}
        </span>
        <div
          ref={scrollerRef}
          className={classes.scroller}
          style={{ height: viewportHeight }}
          role="region"
          aria-label={ariaLabel}
          aria-describedby={helpId}
          onScroll={onScroll}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => gesture.current?.pointerId === e.pointerId && endGesture(true)}
          onPointerCancel={() => endGesture(false)}
          onLostPointerCapture={(e) => {
            if (
              gesture.current &&
              gesture.current.kind !== 'label' &&
              gesture.current.pointerId === e.pointerId
            )
              endGesture(false);
          }}
          onPointerOver={onPointerOver}
          onPointerOut={onPointerOut}
          onKeyDown={onKeyDown}
          onFocus={onFocus}
          onBlur={onBlur}
        >
          <div
            className={classes.canvas}
            style={{ width: canvasWidth, height: HEADER_HEIGHT + bodyHeight }}
          >
            <AxisHeader
              ticks={visibleTicks}
              rangeStart={range.start}
              rangeEnd={range.end}
              pxPerMs={scalePx}
              scale={scale}
              labelWidth={labelWidth}
              timelineWidth={timelineWidth}
              labelHeader={labelHeader}
              showToday={showToday}
            />
            <BackgroundLayer
              ticks={visibleTicks}
              offs={visibleOffs}
              rangeStart={range.start}
              rangeEnd={range.end}
              pxPerMs={scalePx}
              labelWidth={labelWidth}
              timelineWidth={timelineWidth}
              height={bodyHeight}
              showToday={showToday}
            />

            {rows.length === 0 ? (
              <div
                className={classes.empty}
                style={{
                  top: HEADER_HEIGHT,
                  width: Math.min(canvasWidth, viewportWidth || canvasWidth),
                  height: rowHeight,
                }}
              >
                {emptyMessage}
              </div>
            ) : null}

            {virtualRows.map((vi) => {
              const row = rows[vi.index];
              if (!row) return null;
              return (
                <GanttRowView
                  key={row.id}
                  row={row}
                  bars={barsByRow.get(row.id) ?? EMPTY_BARS}
                  top={vi.start}
                  height={rowHeight}
                  labelWidth={labelWidth}
                  timelineWidth={timelineWidth}
                  scale={scale}
                  range={range}
                  pxPerMs={scalePx}
                  winFrom={winFrom}
                  winTo={winTo}
                  workingWindows={workingWindows}
                  canDrag={editing.move || editing.changeRow}
                  canResize={editing.resize}
                  reorderable={reorderable && (!props.canReorderRow || props.canReorderRow(row))}
                  stores={stores}
                />
              );
            })}

            <DragGhost
              stores={stores}
              barsById={barsById}
              rowIndexById={rowIndexById}
              range={range}
              pxPerMs={scalePx}
              rowHeight={rowHeight}
              labelWidth={labelWidth}
            />
            <ReorderLine store={stores.reorder} rowHeight={rowHeight} width={canvasWidth} />
          </div>
        </div>
        <BarTooltip
          store={stores.hover}
          barsById={barsById}
          render={props.renderTooltip as ((bar: GanttBar) => ReactNode) | undefined}
        />
      </div>
    </Panel>
  );
}

type ViewAction =
  { type: 'scale'; scale: GanttScale } | { type: 'shift'; direction: number } | { type: 'today' };

const ViewControls = memo(function ViewControls({
  toolbar,
  scales,
  scale,
  label,
  onAction,
}: {
  toolbar: ReactNode;
  scales: readonly GanttScale[];
  scale: GanttScale;
  label: string;
  onAction: (action: ViewAction) => void;
}) {
  const data = useMemo(() => scales.map((s) => ({ value: s, label: SCALE_LABELS[s] })), [scales]);
  return (
    <Group gap="xs" wrap="wrap">
      {toolbar}
      {scales.length > 1 ? (
        <SegmentedControl
          size="xs"
          data={data}
          value={scale}
          onChange={(value) => onAction({ type: 'scale', scale: value as GanttScale })}
          aria-label="Görünüm"
        />
      ) : null}
      <Text size="sm" fw={600} className={classes.period} aria-live="polite">
        {label}
      </Text>
      <Group gap={4} wrap="nowrap">
        <Tooltip label="Önceki Dönem">
          <ActionIcon
            variant="default"
            size="md"
            aria-label="Önceki Dönem"
            onClick={() => onAction({ type: 'shift', direction: -1 })}
          >
            <FaIcon icon="fas fa-chevron-left" />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Bugün">
          <ActionIcon
            variant="default"
            size="md"
            aria-label="Bugün"
            onClick={() => onAction({ type: 'today' })}
          >
            <FaIcon icon="fas fa-home" />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Sonraki Dönem">
          <ActionIcon
            variant="default"
            size="md"
            aria-label="Sonraki Dönem"
            onClick={() => onAction({ type: 'shift', direction: 1 })}
          >
            <FaIcon icon="fas fa-chevron-right" />
          </ActionIcon>
        </Tooltip>
      </Group>
    </Group>
  );
});

interface LayerProps {
  ticks: readonly Tick[];
  rangeStart: number;
  rangeEnd: number;
  pxPerMs: number;
  labelWidth: number;
  timelineWidth: number;
  showToday: boolean;
}

/** The sticky time axis; windowed to the ticks near the viewport. */
const AxisHeader = memo(function AxisHeader({
  ticks,
  rangeStart,
  rangeEnd,
  pxPerMs,
  scale,
  labelWidth,
  timelineWidth,
  labelHeader,
  showToday,
}: LayerProps & { scale: GanttScale; labelHeader: ReactNode }) {
  return (
    <div
      className={classes.header}
      style={{ height: HEADER_HEIGHT, width: labelWidth + timelineWidth }}
    >
      <div className={classes.corner} style={{ width: labelWidth }}>
        {labelHeader}
      </div>
      <div className={classes.axis} style={{ width: timelineWidth }}>
        {ticks.map((t) => (
          <div
            key={t.start}
            className={classes.tick}
            data-month-start={t.monthStart || undefined}
            data-weekend={t.weekend || undefined}
            style={{ left: (t.start - rangeStart) * pxPerMs, width: (t.end - t.start) * pxPerMs }}
          >
            <span className={classes.tickLabel}>{t.label}</span>
            <span className={classes.tickSub}>{t.sub}</span>
          </div>
        ))}
        {showToday ? (
          <TodayMarker
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            pxPerMs={pxPerMs}
            scale={scale}
          />
        ) : null}
      </div>
    </div>
  );
});

/** Time off, grid lines and the today line behind the rows. */
const BackgroundLayer = memo(function BackgroundLayer({
  ticks,
  offs,
  rangeStart,
  rangeEnd,
  pxPerMs,
  labelWidth,
  timelineWidth,
  height,
  showToday,
}: LayerProps & { offs: readonly OffInterval[]; height: number }) {
  return (
    <div
      className={classes.background}
      style={{ top: HEADER_HEIGHT, left: labelWidth, width: timelineWidth, height }}
      aria-hidden
    >
      {offs.map((o) => (
        <div
          key={o.start}
          className={classes.off}
          data-kind={o.kind}
          style={{ left: (o.start - rangeStart) * pxPerMs, width: (o.end - o.start) * pxPerMs }}
          title={o.kind === 'day' ? 'Tatil / hafta sonu' : 'Çalışma saati dışı'}
        />
      ))}
      {ticks.map((t) => (
        <div
          key={t.start}
          className={classes.gridLine}
          data-month-start={t.monthStart || undefined}
          style={{ left: (t.start - rangeStart) * pxPerMs }}
        />
      ))}
      {showToday ? (
        <TodayLine rangeStart={rangeStart} rangeEnd={rangeEnd} pxPerMs={pxPerMs} />
      ) : null}
    </div>
  );
});

function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function TodayLine({
  rangeStart,
  rangeEnd,
  pxPerMs,
}: {
  rangeStart: number;
  rangeEnd: number;
  pxPerMs: number;
}) {
  const now = useNow();
  if (now < rangeStart || now >= rangeEnd) return null;
  return <div className={classes.today} style={{ left: (now - rangeStart) * pxPerMs }} />;
}

function TodayMarker({
  rangeStart,
  rangeEnd,
  pxPerMs,
  scale,
}: {
  rangeStart: number;
  rangeEnd: number;
  pxPerMs: number;
  scale: GanttScale;
}) {
  const now = useNow();
  if (now < rangeStart || now >= rangeEnd) return null;
  const d = new Date(now);
  const label =
    scale === 'day' || scale === 'week'
      ? d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' });
  return (
    <span className={classes.todayLabel} style={{ left: (now - rangeStart) * pxPerMs }}>
      {label}
    </span>
  );
}

function DragGhost({
  stores,
  barsById,
  rowIndexById,
  range,
  pxPerMs,
  rowHeight,
  labelWidth,
}: {
  stores: GanttStores;
  barsById: ReadonlyMap<string, GanttBar>;
  rowIndexById: ReadonlyMap<string, number>;
  range: TimeRange;
  pxPerMs: number;
  rowHeight: number;
  labelWidth: number;
}) {
  const preview = useStore(stores.drag, (d) => d);
  if (!preview) return null;
  const bar = barsById.get(preview.barId);
  const index = rowIndexById.get(preview.rowId);
  if (!bar || index === undefined) return null;
  const box = barBox(preview.start, preview.end, range, pxPerMs);
  if (!box) return null;
  return (
    <div
      className={classes.ghost}
      data-tone={bar.tone ?? 'brand'}
      style={{
        top: HEADER_HEIGHT + index * rowHeight,
        left: labelWidth + box.left,
        width: box.width,
        height: rowHeight,
      }}
      aria-hidden
    >
      <span className={classes.ghostBar}>{bar.label}</span>
      <span className={classes.ghostTime}>{formatSpan(preview.start, preview.end)}</span>
    </div>
  );
}

function ReorderLine({
  store,
  rowHeight,
  width,
}: {
  store: Store<ReorderPreview | null>;
  rowHeight: number;
  width: number;
}) {
  const preview = useStore(store, (p) => p);
  if (!preview) return null;
  const top = HEADER_HEIGHT + (preview.index + (preview.position === 'after' ? 1 : 0)) * rowHeight;
  return <div className={classes.reorderLine} style={{ top: top - 1, width }} aria-hidden />;
}

function BarTooltip({
  store,
  barsById,
  render,
}: {
  store: Store<HoverState | null>;
  barsById: ReadonlyMap<string, GanttBar>;
  render?: (bar: GanttBar) => ReactNode;
}) {
  const hover = useStore(store, (h) => h);
  const bar = hover ? barsById.get(hover.barId) : undefined;
  if (!hover || !bar) return null;
  const below = hover.rect.top < 140;
  return (
    <div
      className={classes.tooltip}
      role="tooltip"
      style={{
        left: Math.max(
          8,
          Math.min(hover.rect.left + Math.min(hover.rect.width, 240) / 2, window.innerWidth - 160),
        ),
        top: below ? hover.rect.bottom + 8 : hover.rect.top - 8,
        transform: below ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
      }}
    >
      {render ? render(bar) : <DefaultTooltip bar={bar} />}
    </div>
  );
}

function DefaultTooltip({ bar }: { bar: GanttBar }) {
  return (
    <>
      <div className={classes.tooltipTitle}>{bar.title ?? bar.label ?? bar.id}</div>
      <div>{formatHours(bar.end - bar.start)} saat</div>
      <div>{formatSpan(bar.start, bar.end)}</div>
      {bar.progress != null ? <div>İlerleme: %{Math.round(bar.progress)}</div> : null}
    </>
  );
}

export type { GanttRow };
