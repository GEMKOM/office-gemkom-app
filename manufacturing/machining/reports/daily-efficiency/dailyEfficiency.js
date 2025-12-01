import { initNavbar } from '../../../../components/navbar.js';
import { HeaderComponent } from '../../../../components/header/header.js';
import { FiltersComponent } from '../../../../components/filters/filters.js';
import { StatisticsCards } from '../../../../components/statistics-cards/statistics-cards.js';
import { TableComponent } from '../../../../components/table/table.js';
import { fetchDailyEfficiencyReport } from '../../../../apis/machining/reports.js';

// Badge rendering functions
function renderTaskKeyBadge(value) {
    if (!value) return '-';
    return `
        <a href="/manufacturing/machining/tasks/?task=${value}" target="_blank" rel="noopener noreferrer" 
           style="text-decoration: none; cursor: pointer;">
            <span style="font-weight: 700; color: #0d6efd; font-family: 'Courier New', monospace; font-size: 1rem; background: rgba(13, 110, 253, 0.1); padding: 0.25rem 0.5rem; border-radius: 4px; border: 1px solid rgba(13, 110, 253, 0.2); display: inline-block;">
                ${value}
            </span>
        </a>
    `;
}

function renderTaskCountBadge(count) {
    return `
        <span class="status-badge status-green" style="min-width: auto; padding: 0.25rem 0.5rem; margin-left: 0.5rem;">
            ${count} ${count === 1 ? 'görev' : 'görev'}
        </span>
    `;
}

// State management
let reportData = null;
let reportFilters = null;
let headerComponent;
let dailyEfficiencyStats = null;
let usersTable = null;

// Initialize the report
document.addEventListener('DOMContentLoaded', async () => {
    await initNavbar();
    
    // Initialize header component
    initHeaderComponent();
    
    // Initialize Statistics Cards component
    dailyEfficiencyStats = new StatisticsCards('daily-efficiency-statistics', {
        cards: [
            { title: 'Toplam Kullanıcı', value: '0', icon: 'fas fa-users', color: 'primary', id: 'total-users-count' },
            { title: 'Toplam Çalışma Saati', value: '0', icon: 'fas fa-clock', color: 'success', id: 'total-work-hours' },
            { title: 'Toplam Görev', value: '0', icon: 'fas fa-tasks', color: 'info', id: 'total-tasks' },
            { title: 'Ortalama Verimlilik', value: '-', icon: 'fas fa-chart-line', color: 'warning', id: 'avg-efficiency' }
        ],
        compact: true,
        animation: true
    });
    
    await initializeDailyEfficiencyReport();
});

// Initialize header component
function initHeaderComponent() {
    headerComponent = new HeaderComponent({
        title: 'Günlük Verimlilik Raporu',
        subtitle: 'Kullanıcıların günlük görev verimliliği analizi',
        icon: 'chart-line',
        showBackButton: 'block',
        showRefreshButton: 'block',
        refreshButtonText: 'Yenile',
        onBackClick: () => {
            window.location.href = '../';
        },
        onRefreshClick: () => {
            loadReport();
        }
    });
}

async function initializeDailyEfficiencyReport() {
    try {
        // Initialize filters component
        initializeFiltersComponent();
        
        // Set default date to today
        setDefaultDateFilter();
        
        // Load initial report
        await loadReport();
        
    } catch (error) {
        console.error('Error initializing daily efficiency report:', error);
        showNotification('Rapor başlatılırken hata oluştu', 'error');
    }
}

function initializeFiltersComponent() {
    // Initialize filters component
    reportFilters = new FiltersComponent('filters-placeholder', {
        title: 'Rapor Filtreleri',
        onApply: (values) => {
            // Apply filters and reload report
            loadReport();
        },
        onClear: () => {
            // Clear filters and reload report
            setDefaultDateFilter();
            loadReport();
            showNotification('Filtreler temizlendi', 'info');
        },
        onFilterChange: (filterId, value) => {
            // Optional: Handle individual filter changes
            console.log(`Filter ${filterId} changed to:`, value);
        }
    });

    // Add date filter - default to previous business day
    const previousBusinessDay = getPreviousBusinessDay();
    reportFilters.addDateFilter({
        id: 'date-filter',
        label: 'Tarih',
        colSize: 3,
        value: previousBusinessDay.toISOString().split('T')[0]
    });
}

function getPreviousBusinessDay() {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    
    // If it's Monday (1), go back to Friday (3 days)
    // Otherwise, go back 1 day
    const daysToSubtract = dayOfWeek === 1 ? 3 : 1;
    
    const previousDay = new Date(today);
    previousDay.setDate(today.getDate() - daysToSubtract);
    
    return previousDay;
}

function setDefaultDateFilter() {
    const previousBusinessDay = getPreviousBusinessDay();
    const previousDayStr = previousBusinessDay.toISOString().split('T')[0];
    
    if (reportFilters) {
        reportFilters.setFilterValues({
            'date-filter': previousDayStr
        });
    }
}

