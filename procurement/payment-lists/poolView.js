/**
 * Ödeme Havuzu: every unpaid instalment of a live purchase order, rendered with
 * the columns of the old Excel. Also provides the shared column definitions,
 * the pool-table factory and the cross-page selection helpers reused by the
 * "Havuzdan Ekle" picker and the list detail.
 */
import { FiltersComponent } from '../../components/filters/filters.js';
import { TableComponent } from '../../components/table/table.js';
import { showNotification } from '../../components/notification/notification.js';
import { extractResultsFromResponse } from '../../apis/paginationHelper.js';
import { escapeHtml } from '../../utils/text.js';
import { getPaymentPool, getPaymentPoolFacets } from '../../apis/procurement/paymentLists.js';
import {
    BASIS_OPTIONS, CURRENCY_OPTIONS, LIST_STATUS_CLASS, badge, currencyBreakdown, customersOf,
    fmtDate, fmtEur, fmtMoney, fmtPct, isOverdue, jobNosOf, rowEur, sumEur,
} from './format.js';

export const rowKey = (row) => String(row.schedule_id);

// ---------------------------------------------------------------------------
// shared columns (Excel: MÜŞTERİ | İŞ NO | MALZEME | TEDARİKÇİ | TOPLAM | ...)
// ---------------------------------------------------------------------------

export function excelColumns({ withListed = true } = {}) {
    const columns = [
        {
            field: 'customers', label: 'Müşteri', width: '130px', sortable: false,
            formatter: (_v, row) => escapeHtml(customersOf(row).join(', ')) || '<span class="text-muted">-</span>',
        },
        {
            field: 'job_nos', label: 'İş No', width: '110px', sortable: false,
            formatter: (_v, row) => jobNosOf(row).map((j) => badge('status-grey', j)).join(' ') || '<span class="text-muted">-</span>',
        },
        {
            field: 'gs_numbers', label: 'GS No', width: '100px', sortable: false,
            formatter: (v) => (v || []).map((gs) => badge('status-blue', gs)).join(' ') || '<span class="text-muted">-</span>',
        },
        {
            field: 'items_summary', label: 'Malzeme', sortable: false,
            formatter: (v, row) => {
                const pr = row.pr?.request_number
                    ? `<a href="/procurement/purchase-requests/registry/?talep=${encodeURIComponent(row.pr.request_number)}" target="_blank" rel="noopener">${escapeHtml(row.pr.request_number)}</a>`
                    : '';
                return `${escapeHtml(v || '-')}<div class="pl-sub">${row.line_count || 0} kalem${pr ? ' · ' + pr : ''}</div>`;
            },
        },
        {
            field: 'supplier.name', label: 'Tedarikçi', width: '150px', sortable: false,
            formatter: (v, row) => `${escapeHtml(v || '-')}${row.supplier?.has_dbs ? ' ' + badge('status-purple', 'DBS') : ''}`,
        },
        {
            field: 'po.gross_total', label: 'PO Toplam (KDV dahil)', width: '140px', cellClass: 'pl-money', sortable: false,
            formatter: (v, row) => `${fmtMoney(v, row.po?.currency)}<div class="pl-sub">PO-${row.po?.id ?? '-'}</div>`,
        },
        {
            field: 'gross_amount', label: 'Bu Ödeme', width: '140px', cellClass: 'pl-money', sortable: false,
            formatter: (v, row) => {
                const main = fmtMoney(v, row.currency);
                const eur = row.currency !== 'EUR' ? `<div class="pl-sub">≈ ${fmtEur(rowEur(row))}</div>` : '';
                return main + eur;
            },
        },
        {
            field: 'eur', label: 'EUR', width: '110px', cellClass: 'pl-money', sortable: false,
            formatter: (_v, row) => fmtEur(rowEur(row)),
        },
        {
            field: 'terms', label: 'Ödeme Şekli', width: '160px', sortable: false,
            formatter: (_v, row) => {
                const head = `${row.schedule_sequence ?? row.sequence ?? ''}/${row.schedule_count ?? ''} ${row.label || row.basis_label || ''}`.trim();
                const sub = [row.terms?.name || row.basis_label || '', fmtPct(row.percentage)].filter(Boolean).join(' · ');
                return `${escapeHtml(head)}<div class="pl-sub">${escapeHtml(sub)}</div>`;
            },
        },
        {
            field: 'po.created_at', label: 'Sipariş Tarihi', width: '100px', sortable: false,
            formatter: (v) => fmtDate(v),
        },
        {
            field: 'due_date', label: 'Vade', width: '100px', sortable: false,
            formatter: (v, row) => (isOverdue(v, row.is_paid) ? `<span class="text-danger">${fmtDate(v)}</span>` : fmtDate(v)),
        },
        {
            field: 'po.proforma_count', label: 'Proforma', width: '90px', sortable: false,
            formatter: (v) => (v > 0 ? badge('status-green', `${v} dosya`) : badge('status-orange', 'Yok')),
        },
    ];
    if (withListed) {
        columns.push({
            field: 'open_list', label: 'Listede', width: '150px', sortable: false,
            formatter: (v) => (v
                ? `<a href="?list=${v.id}" class="status-badge ${LIST_STATUS_CLASS[v.status] || 'status-grey'}" style="min-width:auto" title="${escapeHtml(v.status_label || '')}">${escapeHtml(v.title)}</a>`
                : '<span class="text-muted">—</span>'),
        });
    }
    return columns;
}

