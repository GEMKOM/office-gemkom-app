import { initNavbar } from '../../../../components/navbar.js';
import { TableComponent } from '../../../../components/table/table.js';
import { HeaderComponent } from '../../../../components/header/header.js';
import { FiltersComponent } from '../../../../components/filters/filters.js';
import { StatisticsCards } from '../../../../components/statistics-cards/statistics-cards.js';
import { DisplayModal } from '../../../../components/display-modal/display-modal.js';
import { getCombinedJobCosts } from '../../../../apis/planning/reports.js';
import { getMachiningJobEntries } from '../../../../apis/machining/reports.js';
import { getWeldingJobCostDetail } from '../../../../apis/welding/reports.js';

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
    const combinedTotalCost = rawData.combined_total_cost || 0;
    const combinedTotalHours = rawData.combined_total_hours || 0;
    const costPerHour = combinedTotalHours > 0 ? combinedTotalCost / combinedTotalHours : 0;
    
    modal.addCustomSection({
        title: 'Özet',
        icon: 'fas fa-chart-pie',
        iconColor: 'text-primary',
        customContent: `
            <div class="row mb-3">
                <div class="col-md-4">
                    <div class="card">
                        <div class="card-body text-center">
                            <i class="fas fa-euro-sign text-primary mb-2"></i>
                            <div class="fw-bold">€${combinedTotalCost.toFixed(2)}</div>
                            <small class="text-muted">Toplam Maliyet</small>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card">
                        <div class="card-body text-center">
                            <i class="fas fa-clock text-primary mb-2"></i>
                            <div class="fw-bold">${combinedTotalHours.toFixed(1)}</div>
                            <small class="text-muted">Toplam Saat</small>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card">
                        <div class="card-body text-center">
                            <i class="fas fa-calculator text-primary mb-2"></i>
                            <div class="fw-bold">€${costPerHour.toFixed(2)}</div>
                            <small class="text-muted">Saat Başı Maliyet</small>
                        </div>
                    </div>
                </div>
            </div>
        `
    });
    
    // Add machining section (always show, even if no data)
    const machiningTotalHours = machining ? (machining.hours.weekday_work || 0) + (machining.hours.after_hours || 0) + (machining.hours.sunday || 0) : 0;
    const machiningOvertimeCost = machining ? (machining.costs.after_hours || 0) + (machining.costs.sunday || 0) : 0;
    
    modal.addCustomSection({
        title: 'Talaşlı İmalat Departmanı',
        icon: 'fas fa-cog',
        iconColor: 'text-primary',
        customContent: machining ? `
            <div class="row mb-3">
                <div class="col-md-3">
                    <div class="card">
                        <div class="card-body text-center">
                            <i class="fas fa-euro-sign text-primary mb-2"></i>
                            <div class="fw-bold">€${(machining.total_cost || 0).toFixed(2)}</div>
                            <small class="text-muted">Toplam Maliyet</small>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card">
                        <div class="card-body text-center">
                            <i class="fas fa-clock text-primary mb-2"></i>
                            <div class="fw-bold">${machiningTotalHours.toFixed(1)}</div>
                            <small class="text-muted">Toplam Saat</small>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card">
                        <div class="card-body text-center">
                            <i class="fas fa-calendar text-primary mb-2"></i>
                            <div class="fw-bold">€${machiningOvertimeCost.toFixed(2)}</div>
                            <small class="text-muted">Mesai Maliyeti</small>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card">
                        <div class="card-body text-center">
                            <i class="fas fa-calculator text-primary mb-2"></i>
                            <div class="fw-bold">€${(machiningTotalHours > 0 ? (machining.total_cost || 0) / machiningTotalHours : 0).toFixed(2)}</div>
                            <small class="text-muted">Saat Başı Maliyet</small>
                        </div>
                    </div>
                </div>
            </div>
            <div class="text-center">
                <button class="btn btn-primary" onclick="showMachiningDetails('${jobNo}')">
                    <i class="fas fa-table me-2"></i>Detayları Görüntüle
                </button>
            </div>
        ` : `
            <div class="text-center py-3">
                <p class="text-muted mb-3">Bu iş için talaşlı imalat verisi bulunmamaktadır.</p>
            </div>
        `
    });
    
    // Add welding section (always show, even if no data)
    const weldingTotalHours = welding ? (welding.hours.regular || 0) + (welding.hours.after_hours || 0) + (welding.hours.holiday || 0) : 0;
    const weldingOvertimeCost = welding ? (welding.costs.after_hours || 0) + (welding.costs.holiday || 0) : 0;
    
    modal.addCustomSection({
        title: 'Kaynaklı İmalat Departmanı',
        icon: 'fas fa-fire',
        iconColor: 'text-danger',
        customContent: welding ? `
            <div class="row mb-3">
                <div class="col-md-3">
                    <div class="card">
                        <div class="card-body text-center">
                            <i class="fas fa-euro-sign text-danger mb-2"></i>
                            <div class="fw-bold">€${(welding.total_cost || 0).toFixed(2)}</div>
                            <small class="text-muted">Toplam Maliyet</small>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card">
                        <div class="card-body text-center">
                            <i class="fas fa-clock text-danger mb-2"></i>
                            <div class="fw-bold">${weldingTotalHours.toFixed(1)}</div>
                            <small class="text-muted">Toplam Saat</small>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card">
                        <div class="card-body text-center">
                            <i class="fas fa-calendar text-danger mb-2"></i>
                            <div class="fw-bold">€${weldingOvertimeCost.toFixed(2)}</div>
                            <small class="text-muted">Mesai Maliyeti</small>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card">
                        <div class="card-body text-center">
                            <i class="fas fa-calculator text-danger mb-2"></i>
                            <div class="fw-bold">€${(weldingTotalHours > 0 ? (welding.total_cost || 0) / weldingTotalHours : 0).toFixed(2)}</div>
                            <small class="text-muted">Saat Başı Maliyet</small>
                        </div>
                    </div>
                </div>
            </div>
            <div class="text-center">
                <button class="btn btn-danger" onclick="showWeldingDetails('${jobNo}')">
                    <i class="fas fa-table me-2"></i>Detayları Görüntüle
                </button>
            </div>
        ` : `
            <div class="text-center py-3">
                <p class="text-muted mb-3">Bu iş için kaynaklı imalat verisi bulunmamaktadır.</p>
            </div>
        `
    });
    
    // Render and show modal
    modal.render().show();
}

