/**
 * /projects/references/ — Referanslar: the estimator's reference library.
 *
 * Every job order with a weld list (reference profile): its weld content,
 * recorded welding hours, the bottom-up hours under the CURRENT unit times
 * and the factor (recorded ÷ bottom-up). The estimating engineer:
 *  - checks a job's weld list (row click / list button) and corrects it
 *    (Düzenle: a hand-edited copy saved as the next version, with a note),
 *  - marks it Doğrulandı, or Hariç (with a note: out of every estimate),
 *  - reads the factor distribution per family (summary cards),
 *  - edits the unit times and cost parameters (Birim süreler panel),
 *  - reads how it all works (Nasıl çalışır?, the same text as the Tahmin tab).
 *
 * Page permission: `access_projects_references` (users/0067), granted with
 * `view_estimates`; the API refuses everyone else with 403 anyway.
 */
import { guardRoute } from '../../authService.js';
import { initNavbar } from '../../components/navbar.js';
import { HeaderComponent } from '../../components/header/header.js';
import { FiltersComponent } from '../../components/filters/filters.js';
import { TableComponent } from '../../components/table/table.js';
import { DisplayModal } from '../../components/display-modal/display-modal.js';
import { initRouteProtection } from '../../apis/routeProtection.js';
import { showNotification } from '../../components/notification/notification.js';
import { escapeHtml } from '../../utils/text.js';
import {
    REFERENCE_FAMILY, REFERENCE_RELIABILITY, REFERENCE_REVIEW, REFERENCE_ROUTE,
    getEstimatorParameters, getReferenceSummary, getWeldSchedule, listReferenceProfiles, previewWeldScheduleVersion,
    reviewReferenceProfile, saveWeldScheduleVersion, updateEstimatorParameters,
} from '../../apis/estimator.js';
import {
    JOINT_TYPE_LABELS, MATERIAL_LABELS, PROCESS_LABELS, fmt, processLabel,
} from '../../components/estimate-report/estimate-report.js';
import { openEstimatorMethod } from '../../components/estimator-method/estimator-method.js';

const JOB_STATUS = {
    draft: 'Taslak', active: 'Aktif', on_hold: 'Beklemede', completed: 'Tamamlandı', cancelled: 'İptal',
};
const EXCLUSION_LABELS = {
    'excluded by review': 'İnceleme ile hariç',
    'no recorded hours': 'Kayıtlı saat yok',
    'built by a subcontractor': 'Taşeronda yapılmış',
    'not subcontracted': 'Taşerona verilmemiş',
};
// "Not given" in either language (English schedules until translate_weld_schedules runs).
const EMPTY_VALUES = new Set(['not specified', 'none', 'n/a', 'belirtilmemiş', 'yok']);
const UNIT_LABELS = { 'h/piece': 'h/parça', 'h/bend': 'h/büküm', 'h/pressure joint': 'h/basınçlı birleşim', 'h/kg': 'h/kg' };
const NON_WELDING_LABELS = {
    cutting: 'Kesim', bending: 'Büküm', bevel_and_pt: 'Ağız açma + PT',
    handling: 'Çatma, çevirme, temizlik', hydrotest: 'Hidrotest',
    fitup_hydrotest_cleaning: 'Çatma, hidrotest, temizlik',   // reports stored before the geometry method
};
// Groove shape of a joint as the geometry model read it (weld_geometry.PREP_CODES).
const PREP_LABELS = { I: 'I alın', V: 'V ağız', HV: 'Yarım V', X: 'X ağız', K: 'K ağız', U: 'U ağız', fillet: 'Köşe' };

/** "Geometri: t=25 mm · a=10 · Köşe · 0,90 kg/m · boğaz varsayılan": what a joint's hours were computed from. */
function geometryText(g) {
    if (!g || g.thickness_mm == null) return '';
    const parts = [`t=${fmt(g.thickness_mm, 0)} mm`];
    if (g.throat_mm) parts.push(`a=${fmt(g.throat_mm, 0)}`);
    parts.push(`${PREP_LABELS[g.prep] || g.prep || ''}${g.sides === 2 ? ' (çift taraf)' : ''}`);
    if (g.kg_per_m != null) parts.push(`${fmt(g.kg_per_m, 2)} kg/m`);
    const source = String(g.geometry_source || '');
    if (source.startsWith('default')) parts.push('ölçü okunamadı, varsayılan');
    else if (source.includes('throat_default')) parts.push('boğaz varsayılan');
    return `Geometri: ${parts.join(' · ')}`;
}

let table = null;
let filters = null;
let modal = null;
let modalTables = [];
let rows = [];
let sortState = { field: null, dir: 'asc' };   // TableComponent only reports header clicks (onSort); the page sorts
// The page also pages: TableComponent's own client-side slicing only kicks in when
// totalItems > data.length, so it runs in serverSidePagination mode and gets one
// page of the sorted list (sorting stays global across pages).
let page = 1;
let pageSize = 50;
let libraryTotal = null;   // every profile, unfiltered (summary counts)
let familiesLoaded = false;
let units = null;           // GET /estimator/parameters/ payload
let unitsBusy = false;
let methodStale = false;    // a unit time changed: the method text shows the old table until refetched

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) return;
    if (!initRouteProtection()) return;
    await initNavbar();

    new HeaderComponent({
        title: 'Referanslar',
        subtitle: 'Tahminde kullanılan bitmiş işler: kaynak listesi, kayıtlı saat, faktör ve inceleme',
        icon: 'book-open',
        showBackButton: 'block',
        showRefreshButton: 'block',
        refreshButtonText: 'Yenile',
        onBackClick: () => { window.location.href = '/projects'; },
        onRefreshClick: () => loadAll(),
    });

    document.getElementById('ref-method-btn').addEventListener('click', () => {
        openEstimatorMethod({ fresh: methodStale });
        methodStale = false;
    });
    document.getElementById('ref-units-btn').addEventListener('click', toggleUnitsPanel);
    const panel = document.getElementById('ref-units-panel');
    panel.addEventListener('click', onUnitsClick);
    panel.addEventListener('input', onUnitsInput);

    initFilters();
    initTable();
    initModal();
    await loadAll();
});

// ---------------------------------------------------------------- filters + table

function initFilters() {
    filters = new FiltersComponent('filters-placeholder', {
        title: 'Filtreler',
        onApply: () => loadRows(),
        onClear: () => loadRows(),
    });
    filters.addTextFilter({ id: 'search-filter', label: 'Arama', placeholder: 'İş emri, başlık, müşteri…', colSize: 2 });
    filters.addDropdownFilter({
        id: 'family-filter', label: 'Aile', multiple: true, placeholder: 'Tümü', colSize: 2,
        options: Object.entries(REFERENCE_FAMILY).map(([value, label]) => ({ value, label })),
    });
    filters.addDropdownFilter({
        id: 'route-filter', label: 'Güzergâh', multiple: true, placeholder: 'Tümü', colSize: 2,
        options: Object.entries(REFERENCE_ROUTE).map(([value, r]) => ({ value, label: r.label })),
    });
    filters.addDropdownFilter({
        id: 'reliability-filter', label: 'Saat kaydı', multiple: true, placeholder: 'Tümü', colSize: 2,
        options: Object.entries(REFERENCE_RELIABILITY).map(([value, r]) => ({ value, label: value === 'unreliable' ? 'Güvenilmez (≤ 10 h)' : r.label })),
    });
    filters.addDropdownFilter({
        id: 'review-filter', label: 'İnceleme', multiple: true, placeholder: 'Tümü', colSize: 2,
        options: Object.entries(REFERENCE_REVIEW).map(([value, r]) => ({ value, label: r.label })),
    });
    filters.addDropdownFilter({
        id: 'status-filter', label: 'İş durumu', multiple: true, placeholder: 'Tümü', colSize: 2,
        options: Object.entries(JOB_STATUS).map(([value, label]) => ({ value, label })),
    });
}

function badge(map, value) {
    const b = map[value] || { label: value || '—', badge: 'status-grey' };
    return `<span class="status-badge ${b.badge}">${escapeHtml(b.label)}</span>`;
}

const num = (digits) => (v) => (v == null ? '—' : fmt(v, digits));

