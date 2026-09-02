// The planning sheet, on paper.
//
// Not a screenshot of the pane: the pane is a scroller two ways, and paper is
// neither. So the export renders a SECOND grid off-screen with the geometry a
// page actually has —
//
//   • the frozen columns get exactly the width their columns need, so the
//     table that is clipped on screen prints whole;
//   • the timeline is re-scaled to fit what is left, so a plan never has to be
//     read across a page seam. The scale steps coarser (gün → hafta → ay)
//     until the columns are wide enough to label;
//   • rows are dealt into page-sized chunks, each with its own copy of the
//     header — a repeated header is the one thing slicing a single tall image
//     cannot do.
//
// Everything else — which rows, which columns, which groups are open — comes
// from the live grid's own options, so what prints is what is on screen.

import { PlanningGrid, ZOOMS, buildTimeline } from './grid.js';
import { exportPagesToPdf } from '../../../utils/pdfExport.js';

// A4 landscape, 8 mm margins: 281 × 189 mm of content. The capture width is
// the one number the rest follows from — 1460 px across 281 mm puts the
// sheet's 0.8rem text at roughly 7 pt, which is the smallest that still reads
// on paper. Raise it and more fits per page, smaller.
const CAPTURE_W = 1460;
const PAGE_RATIO = 189 / 281;
const PAGE_H = Math.floor(CAPTURE_W * PAGE_RATIO);

// A timeline thinner than this is not a Gantt any more, so the table gives way
// first (its rightmost columns clip, exactly as they do on screen).
const MIN_TIME_W = 260;

// Narrowest column that still fits its label: two digits for a day/week, three
// letters for a month.
const MIN_COL = { day: 15, week: 18, month: 26 };

// A four-week plan should not print as three columns the width of a hand.
const MAX_STRETCH = 2.4;

const UNITS = ['day', 'week', 'month'];
const HOST_ID = 'pg-pdf-host';

function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtDate(iso) {
    if (!iso) return null;
    const [y, m, d] = String(iso).split('-');
    return y && m && d ? `${d}.${m}.${y}` : null;
}

// The scale the plan is printed at: the planner's own zoom when its columns
// still fit the page, else the next coarser one. Never finer — dropping to
// days because they happen to fit would override a deliberate choice.
function fitTimeline(rows, options, availW) {
    const screen = ZOOMS[options.zoom] ? options.zoom : 'week';
    const from = Math.max(0, UNITS.indexOf(screen));
    let last = null;
    for (let i = from; i < UNITS.length; i++) {
        const unit = UNITS[i];
        // minWidth 0: the count of columns the DATES need, with none of the
        // padding the screen adds to fill its pane.
        const count = buildTimeline(rows, unit, options.today, options.bar, 0)
            .columns.length;
        // +1 so the render's own fill-to-width rounding cannot push the
        // timeline past the page.
        const raw = Math.floor(availW / (count + 1));
        const colWidth = Math.min(raw, Math.round(ZOOMS[unit].colWidth * MAX_STRETCH));
        if (colWidth >= MIN_COL[unit]) return { unit, colWidth };
        last = { unit, colWidth: Math.max(raw, 6) };
    }
    // A plan too long even for months prints at whatever months fit: bars stay
    // comparable, only the labels get tight.
    return last;
}

function isoKey(date) {
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${m}-${d}`;
}

// On screen the column rules and the weekend shading are painted as a
// background gradient — thousands of elements saved. html2canvas does not
// render repeating gradients, though, and a Gantt whose bars cannot be lined
// up against a week is not worth printing, so the page draws them once per
// page as real boxes behind the rows.
function rulesLayer(timeline, gridWidth, options) {
    const layer = document.createElement('div');
    layer.className = 'pg-pdf-rules';
    layer.style.left = `${gridWidth}px`;
    layer.style.width = `${timeline.width}px`;

    const shades = [];
    const rules = [];
    const shadeDays = timeline.unit === 'day'
        && typeof options.isNonWorkingDay === 'function';
    timeline.columns.forEach((col, i) => {
        const x = i * timeline.colWidth;
        if (shadeDays && options.isNonWorkingDay(isoKey(col.start))) {
            shades.push(`<i class="pg-pdf-shade" style="left:${x}px;`
                + `width:${timeline.colWidth}px"></i>`);
        }
        if (i) rules.push(`<i class="pg-pdf-rule" style="left:${x}px"></i>`);
    });
    // Shading first so a rule is never buried under the next day's block.
    layer.innerHTML = shades.join('') + rules.join('');
    return layer;
}

