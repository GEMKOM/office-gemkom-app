import { initNavbar } from '../../../../components/navbar.js';
import { TableComponent } from '../../../../components/table/table.js';
import { HeaderComponent } from '../../../../components/header/header.js';
import { FiltersComponent } from '../../../../components/filters/filters.js';
import { StatisticsCards } from '../../../../components/statistics-cards/statistics-cards.js';
import { DisplayModal } from '../../../../components/display-modal/display-modal.js';
import { getCombinedJobCosts } from '../../../../apis/planning/reports.js';

// State management
let currentPage = 1;
let currentSortField = 'combined_total_cost';
let currentSortDirection = 'desc';
let jobCostsData = [];
let totalJobs = 0;
let isLoading = false;
let pageSize = 20;
let filtersComponent = null;

// Header component instance
let headerComponent;

// Statistics Cards component instance
let combinedJobCostsStats = null;

// Table component instance
let jobCostsTable = null;

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    await initNavbar();
    
    // Initialize header component
    initHeaderComponent();
    
    // Initialize Statistics Cards component
    combinedJobCostsStats = new StatisticsCards('combined-job-costs-statistics', {
        cards: [
            { title: 'En Pahalı İş', value: '-', icon: 'fas fa-euro-sign', color: 'danger', id: 'most-expensive-job' },
            { title: 'En Pahalı Saat Başı', value: '-', icon: 'fas fa-clock', color: 'warning', id: 'most-expensive-per-hour' },
            { title: 'En Çok Mesai Maliyeti', value: '-', icon: 'fas fa-calendar', color: 'info', id: 'most-overtime-cost' },
            { title: 'En Çok Çalışılan İş', value: '-', icon: 'fas fa-chart-bar', color: 'success', id: 'most-hours-job' }
        ],
        compact: true,
        animation: true
    });
    
    initializeTable();
    initializeFilters();
    setupEventListeners();
    await loadCombinedJobCostsData();
});

// Initialize Header Component
function initHeaderComponent() {
    headerComponent = new HeaderComponent({
        title: 'İş Maliyeti Raporu',
        subtitle: 'İş maliyeti analizi. Tüm iş numaraları görüntülenir, belirli bir iş numarası için filtreleme yapabilirsiniz.',
        icon: 'fas fa-calculator',
        iconColor: 'text-success',
        showBackButton: true,
        backButtonText: 'Raporlara Dön',
        backButtonUrl: '../',
        actions: [
            {
                text: 'Yenile',
                icon: 'fas fa-sync-alt',
                class: 'btn-outline-primary',
                onclick: () => loadCombinedJobCostsData()
            }
        ]
    });
}

// Initialize Filters Component
function initializeFilters() {
    filtersComponent = new FiltersComponent('filters-placeholder', {
        title: 'İş Maliyeti Filtreleri',
        onApply: (values) => {
            // Apply filters and reload data
            currentPage = 1;
            loadCombinedJobCostsData();
        },
        onClear: () => {
            // Clear filters and reload data
            currentPage = 1;
            loadCombinedJobCostsData();
        },
        onFilterChange: (filterId, value) => {
            // Optional: Handle individual filter changes
            console.log(`Filter ${filterId} changed to:`, value);
        }
    });

    // Add text filter for job number (optional)
    filtersComponent.addTextFilter({
        id: 'job_no',
        label: 'İş No',
        placeholder: 'İş numarası girin (isteğe bağlı)',
        colSize: 8
    });
}

