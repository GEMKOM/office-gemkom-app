// Dashboard Module JavaScript
import { initNavbar } from '../../../components/navbar.js';
import { fetchTimers } from '../../../apis/timers.js';
import { fetchMachines } from '../../../apis/machines.js';
import { fetchTaskById } from '../../../apis/tasks.js';
import { getSyncedNow } from '../../../apis/timeService.js';
import { navigateTo } from '../machining.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { stopTimer } from '../../../apis/timers.js';
import { StatisticsCards } from '../../../components/statistics-cards/statistics-cards.js';
import { DisplayModal } from '../../../components/display-modal/display-modal.js';
import { TableComponent } from '../../../components/table/table.js';
import { formatDurationFromMs, formatWeeksFromHours, formatHoursSpent, formatRemainingHours } from '../../../apis/formatters.js';

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

// Dashboard state
let dashboardState = {
    activeTimers: [],
    machines: [],
    statistics: {
        activeTimers: 0,
        activeMachines: 0,
        activeUsers: 0,
        totalTasks: 0
    },
    refreshInterval: null,
    timerUpdateInterval: null
};

// Component instances
let headerComponent;
let dashboardStats = null;
let activeTimersTable = null;
let machinesTable = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

// Initialize dashboard
async function initDashboard() {
    console.log('Dashboard module initialized');
    
    // Initialize components
    initNavbar();
    initHeaderComponent();
    initStatisticsCards();
    initTables();
    
    // Setup event listeners
    setupTableEventListeners();
    
    // Load initial data
    await loadDashboardData();
    
    // Start auto-refresh and timer updates
    startAutoRefresh();
    startTimerUpdates();
}

// Initialize header component
function initHeaderComponent() {
    headerComponent = new HeaderComponent({
        title: 'Talaşlı İmalat Dashboard',
        subtitle: 'Gerçek zamanlı üretim takibi ve analizi',
        icon: 'chart-line',
        showBackButton: 'block',
        onBackClick: () => {
            window.location.href = '/manufacturing/machining/';
        }
    });
}

// Initialize statistics cards
function initStatisticsCards() {
    dashboardStats = new StatisticsCards('dashboard-statistics', {
        cards: [
            { title: 'Aktif Zamanlayıcı', value: '0', icon: 'fas fa-clock', color: 'primary', id: 'active-timers-count' },
            { title: 'Makine', value: '0', icon: 'fas fa-cog', color: 'success', id: 'active-machines-count' },
            { title: 'Aktif Kullanıcı', value: '0', icon: 'fas fa-users', color: 'info', id: 'active-users-count' },
            { title: 'Toplam Görev', value: '0', icon: 'fas fa-tasks', color: 'warning', id: 'total-tasks-count' }
        ],
        compact: true,
        animation: true
    });
}