// The dates the sheet actually covers, which is not the timeline's domain —
// that carries padding on both sides so bars never touch the edge.
function dataRange(rows, barOf) {
    let min = null;
    let max = null;
    rows.forEach(row => {
        const bar = barOf(row);
        if (!bar) return;
        const start = bar.start || bar.end;
        const end = bar.end || bar.start;
        if (start && (!min || start < min)) min = start;
        if (end && (!max || end > max)) max = end;
    });
    return { min, max };
}

function headHtml({ title, subtitle, metaText, full }) {
    const meta = full && metaText
        ? `<div class="pg-pdf-meta">${esc(metaText)}</div>` : '';
    return `
        <div class="pg-pdf-head-row">
            <div class="pg-pdf-head-left">
                <span class="pg-pdf-head-title">${esc(title)}</span>
                ${subtitle ? `<span class="pg-pdf-head-sub">${esc(subtitle)}</span>` : ''}
            </div>
            <div class="pg-pdf-head-right">${esc(full ? '' : (metaText || ''))}</div>
        </div>
        ${meta}`;
}

/**
 * Render the grid as it stands into a downloaded PDF.
 *
 * @param {Object}       ctx
 * @param {PlanningGrid} ctx.grid       the live grid — its rows, columns and
 *                                      collapsed set ARE the export
 * @param {string}       ctx.title      document title, page 1 and every head
 * @param {string}       ctx.subtitle   the open tab (resource) name
 * @param {string}       ctx.context    what narrows the view: filters, options
 * @param {string}       ctx.fileName
 * @param {HTMLElement}  ctx.legend     optional colour key, copied onto page 1
 * @param {Function}     ctx.onProgress (done, total) => void
 * @returns {Promise<{pages:number, unit:string, rows:number}>}
 */
