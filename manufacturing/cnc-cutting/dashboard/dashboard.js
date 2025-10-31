// Dashboard Module JavaScript
import { initNavbar } from '../../../components/navbar.js';
import { fetchTimers } from '../../../apis/timers.js';
import { fetchMachines } from '../../../apis/machines.js';
import { getCncTask } from '../../../apis/cnc_cutting/crud.js';
import { getSyncedNow } from '../../../apis/timeService.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { stopTimer } from '../../../apis/timers.js';
import { StatisticsCards } from '../../../components/statistics-cards/statistics-cards.js';
import { DisplayModal } from '../../../components/display-modal/display-modal.js';
import { TableComponent } from '../../../components/table/table.js';
import { FileAttachments } from '../../../components/file-attachments/file-attachments.js';
import { FileViewer } from '../../../components/file-viewer/file-viewer.js';
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
let detailsModal = null; // Details modal instance

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
        title: 'CNC Kesim Dashboard',
        subtitle: 'Gerçek zamanlı üretim takibi ve analizi',
        icon: 'chart-line',
        showBackButton: 'block',
        onBackClick: () => {
            window.location.href = '/manufacturing/cnc-cutting/';
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
        const timersResponse = await fetchTimers(true, null, null, null, 'cnc_cutting');
        dashboardState.activeTimers = timersResponse && timersResponse.results ? timersResponse.results : [];
        
        // Load machines
        const machinesResponse = await fetchMachines(1, 100, { used_in: 'cutting' });
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
        const timersResponse = await fetchTimers(true, null, null, null, 'cnc_cutting');
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
        const success = await stopTimer({ timerId, finishTime, module: 'cnc_cutting' });
        
        if (success) {
            // Refresh the dashboard to update the data
            await refreshActiveTimers();
            console.log('Timer stopped successfully');
        } else {
            console.error('Failed to stop timer');
        }
        
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
            // Parse the start time (could be ISO string or timestamp)
            const start = isNaN(startTime) ? new Date(startTime) : new Date(parseInt(startTime));
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
        const task = await getCncTask(taskKey);
        if (task) {
            showCutDetails({ key: taskKey });
        }
    } catch (error) {
        console.error('Error fetching task:', error);
        showNotification('Kesim detayları yüklenirken hata oluştu', 'error');
    }
}

