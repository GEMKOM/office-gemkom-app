import { guardRoute } from '../../../../authService.js';
import { initNavbar } from '../../../../components/navbar.js';
import { fetchSubcontractorsOverview } from '../../../../apis/subcontracting/subcontractors.js';
import { HeaderComponent } from '../../../../components/header/header.js';
import { FiltersComponent } from '../../../../components/filters/filters.js';
import { StatisticsCards } from '../../../../components/statistics-cards/statistics-cards.js';
import { TableComponent } from '../../../../components/table/table.js';
import { initRouteProtection } from '../../../../apis/routeProtection.js';
import { showNotification } from '../../../../components/notification/notification.js';

// Header component instance
let headerComponent;

// Statistics Cards component instance
let overviewStats = null;

// Filters component instance
let overviewFilters = null;

// Table component instance
let overviewTable = null;

// State management
let overviewData = []; // Raw API response (per subcontractor)
let tableRows = [];    // Flattened rows (per job order) for the table
let isLoading = false;

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    // Initialize route protection
    if (!initRouteProtection()) {
        return;
    }

    await initNavbar();

    // Initialize header component
    initHeaderComponent();

    // Initialize Statistics Cards component
    initStatisticsCards();

    // Initialize filters and table
    initializeFiltersComponent();
    initializeTableComponent();

    await loadOverviewData();
});

// Initialize header component
function initHeaderComponent() {
    headerComponent = new HeaderComponent({
        title: 'Taşeron Genel Bakış',
        subtitle: 'Taşeron bazında toplam kazanç ve bir sonraki hakediş görünümü',
        icon: 'chart-line',
        showBackButton: 'block',
        showCreateButton: 'none',
        showRefreshButton: 'block',
        refreshButtonText: 'Yenile',
        onBackClick: () => window.location.href = '/manufacturing/',
        onRefreshClick: async () => {
            await loadOverviewData();
        }
    });
}

function initStatisticsCards() {
    overviewStats = new StatisticsCards('overview-statistics', {
        cards: [
            { title: 'Toplam Taşeron', value: '0', icon: 'fas fa-building', color: 'primary', id: 'overview-total-subcontractors' },
            { title: 'Toplam Sözleşme Tutarı', value: '0', icon: 'fas fa-file-contract', color: 'success', id: 'overview-total-contract' },
            { title: 'Bekleyen Hakediş (Sonraki Fatura)', value: '0', icon: 'fas fa-hourglass-half', color: 'warning', id: 'overview-next-bill' }
        ],
        compact: true,
        animation: true
    });
}

function initializeFiltersComponent() {
    overviewFilters = new FiltersComponent('filters-placeholder', {
        title: 'Genel Bakış Filtreleri',
        onApply: () => {
            loadOverviewData();
        },
        onClear: () => {
            loadOverviewData();
        }
    });

    overviewFilters.addTextFilter({
        id: 'name-filter',
        label: 'Taşeron',
        placeholder: 'Taşeron adı / kısa ad / yetkili ara...',
        colSize: 4
    });

    overviewFilters.addDropdownFilter({
        id: 'is-active-filter',
        label: 'Durum',
        options: [
            { value: '', label: 'Tümü' },
            { value: 'true', label: 'Aktif' },
            { value: 'false', label: 'Pasif' }
        ],
        placeholder: 'Tümü',
        colSize: 3
    });
}

