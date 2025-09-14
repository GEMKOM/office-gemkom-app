// Capacity History Module JavaScript

// Import required modules
import { initNavbar } from '../../../../components/navbar.js';
import { HeaderComponent } from '../../../../components/header/header.js';
import { FiltersComponent } from '../../../../components/filters/filters.js';
import { StatisticsCards } from '../../../../components/statistics-cards/statistics-cards.js';
import { GanttChart } from '../../../../components/gantt/gantt.js';
import { fetchMachines, getMachineCalendar } from '../../../../generic/machines.js';
import { getMachineTimeline } from '../../../../generic/machining/capacityPlanning.js';
import { formatDateTime } from '../../../../generic/formatters.js';
import { TableComponent } from '../../../../components/table/table.js'

// Global state
let currentMachineId = null;
let currentMachineName = '';
let machines = [];
let currentTimelineData = null;
let machinesTable = null;
let statisticsCards = null;
let ganttChart = null;
let machineCalendar = null;
let isLoadingMachine = false;

// Initialize capacity history module
function initCapacityHistory() {
    console.log('Capacity history module initialized');
    
    // Initialize navbar
    initNavbar();
    
    // Initialize header component
    initHeader();
    
    // Initialize filters
    initFilters();
    
    // Initialize statistics cards
    initStatisticsCards();
    
    // Initialize machines table
    initMachinesTable();
    
    // Initialize Gantt chart
    initGanttChart();
    
    // Reset selection state
    resetMachineSelection();
    
    // Load machines
    loadMachines();
    
    // Setup event listeners
    setupEventListeners();
}

// Initialize header component
function initHeader() {
    const header = new HeaderComponent({
        title: 'Kapasite Geçmişi',
        subtitle: 'Makine kapasite geçmişini görüntüleyin ve analiz edin',
        icon: 'history',
        containerId: 'header-placeholder',
        showBackButton: 'block',
        showRefreshButton: 'none',
        backUrl: '/manufacturing/machining/capacity/'
    });
}

// Get current week (Monday to Sunday)
function getCurrentWeek() {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    
    // Calculate days to subtract to get to Monday (start of week)
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // If Sunday, go back 6 days; otherwise go back (dayOfWeek - 1) days
    
    const monday = new Date(today);
    monday.setDate(today.getDate() - daysToMonday);
    
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    
    return { monday, sunday };
}

// Format dates for input fields (YYYY-MM-DD)
function formatDateForInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Initialize filters component
function initFilters() {
    const filters = new FiltersComponent('filters-placeholder', {
        title: 'Geçmiş Filtreleri',
        showApplyButton: true,
        showClearButton: true,
        onApply: (values) => {
            console.log('Filters applied:', values);
            applyFilters(values);
        },
        onClear: () => {
            console.log('Filters cleared');
            if (currentMachineId) {
                loadMachineTimeline(currentMachineId);
            }
        }
    });

    // Add filter fields with default values (current week)
    const { monday, sunday } = getCurrentWeek();
    
    filters
        .addDateFilter({
            id: 'start-date',
            label: 'Başlangıç Tarihi',
            colSize: 2,
            value: formatDateForInput(monday)
        })
        .addDateFilter({
            id: 'end-date',
            label: 'Bitiş Tarihi',
            colSize: 2,
            value: formatDateForInput(sunday)
        })
        .addSelectFilter({
            id: 'category-filter',
            label: 'Kategori',
            options: [
                { value: '', label: 'Tümü' },
                { value: 'work', label: 'Çalışma' },
                { value: 'hold', label: 'Bekleme' },
                { value: 'idle', label: 'Boşta' }
            ],
            colSize: 2
        });
}

// Initialize statistics cards component
function initStatisticsCards() {
    console.log('Initializing statistics cards...');
    
    try {
        statisticsCards = new StatisticsCards('statistics-cards-container', {
            title: 'Kapasite Özeti',
            icon: 'chart-bar',
            iconColor: 'text-primary',
            cards: [
                {
                    id: 'productive-time',
                    title: 'Üretken Zaman',
                    icon: 'fas fa-cogs',
                    value: '0h 0m',
                    color: 'productive',
                    description: 'Toplam çalışma süresi'
                },
                {
                    id: 'hold-time',
                    title: 'Bekleme Zamanı',
                    icon: 'fas fa-pause',
                    value: '0h 0m',
                    color: 'hold',
                    description: 'Toplam bekleme süresi'
                },
                {
                    id: 'idle-time',
                    title: 'Boşta Zaman',
                    icon: 'fas fa-stop',
                    value: '0h 0m',
                    color: 'idle',
                    description: 'Toplam boşta kalma süresi'
                }
            ]
        });
        
        console.log('Statistics cards initialized successfully');
    } catch (error) {
        console.error('Error initializing statistics cards:', error);
    }
}