// Initialize table components
function initTables() {
    // Active Timers Table
    activeTimersTable = new TableComponent('active-timers-table', {
        title: 'Aktif Zamanlayıcılar',
        icon: 'fas fa-clock',
        columns: [
            {
                key: 'user',
                label: 'Kullanıcı',
                sortable: false,
                formatter: (value, row) => {
                    return `
                        <div class="d-flex align-items-center">
                            <div class="user-avatar-sm me-2" style="
                                width: 32px;
                                height: 32px;
                                background: linear-gradient(135deg, #8b0000, #a52a2a);
                                border-radius: 8px;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                color: white;
                                font-size: 0.875rem;
                                flex-shrink: 0;
                            ">
                                <i class="fas fa-user"></i>
                            </div>
                            <span style="font-weight: 600; color: #0d6efd;">${value || 'Bilinmeyen Kullanıcı'}</span>
                        </div>
                    `;
                }
            },
            {
                key: 'machine',
                label: 'Makine',
                sortable: false,
                formatter: (value) => {
                    return `<span class="machine-name">${value || 'Bilinmeyen Makine'}</span>`;
                }
            },
            {
                key: 'task',
                label: 'Görev',
                sortable: false,
                formatter: (value, row) => {
                    return `
                        <div class="clickable-task" style="
                            cursor: pointer;
                            transition: all 0.2s ease;
                            padding: 0.5rem;
                            border-radius: 6px;
                            border: 1px solid transparent;
                        " data-task-key="${row.issue_key || ''}" onmouseover="this.style.background='rgba(13, 110, 253, 0.05)'; this.style.borderColor='rgba(13, 110, 253, 0.2)'; this.style.transform='translateY(-1px)'; this.style.boxShadow='0 2px 8px rgba(13, 110, 253, 0.1)'" onmouseout="this.style.background='transparent'; this.style.borderColor='transparent'; this.style.transform='translateY(0)'; this.style.boxShadow='none'">
                            <div class="fw-bold text-primary" style="
                                color: #0d6efd;
                                font-weight: 700;
                                font-size: 0.9rem;
                            ">
                                <i class="fas fa-external-link-alt me-1"></i>
                                ${row.issue_key || 'Bilinmeyen Görev'}
                            </div>
                            <small class="text-muted" style="
                                color: #6c757d;
                                font-size: 0.8rem;
                                display: block;
                                margin-top: 0.25rem;
                            ">${row.issue_name || ''}</small>
                        </div>
                    `;
                }
            },
            {
                key: 'duration',
                label: 'Süre',
                sortable: false,
                formatter: (value, row) => {
                    return `<span class="timer-display text-success" style="
                        color: #28a745;
                        font-weight: 500;
                        font-size: 1rem;
                        background: rgba(40, 167, 69, 0.1);
                        padding: 0.25rem 0.5rem;
                        border-radius: 6px;
                        border: 1px solid rgba(40, 167, 69, 0.2);
                        display: inline-block;
                        min-width: 80px;
                        text-align: center;
                    " data-start-time="${row.start_time}">${value}</span>`;
                }
            },
            {
                key: 'actions',
                label: 'İşlemler',
                sortable: false,
                formatter: (value, row) => {
                    return `
                        <div class="btn-group" role="group">
                            <button class="btn btn-sm btn-outline-danger stop-only" style="
                                border-radius: 6px;
                                padding: 0.375rem 0.75rem;
                                font-weight: 600;
                                transition: all 0.2s ease;
                                border: 1px solid #dc3545;
                                color: #dc3545;
                                background: transparent;
                            " data-timer-id="${row.id}" title="Durdur" onmouseover="this.style.background='#dc3545'; this.style.color='white'; this.style.transform='translateY(-1px)'; this.style.boxShadow='0 4px 8px rgba(220, 53, 69, 0.3)'" onmouseout="this.style.background='transparent'; this.style.color='#dc3545'; this.style.transform='translateY(0)'; this.style.boxShadow='none'">
                                <i class="fas fa-stop"></i>
                            </button>
                        </div>
                    `;
                }
            }
        ],
        data: [],
        pagination: false,
        emptyMessage: 'Aktif Zamanlayıcı Yok',
        emptyIcon: 'fas fa-clock',
        tableClass: 'table table-hover',
        refreshable: true,
        onRefresh: async () => {
            activeTimersTable.setLoading(true);
            await refreshActiveTimers();
        },
        skeleton: true,
        skeletonRows: 5
    });
    
    // Machines Table
    machinesTable = new TableComponent('machines-status', {
        title: 'Makine Durumları',
        icon: 'fas fa-industry',
        columns: [
            {
                key: 'name',
                label: 'Makine',
                sortable: false,
                formatter: (value) => {
                    return `<span class="machine-name">${value || 'Bilinmeyen Makine'}</span>`;
                }
            },
            {
                key: 'type',
                label: 'Tip',
                sortable: false,
                formatter: (value) => {
                    return `<span class="machine-type">${value || 'Bilinmeyen Tip'}</span>`;
                }
            },
            {
                key: 'status',
                label: 'Durum',
                sortable: false,
                formatter: (value, row) => {
                    if (row.is_under_maintenance) {
                        return '<span class="status-badge status-grey">Bakımda</span>';
                    }
                    if (row.is_active) {
                        if (row.has_active_timer) {
                            return '<span class="status-badge status-green">Aktif</span>';
                        } else {
                            return '<span class="status-badge status-red">Boşta</span>';
                        }
                    }
                    return '<span class="status-badge status-red">Çevrimdışı</span>';
                }
            },
            {
                key: 'weeks',
                label: 'Hafta',
                sortable: false,
                formatter: (value) => {
                    return `<span class="weeks-display">${value}</span>`;
                }
            }
        ],
        data: [],
        pagination: false,
        emptyMessage: 'Makine Bulunamadı',
        emptyIcon: 'fas fa-industry',
        tableClass: 'table table-hover',
        skeleton: true,
        skeletonRows: 3
    });
}