// Show cut details modal (same as in cuts.js)
async function showCutDetails(cutData) {
    try {
        // Fetch complete task data from API
        const taskData = await getCncTask(cutData.key);
        
        // Create Display Modal instance
        detailsModal = new DisplayModal('task-display-modal-container', {
            title: 'Kesim Detayları',
            icon: 'fas fa-info-circle',
            size: 'xl',
            showEditButton: false
        });
        
        // Clear previous data
        detailsModal.clearData();
        
        // Add basic information section
        detailsModal.addSection({
            title: 'Temel Bilgiler',
            icon: 'fas fa-info-circle',
            iconColor: 'text-primary'
        });
        
        // Add basic fields - 4 items per row layout
        detailsModal.addField({
            id: 'cut-key',
            name: 'key',
            label: 'Kesim No',
            type: 'text',
            value: taskData.key || '-',
            icon: 'fas fa-hashtag',
            colSize: 3,
            layout: 'horizontal'
        });
        
        detailsModal.addField({
            id: 'cut-name',
            name: 'name',
            label: 'Kesim Adı',
            type: 'text',
            value: taskData.name || '-',
            icon: 'fas fa-tag',
            colSize: 3,
            layout: 'horizontal'
        });
        
        detailsModal.addField({
            id: 'cut-nesting-id',
            name: 'nesting_id',
            label: 'Nesting ID',
            type: 'text',
            value: taskData.nesting_id || '-',
            icon: 'fas fa-hashtag',
            colSize: 3,
            layout: 'horizontal'
        });
        
        detailsModal.addField({
            id: 'cut-material',
            name: 'material',
            label: 'Malzeme',
            type: 'text',
            value: taskData.material || '-',
            icon: 'fas fa-cube',
            colSize: 3,
            layout: 'horizontal'
        });
        
        detailsModal.addField({
            id: 'cut-thickness',
            name: 'thickness_mm',
            label: 'Kalınlık',
            type: 'text',
            value: taskData.thickness_mm ? `${taskData.thickness_mm} mm` : '-',
            icon: 'fas fa-layer-group',
            colSize: 3,
            layout: 'horizontal'
        });
        
        detailsModal.addField({
            id: 'cut-dimensions',
            name: 'dimensions',
            label: 'Boyutlar',
            type: 'text',
            value: taskData.dimensions || '-',
            icon: 'fas fa-ruler',
            colSize: 3,
            layout: 'horizontal'
        });
        
        detailsModal.addField({
            id: 'cut-estimated-hours',
            name: 'estimated_hours',
            label: 'Tahmini Saat',
            type: 'text',
            value: taskData.estimated_hours ? `${taskData.estimated_hours} saat` : '-',
            icon: 'fas fa-clock',
            colSize: 3,
            layout: 'horizontal'
        });
        
        // Get current timer duration if this task is being worked on
        const currentTimer = dashboardState.activeTimers.find(timer => timer.issue_key === taskData.key);
        const currentTimerStartTime = currentTimer ? new Date(currentTimer.start_time) : null;
        
        detailsModal.addField({
            id: 'cut-total-hours',
            name: 'total_hours_spent',
            label: 'Harcanan Saat',
            type: 'text',
            value: formatHoursSpent(taskData.total_hours_spent || 0, currentTimerStartTime),
            icon: 'fas fa-hourglass-half',
            colSize: 3,
            layout: 'horizontal'
        });
        
        detailsModal.addField({
            id: 'cut-machine-name',
            name: 'machine_name',
            label: 'Makine',
            type: 'text',
            value: taskData.machine_name || '-',
            icon: 'fas fa-cogs',
            colSize: 3,
            layout: 'horizontal'
        });
        
        // Render the modal first
        detailsModal.render();
        
        // Ensure modal close functionality works
        setTimeout(() => {
            const closeBtn = detailsModal.container.querySelector('.btn-close');
            if (closeBtn) {
                // Remove existing event listeners and add our own
                const newCloseBtn = closeBtn.cloneNode(true);
                closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
                
                newCloseBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    detailsModal.hide();
                });
                
                // Also handle ESC key and backdrop click
                const modalElement = detailsModal.container.querySelector('.modal');
                if (modalElement) {
                    modalElement.addEventListener('click', (e) => {
                        if (e.target === modalElement) {
                            detailsModal.hide();
                        }
                    });
                    
                    document.addEventListener('keydown', (e) => {
                        if (e.key === 'Escape' && modalElement.classList.contains('show')) {
                            detailsModal.hide();
                        }
                    });
                }
            }
        }, 100);
        
        // Add files section after modal is rendered
        if (taskData.files && taskData.files.length > 0) {
            const filesContainerHtml = `
                <div class="mt-4">
                    <div id="task-files-container"></div>
                </div>
            `;
            
            // Find the last section and add files container
            const lastSection = detailsModal.container.querySelector('[data-section-id*="section"]:last-of-type');
            if (lastSection) {
                const sectionBody = lastSection.querySelector('.row.g-2');
                if (sectionBody) {
                    sectionBody.insertAdjacentHTML('beforeend', filesContainerHtml);
                }
            }
            
            // Initialize FileAttachments component
            const fileAttachments = new FileAttachments('task-files-container', {
                title: 'Ekler',
                titleIcon: 'fas fa-paperclip',
                titleIconColor: 'text-muted',
                layout: 'grid',
                onFileClick: (file) => {
                    const fileName = file.file_name ? file.file_name.split('/').pop() : 'Dosya';
                    const fileExtension = fileName.split('.').pop().toLowerCase();
                    previewFile(file.file_url, fileName, fileExtension);
                },
                onDownloadClick: (fileUrl, fileName) => {
                    // Force download by creating a blob and downloading it
                    fetch(fileUrl)
                        .then(response => response.blob())
                        .then(blob => {
                            const url = window.URL.createObjectURL(blob);
                            const link = document.createElement('a');
                            link.href = url;
                            link.download = fileName;
                            link.style.display = 'none';
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                            window.URL.revokeObjectURL(url);
                        })
                        .catch(error => {
                            console.error('Download failed:', error);
                            // Fallback to direct link
                            const link = document.createElement('a');
                            link.href = fileUrl;
                            link.download = fileName;
                            link.target = '_blank';
                            link.click();
                        });
                }
            });
            
            // Set files data
            fileAttachments.setFiles(taskData.files);
        }
        
        // Add parts table section
        const partsSectionHtml = `
            <div class="mt-4">
                <div id="parts-details-table-container"></div>
            </div>
        `;
        
        // Find the last section and add parts table
        const lastSection = detailsModal.container.querySelector('[data-section-id*="section"]:last-of-type');
        if (lastSection) {
            const sectionBody = lastSection.querySelector('.row.g-2');
            if (sectionBody) {
                sectionBody.insertAdjacentHTML('beforeend', partsSectionHtml);
            }
        }
        
        // Initialize parts table
        initializePartsDetailsTable(taskData.parts || []);
        
        // Add custom button to modal footer after modal is shown
        const modalFooter = detailsModal.container.querySelector('.modal-footer');
        if (modalFooter) {
            const customButton = document.createElement('button');
            customButton.type = 'button';
            customButton.className = 'btn btn-primary';
            customButton.innerHTML = '<i class="fas fa-scissors me-1"></i>Kesimler Sayfasında Aç';
            customButton.onclick = () => {
                window.location.href = `../cuts/?filter=${taskData.key}`;
            };
            
            // Insert before the close button
            const closeButton = modalFooter.querySelector('[data-bs-dismiss="modal"]');
            if (closeButton) {
                modalFooter.insertBefore(customButton, closeButton.nextSibling);
            } else {
                modalFooter.appendChild(customButton);
            }
        }
        
        // Show the modal
        detailsModal.show();
        
    } catch (error) {
        console.error('Error showing cut details:', error);
        showNotification('Kesim detayları yüklenirken hata oluştu', 'error');
    }
}