// ---------------------------------------------------------------------------
// filters
// ---------------------------------------------------------------------------

// job no / GS / supplier options: values that actually occur in the pool,
// fetched once per page load and shared by the pool and the picker
let facetsPromise = null;
function loadFacets() {
    if (!facetsPromise) {
        facetsPromise = getPaymentPoolFacets().catch((error) => {
            facetsPromise = null;
            throw error;
        });
    }
    return facetsPromise;
}

const toOptions = (rows) => (rows || []).map((r) => ({ value: String(r.value), label: r.label }));

/** Multi-select values travel as one comma-separated param. */
const csv = (value) => {
    const list = (Array.isArray(value) ? value : [value]).filter((x) => x !== '' && x !== null && x !== undefined);
    return list.length ? list.join(',') : undefined;
};

export function buildPoolFilters(containerId, prefix, { onApply, onClear, onFilterChange, forceHideListed = false } = {}) {
    const filters = new FiltersComponent(containerId, { title: 'Filtreler', onApply, onClear, onFilterChange, wrap: true });
    filters
        .addSelectFilter({
            id: `${prefix}_basis`, label: 'Ödeme Şekli', options: BASIS_OPTIONS,
            value: 'immediate', placeholder: 'Peşin / Avans (varsayılan)', colSize: 2,
        })
        .addSelectFilter({ id: `${prefix}_currency`, label: 'Para Birimi', options: CURRENCY_OPTIONS, placeholder: 'Tümü', colSize: 1 })
        .addTextFilter({ id: `${prefix}_q`, label: 'Ara', placeholder: 'Tedarikçi, iş no, malzeme, PR / GS no…', colSize: forceHideListed ? 6 : 4 })
        .addDateRangeFilter({ id: `${prefix}_po_date`, label: 'Sipariş Tarihi', colSize: 3 });
    if (!forceHideListed) {
        filters.addCheckboxFilter({ id: `${prefix}_hide_listed`, label: 'Listede olanları gizle', checked: true, colSize: 2 });
    }
    filters
        .addDropdownFilter({ id: `${prefix}_job_no`, label: 'İş No', options: [], multiple: true, placeholder: 'Tümü', colSize: 3 })
        .addDropdownFilter({ id: `${prefix}_gs`, label: 'GS No', options: [], multiple: true, placeholder: 'Tümü', colSize: 3 })
        .addDropdownFilter({ id: `${prefix}_supplier`, label: 'Tedarikçi', options: [], multiple: true, placeholder: 'Tümü', colSize: 4 });
    loadFacets()
        .then((facets) => {
            filters.updateFilterOptions(`${prefix}_job_no`, toOptions(facets.job_nos));
            filters.updateFilterOptions(`${prefix}_gs`, toOptions(facets.gs_numbers));
            filters.updateFilterOptions(`${prefix}_supplier`, toOptions(facets.suppliers));
        })
        .catch((error) => showNotification(error.message || 'Filtre seçenekleri yüklenemedi', 'error'));
    return filters;
}