// Initialize machines table component
function initMachinesTable() {
    console.log('Initializing machines table...');
    
    try {
        machinesTable = new TableComponent('machines-table-container', {
            title: 'Makineler',
            icon: 'industry',
            iconColor: 'text-primary',
            columns: [
                {
                    field: 'name',
                    label: 'Makineler',
                    sortable: true,
                    formatter: (value, row) => `
                        <div class="d-flex align-items-center">
                            <span class="currency-badge me-2" style="flex-shrink: 0;">${row.tasks_count || 0}</span>
                            <span class="machine-name" style="font-size: 0.8rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${value}</span>
                        </div>
                    `
                }
            ],
            sortable: true,
            refreshable: true,
            onRefresh: () => {
                console.log('Table refresh requested');
                loadMachines();
            },
            onRowClick: (row, index) => {
                console.log('Machine row clicked:', row, 'index:', index);
                if (row && row.id && row.name) {
                    selectMachine(row.id, row.name);
                } else {
                    console.error('Invalid row data:', row);
                }
            },
            emptyMessage: 'Makine bulunamadı',
            emptyIcon: 'fas fa-industry'
        });
        
        console.log('Machines table initialized successfully');
    } catch (error) {
        console.error('Error initializing machines table:', error);
    }
}


// Initialize Gantt chart component
function initGanttChart() {
    console.log('Initializing Gantt chart...');
    
    try {
        ganttChart = new GanttChart('gantt-container', {
            title: 'Zaman Çizelgesi',
            defaultPeriod: 'month',
            showDateOverlay: true,
            showCurrentTime: true,
            onPeriodChange: (period, date) => {
                console.log('Gantt period changed:', period, date);
                // Re-render with current timeline data if any
                if (currentMachineId && currentTimelineData) {
                    updateGanttChart(currentTimelineData);
                }
            },
            onTaskClick: (task, event) => {
                console.log('Task clicked:', task);
            }
        });
        
        console.log('Gantt chart initialized successfully');
    } catch (error) {
        console.error('Error initializing Gantt chart:', error);
    }
}

// Load machines from API
async function loadMachines() {
    console.log('Loading machines...');
    
    try {
        if (machinesTable) {
            console.log('Setting loading state to true');
            machinesTable.setLoading(true);
        }
        
        console.log('Fetching machines from API...');
        const response = await fetchMachines(1, 100, { used_in: 'machining' });
        console.log('Machines API response:', response);
        
        machines = response.results || response;
        console.log('Processed machines:', machines);
        
        // Handle case where no machines are returned
        if (!machines || !Array.isArray(machines)) {
            console.warn('No machines returned or invalid response format');
            machines = [];
        }
        
        // If no machines found, add some mock data for testing
        if (machines.length === 0) {
            console.log('No machines found, adding mock data for testing');
            machines = [
                { id: 1, name: 'CNC Tezgah 1', is_active: true },
                { id: 2, name: 'CNC Tezgah 2', is_active: true },
                { id: 3, name: 'Torna Tezgahı', is_active: false },
                { id: 4, name: 'Freze Tezgahı', is_active: true }
            ];
        }
        
        // Sort machines by name
        machines = machines.sort((a, b) => a.name.localeCompare(b.name));
        
        // Add "All Machines" option at the top
        const allMachinesOption = {
            id: 'all',
            name: 'Tüm Makineler',
            is_active: true,
            is_all_machines: true
        };
        
        // Insert at the beginning of the array
        machines.unshift(allMachinesOption);
        
        if (machinesTable) {
            console.log('Updating table with machines data');
            machinesTable.options.loading = false;
            machinesTable.options.data = machines;
            machinesTable.render();
            
            // Re-add manual click listeners after re-render
            setTimeout(() => {
                addManualRowClickListeners();
            }, 100);
        } else {
            console.error('Machines table is null, cannot update');
        }
        
        console.log('Machines loaded successfully');
    } catch (error) {
        console.error('Error loading machines:', error);
        showNotification('Makineler yüklenirken hata oluştu', 'error');
        if (machinesTable) {
            console.log('Setting loading state to false due to error');
            machinesTable.options.loading = false;
            machinesTable.options.data = [];
            machinesTable.render();
        }
    }
}

