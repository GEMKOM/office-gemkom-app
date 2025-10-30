import { guardRoute } from '../../../../authService.js';
import { initNavbar } from '../../../../components/navbar.js';
import { HeaderComponent } from '../../../../components/header/header.js';
import { StatisticsCards } from '../../../../components/statistics-cards/statistics-cards.js';
import { FiltersComponent } from '../../../../components/filters/filters.js';
import { TableComponent } from '../../../../components/table/table.js';
import { fetchMachineFaultsSummaryReport } from '../../../../apis/maintenance/reports.js';

let headerComponent, statisticsCards, filtersComponent, tableComponent;
let allRows = [];
let totalItems = 0;
let currentPage = 1;
let itemsPerPage = 20;
let currentFilters = {};

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) return;
    await initNavbar();
    initializeComponents();
    await loadReport();
});

function initializeComponents() {
    headerComponent = new HeaderComponent({
        title: 'Arızalar Özeti',
        subtitle: 'Makine bazında arıza özeti ve toplam duruş süresi',
        icon: 'chart-bar',
        showBackButton: 'block',
        backUrl: '/manufacturing/maintenance/reports'
    });

    statisticsCards = new StatisticsCards('statistics-container', {
        cards: [
            { title: 'Makine Sayısı', value: 0, icon: 'cogs', color: 'primary', trend: null },
            { title: 'Toplam Arıza', value: 0, icon: 'exclamation-triangle', color: 'danger', trend: null },
            { title: 'Duruşlu Arıza', value: 0, icon: 'stop-circle', color: 'warning', trend: null },
            { title: 'Toplam Duruş', value: '0s', icon: 'clock', color: 'info', trend: null }
        ]
    });

    filtersComponent = new FiltersComponent('filters-container', {
        title: 'Filtreler',
        onApply: applyFilters,
        onClear: clearFilters
    });

    // Simple filters: search by makine adı/kodu, date shortcuts (optional)
    filtersComponent
        .addTextFilter({ id: 'search', label: 'Ara (Ad/Kod)', placeholder: 'Makine adı veya kodu', colSize: 3 })
        .addSelectFilter({
            id: 'dateRange',
            label: 'Tarih',
            options: [
                { value: '', label: 'Tümü' },
                { value: 'today', label: 'Bugün' },
                { value: 'week', label: 'Bu Hafta' },
                { value: 'month', label: 'Bu Ay' }
            ],
            colSize: 2
        });

    tableComponent = new TableComponent('table-container', {
        title: 'Arızalar Özeti',
        columns: [
            { 
                field: 'name', 
                label: 'Makine', 
                sortable: true, 
                formatter: (v, row) => `
                    <div class="d-flex align-items-center">
                        <i class="fas fa-cog text-muted me-2"></i>
                        <span class="fw-semibold">${row.name || '-'}</span>
                    </div>
                ` 
            },
            { 
                field: 'total_faults', 
                label: 'Toplam Arıza', 
                sortable: true,
                formatter: (val) => `
                    <div>
                        <span class="badge bg-light text-dark border">${Number(val ?? 0)}</span>
                    </div>
                `
            },
            { 
                field: 'breaking_faults_count', 
                label: 'Duruşlu Arıza', 
                sortable: true,
                formatter: (val) => `
                    <div>
                        <span class="badge bg-light text-dark border">${Number(val ?? 0)}</span>
                    </div>
                `
            },
            { 
                field: 'total_breaking_downtime_seconds', 
                label: 'Toplam Duruş', 
                sortable: true, 
                formatter: (val) => `
                    <div>
                        <i class="fas fa-clock text-muted me-2"></i>
                        <span class="fw-semibold">${formatDuration(val)}</span>
                    </div>
                ` 
            },
            { 
                field: 'total_non_breaking_duration_seconds', 
                label: 'Duruş Harici Arıza Süresi', 
                sortable: true, 
                formatter: (val) => `
                    <div>
                        <i class="fas fa-clock text-muted me-2"></i>
                        <span class="fw-semibold">${formatDuration(val)}</span>
                    </div>
                ` 
            },
            { 
                field: 'total_downtime_seconds', 
                label: 'Toplam Arıza Süresi', 
                sortable: true, 
                formatter: (val, row) => {
                    const sumSeconds = Number(row?.total_breaking_downtime_seconds || 0) + Number(row?.total_non_breaking_duration_seconds || 0);
                    return `
                        <div>
                            <i class="fas fa-clock text-muted me-2"></i>
                            <span class="fw-semibold">${formatDuration(sumSeconds)}</span>
                        </div>
                    `;
                }
            }
        ],
        pagination: true,
        serverSidePagination: true,
        itemsPerPage: itemsPerPage,
        currentPage: currentPage,
        totalItems: totalItems,
        refreshable: true,
        exportable: true,
        onRefresh: loadReport,
        onPageChange: (page) => { currentPage = page; loadReport(); },
        onPageSizeChange: (size) => { itemsPerPage = size; currentPage = 1; loadReport(); },
        emptyMessage: 'Kayıt bulunamadı',
        emptyIcon: 'fas fa-exclamation-triangle',
        skeleton: true,
        loading: true
    });
}

