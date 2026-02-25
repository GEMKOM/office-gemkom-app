import { initNavbar } from '../../components/navbar.js';
import { HeaderComponent } from '../../components/header/header.js';
import { FiltersComponent } from '../../components/filters/filters.js';
import { TableComponent } from '../../components/table/table.js';
import { initRouteProtection } from '../../apis/routeProtection.js';
import { getCostTable } from '../../apis/projects/cost.js';
import { listCustomers } from '../../apis/projects/customers.js';

const STATUS_OPTIONS = [
    { value: '', label: 'Tümü' },
    { value: 'draft', label: 'Taslak' },
    { value: 'active', label: 'Aktif' },
    { value: 'on_hold', label: 'Beklemede' },
    { value: 'completed', label: 'Tamamlandı' },
    { value: 'cancelled', label: 'İptal Edildi' }
];

let currentPage = 1;
let pageSize = 50;
let currentOrdering = 'job_no';
let costTable = null;
let filtersComponent = null;

function formatMoney(value) {
    if (value == null || value === '') return '<span class="text-muted">-</span>';
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (Number.isNaN(num)) return '<span class="text-muted">-</span>';
    return `€${num.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPct(value) {
    if (value == null || value === '') return '<span class="text-muted">-</span>';
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (Number.isNaN(num)) return '<span class="text-muted">-</span>';
    return `${num.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function formatDate(value) {
    if (value == null || value === '') return '<span class="text-muted">-</span>';
    try {
        const d = new Date(value);
        return d.toLocaleDateString('tr-TR');
    } catch {
        return '<span class="text-muted">-</span>';
    }
}

function statusBadge(status) {
    const map = {
        draft: 'secondary',
        active: 'success',
        on_hold: 'warning',
        completed: 'primary',
        cancelled: 'danger'
    };
    const labels = {
        draft: 'Taslak',
        active: 'Aktif',
        on_hold: 'Beklemede',
        completed: 'Tamamlandı',
        cancelled: 'İptal Edildi'
    };
    const c = map[status] || 'secondary';
    const label = labels[status] || status || '-';
    return `<span class="badge bg-${c}">${label}</span>`;
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!initRouteProtection()) return;
    await initNavbar();

    const header = new HeaderComponent({
        title: 'Maliyet Tablosu',
        subtitle: 'Tüm iş emirlerinin maliyet özeti: işçilik, malzeme, taşeron, boya, kalite, sevkiyat ve toplam maliyet.',
        icon: 'fas fa-calculator',
        showBackButton: 'block',
        backUrl: '/projects',
        showCreateButton: 'none',
        showRefreshButton: 'block',
        onRefreshClick: () => loadData()
    });

    filtersComponent = new FiltersComponent('filters-placeholder', {
        title: 'Filtreler',
        onApply: () => {
            currentPage = 1;
            loadData();
        },
        onClear: () => {
            currentPage = 1;
            loadData();
        }
    });
    filtersComponent.addSelectFilter({
        id: 'status',
        label: 'Durum',
        options: STATUS_OPTIONS,
        placeholder: 'Tümü',
        colSize: 2
    });
    filtersComponent.addTextFilter({
        id: 'search',
        label: 'Ara (iş no / başlık)',
        placeholder: 'Örn: pump',
        colSize: 3
    });

    // Customer: remote search via GET /projects/customers/?search=...&is_active=true, results after 3 characters
    filtersComponent.addDropdownFilter({
        id: 'customer',
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
            const list = res.results || [];
            return list.map(c => ({ value: String(c.id), text: c.name || c.code || `#${c.id}` }));
        }
    });

    costTable = new TableComponent('cost-table-container', {
        title: 'Maliyet Tablosu',
        icon: 'fas fa-calculator',
        iconColor: 'text-primary',
        columns: [
            { field: 'job_no', label: 'İş No', sortable: true, width: '7rem', formatter: v => v ? `<a href="/projects/project-tracking/?job_no=${encodeURIComponent(v)}" class="fw-bold text-primary text-decoration-none text-nowrap">${v}</a>` : '-' },
            { field: 'title', label: 'Başlık', sortable: false, formatter: v => (v || '-') },
            { field: 'customer_name', label: 'Müşteri', sortable: false, formatter: v => (v || '-') },
            { field: 'status', label: 'Durum', sortable: true, formatter: v => statusBadge(v) },
            { field: 'labor_cost', label: 'İşçilik', sortable: true, formatter: formatMoney },
            { field: 'material_cost', label: 'Malzeme', sortable: true, formatter: formatMoney },
            { field: 'subcontractor_cost', label: 'Taşeron', sortable: true, formatter: formatMoney },
            { field: 'paint_cost', label: 'Boya', sortable: true, formatter: formatMoney },
            { field: 'qc_cost', label: 'KK', sortable: true, formatter: formatMoney },
            { field: 'shipping_cost', label: 'Sevkiyat', sortable: true, formatter: formatMoney },
            { field: 'actual_total_cost', label: 'Toplam Maliyet', sortable: true, formatter: v => `<span class="fw-bold">${formatMoney(v)}</span>` },
            { field: 'estimated_cost', label: 'Tahmini', sortable: true, formatter: formatMoney },
            { field: 'selling_price', label: 'Satış Fiyatı', sortable: true, formatter: (v, row) => (v != null && v !== '' ? formatMoney(v) + (row.selling_price_currency ? ` <small class="text-muted">${row.selling_price_currency}</small>` : '') : '<span class="text-muted">-</span>') },
            { field: 'margin_eur', label: 'Marj (€)', sortable: true, formatter: v => (v != null && v !== '' ? formatMoney(v) : '<span class="text-muted">-</span>') },
            { field: 'margin_pct', label: 'Marj %', sortable: true, formatter: v => (v != null && v !== '' ? formatPct(v) : '<span class="text-muted">-</span>') },
            { field: 'last_updated', label: 'Son Güncelleme', sortable: false, formatter: formatDate }
        ],
        data: [],
        pagination: true,
        serverSidePagination: true,
        totalItems: 0,
        currentPage: 1,
        itemsPerPage: pageSize,
        onSort: (field, direction) => {
            currentOrdering = direction === 'asc' ? field : `-${field}`;
            currentPage = 1;
            loadData();
        },
        onPageChange: (page) => {
            currentPage = page;
            loadData();
        },
        onPageSizeChange: (newSize) => {
            pageSize = newSize;
            currentPage = 1;
            loadData();
        },
        emptyMessage: 'Kayıt bulunamadı.',
        loading: true,
        skeleton: true,
        refreshable: true,
        onRefresh: () => loadData(),
        exportable: true,
        exportFileName: 'maliyet-tablosu'
    });

    await loadData();
});

async function loadData() {
    const filters = filtersComponent ? filtersComponent.getFilterValues() : {};
    const status = filters.status;
    const status__in = filters.status__in || '';
    const search = filters.search || '';
    const customer = filters.customer || '';

    costTable.setLoading(true);
    try {
        const res = await getCostTable({
            status: status || undefined,
            status__in: status__in || undefined,
            search: search || undefined,
            customer: customer ? parseInt(customer, 10) : undefined,
            ordering: currentOrdering,
            page: currentPage,
            page_size: pageSize
        });

        const results = res.results || [];
        const count = res.count ?? 0;

        costTable.updateData(results, count, currentPage);
        costTable.options.itemsPerPage = pageSize;
    } catch (err) {
        console.error('Cost table load error:', err);
        costTable.updateData([], 0, 1);
    } finally {
        costTable.setLoading(false);
    }
}
