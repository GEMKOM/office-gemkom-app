// Dashboard Module JavaScript
import { initNavbar } from '../../../components/navbar.js';
import { fetchTimers } from '../../../generic/timers.js';
import { fetchMachines } from '../../../generic/machines.js';
import { getSyncedNow } from '../../../generic/timeService.js';
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

// Initialize dashboard
async function initDashboard() {
    console.log('Dashboard module initialized');
    
    // Initialize navbar
    initNavbar();
    
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
    // Refresh button
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            await refreshDashboard();
        });
    }
    
    // Export button
    const exportBtn = document.getElementById('export-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportDashboardData);
    }
    
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
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
        refreshBtn.innerHTML = '<span class="loading-spinner"></span> Yenileniyor...';
        refreshBtn.disabled = true;
    }
    
    try {
        await loadDashboardData();
        showSuccessNotification('Dashboard başarıyla yenilendi.');
    } catch (error) {
        console.error('Error refreshing dashboard:', error);
        showErrorNotification('Dashboard yenilenirken hata oluştu.');
    } finally {
        if (refreshBtn) {
            refreshBtn.innerHTML = '<i class="fas fa-sync-alt me-2"></i>Yenile';
            refreshBtn.disabled = false;
        }
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
    
    // Update active timers count
    const activeTimersElement = document.getElementById('active-timers-count');
    if (activeTimersElement) {
        animateNumber(activeTimersElement, activeTimers);
    }
    
    // Update active machines count
    const activeMachinesElement = document.getElementById('active-machines-count');
    if (activeMachinesElement) {
        animateNumber(activeMachinesElement, activeMachines);
    }
    
    // Update active users count
    const activeUsersElement = document.getElementById('active-users-count');
    if (activeUsersElement) {
        animateNumber(activeUsersElement, activeUsers);
    }
    
    // Update total tasks count
    const totalTasksElement = document.getElementById('total-tasks-count');
    if (totalTasksElement) {
        animateNumber(totalTasksElement, totalTasks);
    }
}

// Animate number changes
function animateNumber(element, newValue) {
    const currentValue = parseInt(element.textContent) || 0;
    const increment = (newValue - currentValue) / 20;
    let current = currentValue;
    
    const animation = setInterval(() => {
        current += increment;
        if ((increment > 0 && current >= newValue) || (increment < 0 && current <= newValue)) {
            element.textContent = newValue;
            clearInterval(animation);
        } else {
            element.textContent = Math.round(current);
        }
    }, 50);
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
                <td colspan="6" class="text-center">
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
            <td>
                <div>
                    <div class="fw-bold">${timer.issue_key || 'Bilinmeyen Görev'}</div>
                    <small class="text-muted">${timer.issue_name || ''}</small>
                </div>
            </td>
            <td>
                <span class="timer-display" data-start-time="${timer.start_time}">${duration}</span>
            </td>
            <td class="text-center">
                <span class="status-badge status-active">Aktif</span>
            </td>
            <td class="text-center">
                <div class="btn-group" role="group">
                    <button class="btn btn-sm btn-outline-danger stop-only" data-timer-id="${timer.id}" title="Durdur">
                        <i class="fas fa-stop"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-info" title="Detaylar">
                        <i class="fas fa-eye"></i>
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
        
        // Create machine status card
        const machineCard = document.createElement('div');
        machineCard.className = 'machine-status-card';
        machineCard.innerHTML = `
            <div class="machine-status-header">
                <div class="machine-info">
                    <h6 class="machine-name">${machine.name || 'Bilinmeyen Makine'}</h6>
                    <small class="machine-type">${machine.machine_type_label || machine.machine_type || 'Bilinmeyen Tip'}</small>
                </div>
                <span class="status-badge ${statusClass}">${statusText}</span>
            </div>
            <div class="machine-details">
                ${machine.has_active_timer ? `
                <div class="machine-property active-timer">
                    <i class="fas fa-play-circle me-1"></i>
                    <span>Aktif Zamanlayıcı Var</span>
                </div>
                ` : ''}
                ${machine.is_under_maintenance ? `
                <div class="machine-property maintenance">
                    <i class="fas fa-tools me-1"></i>
                    <span>Bakım Modunda</span>
                </div>
                ` : ''}
            </div>
        `;
        
        machinesContainer.appendChild(machineCard);
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
    });
}

// Handle stop timer
async function handleStopTimer(timerId) {
    try {
        const finishTime = getSyncedNow();
        const stopped = false;//await stopTimerShared({ timerId, finishTime, syncToJira: false });
        
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
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
        refreshBtn.innerHTML = '<span class="loading-spinner"></span> Yükleniyor...';
        refreshBtn.disabled = true;
    }
}

// Hide loading state
function hideLoadingState() {
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
        refreshBtn.innerHTML = '<i class="fas fa-sync-alt me-2"></i>Yenile';
        refreshBtn.disabled = false;
    }
}

// Show add timer modal
function showAddTimerModal() {
    showInfoNotification('Yeni zamanlayıcı özelliği yakında eklenecek!');
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

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', initDashboard); 