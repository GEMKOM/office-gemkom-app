/**
 * Plan ve Sapmalar on its own page — nothing else: the job order's dates,
 * the legend and the sheet. Two doors in:
 *
 *   ?job_no=009-37[&cols=a,b&main=1&collapsed=job-X&zoom=week&print=1]
 *       the office session (tokens in localStorage). print=1 opens the
 *       browser's print dialog once the sheet is drawn; "Save as PDF" there
 *       gives a vector PDF laid out for A4 landscape.
 *   ?share=<token>
 *       a customer's temporary link (PlanSheetShareLink): no login; the
 *       columns and options travel with the token.
 *
 * Printing re-lays the grid out for the page: the frozen table takes the
 * width its columns need, the timeline is re-scaled to the rest (coarser
 * only, day → week → month), and when even that does not fit, the whole
 * page is zoomed down. The screen layout comes back after the dialog.
 */
import { buildTimeline, ZOOMS } from '../../manufacturing/welding/capacity-planning/grid.js';
import {
    columnsWidth, domainBarOf, renderPlanSheet, sheetColumns, SHEET_ZOOMS,
} from '../project-tracking/planSheet.js';
import { headerSummary } from '../project-tracking/planSheetText.js';
import { getSharedPlanSheet } from '../../apis/projects/planSheetPublic.js';
import { escapeHtml } from '../../utils/text.js';

// A4 landscape with 8 mm margins at CSS 96 dpi: 281 mm of content.
const PRINT_W = 1062;
// A timeline thinner than this is not a Gantt; the page zooms down instead.
const MIN_TIME_W = 220;
const MIN_COL = { day: 15, week: 18, month: 26 };
const MAX_STRETCH = 2.4;
const UNITS = ['day', 'week', 'month'];

const params = new URLSearchParams(window.location.search);
const state = {
    zoom: SHEET_ZOOMS.includes(params.get('zoom')) ? params.get('zoom') : 'week',
    collapsed: new Set(),
    gridWidth: null,
    colWidth: null,
    columns: null,
    mainOnly: false,
};
let sheet = null;
let link = null;
let grid = null;
let screenLayout = null;   // what to restore after printing

function formatWd(value) {
    const abs = Math.abs(Number(value) || 0);
    return (abs % 1 === 0 ? abs.toFixed(0) : abs.toFixed(1)).replace('.', ',');
}

function signedWd(value) {
    if (value === null || value === undefined) return null;
    const n = Number(value);
    if (n > 0) return { text: `+${formatWd(n)} iş günü`, cls: 'ps-fig-late' };
    if (n < 0) return { text: `−${formatWd(n)} iş günü`, cls: 'ps-fig-early' };
    return { text: 'tam gününde', cls: 'ps-fig-ok' };
}

