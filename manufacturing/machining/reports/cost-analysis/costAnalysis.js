import { initNavbar } from '../../../../components/navbar.js';
import { TableComponent } from '../../../../components/table/table.js';
import { HeaderComponent } from '../../../../components/header/header.js';
import { FiltersComponent } from '../../../../components/filters/filters.js';
import { StatisticsCards } from '../../../../components/statistics-cards/statistics-cards.js';
import { fetchJobHoursReport } from '../../../../apis/machiningReports.js';
import { fetchJobCostReport } from '../../../../apis/machining/costAnalysis.js';

// State management
let currentPage = 1;
let currentSortField = 'job_no';
let currentSortDirection = 'asc';
let jobHoursData = [];
let totalJobs = 0;
let isLoading = false;
let pageSize = 20;
let filtersComponent = null;

// Header component instance
let headerComponent;

// Statistics Cards component instance
let costAnalysisStats = null;

// Table component instance
let jobHoursTable = null;

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    await initNavbar();
    
    // Initialize header component
    initHeaderComponent();
    
    // Initialize Statistics Cards component
    costAnalysisStats = new StatisticsCards('cost-analysis-statistics', {
        cards: [
            { title: 'Hafta İçi Saat', value: '0', icon: 'fas fa-calendar-day', color: 'primary', id: 'weekday-hours' },
            { title: 'Mesai Saat', value: '0', icon: 'fas fa-clock', color: 'warning', id: 'after-hours' },
            { title: 'Pazar Saat', value: '0', icon: 'fas fa-calendar', color: 'danger', id: 'sunday-hours' },
            { title: 'Toplam Saat', value: '0', icon: 'fas fa-chart-pie', color: 'success', id: 'total-hours' }
        ],
        compact: true,
        animation: true
    });
    
    initializeTable();
    initializeFilters();
    setupEventListeners();
    await loadJobHoursData();
});

// Initialize Header Component
function initHeaderComponent() {
    headerComponent = new HeaderComponent('header-placeholder', {
        title: 'Maliyet Analizi Raporu',
        subtitle: 'İş numarasına göre çalışma saatleri analizi ve maliyet hesaplamaları. Lütfen bir iş numarası girin.',
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
                onclick: () => loadJobHoursData()
            }
        ]
    });
}

// Initialize Filters Component
function initializeFilters() {
    filtersComponent = new FiltersComponent('filters-placeholder', {
        title: 'Maliyet Analizi Filtreleri',
        onApply: (values) => {
            // Apply filters and reload data
            currentPage = 1;
            loadJobHoursData();
        },
        onClear: () => {
            // Clear filters and reload data
            currentPage = 1;
            loadJobHoursData();
        },
        onFilterChange: (filterId, value) => {
            // Optional: Handle individual filter changes
            console.log(`Filter ${filterId} changed to:`, value);
        }
    });

    // Add text filter for job number (required)
    filtersComponent.addTextFilter({
        id: 'job_no',
        label: 'İş No *',
        placeholder: 'İş numarası girin (zorunlu)',
        colSize: 4
    });

    // Add date filters
    filtersComponent.addDateFilter({
        id: 'start_after',
        label: 'Başlangıç Tarihi (Sonrası)',
        colSize: 4
    });

    filtersComponent.addDateFilter({
        id: 'start_before',
        label: 'Başlangıç Tarihi (Öncesi)',
        colSize: 4
    });
}

// Initialize Table Component
function initializeTable() {
    jobHoursTable = new TableComponent('job-hours-table-container', {
        title: 'İş Saatleri Analizi',
        icon: 'fas fa-chart-bar',
        iconColor: 'text-primary',
        columns: [
            {
                field: 'user',
                label: 'Kullanıcı',
                sortable: true,
                type: 'text',
                formatter: (value) => `<span class="fw-bold text-primary">${value}</span>`
            },
            {
                field: 'weekday_work',
                label: 'Hafta İçi',
                sortable: true,
                type: 'number',
                formatter: (value) => `<span class="text-primary">${value.toFixed(1)}</span>`
            },
            {
                field: 'after_hours',
                label: 'Mesai',
                sortable: true,
                type: 'number',
                formatter: (value) => `<span class="text-warning">${value.toFixed(1)}</span>`
            },
            {
                field: 'sunday',
                label: 'Pazar',
                sortable: true,
                type: 'number',
                formatter: (value) => `<span class="text-danger">${value.toFixed(1)}</span>`
            },
            {
                field: 'total',
                label: 'Toplam',
                sortable: true,
                type: 'number',
                formatter: (value) => `<span class="fw-bold text-success">${value.toFixed(1)}</span>`
            }
        ],
        onRowClick: handleRowClick,
        onSort: handleSort,
        onPageChange: handlePageChange,
        showPagination: true,
        showSearch: false,
        showExport: true,
        exportFileName: 'maliyet-analizi-raporu',
        skeletonLoading: true
    });
}