// Select a machine and load its timeline
async function selectMachine(machineId, machineName) {
    console.log('selectMachine called with:', { machineId, machineName });
    
    // Prevent multiple simultaneous requests
    if (isLoadingMachine) {
        console.log('Machine loading already in progress, ignoring request');
        showNotification('Makine yükleniyor, lütfen bekleyin...', 'info', 1500);
        return;
    }
    
    // Check if same machine is already selected
    if (currentMachineId === machineId) {
        console.log('Same machine already selected, ignoring request');
        return;
    }
    
    // Set loading state
    isLoadingMachine = true;
    
    try {
        currentMachineId = machineId;
        currentMachineName = machineName;
        
        // Update UI - show machine name
        const selectedMachineElement = document.getElementById('selected-machine-name');
        selectedMachineElement.textContent = machineName;
        selectedMachineElement.style.color = '#0056b3';
        selectedMachineElement.style.fontWeight = '600';
        
        // Update table row selection
        if (machinesTable) {
            const tableRows = machinesTable.container.querySelectorAll('tbody tr');
            console.log('Found table rows:', tableRows.length);
            
            tableRows.forEach(row => {
                row.classList.remove('selected');
            });
            
            // Find and select the clicked row
            const machineIndex = machines.findIndex(m => m.id === machineId);
            console.log('Machine index:', machineIndex);
            
            if (machineIndex !== -1 && tableRows[machineIndex]) {
                tableRows[machineIndex].classList.add('selected');
                console.log('Row selected');
            }
        }
        
        // Add a small delay to ensure UI updates are visible
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Load machine calendar and timeline
        // For "all" option, skip calendar loading and only load timeline
        if (machineId === 'all') {
            await loadMachineTimeline(machineId);
        } else {
            await Promise.all([
                loadMachineCalendar(machineId),
                loadMachineTimeline(machineId)
            ]);
        }
        
    } catch (error) {
        console.error('Error selecting machine:', error);
        
        // Update UI with error state
        const selectedMachineElement = document.getElementById('selected-machine-name');
        selectedMachineElement.textContent = 'Makine Seçin';
        selectedMachineElement.style.color = '#6c757d';
        selectedMachineElement.style.fontWeight = 'normal';
        
        
        showNotification('Makine yüklenirken hata oluştu', 'error');
        
    } finally {
        isLoadingMachine = false;
    }
}

// Load machine calendar
async function loadMachineCalendar(machineId) {
    try {
        console.log('Loading machine calendar for machine:', machineId);
        machineCalendar = await getMachineCalendar(machineId);
        console.log('Machine calendar loaded:', machineCalendar);
    } catch (error) {
        console.error('Error loading machine calendar:', error);
        machineCalendar = null;
        showNotification('Makine takvimi yüklenirken hata oluştu', 'warning');
    }
}