async function loadReport() {
    try {
        showLoadingState();
        
        const filterValues = reportFilters ? reportFilters.getFilterValues() : {};
        // Default to previous business day if no date is set
        let date = filterValues['date-filter'];
        if (!date) {
            const previousBusinessDay = getPreviousBusinessDay();
            date = previousBusinessDay.toISOString().split('T')[0];
        }
        
        reportData = await fetchDailyEfficiencyReport(date);
        
        renderUsersTable();
        updateStatistics();
        
    } catch (error) {
        console.error('Error loading report:', error);
        showNotification('Rapor yüklenirken hata oluştu', 'error');
        renderErrorState();
    } finally {
        hideLoadingState();
    }
}

function renderUsersTable() {
    if (!reportData || !reportData.users || reportData.users.length === 0) {
        if (usersTable) {
            usersTable.updateData([]);
        } else {
            usersTable = new TableComponent('users-report-table-container', {
                title: 'Günlük Verimlilik Raporu',
                icon: 'users',
                iconColor: 'text-primary',
                columns: [],
                data: [],
                sortable: false,
                pagination: false,
                responsive: true,
                emptyMessage: 'Bu tarih için rapor verisi bulunamadı',
                emptyIcon: 'fas fa-inbox'
            });
        }
        return;
    }
    
    // Flatten data: create a row for each task with user information
    const tableData = [];
    reportData.users.forEach(user => {
        // Get user display name (fallback to username if name is empty)
        const userDisplayName = (user.first_name && user.last_name) 
            ? `${user.first_name} ${user.last_name}` 
            : user.username;
        
        if (user.tasks && user.tasks.length > 0) {
            user.tasks.forEach(task => {
                tableData.push({
                    ...task,
                    _userDisplayName: userDisplayName,
                    _username: user.username,
                    _userId: user.user_id,
                    _userFirstName: user.first_name,
                    _userLastName: user.last_name,
                    _userTotalDailyHours: user.total_daily_hours
                });
            });
        } else {
            // If user has no tasks, still show a row with user info
            tableData.push({
                _userDisplayName: userDisplayName,
                _username: user.username,
                _userId: user.user_id,
                _userFirstName: user.first_name,
                _userLastName: user.last_name,
                _userTotalDailyHours: user.total_daily_hours,
                task_key: null,
                task_name: null,
                job_no: null,
                machine_name: null,
                daily_duration_hours: null,
                estimated_hours: null,
                total_hours_spent: null,
                efficiency: null
            });
        }
    });
    
    // Initialize or update table
    if (usersTable) {
        // If table exists but was created with empty columns, we need to recreate it
        if (usersTable.options.columns.length === 0) {
            // Destroy old table and create new one
            const container = document.getElementById('users-report-table-container');
            if (container) {
                container.innerHTML = '';
            }
            usersTable = null;
        }
    }
    
    if (!usersTable) {
        const container = document.getElementById('users-report-table-container');
        if (!container) {
            console.error('Container element "users-report-table-container" not found!');
            return;
        }
        usersTable = new TableComponent('users-report-table-container', {
            title: 'Günlük Verimlilik Raporu',
            icon: 'tasks',
            iconColor: 'text-primary',
            groupBy: '_userId',
            groupCollapsible: true,
            defaultGroupExpanded: true,
            groupHeaderFormatter: (groupValue, groupRows) => {
                // Get user info from first row
                const firstRow = groupRows[0];
                const userDisplayName = firstRow._userDisplayName || firstRow._username;
                const usernameHtml = (firstRow._userFirstName && firstRow._userLastName) 
                    ? `<small class="text-muted ms-2">(@${firstRow._username})</small>` 
                    : '';
                const totalHours = firstRow._userTotalDailyHours || 0;
                
                return `
                    <div class="d-flex align-items-center justify-content-between">
                        <div class="d-flex align-items-center">
                            <i class="fas fa-user me-2 text-primary"></i>
                            <strong>${userDisplayName}${usernameHtml}</strong>
                            ${renderTaskCountBadge(groupRows.length)}
                        </div>
                        <div class="text-muted">
                            <i class="fas fa-clock me-1"></i>
                            <span>Toplam: ${totalHours.toFixed(2)} saat</span>
                        </div>
                    </div>
                `;
            },
            columns: [
                {
                    field: 'task_key',
                    label: 'TI No',
                    sortable: true,
                    formatter: (value) => renderTaskKeyBadge(value)
                },
                {
                    field: 'task_name',
                    label: 'Görev Adı',
                    sortable: true,
                    headerClass: 'text-nowrap',
                    cellClass: 'text-truncate',
                    formatter: (value) => {
                        if (!value) return '-';
                        // Truncate long task names
                        const maxLength = 30;
                        return value.length > maxLength 
                            ? `<span title="${value}">${value.substring(0, maxLength)}...</span>`
                            : value;
                    }
                },
                {
                    field: 'job_no',
                    label: 'İş No',
                    sortable: true,
                    headerClass: 'text-nowrap',
                    cellClass: 'text-truncate',
                    formatter: (value) => value || '-'
                },
                {
                    field: 'machine_name',
                    label: 'Makine',
                    sortable: true,
                    headerClass: 'text-nowrap',
                    cellClass: 'text-truncate',
                    formatter: (value) => {
                        if (!value) return '-';
                        // Truncate long machine names
                        const maxLength = 25;
                        return value.length > maxLength 
                            ? `<span title="${value}">${value.substring(0, maxLength)}...</span>`
                            : value;
                    }
                },
                {
                    field: 'daily_duration_hours',
                    label: 'Günlük Süre (saat)',
                    sortable: true,
                    formatter: (value) => {
                        if (value === null || value === undefined) return '-';
                        return `<span class="text-success fw-bold">${value.toFixed(2)}</span>`;
                    }
                },
                {
                    field: 'estimated_hours',
                    label: 'Tahmini Saat',
                    sortable: true,
                    formatter: (value) => {
                        return value !== null && value !== undefined ? `${value.toFixed(2)}` : '-';
                    }
                },
                {
                    field: 'total_hours_spent',
                    label: 'Toplam Harcanan (saat)',
                    sortable: true,
                    formatter: (value) => {
                        return value !== null && value !== undefined ? `${value.toFixed(2)}` : '-';
                    }
                },
                {
                    field: 'efficiency',
                    label: 'Verimlilik',
                    sortable: true,
                    formatter: (value) => {
                        if (value === null || value === undefined) return '-';
                        // Value is already a percentage (e.g., 165.0 means 165%)
                        const percentage = value;
                        let colorClass = '';
                        if (percentage >= 100) {
                            colorClass = 'text-success';
                        } else if (percentage >= 80) {
                            colorClass = 'text-warning';
                        } else {
                            colorClass = 'text-danger';
                        }
                        return `<span class="${colorClass} fw-bold">${Math.round(percentage)}%</span>`;
                    }
                }
            ],
            data: tableData,
            sortable: true,
            pagination: false,
            responsive: true,
            emptyMessage: 'Bu tarih için rapor verisi bulunamadı',
            emptyIcon: 'fas fa-inbox'
        });
    } else {
        // Update existing table
        usersTable.updateData(tableData);
    }
}