// Setup event listeners
function setupEventListeners() {
    // Add any additional event listeners here
}


// Handle row click
function handleRowClick(rowData) {
    // Show details for user rows
    showJobDetails(rowData);
}

// Handle sort
function handleSort(field, direction) {
    currentSortField = field;
    currentSortDirection = direction;
    loadJobHoursData();
}

// Handle page change
function handlePageChange(page) {
    currentPage = page;
    loadJobHoursData();
}

// Load job hours data
async function loadJobHoursData() {
    if (isLoading) return;
    
    // Get current filters
    const filters = filtersComponent ? filtersComponent.getFilterValues() : {};
    
    // Check if job number is provided (required parameter)
    if (!filters.job_no || filters.job_no.trim() === '') {
        // Clear the table and show message
        if (jobHoursTable) {
            jobHoursTable.updateData([], {
                totalItems: 0,
                currentPage: 1,
                pageSize: pageSize,
                emptyMessage: 'Lütfen bir iş numarası girin ve filtrele butonuna tıklayın.'
            });
        }
        
        // Update statistics to show zeros
        updateStatistics({ results: [] });
        
        // Clear job numbers display
        updateJobNumbersDisplay({ job_nos: [] });
        
        return;
    }
    
    isLoading = true;
    
    try {
        // Use the apis API function
        const data = await fetchJobHoursReport({
            q: filters.job_no,
            start_after: filters.start_after ? Math.floor(new Date(filters.start_after).getTime() / 1000) : undefined,
            start_before: filters.start_before ? Math.floor(new Date(filters.start_before).getTime() / 1000) : undefined,
            page: currentPage,
            page_size: pageSize,
            ordering: currentSortField ? `${currentSortDirection === 'desc' ? '-' : ''}${currentSortField}` : undefined
        });
        await fetchJobCostReport({
            job_no: filters.job_no
        });
        
        // Process the data for display
        jobHoursData = processJobHoursData(data.results || []);
        totalJobs = data.count || jobHoursData.length;
        
        // Update statistics
        updateStatistics(data);
        
        // Update job numbers display
        updateJobNumbersDisplay(data);
        
        // Update table
        if (jobHoursTable) {
            jobHoursTable.updateData(jobHoursData, {
                totalItems: totalJobs,
                currentPage: currentPage,
                pageSize: pageSize
            });
        }
        
    } catch (error) {
        console.error('Error loading job hours data:', error);
        showError('Veri yüklenirken bir hata oluştu. Lütfen sayfayı yenileyin.');
    } finally {
        isLoading = false;
    }
}

// Process job hours data for display
function processJobHoursData(results) {
    const flattenedData = [];
    
    results.forEach(job => {
        const users = job.users || [];
        
        // Add each user as a separate row
        users.forEach(user => {
            flattenedData.push({
                user: user.user,
                weekday_work: user.weekday_work || 0,
                after_hours: user.after_hours || 0,
                sunday: user.sunday || 0,
                total: user.total || 0,
                raw_data: job
            });
        });
    });
    
    return flattenedData;
}

// Update statistics
function updateStatistics(data) {
    if (!costAnalysisStats) return;
    
    const results = data.results || [];
    const totalJobs = results.length;
    
    // Calculate totals from the response data
    const totals = results.reduce((acc, job) => {
        const jobTotals = job.totals || {};
        return {
            weekday_work: acc.weekday_work + (jobTotals.weekday_work || 0),
            after_hours: acc.after_hours + (jobTotals.after_hours || 0),
            sunday: acc.sunday + (jobTotals.sunday || 0),
            total: acc.total + (jobTotals.total || 0)
        };
    }, { weekday_work: 0, after_hours: 0, sunday: 0, total: 0 });
    
    const uniqueUsers = new Set();
    results.forEach(job => {
        if (job.users) {
            job.users.forEach(user => uniqueUsers.add(user.user));
        }
    });
    
    costAnalysisStats.updateValues({
        0: totals.weekday_work.toFixed(1),
        1: totals.after_hours.toFixed(1),
        2: totals.sunday.toFixed(1),
        3: totals.total.toFixed(1)
    });
}

