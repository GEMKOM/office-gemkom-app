import { guardRoute } from '../../authService.js';
import { initNavbar } from '../../components/navbar.js';
import { HeaderComponent } from '../../components/header/header.js';
import { FiltersComponent } from '../../components/filters/filters.js';
import { TableComponent } from '../../components/table/table.js';
import { initRouteProtection } from '../../apis/routeProtection.js';
import { getPlanningItems } from '../../apis/planning/planningRequestItems.js';
import { extractResultsFromResponse } from '../../apis/paginationHelper.js';
import { showNotification } from '../../components/notification/notification.js';

// State
let currentPage = 1;
let currentPageSize = 20;
let currentOrdering = '-id';
let isLoading = false;

/** @type {import('../../components/table/table.js').TableComponent | null} */
let table = null;
let filtersComponent = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) return;
    if (!initRouteProtection()) return;

    await initNavbar();

    new HeaderComponent({
        title: 'Planlama Kalemleri',
        subtitle: 'Planlama taleplerindeki ürün/kalem listesini filtreleyin ve takip edin',
        icon: 'list',
        showBackButton: 'block',
        showCreateButton: 'none',
        showRefreshButton: 'block',
        onRefreshClick: () => {
            currentPage = 1;
            loadItems();
        },
        backUrl: '/planning/'
    });

    initFilters();
    initTable();

    await loadItems();
});

function renderBoolIcon(value) {
    if (value === true) return '<i class="fas fa-check text-success" title="Evet"></i>';
    if (value === false) return '<i class="fas fa-times text-danger" title="Hayır"></i>';
    return '-';
}

function renderRequestNumberBadge(value) {
    if (!value) return '-';
    return `<span class="status-badge status-blue" style="min-width: auto;">${value}</span>`;
}

function renderJobNoBadge(value) {
    if (!value) return '-';
    return `<span class="status-badge status-grey" style="min-width: auto;">${value}</span>`;
}

function renderPurchaseRequestNumberBadge(value) {
    if (!value) return '-';
    return `<span class="status-badge status-green" style="min-width: auto;">${value}</span>`;
}

function renderEuro(value) {
    if (value === null || value === undefined || value === '') return '-';
    const num = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(num)) return '-';
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'EUR' }).format(num);
}

function initFilters() {
    filtersComponent = new FiltersComponent('items-filters-placeholder', {
        title: 'Filtreler',
        onApply: () => {
            currentPage = 1;
            loadItems();
        },
        onClear: () => {
            currentPage = 1;
            currentOrdering = '-id';
            loadItems();
            showNotification('Filtreler temizlendi', 'info');
        }
    });

    filtersComponent
        .addTextFilter({ id: 'search', label: 'Arama', placeholder: 'Ürün kodu veya adı...', colSize: 3 })
        .addTextFilter({ id: 'planning_request', label: 'Planlama Talep ID', placeholder: 'örn. 5', type: 'number', colSize: 2 })
        .addTextFilter({ id: 'planning_request_number', label: 'Talep No', placeholder: 'Talep numarası...', colSize: 2 })
        .addDropdownFilter({
            id: 'planning_request_status',
            label: 'Talep Durumu',
            options: [
                { value: '', label: 'Tümü' },
                { value: 'draft', label: 'Taslak' },
                { value: 'ready', label: 'Satın Almaya Hazır' },
                { value: 'converted', label: 'Onaya Gönderildi' },
                { value: 'completed', label: 'Tamamlandı' },
                { value: 'cancelled', label: 'İptal' }
            ],
            placeholder: 'Tümü',
            colSize: 2
        })
        .addTextFilter({ id: 'job_no', label: 'İş No', placeholder: 'İş no...', colSize: 2 })
        .addTextFilter({ id: 'item_code', label: 'Ürün Kodu', placeholder: 'Ürün kodu...', colSize: 2 })
        .addTextFilter({ id: 'item_name', label: 'Ürün Adı', placeholder: 'Ürün adı...', colSize: 2 })
        .addDropdownFilter({
            id: 'is_delivered',
            label: 'Teslim',
            options: [
                { value: '', label: 'Tümü' },
                { value: 'true', label: 'Teslim Edildi' },
                { value: 'false', label: 'Teslim Edilmedi' }
            ],
            placeholder: 'Tümü',
            colSize: 2
        })
        .addDropdownFilter({
            id: 'from_inventory',
            label: 'Stoktan Karşılandı',
            options: [
                { value: '', label: 'Tümü' },
                { value: 'true', label: 'Evet (stok ayrıldı)' },
                { value: 'false', label: 'Hayır (stok ayrılmadı)' }
            ],
            placeholder: 'Tümü',
            colSize: 2
        })
        .addDropdownFilter({
            id: 'is_available',
            label: 'Kalan (Satın Alma)',
            options: [
                { value: '', label: 'Tümü' },
                { value: 'true', label: 'Var' },
                { value: 'false', label: 'Yok' }
            ],
            placeholder: 'Tümü',
            colSize: 2
        })
        .addDropdownFilter({
            id: 'ordering',
            label: 'Sıralama',
            options: [
                { value: '-id', label: 'Yeni → Eski' },
                { value: 'order', label: 'Sıra (Artan)' },
                { value: 'job_no', label: 'İş No (A→Z)' }
            ],
            placeholder: 'Yeni → Eski',
            colSize: 2
        });
}

