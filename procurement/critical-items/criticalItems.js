import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
import { TableComponent } from '../../../components/table/table.js';
import { initRouteProtection } from '../../../apis/routeProtection.js';
import { getPlanningItems } from '../../../apis/planning/planningRequestItems.js';
import { extractResultsFromResponse } from '../../../apis/paginationHelper.js';
import { showNotification } from '../../../components/notification/notification.js';

// Undelivered rows are the whole point of this page, so the list is filtered to
// them by default; this checkbox opens it up to the delivered ones too.
const SHOW_DELIVERED_FILTER_ID = 'show_delivered';

// State
let currentPage = 1;
let currentPageSize = 20;
let currentOrdering = '-id';
let isLoading = false;

/** @type {import('../../../components/table/table.js').TableComponent | null} */
let table = null;
let filtersComponent = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) return;
    if (!initRouteProtection()) return;

    await initNavbar();

    new HeaderComponent({
        title: 'Kritik Malzemeler',
        subtitle: 'İmalatı tutan kalemler — hepsi teslim edilmeden Üretim öngörüsü başlamaz',
        icon: 'circle-exclamation',
        showBackButton: 'block',
        showCreateButton: 'none',
        showRefreshButton: 'block',
        onRefreshClick: () => {
            currentPage = 1;
            loadItems();
        },
        backUrl: '/procurement/'
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

function renderDate(value) {
    if (!value) return '-';
    return new Date(value).toLocaleDateString('tr-TR');
}

function initFilters() {
    filtersComponent = new FiltersComponent('critical-filters-placeholder', {
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
        },
        // The delivered toggle reloads on its own — a checkbox that waits for
        // the Uygula button reads as broken.
        onFilterChange: (filterId) => {
            if (filterId !== SHOW_DELIVERED_FILTER_ID) return;
            currentPage = 1;
            loadItems();
        }
    });

    filtersComponent
        .addTextFilter({ id: 'job_no', label: 'İş No', placeholder: 'İş no...', colSize: 3 })
        .addTextFilter({ id: 'item_code', label: 'Ürün Kodu', placeholder: 'Ürün kodu...', colSize: 3 })
        .addTextFilter({ id: 'item_name', label: 'Ürün Adı', placeholder: 'Ürün adı...', colSize: 3 })
        .addTextFilter({ id: 'planning_request_number', label: 'Planlama Talebi', placeholder: 'Talep numarası...', colSize: 3 })
        .addCheckboxFilter({
            id: SHOW_DELIVERED_FILTER_ID,
            label: 'Teslim Edilenleri de Göster',
            checked: false,
            colSize: 3
        });
}

function initTable() {
    table = new TableComponent('critical-items-table-container', {
        title: 'Teslim Edilmemiş Kritik Kalemler',
        icon: 'fas fa-circle-exclamation',
        exportable: true,
        exportFilename: () => `kritik_malzemeler_${new Date().toISOString().slice(0, 10)}.xlsx`,
        columns: [
            {
                // Display-only: the flag is toggled in Malzeme Takibi or the
                // Satın Alma Detayı modal, never from this monitoring list.
                field: 'is_critical', label: 'Kritik', sortable: false,
                formatter: () => `<span class="status-badge status-red" style="min-width: auto;"
                    title="İmalat bu kalem teslim edilmeden devam edemez">Kritik</span>`
            },
            { field: 'item_code', label: 'Ürün Kodu', sortable: true, formatter: (v) => v || '-' },
            { field: 'item_name', label: 'Ürün Adı', sortable: true, formatter: (v) => v || '-' },
            { field: 'planning_request_number', label: 'Planlama Talebi', sortable: false, formatter: (v) => renderRequestNumberBadge(v) },
            { field: 'job_no', label: 'İş No', sortable: true, formatter: (v) => renderJobNoBadge(v) },
            { field: 'quantity_to_purchase', label: 'Satın Alınacak', sortable: false, formatter: (v) => (v ?? '-') },
            { field: 'item_unit', label: 'Birim', sortable: false, formatter: (v) => v || '-' },
            { field: 'is_delivered', label: 'Teslim', type: 'boolean', sortable: false, formatter: (v) => renderBoolIcon(v) },
            { field: 'purchase_request_number', label: 'Satın Alma PR No', sortable: false, formatter: (v) => renderPurchaseRequestNumberBadge(v) },
            { field: 'critical_marked_by_username', label: 'İşaretleyen', sortable: false, formatter: (v) => v || '-' },
            { field: 'critical_marked_at', label: 'İşaretlenme', sortable: false, formatter: (v) => renderDate(v) }
        ],
        // Undelivered rows carry the light-red tint — those are the ones
        // actually holding manufacturing right now.
        rowBackgroundColor: (row) => row.is_delivered ? null : '#fdeaea',
        pagination: true,
        itemsPerPage: currentPageSize,
        serverSidePagination: true,
        refreshable: true,
        onRefresh: () => loadItems(),
        onSort: (field, direction) => {
            const orderable = new Set(['id', 'job_no', 'item_code', 'item_name']);
            if (!orderable.has(field)) return;
            currentOrdering = `${direction === 'desc' ? '-' : ''}${field}`;
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
        emptyMessage: 'Teslim edilmemiş kritik kalem yok.',
        emptyIcon: 'fas fa-circle-check'
    });
}

async function loadItems() {
    if (isLoading || !table || !filtersComponent) return;
    const values = filtersComponent.getFilterValues();
    const showDelivered = values[SHOW_DELIVERED_FILTER_ID] === true;

    // Set on the options before the loading render so the card header never
    // flashes the previous scope's title.
    table.options.title = showDelivered ? 'Kritik Kalemler' : 'Teslim Edilmemiş Kritik Kalemler';
    table.options.emptyMessage = showDelivered
        ? 'Kritik işaretli kalem yok.'
        : 'Teslim edilmemiş kritik kalem yok.';

    try {
        isLoading = true;
        table.setLoading(true);

        const filters = {
            is_critical: 'true',
            is_delivered: showDelivered ? undefined : 'false',
            job_no: values.job_no || undefined,
            item_code: values.item_code || undefined,
            item_name: values.item_name || undefined,
            planning_request_number: values.planning_request_number || undefined,
            include_price: false,
            ordering: currentOrdering,
            page: currentPage,
            page_size: currentPageSize
        };

        const response = await getPlanningItems(filters);
        const results = extractResultsFromResponse(response);
        const total = typeof response?.count === 'number' ? response.count : results.length;

        table.updateData(results, total, currentPage);
    } catch (error) {
        console.error('Error loading critical items:', error);
        table.updateData([], 0, 1);
        showNotification(error?.message || 'Kritik kalemler yüklenirken hata oluştu', 'danger');
    } finally {
        isLoading = false;
        table.setLoading(false);
    }
}
