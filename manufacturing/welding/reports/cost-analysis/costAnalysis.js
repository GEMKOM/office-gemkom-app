import { initNavbar } from '../../../../../components/navbar.js';
import { TableComponent } from '../../../../../components/table/table.js';
import { HeaderComponent } from '../../../../../components/header/header.js';
import { FiltersComponent } from '../../../../../components/filters/filters.js';
import { StatisticsCards } from '../../../../../components/statistics-cards/statistics-cards.js';
import { DisplayModal } from '../../../../../components/display-modal/display-modal.js';
import { getWeldingJobCostTotals, getWeldingJobCostDetail } from '../../../../../apis/welding/reports.js';
import { initRouteProtection } from '../../../../../apis/routeProtection.js';

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
    if (!initRouteProtection()) {
        return;
    }

    await initNavbar();
    
    // Initialize header component
    initHeaderComponent();
    
    // Initialize Statistics Cards component
    costAnalysisStats = new StatisticsCards('cost-analysis-statistics', {
        cards: [
            { title: 'En Çok Saat', value: '-', icon: 'fas fa-clock', color: 'success', id: 'most-hours-job' },
            { title: 'En Çok Normal Saat', value: '-', icon: 'fas fa-calendar-day', color: 'primary', id: 'most-regular-hours' },
            { title: 'En Çok Mesai Saat', value: '-', icon: 'fas fa-calendar', color: 'warning', id: 'most-overtime-hours' },
            { title: 'En Çok Tatil Saat', value: '-', icon: 'fas fa-calendar-alt', color: 'danger', id: 'most-holiday-hours' }
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
    headerComponent = new HeaderComponent({
        containerId: 'header-placeholder',
        title: 'Kaynak Maliyet Analizi Raporu',
        subtitle: 'İş numaralarına göre detaylı saat analizi ve kullanıcı bazlı detaylar. Tüm iş numaraları görüntülenir, belirli bir iş numarası için filtreleme yapabilirsiniz.',
        icon: 'calculator',
        showBackButton: 'block',
        showExportButton: 'block',
        showRefreshButton: 'block',
        exportButtonText: 'Excel\'e Aktar',
        refreshButtonText: 'Yenile',
        backUrl: '/manufacturing/welding/reports',
        onExportClick: handleExport,
        onRefreshClick: loadJobHoursData
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
    jobHoursTable = new TableComponent('job-hours-table-container', {
        title: 'Maliyet Analizi Raporu',
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
                field: 'regular_hours',
                label: 'Normal (1x)',
                sortable: true,
                type: 'number',
                formatter: (value) => `<span class="text-primary">${(value || 0).toFixed(2)}</span>`
            },
            {
                field: 'after_hours',
                label: 'Fazla Mesai (1.5x)',
                sortable: true,
                type: 'number',
                formatter: (value) => `<span class="text-warning">${(value || 0).toFixed(2)}</span>`
            },
            {
                field: 'holiday_hours',
                label: 'Tatil (2x)',
                sortable: true,
                type: 'number',
                formatter: (value) => `<span class="text-danger">${(value || 0).toFixed(2)}</span>`
            },
            {
                field: 'total_hours',
                label: 'Toplam Saat',
                sortable: true,
                type: 'number',
                formatter: (value) => `<span class="fw-bold text-success">${(value || 0).toFixed(2)}</span>`
            },
            {
                field: 'updated_at',
                label: 'Son Güncelleme',
                sortable: true,
                type: 'date',
                formatter: (value) => {
                    if (!value) return '-';
                    const date = new Date(value);
                    return date.toLocaleDateString('tr-TR') + '<br><small class="text-muted">' + date.toLocaleTimeString('tr-TR') + '</small>';
                }
            },
            {
                field: 'actions',
                label: 'İşlemler',
                sortable: false,
                type: 'text',
                formatter: (value, rowData) => `
                    <button class="btn btn-sm btn-outline-primary" onclick="showUserDetails('${rowData.job_no}')" title="Kullanıcı Detaylarını Görüntüle">
                        <i class="fas fa-users me-1"></i>Detaylar
                    </button>
                `
            }
        ],
        onRowClick: handleRowClick,
        onSort: handleSort,
        onPageChange: handlePageChange,
        pagination: true,
        itemsPerPage: 20,
        serverSidePagination: false,
        exportable: true,
        refreshable: true,
        onRefresh: loadJobHoursData,
        onExport: handleExport,
        emptyMessage: 'İş numarası bulunamadı',
        emptyIcon: 'fas fa-calculator'
    });
}

// Setup event listeners
function setupEventListeners() {
    // Add any additional event listeners here
}

// Handle row click
function handleRowClick(rowData) {
    // Show user details modal
    showUserDetails(rowData.job_no);
}

// Handle sort
function handleSort(field, direction) {
    currentSortField = field;
    currentSortDirection = direction;
    
    // Map field names to API ordering
    const orderingMap = {
        'job_no': 'job_no',
        '-job_no': '-job_no',
        'total_hours': 'total_hours',
        '-total_hours': '-total_hours',
        'updated_at': 'updated_at',
        '-updated_at': '-updated_at'
    };
    
    const ordering = direction === 'desc' ? `-${field}` : field;
    const apiOrdering = orderingMap[ordering] || orderingMap['-total_hours'];
    
    loadJobHoursData(apiOrdering);
}

// Handle page change
function handlePageChange(page) {
    currentPage = page;
    loadJobHoursData();
}

// Load job cost data
async function loadJobHoursData(ordering = null) {
    if (isLoading) return;
    
    isLoading = true;
    
    try {
        // Set loading state
        if (jobHoursTable) {
            jobHoursTable.setLoading(true);
        }
        
        // Get current filters
        const filters = filtersComponent ? filtersComponent.getFilterValues() : {};
        
        // Use the welding cost analysis API
        const data = await getWeldingJobCostTotals({
            job_no: filters.job_no || undefined,
            ordering: ordering || '-total_hours'
        });
        
        // Process the data for display
        jobHoursData = processJobCostData(data.results || []);
        totalJobs = data.count || jobHoursData.length;
        
        // Update statistics
        updateStatistics(data);
        
        // Update table
        if (jobHoursTable) {
            jobHoursTable.setLoading(false);
            jobHoursTable.updateData(jobHoursData, totalJobs, currentPage);
        }
        
    } catch (error) {
        console.error('Error loading job cost data:', error);
        showError('Veri yüklenirken bir hata oluştu. Lütfen sayfayı yenileyin.');
        if (jobHoursTable) {
            jobHoursTable.setLoading(false);
            jobHoursTable.updateData([], 0, 1);
        }
    } finally {
        isLoading = false;
    }
}

// Process job cost data for display
function processJobCostData(results) {
    return results.map(job => {
        const hours = job.hours || {};
        const totalHours = job.total_hours || 0;
        
        return {
            job_no: job.job_no,
            regular_hours: hours.regular || 0,
            after_hours: hours.after_hours || 0,
            holiday_hours: hours.holiday || 0,
            total_hours: totalHours,
            updated_at: job.updated_at,
            raw_data: job
        };
    });
}

// Update statistics
function updateStatistics(data) {
    if (!costAnalysisStats) return;
    
    const results = data.results || [];
    
    if (results.length === 0) {
        costAnalysisStats.updateValues({
            0: '-',
            1: '-',
            2: '-',
            3: '-'
        });
        return;
    }
    
    // Find job with most total hours
    const mostHoursJob = results.reduce((max, job) => 
        (job.total_hours || 0) > (max.total_hours || 0) ? job : max
    );
    
    // Find job with most regular hours
    const mostRegularHoursJob = results.reduce((max, job) => {
        const jobRegular = (job.hours?.regular || 0);
        const maxRegular = (max.hours?.regular || 0);
        return jobRegular > maxRegular ? job : max;
    });
    
    // Find job with most after_hours
    const mostOvertimeHoursJob = results.reduce((max, job) => {
        const jobOvertime = (job.hours?.after_hours || 0);
        const maxOvertime = (max.hours?.after_hours || 0);
        return jobOvertime > maxOvertime ? job : max;
    });
    
    // Find job with most holiday hours
    const mostHolidayHoursJob = results.reduce((max, job) => {
        const jobHoliday = (job.hours?.holiday || 0);
        const maxHoliday = (max.hours?.holiday || 0);
        return jobHoliday > maxHoliday ? job : max;
    });
    
    costAnalysisStats.updateValues({
        0: `${mostHoursJob.job_no}<br><small>${(mostHoursJob.total_hours || 0).toFixed(2)} saat</small>`,
        1: `${mostRegularHoursJob.job_no}<br><small>${(mostRegularHoursJob.hours?.regular || 0).toFixed(2)} saat</small>`,
        2: `${mostOvertimeHoursJob.job_no}<br><small>${(mostOvertimeHoursJob.hours?.after_hours || 0).toFixed(2)} saat</small>`,
        3: `${mostHolidayHoursJob.job_no}<br><small>${(mostHolidayHoursJob.hours?.holiday || 0).toFixed(2)} saat</small>`
    });
}

// Show error message
function showError(message) {
    // You can implement a toast notification or alert here
    console.error(message);
    alert(message);
}

// Show user details modal
async function showUserDetails(jobNo) {
    try {
        // Fetch user details for the job
        const data = await getWeldingJobCostDetail({ job_no: jobNo });
        const users = data.results || [];
        
        // Create display modal
        const modal = new DisplayModal('user-details-modal-container', {
            title: `${jobNo} - Kullanıcı Detayları`,
            icon: 'fas fa-users',
            size: 'xl',
            showEditButton: false
        });
        
        // Calculate totals
        const totalRegularHours = users.reduce((sum, user) => sum + (user.hours?.regular || 0), 0);
        const totalAfterHours = users.reduce((sum, user) => sum + (user.hours?.after_hours || 0), 0);
        const totalHolidayHours = users.reduce((sum, user) => sum + (user.hours?.holiday || 0), 0);
        const totalHours = totalRegularHours + totalAfterHours + totalHolidayHours;

        // Add summary section
        modal.addSection({
            title: 'Özet',
            icon: 'fas fa-chart-pie',
            iconColor: 'text-primary',
            fields: [
                {
                    id: 'total_users',
                    label: 'Toplam Kullanıcı',
                    value: users.length,
                    type: 'number',
                    icon: 'fas fa-users',
                    colSize: 3
                },
                {
                    id: 'total_regular_hours',
                    label: 'Normal Saat',
                    value: totalRegularHours,
                    type: 'number',
                    icon: 'fas fa-calendar-day',
                    format: (value) => `${value.toFixed(2)} saat`,
                    colSize: 3
                },
                {
                    id: 'total_after_hours',
                    label: 'Fazla Mesai Saat',
                    value: totalAfterHours,
                    type: 'number',
                    icon: 'fas fa-clock',
                    format: (value) => `${value.toFixed(2)} saat`,
                    colSize: 3
                },
                {
                    id: 'total_holiday_hours',
                    label: 'Tatil Saat',
                    value: totalHolidayHours,
                    type: 'number',
                    icon: 'fas fa-calendar-alt',
                    format: (value) => `${value.toFixed(2)} saat`,
                    colSize: 3
                },
                {
                    id: 'total_hours',
                    label: 'Toplam Saat',
                    value: totalHours,
                    type: 'number',
                    icon: 'fas fa-clock',
                    format: (value) => `${value.toFixed(2)} saat`,
                    colSize: 3
                }
            ]
        });
        
        // Add users table using TableComponent
        if (users.length > 0) {
            // Process user data for table display
            const userTableData = users.map(user => ({
                user: user.user,
                user_id: user.user_id,
                regular_hours: user.hours?.regular || 0,
                after_hours: user.hours?.after_hours || 0,
                holiday_hours: user.hours?.holiday || 0,
                total_hours: user.total_hours || 0,
                updated_at: user.updated_at,
                raw_data: user
            }));

            const tableHtml = `
                <div id="user-details-table-container"></div>
            `;
            
            modal.addCustomSection({
                title: null,
                customContent: tableHtml
            });

            // Render and show modal first
            modal.render().show();

            // Initialize table component after modal is shown
            setTimeout(() => {
                const userDetailsTable = new TableComponent('user-details-table-container', {
                    title: 'Kullanıcı Detayları',
                    icon: 'fas fa-users',
                    iconColor: 'text-primary',
                    columns: [
                        {
                            field: 'user',
                            label: 'Kullanıcı',
                            sortable: true,
                            type: 'text',
                            formatter: (value, rowData) => `
                                <span class="fw-bold text-primary">${value}</span>
                            `
                        },
                        {
                            field: 'regular_hours',
                            label: 'Normal (1x)',
                            sortable: true,
                            type: 'number',
                            formatter: (value) => `<span class="text-primary">${(value || 0).toFixed(2)}</span>`
                        },
                        {
                            field: 'after_hours',
                            label: 'Fazla Mesai (1.5x)',
                            sortable: true,
                            type: 'number',
                            formatter: (value) => `<span class="text-warning">${(value || 0).toFixed(2)}</span>`
                        },
                        {
                            field: 'holiday_hours',
                            label: 'Tatil (2x)',
                            sortable: true,
                            type: 'number',
                            formatter: (value) => `<span class="text-danger">${(value || 0).toFixed(2)}</span>`
                        },
                        {
                            field: 'total_hours',
                            label: 'Toplam Saat',
                            sortable: true,
                            type: 'number',
                            formatter: (value) => `<span class="fw-bold">${(value || 0).toFixed(2)}</span>`
                        },
                        {
                            field: 'updated_at',
                            label: 'Son Güncelleme',
                            sortable: true,
                            type: 'date',
                            formatter: (value) => {
                                if (!value) return '-';
                                const date = new Date(value);
                                return date.toLocaleDateString('tr-TR') + '<br><small class="text-muted">' + date.toLocaleTimeString('tr-TR') + '</small>';
                            }
                        }
                    ],
                    onRowClick: null,
                    onSort: null,
                    onPageChange: null,
                    pagination: false,
                    exportable: false,
                    refreshable: false,
                    skeletonLoading: false
                });

                // Update table with data
                userDetailsTable.updateData(userTableData, userTableData.length, 1);
            }, 100);
        } else {
            modal.addCustomSection({
                title: 'Kullanıcı Detayları',
                icon: 'fas fa-table',
                iconColor: 'text-success',
                customContent: '<div class="text-center text-muted py-4"><i class="fas fa-info-circle me-2"></i>Bu iş için kullanıcı detayı bulunamadı.</div>'
            });
        }
        
    } catch (error) {
        console.error('Error loading user details:', error);
        showError('Kullanıcı detayları yüklenirken bir hata oluştu.');
    }
}

// Make showUserDetails globally accessible for button onclick
window.showUserDetails = showUserDetails;

// Handle export
function handleExport() {
    if (!jobHoursTable || !jobHoursData || jobHoursData.length === 0) {
        showError('Dışa aktarılacak veri bulunamadı');
        return;
    }
    
    try {
        // Use table component's export functionality
        jobHoursTable.exportData('excel');
    } catch (error) {
        console.error('Export error:', error);
        showError('Dışa aktarma sırasında hata oluştu');
    }
}

// Export functions for external use
window.costAnalysis = {
    loadJobHoursData,
    showUserDetails
};

