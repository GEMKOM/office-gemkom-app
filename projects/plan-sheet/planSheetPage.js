/**
 * Plan ve Sapmalar on its own page — nothing else: the job order's dates,
 * the legend and the sheet. Two doors in:
 *
 *   ?job_no=009-37[&cols=a,b&main=1&head=0&lang=en&collapsed=job-X&zoom=week&print=1]
 *       the office session (tokens in localStorage). print=1 opens the
 *       browser's print dialog once the sheet is drawn; "Save as PDF" there
 *       gives a vector PDF laid out for A4 landscape.
 *   ?share=<token>
 *       a customer's temporary link (PlanSheetShareLink): no login; the
 *       columns and options travel with the token. An EDITABLE link is the
 *       sales team's: every cell and the header's figures take a click, the
 *       edits are saved on the link (never on the plan), and the PDF prints
 *       them. See "editing" below.
 *
 * lang=en (or the link's options.language) draws everything WE write in
 * English (sheetLang.js). The sales team's editing controls stay Turkish.
 *
 * Printing re-lays the grid out for the page: the frozen table takes the
 * width its columns need, the timeline is re-scaled to the rest (coarser
 * only, day → week → month), and when even that does not fit, the whole
 * page is zoomed down. The screen layout comes back after the dialog.
 */
import {
    buildTimeline, DATE_ENTRY_PLACEHOLDER, formatDMY, maskDMY, parseDMY, setGridLocale, ZOOMS,
} from '../../planning/project-planning/grid.js';
import { dateLocale, setSheetLang, sheetLang, tr } from '../project-tracking/sheetLang.js';
import {
    columnsWidth, domainBarOf, NUMBER_FIELDS, renderPlanSheet, SHEET_COLUMNS, sheetColumns, SHEET_ZOOMS,
} from '../project-tracking/planSheet.js';
import { headerSummary } from '../project-tracking/planSheetText.js';
import { heroChainHtml } from '../project-tracking/heroChain.js';
import { getSharedPlanSheet, saveSharedPlanSheetOverrides } from '../../apis/projects/planSheetPublic.js';
import { createWorkdayCalendar } from '../../utils/workdays.js';
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
    // head=0 / options.show_header=false: no hero (job, customer, dates)
    showHeader: true,
    // Editable links only: row key → field → value (planSheet.js lays it
    // over the rows) and the handler that records a cell edit.
    overrides: null,
    onEdit: null,
};
let sheet = null;
let link = null;
let grid = null;
let screenLayout = null;   // what to restore after printing
let editing = null;        // { token, header, saveTimer, status, ... } on an editable link

// The page's language, set before anything is drawn (and again when the
// sales team switches it in the print dialog).
function applyLanguage(lang) {
    setSheetLang(lang);
    setGridLocale(sheetLang());
    document.documentElement.lang = sheetLang();
}

const ZOOM_EN = { day: 'Day', week: 'Week', month: 'Month' };

// The same date chain as the meeting slide's hero (heroChain.js), minus the
// progress row — the customer reads dates and distances, not our percentages.
function headerHtml() {
    const shown = view();
    const jo = shown.job_order || {};
    const theme = headerSummary(shown).theme;
    const chain = heroChainHtml({
        start: jo.created_at,
        termin: shown.termin,
        planEnd: shown.plan_end,
        projectedEnd: shown.projected_end,
        planVsTerminWd: shown.plan_vs_termin_wd,
        deviationWd: shown.deviation_wd,
        terminGapWd: shown.termin_gap_wd,
    });
    const note = editing && editing.header.note
        ? `<div class="ps-page-note">${escapeHtml(editing.header.note)}</div>` : '';
    // Without the hero the brand line still names the job, so a printed
    // page is never anonymous.
    if (!state.showHeader) {
        return `
        <div class="ps-page-brand">
            <span class="ps-page-logo">GEMKOM</span>
            <span class="ps-page-doc">${tr('Plan ve Sapmalar', 'Plan and Deviations')}</span>
            <span class="ps-page-job">${escapeHtml([jo.job_no, jo.title, jo.customer_name].filter(Boolean).join(' · '))}</span>
        </div>${note}`;
    }
    return `
        <div class="ps-page-brand">
            <span class="ps-page-logo">GEMKOM</span>
            <span class="ps-page-doc">${tr('Plan ve Sapmalar', 'Plan and Deviations')}</span>
        </div>
        <div class="pp-hero-ps ps-theme-${theme} ps-page-hero">
            <div class="ps-hero-id">
                <div class="ps-hero-jobno">${escapeHtml(jo.job_no || '')}</div>
                <div class="ps-hero-title" title="${escapeHtml(jo.title || '')}">${escapeHtml(jo.title || '')}</div>
                ${jo.customer_name ? `<div class="ps-hero-customer">${escapeHtml(jo.customer_name)}</div>` : ''}
            </div>
            ${chain}
        </div>${note}`;
}

