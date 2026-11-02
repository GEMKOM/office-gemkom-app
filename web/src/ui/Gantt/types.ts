import type { ReactNode } from 'react';
import type { WorkingWindows } from './calendar';
import type { GanttScale, TimeRange } from './timeScale';

/**
 * Bar colour, by meaning (the status families of global.css): brand = planned
 * (legacy red), yellow = locked / on hold, green = work / done, red = late /
 * idle, blue = in progress, grey = no dates, orange / purple as the families say.
 */
export type GanttTone =
  'brand' | 'green' | 'blue' | 'yellow' | 'orange' | 'red' | 'purple' | 'grey';

export interface GanttRow {
  id: string;
  /** First line, usually a key or code (mono). */
  label: string;
  /** Second line, usually the name. */
  sublabel?: string;
  /** A dateless header band (e.g. "Planlanmamış"); never has bars. */
  group?: boolean;
  /** Greyed label (e.g. not in plan). */
  muted?: boolean;
  /** Shows a lock after the label. */
  locked?: boolean;
  /** Hover text for the label; defaults to label + sublabel. */
  title?: string;
}

export interface GanttBar {
  id: string;
  rowId: string;
  /** Epoch ms. */
  start: number;
  /** Epoch ms; after start. */
  end: number;
  /** Text inside the bar. */
  label?: string;
  tone?: GanttTone;
  /** 0-100; drawn as a fill inside the bar. */
  progress?: number | null;
  /** Fill colour of the progress part. Default: a darker shade of the bar. */
  progressTone?: GanttTone;
  /** Dashed outline (legacy no-dates). */
  dashed?: boolean;
  /** Not draggable even when the chart is editable; shows a lock. */
  locked?: boolean;
  /** Read by the default tooltip and the bar's aria-label. */
  title?: string;
}

export interface GanttBarChange<B extends GanttBar = GanttBar> {
  bar: B;
  start: number;
  end: number;
  rowId: string;
  /** How it was made. */
  via: 'drag' | 'keyboard';
}

export interface GanttView {
  scale: GanttScale;
  /** Any moment inside the period on screen. */
  anchor: number;
  range: TimeRange;
}

export interface GanttEditing {
  /** Drag a bar along its row. */
  move?: boolean;
  /** Drag a bar's edges. */
  resize?: boolean;
  /** Drag a bar to another row (another machine). */
  changeRow?: boolean;
}

export interface GanttProps<B extends GanttBar = GanttBar> {
  rows: readonly GanttRow[];
  /** Keep bar objects stable: only bars whose object changed re-render. */
  bars: readonly B[];

  title?: ReactNode;
  /** Font Awesome classes before the title. */
  icon?: string;
  /** Extra controls in the header, before the period controls. */
  toolbar?: ReactNode;
  /** Header of the label column. Default "Görev". */
  labelHeader?: ReactNode;

  /** Scales offered. Default day, week, month, year (legacy). */
  scales?: readonly GanttScale[];
  /** Controlled scale. */
  scale?: GanttScale;
  defaultScale?: GanttScale;
  /** Controlled anchor (a moment in the period on screen). */
  anchor?: number;
  defaultAnchor?: number;
  /** Scale or period changed (buttons, keyboard). */
  onViewChange?: (view: GanttView) => void;
  /** Months in the month view; 'auto' spans the bars (legacy monthsPerView). */
  monthsPerView?: number | 'auto';

  /** Row height in px. Default 44. */
  rowHeight?: number;
  /** Label column width in px. Default 220. */
  labelWidth?: number;
  /** Height of the scroll area; default fits the rows up to 70vh. */
  height?: number | string;

  /** Drag editing. `true` = move and resize. */
  editable?: boolean | GanttEditing;
  /** Snap step in minutes; default by scale (15 min, 1 h, 1 h, 1 day). */
  snapMinutes?: number;
  onBarChange?: (change: GanttBarChange<B>) => void;

  /** Enables row drag handles and Alt+↑/↓: the planner's queue order. */
  onRowReorder?: (rowId: string, targetRowId: string, position: 'before' | 'after') => void;
  canReorderRow?: (row: GanttRow) => boolean;

  /** Click or Enter on a bar (legacy onTaskClick). */
  onBarOpen?: (bar: B) => void;
  /** Click on a row label. By default it scrolls to and selects the row's first bar. */
  onRowOpen?: (row: GanttRow) => void;
  /** Tooltip body; default: title, times, hours, progress. */
  renderTooltip?: (bar: B) => ReactNode;

  /**
   * Working time for shading and bar gaps (see machineCalendarWindows).
   * Default: weekends shaded. Pass null for no shading.
   */
  workingWindows?: WorkingWindows | null;
  /** Today line. Default true. */
  showToday?: boolean;

  loading?: boolean;
  emptyMessage?: ReactNode;
  /** Accessible name of the chart. */
  ariaLabel?: string;
}