function initTable() {
    table = new TableComponent('references-table-container', {
        columns: [
            { field: 'job_no', label: 'İş', sortable: true, width: '95px',
              formatter: (v, row) => `<strong>${escapeHtml(v)}</strong><span class="ref-job-status">${escapeHtml(JOB_STATUS[row.job_status] || row.job_status || '')}</span>` },
            { field: 'title', label: 'Başlık', sortable: true,
              formatter: (v) => `<span class="ref-title" title="${escapeHtml(v || '')}">${escapeHtml(v || '')}</span>` },
            { field: 'customer', label: 'Müşteri', sortable: true, formatter: (v) => escapeHtml(v || '') },
            { field: 'family', label: 'Aile', sortable: true, formatter: (v) => escapeHtml(REFERENCE_FAMILY[v] || v || '') },
            { field: 'route', label: 'Güzergâh', sortable: true, formatter: (v) => badge(REFERENCE_ROUTE, v) },
            { field: 'quantity', label: 'Adet', sortable: true, type: 'number', cellClass: 'ref-num', headerClass: 'ref-num', exportType: 'number' },
            { field: 'unit_mass_kg', label: 'Birim kg', sortable: true, type: 'number', cellClass: 'ref-num', headerClass: 'ref-num',
              exportType: 'number', formatter: num(0) },
            { field: 'weld_m_total', label: 'Kaynak m', sortable: true, type: 'number', cellClass: 'ref-num', headerClass: 'ref-num',
              exportType: 'number', formatter: num(1) },
            { field: 'joints_total', label: 'Birleşim', sortable: true, type: 'number', cellClass: 'ref-num', headerClass: 'ref-num', exportType: 'number' },
            { field: 'recorded_welding_h_per_unit', label: 'Kayıtlı h/adet', sortable: true, type: 'number', cellClass: 'ref-num', headerClass: 'ref-num',
              exportType: 'number', formatter: num(1) },
            { field: 'bottom_up_h_per_unit', label: 'Hesap h/adet', sortable: true, type: 'number', cellClass: 'ref-num', headerClass: 'ref-num',
              exportType: 'number', formatter: num(1) },
            { field: 'factor', label: 'Faktör', sortable: true, type: 'number', cellClass: 'ref-num', headerClass: 'ref-num', exportType: 'number',
              formatter: (v, row) => {
                  const text = v == null ? '—' : fmt(v, 2);
                  // The hours guard (Saat kaydı) lives here: it rarely fires, and when it does it greys the factor.
                  const hours = `Kayıtlı kaynak saati: ${fmt(row.recorded_welding_h_total, 0)} h (${RELIABILITY_TEXT[row.hours_reliability] || row.hours_reliability || '—'})`;
                  if (!row.in_house_exclusion) return `<span class="ref-factor" title="${escapeHtml(hours)}">${text}</span>`;
                  const why = exclusionLabel(row.in_house_exclusion);
                  return `<span class="ref-out" title="${escapeHtml(`İç imalat kalibrasyonunda kullanılmaz: ${why}
${hours}`)}">${text}<i class="fas fa-ban ref-out-icon"></i></span>`;
              } },
            // Model confidence of the weld list this page reviews; sort ascending to see the shaky lists first.
            { field: 'weld_schedule_confidence', label: 'Güven', sortable: true, type: 'number', exportType: 'number',
              formatter: (v, row) => confidenceBadge(v, row.weld_schedule_version ? `Kaynak listesi v${row.weld_schedule_version}: modelin kendi güven puanı` : '') },
            { field: 'review_status', label: 'İnceleme', sortable: true, formatter: (v, row) => {
                const b = REFERENCE_REVIEW[v] || REFERENCE_REVIEW.unreviewed;
                const tip = [row.review_note, row.reviewed_by_name && `${row.reviewed_by_name} · ${formatDateTime(row.reviewed_at)}`].filter(Boolean).join('\n');
                return `<span class="status-badge ${b.badge}" title="${escapeHtml(tip)}">${b.label}</span>`;
            } },
        ],
        actions: [
            { key: 'weld', label: 'Kaynak listesi', icon: 'fas fa-list-ol', class: 'btn-outline-primary', onClick: (row) => openWeldList(row) },
            { key: 'verify', label: 'Doğrula', icon: 'fas fa-check', class: 'btn-outline-success',
              visible: (row) => row.review_status !== 'verified', onClick: (row) => openReview(row, 'verified') },
            { key: 'exclude', label: 'Hariç tut', icon: 'fas fa-ban', class: 'btn-outline-danger',
              visible: (row) => row.review_status !== 'excluded', onClick: (row) => openReview(row, 'excluded') },
            { key: 'reset', label: 'İncelemeyi geri al', icon: 'fas fa-rotate-left', class: 'btn-outline-secondary',
              visible: (row) => row.review_status !== 'unreviewed', onClick: (row) => openReview(row, 'unreviewed') },
        ],
        data: [],
        sortable: true,
        pagination: true,
        serverSidePagination: true,
        itemsPerPage: pageSize,
        currentPage: 1,
        exportable: true,
        exportFilename: 'tahmin-referanslari',
        emptyMessage: 'Filtreye uyan referans yok',
        onRowClick: (row) => openWeldList(row),
        onSort: (field, dir) => { sortState = { field, dir }; page = 1; showRows(); },
        onPageChange: (p) => { page = p; showRows(); },
        onPageSizeChange: (size) => { pageSize = size; page = 1; showRows(); },
    });
    // Excel export: the whole filtered, sorted list, not just the page on screen.
    const pageExport = table.prepareExportData.bind(table);
    table.prepareExportData = () => {
        const onScreen = table.options.data;
        table.options.data = sortedRows();
        try { return pageExport(); } finally { table.options.data = onScreen; }
    };
}

const RELIABILITY_TEXT = { ok: 'güvenilir', unreliable: 'güvenilmez, ≤ 10 h', none: 'kayıt yok' };

/** Weld-list confidence (0-1) as a percentage badge: < 0,4 orange, 0,4-0,5 grey, >= 0,5 green. */
function confidenceBadge(value, title = '') {
    if (value == null || value === '') return '<span class="text-muted">—</span>';
    const v = Number(value);
    const cls = v < 0.4 ? 'status-orange' : v < 0.5 ? 'status-grey' : 'status-green';
    return `<span class="status-badge ${cls}"${title ? ` title="${escapeHtml(title)}"` : ''}>%${fmt(v * 100, 0)}</span>`;
}

/** `rows` in the clicked column's order; empty values last either way, Turkish collation for text. */
function sortedRows() {
    const { field, dir } = sortState;
    if (!field) return rows;
    const sign = dir === 'desc' ? -1 : 1;
    const empty = (v) => v === null || v === undefined || v === '';
    return rows.slice().sort((a, b) => {
        const x = a[field];
        const y = b[field];
        if (empty(x) || empty(y)) return empty(x) - empty(y);
        if (typeof x === 'number' && typeof y === 'number') return sign * (x - y);
        return sign * String(x).localeCompare(String(y), 'tr', { numeric: true });
    });
}

function showRows() {
    const all = sortedRows();
    const pages = Math.max(1, Math.ceil(all.length / pageSize));
    page = Math.min(Math.max(1, page), pages);
    table.options.itemsPerPage = pageSize;
    table.updateData(all.slice((page - 1) * pageSize, page * pageSize), all.length, page);
    renderCount();
}

function filtersActive() {
    const f = filters?.getFilterValues() || {};
    return Object.values(f).some((v) => (Array.isArray(v) ? v.length : String(v ?? '').trim() !== ''));
}

/** "66 referans", or "12 / 66 referans (filtreli)" while a filter is on. */
function renderCount() {
    const el = document.getElementById('ref-count');
    if (!el) return;
    const total = libraryTotal ?? rows.length;
    el.innerHTML = filtersActive()
        ? `<strong>${rows.length}</strong> / ${total} referans <span class="text-muted">(filtreli)</span>`
        : `<strong>${total}</strong> referans`;
}

function exclusionLabel(reason) {
    if (!reason) return '';
    if (EXCLUSION_LABELS[reason]) return EXCLUSION_LABELS[reason];
    if (reason.startsWith('unreliable')) return 'Güvenilmez saat kaydı (≤ 10 h)';
    if (reason.startsWith('mostly subcontracted')) {
        // "mostly subcontracted (99% of kg)": the recorded hours are residual work, not the whole job
        const m = reason.match(/(\d+)%/);
        return m ? `Kilosunun %${m[1]}'i taşeronda kaynaklanmış` : 'Kilosunun çoğu taşeronda kaynaklanmış';
    }
    return reason;
}

function joinValue(v) {
    return Array.isArray(v) ? v.join(',') : (v || '');
}

async function loadAll() {
    await Promise.all([loadRows(), loadSummary(), units ? loadUnits() : Promise.resolve()]);
}