export function poolParams(filters, prefix, { page, pageSize, forceHideListed = false }) {
    const v = filters.getFilterValues();
    const range = v[`${prefix}_po_date`] || {};
    const hideListed = forceHideListed ? true : v[`${prefix}_hide_listed`] === true;
    return {
        basis: v[`${prefix}_basis`] || undefined,
        currency: v[`${prefix}_currency`] || undefined,
        q: (v[`${prefix}_q`] || '').trim() || undefined,
        job_no: csv(v[`${prefix}_job_no`]),
        gs: csv(v[`${prefix}_gs`]),
        supplier: csv(v[`${prefix}_supplier`]),
        created_after: range.start || undefined,
        created_before: range.end || undefined,
        listed: hideListed ? 'false' : undefined,
        page,
        page_size: pageSize,
    };
}

// ---------------------------------------------------------------------------
// table + selection helpers
// ---------------------------------------------------------------------------

export function createPoolTable(containerId, {
    picker = false, actions = [], onSelectionChange = null, onPageChange = null, onPageSizeChange = null,
    exportFilename = null, itemsPerPage = 50,
} = {}) {
    return new TableComponent(containerId, {
        showHeader: !picker,
        title: 'Ödeme Havuzu',
        icon: 'fas fa-water',
        columns: excelColumns({ withListed: true }),
        data: [],
        sortable: false,
        selectable: true,
        isRowSelectable: picker ? (row) => !row.open_list : null,
        onSelectionChange,
        actions,
        pagination: true,
        itemsPerPage,
        serverSidePagination: true,
        onPageChange,
        onPageSizeChange,
        exportable: !picker,
        exportFilename,
        stickyHeader: true,
        small: true,
        emptyMessage: 'Havuzda bekleyen taksit yok.',
        emptyIcon: 'fas fa-circle-check',
    });
}

/** Seed the table's internal selection with rows of the incoming page so the
 *  component renders them checked (updateData prunes keys not on the page). */
export function applyPage(table, selection, rows, total, page) {
    rows.forEach((r) => {
        const k = String(r.key);
        if (selection.has(k)) {
            table.selectedKeys.add(k);
            table.selectedRowsData.set(k, r);
        }
    });
    table.options.loading = false;
    table.updateData(rows, total, page);
}

/** Mirror the current page's checkbox state into the page-level Map. */
export function reconcileSelection(table, selection) {
    (table.options.data || []).forEach((r) => {
        const k = String(r.key);
        if (table.selectedKeys.has(k)) selection.set(k, r);
        else selection.delete(k);
    });
}

export async function fetchPoolPage(params) {
    const response = await getPaymentPool(params);
    const rows = extractResultsFromResponse(response).map((r) => ({ ...r, key: rowKey(r) }));
    const total = typeof response?.count === 'number' ? response.count : rows.length;
    return { rows, total };
}

// ---------------------------------------------------------------------------
// the view
// ---------------------------------------------------------------------------