function updateStatistics() {
    if (!reportData || !reportData.users || reportData.users.length === 0) {
        if (dailyEfficiencyStats) {
            dailyEfficiencyStats.updateValues({
                0: '0',
                1: '0',
                2: '0',
                3: '-'
            });
        }
        return;
    }
    
    const totalUsers = reportData.users.length;
    const totalWorkHours = reportData.users.reduce((sum, user) => sum + (user.total_daily_hours || 0), 0);
    const totalTasks = reportData.users.reduce((sum, user) => sum + (user.tasks ? user.tasks.length : 0), 0);
    
    // Calculate average efficiency
    let totalEfficiency = 0;
    let efficiencyCount = 0;
    reportData.users.forEach(user => {
        if (user.tasks && user.tasks.length > 0) {
            user.tasks.forEach(task => {
                if (task.efficiency !== null && task.efficiency !== undefined) {
                    totalEfficiency += task.efficiency;
                    efficiencyCount++;
                }
            });
        }
    });
    
    const avgEfficiency = efficiencyCount > 0 
        ? Math.round(totalEfficiency / efficiencyCount)
        : '-';
    
    if (dailyEfficiencyStats) {
        dailyEfficiencyStats.updateValues({
            0: totalUsers.toString(),
            1: totalWorkHours.toFixed(2),
            2: totalTasks.toString(),
            3: avgEfficiency !== '-' ? `${avgEfficiency}%` : '-'
        });
    }
}

function showLoadingState() {
    if (usersTable) {
        usersTable.setLoading(true);
    } else {
        const container = document.getElementById('users-report-table-container');
        container.innerHTML = `
            <div class="dashboard-card">
                <div class="card-body text-center py-5">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Yükleniyor...</span>
                    </div>
                    <div class="mt-3">Rapor yükleniyor...</div>
                </div>
            </div>
        `;
    }
}

function hideLoadingState() {
    if (usersTable) {
        usersTable.setLoading(false);
    }
}

function renderErrorState() {
    if (usersTable) {
        usersTable.updateData([]);
    } else {
        const container = document.getElementById('users-report-table-container');
        container.innerHTML = `
            <div class="dashboard-card">
                <div class="card-body text-center text-danger py-5">
                    <i class="fas fa-exclamation-triangle fa-3x mb-3"></i><br>
                    Rapor yüklenirken bir hata oluştu
                </div>
            </div>
        `;
    }
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `alert alert-${type === 'error' ? 'danger' : type} alert-dismissible fade show position-fixed`;
    notification.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
    notification.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 5000);
}