// Initialize parts details table
function initializePartsDetailsTable(parts) {
    const partsTable = new TableComponent('parts-details-table-container', {
        title: 'Parça Listesi',
        icon: 'fas fa-puzzle-piece',
        iconColor: 'text-success',
        columns: [
            {
                field: 'job_no',
                label: 'İş No',
                sortable: true,
                width: '25%',
                formatter: (value) => value || '-'
            },
            {
                field: 'image_no',
                label: 'Resim No',
                sortable: true,
                width: '25%',
                formatter: (value) => value || '-'
            },
            {
                field: 'position_no',
                label: 'Pozisyon No',
                sortable: true,
                width: '25%',
                formatter: (value) => value || '-'
            },
            {
                field: 'weight_kg',
                label: 'Ağırlık (kg)',
                sortable: true,
                width: '25%',
                formatter: (value) => value ? `${value} kg` : '-'
            }
        ],
        data: parts,
        sortable: true,
        pagination: false,
        exportable: false,
        refreshable: false,
        striped: true,
        small: true,
        emptyMessage: 'Parça bulunamadı',
        emptyIcon: 'fas fa-puzzle-piece'
    });
}

// File preview function using FileViewer component
function previewFile(fileUrl, fileName, fileExtension) {
    // Create FileViewer instance
    const fileViewer = new FileViewer();
    
    // Set download callback with improved download handling
    fileViewer.setDownloadCallback(async () => {
        await fileViewer.downloadFile(fileUrl, fileName);
    });
    
    // Open file in viewer
    fileViewer.openFile(fileUrl, fileName, fileExtension);
}

// Show notification function (same as in cuts.js)
function showNotification(message, type = 'info') {
    // Remove existing notifications
    document.querySelectorAll('.notification').forEach(n => n.remove());
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification alert alert-${type === 'error' ? 'danger' : type} alert-dismissible fade show`;
    notification.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.animation = 'slideOutRight 0.3s ease-out';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 300);
        }
    }, 5000);
    
    // Return the notification element for manual removal
    return notification;
}

// ============================================================================
// CLEANUP
// ============================================================================

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    stopAutoRefresh();
    stopTimerUpdates();
});

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', initDashboard);