async function loadRows() {
    const f = filters.getFilterValues();
    table.setLoading(true);
    try {
        const data = await listReferenceProfiles({
            search: (f['search-filter'] || '').trim(),
            family: joinValue(f['family-filter']),
            route: joinValue(f['route-filter']),
            reliability: joinValue(f['reliability-filter']),
            review_status: joinValue(f['review-filter']),
            status: joinValue(f['status-filter']),
        });
        rows = data.results || [];
        page = 1;
        showRows();
        if (!familiesLoaded && Array.isArray(data.families)) {
            // Only the families that have profiles, in the label order.
            const known = Object.keys(REFERENCE_FAMILY).filter((k) => data.families.includes(k));
            const extra = data.families.filter((k) => !REFERENCE_FAMILY[k]);
            filters.updateFilterOptions('family-filter', [...known, ...extra].map((value) => ({ value, label: REFERENCE_FAMILY[value] || value })));
            familiesLoaded = true;
        }
    } catch (error) {
        console.error('Referanslar yüklenemedi:', error);
        showNotification(error.message || 'Referanslar yüklenemedi', 'error');
        rows = [];
        table.updateData([], 0, 1);
        renderCount();
    } finally {
        table.setLoading(false);
    }
}

// ---------------------------------------------------------------- summary cards

async function loadSummary() {
    const host = document.getElementById('ref-summary');
    try {
        const s = await getReferenceSummary();
        libraryTotal = s.counts?.total ?? null;
        renderSummary(s);
        renderCount();
    } catch (error) {
        host.innerHTML = `<div class="ref-summary-empty text-danger">${escapeHtml(error.message || 'Özet yüklenemedi')}</div>`;
    }
}

function distCard(title, dist, extraClass = '') {
    if (!dist || !dist.n) return '';
    const range = dist.n > 1
        ? `medyan ${fmt(dist.median, 2)} · çeyrekler ${fmt(dist.p25, 2)}–${fmt(dist.p75, 2)}<br>en düşük ${fmt(dist.min, 2)} · en yüksek ${fmt(dist.max, 2)}`
        : 'tek iş: aralık yok';
    return `<div class="ref-card ${extraClass}">
        <div class="ref-card-title"><span>${escapeHtml(title)}</span><span>n = ${dist.n}</span></div>
        <div class="ref-card-value">${fmt(dist.mean, 2)} <small>ortalama faktör</small></div>
        <div class="ref-card-sub">${range}</div>
    </div>`;
}

function renderSummary(s) {
    const host = document.getElementById('ref-summary');
    const c = s.counts || {};
    const rs = c.review_status || {};
    const counts = `<div class="ref-card ref-card-counts">
        <div class="ref-card-title"><span>Profiller</span><span>${c.total ?? 0}</span></div>
        <div class="ref-count-line"><span>Kalibrasyonda kullanılan</span><strong>${(s.jobs_used || []).length}</strong></div>
        <div class="ref-count-line"><span>Doğrulandı</span><strong>${rs.verified || 0}</strong></div>
        <div class="ref-count-line"><span>İncelenmedi</span><strong>${rs.unreviewed || 0}</strong></div>
        <div class="ref-count-line"><span>Hariç</span><strong>${rs.excluded || 0}</strong></div>
    </div>`;
    const families = Object.entries(s.families || {})
        .sort((a, b) => (b[1].n || 0) - (a[1].n || 0))
        .map(([fam, dist]) => distCard(REFERENCE_FAMILY[fam] || fam, dist))
        .join('');
    const all = distCard('Tüm aileler', s.all, 'ref-card-all');
    const empty = !all
        ? '<div class="ref-summary-empty">Faktör dağılımı için iç imalat, güvenilir saatli (> 10 h) ve hariç tutulmamış bir referans gerekiyor.</div>'
        : '';
    host.innerHTML = counts + all + families + empty;
    host.title = s.population || '';
}

// ---------------------------------------------------------------- modal (weld list / review)

function initModal() {
    modal = new DisplayModal('reference-modal-container', {
        title: 'Referans',
        icon: 'fas fa-book-open',
        size: 'xl',
        showEditButton: false,
        backdropStatic: false,
    });
    const container = document.getElementById('reference-modal-container');
    container.addEventListener('click', onModalClick);
    container.addEventListener('input', onWeldInput);
    container.addEventListener('change', onWeldInput);
    // Unsaved weld-list edits: ask before Esc / backdrop / Kapat throws them away. Capture phase,
    // so DisplayModal's own hide handler (which makes the dialog inert) does not run when kept open.
    modal.modal.addEventListener('hide.bs.modal', (event) => {
        if (confirmDiscard()) return;
        event.preventDefault();
        event.stopImmediatePropagation();
    }, true);
}

function resetModal(title, icon) {
    if (weld) clearTimeout(weld.previewTimer);
    weld = null;
    destroyModalTables();
    modal.clearData();
    modal.setTitle(title);
    modal.setIcon(icon);
    modal.setFooterContent('<button type="button" class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal"><i class="fas fa-times me-1"></i>Kapat</button>');
}