// Helper function to ensure modal container exists
function ensureModalContainer(containerId) {
    let container = document.getElementById(containerId);
    if (!container) {
        container = document.createElement('div');
        container.id = containerId;
        document.body.appendChild(container);
    }
    return container;
}

// Show machining details modal
async function showMachiningDetails(jobNo) {
    try {
        // Ensure container exists
        ensureModalContainer('machining-details-modal-container');
        
        // Fetch machining entries for the job
        const data = await getMachiningJobEntries({ job_no: jobNo });
        const entries = data.entries || [];
        const summary = data.summary || {};
        
        // Sort entries by start_time (ascending)
        const sortedEntries = [...entries].sort((a, b) => {
            const timeA = a.start_time || 0;
            const timeB = b.start_time || 0;
            return timeA - timeB;
        });
        
        // Create display modal
        const modal = new DisplayModal('machining-details-modal-container', {
            title: `${jobNo} - Talaşlı İmalat Detayları`,
            icon: 'fas fa-cog',
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
                    id: 'total_entries',
                    label: 'Toplam Kayıt',
                    value: summary.total_entries || entries.length,
                    type: 'number',
                    icon: 'fas fa-list',
                    colSize: 3
                },
                {
                    id: 'total_hours',
                    label: 'Toplam Saat',
                    value: summary.total_hours || 0,
                    type: 'number',
                    icon: 'fas fa-clock',
                    format: (value) => `${(Number(value) || 0).toFixed(1)} saat`,
                    colSize: 3
                },
                {
                    id: 'weekday_work',
                    label: 'Hafta İçi Saat',
                    value: summary.breakdown_by_type?.weekday_work || 0,
                    type: 'number',
                    icon: 'fas fa-calendar-day',
                    format: (value) => `${(Number(value) || 0).toFixed(1)} saat`,
                    colSize: 2
                },
                {
                    id: 'after_hours',
                    label: 'Mesai Saat',
                    value: summary.breakdown_by_type?.after_hours || 0,
                    type: 'number',
                    icon: 'fas fa-clock',
                    format: (value) => `${(Number(value) || 0).toFixed(1)} saat`,
                    colSize: 2
                },
                {
                    id: 'sunday',
                    label: 'Pazar Saat',
                    value: summary.breakdown_by_type?.sunday || 0,
                    type: 'number',
                    icon: 'fas fa-calendar',
                    format: (value) => `${(Number(value) || 0).toFixed(1)} saat`,
                    colSize: 2
                }
            ]
        });
        
        // Add entries table using TableComponent
        if (sortedEntries.length > 0) {
            // Process entries data for table display
            const entriesTableData = sortedEntries.map(entry => {
                // Extract date from start_time timestamp
                const date = entry.start_time ? new Date(entry.start_time).toISOString().split('T')[0] : '-';
                return {
                    id: entry.id,
                    date: date,
                    employee_id: entry.employee_id,
                    employee_username: entry.employee_username,
                    employee_full_name: entry.employee_full_name,
                    operation_key: entry.operation_key || '-',
                    operation_name: entry.operation_name || '-',
                    hours: entry.hours || 0,
                    work_type: entry.work_type,
                    raw_data: entry
                };
            });

            const tableHtml = `
                <div id="machining-entries-table-container"></div>
            `;
            
            modal.addCustomSection({
                title: null,
                customContent: tableHtml
            });

            // Render and show modal first
            modal.render().show();

            // Initialize table component after modal is shown
            setTimeout(() => {
                const entriesTable = new TableComponent('machining-entries-table-container', {
                    title: 'Kayıtlar (Tarihe Göre Sıralı)',
                    icon: 'fas fa-table',
                    iconColor: 'text-primary',
                    columns: [
                        {
                            field: 'date',
                            label: 'Tarih',
                            sortable: true,
                            type: 'text',
                            formatter: (value) => `<span class="fw-bold">${value || '-'}</span>`
                        },
                        {
                            field: 'employee_full_name',
                            label: 'Çalışan',
                            sortable: true,
                            type: 'text',
                            formatter: (value, rowData) => `
                                <div>
                                    <span class="fw-bold text-primary">${value || rowData.employee_username || '-'}</span>
                                    ${rowData.employee_username ? `<br><small class="text-muted">${rowData.employee_username}</small>` : ''}
                                </div>
                            `
                        },
                        {
                            field: 'operation_key',
                            label: 'Operasyon Anahtarı',
                            sortable: true,
                            type: 'text',
                            formatter: (value) => `<span class="text-info">${value || '-'}</span>`
                        },
                        {
                            field: 'operation_name',
                            label: 'Operasyon Adı',
                            sortable: true,
                            type: 'text',
                            formatter: (value) => `<span>${value || '-'}</span>`
                        },
                        {
                            field: 'hours',
                            label: 'Saat',
                            sortable: true,
                            type: 'number',
                            formatter: (value) => `<span class="fw-bold">${(value || 0).toFixed(1)}</span>`
                        },
                        {
                            field: 'work_type',
                            label: 'Tip',
                            sortable: true,
                            type: 'text',
                            formatter: (value) => {
                                const typeLabels = {
                                    'weekday_work': '<span class="badge bg-primary">Hafta İçi</span>',
                                    'after_hours': '<span class="badge bg-warning">Mesai</span>',
                                    'sunday': '<span class="badge bg-danger">Pazar</span>'
                                };
                                return typeLabels[value] || `<span class="badge bg-secondary">${value || '-'}</span>`;
                            }
                        }
                    ],
                    onRowClick: null,
                    onSort: null,
                    onPageChange: null,
                    showPagination: false,
                    showSearch: false,
                    showExport: false,
                    skeletonLoading: false
                });

                // Update table with data
                entriesTable.updateData(entriesTableData, {
                    totalItems: entriesTableData.length,
                    currentPage: 1,
                    pageSize: entriesTableData.length
                });
            }, 100);
        } else {
            modal.addCustomSection({
                title: 'Kayıtlar',
                icon: 'fas fa-table',
                iconColor: 'text-primary',
                customContent: '<div class="text-center text-muted py-4"><i class="fas fa-info-circle me-2"></i>Bu iş için kayıt bulunamadı.</div>'
            });
        }
        
    } catch (error) {
        console.error('Error loading machining details:', error);
        showError('Talaşlı imalat detayları yüklenirken bir hata oluştu.');
    }
}