function initializeTableComponent() {
    overviewTable = new TableComponent('overview-table-container', {
        title: 'Taşeron Genel Bakış',
        columns: [
            {
                field: '_expand',
                label: '',
                sortable: false,
                width: '50px',
                formatter: () => ''
            },
            {
                field: 'subcontractor_name',
                label: 'Taşeron',
                sortable: true,
                formatter: (value, row) => {
                    const display = row.subcontractor_short_name || value;
                    return `<strong>${display || '-'}</strong>`;
                }
            },
            {
                field: 'job_no',
                label: 'İş Emri',
                sortable: true,
                formatter: (value, row) => {
                    const title = row.job_title ? `<br><small class="text-muted">${row.job_title}</small>` : '';
                    return `<strong>${value || '-'}</strong>${title}`;
                }
            },
            {
                field: 'customer_name',
                label: 'Müşteri',
                sortable: true,
                formatter: (value) => value || '-'
            },
            {
                field: 'job_status',
                label: 'İş Emri Durumu',
                sortable: true,
                formatter: (value) => {
                    if (value === 'completed') {
                        return '<span class="status-badge status-green">Tamamlandı</span>';
                    }
                    if (value === 'active') {
                        return '<span class="status-badge status-blue">Aktif</span>';
                    }
                    if (value === 'cancelled') {
                        return '<span class="status-badge status-red">İptal</span>';
                    }
                    return '<span class="text-muted">-</span>';
                }
            },
            {
                field: 'currency',
                label: 'Para Birimi',
                sortable: true,
                formatter: (value) => value || '-'
            },
            {
                field: 'job_allocated_weight_kg',
                label: 'İş Emri Kg',
                sortable: true,
                type: 'number',
                formatter: (value) => {
                    if (!value) return '-';
                    return `${formatNumber(value)} kg`;
                }
            },
            {
                field: 'job_price_per_kg',
                label: 'Birim Fiyat (₺/kg)',
                sortable: true,
                type: 'number',
                formatter: (value, row) => {
                    const total = row.job_total_cost ?? row.job_next_bill_cost ?? row.job_total_billed_cost;
                    const kg = row.job_allocated_weight_kg;
                    const pricePerKg = calculatePricePerKg(total, kg);
                    if (pricePerKg === null) return '-';
                    return `${formatNumber(pricePerKg)} ${row.currency || 'TRY'}/kg`;
                }
            },
            {
                field: 'job_total_billed_cost',
                label: 'Faturalanan Tutar',
                sortable: true,
                type: 'number',
                formatter: (value, row) => {
                    if (!value) return '-';
                    return formatAmount(value, row.currency || 'TRY');
                }
            },
            {
                field: 'job_next_bill_cost',
                label: 'Sonraki Fatura',
                sortable: true,
                type: 'number',
                formatter: (value, row) => {
                    if (!value) return '-';
                    return formatAmount(value, row.currency || 'TRY');
                }
            },
            {
                field: 'job_unbilled_remaining_cost',
                label: 'Kalan (Henüz Yapılmadı)',
                sortable: true,
                type: 'number',
                formatter: (value, row) => {
                    if (!value) return '-';
                    return formatAmount(value, row.currency || 'TRY');
                }
            },
            {
                field: 'job_total_cost',
                label: 'İş Emri Toplam',
                sortable: true,
                type: 'number',
                formatter: (value, row) => {
                    if (!value) return '-';
                    return formatAmount(value, row.currency || 'TRY');
                }
            },
            {
                field: 'job_price_per_kg',
                label: 'Birim Fiyat (₺/kg)',
                sortable: true,
                type: 'number',
                formatter: (value, row) => {
                    const total = row.job_total_cost ?? row.job_next_bill_cost ?? row.job_total_billed_cost;
                    const kg = row.job_allocated_weight_kg;
                    const pricePerKg = calculatePricePerKg(total, kg);
                    if (pricePerKg === null) return '-';
                    return `${formatNumber(pricePerKg)} ${row.currency || 'TRY'}/kg`;
                }
            }
        ],
        data: [],
        sortable: true,
        pagination: false,
        refreshable: true,
        exportable: true,
        onRefresh: async () => {
            await loadOverviewData();
        },
        onExport: async () => {
            // Use built-in exportData via TableComponent when no custom export format is needed
            overviewTable.exportData('excel');
        },
        emptyMessage: 'Genel bakış verisi bulunamadı',
        emptyIcon: 'fas fa-chart-line',
        // Grouping: one collapsible group per subcontractor
        groupBy: 'subcontractor_name',
        groupCollapsible: true,
        defaultGroupExpanded: false,
        groupHeaderFormatter: (groupValue, groupRows) => {
            const first = groupRows[0] || {};
            const totalContract = first.total_cost || 0;
            const totalBilled = first.total_billed_cost || 0;
            const nextBill = first.next_bill_cost || 0;
            const remaining = first.unbilled_remaining_cost || 0;
            const currency = first.default_currency || 'TRY';

            return `
                <div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center w-100">
                    <div class="mb-2 mb-md-0">
                        <strong>${groupValue || '-'}</strong>
                        ${first.subcontractor_short_name ? `<span class="text-muted"> (${first.subcontractor_short_name})</span>` : ''}
                    </div>
                    <div class="text-md-end">
                        <div class="small text-muted">Toplam Sözleşme</div>
                        <div class="fw-semibold">${formatAmount(totalContract, currency)}</div>
                        <div class="small text-muted mt-1">Faturalanan</div>
                        <div class="fw-semibold text-success">${formatAmount(totalBilled, currency)}</div>
                        <div class="small text-muted mt-1">Sonraki Fatura</div>
                        <div class="fw-semibold text-warning">${formatAmount(nextBill, currency)}</div>
                        <div class="small text-muted mt-1">Kalan (Henüz Yapılmadı)</div>
                        <div class="fw-semibold text-danger">${formatAmount(remaining, currency)}</div>
                    </div>
                </div>
            `;
        }
    });
}

