import { initNavbar } from '../../../../components/navbar.js';
import { HeaderComponent } from '../../../../components/header/header.js';
import { FiltersComponent } from '../../../../components/filters/filters.js';
import { StatisticsCards } from '../../../../components/statistics-cards/statistics-cards.js';
import { TableComponent } from '../../../../components/table/table.js';
import { DisplayModal } from '../../../../components/display-modal/display-modal.js';
import { fetchDailyUserReport } from '../../../../apis/machining/dailyReport.js';

// State management
let reportData = null;
let reportFilters = null;
let headerComponent;
let dailyReportStats = null;
let usersTable = null;

// Initialize the report
document.addEventListener('DOMContentLoaded', async () => {
    await initNavbar();
    
    // Initialize header component
    initHeaderComponent();
    
    // Initialize Statistics Cards component
    dailyReportStats = new StatisticsCards('daily-report-statistics', {
        cards: [
            { title: 'Toplam Kullanıcı', value: '0', icon: 'fas fa-users', color: 'primary', id: 'total-users-count' },
            { title: 'Toplam Çalışma Saati', value: '0', icon: 'fas fa-clock', color: 'success', id: 'total-work-hours' },
            { title: 'Toplam Boşta Geçen Saat', value: '0', icon: 'fas fa-hourglass-half', color: 'warning', id: 'total-idle-hours' },
            { title: 'Ortalama Verimlilik', value: '0%', icon: 'fas fa-chart-line', color: 'info', id: 'avg-efficiency' }
        ],
        compact: true,
        animation: true
    });
    
    await initializeDailyReport();
});