// Show welding details modal
async function showWeldingDetails(jobNo) {
    try {
        // Ensure container exists
        ensureModalContainer('welding-details-modal-container');
        
        // Fetch welding entries for the job
        const data = await getWeldingJobCostDetail({ job_no: jobNo });
        const entries = data.entries || [];
        const summary = data.summary || {};
        
        // Sort entries by date (ascending)
        const sortedEntries = [...entries].sort((a, b) => {
            const dateA = new Date(a.date || '');
            const dateB = new Date(b.date || '');
            return dateA - dateB;
        });
        
        // Create display modal
        const modal = new DisplayModal('welding-details-modal-container', {
            title: `${jobNo} - Kaynaklı İmalat Detayları`,
            icon: 'fas fa-fire',
            size: 'xl',
            showEditButton: false
        });
        
        // Add summary section
        modal.addSection({
            title: 'Özet',
            icon: 'fas fa-chart-pie',
            iconColor: 'text-danger',
            fields: [
                {
                    id: 'total_entries',
                    label: 'Toplam Kayıt',
                    value: summary.total_entries || entries.length,
                    type: 'number',
                    icon: 'fas fa-list',
                    colSize: 3
                },
                {
                    id: 'total_hours',
                    label: 'Toplam Saat',
                    value: summary.total_hours || 0,
                    type: 'number',
                    icon: 'fas fa-clock',
                    format: (value) => `${(Number(value) || 0).toFixed(1)} saat`,
                    colSize: 3
                },
                {
                    id: 'regular_hours',
                    label: 'Normal Saat',
                    value: summary.breakdown_by_type?.regular || 0,
                    type: 'number',
                    icon: 'fas fa-calendar-day',
                    format: (value) => `${(Number(value) || 0).toFixed(1)} saat`,
                    colSize: 2
                },
                {
                    id: 'after_hours',
                    label: 'Mesai Saat',
                    value: summary.breakdown_by_type?.after_hours || 0,
                    type: 'number',
                    icon: 'fas fa-clock',
                    format: (value) => `${(Number(value) || 0).toFixed(1)} saat`,
                    colSize: 2
                },
                {
                    id: 'holiday_hours',
                    label: 'Tatil Saat',
                    value: summary.breakdown_by_type?.holiday || 0,
                    type: 'number',
                    icon: 'fas fa-calendar',
                    format: (value) => `${(Number(value) || 0).toFixed(1)} saat`,
                    colSize: 2
                }
            ]
        });
        
        // Add entries table using TableComponent
        if (sortedEntries.length > 0) {
            // Process entries data for table display
            const entriesTableData = sortedEntries.map(entry => ({
                id: entry.id,
                date: entry.date,
                employee_id: entry.employee_id,
                employee_username: entry.employee_username,
                employee_full_name: entry.employee_full_name,
                hours: entry.hours || 0,
                overtime_type: entry.overtime_type,
                raw_data: entry
            }));

            const tableHtml = `
                <div id="welding-entries-table-container"></div>
            `;
            
            modal.addCustomSection({
                title: null,
                customContent: tableHtml
            });

            // Render and show modal first
            modal.render().show();

            // Initialize table component after modal is shown
            setTimeout(() => {
                const entriesTable = new TableComponent('welding-entries-table-container', {
                    title: 'Kayıtlar (Tarihe Göre Sıralı)',
                    icon: 'fas fa-table',
                    iconColor: 'text-danger',
                    columns: [
                        {
                            field: 'date',
                            label: 'Tarih',
                            sortable: true,
                            type: 'text',
                            formatter: (value) => `<span class="fw-bold">${value || '-'}</span>`
                        },
                        {
                            field: 'employee_full_name',
                            label: 'Çalışan',
                            sortable: true,
                            type: 'text',
                            formatter: (value, rowData) => `
                                <div>
                                    <span class="fw-bold text-primary">${value || rowData.employee_username || '-'}</span>
                                    ${rowData.employee_username ? `<br><small class="text-muted">${rowData.employee_username}</small>` : ''}
                                </div>
                            `
                        },
                        {
                            field: 'hours',
                            label: 'Saat',
                            sortable: true,
                            type: 'number',
                            formatter: (value) => `<span class="fw-bold">${(value || 0).toFixed(1)}</span>`
                        },
                        {
                            field: 'overtime_type',
                            label: 'Tip',
                            sortable: true,
                            type: 'text',
                            formatter: (value) => {
                                const typeLabels = {
                                    'regular': '<span class="badge bg-primary">Normal</span>',
                                    'after_hours': '<span class="badge bg-warning">Mesai</span>',
                                    'holiday': '<span class="badge bg-danger">Tatil</span>'
                                };
                                return typeLabels[value] || `<span class="badge bg-secondary">${value || '-'}</span>`;
                            }
                        }
                    ],
                    onRowClick: null,
                    onSort: null,
                    onPageChange: null,
                    showPagination: false,
                    showSearch: false,
                    showExport: false,
                    skeletonLoading: false
                });

                // Update table with data
                entriesTable.updateData(entriesTableData, {
                    totalItems: entriesTableData.length,
                    currentPage: 1,
                    pageSize: entriesTableData.length
                });
            }, 100);
        } else {
            modal.addCustomSection({
                title: 'Kayıtlar',
                icon: 'fas fa-table',
                iconColor: 'text-danger',
                customContent: '<div class="text-center text-muted py-4"><i class="fas fa-info-circle me-2"></i>Bu iş için kayıt bulunamadı.</div>'
            });
        }
        
    } catch (error) {
        console.error('Error loading welding details:', error);
        showError('Kaynaklı imalat detayları yüklenirken bir hata oluştu.');
    }
}

// Show error message
function showError(message) {
    // You can implement a toast notification or alert here
    console.error(message);
    alert(message);
}

// Make functions globally accessible for button onclick
window.showJobDetails = showJobDetails;
window.showMachiningDetails = showMachiningDetails;
window.showWeldingDetails = showWeldingDetails;

// Export functions for external use
window.combinedJobCosts = {
    loadCombinedJobCostsData,
    showJobDetails,
    showMachiningDetails,
    showWeldingDetails
};