export async function exportPlanningPdf(ctx) {
    const src = ctx.grid;
    if (!src) throw new Error('Plan tablosu hazır değil.');
    const rows = src.visibleRows();
    if (!rows.length) throw new Error('Dışa aktarılacak satır yok.');

    const columns = src.options.columns || [];
    // The screen pane is dragged to taste and usually clips a column. Paper
    // cannot be scrolled sideways, so the table takes exactly the width its
    // columns ask for — "the full table", as opposed to the visible part of it.
    const columnsW = columns.reduce((sum, c) => sum + (parseFloat(c.width) || 0), 0);
    const gridWidth = Math.round(
        Math.min(Math.max(columnsW + 2, 240), CAPTURE_W - MIN_TIME_W));
    const fit = fitTimeline(rows, src.options, CAPTURE_W - gridWidth);

    const stage = document.createElement('div');
    stage.className = 'pg-pdf-stage';
    document.body.appendChild(stage);

    try {
        const host = document.createElement('div');
        host.id = HOST_ID;
        host.className = 'pg pg-pdf-src';
        host.style.width = `${CAPTURE_W}px`;
        stage.appendChild(host);

        // Same options, page geometry, and none of the interaction: an export
        // grid that could be edited would be editing a throwaway copy.
        const exportGrid = new PlanningGrid(HOST_ID, {
            ...src.options,
            gridWidth,
            zoom: fit.unit,
            colWidth: fit.colWidth,
            actions: [],
            isCellEditable: () => false,
            onEdit: null,
            onEditError: null,
            onAction: null,
            onToggleGroup: null,
            onToggleAll: null,
            onZoomChange: null,
            onGridWidthChange: null,
        });
        exportGrid.render();

        const canvas = host.querySelector('.pg-canvas');
        const header = canvas && canvas.querySelector('.pg-header');
        const rowsWrap = canvas && canvas.querySelector('.pg-rows');
        if (!header || !rowsWrap) throw new Error('Plan tablosu çizilemedi.');

        // Screen-only chrome: a column picker, a collapse-all handle and a
        // drag grip mean nothing once printed.
        header.querySelectorAll('.pg-columns-btn, .pg-toggle-all, .pg-grip')
            .forEach(el => el.remove());

        const todayLine = rowsWrap.querySelector('.pg-today');
        const rowEls = [...rowsWrap.children].filter(el => el.classList.contains('pg-row'));

        const pageWidth = gridWidth + exportGrid.timeline.width;
        const varNames = ['--pg-grid-w', '--pg-row-h', '--pg-col-w', '--pg-time-w',
            '--pg-nonwork-bg'];
        const pageStyle = varNames
            .map(name => `${name}:${host.style.getPropertyValue(name)}`)
            .concat(`width:${pageWidth}px`)
            .join(';');

        const range = dataRange(rows, src.options.bar);
        const span = [fmtDate(range.min), fmtDate(range.max)].filter(Boolean).join(' – ');
        const stamp = new Date().toLocaleDateString('tr-TR');
        const metaText = [
            `${rows.length} satır`,
            `${ZOOMS[fit.unit].label} ölçeği`,
            span,
            ctx.context,
            `GEMKOM · ${stamp}`,
        ].filter(Boolean).join(' · ');
        const shortMeta = `${ZOOMS[fit.unit].label} ölçeği · ${stamp}`;

        const makeHead = (full) => {
            const el = document.createElement('div');
            el.className = 'pg-pdf-head';
            el.innerHTML = headHtml({
                title: ctx.title,
                subtitle: ctx.subtitle,
                metaText: full ? metaText : shortMeta,
                full,
            });
            if (full && ctx.legend) {
                const legend = ctx.legend.cloneNode(true);
                legend.classList.add('pg-pdf-legend');
                el.appendChild(legend);
            }
            return el;
        };

        // Measured, not assumed: the head is one line on later pages and two
        // plus a colour key on the first, and a page that guesses wrong either
        // wastes a row or spills one.
        const probe = document.createElement('div');
        probe.style.cssText = `width:${pageWidth}px;`;
        const firstHead = makeHead(true);
        const restHead = makeHead(false);
        probe.append(firstHead, restHead);
        stage.appendChild(probe);
        const firstHeadH = firstHead.offsetHeight;
        const restHeadH = restHead.offsetHeight;
        probe.remove();

        const rowH = Number(src.options.rowHeight) || 30;
        const headerH = Math.ceil(header.getBoundingClientRect().height) || 46;
        const fit1 = Math.floor((PAGE_H - firstHeadH - headerH - 2) / rowH);
        const fitN = Math.floor((PAGE_H - restHeadH - headerH - 2) / rowH);
        const firstRows = Math.max(1, fit1);
        const restRows = Math.max(1, fitN);

        const pages = [];
        let index = 0;
        while (index < rowEls.length) {
            const first = pages.length === 0;
            const chunk = rowEls.slice(index, index + (first ? firstRows : restRows));
            index += chunk.length;

            const page = document.createElement('div');
            page.className = 'pg pg-pdf-page';
            page.setAttribute('style', pageStyle);
            page.appendChild(makeHead(first));

            const cv = document.createElement('div');
            cv.className = 'pg-canvas';
            cv.appendChild(header.cloneNode(true));
            const rw = document.createElement('div');
            rw.className = 'pg-rows';
            rw.appendChild(rulesLayer(exportGrid.timeline, gridWidth, src.options));
            // The today line spans its container, so each page gets its own.
            if (todayLine) rw.appendChild(todayLine.cloneNode(true));
            chunk.forEach(row => rw.appendChild(row.cloneNode(true)));
            cv.appendChild(rw);
            page.appendChild(cv);

            stage.appendChild(page);
            pages.push(page);
        }

        host.remove();

        await exportPagesToPdf(pages, {
            fileName: ctx.fileName,
            orientation: 'landscape',
            format: 'a4',
            marginMm: 8,
            // jsPDF's core fonts cannot encode ı/ş/ğ — Turkish lives in the
            // captured image, the footer stays ASCII.
            footerText: 'GEMKOM Imalat Planlama',
            onProgress: ctx.onProgress,
        });

        return { pages: pages.length, unit: fit.unit, rows: rows.length };
    } finally {
        stage.remove();
    }
}
