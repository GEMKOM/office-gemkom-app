// The planning sheet, on paper (port of pdf.js).
//
// Not a screenshot of the pane: the pane is a scroller two ways, and paper is
// neither. So the export renders a SECOND grid off-screen with the geometry a
// page actually has:
//
//  - the frozen columns get exactly the width their columns need, so the table
//    that is clipped on screen prints whole;
//  - the timeline is re-scaled to fit what is left; the scale steps coarser
//    (gün → hafta → ay) until the columns are wide enough to label;
//  - rows are dealt into page-sized chunks, each with its own copy of the
//    header, which slicing a single tall image cannot do.
//
// Which rows, which columns, which groups are open: what is on screen.

import { exportPagesToPdf } from '@legacy/utils/pdfExport.js';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import {
  PlanningGrid,
  type GridBar,
  type GridColumn,
  type GridRowBase,
  type GridTarget,
  type PlanningGridHandle,
} from './grid/PlanningGrid';
import {
  buildTimeline,
  toKey,
  ZOOMS,
  type Timeline,
  type ZoomUnit,
} from '@/features/plan-sheet/timeline';

// A4 landscape, 8 mm margins: 281 × 189 mm of content. 1460 px across 281 mm
// puts the sheet's 0.8rem text at roughly 7 pt, the smallest that still reads.
const CAPTURE_W = 1460;
const PAGE_H = Math.floor((CAPTURE_W * 189) / 281);
// A timeline thinner than this is not a Gantt any more.
const MIN_TIME_W = 260;
// Narrowest column that still fits its label.
const MIN_COL: Record<ZoomUnit, number> = { day: 15, week: 18, month: 26 };
// A four-week plan should not print as three columns the width of a hand.
const MAX_STRETCH = 2.4;
const UNITS: ZoomUnit[] = ['day', 'week', 'month'];

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const [y, m, d] = String(iso).split('-');
  return y && m && d ? `${d}.${m}.${y}` : null;
}

// The planner's own zoom when its columns fit the page, else the next coarser
// one. Never finer: dropping to days because they fit would override a choice.
function fitTimeline<R>(
  rows: readonly R[],
  zoom: ZoomUnit,
  today: Date,
  bar: (row: R) => GridBar | null,
  availW: number,
) {
  const from = Math.max(0, UNITS.indexOf(zoom));
  let last: { unit: ZoomUnit; colWidth: number } | null = null;
  for (let i = from; i < UNITS.length; i++) {
    const unit = UNITS[i]!;
    // minWidth 0: the columns the DATES need, none of the screen's padding.
    const count = buildTimeline(rows, unit, today, bar, 0).columns.length;
    // +1 so the render's own fill-to-width rounding cannot overflow the page.
    const raw = Math.floor(availW / (count + 1));
    const colWidth = Math.min(raw, Math.round(ZOOMS[unit].colWidth * MAX_STRETCH));
    if (colWidth >= MIN_COL[unit]) return { unit, colWidth };
    last = { unit, colWidth: Math.max(raw, 6) };
  }
  // Too long even for months: prints at whatever months fit.
  return last ?? { unit: 'month' as ZoomUnit, colWidth: 6 };
}

// html2canvas does not render repeating gradients, so the column rules and the
// weekend shading are drawn once per page as real boxes behind the rows.
function rulesLayer(
  timeline: Timeline,
  gridWidth: number,
  isNonWorkingDay: ((d: string) => boolean) | null | undefined,
) {
  const layer = document.createElement('div');
  layer.className = 'pg-pdf-rules';
  layer.style.left = `${gridWidth}px`;
  layer.style.width = `${timeline.width}px`;
  const shadeDays = timeline.unit === 'day' && typeof isNonWorkingDay === 'function';
  const add = (cls: string, x: number, width?: number) => {
    const el = document.createElement('i');
    el.className = cls;
    el.style.left = `${x}px`;
    if (width != null) el.style.width = `${width}px`;
    return el;
  };
  const shades: HTMLElement[] = [];
  const rules: HTMLElement[] = [];
  timeline.columns.forEach((col, i) => {
    const x = i * timeline.colWidth;
    if (shadeDays && isNonWorkingDay?.(toKey(col.start)))
      shades.push(add('pg-pdf-shade', x, timeline.colWidth));
    if (i) rules.push(add('pg-pdf-rule', x));
  });
  // Shading first so a rule is never buried under the next day's block.
  layer.append(...shades, ...rules);
  return layer;
}