// Initialize header component
function initHeaderComponent() {
    headerComponent = new HeaderComponent({
        title: 'Günlük Kullanıcı Raporu',
        subtitle: 'Kullanıcıların günlük çalışma performansı ve zaman kullanımı analizi',
        icon: 'calendar-day',
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

async function initializeDailyReport() {
    try {
        // Initialize filters component
        initializeFiltersComponent();
        
        // Set default date to today
        setDefaultDateFilter();
        
        // Load initial report
        await loadReport();
        
    } catch (error) {
        console.error('Error initializing daily report:', error);
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

    // Add date filter - default to yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    reportFilters.addDateFilter({
        id: 'date-filter',
        label: 'Tarih',
        colSize: 3,
        value: yesterday.toISOString().split('T')[0]
    });
}

function setDefaultDateFilter() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    if (reportFilters) {
        reportFilters.setFilterValues({
            'date-filter': yesterdayStr
        });
    }
}

async function loadReport() {
    try {
        showLoadingState();
        
        const filterValues = reportFilters ? reportFilters.getFilterValues() : {};
        // Default to yesterday if no date is set
        let date = filterValues['date-filter'];
        if (!date) {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            date = yesterday.toISOString().split('T')[0];
        }
        
        reportData = await fetchDailyUserReport(date);
        
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
                title: 'Günlük Kullanıcı Raporu',
                icon: 'users',
                iconColor: 'text-primary',
                columns: [],
                data: [],
                sortable: false,
                pagination: false
            });
        }
        return;
    }
    
    // Prepare table data
    const tableData = reportData.users.map(user => {
        // Calculate total_time_in_office_hours if not provided
        // Include total_hold_hours as idle time in efficiency calculation
        const totalTimeInOffice = user.total_time_in_office_hours || 
            (user.total_work_hours + user.total_idle_hours + (user.total_hold_hours || 0));
        
        const efficiency = totalTimeInOffice > 0 
            ? ((user.total_work_hours / totalTimeInOffice) * 100).toFixed(1)
            : '0';
        
        // Get user display name (fallback to username if name is empty)
        const userDisplayName = (user.first_name && user.last_name) 
            ? `${user.first_name} ${user.last_name}` 
            : user.username;
        
        const hasWarnings = getWarnings(user, totalTimeInOffice);
        
        return {
            ...user,
            _displayName: userDisplayName,
            _totalTimeInOffice: totalTimeInOffice,
            _efficiency: parseFloat(efficiency),
            _hasWarnings: hasWarnings.length > 0,
            _warnings: hasWarnings
        };
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
            title: 'Günlük Kullanıcı Raporu',
            icon: 'users',
            iconColor: 'text-primary',
            columns: [
                {
                    field: '_displayName',
                    label: 'Kullanıcı',
                    sortable: true,
                    formatter: (value, row) => {
                        const usernameHtml = (row.first_name && row.last_name) 
                            ? `<small class="text-muted ms-2">(@${row.username})</small>` 
                            : '';
                        const warningBadge = row._hasWarnings 
                            ? `<span class="badge bg-warning text-dark ms-2" title="${row._warnings.join('; ')}">
                                <i class="fas fa-exclamation-triangle me-1"></i>Uyarı
                               </span>`
                            : '';
                        return `
                            <div class="d-flex align-items-center">
                                <i class="fas fa-user me-2 text-primary"></i>
                                <span>${value}${usernameHtml}</span>
                                ${warningBadge}
                            </div>
                        `;
                    }
                },
                {
                    field: 'total_work_hours',
                    label: 'Çalışma Saati',
                    sortable: true,
                    formatter: (value) => {
                        return `<span class="text-success fw-bold">${(value || 0).toFixed(2)}</span>`;
                    }
                },
                {
                    field: 'total_idle_hours',
                    label: 'Boşta Geçen Saat',
                    sortable: true,
                    formatter: (value) => {
                        return `<span class="text-danger fw-bold">${(value || 0).toFixed(2)}</span>`;
                    }
                },
                {
                    field: 'total_hold_hours',
                    label: 'Bekleme Saati',
                    sortable: true,
                    formatter: (value) => {
                        return `<span class="text-secondary fw-bold">${(value || 0).toFixed(2)}</span>`;
                    }
                },
                {
                    field: '_efficiency',
                    label: 'Verimlilik',
                    sortable: true,
                    formatter: (value) => {
                        let colorClass, styleAttr = '';
                        if (value >= 100) {
                            styleAttr = 'style="color: #6f42c1;"'; // Purple
                        } else if (value >= 80) {
                            colorClass = 'text-success';
                        } else if (value >= 60) {
                            colorClass = 'text-warning';
                        } else {
                            colorClass = 'text-danger';
                        }
                        return `<span class="${colorClass || ''} fw-bold" ${styleAttr}>${value.toFixed(1)}%</span>`;
                    }
                },
                {
                    field: 'total_tasks_completed',
                    label: 'Tamamlanan Görev',
                    sortable: true,
                    formatter: (value) => {
                        return value !== undefined ? `<span class="badge bg-primary">${value}</span>` : '-';
                    }
                },
                {
                    field: 'tasks',
                    label: 'Görev Sayısı',
                    sortable: true,
                    formatter: (value) => {
                        return value ? `<span class="badge bg-info">${value.length}</span>` : '0';
                    }
                }
            ],
            actions: [
                {
                    key: 'details',
                    label: 'Detaylar',
                    icon: 'fas fa-eye',
                    class: 'btn-outline-primary',
                    onClick: (row) => showUserDetails(row)
                }
            ],
            data: tableData,
            sortable: true,
            pagination: true,
            itemsPerPage: 20,
            responsive: true,
            emptyMessage: 'Bu tarih için rapor verisi bulunamadı',
            emptyIcon: 'fas fa-inbox'
        });
    } else {
        // Update existing table
        usersTable.updateData(tableData);
    }
}