function factsHtml(row) {
    const fact = (label, value) => `<div><span>${label}</span> <strong>${value}</strong></div>`;
    const mats = Object.entries(row.weld_m_by_material || {}).map(([m, v]) => `${MATERIAL_LABELS[m] || m} ${fmt(v, 1)} m`).join(', ');
    return `<div class="ref-modal-facts">
        ${fact('Aile', escapeHtml(REFERENCE_FAMILY[row.family] || row.family || '—'))}
        ${fact('Güzergâh', escapeHtml(REFERENCE_ROUTE[row.route]?.label || row.route || '—'))}
        ${row.subcontracted_kg_share > 0 ? fact('Taşeronda kaynaklanan', `kilonun %${fmt(row.subcontracted_kg_share * 100, 0)}'i`) : ''}
        ${fact('Adet', fmt(row.quantity, 0))}
        ${fact('Birim kütle', `${fmt(row.unit_mass_kg, 0)} kg`)}
        ${fact('Kaynak', `${fmt(row.weld_m_total, 1)} m${mats ? ` (${escapeHtml(mats)})` : ''}`)}
        ${fact('Birleşim', fmt(row.joints_total, 0))}
        ${fact('Kayıtlı', `${fmt(row.recorded_welding_h_per_unit, 1)} h/adet (toplam ${fmt(row.recorded_welding_h_total, 0)} h)`)}
        ${fact('Hesap', `${fmt(row.bottom_up_h_per_unit, 1)} h/adet`)}
        ${fact('Faktör', row.factor == null ? '—' : fmt(row.factor, 2))}
        ${row.in_house_exclusion ? fact('Kalibrasyon', escapeHtml(exclusionLabel(row.in_house_exclusion))) : ''}
    </div>`;
}

// ---------------------------------------------------------------- weld-list modal: view, versions, Düzenle
//
// A wrong count, length or mass is corrected here and saved as the job's NEXT
// version (POST weld-schedules/{job}/versions/): the extracted versions stay,
// the reference profile and the factor follow the new one. Older versions open
// read-only from the history under the table.

// Codes of the extraction schema (estimator weld_extraction.JointSchema); the backend refuses anything else.
const JOINT_MATERIAL_CODES = ['carbon_steel', 'stainless', 'copper', 'copper_to_steel'];
const MASS_MATERIAL_CODES = ['carbon_steel', 'stainless', 'copper', 'copper_to_steel', 'other'];
const PREVIEW_DELAY_MS = 350;

// {row, ws, editing, draft, dirty, errors, preview, previewSeq, previewTimer, saving}; null when the modal shows something else.
let weld = null;

async function openWeldList(row, version = null) {
    resetModal(`${row.job_no} — ${row.title || ''}`, 'fas fa-list-ol');
    weld = { row, ws: null, editing: false };
    modal.addCustomSection({ customContent: `<div id="ref-weld-facts">${factsHtml(row)}</div><div id="ref-weld-body" class="ref-weld-wrap"><div class="text-muted small"><i class="fas fa-spinner fa-spin me-1"></i>Kaynak listesi yükleniyor…</div></div>` });
    modal.render();
    modal.show();
    await loadWeldVersion(version);
}

async function loadWeldVersion(version) {
    const state = weld;
    if (!state) return;
    let ws;
    try {
        ws = await getWeldSchedule({ jobNo: state.row.job_no, version });
    } catch (error) {
        if (state !== weld) return;
        const body = document.getElementById('ref-weld-body');
        if (body) body.innerHTML = `<div class="text-danger small">${escapeHtml(error.message || 'Kaynak listesi yüklenemedi')}</div>`;
        return;
    }
    if (state !== weld) return;   // the modal moved on (another row, a review) while loading
    state.ws = ws;
    state.editing = false;
    renderWeldView();
}

function destroyModalTables() {
    modalTables.forEach((t) => { try { t.destroy?.(); } catch { /* gone */ } });
    modalTables = [];
}

function weldNotesHtml(ws) {
    // A multi-group extraction joins the groups' mass notes with " | ": one paragraph each.
    const massNotes = String(ws.mass_basis || '').split(/\s+\|\s+/).map((s) => s.trim()).filter(Boolean);
    const list = (items) => `<ul class="ref-note-list">${items.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul>`;
    return [
        massNotes.length ? `<details class="ref-note"><summary>Kütle notu (${massNotes.length})</summary>${list(massNotes)}</details>` : '',
        (ws.open_questions || []).length ? `<details class="ref-note"><summary>Çizimin söylemediği (${ws.open_questions.length})</summary>${list(ws.open_questions)}</details>` : '',
        (ws.design_features || []).length ? `<details class="ref-note"><summary>Tasarım özellikleri (${ws.design_features.length})</summary>${list(ws.design_features)}</details>` : '',
    ].join('');
}

function nonWeldingHtml(bu) {
    const lines = (bu.non_welding_lines || []).map((l) => `<tr><td>${escapeHtml(NON_WELDING_LABELS[l.step] || l.step)}${l.applies === false ? ' <span class="ref-joint-detail d-inline">(basınçlı sistem değil)</span>' : ''}</td><td class="text-end">${fmt(l.qty, l.unit === 'h/kg' ? 1 : 0)}</td><td>${escapeHtml(UNIT_LABELS[l.unit] || l.unit)}</td><td class="text-end">${fmt(l.unit_h, 4)}</td><td class="text-end">${fmt(l.hours, 2)}</td></tr>`).join('');
    return `<h6 class="mt-3 mb-1 ref-weld-h">Kaynak dışı (1 adet)</h6>
        <table class="table table-sm ref-bu-table"><thead><tr><th>Adım</th><th class="text-end">Miktar</th><th>Birim</th><th class="text-end">Birim süre</th><th class="text-end">Saat</th></tr></thead>
            <tbody>${lines}</tbody>
            <tfoot><tr><th colspan="4">Kaynak ${fmt(bu.welding_h, 1)} h + kaynak dışı ${fmt(bu.non_welding_h, 1)} h = hesaplanan saat (1 adet)</th><th class="text-end">${fmt(bu.total_h, 1)} h</th></tr></tfoot>
        </table>`;
}

/** "düzenleyen Onat Çalık · 19.10.2026 14:05: kep sayısı 7→9" for a hand-edited version. */
function editedByText(v) {
    if (!v.edited) return '';
    const who = v.edited_by_name || 'bilinmeyen kullanıcı';
    return `düzenleyen ${who} · ${formatDateTime(v.created_at)}${v.based_on_version ? ` (v${v.based_on_version} üzerinden)` : ''}`;
}

function versionHistoryHtml(ws) {
    const history = ws.version_history || [];
    if (!history.length) return '';
    const latest = history[history.length - 1].version;
    const rowsHtml = history.slice().reverse().map((v) => {
        const current = v.version === ws.version;
        const source = v.edited
            ? `<span class="status-badge status-purple">Elle</span> ${escapeHtml(v.edited_by_name || '—')}${v.based_on_version ? ` <span class="text-muted">(v${v.based_on_version} üzerinden)</span>` : ''}`
            : `<span class="status-badge status-grey">Model</span>`;
        const action = current
            ? '<span class="text-muted small">gösteriliyor</span>'
            : `<button type="button" class="btn btn-link btn-sm p-0" data-weld-action="version" data-version="${v.version}">Görüntüle</button>`;
        return `<tr class="${current ? 'is-current' : ''}">
            <td><strong>v${v.version}</strong>${v.version === latest ? ' <span class="status-badge status-blue">son</span>' : ''}</td>
            <td class="text-nowrap">${formatDateTime(v.created_at)}</td>
            <td>${source}</td>
            <td class="ref-history-note">${escapeHtml(v.edit_note || '')}</td>
            <td class="text-end">${fmt(v.joints_total, 0)}</td>
            <td class="text-end">${fmt(v.weld_m_total, 1)}</td>
            <td class="text-end">${fmt(v.unit_mass_kg, 0)}</td>
            <td class="text-end">${action}</td>
        </tr>`;
    }).join('');
    return `<h6 class="mt-3 mb-1 ref-weld-h">Sürüm geçmişi (${history.length})</h6>
        <div class="ref-history-wrap"><table class="table table-sm ref-history-table">
            <thead><tr><th>Sürüm</th><th>Tarih</th><th>Kaynak</th><th>Not</th><th class="text-end">Birleşim</th><th class="text-end">Kaynak m</th><th class="text-end">Birim kg</th><th></th></tr></thead>
            <tbody>${rowsHtml}</tbody>
        </table></div>`;
}

function renderWeldView() {
    const body = document.getElementById('ref-weld-body');
    if (!body || !weld?.ws) return;
    destroyModalTables();
    const ws = weld.ws;
    const bu = ws.bottom_up || {};
    const lines = bu.lines || [];
    const joints = (ws.joints || []).map((j, i) => ({ ...j, unit_h: lines[i]?.unit_h, unit_label: lines[i]?.unit, hours: lines[i]?.hours, geometry: lines[i] }));
    const latest = (ws.version_history || []).slice(-1)[0]?.version ?? ws.version;
    const old = ws.is_latest === false
        ? `<div class="ref-weld-old"><i class="fas fa-clock-rotate-left me-1"></i>Eski sürüm <strong>v${ws.version}</strong> gösteriliyor (salt okunur). Faktör ve tahminler son sürümü (v${latest}) kullanır.
            <button type="button" class="btn btn-link btn-sm p-0 ms-1" data-weld-action="version" data-version="">Son sürüme dön</button></div>`
        : '';
    const edited = ws.edited
        ? `<div class="ref-weld-edited"><i class="fas fa-pen me-1"></i>v${ws.version} elle düzeltildi: ${escapeHtml(editedByText(ws))}${ws.edit_note ? ` — <strong>${escapeHtml(ws.edit_note)}</strong>` : ''}</div>`
        : '';
    body.innerHTML = `
        ${old}
        <div class="ref-weld-meta">
            <span>Kaynak listesi <strong>v${ws.version}</strong></span>
            <span>Güven ${confidenceBadge(Number(ws.confidence || 0))}</span>
            <span><strong>${ws.pieces_to_cut_per_unit ?? ws.pieces_per_unit ?? 0}</strong> parça</span>
            <span><strong>${ws.bends_per_unit ?? 0}</strong> büküm</span>
            <span>Birim kütle <strong>${fmt(ws.unit_mass_kg, 0)} kg</strong>${ws.mass_basis ? ' <span class="text-muted">(kütle notuna bakın)</span>' : ''}</span>
        </div>
        ${edited}
        ${weldNotesHtml(ws)}
        <div id="ref-weld-table"></div>
        ${nonWeldingHtml(bu)}
        ${versionHistoryHtml(ws)}`;
    // 8 columns: size / process / NDT / evidence sit under the description, so
    // the table fits an 800 px dialog without a horizontal scroll.
    const detail = (j) => [
        j.size && `Ölçü: ${j.size}`,
        j.process && `Proses: ${processLabel(j.process)}`,
        j.weld_detail && !EMPTY_VALUES.has(String(j.weld_detail).trim().toLowerCase()) && `Detay: ${j.weld_detail}`,
        j.ndt && !EMPTY_VALUES.has(String(j.ndt).trim().toLowerCase()) && `NDT: ${j.ndt}`,
        geometryText(j.geometry),
    ].filter(Boolean).map(escapeHtml).join(' · ');
    modalTables.push(new TableComponent('ref-weld-table', {
        columns: [
            { field: 'joint_id', label: 'No', width: '64px', sortable: true },
            { field: 'description', label: 'Birleşim', sortable: false, formatter: (v, j) => `<div class="ref-joint-desc">${escapeHtml(v || '')}</div>
                ${detail(j) ? `<div class="ref-joint-detail">${detail(j)}</div>` : ''}${j.evidence ? `<div class="ref-joint-detail" title="${escapeHtml(j.evidence)}">Pafta: ${escapeHtml(j.evidence)}</div>` : ''}` },
            { field: 'joint_type', label: 'Tip · malzeme', sortable: true, width: '130px',
              formatter: (v, j) => `${JOINT_TYPE_LABELS[v] || escapeHtml(v || '')}<div class="ref-joint-detail">${MATERIAL_LABELS[j.material] || escapeHtml(j.material || '')}</div>` },
            { field: 'count_per_unit', label: 'Adet', type: 'number', sortable: true, width: '56px', headerClass: 'est-num', cellClass: 'est-num' },
            { field: 'length_m_each', label: 'm / birleşim', type: 'number', sortable: true, width: '80px', headerClass: 'est-num', cellClass: 'est-num', formatter: num(3) },
            { field: 'total_m_per_unit', label: 'm toplam', type: 'number', sortable: true, width: '72px', headerClass: 'est-num', cellClass: 'est-num', formatter: num(2) },
            { field: 'unit_h', label: 'Birim süre', type: 'number', sortable: true, width: '96px', headerClass: 'est-num', cellClass: 'est-num',
              formatter: (v, r) => (v == null ? '—' : `${fmt(v, 3)} <span class="ref-joint-detail d-inline">${escapeHtml(String(r.unit_label || '').replace('joint', 'birleşim'))}</span>`) },
            { field: 'hours', label: 'Saat', type: 'number', sortable: true, width: '60px', headerClass: 'est-num', cellClass: 'est-num', formatter: num(2) },
        ],
        data: joints,
        sortable: true,
        pagination: false,
        showHeader: false,
        small: true,
        skeleton: false,
        emptyMessage: 'Birleşim yok',
    }));
    modal.setFooterContent(`
        <button type="button" class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal"><i class="fas fa-times me-1"></i>Kapat</button>
        <button type="button" class="btn btn-sm btn-primary" data-weld-action="edit" title="Düzeltilmiş liste yeni bir sürüm olarak kaydedilir; bu sürüm değişmez">
            <i class="fas fa-pen me-1"></i>${ws.is_latest === false ? `v${ws.version} üzerinden düzenle` : 'Düzenle'}
        </button>`);
}

// ------------------------------------------------ edit mode

/** Numbers stay as the typed text in the draft (decimal comma allowed); `draftPayload` parses them. */
function inputText(v) {
    return v == null ? '' : String(v).replace('.', ',');
}

function massByMaterialDict(value) {
    if (Array.isArray(value)) return Object.fromEntries(value.filter((x) => x && x.material).map((x) => [x.material, x.kg]));
    return { ...(value || {}) };
}

function startWeldEdit() {
    const ws = weld.ws;
    const mass = massByMaterialDict(ws.mass_by_material_kg ?? ws.mass_by_material);
    weld.draft = {
        base_version: ws.version,
        part_name: ws.part_name || '',
        unit_mass_kg: inputText(ws.unit_mass_kg),
        mass_basis: ws.mass_basis || '',
        mass_by_material: Object.fromEntries(MASS_MATERIAL_CODES.map((m) => [m, mass[m] ? inputText(mass[m]) : ''])),
        pieces_per_unit: inputText(ws.pieces_to_cut_per_unit ?? ws.pieces_per_unit ?? 0),
        bends_per_unit: inputText(ws.bends_per_unit ?? 0),
        joints: (ws.joints || []).map((j) => ({ ...j, count_per_unit: inputText(j.count_per_unit), length_m_each: inputText(j.length_m_each) })),
        design_features: [...(ws.design_features || [])],
        processes: [...(ws.processes || [])],
        open_questions: [...(ws.open_questions || [])],
        note: '',
    };
    weld.editing = true;
    weld.dirty = false;
    weld.errors = {};
    weld.preview = null;
    weld.previewSeq = 0;
    renderWeldEdit();
    runPreview();
}

function selectHtml(field, value, labels, codes) {
    const known = codes.includes(value);
    const options = codes.map((c) => `<option value="${c}"${c === value ? ' selected' : ''}>${escapeHtml(labels[c] || c)}</option>`);
    // A code outside the schema (should not happen) stays visible so the save error points at it.
    if (!known) options.unshift(`<option value="${escapeHtml(value || '')}" selected>${escapeHtml(value || '—')} (geçersiz)</option>`);
    return `<select class="form-select form-select-sm" data-field="${field}" aria-label="${field}">${options.join('')}</select>`;
}

function gridRowHtml(j, i) {
    const context = [j.size && `Ölçü: ${j.size}`, j.evidence && `Pafta: ${j.evidence}`].filter(Boolean).map(escapeHtml).join(' · ');
    return `<tr data-row="${i}">
        <td><input type="text" class="form-control form-control-sm" data-field="joint_id" value="${escapeHtml(j.joint_id || '')}" placeholder="yeni" aria-label="No"></td>
        <td>
            <textarea class="form-control form-control-sm" data-field="description" rows="2" placeholder="Ne neye kaynıyor (poz numaralarıyla)" aria-label="Birleşim">${escapeHtml(j.description || '')}</textarea>
            <input type="text" class="form-control form-control-sm mt-1" data-field="weld_detail" value="${escapeHtml(j.weld_detail || '')}" placeholder="Kaynak detayı (ör. a=5 köşe, V 60°)" aria-label="Kaynak detayı">
            ${context ? `<div class="ref-joint-detail" title="${context}">${context}</div>` : ''}
        </td>
        <td>
            ${selectHtml('joint_type', j.joint_type, JOINT_TYPE_LABELS, Object.keys(JOINT_TYPE_LABELS))}
            <div class="mt-1">${selectHtml('material', j.material, MATERIAL_LABELS, JOINT_MATERIAL_CODES)}</div>
        </td>
        <td>${selectHtml('process', j.process, PROCESS_LABELS, Object.keys(PROCESS_LABELS))}</td>
        <td><input type="text" inputmode="numeric" class="form-control form-control-sm ref-eg-num" data-field="count_per_unit" value="${escapeHtml(j.count_per_unit ?? '')}" aria-label="Adet"></td>
        <td><input type="text" inputmode="decimal" class="form-control form-control-sm ref-eg-num" data-field="length_m_each" value="${escapeHtml(j.length_m_each ?? '')}" aria-label="m / birleşim"></td>
        <td class="est-num" data-cell="total"></td>
        <td class="est-num" data-cell="hours"></td>
        <td class="text-end"><button type="button" class="btn btn-sm btn-outline-danger" data-weld-action="delete-row" title="Satırı sil" aria-label="Satırı sil"><i class="fas fa-trash"></i></button></td>
    </tr>`;
}

function renderWeldGrid() {
    const tbody = document.getElementById('ref-eg-rows');
    if (!tbody) return;
    tbody.innerHTML = weld.draft.joints.length
        ? weld.draft.joints.map(gridRowHtml).join('')
        : '<tr><td colspan="9" class="text-muted small text-center py-3">Birleşim yok: “Satır ekle” ile ekleyin.</td></tr>';
    weld.draft.joints.forEach((_, i) => updateRowCells(i));
    applyWeldErrors();
}

function renderWeldEdit() {
    const body = document.getElementById('ref-weld-body');
    if (!body) return;
    destroyModalTables();
    const d = weld.draft;
    const ws = weld.ws;
    const headInput = (key, label, mode = 'decimal', hint = '') => `<label class="ref-eg-field"><span>${label}</span>
        <input type="text" inputmode="${mode}" class="form-control form-control-sm ref-eg-num" data-head="${key}" value="${escapeHtml(d[key])}"${hint ? ` title="${escapeHtml(hint)}"` : ''}></label>`;
    const massInputs = MASS_MATERIAL_CODES.map((m) => `<label class="ref-eg-field ref-eg-mass"><span>${escapeHtml(MATERIAL_LABELS[m] || m)}</span>
        <input type="text" inputmode="decimal" class="form-control form-control-sm ref-eg-num" data-mass="${m}" value="${escapeHtml(d.mass_by_material[m] || '')}" placeholder="—"></label>`).join('');
    body.innerHTML = `
        <div class="ref-weld-editing"><i class="fas fa-pen me-1"></i>v${ws.version} düzenleniyor. Kaydet, düzeltilmiş listeyi <strong>yeni sürüm</strong> olarak saklar; v${ws.version} olduğu gibi kalır.
            Toplamlar ve hesaplanan saat yazdıkça güncellenir.</div>
        <div class="ref-eg-head">
            ${headInput('unit_mass_kg', 'Birim kütle (kg)')}
            ${headInput('pieces_per_unit', 'Parça / adet', 'numeric', 'Kesilecek parça sayısı (kesim süresi)')}
            ${headInput('bends_per_unit', 'Büküm / adet', 'numeric')}
            <div class="ref-eg-massgroup"><span class="ref-eg-grouplabel">Malzemeye göre kg</span><div>${massInputs}</div></div>
            <label class="ref-eg-field ref-eg-wide"><span>Kütle notu (nereden geldi)</span>
                <textarea class="form-control form-control-sm" data-head="mass_basis" rows="2">${escapeHtml(d.mass_basis)}</textarea></label>
        </div>
        <div class="ref-eg-wrap">
            <table class="table table-sm ref-eg-table">
                <thead><tr><th style="width:70px">No</th><th>Birleşim · kaynak detayı</th><th style="width:150px">Tip · malzeme</th><th style="width:150px">Proses</th>
                    <th class="est-num" style="width:70px">Adet</th><th class="est-num" style="width:84px">m / birleşim</th><th class="est-num" style="width:72px">m toplam</th>
                    <th class="est-num" style="width:60px">Saat</th><th style="width:44px"></th></tr></thead>
                <tbody id="ref-eg-rows"></tbody>
            </table>
        </div>
        <button type="button" class="btn btn-sm btn-outline-primary" data-weld-action="add-row"><i class="fas fa-plus me-1"></i>Satır ekle</button>
        <div id="ref-eg-totals" class="ref-eg-totals"></div>
        <label class="ref-eg-field ref-eg-wide mt-2"><span>Düzeltme notu <strong class="text-danger">*</strong></span>
            <textarea class="form-control form-control-sm" data-head="note" rows="2" placeholder="Neyi neden düzelttiniz? (ör. kep sayısı 7→9, pafta 3 kesit B-B)">${escapeHtml(d.note)}</textarea></label>
        <div class="text-danger small mt-1" id="ref-eg-error"></div>`;
    renderWeldGrid();
    updateWeldTotals();
    modal.setFooterContent(`
        <button type="button" class="btn btn-sm btn-outline-secondary" data-weld-action="cancel">Vazgeç</button>
        <button type="button" class="btn btn-sm btn-primary" data-weld-action="save"><i class="fas fa-save me-1"></i>Yeni sürüm olarak kaydet</button>`);
}

const INT_RE = /^\d+$/;

/** {payload, errors}: the draft with numbers parsed; `errors` uses the backend's keys (joints.<i>.<field>). */
function draftPayload() {
    const d = weld.draft;
    const errors = {};
    const number = (text, key, { integer = false } = {}) => {
        const t = String(text ?? '').trim();
        if (integer ? !INT_RE.test(t) : Number.isNaN(parseInput(t))) {
            errors[key] = integer ? 'Tam sayı olmalı.' : 'Sayı olmalı.';
            return null;
        }
        const v = integer ? Number(t) : parseInput(t);
        if (v < 0) { errors[key] = 'Negatif olamaz.'; return null; }
        return v;
    };
    const joints = d.joints.map((j, i) => {
        const out = { ...j };
        out.count_per_unit = number(j.count_per_unit, `joints.${i}.count_per_unit`, { integer: true });
        out.length_m_each = number(j.length_m_each, `joints.${i}.length_m_each`);
        // total_m_per_unit: the stored number, or null after a count/length edit (the backend computes count × length).
        return out;
    });
    const mass = {};
    Object.entries(d.mass_by_material).forEach(([m, text]) => {
        if (String(text ?? '').trim() === '') return;
        const v = number(text, `mass_by_material.${m}`);
        if (v) mass[m] = v;
    });
    const payload = {
        base_version: d.base_version,
        part_name: d.part_name,
        unit_mass_kg: number(d.unit_mass_kg, 'unit_mass_kg'),
        mass_basis: d.mass_basis,
        mass_by_material: mass,
        pieces_per_unit: number(d.pieces_per_unit, 'pieces_per_unit', { integer: true }),
        bends_per_unit: number(d.bends_per_unit, 'bends_per_unit', { integer: true }),
        joints,
        design_features: d.design_features,
        processes: d.processes,
        open_questions: d.open_questions,
        note: d.note.trim(),
    };
    return { payload, errors };
}

/** Metres of one draft row: the stored total until count or length is touched, then count × length. */
function rowMetres(j) {
    if (j.total_m_per_unit != null && j.total_m_per_unit !== '') return Number(j.total_m_per_unit) || 0;
    const t = String(j.count_per_unit ?? '').trim();
    const count = INT_RE.test(t) ? Number(t) : NaN;
    const length = parseInput(j.length_m_each);
    return Number.isNaN(count) || Number.isNaN(length) ? NaN : count * length;
}

function updateRowCells(i) {
    const tr = document.querySelector(`#ref-eg-rows tr[data-row="${i}"]`);
    const j = weld.draft.joints[i];
    if (!tr || !j) return;
    const m = rowMetres(j);
    tr.querySelector('[data-cell="total"]').textContent = Number.isNaN(m) ? '—' : fmt(m, 2);
    const line = weld.preview?.bottom_up?.lines?.[i];
    tr.querySelector('[data-cell="hours"]').innerHTML = line ? fmt(line.hours, 2) : '<span class="text-muted">…</span>';
}

/** Live totals from the draft (JS, instant) + the bottom-up hours of the last preview (server, debounced). */
function updateWeldTotals() {
    const host = document.getElementById('ref-eg-totals');
    if (!host) return;
    const before = weld.ws.totals || {};
    const byMat = {};
    let joints = 0;
    let metres = 0;
    let bad = false;
    weld.draft.joints.forEach((j) => {
        const m = rowMetres(j);
        const t = String(j.count_per_unit ?? '').trim();
        if (Number.isNaN(m) || !INT_RE.test(t)) { bad = true; return; }
        joints += Number(t);
        metres += m;
        byMat[j.material] = (byMat[j.material] || 0) + m;
    });
    const delta = (now, was, digits) => {
        const diff = now - (Number(was) || 0);
        if (Math.abs(diff) < 10 ** -digits / 2) return '';
        return ` <span class="ref-eg-delta ${diff > 0 ? 'up' : 'down'}">(${diff > 0 ? '+' : '−'}${fmt(Math.abs(diff), digits)})</span>`;
    };
    const mats = Object.entries(byMat).filter(([, v]) => v > 0)
        .map(([m, v]) => `${escapeHtml(MATERIAL_LABELS[m] || m)} ${fmt(v, 1)} m${delta(v, before.weld_m_by_material?.[m], 1)}`).join(' · ');
    const was = weld.ws.bottom_up || {};
    const p = weld.preview?.bottom_up;
    const hours = weld.previewError
        ? `<span class="text-danger">${escapeHtml(weld.previewError)}</span>`
        : p
            ? `kaynak ${fmt(p.welding_h, 1)} h + kaynak dışı ${fmt(p.non_welding_h, 1)} h = <strong>${fmt(p.total_h, 1)} h/adet</strong>${delta(p.total_h, was.total_h, 1)}
               <span class="text-muted">· v${weld.ws.version}: ${fmt(was.total_h, 1)} h</span>`
            : '<span class="text-muted"><i class="fas fa-spinner fa-spin me-1"></i>hesaplanıyor…</span>';
    host.innerHTML = `
        <div><span class="ref-eg-tlabel">Birleşim</span> <strong>${fmt(joints, 0)}</strong>${delta(joints, before.joints_total, 0)}
            <span class="ref-eg-tlabel ms-3">Kaynak</span> <strong>${fmt(metres, 1)} m</strong>${delta(metres, before.weld_m_total, 1)}${mats ? ` <span class="text-muted">(${mats})</span>` : ''}
            ${bad ? '<span class="text-danger ms-2">geçersiz satırlar toplama girmedi</span>' : ''}</div>
        <div><span class="ref-eg-tlabel">Hesaplanan saat</span> ${hours}</div>`;
}

function schedulePreview() {
    clearTimeout(weld.previewTimer);
    weld.previewTimer = setTimeout(runPreview, PREVIEW_DELAY_MS);
}

async function runPreview() {
    const state = weld;
    if (!state?.editing) return;
    const { payload, errors } = draftPayload();
    const seq = ++state.previewSeq;
    state.errors = errors;
    applyWeldErrors();
    if (Object.keys(errors).length) {
        state.preview = null;
        state.previewError = `${Object.keys(errors).length} hatalı alan: saat hesaplanamadı`;
        updateWeldTotals();
        return;
    }
    try {
        const result = await previewWeldScheduleVersion(state.row.job_no, { ...payload, note: '' });
        if (state !== weld || seq !== state.previewSeq || !state.editing) return;
        state.preview = result;
        state.previewError = null;
    } catch (error) {
        if (state !== weld || seq !== state.previewSeq || !state.editing) return;
        state.preview = null;
        state.errors = error.data?.errors || {};
        state.previewError = error.data?.errors ? `${Object.keys(state.errors).length} hatalı alan: saat hesaplanamadı` : (error.message || 'Önizleme hesaplanamadı');
        applyWeldErrors();
    }
    state.draft.joints.forEach((_, i) => updateRowCells(i));
    updateWeldTotals();
}

/** Marks the inputs named by `weld.errors` (backend keys) and lists every message under the note. */
function applyWeldErrors() {
    const body = document.getElementById('ref-weld-body');
    if (!body || !weld?.editing) return;
    body.querySelectorAll('.is-invalid').forEach((el) => { el.classList.remove('is-invalid'); el.removeAttribute('title'); });
    const messages = [];
    Object.entries(weld.errors || {}).forEach(([key, message]) => {
        const parts = key.split('.');
        let el = null;
        if (parts[0] === 'joints' && parts.length === 3) el = body.querySelector(`#ref-eg-rows tr[data-row="${parts[1]}"] [data-field="${parts[2]}"]`);
        else if (parts[0] === 'mass_by_material') el = body.querySelector(`[data-mass="${parts[1]}"]`);
        else el = body.querySelector(`[data-head="${parts[0]}"]`);
        if (el) {
            el.classList.add('is-invalid');
            el.title = message;
        }
        messages.push(parts[0] === 'joints' && parts.length === 3 ? `Satır ${Number(parts[1]) + 1}: ${message}` : message);
    });
    const errorEl = document.getElementById('ref-eg-error');
    if (errorEl) errorEl.textContent = messages.join(' · ');
}

function onWeldInput(event) {
    if (!weld?.editing) return;
    const t = event.target;
    const d = weld.draft;
    const tr = t.closest('#ref-eg-rows tr[data-row]');
    if (tr && t.dataset.field) {
        const i = Number(tr.dataset.row);
        const j = d.joints[i];
        if (!j) return;
        j[t.dataset.field] = t.value;
        // A touched count or length drops the stored total: count × length from now on (the backend does the same).
        if (t.dataset.field === 'count_per_unit' || t.dataset.field === 'length_m_each') j.total_m_per_unit = null;
        updateRowCells(i);
    } else if (t.dataset.head) {
        d[t.dataset.head] = t.value;
    } else if (t.dataset.mass) {
        d.mass_by_material[t.dataset.mass] = t.value;
    } else {
        return;
    }
    weld.dirty = true;
    t.classList.remove('is-invalid');
    updateWeldTotals();
    if (t.dataset.head === 'note' || t.dataset.head === 'mass_basis' || ['description', 'weld_detail', 'joint_id'].includes(t.dataset.field)) {
        if (t.dataset.head === 'note') document.getElementById('ref-eg-error').textContent = '';
        return;   // text only: hours do not move
    }
    schedulePreview();
}

function confirmDiscard() {
    return !weld?.editing || !weld.dirty || window.confirm('Kaydedilmemiş düzeltmeler kaybolacak. Devam edilsin mi?');
}

async function saveWeldEdit(btn) {
    const { payload, errors } = draftPayload();
    if (!payload.note) errors.note = 'Neyi neden düzelttiğinizi yazın (ör. kep sayısı 7→9, pafta 3).';
    weld.errors = errors;
    applyWeldErrors();
    if (Object.keys(errors).length) {
        document.querySelector('#ref-weld-body .is-invalid')?.focus();
        return;
    }
    const state = weld;
    btn.disabled = true;
    state.saving = true;
    try {
        const result = await saveWeldScheduleVersion(state.row.job_no, payload);
        if (state !== weld) return;
        const ws = result.weld_schedule;
        if (result.profile) {
            const i = rows.findIndex((r) => r.job_no === result.profile.job_no);
            if (i >= 0) rows[i] = result.profile;
            state.row = result.profile;
            showRows();
            const facts = document.getElementById('ref-weld-facts');
            if (facts) facts.innerHTML = factsHtml(result.profile);
        }
        state.ws = ws;
        state.editing = false;
        state.dirty = false;
        renderWeldView();
        showNotification(`${state.row.job_no}: kaynak listesi v${ws.version} kaydedildi; faktör yeniden hesaplandı.`, 'success');
        loadSummary();
    } catch (error) {
        if (state !== weld) return;
        state.errors = error.data?.errors || {};
        applyWeldErrors();
        if (!error.data?.errors) document.getElementById('ref-eg-error').textContent = error.message || 'Kaydedilemedi';
        showNotification(error.message || 'Kaynak listesi kaydedilemedi', 'error');
        btn.disabled = false;
    } finally {
        state.saving = false;
    }
}

async function onWeldClick(btn) {
    const action = btn.dataset.weldAction;
    if (action === 'edit') {
        startWeldEdit();
    } else if (action === 'cancel') {
        if (!confirmDiscard()) return;
        weld.editing = false;
        weld.dirty = false;
        clearTimeout(weld.previewTimer);
        renderWeldView();
    } else if (action === 'save') {
        await saveWeldEdit(btn);
    } else if (action === 'add-row') {
        const last = weld.draft.joints[weld.draft.joints.length - 1];
        weld.draft.joints.push({
            joint_id: '', description: '', joint_type: 'plate_fillet', material: last?.material || 'carbon_steel', size: '',
            weld_detail: '', process: last?.process || 'MAG', position: '', count_per_unit: '1', length_m_each: '0',
            total_m_per_unit: null, preheat_c: null, ndt: '', evidence: 'Elle eklendi',
        });
        weld.dirty = true;
        weld.errors = {};
        renderWeldGrid();
        document.querySelector(`#ref-eg-rows tr[data-row="${weld.draft.joints.length - 1}"] [data-field="description"]`)?.focus();
        updateWeldTotals();
        schedulePreview();
    } else if (action === 'delete-row') {
        const i = Number(btn.closest('tr[data-row]')?.dataset.row);
        if (Number.isNaN(i)) return;
        weld.draft.joints.splice(i, 1);
        weld.dirty = true;
        weld.errors = {};   // keyed by row index: they no longer line up
        renderWeldGrid();
        updateWeldTotals();
        schedulePreview();
    } else if (action === 'version') {
        if (!confirmDiscard()) return;
        const body = document.getElementById('ref-weld-body');
        if (body) body.insertAdjacentHTML('afterbegin', '<div class="text-muted small mb-1"><i class="fas fa-spinner fa-spin me-1"></i>Sürüm yükleniyor…</div>');
        await loadWeldVersion(btn.dataset.version ? Number(btn.dataset.version) : null);
    }
}

const REVIEW_TEXT = {
    verified: {
        title: 'Doğrula', icon: 'fas fa-check', button: 'btn-success', label: 'Doğrula',
        hint: 'Kaynak listesi ve kayıtlı saatler kontrol edildi. Hesabı değiştirmez; doğrulanmış ve incelenmemiş referanslar aynı şekilde kullanılır.',
        placeholder: 'İsteğe bağlı not (ör. kaynak listesi pafta 3 ile karşılaştırıldı)',
    },
    excluded: {
        title: 'Hariç tut', icon: 'fas fa-ban', button: 'btn-danger', label: 'Hariç tut',
        hint: 'Bu iş hiçbir tahminde (iç imalat ve taşeron), aile faktör dağılımında ve hold-out kontrolünde kullanılmaz. Geri alınabilir.',
        placeholder: 'Neden? (zorunlu — ör. saatler üst iş emrine yazılmış, kaynak listesi eksik okunmuş)',
    },
    unreviewed: {
        title: 'İncelemeyi geri al', icon: 'fas fa-rotate-left', button: 'btn-secondary', label: 'Geri al',
        hint: 'Referans yeniden “İncelenmedi” olur ve (hariç tutulmuşsa) tahminlerde tekrar kullanılır.',
        placeholder: 'İsteğe bağlı not',
    },
};

function openReview(row, reviewStatus) {
    const t = REVIEW_TEXT[reviewStatus];
    resetModal(`${t.title}: ${row.job_no} — ${row.title || ''}`, t.icon);
    const current = REFERENCE_REVIEW[row.review_status] || REFERENCE_REVIEW.unreviewed;
    modal.addCustomSection({ customContent: `
        ${factsHtml(row)}
        <div class="ref-review-hint">${t.hint}</div>
        <div class="small mb-2">Şu anki durum: <span class="status-badge ${current.badge}">${current.label}</span>
            ${row.review_note ? ` — ${escapeHtml(row.review_note)}` : ''}${row.reviewed_by_name ? ` <span class="text-muted">(${escapeHtml(row.reviewed_by_name)})</span>` : ''}</div>
        <textarea class="form-control form-control-sm" id="ref-review-note" rows="3" placeholder="${escapeHtml(t.placeholder)}"></textarea>
        <div class="text-danger small mt-1" id="ref-review-error"></div>` });
    modal.render();
    modal.setFooterContent(`
        <button type="button" class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal">Vazgeç</button>
        <button type="button" class="btn btn-sm ${t.button}" data-ref-action="review-save" data-job-no="${escapeHtml(row.job_no)}" data-status="${reviewStatus}">
            <i class="${t.icon} me-1"></i>${t.label}
        </button>`);
    modal.show();
    setTimeout(() => document.getElementById('ref-review-note')?.focus(), 300);
}

async function onModalClick(event) {
    const weldBtn = event.target.closest('[data-weld-action]');
    if (weldBtn && weld) {
        await onWeldClick(weldBtn);
        return;
    }
    const btn = event.target.closest('[data-ref-action="review-save"]');
    if (!btn) return;
    const reviewStatus = btn.dataset.status;
    const note = (document.getElementById('ref-review-note')?.value || '').trim();
    const errorEl = document.getElementById('ref-review-error');
    if (reviewStatus === 'excluded' && !note) {
        if (errorEl) errorEl.textContent = 'Hariç tutmak için not gerekli.';
        return;
    }
    btn.disabled = true;
    try {
        const updated = await reviewReferenceProfile(btn.dataset.jobNo, reviewStatus, note);
        const i = rows.findIndex((r) => r.job_no === updated.job_no);
        if (i >= 0) rows[i] = updated;
        showRows();
        modal.hide();
        showNotification(`${updated.job_no}: ${REFERENCE_REVIEW[updated.review_status]?.label || updated.review_status}`, 'success');
        loadSummary();
    } catch (error) {
        if (errorEl) errorEl.textContent = error.data?.note?.[0] || error.message || 'Kaydedilemedi';
        btn.disabled = false;
    }
}

// ---------------------------------------------------------------- Birim süreler panel

async function toggleUnitsPanel() {
    const panel = document.getElementById('ref-units-panel');
    if (!panel.hidden) { panel.hidden = true; return; }
    panel.hidden = false;
    if (!units) {
        panel.innerHTML = '<div class="text-muted small"><i class="fas fa-spinner fa-spin me-1"></i>Parametreler yükleniyor…</div>';
        await loadUnits();
    }
}

async function loadUnits() {
    const panel = document.getElementById('ref-units-panel');
    try {
        units = await getEstimatorParameters();
        renderUnits();
    } catch (error) {
        panel.innerHTML = `<div class="text-danger small">${escapeHtml(error.message || 'Parametreler yüklenemedi')}</div>`;
    }
}

function inputValue(v) {
    return v == null ? '' : String(v).replace('.', ',');
}

function parseInput(text) {
    const t = String(text ?? '').trim().replace(',', '.');
    if (t === '' || !/^-?\d*\.?\d+$/.test(t)) return NaN;
    return Number(t);
}

function renderUnits(errors = {}) {
    const panel = document.getElementById('ref-units-panel');
    const groups = units.groups || {};
    const byGroup = {};
    (units.parameters || []).forEach((p) => { (byGroup[p.group] = byGroup[p.group] || []).push(p); });
    const groupHtml = Object.keys(groups).filter((g) => byGroup[g]).map((g) => `
        <div class="ref-units-group">
            <h6>${escapeHtml(groups[g])}</h6>
            <table class="ref-units-table"><tbody>
                ${byGroup[g].map((p) => `
                    <tr class="${p.is_default ? '' : 'is-custom'}" title="${escapeHtml([p.description, p.changed_by_name && `Son değişiklik: ${p.changed_by_name} · ${formatDateTime(p.changed_at)}`].filter(Boolean).join('\n'))}">
                        <td class="ref-units-label">${escapeHtml(p.label)}</td>
                        <td class="ref-units-unit">${escapeHtml(p.unit)}</td>
                        <td class="ref-units-default">varsayılan ${trimNum(p.default)}</td>
                        <td class="ref-units-input">
                            <input type="text" inputmode="decimal" class="form-control form-control-sm ${errors[p.key] ? 'is-invalid' : ''}"
                                   data-key="${p.key}" value="${escapeHtml(inputValue(p.value))}" aria-label="${escapeHtml(p.label)}">
                            ${errors[p.key] ? `<div class="invalid-feedback">${escapeHtml(errors[p.key])}</div>` : ''}
                        </td>
                        <td>${p.is_default ? '' : `<button type="button" class="btn btn-link btn-sm" data-units-action="default" data-key="${p.key}" title="Varsayılana dön">varsayılan</button>`}</td>
                    </tr>`).join('')}
            </tbody></table>
        </div>`).join('');
    const changes = units.changes || [];
    const log = changes.length ? `
        <details class="ref-units-log">
            <summary>Değişiklik geçmişi (${changes.length})</summary>
            <table><tbody>${changes.map((c) => `<tr><td>${formatDateTime(c.changed_at)}</td><td>${escapeHtml(c.changed_by_name || '')}</td>
                <td>${escapeHtml(c.label)}</td><td>${escapeHtml(inputValue(c.old_value) || 'varsayılan')} → <strong>${escapeHtml(inputValue(c.new_value))}</strong></td>
                <td class="text-muted">${escapeHtml(c.note || '')}</td></tr>`).join('')}</tbody></table>
        </details>` : '';
    panel.innerHTML = `
        <div class="ref-units-head">
            <h6><i class="fas fa-sliders me-1"></i>Birim süreler ve maliyet parametreleri</h6>
            <span class="small">Bir adedin hesaplanan saati bu sürelerle bulunur; değişiklik bütün faktörleri ve yeni tahminleri hemen etkiler. Hepsi aynı oranda değişirse tahmin değişmez.</span>
        </div>
        <div class="ref-units-groups">${groupHtml}</div>
        <div class="ref-units-foot">
            <input type="text" class="form-control form-control-sm" name="note" placeholder="Değişiklik notu (isteğe bağlı)">
            <button type="button" class="btn btn-sm btn-primary" data-units-action="save" ${unitsBusy ? 'disabled' : ''}><i class="fas fa-save me-1"></i>Kaydet</button>
            <button type="button" class="btn btn-sm btn-outline-secondary" data-units-action="reset">Değişiklikleri geri al</button>
            <span class="small text-muted" data-units-dirty></span>
        </div>
        ${log}`;
    updateDirty();
}

function changedValues() {
    const out = {};
    const invalid = {};
    document.querySelectorAll('#ref-units-panel input[data-key]').forEach((input) => {
        const p = (units.parameters || []).find((x) => x.key === input.dataset.key);
        if (!p) return;
        const v = parseInput(input.value);
        if (Number.isNaN(v)) { invalid[p.key] = 'Sayı olmalı.'; return; }
        if (Math.abs(v - Number(p.value)) > 1e-9) out[p.key] = v;
    });
    return { out, invalid };
}

function updateDirty() {
    const { out, invalid } = changedValues();
    document.querySelectorAll('#ref-units-panel input[data-key]').forEach((input) => {
        input.classList.toggle('is-changed', input.dataset.key in out);
    });
    const el = document.querySelector('#ref-units-panel [data-units-dirty]');
    const n = Object.keys(out).length;
    const bad = Object.keys(invalid).length;
    if (el) el.textContent = bad ? `${bad} geçersiz değer` : (n ? `${n} değişiklik kaydedilmedi` : '');
}

function onUnitsInput(event) {
    if (event.target.matches('input[data-key]')) updateDirty();
}

async function onUnitsClick(event) {
    const btn = event.target.closest('[data-units-action]');
    if (!btn) return;
    const action = btn.dataset.unitsAction;
    if (action === 'default') {
        const p = units.parameters.find((x) => x.key === btn.dataset.key);
        const input = document.querySelector(`#ref-units-panel input[data-key="${btn.dataset.key}"]`);
        if (p && input) { input.value = inputValue(p.default); updateDirty(); }
    } else if (action === 'reset') {
        renderUnits();
    } else if (action === 'save') {
        const { out, invalid } = changedValues();
        if (Object.keys(invalid).length) { renderUnitsKeepingInputs(invalid); return; }
        if (!Object.keys(out).length) { showNotification('Değişiklik yok', 'info'); return; }
        const note = document.querySelector('#ref-units-panel input[name="note"]')?.value || '';
        unitsBusy = true;
        btn.disabled = true;
        try {
            const result = await updateEstimatorParameters(out, note);
            units = result;
            renderUnits();
            methodStale = true;
            showNotification(`${(result.changed || []).length} parametre kaydedildi; faktörler yeniden hesaplandı.`, 'success');
            await Promise.all([loadRows(), loadSummary()]);
        } catch (error) {
            if (error.data?.errors) renderUnitsKeepingInputs(error.data.errors);
            showNotification(error.message || 'Parametreler kaydedilemedi', 'error');
        } finally {
            unitsBusy = false;
            const save = document.querySelector('#ref-units-panel [data-units-action="save"]');
            if (save) save.disabled = false;
        }
    }
}

function renderUnitsKeepingInputs(errors) {
    const typed = {};
    document.querySelectorAll('#ref-units-panel input[data-key]').forEach((i) => { typed[i.dataset.key] = i.value; });
    const note = document.querySelector('#ref-units-panel input[name="note"]')?.value || '';
    renderUnits(errors);
    document.querySelectorAll('#ref-units-panel input[data-key]').forEach((i) => { if (i.dataset.key in typed) i.value = typed[i.dataset.key]; });
    const noteEl = document.querySelector('#ref-units-panel input[name="note"]');
    if (noteEl) noteEl.value = note;
    updateDirty();
}

// ---------------------------------------------------------------- helpers

function trimNum(value) {
    return value == null ? '—' : Number(value).toLocaleString('tr-TR', { maximumFractionDigits: 4 });
}

function formatDateTime(value) {
    if (!value) return '';
    return new Date(value).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