async function loadOverviewData() {
    try {
        if (isLoading) return;

        isLoading = true;
        if (overviewTable) {
            overviewTable.setLoading(true);
        }

        const filterValues = overviewFilters ? overviewFilters.getFilterValues() : {};

        const filters = {};
        if (filterValues['name-filter']) {
            filters.search = filterValues['name-filter'];
        }
        if (filterValues['is-active-filter']) {
            filters.is_active = filterValues['is-active-filter'] === 'true';
        }

        // Default ordering by name
        filters.ordering = 'name';

        const response = await fetchSubcontractorsOverview(filters);
        overviewData = Array.isArray(response) ? response : (response.results || []);

        // Build flattened table rows: one per job order
        tableRows = buildTableRows(overviewData);

        if (overviewTable) {
            overviewTable.updateData(tableRows, tableRows.length, 1);
        }

        updateStatisticsCards();
    } catch (error) {
        console.error('Error loading subcontractor overview:', error);
        showNotification(error.message || 'Taşeron genel bakış verileri yüklenirken hata oluştu', 'error');
        overviewData = [];
        tableRows = [];
        if (overviewTable) {
            overviewTable.updateData([], 0, 1);
        }
        if (overviewStats) {
            overviewStats.updateValues({
                0: '0',
                1: '0',
                2: '0'
            });
        }
    } finally {
        isLoading = false;
        if (overviewTable) {
            overviewTable.setLoading(false);
        }
    }
}

function updateStatisticsCards() {
    if (!overviewStats) return;

    const totalSubcontractors = overviewData.length;

    let totalContract = 0;
    let totalNextBill = 0;

    overviewData.forEach(item => {
        const contractVal = parseFloat(item.total_cost || 0);
        const nextBillVal = parseFloat(item.next_bill_cost || 0);
        if (!isNaN(contractVal)) totalContract += contractVal;
        if (!isNaN(nextBillVal)) totalNextBill += nextBillVal;
    });

    overviewStats.updateValues({
        0: totalSubcontractors.toString(),
        1: formatAmount(totalContract, 'TRY'),
        2: formatAmount(totalNextBill, 'TRY')
    });
}

function buildTableRows(subcontractors) {
    const rows = [];

    subcontractors.forEach(sub => {
        const jobs = Array.isArray(sub.job_orders) ? sub.job_orders : [];

        if (jobs.length === 0) {
            // Subcontractor without job orders – still show a single placeholder row
            rows.push({
                subcontractor_id: sub.id,
                subcontractor_name: sub.name,
                subcontractor_short_name: sub.short_name,
                contact_person: sub.contact_person,
                phone: sub.phone,
                email: sub.email,
                default_currency: sub.default_currency || 'TRY',
                allocated_weight_kg: sub.allocated_weight_kg,
                total_billed_cost: sub.total_billed_cost,
                next_bill_cost: sub.next_bill_cost,
                unbilled_remaining_cost: sub.unbilled_remaining_cost,
                total_cost: sub.total_cost,
                job_no: null,
                job_title: null,
                customer_name: null,
                job_status: null,
                currency: sub.default_currency || 'TRY',
                job_allocated_weight_kg: null,
                job_total_billed_cost: null,
                job_next_bill_cost: null,
                job_unbilled_remaining_cost: null,
                job_total_cost: null,
                is_active: sub.is_active
            });
            return;
        }

        jobs.forEach(job => {
            rows.push({
                subcontractor_id: sub.id,
                subcontractor_name: sub.name,
                subcontractor_short_name: sub.short_name,
                contact_person: sub.contact_person,
                phone: sub.phone,
                email: sub.email,
                default_currency: sub.default_currency || job.currency || 'TRY',
                allocated_weight_kg: sub.allocated_weight_kg,
                total_billed_cost: sub.total_billed_cost,
                next_bill_cost: sub.next_bill_cost,
                unbilled_remaining_cost: sub.unbilled_remaining_cost,
                total_cost: sub.total_cost,
                job_no: job.job_no,
                job_title: job.job_title,
                customer_name: job.customer_name || null,
                job_status: job.job_status,
                currency: job.currency || sub.default_currency || 'TRY',
                job_allocated_weight_kg: job.allocated_weight_kg,
                job_total_billed_cost: job.total_billed_cost,
                job_next_bill_cost: job.next_bill_cost,
                job_unbilled_remaining_cost: job.unbilled_remaining_cost,
                job_total_cost: job.total_cost,
                is_active: sub.is_active
            });
        });
    });

    return rows;
}

function formatNumber(value) {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (!num && num !== 0) return '-';
    return new Intl.NumberFormat('tr-TR', {
        style: 'decimal',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(num);
}

function calculatePricePerKg(total, kg) {
    const totalNum = typeof total === 'string' ? parseFloat(total) : total;
    const kgNum = typeof kg === 'string' ? parseFloat(kg) : kg;

    if (totalNum === null || totalNum === undefined || kgNum === null || kgNum === undefined) {
        return null;
    }
    if (isNaN(totalNum) || isNaN(kgNum) || kgNum === 0) {
        return null;
    }

    return totalNum / kgNum;
}

function formatAmount(amount, currency) {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (!num && num !== 0) return '-';

    const formatted = new Intl.NumberFormat('tr-TR', {
        style: 'decimal',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(num);

    return `${formatted} ${currency || 'TRY'}`;
}

