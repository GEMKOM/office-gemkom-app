import { initNavbar } from '../../../../../components/navbar.js';
import { TableComponent } from '../../../../../components/table/table.js';
import { HeaderComponent } from '../../../../../components/header/header.js';
import { FiltersComponent } from '../../../../../components/filters/filters.js';
import { StatisticsCards } from '../../../../../components/statistics-cards/statistics-cards.js';
import { DisplayModal } from '../../../../../components/display-modal/display-modal.js';
import { getWeldingJobCostTotals, getWeldingJobCostDetail } from '../../../../../apis/welding/reports.js';

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
    await loadJobHoursData();
});

// Initialize Header Component
function initHeaderComponent() {
    headerComponent = new HeaderComponent({
        title: 'Maliyet Analizi Raporu',
        subtitle: 'İş numaralarına göre detaylı maliyet analizi, saat başı maliyet hesaplamaları ve kullanıcı bazlı detaylar. Tüm iş numaraları görüntülenir, belirli bir iş numarası için filtreleme yapabilirsiniz.',
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
                field: 'weekday_work_hours',
                label: 'Hafta İçi Saat',
                sortable: true,
                type: 'number',
                formatter: (value) => `<span class="text-primary">${value.toFixed(1)}</span>`
            },
            {
                field: 'after_hours_hours',
                label: 'Mesai Saat',
                sortable: true,
                type: 'number',
                formatter: (value) => `<span class="text-warning">${value.toFixed(1)}</span>`
            },
            {
                field: 'sunday_hours',
                label: 'Pazar Saat',
                sortable: true,
                type: 'number',
                formatter: (value) => `<span class="text-danger">${value.toFixed(1)}</span>`
            },
            {
                field: 'weekday_work_cost',
                label: 'Hafta İçi Maliyet',
                sortable: true,
                type: 'number',
                formatter: (value) => `<span class="text-primary">€${value.toFixed(2)}</span>`
            },
            {
                field: 'after_hours_cost',
                label: 'Mesai Maliyet',
                sortable: true,
                type: 'number',
                formatter: (value) => `<span class="text-warning">€${value.toFixed(2)}</span>`
            },
            {
                field: 'sunday_cost',
                label: 'Pazar Maliyet',
                sortable: true,
                type: 'number',
                formatter: (value) => `<span class="text-danger">€${value.toFixed(2)}</span>`
            },
            {
                field: 'total_cost',
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
                    <button class="btn btn-sm btn-outline-primary" onclick="showUserDetails('${rowData.job_no}')" title="Kullanıcı Detaylarını Görüntüle">
                        <i class="fas fa-users me-1"></i>Detaylar
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
    // Show user details modal
    showUserDetails(rowData.job_no);
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

// Load job cost data
async function loadJobHoursData() {
    if (isLoading) return;
    
    isLoading = true;
    
    try {
        // Get current filters
        const filters = filtersComponent ? filtersComponent.getFilterValues() : {};
        
        // Use the welding cost analysis API
        const data = await getWeldingJobCostTotals({
            job_no: filters.job_no || undefined
        });
        
        // Process the data for display
        jobHoursData = processJobCostData(data.results || []);
        totalJobs = data.count || jobHoursData.length;
        
        // Update statistics
        updateStatistics(data);
        
        // Update table
        if (jobHoursTable) {
            jobHoursTable.updateData(jobHoursData, {
                totalItems: totalJobs,
                currentPage: currentPage,
                pageSize: pageSize
            });
        }
        
    } catch (error) {
        console.error('Error loading job cost data:', error);
        showError('Veri yüklenirken bir hata oluştu. Lütfen sayfayı yenileyin.');
    } finally {
        isLoading = false;
    }
}

// Process job cost data for display
function processJobCostData(results) {
    return results.map(job => {
        const totalHours = (job.hours.regular || 0) + (job.hours.after_hours || 0) + (job.hours.holiday || 0);
        const costPerHour = totalHours > 0 ? (job.total_cost || 0) / totalHours : 0;
        
        return {
            job_no: job.job_no,
            weekday_work_hours: job.hours.regular || 0,
            after_hours_hours: job.hours.after_hours || 0,
            sunday_hours: job.hours.holiday || 0,
            weekday_work_cost: job.costs.regular || 0,
            after_hours_cost: job.costs.after_hours || 0,
            sunday_cost: job.costs.holiday || 0,
            total_cost: job.total_cost || 0,
            cost_per_hour: costPerHour,
            currency: job.currency || 'EUR',
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
    
    // Find most expensive job (highest total cost)
    const mostExpensiveJob = results.reduce((max, job) => 
        (job.total_cost || 0) > (max.total_cost || 0) ? job : max
    );
    
    // Find most expensive per hour job
    const mostExpensivePerHourJob = results.reduce((max, job) => {
        const totalHours = (job.hours.regular || 0) + (job.hours.after_hours || 0) + (job.hours.holiday || 0);
        const maxHours = (max.hours.regular || 0) + (max.hours.after_hours || 0) + (max.hours.holiday || 0);
        const jobCostPerHour = totalHours > 0 ? (job.total_cost || 0) / totalHours : 0;
        const maxCostPerHour = maxHours > 0 ? (max.total_cost || 0) / maxHours : 0;
        return jobCostPerHour > maxCostPerHour ? job : max;
    });
    
    // Find job with most overtime cost (after hours + holiday)
    const mostOvertimeCostJob = results.reduce((max, job) => {
        const jobOvertimeCost = (job.costs.after_hours || 0) + (job.costs.holiday || 0);
        const maxOvertimeCost = (max.costs.after_hours || 0) + (max.costs.holiday || 0);
        return jobOvertimeCost > maxOvertimeCost ? job : max;
    });
    
    // Find job with most total hours
    const mostHoursJob = results.reduce((max, job) => {
        const jobTotalHours = (job.hours.regular || 0) + (job.hours.after_hours || 0) + (job.hours.holiday || 0);
        const maxTotalHours = (max.hours.regular || 0) + (max.hours.after_hours || 0) + (max.hours.holiday || 0);
        return jobTotalHours > maxTotalHours ? job : max;
    });
    
    // Calculate values for display
    const mostExpensivePerHourValue = (() => {
        const totalHours = (mostExpensivePerHourJob.hours.regular || 0) + (mostExpensivePerHourJob.hours.after_hours || 0) + (mostExpensivePerHourJob.hours.holiday || 0);
        return totalHours > 0 ? (mostExpensivePerHourJob.total_cost || 0) / totalHours : 0;
    })();
    
    const mostOvertimeCostValue = (mostOvertimeCostJob.costs.after_hours || 0) + (mostOvertimeCostJob.costs.holiday || 0);
    
    const mostHoursValue = (mostHoursJob.hours.regular || 0) + (mostHoursJob.hours.after_hours || 0) + (mostHoursJob.hours.holiday || 0);
    
    costAnalysisStats.updateValues({
        0: `${mostExpensiveJob.job_no}<br><small>€${(mostExpensiveJob.total_cost || 0).toFixed(2)}</small>`,
        1: `${mostExpensivePerHourJob.job_no}<br><small>€${mostExpensivePerHourValue.toFixed(2)}/saat</small>`,
        2: `${mostOvertimeCostJob.job_no}<br><small>€${mostOvertimeCostValue.toFixed(2)}</small>`,
        3: `${mostHoursJob.job_no}<br><small>${mostHoursValue.toFixed(1)} saat</small>`
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
        const totalCost = users.reduce((sum, user) => sum + (user.total_cost || 0), 0);
        const totalWeekdayHours = users.reduce((sum, user) => sum + (user.hours.regular || 0), 0);
        const totalAfterHours = users.reduce((sum, user) => sum + (user.hours.after_hours || 0), 0);
        const totalSundayHours = users.reduce((sum, user) => sum + (user.hours.holiday || 0), 0);
        const totalHours = totalWeekdayHours + totalAfterHours + totalSundayHours;
        const costPerHour = totalHours > 0 ? totalCost / totalHours : 0;
        const totalAfterHoursCost = users.reduce((sum, user) => sum + (user.costs.after_hours || 0), 0);
        const totalSundayCost = users.reduce((sum, user) => sum + (user.costs.holiday || 0), 0);
        const overtimeCost = totalAfterHoursCost + totalSundayCost;

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
                    id: 'total_cost',
                    label: 'Toplam Maliyet',
                    value: totalCost,
                    type: 'currency',
                    icon: 'fas fa-euro-sign',
                    format: (value) => `€${value.toFixed(2)}`,
                    colSize: 3
                },
                {
                    id: 'overtime_cost',
                    label: 'Mesai Maliyeti',
                    value: overtimeCost,
                    type: 'currency',
                    icon: 'fas fa-clock',
                    format: (value) => `€${value.toFixed(2)}`,
                    colSize: 3
                },
                {
                    id: 'cost_per_hour',
                    label: 'Saat Başı Maliyet',
                    value: costPerHour,
                    type: 'currency',
                    icon: 'fas fa-calculator',
                    format: (value) => `€${value.toFixed(2)}`,
                    colSize: 3
                },
                
                {
                    id: 'total_weekday_hours',
                    label: 'Hafta İçi Saat',
                    value: totalWeekdayHours,
                    type: 'number',
                    icon: 'fas fa-calendar-day',
                    format: (value) => `${value.toFixed(1)} saat`,
                    colSize: 3
                },
                {
                    id: 'total_after_hours',
                    label: 'Mesai Saat',
                    value: totalAfterHours,
                    type: 'number',
                    icon: 'fas fa-clock',
                    format: (value) => `${value.toFixed(1)} saat`,
                    colSize: 3
                },
                {
                    id: 'total_sunday_hours',
                    label: 'Pazar Saat',
                    value: totalSundayHours,
                    type: 'number',
                    icon: 'fas fa-calendar',
                    format: (value) => `${value.toFixed(1)} saat`,
                    colSize: 3
                },
                {
                    id: 'total_hours',
                    label: 'Toplam Saat',
                    value: totalHours,
                    type: 'number',
                    icon: 'fas fa-clock',
                    format: (value) => `${value.toFixed(1)} saat`,
                    colSize: 3
                },
            ]
        });
        
        // Add users table using TableComponent
        if (users.length > 0) {
            // Process user data for table display
            const userTableData = users.map(user => ({
                user: user.user,
                user_id: user.user_id,
                issue_count: user.issue_count,
                issue_keys: user.issue_keys,
                weekday_work_hours: user.hours.regular || 0,
                after_hours_hours: user.hours.after_hours || 0,
                sunday_hours: user.hours.holiday || 0,
                total_hours: (user.hours.regular || 0) + (user.hours.after_hours || 0) + (user.hours.holiday || 0),
                weekday_work_cost: user.costs.regular || 0,
                after_hours_cost: user.costs.after_hours || 0,
                sunday_cost: user.costs.holiday || 0,
                total_cost: user.total_cost || 0,
                currency: user.currency || 'EUR',
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
                            field: 'weekday_work_hours',
                            label: 'Hafta İçi Saat',
                            sortable: true,
                            type: 'number',
                            formatter: (value) => `${(value || 0).toFixed(1)}`
                        },
                        {
                            field: 'after_hours_hours',
                            label: 'Mesai Saat',
                            sortable: true,
                            type: 'number',
                            formatter: (value) => `${(value || 0).toFixed(1)}`
                        },
                        {
                            field: 'sunday_hours',
                            label: 'Pazar Saat',
                            sortable: true,
                            type: 'number',
                            formatter: (value) => `${(value || 0).toFixed(1)}`
                        },
                        {
                            field: 'total_hours',
                            label: 'Toplam Saat',
                            sortable: true,
                            type: 'number',
                            formatter: (value) => `<span class="fw-bold">${(value || 0).toFixed(1)}</span>`
                        },
                        {
                            field: 'weekday_work_cost',
                            label: 'Hafta İçi Maliyet',
                            sortable: true,
                            type: 'number',
                            formatter: (value) => `€${(value || 0).toFixed(2)}`
                        },
                        {
                            field: 'after_hours_cost',
                            label: 'Mesai Maliyet',
                            sortable: true,
                            type: 'number',
                            formatter: (value) => `€${(value || 0).toFixed(2)}`
                        },
                        {
                            field: 'sunday_cost',
                            label: 'Pazar Maliyet',
                            sortable: true,
                            type: 'number',
                            formatter: (value) => `€${(value || 0).toFixed(2)}`
                        },
                        {
                            field: 'total_cost',
                            label: 'Toplam Maliyet',
                            sortable: true,
                            type: 'number',
                            formatter: (value) => `<span class="fw-bold">€${(value || 0).toFixed(2)}</span>`
                        },
                        {
                            field: 'cost_per_hour',
                            label: 'Saat Başı Maliyet',
                            sortable: true,
                            type: 'number',
                            formatter: (value) => `<span class="fw-bold">€${(value || 0).toFixed(2)}</span>`
                        },
                        {
                            field: 'issues',
                            label: 'İş Anahtarları',
                            sortable: false,
                            type: 'text',
                            formatter: (value, rowData) => {
                                const keys = rowData.raw_data?.issues || [];
                                
                                if (!keys || keys.length === 0) {
                                    return '-';
                                }
                                
                                return keys.map(key => {
                                    let badgeClass = 'badge task-key-link me-1 mb-1';
                                    
                                    // Set background color based on status
                                    switch(key.status) {
                                        case 'completed':
                                            badgeClass += ' bg-success';
                                            break;
                                        case 'in_progress':
                                            badgeClass += ' bg-primary';
                                            break;
                                        case 'waiting':
                                            badgeClass += ' bg-danger';
                                            break;
                                        default:
                                            badgeClass += ' bg-secondary';
                                    }
                                    
                                    return `<a href="/manufacturing/welding/tasks/list/?task=${key.key}" target="_blank" class="${badgeClass}">${key.key}</a>`;
                                }).join('');
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

                // Calculate cost per hour for each user
                userTableData.forEach(user => {
                    const totalHours = user.weekday_work_hours + user.after_hours_hours + user.sunday_hours;
                    user.cost_per_hour = totalHours > 0 ? user.total_cost / totalHours : 0;
                });

                // Update table with data
                userDetailsTable.updateData(userTableData, {
                    totalItems: userTableData.length,
                    currentPage: 1,
                    pageSize: userTableData.length
                });
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


// Export functions for external use
window.costAnalysis = {
    loadJobHoursData,
    showUserDetails
};

