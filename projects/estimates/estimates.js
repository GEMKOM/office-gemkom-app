/**
 * /projects/estimates/ — every Tahmin raporu (job orders and offers) for the
 * estimating engineer: filter by customer / status / review, open one in
 * a modal with the full card (components/estimate-report).
 *
 * Page permission: `access_projects_estimates` (users/0066), granted with
 * `view_estimates`; the API refuses everyone else with 403 anyway.
 */
import { guardRoute } from '../../authService.js';
import { initNavbar } from '../../components/navbar.js';
import { HeaderComponent } from '../../components/header/header.js';
import { StatisticsCards } from '../../components/statistics-cards/statistics-cards.js';
import { FiltersComponent } from '../../components/filters/filters.js';
import { TableComponent } from '../../components/table/table.js';
import { DisplayModal } from '../../components/display-modal/display-modal.js';
import { initRouteProtection } from '../../apis/routeProtection.js';
import { showNotification } from '../../components/notification/notification.js';
import { listCustomers } from '../../apis/projects/customers.js';
import { ESTIMATE_STATUS, REVIEW_LABELS, listEstimates } from '../../apis/estimator.js';
import { fmt, mountEstimateReport } from '../../components/estimate-report/estimate-report.js';

let table = null;
let filters = null;
let stats = null;
let detailModal = null;
let detailHandle = null;
let rows = [];

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) return;
    if (!initRouteProtection()) return;
    await initNavbar();

    new HeaderComponent({
        title: 'Tahminler',
        subtitle: 'Çizimlerden üretilen maliyet ve risk raporları — iş emirleri ve teklifler',
        icon: 'calculator',
        showBackButton: 'block',
        showRefreshButton: 'block',
        refreshButtonText: 'Yenile',
        onBackClick: () => { window.location.href = '/projects'; },
        onRefreshClick: () => loadRows(),
    });

    initStats();
    initFilters();
    initTable();
    initModal();
    await loadRows();

    const id = new URLSearchParams(window.location.search).get('report');
    if (id) openReport(parseInt(id, 10));
});

function initStats() {
    stats = new StatisticsCards('statistics-cards-container', {
        cards: [
            { title: 'Rapor', value: '0', icon: 'fas fa-file-lines', color: 'primary' },
            { title: 'Çalışıyor / sırada', value: '0', icon: 'fas fa-hourglass-half', color: 'info' },
            { title: 'İncelenmemiş', value: '0', icon: 'fas fa-eye', color: 'secondary' },
            { title: 'Model maliyeti (USD)', value: '0', icon: 'fas fa-dollar-sign', color: 'success' },
        ],
    });
}

function initFilters() {
    filters = new FiltersComponent('filters-placeholder', {
        title: 'Filtreler',
        onApply: () => loadRows(),
        onClear: () => loadRows(),
    });
    filters.addTextFilter({ id: 'q-filter', label: 'Arama', placeholder: 'İş emri, teklif no, başlık…', colSize: 3 });
    filters.addDropdownFilter({
        id: 'customer-filter',
        label: 'Müşteri',
        options: [],
        placeholder: 'Müşteri ara (en az 3 karakter)',
        colSize: 3,
        searchable: true,
        minSearchLength: 3,
        remoteSearchPlaceholder: 'En az 3 karakter yazın',
        remoteSearch: async (term) => {
            if (!term || term.length < 3) return [];
            const res = await listCustomers({ search: term.trim(), is_active: true, page_size: 50 });
            return (res.results || []).map((c) => ({ value: String(c.id), text: c.name || c.code || `#${c.id}` }));
        },
    });
    filters.addDropdownFilter({
        id: 'status-filter',
        label: 'Durum',
        multiple: true,
        options: Object.entries(ESTIMATE_STATUS).map(([value, s]) => ({ value, label: s.label })),
        placeholder: 'Tümü',
        colSize: 2,
    });
    filters.addDropdownFilter({
        id: 'reviewed-filter',
        label: 'İnceleme',
        options: [{ value: '0', label: 'İncelenmemiş' }, { value: '1', label: 'İncelenmiş' }],
        placeholder: 'Tümü',
        colSize: 2,
    });
    filters.addDropdownFilter({
        id: 'kind-filter',
        label: 'Konu',
        options: [{ value: 'job', label: 'İş emri' }, { value: 'offer', label: 'Teklif' }],
        placeholder: 'Tümü',
        colSize: 2,
    });
}

