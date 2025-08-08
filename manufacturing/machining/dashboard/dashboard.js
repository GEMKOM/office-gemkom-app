// Dashboard Module JavaScript
import { initNavbar } from '../../../components/navbar.js';
import { fetchTimers } from '../../../generic/timers.js';
import { fetchMachines } from '../../../generic/machines.js';
import { fetchTaskById } from '../../../generic/tasks.js';
import { getSyncedNow } from '../../../generic/timeService.js';
import { navigateTo } from '../machining.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { stopTimer } from '../../../generic/timers.js';
//import { stopTimerShared } from '../../../machining/machiningService.js';

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

// Header component instance
let headerComponent;

// Statistics Cards component instance
let dashboardStats = null;

// Initialize dashboard
async function initDashboard() {
    console.log('Dashboard module initialized');
    
    // Initialize navbar
    initNavbar();
    
    // Initialize header component
    initHeaderComponent();
    
    // Initialize Statistics Cards component
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
    
    // Setup event listeners
    setupEventListeners();
    
    // Add loading animation
    showLoadingState();
    
    // Load initial data
    await loadDashboardData();
    
    // Start auto-refresh
    startAutoRefresh();
    
    // Start timer updates
    startTimerUpdates();
}

// Initialize header component
function initHeaderComponent() {
    headerComponent = new HeaderComponent({
        title: 'Talaşlı İmalat Dashboard',
        subtitle: 'Gerçek zamanlı üretim takibi ve analizi',
        icon: 'chart-line',
        showBackButton: 'block',
        showRefreshButton: 'block',
        showExportButton: 'block',
        refreshButtonText: 'Yenile',
        exportButtonText: 'Dışa Aktar',
        onBackClick: () => {
            window.location.href = '/manufacturing/machining/';
        },
        onRefreshClick: async () => {
            await refreshDashboard();
        },
        onExportClick: () => {
            exportDashboardData();
        }
    });
}