function toolbarHtml() {
    const zoom = SHEET_ZOOMS.map(z => `
        <button type="button" class="btn btn-outline-secondary${state.zoom === z ? ' active' : ''}"
                data-zoom="${z}">${tr(ZOOMS[z].label, ZOOM_EN[z] || ZOOMS[z].label)}</button>`).join('');
    return `
        <div class="ps-page-tools">
            <span class="pp-sheet-legend ps-page-legend">
                <span><i class="lg-ontime"></i>plan</span>
                <span><i class="lg-late"></i>${tr('geride', 'behind')}</span>
                <span><i class="lg-ext"></i>${tr('öngörülen uzama', 'projected overrun')}</span>
                <span><i class="lg-termin"></i>${tr('termin', 'due date')}</span>
                <span><i class="lg-today"></i>${tr('bugün', 'today')}</span>
            </span>
            <span class="pp-sheet-zoom btn-group ps-print-hide">${zoom}</span>
            <button type="button" class="btn btn-danger btn-sm ps-print-hide" data-action="print"
                    title="${tr('Tarayıcının yazdırma penceresi açılır; PDF olarak kaydedebilirsiniz',
                        "Opens the browser's print dialog; choose Save as PDF there")}">
                <i class="fas fa-print me-1"></i>${tr('Yazdır / PDF', 'Print / PDF')}
            </button>
        </div>`;
}

function footerHtml() {
    const stamp = new Date().toLocaleDateString(dateLocale());
    // An editable link's PDF goes to the customer; the link's own expiry is
    // nothing to them.
    const until = link && link.expires_at && !editing
        ? tr(` · Bu bağlantı ${new Date(link.expires_at).toLocaleDateString('tr-TR')} tarihine kadar geçerlidir`,
            ` · This link is valid until ${new Date(link.expires_at).toLocaleDateString('en-GB')}`)
        : '';
    return `<div class="ps-page-foot">GEMKOM · ${escapeHtml(stamp)}${escapeHtml(until)}</div>`;
}

// A fresh host each time: the grid binds its listeners to the host once.
function drawGrid() {
    const wrap = document.getElementById('ps-sheet-wrap');
    wrap.innerHTML = '<div class="pp-sheet-body"><div id="ps-grid" class="pg"></div></div>';
    grid = renderPlanSheet('ps-grid', view(), state);
}

function render() {
    document.title = `${tr('Plan ve Sapmalar', 'Plan and Deviations')} · ${(view().job_order || {}).job_no || ''}`;
    document.getElementById('ps-head').innerHTML = headerHtml() + toolbarHtml();
    drawGrid();
    document.getElementById('ps-foot').innerHTML = footerHtml();
}

// ---- editing (editable links) ----------------------------------------------
//
// The computed sheet stays as the server sent it; view() lays the header's
// edits over a copy, and the grid lays the row edits over its rows
// (planSheet.js applyRowOverrides). Each edit sends the link's whole
// override set to the server, a moment after the last change.

const HEADER_TEXTS = [['job_no', 'İş emri no'], ['title', 'İş adı'], ['customer_name', 'Müşteri']];
const HEADER_DATES = [
    ['start', 'Başlangıç'], ['termin', 'Termin'], ['plan_end', 'Plan bitişi'], ['projected_end', 'Öngörülen'],
];
const HEADER_WDS = [
    ['plan_vs_termin_wd', 'Plan bitişi − Termin'],
    ['deviation_wd', 'Öngörülen − Plan bitişi'],
    ['termin_gap_wd', 'Öngörülen − Termin'],
];

let calendar = null;

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