// The dates the sheet covers, not the padded timeline domain.
function dataRange<R>(rows: readonly R[], bar: (row: R) => GridBar | null) {
  let min: string | null = null;
  let max: string | null = null;
  rows.forEach((row) => {
    const b = bar(row);
    if (!b) return;
    const start = b.start || b.end;
    const end = b.end || b.start;
    if (start && (!min || start < min)) min = start;
    if (end && (!max || end > max)) max = end;
  });
  return { min: min as string | null, max: max as string | null };
}

function makeHead(
  title: string,
  subtitle: string,
  metaText: string,
  full: boolean,
  legend: HTMLElement | null,
) {
  const el = document.createElement('div');
  el.className = 'pg-pdf-head';
  const row = document.createElement('div');
  row.className = 'pg-pdf-head-row';
  const left = document.createElement('div');
  left.className = 'pg-pdf-head-left';
  const t = document.createElement('span');
  t.className = 'pg-pdf-head-title';
  t.textContent = title;
  left.append(t);
  if (subtitle) {
    const sub = document.createElement('span');
    sub.className = 'pg-pdf-head-sub';
    sub.textContent = subtitle;
    left.append(sub);
  }
  const right = document.createElement('div');
  right.className = 'pg-pdf-head-right';
  right.textContent = full ? '' : metaText;
  row.append(left, right);
  el.append(row);
  if (full && metaText) {
    const meta = document.createElement('div');
    meta.className = 'pg-pdf-meta';
    meta.textContent = metaText;
    el.append(meta);
  }
  if (full && legend) {
    const copy = legend.cloneNode(true) as HTMLElement;
    copy.classList.add('pg-pdf-legend');
    el.append(copy);
  }
  return el;
}

export interface PlanningPdfInput<R extends GridRowBase> {
  rows: readonly R[];
  collapsed: ReadonlySet<string>;
  columns: readonly GridColumn<R>[];
  zoom: ZoomUnit;
  rowHeight?: number;
  bar: (row: R) => GridBar | null;
  target?: (row: R) => GridTarget | null;
  rowClassName?: (row: R) => string;
  isNonWorkingDay?: ((date: string) => boolean) | null;
  title: string;
  subtitle: string;
  /** What narrows the view: filters, options. */
  context: string;
  fileName: string;
  /** The colour key, copied onto page 1. */
  legend?: HTMLElement | null;
  onProgress?: (done: number, total: number) => void;
}