// Initialize Table Component
function initializeTable() {
    jobCostsTable = new TableComponent('combined-job-costs-table-container', {
        title: 'İş Maliyeti Raporu',
        icon: 'fas fa-calculator',
        iconColor: 'text-success',
        columns: [
            {
                field: 'job_no',
                label: 'İş No',
                sortable: true,
                type: 'text',
                formatter: (value) => `<span class="fw-bold text-primary">${value}</span>`
            },
            {
                field: 'machining_total_hours',
                label: 'Talaş Toplam Saat',
                sortable: false,
                type: 'number',
                formatter: (value) => value !== null ? `<span class="text-primary">${value.toFixed(1)}</span>` : '<span class="text-muted">-</span>'
            },
            {
                field: 'machining_total_cost',
                label: 'Talaş Toplam Maliyet',
                sortable: false,
                type: 'number',
                formatter: (value) => value !== null ? `<span class="text-primary">€${value.toFixed(2)}</span>` : '<span class="text-muted">-</span>'
            },
            {
                field: 'welding_total_hours',
                label: 'Kaynak Toplam Saat',
                sortable: false,
                type: 'number',
                formatter: (value) => value !== null ? `<span class="text-danger">${value.toFixed(1)}</span>` : '<span class="text-muted">-</span>'
            },
            {
                field: 'welding_total_cost',
                label: 'Kaynak Toplam Maliyet',
                sortable: false,
                type: 'number',
                formatter: (value) => value !== null ? `<span class="text-danger">€${value.toFixed(2)}</span>` : '<span class="text-muted">-</span>'
            },
            {
                field: 'combined_total_hours',
                label: 'Toplam Saat',
                sortable: true,
                type: 'number',
                formatter: (value) => `<span class="fw-bold text-dark">${value.toFixed(1)}</span>`
            },
            {
                field: 'combined_total_cost',
                label: 'Toplam Maliyet',
                sortable: true,
                type: 'number',
                formatter: (value) => `<span class="fw-bold text-success">€${value.toFixed(2)}</span>`
            },
            {
                field: 'cost_per_hour',
                label: 'Saat Başı Maliyet',
                sortable: true,
                type: 'number',
                formatter: (value) => `<span class="fw-bold">€${value.toFixed(2)}</span>`
            },
            {
                field: 'actions',
                label: 'İşlemler',
                sortable: false,
                type: 'text',
                formatter: (value, rowData) => `
                    <button class="btn btn-sm btn-outline-primary" onclick="showJobDetails('${rowData.job_no}')" title="İş Detaylarını Görüntüle">
                        <i class="fas fa-info-circle me-1"></i>Detaylar
                    </button>
                `
            }
        ],
        onRowClick: handleRowClick,
        onSort: handleSort,
        onPageChange: handlePageChange,
        showPagination: true,
        showSearch: false,
        showExport: true,
        exportFileName: 'birlesik-is-maliyeti-raporu',
        skeletonLoading: true
    });
}

// Setup event listeners
function setupEventListeners() {
    // Add any additional event listeners here
}


// Handle row click
function handleRowClick(rowData) {
    // Show job details modal
    showJobDetails(rowData.job_no);
}

// Handle sort
function handleSort(field, direction) {
    currentSortField = field;
    currentSortDirection = direction;
    
    // Map frontend sort fields to backend ordering
    let ordering = '';
    if (field === 'job_no') {
        ordering = direction === 'asc' ? 'job_no' : '-job_no';
    } else if (field === 'combined_total_cost') {
        ordering = direction === 'asc' ? 'combined_total_cost' : '-combined_total_cost';
    } else if (field === 'combined_total_hours') {
        ordering = direction === 'asc' ? 'combined_total_hours' : '-combined_total_hours';
    } else {
        // Default to combined_total_cost descending
        ordering = '-combined_total_cost';
    }
    
    loadCombinedJobCostsData(ordering);
}

// Handle page change
function handlePageChange(page) {
    currentPage = page;
    loadCombinedJobCostsData();
}

// Load combined job costs data
async function loadCombinedJobCostsData(ordering = null) {
    if (isLoading) return;
    
    isLoading = true;
    
    try {
        // Get current filters
        const filters = filtersComponent ? filtersComponent.getFilterValues() : {};
        
        // Determine ordering
        const orderParam = ordering || (currentSortField === 'job_no' 
            ? (currentSortDirection === 'asc' ? 'job_no' : '-job_no')
            : (currentSortField === 'combined_total_hours'
                ? (currentSortDirection === 'asc' ? 'combined_total_hours' : '-combined_total_hours')
                : (currentSortDirection === 'asc' ? 'combined_total_cost' : '-combined_total_cost')));
        
        // Use the combined job costs API
        const data = await getCombinedJobCosts({
            job_no: filters.job_no || undefined,
            ordering: orderParam
        });
        
        // Process the data for display
        jobCostsData = processCombinedJobCostData(data.results || []);
        totalJobs = data.count || jobCostsData.length;
        
        // Update statistics
        updateStatistics(data);
        
        // Update table
        if (jobCostsTable) {
            jobCostsTable.updateData(jobCostsData, {
                totalItems: totalJobs,
                currentPage: currentPage,
                pageSize: pageSize
            });
        }
        
    } catch (error) {
        console.error('Error loading combined job costs data:', error);
        showError('Veri yüklenirken bir hata oluştu. Lütfen sayfayı yenileyin.');
    } finally {
        isLoading = false;
    }
}