function nextDay(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

// Signed working days from `planned` to `actual` — the backend's
// working_day_delta, so a recomputed pill reads like a computed one.
function wdDelta(planned, actual) {
    if (!planned || !actual) return null;
    if (planned === actual) return 0;
    const [sign, first, last] = actual > planned
        ? [1, nextDay(planned), actual] : [-1, nextDay(actual), planned];
    const total = calendar.workingDaysInclusive(first, last);
    return total == null ? null : sign * total;
}

/** The sheet as it is shown: the header edits laid over the computed one. */
function view() {
    if (!editing) return sheet;
    const h = editing.header;
    const jo = { ...(sheet.job_order || {}) };
    if (hasOwn(h, 'job_no')) jo.job_no = h.job_no;
    if (hasOwn(h, 'title')) jo.title = h.title;
    if (hasOwn(h, 'customer_name')) jo.customer_name = h.customer_name;
    if (hasOwn(h, 'start')) jo.created_at = h.start;
    const out = { ...sheet, job_order: jo };
    for (const k of ['termin', 'plan_end', 'projected_end']) if (hasOwn(h, k)) out[k] = h[k];
    // A pill follows its two dates when one of them was edited, unless the
    // pill itself was typed in.
    const pill = (key, from, to) => {
        if (hasOwn(h, key)) out[key] = h[key];
        else if (hasOwn(h, from) || hasOwn(h, to)) out[key] = wdDelta(out[from], out[to]);
    };
    pill('plan_vs_termin_wd', 'termin', 'plan_end');
    pill('deviation_wd', 'plan_end', 'projected_end');
    pill('termin_gap_wd', 'termin', 'projected_end');
    // The root job row carries the termin line and the gap pill on the grid.
    if (['termin', 'projected_end', 'termin_gap_wd'].some(k => hasOwn(h, k))) {
        out.nodes = (sheet.nodes || []).map(node => (node.parent ? node : {
            ...node, termin: out.termin, termin_gap_wd: out.termin_gap_wd,
        }));
    }
    return out;
}

// The server's header, for "edited back to the original" checks.
function headerComputed() {
    const jo = sheet.job_order || {};
    return {
        job_no: jo.job_no, title: jo.title, customer_name: jo.customer_name, start: jo.created_at,
        termin: sheet.termin, plan_end: sheet.plan_end, projected_end: sheet.projected_end,
    };
}

function hasEdits() {
    return Object.keys(state.overrides).length > 0 || Object.keys(editing.header).length > 0;
}

function statusText() {
    const s = editing.status;
    if (s === 'saving') return '<span class="spinner-border spinner-border-sm me-1"></span>Kaydediliyor…';
    if (s === 'error') {
        return `<span class="ps-edit-err"><i class="fas fa-triangle-exclamation me-1"></i>${escapeHtml(editing.error || 'Kaydedilemedi')}</span>`;
    }
    if (s === 'saved') return `<i class="fas fa-check me-1"></i>Kaydedildi ${escapeHtml(editing.savedAt || '')}`;
    return hasEdits() ? 'Değişiklikler kayıtlı' : 'Henüz değişiklik yok';
}

function panelHtml() {
    const h = editing.header;
    const shown = view();
    const jo = shown.job_order || {};
    const current = {
        job_no: jo.job_no, title: jo.title, customer_name: jo.customer_name, start: jo.created_at,
        termin: shown.termin, plan_end: shown.plan_end, projected_end: shown.projected_end,
    };
    const mark = k => (hasOwn(h, k) ? ' is-edited' : '');
    const texts = HEADER_TEXTS.map(([k, label]) => `
        <label class="ps-edit-field${mark(k)}"><span>${label}</span>
            <input type="text" class="form-control form-control-sm" data-head="${k}"
                   value="${escapeHtml(current[k] || '')}"></label>`).join('');
    const dates = HEADER_DATES.map(([k, label]) => `
        <label class="ps-edit-field${mark(k)}"><span>${label}</span>
            <input type="text" class="form-control form-control-sm" data-head="${k}" data-kind="date"
                   inputmode="numeric" maxlength="10" placeholder="${DATE_ENTRY_PLACEHOLDER}"
                   value="${escapeHtml(formatDMY(current[k]))}"></label>`).join('');
    const wds = HEADER_WDS.map(([k, label]) => {
        const auto = shown[k] == null ? 'otomatik' : `otomatik: ${shown[k]}`;
        return `
        <label class="ps-edit-field${mark(k)}"><span>${label} (iş günü)</span>
            <input type="number" step="any" class="form-control form-control-sm" data-head="${k}" data-kind="number"
                   value="${hasOwn(h, k) && h[k] != null ? escapeHtml(String(h[k])) : ''}"
                   placeholder="${escapeHtml(auto)}"></label>`;
    }).join('');
    return `
        <div class="ps-edit-banner">
            <i class="fas fa-pen-to-square ps-edit-icon"></i>
            <div class="ps-edit-text">
                <strong>Düzenlenebilir bağlantı.</strong> Tablodaki her hücreye tıklayıp değiştirebilir,
                üst bilgileri aşağıdan düzenleyebilirsiniz. Değişiklikler yalnızca bu bağlantıda saklanır;
                gerçek plan değişmez. Bitince <b>Yazdır / PDF</b> ile indirin. Bu bağlantıyı müşteriye
                göndermeyin: açan herkes değerleri değiştirebilir.
            </div>
            <span class="ps-edit-status" id="ps-edit-status">${statusText()}</span>
        </div>
        <details class="ps-edit-panel"${editing.panelOpen ? ' open' : ''}>
            <summary>Üst bilgiler ve not</summary>
            <div class="ps-edit-grid">${texts}${dates}${wds}</div>
            <label class="ps-edit-field ps-edit-note${mark('note')}"><span>Not (PDF'te başlığın altında görünür)</span>
                <textarea class="form-control form-control-sm" rows="2" data-head="note">${escapeHtml(h.note || '')}</textarea></label>
            <div class="ps-edit-foot">
                <span class="ps-edit-hint">İş günü farkları boş bırakılırsa tarihlerden hesaplanır.
                    Bir değeri eskisine döndürmek için orijinal değeri yazmanız yeterli.</span>
                <button type="button" class="btn btn-outline-secondary btn-sm" data-action="reset-edits">
                    <i class="fas fa-rotate-left me-1"></i>Tüm değişiklikleri geri al
                </button>
            </div>
        </details>`;
}

function renderPanel() {
    const host = document.getElementById('ps-edit');
    const details = host.querySelector('details');
    if (details) editing.panelOpen = details.open;
    host.innerHTML = panelHtml();
}

function setStatus(status, error) {
    editing.status = status;
    editing.error = error || null;
    const el = document.getElementById('ps-edit-status');
    if (el) el.innerHTML = statusText();
}

function scheduleSave() {
    clearTimeout(editing.saveTimer);
    setStatus('saving');
    editing.saveTimer = setTimeout(async () => {
        try {
            await saveSharedPlanSheetOverrides(editing.token, {
                rows: state.overrides, header: editing.header, view: editing.view,
            });
            editing.savedAt = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
            setStatus('saved');
        } catch (error) {
            console.error('Saving edits failed:', error);
            setStatus('error', error && error.message);
        }
    }, 600);
}

function normalizeCellValue(field, value) {
    if (NUMBER_FIELDS.has(field)) {
        if (value === '' || value == null) return null;
        const n = Number(value);
        if (Number.isNaN(n)) throw new Error('Geçerli bir sayı girin.');
        return field === 'progress' ? Math.max(0, Math.min(100, n)) : n;
    }
    return value === '' ? null : value;
}

// A cell edit from the grid. Writing the computed value back drops the edit.
function onCellEdit(row, field, value) {
    const next = normalizeCellValue(field, value);
    const base = row.base || {};
    const fields = { ...(state.overrides[row.key] || {}) };
    if (String(next ?? '') === String(base[field] ?? '')) delete fields[field];
    else fields[field] = next;
    // A task's plan dates move its length too, unless the length was typed.
    if (row.kind === 'task' && (field === 'plan_start' || field === 'plan_end')) {
        const start = hasOwn(fields, 'plan_start') ? fields.plan_start : base.plan_start;
        const end = hasOwn(fields, 'plan_end') ? fields.plan_end : base.plan_end;
        const wd = start && end ? calendar.workingDaysInclusive(start, end) : null;
        if (wd != null && String(wd) !== String(base.plan_wd ?? '')) fields.plan_wd = wd;
        else delete fields.plan_wd;
    }
    if (Object.keys(fields).length) state.overrides[row.key] = fields;
    else delete state.overrides[row.key];
    scheduleSave();
}

function onHeaderEdit(input) {
    const key = input.dataset.head;
    const h = editing.header;
    let value = input.value;
    if (key === 'note') {
        if (value.trim()) h.note = value;
        else delete h.note;
    } else if (input.dataset.kind === 'number') {
        if (value === '') delete h[key];
        else if (Number.isNaN(Number(value))) return;
        else h[key] = Number(value);
    } else {
        if (input.dataset.kind === 'date') {
            const parsed = parseDMY(value);
            input.classList.toggle('is-invalid', parsed === null);
            if (parsed === null) return;
            value = parsed || null;
        } else {
            value = value.trim();
        }
        if (String(value ?? '') === String(headerComputed()[key] ?? '')) delete h[key];
        else h[key] = value;
    }
    render();
    renderPanel();
    scheduleSave();
}

function startEditing(token, overrides) {
    calendar = createWorkdayCalendar(sheet.holidays || []);
    const saved = overrides && typeof overrides === 'object' ? overrides : {};
    editing = {
        token,
        header: { ...(saved.header || {}) },
        view: { ...(saved.view || {}) },
        saveTimer: null,
        status: null,
        panelOpen: false,
    };
    state.overrides = { ...(saved.rows || {}) };
    applyViewChoices();
    state.onEdit = onCellEdit;
    state.onEditError = error => setStatus('error', error && error.message);
    document.body.classList.add('ps-editing');

    const host = document.createElement('section');
    host.id = 'ps-edit';
    host.className = 'ps-print-hide';
    const page = document.getElementById('ps-page');
    page.insertBefore(host, page.firstChild);
    host.addEventListener('change', (e) => {
        const input = e.target.closest('[data-head]');
        if (input) onHeaderEdit(input);
    });
    // The same day-first mask as the grid's date cells.
    host.addEventListener('input', (e) => {
        const input = e.target.closest('[data-kind="date"]');
        if (!input || input.selectionStart !== input.value.length) return;
        const masked = maskDMY(input.value);
        if (masked !== input.value) input.value = masked;
    });
    renderPanel();
}

// ---- print choices (editable links) ------------------------------------------
//
// The office dialog's choices (meetingView.js openSheetShareDialog), made on
// the link itself: which columns, the header, sub-rows, folded jobs. Saved
// with the edits, so the next PDF from this link comes out the same.

function applyViewChoices() {
    const v = editing.view;
    if (Array.isArray(v.columns)) state.columns = v.columns.length ? v.columns : null;
    if (hasOwn(v, 'show_header')) state.showHeader = v.show_header !== false;
    if (hasOwn(v, 'main_only')) state.mainOnly = !!v.main_only;
    if (hasOwn(v, 'language')) applyLanguage(v.language);
}

function printDialogHtml() {
    const chosen = new Set(state.columns || SHEET_COLUMNS.map(c => c.field));
    const boxes = SHEET_COLUMNS.map((col) => {
        const locked = col.field === 'title';
        return `
            <label class="ps-print-col${locked ? ' is-locked' : ''}">
                <input type="checkbox" data-col="${col.field}" ${locked || chosen.has(col.field) ? 'checked' : ''} ${locked ? 'disabled' : ''}>
                <span>${escapeHtml(col.label)}</span>${locked ? '<small>her zaman</small>' : ''}
            </label>`;
    }).join('');
    const opt = (key, checked, label) => `
            <label class="ps-print-opt">
                <input type="checkbox" data-opt="${key}" ${checked ? 'checked' : ''}><span>${label}</span>
            </label>`;
    return `
        <div class="ps-print-dialog" role="dialog" aria-modal="true" aria-labelledby="ps-print-title">
            <h2 id="ps-print-title">Yazdır / PDF</h2>
            <p class="ps-print-hint">Sütunları seçin; Görev sütunu ve zaman çizelgesi her zaman yer alır.
                Açılan yazdırma penceresinde "PDF olarak kaydet"i seçin.</p>
            <div class="ps-print-cols">${boxes}</div>
            ${opt('head', state.showHeader, 'Başlık bölümünü göster (iş emri, müşteri ve tarih zinciri)')}
            ${opt('expand', editing.view.expand_all !== false, 'Katlanmış iş emirlerini de açık göster')}
            ${opt('main', state.mainOnly, 'Yalnızca departman görevleri (alt satırlar, ekip ve taşeron adları gizli)')}
            <label class="ps-print-lang">Dil (PDF)
                <select class="form-select form-select-sm" data-opt="lang">
                    <option value="tr"${sheetLang() !== 'en' ? ' selected' : ''}>Türkçe</option>
                    <option value="en"${sheetLang() === 'en' ? ' selected' : ''}>English</option>
                </select>
            </label>
            <div class="ps-print-actions">
                <button type="button" class="btn btn-outline-secondary btn-sm" data-print-dialog="close">Vazgeç</button>
                <button type="button" class="btn btn-outline-danger btn-sm" data-print-dialog="apply">Uygula</button>
                <button type="button" class="btn btn-danger btn-sm" data-print-dialog="print">
                    <i class="fas fa-print me-1"></i>Yazdır / PDF
                </button>
            </div>
        </div>`;
}

function openPrintDialog() {
    closePrintDialog();
    const overlay = document.createElement('div');
    overlay.id = 'ps-print-overlay';
    overlay.className = 'ps-print-overlay ps-print-hide';
    overlay.innerHTML = printDialogHtml();
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) { closePrintDialog(); return; }
        const btn = e.target.closest('[data-print-dialog]');
        if (!btn) return;
        const act = btn.dataset.printDialog;
        if (act !== 'close') applyPrintDialog(overlay);
        closePrintDialog();
        // A tick for the re-render to land before the print snapshot.
        if (act === 'print') setTimeout(() => window.print(), 50);
    });
    document.body.appendChild(overlay);
}