// Load timeline for selected machine
async function loadMachineTimeline(machineId) {
    try {
        console.log('Loading machine timeline for machine:', machineId);
        
        // Get filter values
        const startDate = document.getElementById('start-date')?.value;
        const endDate = document.getElementById('end-date')?.value;
        
        // Convert dates to timestamps if provided, otherwise use default (current week)
        let startAfter = null;
        let startBefore = null;
        
        if (startDate) {
            startAfter = new Date(startDate).getTime();
        } else {
            // Default to current week (Monday)
            const { monday } = getCurrentWeek();
            startAfter = monday.getTime();
        }
        
        if (endDate) {
            startBefore = new Date(endDate).getTime();
        } else {
            // Default to current week (Sunday)
            const { sunday } = getCurrentWeek();
            startBefore = sunday.getTime();
        }
        
        // For "all" option, send "all" to backend instead of machine ID
        const backendMachineId = machineId === 'all' ? 'all' : machineId;
        const responseData = await getMachineTimeline(backendMachineId, startAfter, startBefore);
        console.log('Machine timeline response:', responseData);
        
        // Check if we have the expected data format
        if (!responseData) {
            console.error('No timeline data received');
            showNotification('Veri alınamadı', 'error');
            return;
        }
        
        // Handle new response format with machines array
        let processedData = null;
        
        if (responseData.machines && Array.isArray(responseData.machines)) {
            console.log('Processing new response format with machines array');
            
            if (machineId === 'all') {
                // For "all" option, combine all machines' data
                console.log('Processing all machines data');
                const allSegments = [];
                let totalProductive = 0;
                let totalHold = 0;
                let totalIdle = 0;
                
                responseData.machines.forEach(machine => {
                    if (machine.segments && Array.isArray(machine.segments)) {
                        // Add machine name to each segment for identification
                        machine.segments.forEach(segment => {
                            allSegments.push({
                                ...segment,
                                machine_name: machine.machine_name,
                                machine_id: machine.machine_id
                            });
                        });
                    }
                    
                    if (machine.totals) {
                        totalProductive += machine.totals.productive_seconds || 0;
                        totalHold += machine.totals.hold_seconds || 0;
                        totalIdle += machine.totals.idle_seconds || 0;
                    }
                });
                
                processedData = {
                    segments: allSegments,
                    totals: {
                        productive_seconds: totalProductive,
                        hold_seconds: totalHold,
                        idle_seconds: totalIdle
                    }
                };
            } else {
                // Find the machine data for the selected machine
                const machineData = responseData.machines.find(machine => machine.machine_id === machineId);
                
                if (machineData) {
                    console.log('Found machine data:', machineData);
                    processedData = {
                        segments: machineData.segments || [],
                        totals: machineData.totals || {
                            productive_seconds: 0,
                            hold_seconds: 0,
                            idle_seconds: 0
                        }
                    };
                } else {
                    console.warn('No data found for selected machine in response');
                    processedData = {
                        segments: [],
                        totals: {
                            productive_seconds: 0,
                            hold_seconds: 0,
                            idle_seconds: 0
                        }
                    };
                }
            }
        } else if (responseData.segments) {
            // Handle legacy format (direct segments)
            console.log('Processing legacy response format');
            processedData = {
                segments: responseData.segments,
                totals: responseData.totals || {
                    productive_seconds: 0,
                    hold_seconds: 0,
                    idle_seconds: 0
                }
            };
        } else if (Array.isArray(responseData)) {
            // Handle array format (fallback)
            console.log('Processing array response format');
            processedData = {
                segments: [],
                totals: {
                    productive_seconds: 0,
                    hold_seconds: 0,
                    idle_seconds: 0
                }
            };
            
            // Convert tasks to segments (legacy workaround)
            responseData.forEach(task => {
                if (task.total_hours_spent > 0) {
                    processedData.segments.push({
                        start_ms: Date.now() - (task.total_hours_spent * 3600000),
                        end_ms: Date.now(),
                        task_key: task.key,
                        task_name: task.name,
                        category: 'work',
                        is_hold: false
                    });
                    processedData.totals.productive_seconds += task.total_hours_spent * 3600;
                }
            });
        } else {
            console.error('Unexpected response format:', responseData);
            showNotification('Beklenmeyen veri formatı alındı', 'error');
            return;
        }
        
        // Ensure we have segments array
        if (!processedData.segments) {
            console.error('No segments found in processed data');
            processedData.segments = [];
        }
        
        currentTimelineData = processedData;
        
        // Update statistics cards
        updateStatisticsCards(processedData.totals);
        
        // Update Gantt chart
        updateGanttChart(processedData);
        
    } catch (error) {
        console.error('Error loading machine timeline:', error);
        showNotification('Makine geçmişi yüklenirken hata oluştu', 'error');
    }
}

// Update statistics cards with totals data
function updateStatisticsCards(totals) {
    if (!statisticsCards || !totals) return;
    
    console.log('Updating statistics cards with totals:', totals);
    
    // Convert seconds to hours and minutes
    const productiveTime = formatDuration(totals.productive_seconds || 0);
    const holdTime = formatDuration(totals.hold_seconds || 0);
    const idleTime = formatDuration(totals.idle_seconds || 0);
    
    // Update cards
    statisticsCards.updateCard('productive-time', {
        value: productiveTime
    });
    
    statisticsCards.updateCard('hold-time', {
        value: holdTime
    });
    
    statisticsCards.updateCard('idle-time', {
        value: idleTime
    });
}