export function createPoolView(ctx) {
    const PREFIX = 'pl_pool';
    const selection = ctx.state.pool.selection;
    let filters = null;
    let table = null;
    let page = 1;
    let pageSize = 50;
    let loading = false;

    const root = () => document.getElementById('pl-view-pool');

    function init() {
        if (table) return;
        filters = buildPoolFilters('pl-pool-filters', PREFIX, {
            onApply: () => { page = 1; load(); },
            onClear: () => { page = 1; load(); },
            onFilterChange: (filterId) => {
                if (filterId === `${PREFIX}_hide_listed`) { page = 1; load(); }
            },
        });
        table = createPoolTable('pl-pool-table', {
            actions: rowActions(),
            onSelectionChange: () => { reconcileSelection(table, selection); renderBulkBar(); },
            onPageChange: (p) => { page = p; load(); },
            onPageSizeChange: (size) => { pageSize = size; page = 1; load(); },
            exportFilename: () => `odeme_havuzu_${new Date().toISOString().slice(0, 10)}.xlsx`,
            itemsPerPage: pageSize,
        });
    }

    function rowActions() {
        return [
            {
                key: 'paid', label: 'Ödendi İşaretle', icon: 'fas fa-check', class: 'btn-outline-success',
                visible: (row) => !row.is_paid,
                onClick: (row) => ctx.modals.openMarkPaid({ row, mode: 'pool', onDone: load }),
            },
            {
                key: 'proforma', label: 'Proforma', icon: 'fas fa-paperclip', class: 'btn-outline-secondary',
                onClick: (row) => ctx.modals.openProforma({ row, onDone: load }),
            },
            {
                type: 'dropdown', key: 'more', icon: 'fas fa-ellipsis-v', label: 'Diğer',
                subActions: [
                    { key: 'split', label: 'Böl (taksitlendir)', icon: 'fas fa-scissors', onClick: (row) => ctx.modals.openSplit({ row, onDone: load }) },
                    { key: 'po', label: 'Sipariş detayı', icon: 'fas fa-external-link-alt', onClick: (row) => window.open(`/finance/purchase-orders/?order=${row.po.id}`, '_blank', 'noopener') },
                ],
            },
        ];
    }

    async function load() {
        if (!table || loading) return;
        loading = true;
        table.setLoading(true);
        try {
            const params = poolParams(filters, PREFIX, { page, pageSize });
            const { rows, total } = await fetchPoolPage(params);
            applyPage(table, selection, rows, total, page);
            renderBulkBar();
        } catch (error) {
            console.error('pool load failed', error);
            table.options.loading = false;
            table.updateData([], 0, 1);
            showNotification(error.message || 'Ödeme havuzu yüklenemedi', 'error');
        } finally {
            loading = false;
        }
    }

    function clearSelection() {
        selection.clear();
        if (table) table.clearSelection();
        renderBulkBar();
    }

    function renderBulkBar() {
        const bar = document.getElementById('pl-pool-bulk-bar');
        if (!bar) return;
        const rows = [...selection.values()];
        if (!rows.length) {
            bar.classList.add('d-none');
            bar.innerHTML = '';
            return;
        }
        bar.classList.remove('d-none');
        bar.innerHTML = `
            <span class="me-auto">
                <strong>${rows.length}</strong> kalem seçildi · toplam <strong>${fmtEur(sumEur(rows))}</strong>
                <span class="pl-sub">(${escapeHtml(currencyBreakdown(rows))})</span>
            </span>
            <button type="button" class="btn btn-sm btn-primary" id="pl-pool-add-to-list">
                <i class="fas fa-list-check me-1"></i>Listeye Ekle
            </button>
            <button type="button" class="btn btn-sm btn-success" id="pl-pool-bulk-paid">
                <i class="fas fa-check-double me-1"></i>Ödendi İşaretle (toplu)
            </button>
            <button type="button" class="btn btn-sm btn-outline-secondary" id="pl-pool-clear">
                <i class="fas fa-times me-1"></i>Seçimi Temizle
            </button>
        `;
        bar.querySelector('#pl-pool-add-to-list').addEventListener('click', () => {
            ctx.modals.openAddToList({ rows: [...selection.values()], onDone: () => { clearSelection(); load(); } });
        });
        bar.querySelector('#pl-pool-bulk-paid').addEventListener('click', () => {
            ctx.modals.openBulkPaid({ rows: [...selection.values()], onDone: () => { clearSelection(); load(); } });
        });
        bar.querySelector('#pl-pool-clear').addEventListener('click', clearSelection);
    }

    return {
        show() {
            init();
            root().classList.remove('d-none');
            load();
        },
        hide() {
            root().classList.add('d-none');
        },
        load,
    };
}