function closePrintDialog() {
    const overlay = document.getElementById('ps-print-overlay');
    if (overlay) overlay.remove();
}

function applyPrintDialog(overlay) {
    const checked = key => !!overlay.querySelector(`input[data-opt="${key}"]:checked`);
    const columns = ['title', ...[...overlay.querySelectorAll('input[data-col]:checked')]
        .map(el => el.dataset.col).filter(f => f !== 'title')];
    const allColumns = columns.length === SHEET_COLUMNS.length;
    editing.view = {
        columns: allColumns ? [] : columns,
        show_header: checked('head'),
        main_only: checked('main'),
        expand_all: checked('expand'),
        language: overlay.querySelector('select[data-opt="lang"]').value === 'en' ? 'en' : 'tr',
    };
    applyLanguage(editing.view.language);
    state.columns = allColumns ? null : columns;
    state.showHeader = editing.view.show_header;
    state.mainOnly = editing.view.main_only;
    if (editing.view.expand_all) state.collapsed.clear();
    // Column widths change with the set: let the table take its new width.
    state.gridWidth = null;
    render();
    scheduleSave();
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePrintDialog();
});

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
    if (e.target.closest('[data-action="print"]')) {
        // An editable link picks its columns first, as the office dialog does.
        if (editing) openPrintDialog();
        else window.print();
        return;
    }
    if (e.target.closest('[data-action="reset-edits"]') && editing) {
        if (!window.confirm('Bu bağlantıdaki tüm değişiklikler silinsin mi?')) return;
        state.overrides = {};
        editing.header = {};
        render();
        renderPanel();
        scheduleSave();
    }
});