// Update Gantt chart with timeline data
function updateGanttChart(timelineData) {
    if (!ganttChart || !timelineData) {
        console.warn('Gantt chart not initialized or no timeline data');
        return;
    }
    
    console.log('Updating Gantt chart with timeline data:', timelineData);
    
    // Transform segments data to match Gantt component's expected format
    const ganttTasks = [];
    
    if (timelineData.segments && Array.isArray(timelineData.segments)) {
        timelineData.segments.forEach((segment, index) => {
            // Determine title and task key based on category
            let title;
            let taskKey;
            
            if (segment.category === 'work') {
                title = segment.task_name || 'Bilinmeyen Görev';
                taskKey = segment.task_key;
            } else if (segment.category === 'hold') {
                title = segment.task_name || 'Bekleme';
                taskKey = segment.task_key;
            } else if (segment.category === 'idle') {
                title = 'Boşta';
                taskKey = 'Boşta';
            } else {
                title = segment.task_name || 'Bilinmeyen';
                taskKey = segment.task_key;
            }
            
            // Add machine name to title if showing all machines
            if (currentMachineId === 'all' && segment.machine_name) {
                title = `[${segment.machine_name}] ${title}`;
            }
            
            ganttTasks.push({
                id: `segment-${index}`,
                title: title,
                name: title,
                key: taskKey,
                ti_number: taskKey,
                planned_start_ms: segment.start_ms,
                planned_end_ms: segment.end_ms,
                category: segment.category,
                is_hold: segment.is_hold,
                machine_name: segment.machine_name || null,
                machine_id: segment.machine_id || null
            });
        });
    }
    
    console.log('Updating Gantt chart with tasks:', ganttTasks);
    
    // Pass machine calendar to Gantt chart for working hours display
    // Skip calendar for "all" option since it's not machine-specific
    if (machineCalendar && currentMachineId !== 'all') {
        ganttChart.setMachineCalendar(machineCalendar);
    }
    
    ganttChart.setTasks(ganttTasks);
}

// Format duration from seconds to human readable format
function formatDuration(seconds) {
    if (!seconds || seconds === 0) return '0m';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else {
        return `${minutes}m`;
    }
}

// Apply filters
function applyFilters(values) {
    console.log('Applying filters:', values);
    
    if (currentMachineId) {
        loadMachineTimeline(currentMachineId);
    } else {
        showNotification('Önce bir makine seçin', 'warning');
    }
}

// Reset machine selection state
function resetMachineSelection() {
    const selectedMachineElement = document.getElementById('selected-machine-name');
    
    selectedMachineElement.textContent = 'Makine Seçin';
    selectedMachineElement.style.color = '#6c757d';
    selectedMachineElement.style.fontWeight = 'normal';
    
    // Clear current selection
    currentMachineId = null;
    currentMachineName = null;
    currentTimelineData = null;
    machineCalendar = null;
    
    // Reset loading state
    isLoadingMachine = false;
    
    
    // Reset statistics cards
    if (statisticsCards) {
        statisticsCards.updateCard('productive-time', { value: '0h 0m' });
        statisticsCards.updateCard('hold-time', { value: '0h 0m' });
        statisticsCards.updateCard('idle-time', { value: '0h 0m' });
    }
}


// Add manual row click listeners as fallback
function addManualRowClickListeners() {
    if (!machinesTable) return;
    
    const tableRows = machinesTable.container.querySelectorAll('tbody tr');
    console.log('Adding manual click listeners to', tableRows.length, 'rows');
    
    tableRows.forEach((row, index) => {
        // Add special styling for "All Machines" option
        const machine = machines[index];
        if (machine && machine.is_all_machines) {
            row.classList.add('all-machines');
        }
        
        // Add new click listener
        row.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            if (machine) {
                console.log('Manual row click - machine:', machine);
                selectMachine(machine.id, machine.name);
            }
        });
        
        // Add cursor pointer style
        row.style.cursor = 'pointer';
    });
}

// Setup event listeners
function setupEventListeners() {
    // No additional event listeners needed for history page
    console.log('Event listeners setup completed');
}

// Show notification
function showNotification(message, type = 'info', timeout = 5000) {
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
    
    // Auto remove after timeout
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.animation = 'slideOutRight 0.5s ease-out';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 500);
        }
    }, timeout);
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initCapacityHistory();
});