// Format duration in HH:MM:SS format
function formatDuration(milliseconds) {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Setup event listeners
function setupEventListeners() {
    // Add timer button
    const addTimerBtn = document.getElementById('add-timer-btn');
    if (addTimerBtn) {
        addTimerBtn.addEventListener('click', showAddTimerModal);
    }
    
    // Setup table event listeners
    setupTableEventListeners();
}

// Load dashboard data
async function loadDashboardData() {
    try {
        // Load active timers
        const timersResponse = await fetchTimers(true); // Get only active timers
        // Handle the paginated response structure
        dashboardState.activeTimers = timersResponse && timersResponse.results ? timersResponse.results : [];
        
        // Load machines
        const machines = await fetchMachines('machining'); // Get machines used in machining
        dashboardState.machines = Array.isArray(machines) ? machines : [];
        
        console.log('Loaded timers:', dashboardState.activeTimers);
        console.log('Loaded machines:', dashboardState.machines);
        
        // Update statistics
        updateStatistics();
        
        // Update UI
        updateDashboardUI();
        
        // Hide loading state
        hideLoadingState();
        
    } catch (error) {
        console.error('Error loading dashboard data:', error);
        showErrorNotification('Dashboard verileri yüklenirken hata oluştu.');
        
        // Set empty arrays as fallback
        dashboardState.activeTimers = [];
        dashboardState.machines = [];
        
        // Update UI with empty data
        updateStatistics();
        updateDashboardUI();
        hideLoadingState();
    }
}

// Refresh dashboard
async function refreshDashboard() {
    try {
        await loadDashboardData();
        showSuccessNotification('Dashboard başarıyla yenilendi.');
    } catch (error) {
        console.error('Error refreshing dashboard:', error);
        showErrorNotification('Dashboard yenilenirken hata oluştu.');
    }
}

// Update statistics
function updateStatistics() {
    // Ensure we have arrays
    const timers = Array.isArray(dashboardState.activeTimers) ? dashboardState.activeTimers : [];
    const machines = Array.isArray(dashboardState.machines) ? dashboardState.machines : [];
    
    // Count active timers from API data
    const activeTimersCount = timers.length || 0;
    
    // Count active machines from API data
    const activeMachinesCount = machines.filter(machine => 
        machine && machine.is_active).length || 0;
    
    // Count unique users from active timers
    const activeUsers = new Set();
    timers.forEach(timer => {
        if (timer && timer.username) {
            activeUsers.add(timer.username);
        }
    });
    
    // Update statistics
    dashboardState.statistics = {
        activeTimers: activeTimersCount,
        activeMachines: activeMachinesCount,
        activeUsers: activeUsers.size,
        totalTasks: activeTimersCount // Assuming each timer represents a task
    };
    
    console.log('Updated statistics:', dashboardState.statistics);
}

// Update dashboard UI
function updateDashboardUI() {
    // Update statistics cards
    updateStatisticsCards();
    
    // Update active timers table
    updateActiveTimersTable();
    
    // Update machines status
    updateMachinesStatus();
    
    // Add animation class
    const dashboardContent = document.querySelector('.modules-section');
    if (dashboardContent) {
        dashboardContent.classList.add('data-update');
        setTimeout(() => {
            dashboardContent.classList.remove('data-update');
        }, 500);
    }
}

// Update statistics cards
function updateStatisticsCards() {
    const { activeTimers, activeMachines, activeUsers, totalTasks } = dashboardState.statistics;
    
    // Update statistics cards using the component
    if (dashboardStats) {
        dashboardStats.updateValues({
            0: activeTimers.toString(),
            1: activeMachines.toString(),
            2: activeUsers.toString(),
            3: totalTasks.toString()
        });
    }
}



// Update active timers table
function updateActiveTimersTable() {
    const tbody = document.getElementById('active-timers-table');
    if (!tbody) return;
    
    // Clear existing content
    tbody.innerHTML = '';
    
    if (dashboardState.activeTimers.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center">
                    <div class="empty-state">
                        <i class="fas fa-clock"></i>
                        <h5>Aktif Zamanlayıcı Yok</h5>
                        <p>Şu anda çalışan zamanlayıcı bulunmuyor.</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    // Process each timer from API data
    dashboardState.activeTimers.forEach((timer, index) => {
        // Calculate duration
        const startTime = new Date(timer.start_time);
        const now = new Date();
        const durationMs = now - startTime;
        const duration = formatDuration(durationMs);
        
        // Create new row with enhanced styling
        const newRow = document.createElement('tr');
        newRow.className = 'timer-row';
        newRow.innerHTML = `
            <td>
                <div class="d-flex align-items-center">
                    <div class="user-avatar-sm me-2">
                        <i class="fas fa-user"></i>
                    </div>
                    <span>${timer.username || 'Bilinmeyen Kullanıcı'}</span>
                </div>
            </td>
            <td>
                <span class="machine-name">${timer.machine_name || 'Bilinmeyen Makine'}</span>
            </td>
            <td class="task-cell" data-task-key="${timer.issue_key || ''}" style="cursor: pointer;">
                <div class="clickable-task">
                    <div class="fw-bold text-primary">
                        <i class="fas fa-external-link-alt me-1"></i>
                        ${timer.issue_key || 'Bilinmeyen Görev'}
                    </div>
                    <small class="text-muted">${timer.issue_name || ''}</small>
                </div>
            </td>
            <td>
                <span class="timer-display text-success fw-bold" data-start-time="${timer.start_time}">${duration}</span>
            </td>
            <td class="text-center">
                <div class="btn-group" role="group">
                    <button class="btn btn-sm btn-outline-danger stop-only" data-timer-id="${timer.id}" title="Durdur">
                        <i class="fas fa-stop"></i>
                    </button>
                </div>
            </td>
        `;
        
        tbody.appendChild(newRow);
    });
}

// Update machines status
function updateMachinesStatus() {
    const machinesContainer = document.getElementById('machines-status');
    if (!machinesContainer) return;
    
    // Clear existing content
    machinesContainer.innerHTML = '';
    
    if (dashboardState.machines.length === 0) {
        machinesContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-industry"></i>
                <h5>Makine Bulunamadı</h5>
                <p>Kayıtlı makine bulunmuyor.</p>
            </div>
        `;
        return;
    }
    
    // Create table structure
    const table = document.createElement('table');
    table.className = 'table table-hover';
    table.innerHTML = `
        <thead>
            <tr>
                <th>Makine</th>
                <th>Tip</th>
                <th class="text-center">Durum</th>
            </tr>
        </thead>
        <tbody id="machines-table-body">
        </tbody>
    `;
    machinesContainer.appendChild(table);
    
    const tbody = document.getElementById('machines-table-body');
    
    // Process each machine from API data
    dashboardState.machines.forEach(machine => {
        // Determine status class based on machine properties
        let statusClass = 'status-offline';
        let statusText = 'Çevrimdışı';
        
        if (machine.is_active) {
            if (machine.has_active_timer) {
                statusClass = 'status-active';
                statusText = 'Aktif';
            } else {
                statusClass = 'status-idle';
                statusText = 'Boşta';
            }
        }
        
        if (machine.is_under_maintenance) {
            statusClass = 'status-offline';
            statusText = 'Bakımda';
        }
        
        // Create table row
        const newRow = document.createElement('tr');
        newRow.className = 'machine-row';
        newRow.innerHTML = `
            <td>
                <span class="machine-name">${machine.name || 'Bilinmeyen Makine'}</span>
            </td>
            <td>
                <span class="machine-type">${machine.machine_type_label || machine.machine_type || 'Bilinmeyen Tip'}</span>
            </td>
            <td class="text-center">
                <span class="status-badge ${statusClass}">${statusText}</span>
            </td>
        `;
        
        tbody.appendChild(newRow);
    });
}

// Setup table event listeners
function setupTableEventListeners() {
    const tbody = document.getElementById('active-timers-table');
    if (!tbody) return;
    
    tbody.addEventListener('click', async (e) => {
        const stopBtn = e.target.closest('.stop-only');
        if (stopBtn) {
            const timerId = stopBtn.getAttribute('data-timer-id');
            await handleStopTimer(timerId);
        }
        
        // Handle task click to show modal
        const taskCell = e.target.closest('.task-cell');
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
        const stopped = await stopTimer({ timerId, finishTime });
        
        if (stopped) {
            showSuccessNotification('Zamanlayıcı başarıyla durduruldu!');
            await refreshDashboard();
        } else {
            showErrorNotification('Zamanlayıcı durdurulamadı!');
        }
    } catch (error) {
        console.error('Error stopping timer:', error);
        showErrorNotification('Zamanlayıcı durdurulurken hata oluştu.');
    }
}

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
    const timerRows = document.querySelectorAll('.timer-row');
    
    timerRows.forEach(row => {
        const timerDisplay = row.querySelector('.timer-display');
        if (timerDisplay) {
            const startTimeAttr = timerDisplay.getAttribute('data-start-time');
            if (startTimeAttr) {
                const startTime = new Date(parseInt(startTimeAttr));
                const now = new Date();
                const durationMs = now - startTime;
                const duration = formatDuration(durationMs);
                timerDisplay.textContent = duration;
            }
        }
    });
}

// Show loading state
function showLoadingState() {
    // Loading state is now handled by the header component
    console.log('Loading dashboard data...');
}

// Hide loading state
function hideLoadingState() {
    // Loading state is now handled by the header component
    console.log('Dashboard data loaded');
}

// Show add timer modal
function showAddTimerModal() {
    showInfoNotification('Yeni zamanlayıcı özelliği yakında eklenecek!');
}

// Show task details modal
async function showTaskModal(taskKey) {
    try {
        // Show loading state
        showLoadingState();
        
        // Fetch task data
        const task = await fetchTaskById(taskKey);
        
        if (!task) {
            showErrorNotification('Görev bilgileri yüklenemedi.');
            return;
        }
        
        // Create and show modal
        createTaskModal(task);
        
    } catch (error) {
        console.error('Error fetching task:', error);
        showErrorNotification('Görev bilgileri yüklenirken hata oluştu.');
    } finally {
        hideLoadingState();
    }
}

// Create task details modal
function createTaskModal(task) {
    // Remove existing modal if any
    const existingModal = document.querySelector('.task-modal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Get current timer duration if this task is being worked on
    const currentTimer = dashboardState.activeTimers.find(timer => timer.issue_key === task.key);
    const currentTimerStartTime = currentTimer ? new Date(currentTimer.start_time) : null;
    
    // Create modal HTML with compact design
    const modalHTML = `
        <div class="modal fade task-modal" tabindex="-1" aria-labelledby="taskModalLabel" aria-hidden="true">
            <div class="modal-dialog modal-lg">
                <div class="modal-content task-modal-content">
                    <div class="modal-header task-modal-header">
                        <div class="d-flex align-items-center">
                            <div class="task-icon me-3">
                                <i class="fas fa-tasks"></i>
                            </div>
                            <div>
                                <h5 class="modal-title mb-0" id="taskModalLabel">
                                    ${task.key}
                                </h5>
                                <small class="text-muted">${task.name || 'Görev Detayları'}</small>
                            </div>
                        </div>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body task-modal-body">
                        <div class="task-info-grid">
                            <div class="info-card">
                                <div class="info-icon">
                                    <i class="fas fa-info-circle"></i>
                                </div>
                                <div class="info-content">
                                    <label>Görev Kodu</label>
                                    <div class="info-value task-key">${task.key}</div>
                                </div>
                            </div>
                            
                            <div class="info-card">
                                <div class="info-icon">
                                    <i class="fas fa-file-alt"></i>
                                </div>
                                <div class="info-content">
                                    <label>İş Emri No</label>
                                    <div class="info-value">${task.job_no || 'Belirtilmemiş'}</div>
                                </div>
                            </div>
                            
                            <div class="info-card">
                                <div class="info-icon">
                                    <i class="fas fa-image"></i>
                                </div>
                                <div class="info-content">
                                    <label>Resim No</label>
                                    <div class="info-value">${task.image_no || 'Belirtilmemiş'}</div>
                                </div>
                            </div>
                            
                            <div class="info-card">
                                <div class="info-icon">
                                    <i class="fas fa-map-marker-alt"></i>
                                </div>
                                <div class="info-content">
                                    <label>Pozisyon No</label>
                                    <div class="info-value">${task.position_no || 'Belirtilmemiş'}</div>
                                </div>
                            </div>
                            
                            <div class="info-card">
                                <div class="info-icon">
                                    <i class="fas fa-cubes"></i>
                                </div>
                                <div class="info-content">
                                    <label>Miktar</label>
                                    <div class="info-value quantity-badge">${task.quantity || 0}</div>
                                </div>
                            </div>
                            
                            <div class="info-card">
                                <div class="info-icon">
                                    <i class="fas fa-cog"></i>
                                </div>
                                <div class="info-content">
                                    <label>Makine</label>
                                    <div class="info-value machine-name">${task.machine_name || 'Belirtilmemiş'}</div>
                                </div>
                            </div>
                            
                            <div class="info-card">
                                <div class="info-icon">
                                    <i class="fas fa-calendar-alt"></i>
                                </div>
                                <div class="info-content">
                                    <label>Bitiş Tarihi</label>
                                    <div class="info-value">${task.finish_time ? new Date(task.finish_time).toLocaleDateString('tr-TR') : 'Belirtilmemiş'}</div>
                                </div>
                            </div>
                            
                            <div class="info-card">
                                <div class="info-icon">
                                    <i class="fas fa-hourglass-half"></i>
                                </div>
                                <div class="info-content">
                                    <label>Tahmini Süre</label>
                                    <div class="info-value">${task.estimated_hours || 0} saat</div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="time-section">
                            <div class="time-header">
                                <i class="fas fa-clock me-2"></i>
                                Zaman Bilgileri
                            </div>
                            <div class="time-cards">
                                <div class="time-card">
                                    <div class="time-icon spent">
                                        <i class="fas fa-play"></i>
                                    </div>
                                    <div class="time-content">
                                        <label>Harcanan Süre</label>
                                        <div class="time-value hours-spent" data-base-hours="${task.total_hours_spent || 0}" data-start-time="${currentTimerStartTime ? currentTimerStartTime.getTime() : ''}">
                                            ${formatHoursSpent(task.total_hours_spent || 0, currentTimerStartTime)}
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="time-card">
                                    <div class="time-icon remaining">
                                        <i class="fas fa-hourglass-end"></i>
                                    </div>
                                    <div class="time-content">
                                        <label>Kalan Süre</label>
                                        <div class="time-value remaining-hours" data-estimated="${task.estimated_hours || 0}" data-base-hours="${task.total_hours_spent || 0}" data-start-time="${currentTimerStartTime ? currentTimerStartTime.getTime() : ''}">
                                            ${formatRemainingHours(task.estimated_hours || 0, task.total_hours_spent || 0, currentTimerStartTime)}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer task-modal-footer">
                        <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">
                            <i class="fas fa-times me-1"></i>
                            Kapat
                        </button>
                        <button type="button" class="btn btn-primary" onclick="window.location.href='../tasks/?filter=${task.key}'">
                            <i class="fas fa-tasks me-1"></i>
                            Görevler Sayfasında Aç
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Add modal to page
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Show modal
    const modal = document.querySelector('.task-modal');
    const bootstrapModal = new bootstrap.Modal(modal);
    bootstrapModal.show();
    
    // Start real-time updates if there's an active timer
    if (currentTimerStartTime) {
        startModalTimeUpdates(modal);
    }
    
    // Clean up modal on hidden
    modal.addEventListener('hidden.bs.modal', () => {
        modal.remove();
    });
}

// Helper function to get status class
function getStatusClass(status) {
    switch (status) {
        case 'completed': return 'completed';
        case 'worked_on': return 'worked-on';
        case 'pending': return 'pending';
        case 'hold': return 'hold';
        default: return 'pending';
    }
}

// Helper function to get status text
function getStatusText(status) {
    switch (status) {
        case 'completed': return 'Tamamlandı';
        case 'worked_on': return 'Üzerinde Çalışılıyor';
        case 'pending': return 'Bekliyor';
        case 'hold': return 'Duraklatıldı';
        default: return 'Bekliyor';
    }
}

// Format hours spent with current timer
function formatHoursSpent(baseHours, currentTimerStartTime) {
    let totalHours = parseFloat(baseHours) || 0;
    
    if (currentTimerStartTime) {
        const now = new Date();
        const currentDuration = (now - currentTimerStartTime) / (1000 * 60 * 60); // Convert to hours
        totalHours += currentDuration;
    }
    
    return `${totalHours.toFixed(2)} saat`;
}

// Format remaining hours
function formatRemainingHours(estimatedHours, baseHours, currentTimerStartTime) {
    const estimated = parseFloat(estimatedHours) || 0;
    let spent = parseFloat(baseHours) || 0;
    
    if (currentTimerStartTime) {
        const now = new Date();
        const currentDuration = (now - currentTimerStartTime) / (1000 * 60 * 60); // Convert to hours
        spent += currentDuration;
    }
    
    const remaining = Math.max(0, estimated - spent);
    return `${remaining.toFixed(2)} saat`;
}

// Start real-time updates for modal
function startModalTimeUpdates(modal) {
    const hoursSpentElement = modal.querySelector('.hours-spent');
    const remainingHoursElement = modal.querySelector('.remaining-hours');
    
    if (!hoursSpentElement || !remainingHoursElement) return;
    
    const updateInterval = setInterval(() => {
        const baseHours = parseFloat(hoursSpentElement.getAttribute('data-base-hours')) || 0;
        const startTime = hoursSpentElement.getAttribute('data-start-time');
        
        if (startTime) {
            const currentTimerStartTime = new Date(parseInt(startTime));
            const now = new Date();
            const currentDuration = (now - currentTimerStartTime) / (1000 * 60 * 60);
            const totalHours = baseHours + currentDuration;
            
            hoursSpentElement.textContent = `${totalHours.toFixed(2)} saat`;
            
            // Update remaining hours
            const estimated = parseFloat(remainingHoursElement.getAttribute('data-estimated')) || 0;
            const remaining = Math.max(0, estimated - totalHours);
            remainingHoursElement.textContent = `${remaining.toFixed(2)} saat`;
        }
    }, 1000); // Update every second
    
    // Clean up interval when modal is hidden
    modal.addEventListener('hidden.bs.modal', () => {
        clearInterval(updateInterval);
    });
}

// Export dashboard data
function exportDashboardData() {
    const data = {
        timestamp: new Date().toISOString(),
        statistics: dashboardState.statistics,
        activeTimers: dashboardState.activeTimers,
        machines: dashboardState.machines
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dashboard-export-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showSuccessNotification('Dashboard verileri başarıyla dışa aktarıldı!');
}

// Notification functions
function showSuccessNotification(message) {
    showNotification(message, 'success');
}

function showErrorNotification(message) {
    showNotification(message, 'error');
}

function showInfoNotification(message) {
    showNotification(message, 'info');
}

function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existingNotifications = document.querySelectorAll('.custom-notification');
    existingNotifications.forEach(notification => notification.remove());
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `custom-notification alert alert-${type === 'error' ? 'danger' : type} alert-dismissible fade show position-fixed`;
    notification.style.cssText = `
        top: 20px;
        right: 20px;
        z-index: 9999;
        min-width: 350px;
        backdrop-filter: blur(15px);
        border: 1px solid rgba(255, 255, 255, 0.3);
        border-radius: 15px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        animation: slideInRight 0.5s ease-out;
    `;
    
    const iconClass = type === 'error' ? 'exclamation-triangle' : 
                     type === 'success' ? 'check-circle' : 
                     type === 'warning' ? 'exclamation-circle' : 'info-circle';
    
    notification.innerHTML = `
        <div class="d-flex align-items-center">
            <i class="fas fa-${iconClass} me-3" style="font-size: 1.2rem;"></i>
            <div class="flex-grow-1">
                <strong>${type === 'error' ? 'Hata' : type === 'success' ? 'Başarılı' : type === 'warning' ? 'Uyarı' : 'Bilgi'}</strong>
                <br>
                <span>${message}</span>
            </div>
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;
    
    // Add to page
    document.body.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.animation = 'slideOutRight 0.5s ease-out';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 500);
        }
    }, 5000);
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    stopAutoRefresh();
    stopTimerUpdates();
});

// Make navigation function globally available
window.navigateTo = navigateTo;

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', initDashboard); 