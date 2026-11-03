/**
 * Printing re-lays the sheet out for the page (ported from planSheetPage.js):
 * the frozen table takes the width its columns need, the timeline is
 * re-scaled to the rest (coarser only, day → week → month), and when even
 * that does not fit, the whole page is zoomed down.
 */
import { domainBar, type SheetGridRow } from './sheetRows';
import { buildTimeline, ZOOM_UNITS, ZOOMS, type ZoomUnit } from './timeline';

/** A4 landscape with 8 mm margins at CSS 96 dpi: 281 mm of content. */
export const PRINT_W = 1062;
// A timeline thinner than this is not a Gantt; the page zooms down instead.
const MIN_TIME_W = 220;
const MIN_COL: Record<ZoomUnit, number> = { day: 15, week: 18, month: 26 };
const MAX_STRETCH = 2.4;

/** The scale the plan prints at: the screen zoom when its columns fit the
 *  page, else the next coarser one, never finer. */
export function fitTimeline(
  rows: readonly SheetGridRow[],
  zoom: ZoomUnit,
  availW: number,
  today: Date = new Date(),
): { unit: ZoomUnit; colWidth: number } {
  const from = Math.max(0, ZOOM_UNITS.indexOf(zoom));
  let last: { unit: ZoomUnit; colWidth: number } | null = null;
  for (let i = from; i < ZOOM_UNITS.length; i++) {
    const unit = ZOOM_UNITS[i]!;
    const count = buildTimeline(rows, unit, today, domainBar, 0).columns.length;
    const raw = Math.floor(availW / (count + 1));
    const colWidth = Math.min(raw, Math.round(ZOOMS[unit].colWidth * MAX_STRETCH));
    if (colWidth >= MIN_COL[unit]) return { unit, colWidth };
    last = { unit, colWidth: Math.max(raw, 6) };
  }
  return last ?? { unit: 'month', colWidth: 6 };
}

export interface PrintLayout {
  zoom: ZoomUnit;
  colWidth: number;
  /** The frozen table's width. */
  gridWidth: number;
  /** The sheet host's width on paper (the page, not the window). */
  hostWidth: number;
  /** CSS zoom for the whole page; 1 = none. */
  scale: number;
}

/** The print geometry for these visible rows and this frozen-table width. */
export function printLayout(
  rows: readonly SheetGridRow[],
  zoom: ZoomUnit,
  tableWidth: number,
  today: Date = new Date(),
): PrintLayout {
  const tableW = tableWidth + 2;
  // A table wider than the page minus a readable lane: zoom the page down
  // rather than clip a column.
  const scale = tableW > PRINT_W - MIN_TIME_W ? (PRINT_W - MIN_TIME_W) / tableW : 1;
  const hostWidth = Math.floor(PRINT_W / scale);
  const fit = fitTimeline(rows, zoom, hostWidth - tableW, today);
  return { zoom: fit.unit, colWidth: fit.colWidth, gridWidth: tableW, hostWidth, scale };
}
