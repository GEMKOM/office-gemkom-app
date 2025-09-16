// Capacity History Module JavaScript

// Import required modules
import { initNavbar } from '../../../../components/navbar.js';
import { HeaderComponent } from '../../../../components/header/header.js';
import { StatisticsCards } from '../../../../components/statistics-cards/statistics-cards.js';
import { GanttChart } from '../../../../components/gantt/gantt.js';
import { fetchMachines, getMachineCalendar } from '../../../../generic/machines.js';
import { getMachineTimeline } from '../../../../generic/machining/capacityPlanning.js';
import { fetchTimerById } from '../../../../generic/timers.js';
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
    
    // Initialize navbar
    initNavbar();
    
    // Initialize header component
    initHeader();
    
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

// Calculate date range based on Gantt period and date
function calculateDateRangeFromGantt(period, date) {
    const ganttDate = new Date(date);
    
    switch (period) {
        case 'day':
            // For day view, show the specific day
            const dayStart = new Date(ganttDate);
            dayStart.setHours(0, 0, 0, 0);
            
            const dayEnd = new Date(ganttDate);
            dayEnd.setHours(23, 59, 59, 999);
            
            return { start: dayStart, end: dayEnd };
            
        case 'week':
            // For week view, show Monday to Sunday of the week containing the date
            const dayOfWeek = ganttDate.getDay();
            const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
            
            const weekStart = new Date(ganttDate);
            weekStart.setDate(ganttDate.getDate() + mondayOffset);
            weekStart.setHours(0, 0, 0, 0);
            
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 6);
            weekEnd.setHours(23, 59, 59, 999);
            
            return { start: weekStart, end: weekEnd };
            
        default:
            // Fallback to current week
            return getCurrentWeek();
    }
}



// Handle Gantt chart period changes
async function handlePeriodChange(period, date) {
    console.log('Handling period change:', { period, date });
    
    // Only proceed if a machine is selected
    if (!currentMachineId) {
        console.log('No machine selected, skipping period change handling');
        showNotification('Önce bir makine seçin', 'info', 2000);
        return;
    }
    
    try {
        // Calculate the new date range based on the Gantt period and date
        const dateRange = calculateDateRangeFromGantt(period, date);
        console.log('Calculated date range:', dateRange);
        
        // Reload the machine timeline data for the new period
        console.log('Reloading timeline data for new period...');
        await loadMachineTimelineForPeriod(currentMachineId, dateRange.start, dateRange.end);
        
        console.log('Period change handled successfully');
    } catch (error) {
        console.error('Error handling period change:', error);
        showNotification('Dönem değiştirilirken hata oluştu', 'error');
    }
}

// Load timeline for selected machine (uses current week as default)
async function loadMachineTimeline(machineId) {
    // Use current week as default
    const { monday, sunday } = getCurrentWeek();
    return await loadMachineTimelineForPeriod(machineId, monday, sunday);
}