// Process combined job cost data for display
function processCombinedJobCostData(results) {
    return results.map(job => {
        const machiningHours = job.machining 
            ? (job.machining.hours.weekday_work || 0) + (job.machining.hours.after_hours || 0) + (job.machining.hours.sunday || 0)
            : 0;
        const weldingHours = job.welding
            ? (job.welding.hours.regular || 0) + (job.welding.hours.after_hours || 0) + (job.welding.hours.holiday || 0)
            : 0;
        const totalHours = machiningHours + weldingHours;
        const costPerHour = totalHours > 0 ? (job.combined_total_cost || 0) / totalHours : 0;
        
        return {
            job_no: job.job_no,
            machining_total_hours: job.machining ? machiningHours : null,
            machining_total_cost: job.machining ? job.machining.total_cost : null,
            welding_total_hours: job.welding ? weldingHours : null,
            welding_total_cost: job.welding ? job.welding.total_cost : null,
            combined_total_hours: job.combined_total_hours || 0,
            combined_total_cost: job.combined_total_cost || 0,
            cost_per_hour: costPerHour,
            currency: job.currency || 'EUR',
            updated_at: job.updated_at,
            raw_data: job
        };
    });
}

// Update statistics
function updateStatistics(data) {
    if (!combinedJobCostsStats) return;
    
    const results = data.results || [];
    
    if (results.length === 0) {
        combinedJobCostsStats.updateValues({
            0: '-',
            1: '-',
            2: '-',
            3: '-'
        });
        return;
    }
    
    // Find most expensive job (highest combined total cost)
    const mostExpensiveJob = results.reduce((max, job) => 
        (job.combined_total_cost || 0) > (max.combined_total_cost || 0) ? job : max
    );
    
    // Find most expensive per hour job
    const mostExpensivePerHourJob = results.reduce((max, job) => {
        const jobCostPerHour = (job.combined_total_hours || 0) > 0 
            ? (job.combined_total_cost || 0) / (job.combined_total_hours || 0) 
            : 0;
        const maxCostPerHour = (max.combined_total_hours || 0) > 0 
            ? (max.combined_total_cost || 0) / (max.combined_total_hours || 0) 
            : 0;
        return jobCostPerHour > maxCostPerHour ? job : max;
    });
    
    // Find job with most overtime cost (after hours + sunday/holiday)
    const mostOvertimeCostJob = results.reduce((max, job) => {
        const machiningOvertime = job.machining 
            ? (job.machining.costs.after_hours || 0) + (job.machining.costs.sunday || 0)
            : 0;
        const weldingOvertime = job.welding
            ? (job.welding.costs.after_hours || 0) + (job.welding.costs.holiday || 0)
            : 0;
        const jobOvertimeCost = machiningOvertime + weldingOvertime;
        
        const maxMachiningOvertime = max.machining 
            ? (max.machining.costs.after_hours || 0) + (max.machining.costs.sunday || 0)
            : 0;
        const maxWeldingOvertime = max.welding
            ? (max.welding.costs.after_hours || 0) + (max.welding.costs.holiday || 0)
            : 0;
        const maxOvertimeCost = maxMachiningOvertime + maxWeldingOvertime;
        
        return jobOvertimeCost > maxOvertimeCost ? job : max;
    });
    
    // Find job with most total hours
    const mostHoursJob = results.reduce((max, job) => 
        (job.combined_total_hours || 0) > (max.combined_total_hours || 0) ? job : max
    );
    
    // Calculate values for display
    const mostExpensivePerHourValue = (mostExpensivePerHourJob.combined_total_hours || 0) > 0
        ? (mostExpensivePerHourJob.combined_total_cost || 0) / (mostExpensivePerHourJob.combined_total_hours || 0)
        : 0;
    
    const mostOvertimeCostValue = (() => {
        const machiningOvertime = mostOvertimeCostJob.machining 
            ? (mostOvertimeCostJob.machining.costs.after_hours || 0) + (mostOvertimeCostJob.machining.costs.sunday || 0)
            : 0;
        const weldingOvertime = mostOvertimeCostJob.welding
            ? (mostOvertimeCostJob.welding.costs.after_hours || 0) + (mostOvertimeCostJob.welding.costs.holiday || 0)
            : 0;
        return machiningOvertime + weldingOvertime;
    })();
    
    combinedJobCostsStats.updateValues({
        0: `${mostExpensiveJob.job_no}<br><small>€${(mostExpensiveJob.combined_total_cost || 0).toFixed(2)}</small>`,
        1: `${mostExpensivePerHourJob.job_no}<br><small>€${mostExpensivePerHourValue.toFixed(2)}/saat</small>`,
        2: `${mostOvertimeCostJob.job_no}<br><small>€${mostOvertimeCostValue.toFixed(2)}</small>`,
        3: `${mostHoursJob.job_no}<br><small>${(mostHoursJob.combined_total_hours || 0).toFixed(1)} saat</small>`
    });
}