function showUserDetails(user) {
    // Calculate values
    // Include total_hold_hours as idle time in efficiency calculation
    const totalTimeInOffice = user._totalTimeInOffice || 
        (user.total_work_hours + user.total_idle_hours + (user.total_hold_hours || 0));
    const efficiency = totalTimeInOffice > 0 
        ? ((user.total_work_hours / totalTimeInOffice) * 100).toFixed(1)
        : '0';
    const hasWarnings = user._warnings || getWarnings(user, totalTimeInOffice);
    
    // Get user display name
    const userDisplayName = user._displayName || 
        ((user.first_name && user.last_name) ? `${user.first_name} ${user.last_name}` : user.username);
    const modalTitle = `${userDisplayName}${(user.first_name && user.last_name) ? ` (@${user.username})` : ''}`;
    
    // Create DisplayModal instance
    const displayModal = new DisplayModal('user-details-modal-container', {
        title: modalTitle,
        icon: 'fas fa-user',
        size: 'xl',
        showEditButton: false
    });
    
    // Add warnings section if there are any
    if (hasWarnings.length > 0) {
        displayModal.addCustomSection({
            title: 'Uyarılar',
            icon: 'fas fa-exclamation-triangle',
            iconColor: 'text-warning',
            customContent: `
                <div class="alert alert-warning mb-0">
                    <ul class="mb-0">
                        ${hasWarnings.map(warning => `<li>${warning}</li>`).join('')}
                    </ul>
                </div>
            `
        });
    }
    
    // Add statistics section with custom content - compact, all on one row
    // Calculate column size based on available fields
    let colSize = 3;
    const hasTasksCompleted = user.total_tasks_completed !== undefined;
    const hasHoldHours = user.total_hold_hours !== undefined && user.total_hold_hours > 0;
    
    if (hasTasksCompleted && hasHoldHours) {
        colSize = 2; // 6 fields: work, idle, hold, efficiency, tasks completed
    } else if (hasTasksCompleted || hasHoldHours) {
        colSize = 2; // 5 fields
    }
    
    let statsContent = `
        <div class="row mb-3">
            <div class="col-md-${colSize}">
                <div class="stat-item" style="padding: 0.5rem;">
                    <div class="stat-label" style="font-size: 0.75rem; margin-bottom: 0.25rem;">
                        <i class="fas fa-clock me-1"></i>Çalışma Saati
                    </div>
                    <div class="stat-value text-success" style="font-size: 1.25rem;">${user.total_work_hours.toFixed(2)}</div>
                </div>
            </div>
            <div class="col-md-${colSize}">
                <div class="stat-item" style="padding: 0.5rem;">
                    <div class="stat-label" style="font-size: 0.75rem; margin-bottom: 0.25rem;">
                        <i class="fas fa-hourglass-half me-1"></i>Boşta Geçen Saat
                    </div>
                    <div class="stat-value text-danger" style="font-size: 1.25rem;">${user.total_idle_hours.toFixed(2)}</div>
                </div>
            </div>
            ${hasHoldHours ? `
            <div class="col-md-${colSize}">
                <div class="stat-item" style="padding: 0.5rem;">
                    <div class="stat-label" style="font-size: 0.75rem; margin-bottom: 0.25rem;">
                        <i class="fas fa-pause-circle me-1"></i>Bekleme Saati
                    </div>
                    <div class="stat-value text-secondary" style="font-size: 1.25rem;">${(user.total_hold_hours || 0).toFixed(2)}</div>
                </div>
            </div>
            ` : ''}
            <div class="col-md-${colSize}">
                <div class="stat-item" style="padding: 0.5rem;">
                    <div class="stat-label" style="font-size: 0.75rem; margin-bottom: 0.25rem;">
                        <i class="fas fa-chart-line me-1"></i>Verimlilik
                    </div>
                    <div ${getEfficiencyColorClass(parseFloat(efficiency))} style="font-size: 1.25rem;">${efficiency}%</div>
                </div>
            </div>
    `;
    
    if (hasTasksCompleted) {
        statsContent += `
            <div class="col-md-${colSize}">
                <div class="stat-item" style="padding: 0.5rem;">
                    <div class="stat-label" style="font-size: 0.75rem; margin-bottom: 0.25rem;">
                        <i class="fas fa-check-circle me-1"></i>Tamamlanan Görev
                    </div>
                    <div class="stat-value text-primary" style="font-size: 1.25rem;">${user.total_tasks_completed}</div>
                </div>
            </div>
        `;
    }
    
    statsContent += `</div>`;
    
    displayModal.addCustomSection({
        title: 'İstatistikler',
        icon: 'fas fa-chart-bar',
        iconColor: 'text-primary',
        customContent: statsContent
    });
    
    // Add tasks section with TableComponent (no section title, table has its own)
    const tasksContainerId = `tasks-table-${Date.now()}`;
    displayModal.addCustomSection({
        customContent: `<div id="${tasksContainerId}"></div>`
    });
    
    // Add idle periods section with TableComponent (no section title, table has its own)
    const idlePeriodsContainerId = `idle-periods-table-${Date.now()}`;
    displayModal.addCustomSection({
        customContent: `<div id="${idlePeriodsContainerId}"></div>`
    });
    
    // Add hold tasks section with TableComponent (no section title, table has its own)
    const holdTasksContainerId = `hold-tasks-table-${Date.now()}`;
    displayModal.addCustomSection({
        customContent: `<div id="${holdTasksContainerId}"></div>`
    });
    
    // Render and show modal
    displayModal.render().show();
    
    // Set up event delegation for comment buttons on document (works even if buttons are added later)
    // Use a one-time setup that will handle all comment buttons in the modal
    const handleCommentClick = (e) => {
        const btn = e.target.closest('.comment-view-btn');
        if (btn) {
            e.preventDefault();
            e.stopPropagation();
            const commentEncoded = btn.getAttribute('data-comment');
            if (commentEncoded) {
                const comment = decodeURIComponent(commentEncoded);
                showComment(comment);
            }
        }
    };
    
    // Attach to document with a namespace so we can remove it later if needed
    document.addEventListener('click', handleCommentClick);
    
    // Create tasks table after modal is shown
    setTimeout(() => {
        const tasksContainer = document.getElementById(tasksContainerId);
        if (tasksContainer && user.tasks && user.tasks.length > 0) {
            const tasksTable = new TableComponent(tasksContainerId, {
                title: `Görevler (${user.tasks.length})`,
                icon: 'fas fa-tasks',
                iconColor: 'text-primary',
                columns: [
                    {
                        field: 'timer_id',
                        label: '#',
                        sortable: true,
                        formatter: (value) => {
                            if (!value) return '-';
                            return `<a href="/manufacturing/machining/reports/finished-timers/?edit=${value}" target="_blank" rel="noopener noreferrer" class="badge bg-secondary text-decoration-none" style="cursor: pointer;">#${value}</a>`;
                        }
                    },
                    {
                        field: 'start_time',
                        label: 'Başlangıç',
                        sortable: true,
                        formatter: (value) => formatDateTime(value)
                    },
                    {
                        field: 'finish_time',
                        label: 'Bitiş',
                        sortable: true,
                        formatter: (value) => formatDateTime(value)
                    },
                    {
                        field: 'task_key',
                        label: 'TI No',
                        sortable: true,
                        formatter: (value) => {
                            if (!value) return '-';
                            return `<a href="/manufacturing/machining/tasks/list/?task=${value}" target="_blank" rel="noopener noreferrer" class="badge bg-primary text-decoration-none" style="cursor: pointer;">${value}</a>`;
                        }
                    },
                    {
                        field: 'task_name',
                        label: 'Görev Adı',
                        sortable: true
                    },
                    {
                        field: 'job_no',
                        label: 'İş No',
                        sortable: true
                    },
                    {
                        field: 'duration_minutes',
                        label: 'Süre',
                        sortable: true,
                        formatter: (value) => formatDurationFromMinutes(value)
                    },
                    {
                        field: 'estimated_hours',
                        label: 'Tahmini',
                        sortable: true,
                        formatter: (value) => value !== null && value !== undefined ? `${value.toFixed(1)}s` : '-'
                    },
                    {
                        field: 'total_hours_spent',
                        label: 'Toplam Harcanan',
                        sortable: true,
                        formatter: (value) => value !== null && value !== undefined ? `${value.toFixed(2)}s` : '-'
                    },
                    {
                        field: 'machine_name',
                        label: 'Makine',
                        sortable: true
                    },
                    {
                        field: 'manual_entry',
                        label: 'Manuel',
                        sortable: true,
                        formatter: (value) => value ? '<span class="badge bg-success">Manuel</span>' : '<span class="text-muted">-</span>'
                    },
                    {
                        field: 'comment',
                        label: 'Yorum',
                        sortable: false,
                        formatter: (value, row) => {
                            if (!value) return '-';
                            // Use encodeURIComponent to safely store in data attribute
                            const commentEncoded = encodeURIComponent(value);
                            return `<button class="btn btn-sm btn-outline-info comment-view-btn" data-comment="${commentEncoded}"><i class="fas fa-comment"></i></button>`;
                        }
                    }
                ],
                data: user.tasks,
                sortable: true,
                pagination: false,
                responsive: true,
                small: true,
                emptyMessage: 'Bu kullanıcı için görev kaydı bulunmamaktadır',
                emptyIcon: 'fas fa-inbox'
            });
        } else if (tasksContainer) {
            tasksContainer.innerHTML = `
                <div class="text-muted text-center py-3">
                    <i class="fas fa-inbox me-2"></i>Bu kullanıcı için görev kaydı bulunmamaktadır
                </div>
            `;
        }
        
        // Create idle periods table after modal is shown
        const idlePeriodsContainer = document.getElementById(idlePeriodsContainerId);
        if (idlePeriodsContainer && user.idle_periods && user.idle_periods.length > 0) {
            const idlePeriodsTable = new TableComponent(idlePeriodsContainerId, {
                title: `Boşta Geçen Dönemler (${user.idle_periods.length})`,
                icon: 'fas fa-hourglass-half',
                iconColor: 'text-warning',
                columns: [
                    {
                        field: 'start_time',
                        label: 'Başlangıç',
                        sortable: true,
                        formatter: (value) => formatDateTime(value)
                    },
                    {
                        field: 'finish_time',
                        label: 'Bitiş',
                        sortable: true,
                        formatter: (value) => formatDateTime(value)
                    },
                    {
                        field: 'duration_minutes',
                        label: 'Süre',
                        sortable: true,
                        formatter: (value) => formatDurationFromMinutes(value)
                    }
                ],
                data: user.idle_periods,
                sortable: true,
                pagination: false,
                responsive: true,
                small: true,
                emptyMessage: 'Boşta geçen dönem kaydı bulunmamaktadır',
                emptyIcon: 'fas fa-check-circle'
            });
        } else if (idlePeriodsContainer) {
            idlePeriodsContainer.innerHTML = `
                <div class="text-muted text-center py-3">
                    <i class="fas fa-check-circle me-2"></i>Boşta geçen dönem kaydı bulunmamaktadır
                </div>
            `;
        }
        
        // Create hold tasks table after modal is shown
        const holdTasksContainer = document.getElementById(holdTasksContainerId);
        if (holdTasksContainer && user.hold_tasks && user.hold_tasks.length > 0) {
            const holdTasksTable = new TableComponent(holdTasksContainerId, {
                title: `Bekleme Görevleri (${user.hold_tasks.length})`,
                icon: 'fas fa-pause-circle',
                iconColor: 'text-warning',
                columns: [
                    {
                        field: 'timer_id',
                        label: '#',
                        sortable: true,
                        formatter: (value) => {
                            if (!value) return '-';
                            return `<a href="/manufacturing/machining/reports/finished-timers/?edit=${value}" target="_blank" rel="noopener noreferrer" class="badge bg-secondary text-decoration-none" style="cursor: pointer;">#${value}</a>`;
                        }
                    },
                    {
                        field: 'start_time',
                        label: 'Başlangıç',
                        sortable: true,
                        formatter: (value) => formatDateTime(value)
                    },
                    {
                        field: 'finish_time',
                        label: 'Bitiş',
                        sortable: true,
                        formatter: (value) => formatDateTime(value)
                    },
                    {
                        field: 'task_key',
                        label: 'TI No',
                        sortable: true,
                        formatter: (value) => {
                            if (!value) return '-';
                            return `<a href="/manufacturing/machining/tasks/list/?task=${value}" target="_blank" rel="noopener noreferrer" class="badge bg-primary text-decoration-none" style="cursor: pointer;">${value}</a>`;
                        }
                    },
                    {
                        field: 'task_name',
                        label: 'Görev Adı',
                        sortable: true
                    },
                    {
                        field: 'job_no',
                        label: 'İş No',
                        sortable: true
                    },
                    {
                        field: 'duration_minutes',
                        label: 'Süre',
                        sortable: true,
                        formatter: (value) => formatDurationFromMinutes(value)
                    },
                    {
                        field: 'estimated_hours',
                        label: 'Tahmini',
                        sortable: true,
                        formatter: (value) => value !== null && value !== undefined ? `${value.toFixed(1)}s` : '-'
                    },
                    {
                        field: 'machine_name',
                        label: 'Makine',
                        sortable: true
                    },
                    {
                        field: 'manual_entry',
                        label: 'Manuel',
                        sortable: true,
                        formatter: (value) => value ? '<span class="badge bg-success">Manuel</span>' : '<span class="text-muted">-</span>'
                    },
                    {
                        field: 'comment',
                        label: 'Yorum',
                        sortable: false,
                        formatter: (value, row) => {
                            if (!value) return '-';
                            // Use encodeURIComponent to safely store in data attribute
                            const commentEncoded = encodeURIComponent(value);
                            return `<button class="btn btn-sm btn-outline-info comment-view-btn" data-comment="${commentEncoded}"><i class="fas fa-comment"></i></button>`;
                        }
                    }
                ],
                data: user.hold_tasks,
                sortable: true,
                pagination: false,
                responsive: true,
                small: true,
                emptyMessage: 'Bu kullanıcı için bekleme görevi kaydı bulunmamaktadır',
                emptyIcon: 'fas fa-inbox'
            });
        } else if (holdTasksContainer) {
            holdTasksContainer.innerHTML = `
                <div class="text-muted text-center py-3">
                    <i class="fas fa-inbox me-2"></i>Bu kullanıcı için bekleme görevi kaydı bulunmamaktadır
                </div>
            `;
        }
    }, 100);
}