// ============================================================================
// DATA LOADING
// ============================================================================

// Load dashboard data
async function loadDashboardData() {
    try {
        // Show skeleton loading for both tables
        if (activeTimersTable) {
            activeTimersTable.setLoading(true);
        }
        if (machinesTable) {
            machinesTable.setLoading(true);
        }
        
        // Load active timers
        const timersResponse = await fetchTimers(true);
        dashboardState.activeTimers = timersResponse && timersResponse.results ? timersResponse.results : [];
        
        // Load machines
        const machinesResponse = await fetchMachines(1, 100, { used_in: 'machining' });
        dashboardState.machines = machinesResponse.results || machinesResponse || [];
        
        // Update statistics and UI
        updateStatistics();
        updateDashboardUI();
        
        // Hide skeleton loading
        if (activeTimersTable) {
            activeTimersTable.setLoading(false);
        }
        if (machinesTable) {
            machinesTable.setLoading(false);
        }
        
    } catch (error) {
        console.error('Error loading dashboard data:', error);
        
        // Set empty arrays as fallback
        dashboardState.activeTimers = [];
        dashboardState.machines = [];
        
        // Update statistics and UI with empty data
        updateStatistics();
        updateDashboardUI();
        
        // Hide skeleton loading even on error
        if (activeTimersTable) {
            activeTimersTable.setLoading(false);
        }
        if (machinesTable) {
            machinesTable.setLoading(false);
        }
    }
}

// Refresh only active timers
async function refreshActiveTimers() {
    try {
        // Load only active timers
        const timersResponse = await fetchTimers(true);
        dashboardState.activeTimers = timersResponse && timersResponse.results ? timersResponse.results : [];
        
        // Update statistics and active timers table
        updateStatistics();
        updateActiveTimersTable();
        
        // Hide skeleton loading
        if (activeTimersTable) {
            activeTimersTable.setLoading(false);
        }
        
    } catch (error) {
        console.error('Error refreshing active timers:', error);
        
        // Set empty array as fallback
        dashboardState.activeTimers = [];
        
        // Update statistics and UI with empty data
        updateStatistics();
        updateActiveTimersTable();
        
        // Hide skeleton loading even on error
        if (activeTimersTable) {
            activeTimersTable.setLoading(false);
        }
    }
}

// ============================================================================
// UI UPDATES
// ============================================================================

// Update statistics
function updateStatistics() {
    const timers = Array.isArray(dashboardState.activeTimers) ? dashboardState.activeTimers : [];
    const machines = Array.isArray(dashboardState.machines) ? dashboardState.machines : [];
    
    // Calculate statistics
    const activeUsers = new Set(timers.map(timer => timer.username)).size;
    const activeMachines = new Set(timers.map(timer => timer.machine_name)).size;
    const totalTasks = timers.length;
    
    // Update dashboard state
    dashboardState.statistics = {
        activeTimers: timers.length,
        activeMachines: activeMachines,
        activeUsers: activeUsers,
        totalTasks: totalTasks
    };
    
    // Update statistics cards
    updateStatisticsCards();
}

// Update statistics cards
function updateStatisticsCards() {
    if (!dashboardStats) return;
    
    const stats = dashboardState.statistics;
    
    // Update each card
    dashboardStats.updateCard('active-timers-count', stats.activeTimers.toString());
    dashboardStats.updateCard('active-machines-count', stats.activeMachines.toString());
    dashboardStats.updateCard('active-users-count', stats.activeUsers.toString());
    dashboardStats.updateCard('total-tasks-count', stats.totalTasks.toString());
}