// Show job details modal
function showJobDetails(jobNo) {
    const jobData = jobCostsData.find(j => j.job_no === jobNo);
    if (!jobData) {
        showError('İş detayları bulunamadı.');
        return;
    }
    
    const rawData = jobData.raw_data;
    const machining = rawData.machining || null;
    const welding = rawData.welding || null;
    const currency = rawData.currency || 'EUR';
    
    const modal = new DisplayModal('job-details-modal-container', {
        title: `${jobNo} - İş Maliyeti Detayları`,
        icon: 'fas fa-calculator',
        size: 'xl',
        showEditButton: false
    });
    
    // Add summary section
    modal.addSection({
        title: 'Özet',
        icon: 'fas fa-chart-pie',
        iconColor: 'text-primary',
        fields: [
            {
                id: 'combined_total_cost',
                label: 'Toplam Maliyet',
                value: rawData.combined_total_cost || 0,
                type: 'currency',
                icon: 'fas fa-euro-sign',
                format: (value) => `€${value.toFixed(2)}`,
                colSize: 4
            },
            {
                id: 'combined_total_hours',
                label: 'Toplam Saat',
                value: rawData.combined_total_hours || 0,
                type: 'number',
                icon: 'fas fa-clock',
                format: (value) => `${value.toFixed(1)} saat`,
                colSize: 4
            },
            {
                id: 'cost_per_hour',
                label: 'Saat Başı Maliyet',
                value: (rawData.combined_total_hours || 0) > 0 
                    ? (rawData.combined_total_cost || 0) / (rawData.combined_total_hours || 0)
                    : 0,
                type: 'currency',
                icon: 'fas fa-calculator',
                format: (value) => `€${value.toFixed(2)}`,
                colSize: 4
            }
        ]
    });
    
    // Add machining section if available
    if (machining) {
        const machiningTotalHours = (machining.hours.weekday_work || 0) + (machining.hours.after_hours || 0) + (machining.hours.sunday || 0);
        const machiningOvertimeCost = (machining.costs.after_hours || 0) + (machining.costs.sunday || 0);
        
        modal.addSection({
            title: 'Talaşlı İmalat Departmanı',
            icon: 'fas fa-cog',
            iconColor: 'text-primary',
            fields: [
                {
                    id: 'machining_total_cost',
                    label: 'Toplam Maliyet',
                    value: machining.total_cost || 0,
                    type: 'currency',
                    icon: 'fas fa-euro-sign',
                    format: (value) => `€${value.toFixed(2)}`,
                    colSize: 3
                },
                {
                    id: 'machining_total_hours',
                    label: 'Toplam Saat',
                    value: machiningTotalHours,
                    type: 'number',
                    icon: 'fas fa-clock',
                    format: (value) => `${value.toFixed(1)} saat`,
                    colSize: 3
                },
                {
                    id: 'machining_overtime_cost',
                    label: 'Mesai Maliyeti',
                    value: machiningOvertimeCost,
                    type: 'currency',
                    icon: 'fas fa-calendar',
                    format: (value) => `€${value.toFixed(2)}`,
                    colSize: 3
                },
                {
                    id: 'machining_cost_per_hour',
                    label: 'Saat Başı Maliyet',
                    value: machiningTotalHours > 0 ? (machining.total_cost || 0) / machiningTotalHours : 0,
                    type: 'currency',
                    icon: 'fas fa-calculator',
                    format: (value) => `€${value.toFixed(2)}`,
                    colSize: 3
                },
                {
                    id: 'machining_weekday_work',
                    label: 'Hafta İçi',
                    value: `${(machining.hours.weekday_work || 0).toFixed(1)} saat / €${(machining.costs.weekday_work || 0).toFixed(2)}`,
                    type: 'text',
                    icon: 'fas fa-calendar-day',
                    colSize: 4
                },
                {
                    id: 'machining_after_hours',
                    label: 'Mesai',
                    value: `${(machining.hours.after_hours || 0).toFixed(1)} saat / €${(machining.costs.after_hours || 0).toFixed(2)}`,
                    type: 'text',
                    icon: 'fas fa-clock',
                    colSize: 4
                },
                {
                    id: 'machining_sunday',
                    label: 'Pazar',
                    value: `${(machining.hours.sunday || 0).toFixed(1)} saat / €${(machining.costs.sunday || 0).toFixed(2)}`,
                    type: 'text',
                    icon: 'fas fa-calendar',
                    colSize: 4
                }
            ]
        });
    }
    
    // Add welding section if available
    if (welding) {
        const weldingTotalHours = (welding.hours.regular || 0) + (welding.hours.after_hours || 0) + (welding.hours.holiday || 0);
        const weldingOvertimeCost = (welding.costs.after_hours || 0) + (welding.costs.holiday || 0);
        
        modal.addSection({
            title: 'Kaynaklı İmalat Departmanı',
            icon: 'fas fa-fire',
            iconColor: 'text-danger',
            fields: [
                {
                    id: 'welding_total_cost',
                    label: 'Toplam Maliyet',
                    value: welding.total_cost || 0,
                    type: 'currency',
                    icon: 'fas fa-euro-sign',
                    format: (value) => `€${value.toFixed(2)}`,
                    colSize: 3
                },
                {
                    id: 'welding_total_hours',
                    label: 'Toplam Saat',
                    value: weldingTotalHours,
                    type: 'number',
                    icon: 'fas fa-clock',
                    format: (value) => `${value.toFixed(1)} saat`,
                    colSize: 3
                },
                {
                    id: 'welding_overtime_cost',
                    label: 'Mesai Maliyeti',
                    value: weldingOvertimeCost,
                    type: 'currency',
                    icon: 'fas fa-calendar',
                    format: (value) => `€${value.toFixed(2)}`,
                    colSize: 3
                },
                {
                    id: 'welding_cost_per_hour',
                    label: 'Saat Başı Maliyet',
                    value: weldingTotalHours > 0 ? (welding.total_cost || 0) / weldingTotalHours : 0,
                    type: 'currency',
                    icon: 'fas fa-calculator',
                    format: (value) => `€${value.toFixed(2)}`,
                    colSize: 3
                },
                {
                    id: 'welding_regular',
                    label: 'Normal',
                    value: `${(welding.hours.regular || 0).toFixed(1)} saat / €${(welding.costs.regular || 0).toFixed(2)}`,
                    type: 'text',
                    icon: 'fas fa-calendar-day',
                    colSize: 4
                },
                {
                    id: 'welding_after_hours',
                    label: 'Mesai',
                    value: `${(welding.hours.after_hours || 0).toFixed(1)} saat / €${(welding.costs.after_hours || 0).toFixed(2)}`,
                    type: 'text',
                    icon: 'fas fa-clock',
                    colSize: 4
                },
                {
                    id: 'welding_holiday',
                    label: 'Tatil',
                    value: `${(welding.hours.holiday || 0).toFixed(1)} saat / €${(welding.costs.holiday || 0).toFixed(2)}`,
                    type: 'text',
                    icon: 'fas fa-calendar',
                    colSize: 4
                }
            ]
        });
    }
    
    // Render and show modal
    modal.render().show();
}

// Show error message
function showError(message) {
    // You can implement a toast notification or alert here
    console.error(message);
    alert(message);
}

// Make showJobDetails globally accessible for button onclick
window.showJobDetails = showJobDetails;

// Export functions for external use
window.combinedJobCosts = {
    loadCombinedJobCostsData,
    showJobDetails
};