// Calculate dynamic height for Gantt chart based on number of tasks
function calculateGanttHeight(taskCount) {
    const minHeight = 200; // Minimum height
    const maxHeight = window.innerHeight * 0.7; // Maximum height as 70% of viewport height
    const taskRowHeight = 60; // Height per task row
    const headerHeight = 120; // Height for header and controls (increased for padding)
    const chartPadding = 60; // Padding for chart content (1.5rem top + 1.5rem bottom)
    
    // Adjust for mobile screens
    const isMobile = window.innerWidth <= 768;
    const adjustedMaxHeight = isMobile ? Math.min(600, maxHeight) : maxHeight;
    const adjustedTaskRowHeight = isMobile ? 50 : taskRowHeight;
    
    // Calculate height based on tasks
    const calculatedHeight = headerHeight + chartPadding + (taskCount * adjustedTaskRowHeight);
    
    // Apply min/max constraints
    const finalHeight = Math.max(minHeight, Math.min(adjustedMaxHeight, calculatedHeight));
    
    console.log(`Calculated Gantt height: ${finalHeight}px for ${taskCount} tasks (mobile: ${isMobile})`);
    return finalHeight;
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
                    icon: 'fas fa-play-circle',
                    value: '0h 0m',
                    color: 'success',
                    description: 'Toplam çalışma süresi'
                },
                {
                    id: 'hold-time',
                    title: 'Bekleme Zamanı',
                    icon: 'fas fa-pause-circle',
                    value: '0h 0m',
                    color: 'warning',
                    description: 'Toplam bekleme süresi'
                },
                {
                    id: 'idle-time',
                    title: 'Boşta Zaman',
                    icon: 'fas fa-stop-circle',
                    value: '0h 0m',
                    color: 'danger',
                    description: 'Toplam boşta kalma süresi'
                },
                {
                    id: 'total-time',
                    title: 'Toplam Zaman',
                    icon: 'fas fa-clock',
                    value: '0h 0m',
                    color: 'primary',
                    description: 'Tüm kategorilerin toplamı'
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
            defaultPeriod: 'week',
            availableViews: ['day', 'week'], // Only show day and week views
            showDateOverlay: true,
            showCurrentTime: true,
            onPeriodChange: (period, date) => {
                console.log('Gantt period changed:', period, date);
                handlePeriodChange(period, date);
            },
            onTaskClick: (task, event) => {
                console.log('Task clicked:', task);
                console.log('Task timer_id:', task?.timer_id);
                if (task && task.timer_id) {
                    console.log('Opening timer details for timer_id:', task.timer_id);
                    showTimerDetails(task.timer_id);
                } else {
                    console.warn('Task clicked but no timer_id found. Task data:', task);
                    showNotification('Bu görev için zamanlayıcı detayları bulunamadı', 'warning', 3000);
                }
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

// Load timeline for selected machine with specific date range
async function loadMachineTimelineForPeriod(machineId, startDate, endDate) {
    try {
        console.log('Loading machine timeline for machine:', machineId, 'from', startDate, 'to', endDate);
        
        // Convert dates to timestamps
        const startAfter = startDate.getTime();
        const startBefore = endDate.getTime();
        
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
            
            // Check if overall_totals is available in the response
            const hasOverallTotals = responseData.overall_totals && 
                                   typeof responseData.overall_totals === 'object';
            
            if (hasOverallTotals) {
                console.log('Using overall_totals from API response:', responseData.overall_totals);
            }
            
            if (machineId === 'all') {
                // For "all" option, pass machines array directly to preserve structure
                console.log('Processing all machines data');
                let totalProductive = 0;
                let totalHold = 0;
                let totalIdle = 0;
                
                responseData.machines.forEach(machine => {
                    if (machine.totals) {
                        totalProductive += machine.totals.productive_seconds || 0;
                        totalHold += machine.totals.hold_seconds || 0;
                        totalIdle += machine.totals.idle_seconds || 0;
                    }
                });
                
                processedData = {
                    machines: responseData.machines, // Pass machines array directly
                    totals: hasOverallTotals ? responseData.overall_totals : {
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
                        totals: hasOverallTotals ? responseData.overall_totals : (machineData.totals || {
                            productive_seconds: 0,
                            hold_seconds: 0,
                            idle_seconds: 0
                        })
                    };
                } else {
                    console.warn('No data found for selected machine in response');
                    processedData = {
                        segments: [],
                        totals: hasOverallTotals ? responseData.overall_totals : {
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
            
            // Check if overall_totals is available in the response
            const hasOverallTotals = responseData.overall_totals && 
                                   typeof responseData.overall_totals === 'object';
            
            if (hasOverallTotals) {
                console.log('Using overall_totals from legacy response:', responseData.overall_totals);
            }
            
            processedData = {
                segments: responseData.segments,
                totals: hasOverallTotals ? responseData.overall_totals : (responseData.totals || {
                    productive_seconds: 0,
                    hold_seconds: 0,
                    idle_seconds: 0
                })
            };
        } else if (Array.isArray(responseData)) {
            // Handle array format (fallback)
            console.log('Processing array response format');
            
            // Check if overall_totals is available in the response
            const hasOverallTotals = responseData.overall_totals && 
                                   typeof responseData.overall_totals === 'object';
            
            if (hasOverallTotals) {
                console.log('Using overall_totals from array response:', responseData.overall_totals);
            }
            
            processedData = {
                segments: [],
                totals: hasOverallTotals ? responseData.overall_totals : {
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
        console.log('About to update statistics cards with processedData.totals:', processedData.totals);
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
    if (!statisticsCards || !totals) {
        console.warn('Statistics cards not available or no totals data:', { statisticsCards: !!statisticsCards, totals });
        return;
    }
    
    console.log('Updating statistics cards with totals:', totals);
    
    // Convert seconds to hours and minutes
    const productiveTime = formatDuration(totals.productive_seconds || 0);
    const holdTime = formatDuration(totals.hold_seconds || 0);
    const idleTime = formatDuration(totals.idle_seconds || 0);
    
    // Calculate total time
    const totalSeconds = (totals.productive_seconds || 0) + (totals.hold_seconds || 0) + (totals.idle_seconds || 0);
    const totalTime = formatDuration(totalSeconds);
    
    console.log('Formatted times:', { productiveTime, holdTime, idleTime, totalTime });
    
    // Update cards
    try {
        statisticsCards.updateCardById('productive-time', {
            value: productiveTime
        });
        
        statisticsCards.updateCardById('hold-time', {
            value: holdTime
        });
        
        statisticsCards.updateCardById('idle-time', {
            value: idleTime
        });
        
        statisticsCards.updateCardById('total-time', {
            value: totalTime
        });
        
        console.log('Statistics cards updated successfully with values:', { productiveTime, holdTime, idleTime, totalTime });
    } catch (error) {
        console.error('Error updating statistics cards:', error);
    }
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
    
    if (currentMachineId === 'all') {
        // For "All Machines" option, process each machine's segments
        if (timelineData.machines && Array.isArray(timelineData.machines)) {
            console.log('Processing machines for Gantt chart:', timelineData.machines);
            timelineData.machines.forEach((machine, machineIndex) => {
                const machineName = machine.machine_name || 'Bilinmeyen Makine';
                const machineSegments = machine.segments || [];
                
                if (machineSegments.length === 0) {
                    return; // Skip machines with no segments
                }
                
                // Sort segments by start time
                machineSegments.sort((a, b) => a.start_ms - b.start_ms);
                
                // Find the overall start and end time for this machine
                const machineStart = machineSegments[0].start_ms;
                const machineEnd = machineSegments[machineSegments.length - 1].end_ms;
                
                // Create one task per machine with multiple segments
                const machineTask = {
                    id: `machine-${machineIndex}`,
                    title: machineName,
                    name: machineName,
                    key: machineName,
                    ti_number: machineName,
                    planned_start_ms: machineStart,
                    planned_end_ms: machineEnd,
                    category: 'machine',
                    is_hold: false,
                    machine_name: machineName,
                    machine_id: machine.machine_id,
                    timer_id: null,
                    segments: machineSegments.map((segment, segmentIndex) => {
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
                        
                        return {
                            id: `machine-${machineIndex}-segment-${segmentIndex}`,
                            title: title,
                            name: title,
                            key: taskKey,
                            ti_number: taskKey,
                            planned_start_ms: segment.start_ms,
                            planned_end_ms: segment.end_ms,
                            category: segment.category,
                            is_hold: segment.is_hold,
                            machine_name: machineName,
                            machine_id: machine.machine_id,
                            timer_id: segment.timer_id || null
                        };
                    })
                };
                
                ganttTasks.push(machineTask);
            });
        }
    } else {
        // For individual machine, process segments normally
        if (timelineData.segments && Array.isArray(timelineData.segments)) {
            console.log('Processing segments for Gantt chart:', timelineData.segments);
            timelineData.segments.forEach((segment, index) => {
                console.log(`Processing segment ${index}:`, segment);
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
                
                const task = {
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
                    machine_id: segment.machine_id || null,
                    timer_id: segment.timer_id || null
                };
                
                console.log(`Created Gantt task ${index}:`, task);
                ganttTasks.push(task);
            });
        }
    }
    
    console.log('Updating Gantt chart with tasks:', ganttTasks);
    
    // Pass machine calendar to Gantt chart for working hours display
    // Skip calendar for "all" option since it's not machine-specific
    if (machineCalendar && currentMachineId !== 'all') {
        ganttChart.setMachineCalendar(machineCalendar);
    }
    
    // Set dynamic height based on number of tasks
    const taskCount = ganttTasks.length > 0 ? ganttTasks.length : 1; // Ensure minimum height even with no tasks
    const dynamicHeight = calculateGanttHeight(taskCount);
    const ganttContainer = document.getElementById('gantt-container');
    if (ganttContainer) {
        ganttContainer.style.height = `${dynamicHeight}px`;
        console.log(`Set Gantt container height to ${dynamicHeight}px for ${ganttTasks.length} tasks`);
    }
    
    ganttChart.setTasks(ganttTasks);
}

// Format duration from seconds to human readable format
function formatDuration(seconds) {
    if (!seconds || seconds === 0) {
        return '0m';
    }
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
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

// Show timer details modal
async function showTimerDetails(timerId) {
    console.log('Showing timer details for ID:', timerId);
    
    // Show modal with loading state
    const modal = new bootstrap.Modal(document.getElementById('timerDetailsModal'));
    modal.show();
    
    try {
        // Fetch timer data
        const timer = await fetchTimerById(timerId);
        
        if (!timer) {
            throw new Error('Timer not found');
        }
        
        // Display timer data
        displayTimerData(timer);
        
    } catch (error) {
        console.error('Error fetching timer details:', error);
        displayTimerError('Zamanlayıcı detayları yüklenirken hata oluştu: ' + error.message);
    }
}

// Display timer data in modal
function displayTimerData(timer) {
    const content = document.getElementById('timer-details-content');
    const modalKey = document.getElementById('timer-modal-key');
    
    // Update modal title with task key
    if (timer.issue_key) {
        modalKey.textContent = timer.issue_key;
    } else {
        modalKey.textContent = 'Bilinmeyen';
    }
    
    // Format dates and times
    const startTime = timer.start_time ? formatDateTime(timer.start_time) : '-';
    const finishTime = timer.finish_time ? formatDateTime(timer.finish_time) : '-';
    const duration = timer.duration ? formatDuration(timer.duration) : '-';
    
    // Calculate actual time from start and end times
    let actualTime = '-';
    if (timer.start_time && timer.finish_time) {
        const start = new Date(timer.start_time);
        const end = new Date(timer.finish_time);
        const diffMs = end - start;
        const diffSeconds = Math.floor(diffMs / 1000);
        actualTime = formatDuration(diffSeconds);
    }
    
    // Determine status badge
    let statusBadge = '';
    if (timer.finish_time) {
        statusBadge = '<span class="badge bg-success timer-status-badge">Tamamlandı</span>';
    } else {
        statusBadge = '<span class="badge bg-warning timer-status-badge">Devam Ediyor</span>';
    }
    
    // Determine task type badge
    let taskTypeBadge = '';
    if (timer.issue_is_hold_task) {
        taskTypeBadge = '<span class="badge bg-warning">Bekleme</span>';
    } else {
        taskTypeBadge = '<span class="badge bg-primary">Üretim</span>';
    }
    
    content.innerHTML = `
        <!-- Top Row: Task Information and Time Information -->
        <div class="row mb-3">
            <div class="col-md-6">
                <div class="form-section compact">
                    <h6 class="section-subtitle compact">
                        <i class="fas fa-tasks me-2 text-primary"></i>Görev Bilgileri
                    </h6>
                    <div class="row g-2">
                        <div class="col-12">
                            <div class="mb-2">
                                <label class="form-label compact">
                                    <i class="fas fa-tag me-1"></i>Görev Adı
                                </label>
                                <div class="form-control-plaintext">${timer.issue_name || '-'}</div>
                            </div>
                        </div>
                        <div class="col-12">
                            <div class="mb-2">
                                <label class="form-label compact">
                                    <i class="fas fa-hashtag me-1"></i>İş No
                                </label>
                                <div class="form-control-plaintext">${timer.job_no || '-'}</div>
                            </div>
                        </div>
                        <div class="col-6">
                            <div class="mb-2">
                                <label class="form-label compact">
                                    <i class="fas fa-image me-1"></i>Resim No
                                </label>
                                <div class="form-control-plaintext">${timer.image_no || '-'}</div>
                            </div>
                        </div>
                        <div class="col-6">
                            <div class="mb-2">
                                <label class="form-label compact">
                                    <i class="fas fa-map-marker-alt me-1"></i>Pozisyon No
                                </label>
                                <div class="form-control-plaintext">${timer.position_no || '-'}</div>
                            </div>
                        </div>
                        <div class="col-6">
                            <div class="mb-2">
                                <label class="form-label compact">
                                    <i class="fas fa-boxes me-1"></i>Miktar
                                </label>
                                <div class="form-control-plaintext">${timer.quantity || '-'}</div>
                            </div>
                        </div>
                        <div class="col-6">
                            <div class="mb-2">
                                <label class="form-label compact">
                                    <i class="fas fa-industry me-1"></i>Makine
                                </label>
                                <div class="form-control-plaintext">${timer.machine_name || '-'}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="col-md-6">
                <div class="form-section compact">
                    <h6 class="section-subtitle compact">
                        <i class="fas fa-clock me-2 text-success"></i>Zaman Bilgileri
                    </h6>
                    <div class="row g-2">
                        <div class="col-12">
                            <div class="mb-2">
                                <label class="form-label compact">
                                    <i class="fas fa-id-badge me-1"></i>Zamanlayıcı ID
                                </label>
                                <div class="form-control-plaintext">
                                    <a href="/manufacturing/machining/reports/finished-timers/?edit=${timer.id}" 
                                       class="text-decoration-none" 
                                       target="_blank"
                                       title="Zamanlayıcıyı düzenlemek için tıklayın">
                                        <i class="fas fa-external-link-alt me-1"></i>${timer.id}
                                    </a>
                                </div>
                            </div>
                        </div>
                        <div class="col-12">
                            <div class="mb-2">
                                <label class="form-label compact">
                                    <i class="fas fa-clock me-1"></i>Gerçek Süre
                                </label>
                                <div class="form-control-plaintext"><span class="timer-duration">${actualTime}</span></div>
                            </div>
                        </div>
                        <div class="col-12">
                            <div class="mb-2">
                                <label class="form-label compact">
                                    <i class="fas fa-hourglass-half me-1"></i>Tahmini Süre
                                </label>
                                <div class="form-control-plaintext">${timer.estimated_hours ? `${timer.estimated_hours} saat` : '-'}</div>
                            </div>
                        </div>
                        <div class="col-12">
                            <div class="mb-2">
                                <label class="form-label compact">
                                    <i class="fas fa-play me-1"></i>Başlangıç
                                </label>
                                <div class="form-control-plaintext">${startTime}</div>
                            </div>
                        </div>
                        <div class="col-12">
                            <div class="mb-2">
                                <label class="form-label compact">
                                    <i class="fas fa-stop me-1"></i>Bitiş
                                </label>
                                <div class="form-control-plaintext">${finishTime}</div>
                            </div>
                        </div>
                        <div class="col-6">
                            <div class="mb-2">
                                <label class="form-label compact">
                                    <i class="fas fa-check-circle me-1"></i>Durum
                                </label>
                                <div class="form-control-plaintext">${statusBadge}</div>
                            </div>
                        </div>
                        <div class="col-6">
                            <div class="mb-2">
                                <label class="form-label compact">
                                    <i class="fas fa-tag me-1"></i>Görev Türü
                                </label>
                                <div class="form-control-plaintext">${taskTypeBadge}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Bottom Row: User Information -->
        <div class="row mb-3">
            <div class="col-12">
                <div class="form-section compact">
                    <h6 class="section-subtitle compact">
                        <i class="fas fa-user me-2 text-info"></i>Kullanıcı Bilgileri
                    </h6>
                    <div class="row g-2">
                        <div class="col-md-6">
                            <div class="mb-2">
                                <label class="form-label compact">
                                    <i class="fas fa-user me-1"></i>Kullanıcı
                                </label>
                                <div class="form-control-plaintext">${timer.username || '-'}</div>
                            </div>
                        </div>
                        <div class="col-md-6">
                            <div class="mb-2">
                                <label class="form-label compact">
                                    <i class="fas fa-user-times me-1"></i>Durduran
                                </label>
                                <div class="form-control-plaintext">${timer.stopped_by_first_name && timer.stopped_by_last_name ? 
                                    `${timer.stopped_by_first_name} ${timer.stopped_by_last_name}` : '-'}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        
        ${timer.comment ? `
        <div class="form-section compact mb-3">
            <h6 class="section-subtitle compact">
                <i class="fas fa-comment me-2 text-info"></i>Yorum
            </h6>
            <div class="alert alert-light">
                <p class="mb-0">${timer.comment}</p>
            </div>
        </div>
        ` : ''}
        
        ${timer.manual_entry ? `
        <div class="form-section compact">
            <h6 class="section-subtitle compact">
                <i class="fas fa-edit me-2 text-warning"></i>Manuel Giriş
            </h6>
            <div class="alert alert-info">
                <i class="fas fa-info-circle me-2"></i>
                <strong>Manuel Olarak Girildi</strong> - Bu zamanlayıcı manuel olarak sisteme girilmiştir.
            </div>
        </div>
        ` : ''}
    `;
}

// Display error in timer modal
function displayTimerError(message) {
    const content = document.getElementById('timer-details-content');
    content.innerHTML = `
        <div class="text-center">
            <i class="fas fa-exclamation-triangle text-warning" style="font-size: 3rem;"></i>
            <h5 class="mt-3 text-danger">Hata</h5>
            <p class="text-muted">${message}</p>
        </div>
    `;
}

// Format date and time for display
function formatDateTime(dateTimeString) {
    if (!dateTimeString) return '-';
    
    try {
        const date = new Date(dateTimeString);
        return date.toLocaleString('tr-TR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    } catch (error) {
        console.error('Error formatting date:', error);
        return dateTimeString;
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initCapacityHistory();
});