// Update dashboard UI
function updateDashboardUI() {
    updateActiveTimersTable();
    updateMachinesStatus();
}

// Update active timers table
function updateActiveTimersTable() {
    if (!activeTimersTable) return;
    
    // Process each timer from API data
    const tableData = dashboardState.activeTimers.map(timer => {
        // Calculate duration
        const startTime = new Date(timer.start_time);
        const now = new Date();
        const durationMs = now - startTime;
        const duration = formatDurationFromMs(durationMs);
        
        return {
            id: timer.id,
            user: timer.username || 'Bilinmeyen Kullanıcı',
            machine: timer.machine_name || 'Bilinmeyen Makine',
            task: timer.issue_key || 'Bilinmeyen Görev',
            issue_key: timer.issue_key,
            issue_name: timer.issue_name,
            duration: duration,
            start_time: timer.start_time
        };
    });
    
    // Update table data
    activeTimersTable.updateData(tableData);
}

// Update machines status
function updateMachinesStatus() {
    if (!machinesTable) return;
    
    // Process each machine from API data
    const tableData = dashboardState.machines.map(machine => {
        return {
            name: machine.name || 'Bilinmeyen Makine',
            type: machine.machine_type_label || machine.machine_type || 'Bilinmeyen Tip',
            status: '', // Will be handled by formatter
            weeks: formatWeeksFromHours(machine.total_estimated_hours),
            // Pass machine data for status formatter
            is_active: machine.is_active,
            has_active_timer: machine.has_active_timer,
            is_under_maintenance: machine.is_under_maintenance
        };
    });
    
    // Update table data
    machinesTable.updateData(tableData);
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

// Setup table event listeners
function setupTableEventListeners() {
    if (!activeTimersTable) return;
    
    // Use document body for event delegation to catch all clicks
    document.body.addEventListener('click', async (e) => {
        // Only handle clicks within the active timers table
        const tableContainer = document.getElementById('active-timers-table');
        if (!tableContainer || !tableContainer.contains(e.target)) {
            return;
        }
        
        const stopBtn = e.target.closest('.stop-only');
        if (stopBtn) {
            const timerId = stopBtn.getAttribute('data-timer-id');
            await handleStopTimer(timerId);
            return;
        }
        
        // Handle task click to show modal
        const taskCell = e.target.closest('.clickable-task');
        if (taskCell) {
            const taskKey = taskCell.getAttribute('data-task-key');
            if (taskKey) {
                await showTaskModal(taskKey);
            }
        }
    });
}

// Handle stop timer
async function handleStopTimer(timerId) {
    try {
        const finishTime = getSyncedNow();
        await stopTimer(timerId, finishTime);
        
        // Refresh the dashboard to update the data
        await refreshActiveTimers();
        
    } catch (error) {
        console.error('Error stopping timer:', error);
    }
}

// ============================================================================
// AUTO-REFRESH & TIMER UPDATES
// ============================================================================

// Start auto-refresh
function startAutoRefresh() {
    // Refresh every 5 minutes
    dashboardState.refreshInterval = setInterval(async () => {
        await loadDashboardData();
    }, 300000);
}

// Stop auto-refresh
function stopAutoRefresh() {
    if (dashboardState.refreshInterval) {
        clearInterval(dashboardState.refreshInterval);
        dashboardState.refreshInterval = null;
    }
}

// Start timer updates
function startTimerUpdates() {
    // Update timer displays every second
    dashboardState.timerUpdateInterval = setInterval(() => {
        updateTimerDisplays();
    }, 1000);
}

// Stop timer updates
function stopTimerUpdates() {
    if (dashboardState.timerUpdateInterval) {
        clearInterval(dashboardState.timerUpdateInterval);
        dashboardState.timerUpdateInterval = null;
    }
}

// Update timer displays
function updateTimerDisplays() {
    const timerElements = document.querySelectorAll('.timer-display[data-start-time]');
    
    timerElements.forEach(element => {
        const startTime = element.getAttribute('data-start-time');
        if (startTime) {
            const start = new Date(parseInt(startTime));
            const now = new Date();
            const durationMs = now - start;
            const duration = formatDurationFromMs(durationMs);
            element.textContent = duration;
        }
    });
}

// ============================================================================
// TASK MODAL
// ============================================================================

// Show task modal
async function showTaskModal(taskKey) {
    try {
        const task = await fetchTaskById(taskKey);
        if (task) {
            createTaskModal(task);
        }
    } catch (error) {
        console.error('Error fetching task:', error);
    }
}

// Create task details modal using DisplayModal component
function createTaskModal(task) {
    // Get current timer duration if this task is being worked on
    const currentTimer = dashboardState.activeTimers.find(timer => timer.issue_key === task.key);
    const currentTimerStartTime = currentTimer ? new Date(currentTimer.start_time) : null;
    
    // Create display modal instance
    const displayModal = new DisplayModal('task-display-modal-container', {
        title: task.key,
        icon: 'fas fa-tasks',
        size: 'lg',
        showEditButton: false
    });
    
    // Add basic information section with two items per row
    displayModal.addSection({
        title: 'Görev Bilgileri',
        icon: 'fas fa-info-circle',
        iconColor: 'text-primary',
        fields: [
            {
                label: 'Görev Kodu',
                value: task.key,
                type: 'text',
                colSize: 6
            },
            {
                label: 'İş Emri No',
                value: task.job_no || 'Belirtilmemiş',
                type: 'text',
                colSize: 6
            },
            {
                label: 'Resim No',
                value: task.image_no || 'Belirtilmemiş',
                type: 'text',
                colSize: 6
            },
            {
                label: 'Pozisyon No',
                value: task.position_no || 'Belirtilmemiş',
                type: 'text',
                colSize: 6
            },
            {
                label: 'Miktar',
                value: task.quantity || 0,
                type: 'text',
                colSize: 6
            },
            {
                label: 'Makine',
                value: task.machine_name || 'Belirtilmemiş',
                type: 'text',
                colSize: 6
            },
            {
                label: 'Bitiş Tarihi',
                value: task.finish_time ? new Date(task.finish_time).toLocaleDateString('tr-TR') : 'Belirtilmemiş',
                type: 'text',
                colSize: 6
            },
            {
                label: 'Tahmini Süre',
                value: `${task.estimated_hours || 0} saat`,
                type: 'text',
                colSize: 6
            }
        ]
    });
    
    // Add time information section with two items per row
    displayModal.addSection({
        title: 'Zaman Bilgileri',
        icon: 'fas fa-clock',
        iconColor: 'text-success',
        fields: [
            {
                label: 'Harcanan Süre',
                value: formatHoursSpent(task.total_hours_spent || 0, currentTimerStartTime),
                type: 'text',
                colSize: 6
            },
            {
                label: 'Kalan Süre',
                value: formatRemainingHours(task.estimated_hours || 0, task.total_hours_spent || 0, currentTimerStartTime),
                type: 'text',
                colSize: 6
            }
        ]
    });
    
    // Render and show the modal
    displayModal.render();
    displayModal.show();
    
    // Add custom button to modal footer after modal is shown
    const modalFooter = displayModal.modal.querySelector('.modal-footer');
    if (modalFooter) {
        const customButton = document.createElement('button');
        customButton.type = 'button';
        customButton.className = 'btn btn-primary';
        customButton.innerHTML = '<i class="fas fa-tasks me-1"></i>Görevler Sayfasında Aç';
        customButton.onclick = () => {
            window.location.href = `../tasks/?filter=${task.key}`;
        };
        
        // Insert before the close button
        const closeButton = modalFooter.querySelector('[data-bs-dismiss="modal"]');
        if (closeButton) {
            modalFooter.insertBefore(customButton, closeButton.nextSibling);
        } else {
            modalFooter.appendChild(customButton);
        }
    }
    

}
// ============================================================================
// CLEANUP
// ============================================================================

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    stopAutoRefresh();
    stopTimerUpdates();
});

// Make navigation function globally available
window.navigateTo = navigateTo;

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', initDashboard);