function formatDateLong(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function headerHtml() {
    const jo = sheet.job_order || {};
    const theme = headerSummary(sheet).theme;
    const fig = (label, value, notes = [], cls = '', primary = false) => `
        <div class="ps-fig${primary ? ' ps-fig-primary' : ''}">
            <label>${label}</label>
            <span class="ps-fig-value ${cls}">${value}</span>
            ${notes.filter(Boolean).map(n => `<span class="ps-fig-note ${n.cls}">${escapeHtml(n.text)}</span>`).join('')}
        </div>`;
    const dev = signedWd(sheet.deviation_wd);
    const gap = signedWd(sheet.termin_gap_wd);
    const planVs = signedWd(sheet.plan_vs_termin_wd);
    const figures = fig('Başlangıç', formatDateLong(jo.created_at))
        + fig('Termin', formatDateLong(sheet.termin))
        + fig('Plan bitişi', formatDateLong(sheet.plan_end),
            [planVs && { text: `termine göre ${planVs.text}`, cls: planVs.cls }],
            planVs && planVs.cls === 'ps-fig-late' ? 'ps-fig-late' : '')
        + fig('Öngörülen', formatDateLong(sheet.projected_end),
            [dev && { text: `plana göre ${dev.text}`, cls: dev.cls },
             gap && { text: `termine göre ${gap.text}`, cls: gap.cls }],
            dev ? dev.cls : '', true);
    return `
        <div class="ps-page-brand">
            <span class="ps-page-logo">GEMKOM</span>
            <span class="ps-page-doc">Plan ve Sapmalar</span>
        </div>
        <div class="pp-hero-ps ps-theme-${theme} ps-page-hero">
            <div class="ps-hero-id">
                <div class="ps-hero-jobno">${escapeHtml(jo.job_no || '')}</div>
                <div class="ps-hero-title" title="${escapeHtml(jo.title || '')}">${escapeHtml(jo.title || '')}</div>
                ${jo.customer_name ? `<div class="ps-hero-customer">${escapeHtml(jo.customer_name)}</div>` : ''}
            </div>
            <div class="ps-hero-figures">${figures}</div>
        </div>`;
}

function toolbarHtml() {
    const zoom = SHEET_ZOOMS.map(z => `
        <button type="button" class="btn btn-outline-secondary${state.zoom === z ? ' active' : ''}"
                data-zoom="${z}">${ZOOMS[z].label}</button>`).join('');
    return `
        <div class="ps-page-tools">
            <span class="pp-sheet-legend ps-page-legend">
                <span><i class="lg-ontime"></i>plan</span>
                <span><i class="lg-late"></i>geride</span>
                <span><i class="lg-ext"></i>öngörülen uzama</span>
                <span><i class="lg-termin"></i>termin</span>
                <span><i class="lg-today"></i>bugün</span>
            </span>
            <span class="pp-sheet-zoom btn-group ps-print-hide">${zoom}</span>
            <button type="button" class="btn btn-danger btn-sm ps-print-hide" data-action="print"
                    title="Tarayıcının yazdırma penceresi açılır; PDF olarak kaydedebilirsiniz">
                <i class="fas fa-print me-1"></i>Yazdır / PDF
            </button>
        </div>`;
}

function footerHtml() {
    const stamp = new Date().toLocaleDateString('tr-TR');
    const until = link && link.expires_at
        ? ` · Bu bağlantı ${new Date(link.expires_at).toLocaleDateString('tr-TR')} tarihine kadar geçerlidir`
        : '';
    return `<div class="ps-page-foot">GEMKOM · ${escapeHtml(stamp)}${escapeHtml(until)}</div>`;
}

// A fresh host each time: the grid binds its listeners to the host once.
function drawGrid() {
    const wrap = document.getElementById('ps-sheet-wrap');
    wrap.innerHTML = '<div class="pp-sheet-body"><div id="ps-grid" class="pg"></div></div>';
    grid = renderPlanSheet('ps-grid', sheet, state);
}

function render() {
    document.title = `Plan ve Sapmalar · ${(sheet.job_order || {}).job_no || ''}`;
    document.getElementById('ps-head').innerHTML = headerHtml() + toolbarHtml();
    drawGrid();
    document.getElementById('ps-foot').innerHTML = footerHtml();
}

// ---- printing --------------------------------------------------------------

// The scale the plan prints at: the screen zoom when its columns fit the
// page, else the next coarser one — never finer.
function fitTimeline(rows, availW) {
    const from = Math.max(0, UNITS.indexOf(state.zoom));
    const barOf = domainBarOf(grid.options.bar);
    let last = null;
    for (let i = from; i < UNITS.length; i++) {
        const unit = UNITS[i];
        const count = buildTimeline(rows, unit, new Date(), barOf, 0).columns.length;
        const raw = Math.floor(availW / (count + 1));
        const colWidth = Math.min(raw, Math.round(ZOOMS[unit].colWidth * MAX_STRETCH));
        if (colWidth >= MIN_COL[unit]) return { unit, colWidth };
        last = { unit, colWidth: Math.max(raw, 6) };
    }
    return last;
}

function fitForPrint() {
    if (!grid || !sheet || screenLayout) return;
    screenLayout = { zoom: state.zoom, gridWidth: state.gridWidth, colWidth: state.colWidth };
    const tableW = columnsWidth(sheetColumns(state.columns)) + 2;
    // A table wider than the page minus a readable lane: zoom the page down
    // rather than clip a column.
    const scale = tableW > PRINT_W - MIN_TIME_W ? (PRINT_W - MIN_TIME_W) / tableW : 1;
    const availW = Math.floor(PRINT_W / scale) - tableW;
    const fit = fitTimeline(grid.visibleRows(), availW);
    state.gridWidth = tableW;
    state.colWidth = fit.colWidth;
    state.zoom = fit.unit;
    document.getElementById('ps-page').style.zoom = scale < 1 ? String(scale) : '';
    // The grid pads its timeline out to the host's width: on paper the host
    // is the page, not the window.
    document.getElementById('ps-sheet-wrap').style.width = `${Math.floor(PRINT_W / scale)}px`;
    drawGrid();
}

function restoreScreen() {
    if (!screenLayout) return;
    Object.assign(state, screenLayout);
    screenLayout = null;
    document.getElementById('ps-page').style.zoom = '';
    document.getElementById('ps-sheet-wrap').style.width = '';
    drawGrid();
}

window.addEventListener('beforeprint', fitForPrint);
window.addEventListener('afterprint', restoreScreen);

document.addEventListener('click', (e) => {
    const zoomBtn = e.target.closest('[data-zoom]');
    if (zoomBtn && grid) {
        state.zoom = zoomBtn.dataset.zoom;
        grid.setZoom(state.zoom);
        document.querySelectorAll('[data-zoom]').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.zoom === state.zoom);
        });
        return;
    }
    if (e.target.closest('[data-action="print"]')) window.print();
});

// ---- loading ---------------------------------------------------------------

async function load() {
    const share = params.get('share');
    const jobNo = params.get('job_no');
    try {
        if (share) {
            const data = await getSharedPlanSheet(share);
            sheet = data.sheet;
            link = data.link || null;
            const options = (link && link.options) || {};
            state.columns = link && link.columns && link.columns.length ? link.columns : null;
            state.mainOnly = !!options.main_only;
            state.collapsed = new Set(options.expand_all === false && Array.isArray(options.collapsed)
                ? options.collapsed : []);
        } else if (jobNo) {
            // The office session: loaded only here, so the public path above
            // never touches the auth module.
            const { getJobOrderPlanSheet } = await import('../../apis/projects/jobOrders.js');
            sheet = await getJobOrderPlanSheet(jobNo);
            const cols = (params.get('cols') || '').split(',').filter(Boolean);
            state.columns = cols.length ? cols : null;
            state.mainOnly = params.get('main') === '1';
            state.collapsed = new Set((params.get('collapsed') || '').split(',').filter(Boolean));
        } else {
            throw new Error('İş emri belirtilmedi.');
        }
        render();
        if (params.get('print') === '1') setTimeout(() => window.print(), 500);
    } catch (error) {
        console.error('Plan sheet page failed:', error);
        document.getElementById('ps-head').innerHTML = `
            <div class="ps-page-error">
                <i class="fas fa-triangle-exclamation me-2"></i>${escapeHtml(error && error.message ? error.message : 'Plan yüklenemedi.')}
            </div>`;
    }
}

load();