async function loadReport() {
    try {
        tableComponent.setLoading(true);

        const filters = buildApiFilters();
        const response = await fetchMachineFaultsSummaryReport(filters);

        if (response && response.results) {
            allRows = response.results;
            totalItems = response.count || response.results.length;
        } else if (Array.isArray(response)) {
            allRows = response;
            totalItems = response.length;
        } else {
            allRows = [];
            totalItems = 0;
        }

        updateStatistics();
        tableComponent.updateData(allRows, totalItems, currentPage);
    } catch (err) {
        console.error('Error loading report:', err);
        allRows = [];
        totalItems = 0;
        tableComponent.updateData(allRows, totalItems, currentPage);
    } finally {
        tableComponent.setLoading(false);
    }
}

function buildApiFilters() {
    const apiFilters = { page: currentPage, page_size: itemsPerPage, ...currentFilters };

    // Map dateRange shortcuts to backend params if needed (example using reported_at)
    if (apiFilters.dateRange) {
        const today = new Date();
        if (apiFilters.dateRange === 'today') {
            apiFilters.reported_at__date = today.toISOString().split('T')[0];
        } else if (apiFilters.dateRange === 'week') {
            const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
            apiFilters.reported_at__gte = weekAgo.toISOString().split('T')[0];
        } else if (apiFilters.dateRange === 'month') {
            const monthAgo = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
            apiFilters.reported_at__gte = monthAgo.toISOString().split('T')[0];
        }
        delete apiFilters.dateRange;
    }

    return apiFilters;
}

function applyFilters() {
    const values = filtersComponent.getFilterValues();
    currentFilters = {};

    if (values.search && values.search.trim() !== '') {
        currentFilters.search = values.search.trim();
    }
    if (values.dateRange) {
        currentFilters.dateRange = values.dateRange;
    }

    currentPage = 1;
    loadReport();
}

function clearFilters() {
    filtersComponent.clearFilters();
    currentFilters = {};
    currentPage = 1;
    loadReport();
}

function updateStatistics() {
    const machinesCount = allRows.length;
    const totalFaults = allRows.reduce((sum, r) => sum + (Number(r.total_faults) || 0), 0);
    const breakingCount = allRows.reduce((sum, r) => sum + (Number(r.breaking_faults_count) || 0), 0);
    const totalDowntime = allRows.reduce((sum, r) => sum + (Number(r.total_downtime_seconds) || 0), 0);

    statisticsCards.updateValues({
        0: machinesCount,
        1: totalFaults,
        2: breakingCount,
        3: formatDuration(totalDowntime)
    });
}

function formatDuration(totalSeconds) {
    const seconds = Math.floor(Number(totalSeconds) || 0);
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const parts = [];
    if (d) parts.push(`${d}g`);
    if (h) parts.push(`${h}s`);
    if (m || parts.length === 0) parts.push(`${m}d`);
    return parts.join(' ');
}