function getEfficiencyColorClass(value) {
    if (value >= 100) {
        return 'class="stat-value" style="color: #6f42c1;"'; // Purple
    } else if (value >= 80) {
        return 'class="stat-value text-success"';
    } else if (value >= 60) {
        return 'class="stat-value text-warning"';
    } else {
        return 'class="stat-value text-danger"';
    }
}

function getWarnings(user, totalTimeInOffice) {
    const warnings = [];
    const efficiency = totalTimeInOffice > 0 
        ? (user.total_work_hours / totalTimeInOffice) * 100
        : 0;
    
    if (user.total_work_hours === 0) {
        warnings.push('Kullanıcı hiç görev çalıştırmamış');
    }
    
    if (efficiency < 50) {
        warnings.push(`Verimlilik çok düşük: %${efficiency.toFixed(1)}`);
    } else if (efficiency < 70) {
        warnings.push(`Verimlilik düşük: %${efficiency.toFixed(1)}`);
    }
    
    const totalIdleTime = (user.total_idle_hours || 0) + (user.total_hold_hours || 0);
    if (totalIdleTime > user.total_work_hours * 1.5) {
        warnings.push('Boşta geçen ve bekleme süresi çalışma süresinden çok fazla');
    }
    
    if (user.idle_periods && user.idle_periods.length > 5) {
        warnings.push('Çok fazla boşta geçen dönem var');
    }
    
    return warnings;
}