function initTable() {
    table = new TableComponent('planning-items-table-container', {
        title: 'Kalemler',
        icon: 'fas fa-list',
        columns: [
            { field: 'id', label: 'ID', sortable: true, formatter: (v) => v ?? '-' },
            { field: 'item_code', label: 'Ürün Kodu', sortable: false, formatter: (v) => v || '-' },
            { field: 'item_name', label: 'Ürün Adı', sortable: false, formatter: (v) => v || '-' },
            { field: 'planning_request_number', label: 'Talep No', sortable: false, formatter: (v) => renderRequestNumberBadge(v) },
            { field: 'job_no', label: 'İş No', sortable: true, formatter: (v) => renderJobNoBadge(v) },
            { field: 'quantity', label: 'Miktar', sortable: false, formatter: (v) => (v ?? '-') },
            { field: 'quantity_from_inventory', label: 'Stoktan', sortable: false, formatter: (v) => (v ?? '-') },
            { field: 'quantity_to_purchase', label: 'Satın Alınacak', sortable: false, formatter: (v) => (v ?? '-') },
            { field: 'item_unit', label: 'Birim', sortable: false, formatter: (v) => v || '-' },
            { field: 'latest_unit_price_eur', label: 'Son Birim Fiyat (€)', sortable: false, formatter: (v) => renderEuro(v) },
            { field: 'is_delivered', label: 'Teslim', sortable: false, formatter: (v) => renderBoolIcon(v) },
            { field: 'purchase_request_number', label: 'Satın Alma PR No', sortable: false, formatter: (v) => renderPurchaseRequestNumberBadge(v) }
        ],
        pagination: true,
        itemsPerPage: currentPageSize,
        serverSidePagination: true,
        refreshable: true,
        onRefresh: () => loadItems(),
        onSort: (field, direction) => {
            // Backend supports: -id, order, job_no
            if (field === 'id') currentOrdering = '-id';
            if (field === 'job_no') currentOrdering = 'job_no';
            currentPage = 1;
            loadItems();
        },
        onPageChange: (page) => {
            currentPage = page;
            loadItems();
        },
        onPageSizeChange: (pageSize) => {
            currentPageSize = pageSize;
            currentPage = 1;
            loadItems();
        },
        emptyMessage: 'Kalem bulunamadı.',
        emptyIcon: 'fas fa-inbox'
    });
}

async function loadItems() {
    if (isLoading || !table || !filtersComponent) return;
    try {
        isLoading = true;
        table.setLoading(true);

        const values = filtersComponent.getFilterValues();
        const orderingFromFilter = values.ordering ?? '';

        const filters = {
            search: values.search || undefined,
            item_code: values.item_code || undefined,
            item_name: values.item_name || undefined,
            planning_request: values.planning_request || undefined,
            planning_request_number: values.planning_request_number || undefined,
            planning_request_status: values.planning_request_status || undefined,
            job_no: values.job_no || undefined,
            is_delivered: values.is_delivered || undefined,
            from_inventory: values.from_inventory || undefined,
            is_available: values.is_available || undefined,
            ordering: orderingFromFilter || currentOrdering,
            page: currentPage,
            page_size: currentPageSize
        };

        const response = await getPlanningItems(filters);
        const results = extractResultsFromResponse(response);
        const total = typeof response?.count === 'number' ? response.count : results.length;

        table.updateData(results, total, currentPage);
    } catch (error) {
        console.error('Error loading planning items:', error);
        table.updateData([], 0, 1);
        showNotification(error?.message || 'Kalemler yüklenirken hata oluştu', 'danger');
    } finally {
        isLoading = false;
        table.setLoading(false);
    }
}