// Update job numbers display
function updateJobNumbersDisplay(data) {
    const container = document.getElementById('job-numbers-found');
    if (!container) return;
    
    const jobNos = data.job_nos || [];
    const query = data.query || '';
    
    if (jobNos.length === 0) {
        container.innerHTML = '';
        return;
    }
    
    const jobNumbersHtml = jobNos.map(jobNo => 
        `<span class="badge bg-primary me-2 mb-2" style="font-size: 0.9rem; padding: 0.5rem 0.75rem;">${jobNo}</span>`
    ).join('');
    
    container.innerHTML = `
        <div class="row mb-4">
            <div class="col-12">
                <div class="card">
                    <div class="card-body">
                        <h6 class="card-title mb-3">
                            <i class="fas fa-search text-primary me-2"></i>
                            Bulunan İş Numaraları
                            ${query ? `<small class="text-muted">(Arama: "${query}")</small>` : ''}
                        </h6>
                        <div class="job-numbers-container">
                            ${jobNumbersHtml}
                        </div>
                        <small class="text-muted">
                            <i class="fas fa-info-circle me-1"></i>
                            Toplam ${jobNos.length} iş numarası bulundu
                        </small>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Show job details modal
function showJobDetails(jobData) {
    const rawData = jobData.raw_data;
    const users = rawData.users || [];
    const totals = rawData.totals || {};
    
    const modalHtml = `
        <div class="modal fade" id="jobDetailsModal" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            <i class="fas fa-briefcase text-primary me-2"></i>
                            ${jobData.job_no} - Detaylı Analiz
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Kapat"></button>
                    </div>
                    <div class="modal-body">
                        <div class="job-hours-summary">
                            <h5>İş Özeti</h5>
                            <div class="summary-stats">
                                <div class="stat-item">
                                    <div class="stat-value">${totals.total.toFixed(1)}</div>
                                    <div class="stat-label">Toplam Saat</div>
                                </div>
                                <div class="stat-item">
                                    <div class="stat-value">${users.length}</div>
                                    <div class="stat-label">Kullanıcı</div>
                                </div>
                                <div class="stat-item">
                                    <div class="stat-value">${users.length > 0 ? (totals.total / users.length).toFixed(1) : '0.0'}</div>
                                    <div class="stat-label">Ort. Saat/Kullanıcı</div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="user-hours-breakdown">
                            <h6>Kullanıcı Bazlı Dağılım</h6>
                            ${users.map(user => `
                                <div class="user-hours-item">
                                    <div class="user-name">${user.user}</div>
                                    <div class="hours-breakdown">
                                        <div class="hours-item">
                                            <div class="hours-value">${user.weekday_work.toFixed(1)}</div>
                                            <div class="hours-label">Hafta İçi</div>
                                        </div>
                                        <div class="hours-item">
                                            <div class="hours-value">${user.after_hours.toFixed(1)}</div>
                                            <div class="hours-label">Mesai</div>
                                        </div>
                                        <div class="hours-item">
                                            <div class="hours-value">${user.sunday.toFixed(1)}</div>
                                            <div class="hours-label">Pazar</div>
                                        </div>
                                        <div class="hours-item">
                                            <div class="hours-value fw-bold">${user.total.toFixed(1)}</div>
                                            <div class="hours-label">Toplam</div>
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                        
                        <div class="total-hours-highlight">
                            <i class="fas fa-calculator me-2"></i>
                            Toplam Çalışma Süresi: ${totals.total.toFixed(1)} Saat
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Kapat</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Remove existing modal if any
    const existingModal = document.getElementById('jobDetailsModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('jobDetailsModal'));
    modal.show();
}

// Show error message
function showError(message) {
    // You can implement a toast notification or alert here
    console.error(message);
    alert(message);
}

// Export functions for external use
window.costAnalysis = {
    loadJobHoursData,
    showJobDetails
};