function formatDateTime(timestamp) {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    return date.toLocaleString('tr-TR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatDurationFromMinutes(minutes) {
    if (minutes === null || minutes === undefined) return '-';
    const totalMinutes = Math.round(minutes);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h > 0 && m > 0) {
        return `${h}s ${m}dk`;
    } else if (h > 0) {
        return `${h}s`;
    } else {
        return `${m}dk`;
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Make showComment available globally
window.showComment = function(comment) {
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.id = 'comment-modal-' + Date.now();
    // Escape HTML and preserve newlines
    const commentText = escapeHtml(comment).replace(/\n/g, '<br>');
    modal.innerHTML = `
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">Yorum</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    ${commentText}
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Kapat</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    const bsModal = bootstrap.Modal.getOrCreateInstance(modal);
    bsModal.show();
    modal.addEventListener('hidden.bs.modal', () => {
        if (modal.parentNode) {
            document.body.removeChild(modal);
        }
    }, { once: true });
};

function updateStatistics() {
    if (!reportData || !reportData.users || reportData.users.length === 0) {
        if (dailyReportStats) {
            dailyReportStats.updateValues({
                0: '0',
                1: '0',
                2: '0',
                3: '0%'
            });
        }
        return;
    }
    
    const totalUsers = reportData.users.length;
    const totalWorkHours = reportData.users.reduce((sum, user) => sum + (user.total_work_hours || 0), 0);
    const totalIdleHours = reportData.users.reduce((sum, user) => sum + (user.total_idle_hours || 0), 0);
    const totalHoldHours = reportData.users.reduce((sum, user) => sum + (user.total_hold_hours || 0), 0);
    
    // Calculate total office hours (work + idle + hold) if not provided
    const totalOfficeHours = reportData.users.reduce((sum, user) => {
        const officeHours = user.total_time_in_office_hours || 
            (user.total_work_hours + user.total_idle_hours + (user.total_hold_hours || 0));
        return sum + (officeHours || 0);
    }, 0);
    
    const avgEfficiency = totalOfficeHours > 0 
        ? ((totalWorkHours / totalOfficeHours) * 100).toFixed(1)
        : '0';
    
    if (dailyReportStats) {
        dailyReportStats.updateValues({
            0: totalUsers.toString(),
            1: totalWorkHours.toFixed(2),
            2: totalIdleHours.toFixed(2),
            3: `${avgEfficiency}%`
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