/** Render the sheet as it stands into a downloaded PDF. */
export async function exportPlanningPdf<R extends GridRowBase>(input: PlanningPdfInput<R>) {
  const rows = input.rows.filter((r) => !(r.groupKey && input.collapsed.has(r.groupKey)));
  if (!rows.length) throw new Error('Dışa aktarılacak satır yok.');
  const today = new Date();
  // Paper cannot be scrolled sideways, so the table takes exactly the width
  // its columns ask for.
  const columnsW = input.columns.reduce((sum, c) => sum + (parseFloat(c.width) || 0), 0);
  const gridWidth = Math.round(Math.min(Math.max(columnsW + 2, 240), CAPTURE_W - MIN_TIME_W));
  const fit = fitTimeline(rows, input.zoom, today, input.bar, CAPTURE_W - gridWidth);

  const stage = document.createElement('div');
  stage.className = 'pg-pdf-stage';
  document.body.appendChild(stage);
  const host = document.createElement('div');
  host.style.width = `${CAPTURE_W}px`;
  stage.appendChild(host);
  const root = createRoot(host);
  let mounted = true;
  const unmount = () => {
    if (!mounted) return;
    mounted = false;
    root.unmount();
  };

  try {
    // Same rows and columns, page geometry, none of the interaction.
    let handle: PlanningGridHandle | null = null;
    flushSync(() =>
      root.render(
        <PlanningGrid<R>
          ref={(h) => {
            handle = h;
          }}
          className="pg-pdf-src"
          rows={rows}
          columns={input.columns}
          rowHeight={input.rowHeight ?? 30}
          gridWidth={gridWidth}
          zoom={fit.unit}
          colWidth={fit.colWidth}
          minTimelineWidth={CAPTURE_W - gridWidth - 2}
          bar={input.bar}
          target={input.target}
          rowClassName={input.rowClassName}
          isNonWorkingDay={input.isNonWorkingDay}
          today={today}
          interactive={false}
        />,
      ),
    );
    const grid = handle as PlanningGridHandle | null;
    const src = grid?.element();
    const timeline = grid?.timeline();
    const canvas = src?.querySelector('.pg-canvas');
    const header = canvas?.querySelector<HTMLElement>('.pg-header');
    const rowsWrap = canvas?.querySelector('.pg-rows');
    if (!src || !timeline || !header || !rowsWrap) throw new Error('Plan tablosu çizilemedi.');

    const todayLine = rowsWrap.querySelector('.pg-today');
    const rowEls = [...rowsWrap.children].filter((el) => el.classList.contains('pg-row'));

    const pageWidth = gridWidth + timeline.width;
    const varNames = ['--pg-grid-w', '--pg-row-h', '--pg-col-w', '--pg-time-w', '--pg-nonwork-bg'];
    const pageStyle = varNames
      .map((name) => `${name}:${src.style.getPropertyValue(name)}`)
      .concat(`width:${pageWidth}px`)
      .join(';');

    const range = dataRange(rows, input.bar);
    const span = [fmtDate(range.min), fmtDate(range.max)].filter(Boolean).join(' – ');
    const stamp = today.toLocaleDateString('tr-TR');
    const metaText = [
      `${rows.length} satır`,
      `${ZOOMS[fit.unit].label} ölçeği`,
      span,
      input.context,
      `GEMKOM · ${stamp}`,
    ]
      .filter(Boolean)
      .join(' · ');
    const shortMeta = `${ZOOMS[fit.unit].label} ölçeği · ${stamp}`;
    const legend = input.legend ?? null;

    // Measured, not assumed: the first head carries the meta line and the key.
    const probe = document.createElement('div');
    probe.style.cssText = `width:${pageWidth}px;`;
    const firstHead = makeHead(input.title, input.subtitle, metaText, true, legend);
    const restHead = makeHead(input.title, input.subtitle, shortMeta, false, null);
    probe.append(firstHead, restHead);
    stage.appendChild(probe);
    const firstHeadH = firstHead.offsetHeight;
    const restHeadH = restHead.offsetHeight;
    probe.remove();

    const rowH = input.rowHeight ?? 30;
    const headerH = Math.ceil(header.getBoundingClientRect().height) || 46;
    const firstRows = Math.max(1, Math.floor((PAGE_H - firstHeadH - headerH - 2) / rowH));
    const restRows = Math.max(1, Math.floor((PAGE_H - restHeadH - headerH - 2) / rowH));

    const pages: HTMLElement[] = [];
    let index = 0;
    while (index < rowEls.length) {
      const first = pages.length === 0;
      const chunk = rowEls.slice(index, index + (first ? firstRows : restRows));
      index += chunk.length;

      const page = document.createElement('div');
      page.className = 'pg pg-pdf-page';
      page.setAttribute('style', pageStyle);
      page.appendChild(
        first
          ? makeHead(input.title, input.subtitle, metaText, true, legend)
          : makeHead(input.title, input.subtitle, shortMeta, false, null),
      );
      const cv = document.createElement('div');
      cv.className = 'pg-canvas';
      cv.appendChild(header.cloneNode(true));
      const rw = document.createElement('div');
      rw.className = 'pg-rows';
      rw.appendChild(rulesLayer(timeline, gridWidth, input.isNonWorkingDay));
      // The today line spans its container, so each page gets its own.
      if (todayLine) rw.appendChild(todayLine.cloneNode(true));
      chunk.forEach((row) => rw.appendChild(row.cloneNode(true)));
      cv.appendChild(rw);
      page.appendChild(cv);
      stage.appendChild(page);
      pages.push(page);
    }

    unmount();
    host.remove();

    await exportPagesToPdf(pages, {
      fileName: input.fileName,
      orientation: 'landscape',
      format: 'a4',
      marginMm: 8,
      // jsPDF's core fonts cannot encode ı/ş/ğ: Turkish lives in the image.
      footerText: 'GEMKOM Imalat Planlama',
      onProgress: input.onProgress,
    });
    return { pages: pages.length, unit: fit.unit, rows: rows.length };
  } finally {
    unmount();
    stage.remove();
  }
}