// ---- loading ---------------------------------------------------------------

async function load() {
    // An English link's own errors read in English before the link says so.
    applyLanguage(params.get('lang'));
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
            state.showHeader = options.show_header !== false;
            applyLanguage(options.language);
            state.collapsed = new Set(options.expand_all === false && Array.isArray(options.collapsed)
                ? options.collapsed : []);
            if (link && link.editable) startEditing(share, link.overrides);
        } else if (jobNo) {
            // The office session: loaded only here, so the public path above
            // never touches the auth module.
            const { getJobOrderPlanSheet } = await import('../../apis/projects/jobOrders.js');
            sheet = await getJobOrderPlanSheet(jobNo);
            const cols = (params.get('cols') || '').split(',').filter(Boolean);
            state.columns = cols.length ? cols : null;
            state.mainOnly = params.get('main') === '1';
            state.showHeader = params.get('head') !== '0';
            applyLanguage(params.get('lang'));
            state.collapsed = new Set((params.get('collapsed') || '').split(',').filter(Boolean));
        } else {
            throw new Error(tr('İş emri belirtilmedi.', 'No job order given.'));
        }
        render();
        if (params.get('print') === '1') setTimeout(() => window.print(), 500);
    } catch (error) {
        console.error('Plan sheet page failed:', error);
        document.getElementById('ps-head').innerHTML = `
            <div class="ps-page-error">
                <i class="fas fa-triangle-exclamation me-2"></i>${escapeHtml(error && error.message ? error.message : tr('Plan yüklenemedi.', 'The plan could not be loaded.'))}
            </div>`;
    }
}

load();