function initTable() {
    table = new TableComponent('estimates-table-container', {
        columns: [
            { field: 'subject_key', label: 'İş / Teklif', sortable: true, width: '120px',
              formatter: (v, row) => `<strong>${escape(v)}</strong> <span class="est-report-version">v${row.version}</span>` },
            { field: 'title', label: 'Başlık', sortable: true, formatter: (v) => escape(v || '') },
            { field: 'customer', label: 'Müşteri', sortable: true, formatter: (v) => escape(v || '') },
            { field: 'status', label: 'Durum', sortable: true, width: '110px', formatter: (v) => {
                const s = ESTIMATE_STATUS[v] || { label: v, badge: 'status-grey' };
                return `<span class="status-badge ${s.badge}">${s.label}</span>`;
            } },
            { field: 'in_house', label: 'İç imalat €', sortable: true, type: 'number', cellClass: 'est-num', headerClass: 'est-num',
              exportType: 'money', formatter: (v) => (v == null ? '—' : fmt(v, 0)) },
            { field: 'subcontract', label: 'Taşeron €', sortable: true, type: 'number', cellClass: 'est-num', headerClass: 'est-num',
              exportType: 'money', formatter: (v) => (v == null ? '—' : fmt(v, 0)) },
            { field: 'eur_kg', label: '€/kg', sortable: true, type: 'number', cellClass: 'est-num', headerClass: 'est-num',
              exportType: 'number', formatter: (v) => (v == null ? '—' : fmt(v, 2)) },
            { field: 'suggested_price_eur', label: 'Önerilen fiyat €', sortable: true, type: 'number', cellClass: 'est-num', headerClass: 'est-num',
              exportType: 'money', formatter: (v) => (v == null ? '—' : fmt(v, 0)) },
            { field: 'review_decision', label: 'İnceleme', sortable: true, width: '120px', formatter: (v, row) => {
                const r = REVIEW_LABELS[v || ''] || REVIEW_LABELS[''];
                return `<span class="status-badge ${r.badge}" title="${escape(row.reviewed_by_name || '')}">${r.label}</span>`;
            } },
            { field: 'usage_usd', label: 'USD', sortable: true, type: 'number', cellClass: 'est-num', headerClass: 'est-num',
              exportType: 'number', formatter: (v) => fmt(Number(v || 0), 2) },
            { field: 'created_at', label: 'Oluşturma', sortable: true, type: 'date', width: '130px', exportType: 'date',
              formatter: (v, row) => `${formatDateTime(v)}${row.created_by_name ? `<div class="small text-muted">${escape(row.created_by_name)}</div>` : ''}` },
        ],
        data: [],
        sortable: true,
        pagination: true,
        itemsPerPage: 20,
        exportable: true,
        exportFilename: 'tahminler',
        emptyMessage: 'Filtreye uyan tahmin yok',
        onRowClick: (row) => openReport(row.id),
    });
}

function initModal() {
    detailModal = new DisplayModal('estimate-detail-modal-container', {
        title: 'Tahmin raporu',
        icon: 'fas fa-calculator',
        size: 'xl',
        fullscreen: true,
        showEditButton: false,
        backdropStatic: true,
    });
    detailModal.onCloseCallback(() => {
        detailHandle?.destroy();
        detailHandle = null;
        const url = new URL(window.location.href);
        url.searchParams.delete('report');
        window.history.replaceState({}, '', url);
        loadRows();   // a review or a new version changes the row
    });
}

async function loadRows() {
    const f = filters.getFilterValues();
    const kind = f['kind-filter'];
    table.setLoading(true);
    try {
        const data = await listEstimates({
            q: f['q-filter'],
            customer: f['customer-filter'],
            status: Array.isArray(f['status-filter']) ? f['status-filter'].join(',') : f['status-filter'],
            reviewed: f['reviewed-filter'],
            limit: 500,
        });
        rows = (data.results || [])
            .filter((r) => !kind || r.subject_kind === kind)
            .map((r) => ({
                ...r,
                in_house: r.expected_total_eur?.in_house ?? null,
                subcontract: r.expected_total_eur?.subcontract ?? null,
                eur_kg: r.eur_per_kg?.in_house ?? r.eur_per_kg?.subcontract ?? null,
            }));
        table.updateData(rows);
        updateStats(rows);
    } catch (error) {
        console.error('Tahminler yüklenemedi:', error);
        showNotification(error.message || 'Tahminler yüklenemedi', 'error');
        table.updateData([]);
    } finally {
        table.setLoading(false);
    }
}

function updateStats(list) {
    const open = list.filter((r) => r.status === 'queued' || r.status === 'running').length;
    const unreviewed = list.filter((r) => r.status === 'done' && !r.review_decision).length;
    const usd = list.reduce((s, r) => s + Number(r.usage_usd || 0), 0);
    // StatisticsCards.updateValues is keyed by card index.
    stats?.updateValues({ 0: String(list.length), 1: String(open), 2: String(unreviewed), 3: fmt(usd, 2) });
}

function openReport(id) {
    if (!id) return;
    const row = rows.find((r) => r.id === id);
    detailModal.clearData?.();
    detailModal.setTitle(row ? `${row.subject_key} · v${row.version}${row.title ? ` — ${row.title}` : ''}` : 'Tahmin raporu');
    detailModal.addCustomSection({ customContent: `<div id="estimate-detail-card"></div>` });
    detailModal.render();
    detailModal.show();
    const url = new URL(window.location.href);
    url.searchParams.set('report', String(id));
    window.history.replaceState({}, '', url);
    detailHandle?.destroy();
    const host = document.getElementById('estimate-detail-card');
    detailHandle = mountEstimateReport(host, { reportId: id });
}

function escape(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatDateTime(value) {
    if (!value) return '';
    return new Date(value).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
