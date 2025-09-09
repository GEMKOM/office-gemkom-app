// Capacity Planning Module JavaScript

// Import required modules
import { initNavbar } from '../../../../components/navbar.js';
import { HeaderComponent } from '../../../../components/header/header.js';
import { FiltersComponent } from '../../../../components/filters/filters.js';
import { TableComponent } from '../../../../components/table/table.js';
import { fetchMachines } from '../../../../generic/machines.js';
import { getCapacityPlanning, updateCapacityPlanning } from '../../../../generic/machining/capacityPlanning.js';

// Global state
let currentMachineId = null;
let currentMachineName = '';
let machines = [];
let currentTasks = [];
let plannedTasks = [];
let unplannedTasks = [];
let hasUnsavedChanges = false;
let machinesTable = null;
let isLoadingMachine = false;

// Gantt chart state
let ganttCurrentDate = new Date();
let ganttPeriod = 'month'; // 'week', 'month', 'year'
let ganttViewStart = null;
let ganttViewEnd = null;

// Initialize capacity planning module
function initCapacityPlanning() {
    console.log('Capacity planning module initialized');
    
    // Initialize navbar
    initNavbar();
    
    // Initialize header component
    initHeader();
    
    // Initialize filters
    initFilters();
    
    // Initialize machines table
    initMachinesTable();
    
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
        title: 'Kapasite Planlayıcı',
        subtitle: 'Makine kapasitelerini planlayın ve üretim programını oluşturun',
        icon: 'calendar-alt',
        containerId: 'header-placeholder',
        showBackButton: 'block',
        showRefreshButton: 'block',
        backUrl: '/manufacturing/machining/capacity/',
        onRefreshClick: () => {
            if (currentMachineId) {
                loadMachineTasks(currentMachineId);
            }
        }
    });
}

// Initialize filters component
function initFilters() {
    const filters = new FiltersComponent('filters-placeholder', {
        title: 'Planlama Filtreleri',
        showApplyButton: true,
        showClearButton: true,
        onApply: (values) => {
            console.log('Filters applied:', values);
            applyFilters(values);
        },
        onClear: () => {
            console.log('Filters cleared');
            if (currentMachineId) {
                loadMachineTasks(currentMachineId);
            }
        }
    });

    // Add filter fields
    filters
        .addDateFilter({
            id: 'start-date',
            label: 'Başlangıç Tarihi',
            colSize: 2
        })
        .addDateFilter({
            id: 'end-date',
            label: 'Bitiş Tarihi',
            colSize: 2
        })
        .addSelectFilter({
            id: 'status-filter',
            label: 'Durum',
            options: [
                { value: '', label: 'Tümü' },
                { value: 'planned', label: 'Planlanmış' },
                { value: 'unplanned', label: 'Planlanmamış' },
                { value: 'locked', label: 'Kilitli' }
            ],
            colSize: 2
        });
}

// Initialize machines table component
function initMachinesTable() {
    console.log('Initializing machines table...');
    console.log('Container element:', document.getElementById('machines-table-container'));
    
    try {
        machinesTable = new TableComponent('machines-table-container', {
            title: 'Makineler',
            icon: 'industry',
            iconColor: 'text-primary',
            columns: [
                {
                    field: 'name',
                    label: 'Makine Adı',
                    sortable: true,
                    formatter: (value, row) => `
                        <div class="d-flex align-items-center">
                            <i class="fas fa-cog me-2 text-primary"></i>
                            <span class="machine-name">${value}</span>
                        </div>
                    `
                },
                {
                    field: 'tasks_count',
                    label: 'Görevler',
                    sortable: true,
                    formatter: (value) => `
                        <span class="currency-badge">${value || 0}</span>
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
        console.log('Response type:', typeof response);
        console.log('Response keys:', Object.keys(response || {}));
        
        machines = response.results || response;
        console.log('Processed machines:', machines);
        console.log('Machines length:', machines ? machines.length : 'undefined');
        
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
        
        // Add tasks_count field to each machine (initially 0)
        machines = machines.map(machine => ({
            ...machine,
            tasks_count: 0
        }));
        
        if (machinesTable) {
            console.log('Updating table with machines data');
            console.log('Machines data to display:', machines);
            // Update the table's internal state first
            machinesTable.options.loading = false;
            machinesTable.options.data = machines;
            // Then render the table
            machinesTable.render();
            
            // Check if table was rendered properly
            setTimeout(() => {
                const tableRows = machinesTable.container.querySelectorAll('tbody tr');
                console.log('Table rows after render:', tableRows.length);
                addManualRowClickListeners();
            }, 100);
        } else {
            console.error('Machines table is null, cannot update');
        }
        
        console.log('Machines loaded successfully');
    } catch (error) {
        console.error('Error loading machines:', error);
        console.error('Error details:', {
            message: error.message,
            stack: error.stack,
            name: error.name
        });
        showNotification('Makineler yüklenirken hata oluştu', 'error');
        if (machinesTable) {
            console.log('Setting loading state to false due to error');
            machinesTable.options.loading = false;
            machinesTable.options.data = [];
            machinesTable.render();
        }
    }
}


// Select a machine and load its tasks
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
        
        // Update UI - just show machine name
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
        
        // Show skeleton loading in tasks table
        showTasksTableSkeleton();
        
        // Disable buttons during loading
        document.getElementById('autoschedule-btn').disabled = true;
        document.getElementById('save-plan-btn').disabled = true;
        
        // Load machine tasks
        await loadMachineTasks(machineId);
        
        // Enable buttons
        document.getElementById('autoschedule-btn').disabled = false;
        document.getElementById('save-plan-btn').disabled = false;
        
        
    } catch (error) {
        console.error('Error selecting machine:', error);
        
        // Update UI with error state
        const selectedMachineElement = document.getElementById('selected-machine-name');
        
        selectedMachineElement.textContent = 'Makine Seçin';
        selectedMachineElement.style.color = '#6c757d';
        selectedMachineElement.style.fontWeight = 'normal';
        
        
        // Show error message in tasks table
        showTasksTableError('Makine yüklenirken hata oluştu');
        
        // Disable buttons
        document.getElementById('autoschedule-btn').disabled = true;
        document.getElementById('save-plan-btn').disabled = true;
        
        showNotification('Makine yüklenirken hata oluştu', 'error');
        
    } finally {
        isLoadingMachine = false;
    }
}

// Load tasks for selected machine
async function loadMachineTasks(machineId) {
    try {
        const tasks = await getCapacityPlanning(machineId);
        currentTasks = tasks;
        
        // Separate planned and unplanned tasks
        const planned = tasks.filter(task => task.in_plan);
        const unplanned = tasks.filter(task => !task.in_plan);
        
        unplannedTasks = unplanned;
        
        renderTasksTable(planned);
        renderUnplannedTasksTable(unplanned);
        renderGanttChart(planned);
        
        // Update machine task count
        updateMachineTaskCount(machineId, tasks.length);
        
    } catch (error) {
        console.error('Error loading machine tasks:', error);
        showNotification('Görevler yüklenirken hata oluştu', 'error');
    }
}

// Render tasks table
function renderTasksTable(tasks) {
    const tbody = document.getElementById('tasks-table-body');
    if (!tbody) return;

    if (tasks.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="text-center text-muted">
                    <i class="fas fa-tasks me-2"></i>
                    Bu makine için planlanmış görev bulunmuyor
                </td>
            </tr>
        `;
        return;
    }

    // Sort tasks by plan_order
    const sortedTasks = [...tasks].sort((a, b) => (a.plan_order || 0) - (b.plan_order || 0));

    tbody.innerHTML = sortedTasks.map(task => `
        <tr class="task-row" data-task-key="${task.key}" draggable="true">
            <td>
                <span class="badge bg-primary">${task.plan_order || '-'}</span>
            </td>
            <td>
                <strong>${task.key}</strong>
            </td>
            <td>${task.name}</td>
            <td>${task.job_no || '-'}</td>
            <td>${task.quantity || '-'}</td>
            <td>${task.estimated_hours || '-'}h</td>
            <td>${task.remaining_hours || '-'}h</td>
            <td>${task.finish_time ? new Date(task.finish_time).toLocaleDateString('tr-TR') : '-'}</td>
            <td>
                <span class="badge ${task.plan_locked ? 'bg-warning' : 'bg-success'}">
                    ${task.plan_locked ? 'Kilitli' : 'Aktif'}
                </span>
            </td>
            <td>
                <div class="btn-group btn-group-sm">
                    <button class="btn btn-outline-primary btn-sm" onclick="editTask('${task.key}')" title="Düzenle">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-outline-danger btn-sm" onclick="removeFromPlan('${task.key}')" title="Plandan Çıkar">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');

    // Setup drag and drop for task reordering
    setupTaskRowDragAndDrop();
}

// Render unplanned tasks table
function renderUnplannedTasksTable(tasks) {
    const tbody = document.getElementById('unplanned-tasks-table-body');
    if (!tbody) return;

    if (tasks.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center text-muted">
                    <i class="fas fa-check-circle me-2"></i>
                    Tüm görevler planlanmış
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = tasks.map(task => `
        <tr class="unplanned-task-row" data-task-key="${task.key}">
            <td><strong>${task.key}</strong></td>
            <td>${task.name}</td>
            <td>${task.job_no || '-'}</td>
            <td>${task.estimated_hours || '-'}h</td>
            <td>${task.finish_time ? new Date(task.finish_time).toLocaleDateString('tr-TR') : '-'}</td>
            <td>
                <button class="btn btn-success btn-sm" onclick="addToPlan('${task.key}')" title="Plana Ekle">
                    <i class="fas fa-plus"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

// Calculate Gantt view date range based on current date and period
function calculateGanttViewRange() {
    const date = new Date(ganttCurrentDate);
    
    switch (ganttPeriod) {
        case 'day':
            // Single day view - start and end of the same day
            ganttViewStart = new Date(date);
            ganttViewStart.setHours(0, 0, 0, 0); // Start of day
            ganttViewEnd = new Date(date);
            ganttViewEnd.setHours(23, 59, 59, 999); // End of day
            break;
            
        case 'week':
            // Start from Monday of the current week
            const dayOfWeek = date.getDay();
            const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
            ganttViewStart = new Date(date);
            ganttViewStart.setDate(date.getDate() + mondayOffset);
            ganttViewEnd = new Date(ganttViewStart);
            ganttViewEnd.setDate(ganttViewStart.getDate() + 6);
            break;
            
        case 'month':
            // First day of the month
            ganttViewStart = new Date(date.getFullYear(), date.getMonth(), 1);
            // Last day of the month
            ganttViewEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
            break;
            
        case 'year':
            // First day of the year
            ganttViewStart = new Date(date.getFullYear(), 0, 1);
            // Last day of the year
            ganttViewEnd = new Date(date.getFullYear(), 11, 31);
            break;
    }
    
    // Add some padding
    ganttViewStart.setDate(ganttViewStart.getDate() - 1);
    ganttViewEnd.setDate(ganttViewEnd.getDate() + 1);
}

// Render Gantt chart
function renderGanttChart(tasks) {
    const ganttContainer = document.getElementById('gantt-chart');
    if (!ganttContainer) return;

    if (tasks.length === 0) {
        ganttContainer.innerHTML = `
            <div class="text-center text-muted py-5">
                <i class="fas fa-chart-gantt fa-3x mb-3"></i>
                <p>Planlanmış görev bulunmuyor</p>
            </div>
        `;
        return;
    }

    // Calculate view range
    calculateGanttViewRange();

    // Sort tasks by plan_order
    const sortedTasks = [...tasks].sort((a, b) => (a.plan_order || 0) - (b.plan_order || 0));
    
    // Filter tasks that are visible in current view
    const visibleTasks = sortedTasks.filter(task => {
        if (!task.planned_start_ms || !task.planned_end_ms) return false;
        
        const taskStart = new Date(task.planned_start_ms);
        const taskEnd = new Date(task.planned_end_ms);
        
        // Task is visible if it overlaps with the view range
        return taskStart <= ganttViewEnd && taskEnd >= ganttViewStart;
    });

    if (visibleTasks.length === 0) {
        ganttContainer.innerHTML = `
            <div class="text-center text-muted py-5">
                <i class="fas fa-calendar-alt fa-3x mb-3"></i>
                <p>Bu dönemde planlanmış görev bulunmuyor</p>
            </div>
        `;
        return;
    }

    // Calculate timeline based on period
    let timelineData = [];
    let dayWidth = 30;
    
    if (ganttPeriod === 'day') {
        // Show 30-minute intervals for single day view
        const totalIntervals = 48; // 24 hours * 2 (30-minute intervals)
        dayWidth = Math.max(20, Math.min(40, 1200 / totalIntervals));
        
        for (let i = 0; i < totalIntervals; i++) {
            const hour = Math.floor(i / 2);
            const minute = (i % 2) * 30;
            const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
            
            timelineData.push({
                date: new Date(ganttViewStart.getFullYear(), ganttViewStart.getMonth(), ganttViewStart.getDate(), hour, minute),
                label: minute === 0 ? hour.toString().padStart(2, '0') : '',
                sublabel: minute === 0 ? `${hour}:00` : '',
                width: dayWidth
            });
        }
    } else if (ganttPeriod === 'week') {
        // Show days with hour resolution for better time display
        const totalDays = Math.ceil((ganttViewEnd - ganttViewStart) / (1000 * 60 * 60 * 24));
        dayWidth = Math.max(40, Math.min(80, 800 / totalDays));
        
        for (let i = 0; i < totalDays; i++) {
            const date = new Date(ganttViewStart);
            date.setDate(date.getDate() + i);
            timelineData.push({
                date: date,
                label: date.getDate().toString(),
                sublabel: date.toLocaleDateString('tr-TR', { weekday: 'short' }),
                width: dayWidth
            });
        }
    } else if (ganttPeriod === 'month') {
        // Show days with hour resolution for better time display
        const totalDays = Math.ceil((ganttViewEnd - ganttViewStart) / (1000 * 60 * 60 * 24));
        dayWidth = Math.max(25, Math.min(40, 1000 / totalDays));
        
        for (let i = 0; i < totalDays; i++) {
            const date = new Date(ganttViewStart);
            date.setDate(date.getDate() + i);
            timelineData.push({
                date: date,
                label: date.getDate().toString(),
                sublabel: date.toLocaleDateString('tr-TR', { month: 'short' }),
                width: dayWidth
            });
        }
    } else if (ganttPeriod === 'year') {
        // Show months
        const totalMonths = 12;
        dayWidth = Math.max(60, Math.min(100, 1200 / totalMonths));
        
        for (let i = 0; i < totalMonths; i++) {
            const date = new Date(ganttViewStart.getFullYear(), i, 1);
            timelineData.push({
                date: date,
                label: date.toLocaleDateString('tr-TR', { month: 'short' }),
                sublabel: date.getFullYear().toString(),
                width: dayWidth
            });
        }
    }

    // Create Gantt chart HTML
    let ganttHTML = `
        <div class="gantt-chart-container">
            <div class="gantt-timeline" style="width: ${timelineData.length * dayWidth}px;">
                <div class="gantt-header-row">
                    ${timelineData.map(item => `
                        <div class="gantt-header-cell" style="width: ${item.width}px;">
                            <div class="gantt-date">${item.label}</div>
                            <div class="gantt-month">${item.sublabel}</div>
                        </div>
                    `).join('')}
                </div>
                <div class="gantt-tasks">
    `;

    console.log('Rendering Gantt chart with visible tasks:', visibleTasks.length);
    
    visibleTasks.forEach((task, index) => {
        if (task.planned_start_ms && task.planned_end_ms) {
            const startDate = new Date(task.planned_start_ms);
            const endDate = new Date(task.planned_end_ms);
            
            console.log(`Rendering task ${task.key}:`, {
                startDate: startDate.toLocaleString('tr-TR', { 
                    year: 'numeric', 
                    month: '2-digit', 
                    day: '2-digit', 
                    hour: '2-digit', 
                    minute: '2-digit' 
                }),
                endDate: endDate.toLocaleString('tr-TR', { 
                    year: 'numeric', 
                    month: '2-digit', 
                    day: '2-digit', 
                    hour: '2-digit', 
                    minute: '2-digit' 
                }),
                duration: `${(endDate - startDate) / (1000 * 60 * 60)}h`
            });
            
            // Calculate position and width
            let left, width;
            
            if (ganttPeriod === 'year') {
                // For year view, position based on months
                const startMonth = startDate.getMonth();
                const endMonth = endDate.getMonth();
                left = startMonth * dayWidth;
                width = Math.max((endMonth - startMonth + 1) * dayWidth, 20);
            } else if (ganttPeriod === 'day') {
                // For day view, position based on 30-minute intervals
                const startOffsetMinutes = (startDate - ganttViewStart) / (1000 * 60 * 30); // 30-minute intervals from view start
                const durationMinutes = (endDate - startDate) / (1000 * 60 * 30); // Duration in 30-minute intervals
                
                left = startOffsetMinutes * dayWidth;
                width = Math.max(durationMinutes * dayWidth, 20);
            } else {
                // For week/month view, position based on hours for better time resolution
                const startOffsetHours = (startDate - ganttViewStart) / (1000 * 60 * 60); // Hours from view start
                const durationHours = (endDate - startDate) / (1000 * 60 * 60); // Duration in hours
                
                // Calculate position and width based on hours
                const hourWidth = dayWidth / 24; // Each hour takes 1/24 of a day width
                left = startOffsetHours * hourWidth;
                width = Math.max(durationHours * hourWidth, 20);
            }
            
            ganttHTML += `
                <div class="gantt-task-row">
                    <div class="gantt-task-label">
                        <strong>${task.key}</strong>
                        <small class="text-muted d-block">${task.name}</small>
                    </div>
                    <div class="gantt-task-bar-container">
                        <div class="gantt-task-bar ${task.plan_locked ? 'locked' : 'unlocked'}" 
                             style="left: ${left}px; width: ${width}px;"
                             data-task-key="${task.key}"
                             title="${task.name} (${startDate.toLocaleString('tr-TR', { 
                                 year: 'numeric', 
                                 month: '2-digit', 
                                 day: '2-digit', 
                                 hour: '2-digit', 
                                 minute: '2-digit' 
                             })} - ${endDate.toLocaleString('tr-TR', { 
                                 year: 'numeric', 
                                 month: '2-digit', 
                                 day: '2-digit', 
                                 hour: '2-digit', 
                                 minute: '2-digit' 
                             })})">
                            <div class="gantt-task-content">
                                <span class="gantt-task-text">${task.key}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
    });

    ganttHTML += `
                </div>
            </div>
        </div>
    `;

    ganttContainer.innerHTML = ganttHTML;

    // Add drag functionality to task bars
    setupGanttDragAndDrop();
}

// Set Gantt chart period
function setGanttPeriod(period) {
    ganttPeriod = period;
    
    // Update button states
    document.querySelectorAll('[data-period]').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(`gantt-period-${period}`).classList.add('active');
    
    // Re-render Gantt chart
    const plannedTasks = currentTasks.filter(t => t.in_plan);
    renderGanttChart(plannedTasks);
}

// Navigate Gantt chart
function navigateGantt(direction) {
    const date = new Date(ganttCurrentDate);
    
    switch (ganttPeriod) {
        case 'day':
            date.setDate(date.getDate() + direction);
            break;
        case 'week':
            date.setDate(date.getDate() + (direction * 7));
            break;
        case 'month':
            date.setMonth(date.getMonth() + direction);
            break;
        case 'year':
            date.setFullYear(date.getFullYear() + direction);
            break;
    }
    
    ganttCurrentDate = date;
    
    // Re-render Gantt chart
    const plannedTasks = currentTasks.filter(t => t.in_plan);
    renderGanttChart(plannedTasks);
}

// Setup drag and drop for task table rows
function setupTaskRowDragAndDrop() {
    const taskRows = document.querySelectorAll('.task-row');
    
    taskRows.forEach(row => {
        row.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', row.dataset.taskKey);
            row.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });
        
        row.addEventListener('dragend', (e) => {
            row.classList.remove('dragging');
            // Remove all drag-over classes
            document.querySelectorAll('.task-row').forEach(r => r.classList.remove('drag-over'));
        });
        
        row.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            
            const afterElement = getDragAfterElement(e.target.closest('tbody'), e.clientY);
            const dragging = document.querySelector('.dragging');
            
            if (afterElement == null) {
                e.target.closest('tbody').appendChild(dragging);
            } else {
                e.target.closest('tbody').insertBefore(dragging, afterElement);
            }
        });
        
        row.addEventListener('drop', (e) => {
            e.preventDefault();
            const draggedTaskKey = e.dataTransfer.getData('text/plain');
            const targetRow = e.target.closest('.task-row');
            
            if (targetRow && targetRow.dataset.taskKey !== draggedTaskKey) {
                reorderTasks(draggedTaskKey, targetRow.dataset.taskKey);
            }
        });
    });
}

// Get the element after which to insert the dragged element
function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.task-row:not(.dragging)')];
    
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// Reorder tasks and update plan_order
function reorderTasks(draggedTaskKey, targetTaskKey) {
    const draggedTask = currentTasks.find(t => t.key === draggedTaskKey);
    const targetTask = currentTasks.find(t => t.key === targetTaskKey);
    
    if (!draggedTask || !targetTask) return;
    
    // Get all planned tasks sorted by current order
    const plannedTasks = currentTasks.filter(t => t.in_plan).sort((a, b) => (a.plan_order || 0) - (b.plan_order || 0));
    
    // Find indices
    const draggedIndex = plannedTasks.findIndex(t => t.key === draggedTaskKey);
    const targetIndex = plannedTasks.findIndex(t => t.key === targetTaskKey);
    
    if (draggedIndex === -1 || targetIndex === -1) return;
    
    // Remove dragged task from array
    plannedTasks.splice(draggedIndex, 1);
    
    // Insert at new position
    const newIndex = draggedIndex < targetIndex ? targetIndex - 1 : targetIndex;
    plannedTasks.splice(newIndex, 0, draggedTask);
    
    // Update plan_order for all tasks
    plannedTasks.forEach((task, index) => {
        task.plan_order = index + 1;
    });
    
    hasUnsavedChanges = true;
    
    // Re-render the table and Gantt chart
    const updatedPlannedTasks = currentTasks.filter(t => t.in_plan);
    renderTasksTable(updatedPlannedTasks);
    renderGanttChart(updatedPlannedTasks);
    
    showNotification('Görev sırası güncellendi', 'success', 2000);
}

// Setup drag and drop for Gantt chart
function setupGanttDragAndDrop() {
    const taskBars = document.querySelectorAll('.gantt-task-bar');
    
    taskBars.forEach(bar => {
        bar.draggable = true;
        
        bar.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', bar.dataset.taskKey);
            bar.classList.add('dragging');
        });
        
        bar.addEventListener('dragend', (e) => {
            bar.classList.remove('dragging');
        });
    });

    // Add drop zones (timeline cells)
    const timelineCells = document.querySelectorAll('.gantt-header-cell');
    timelineCells.forEach((cell, index) => {
        cell.addEventListener('dragover', (e) => {
            e.preventDefault();
            cell.classList.add('drag-over');
        });
        
        cell.addEventListener('dragleave', (e) => {
            cell.classList.remove('drag-over');
        });
        
        cell.addEventListener('drop', (e) => {
            e.preventDefault();
            cell.classList.remove('drag-over');
            
            const taskKey = e.dataTransfer.getData('text/plain');
            const newStartDate = calculateDateFromCellIndex(index);
            
            updateTaskDates(taskKey, newStartDate);
        });
    });
}

// Calculate date from cell index based on current period
function calculateDateFromCellIndex(cellIndex) {
    if (ganttPeriod === 'year') {
        // For year view, cell index represents month
        return new Date(ganttViewStart.getFullYear(), cellIndex, 1);
    } else if (ganttPeriod === 'day') {
        // For day view, cell index represents 30-minute interval
        const newDate = new Date(ganttViewStart);
        const hour = Math.floor(cellIndex / 2);
        const minute = (cellIndex % 2) * 30;
        newDate.setHours(hour, minute, 0, 0); // Set to specific hour and minute
        return newDate;
    } else {
        // For week/month view, cell index represents day (snap to start of day)
        const newDate = new Date(ganttViewStart);
        newDate.setDate(ganttViewStart.getDate() + cellIndex);
        newDate.setHours(0, 0, 0, 0); // Set to start of day
        return newDate;
    }
}

// Update task dates
function updateTaskDates(taskKey, newStartDate) {
    const task = currentTasks.find(t => t.key === taskKey);
    if (!task) return;

    const remainingHours = task.remaining_hours || task.estimated_hours || 2;
    const duration = remainingHours * 60 * 60 * 1000; // Convert hours to milliseconds

    task.planned_start_ms = newStartDate.getTime();
    task.planned_end_ms = newStartDate.getTime() + duration;
    
    hasUnsavedChanges = true;
    const plannedTasks = currentTasks.filter(t => t.in_plan);
    renderGanttChart(plannedTasks);
    renderTasksTable(plannedTasks);
}

// Edit task
function editTask(taskKey) {
    const task = currentTasks.find(t => t.key === taskKey);
    if (!task) return;

    // Populate modal
    document.getElementById('edit-task-key').value = taskKey;
    document.getElementById('edit-start-date').value = task.planned_start_ms 
        ? new Date(task.planned_start_ms).toISOString().slice(0, 16)
        : '';
    document.getElementById('edit-end-date').value = task.planned_end_ms 
        ? new Date(task.planned_end_ms).toISOString().slice(0, 16)
        : '';
    document.getElementById('edit-plan-order').value = task.plan_order || '';
    document.getElementById('edit-plan-locked').checked = task.plan_locked || false;

    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('editTaskModal'));
    modal.show();
}

// Add task to plan
function addToPlan(taskKey) {
    const task = currentTasks.find(t => t.key === taskKey);
    if (!task) return;

    // Find next available order
    const plannedTasks = currentTasks.filter(t => t.in_plan);
    const maxOrder = Math.max(...plannedTasks.map(t => t.plan_order || 0), 0);
    
    task.in_plan = true;
    task.plan_order = maxOrder + 1;
    task.plan_locked = false;
    
    // Don't set any dates initially - they should be empty
    task.planned_start_ms = null;
    task.planned_end_ms = null;

    hasUnsavedChanges = true;
    
    // Update the display immediately
    const updatedPlannedTasks = currentTasks.filter(t => t.in_plan);
    renderTasksTable(updatedPlannedTasks);
    renderGanttChart(updatedPlannedTasks);
    renderUnplannedTasksTable(currentTasks.filter(t => !t.in_plan));
    
    showNotification('Görev plana eklendi', 'success', 2000);
}


// Remove task from plan
function removeFromPlan(taskKey) {
    const task = currentTasks.find(t => t.key === taskKey);
    if (!task) return;

    task.in_plan = false;
    task.plan_order = null;
    task.planned_start_ms = null;
    task.planned_end_ms = null;
    task.plan_locked = false;

    hasUnsavedChanges = true;
    
    // Update the display immediately
    const updatedPlannedTasks = currentTasks.filter(t => t.in_plan);
    renderTasksTable(updatedPlannedTasks);
    renderGanttChart(updatedPlannedTasks);
    renderUnplannedTasksTable(currentTasks.filter(t => !t.in_plan));
    
    showNotification('Görev plandan çıkarıldı', 'info', 2000);
}

// Autoschedule tasks
function autoscheduleTasks() {
    const modal = new bootstrap.Modal(document.getElementById('autoscheduleModal'));
    
    // Set default start date to now
    const now = new Date();
    document.getElementById('autoschedule-start-date').value = now.toISOString().slice(0, 16);
    
    modal.show();
}

// Confirm autoschedule
async function confirmAutoschedule() {
    const criteria = document.getElementById('autoschedule-criteria').value;
    const startDate = new Date(document.getElementById('autoschedule-start-date').value);
    
    if (!startDate || isNaN(startDate.getTime())) {
        showNotification('Geçerli bir başlangıç tarihi seçin', 'error');
        return;
    }

    const tasksToSchedule = currentTasks.filter(task => task.in_plan);
    
    if (tasksToSchedule.length === 0) {
        showNotification('Planlanacak görev bulunmuyor', 'warning');
        return;
    }

    // Sort tasks based on criteria
    let sortedTasks;
    if (criteria === 'finish_time') {
        sortedTasks = tasksToSchedule.sort((a, b) => {
            const dateA = a.finish_time ? new Date(a.finish_time) : new Date('2099-12-31');
            const dateB = b.finish_time ? new Date(b.finish_time) : new Date('2099-12-31');
            return dateA - dateB;
        });
    } else {
        sortedTasks = tasksToSchedule.sort((a, b) => (a.plan_order || 0) - (b.plan_order || 0));
    }

    // Schedule tasks back-to-back (frontend only)
    let currentTime = startDate.getTime();
    
    console.log('Autoscheduling tasks:', {
        startDate: startDate.toLocaleString('tr-TR'),
        criteria: criteria,
        taskCount: sortedTasks.length
    });
    
    sortedTasks.forEach((task, index) => {
        const remainingHours = task.remaining_hours || task.estimated_hours || 2;
        const duration = remainingHours * 60 * 60 * 1000; // Convert hours to milliseconds
        
        const startTime = new Date(currentTime);
        const endTime = new Date(currentTime + duration);
        
        task.planned_start_ms = currentTime;
        task.planned_end_ms = currentTime + duration;
        task.plan_order = index + 1;
        
        console.log(`Task ${task.key}:`, {
            remainingHours: remainingHours,
            startTime: startTime.toLocaleString('tr-TR', { 
                year: 'numeric', 
                month: '2-digit', 
                day: '2-digit', 
                hour: '2-digit', 
                minute: '2-digit' 
            }),
            endTime: endTime.toLocaleString('tr-TR', { 
                year: 'numeric', 
                month: '2-digit', 
                day: '2-digit', 
                hour: '2-digit', 
                minute: '2-digit' 
            }),
            duration: `${remainingHours}h`
        });
        
        // Next task starts where this one ends
        currentTime += duration;
    });

    hasUnsavedChanges = true;
    
    // Close modal
    const modal = bootstrap.Modal.getInstance(document.getElementById('autoscheduleModal'));
    modal.hide();
    
    // Update display (frontend only)
    const plannedTasks = currentTasks.filter(t => t.in_plan);
    renderTasksTable(plannedTasks);
    renderGanttChart(plannedTasks);
    
    showNotification('Görevler otomatik olarak planlandı', 'success');
}

// Save plan
async function savePlan() {
    if (!hasUnsavedChanges) {
        showNotification('Kaydedilecek değişiklik bulunmuyor', 'info');
        return;
    }

    try {
        const plannedTasks = currentTasks.filter(task => task.in_plan);
        const updateData = {
            items: plannedTasks.map(task => ({
                key: task.key,
                machine_fk: task.machine_fk,
                planned_start_ms: task.planned_start_ms,
                planned_end_ms: task.planned_end_ms,
                plan_order: task.plan_order,
                plan_locked: task.plan_locked,
                in_plan: task.in_plan
            }))
        };

        await updateCapacityPlanning(updateData);
        hasUnsavedChanges = false;
        showNotification('Plan başarıyla kaydedildi', 'success');
        
    } catch (error) {
        console.error('Error saving plan:', error);
        showNotification('Plan kaydedilirken hata oluştu', 'error');
    }
}

// Apply filters
function applyFilters(values) {
    console.log('Applying filters:', values);
    // Implementation would depend on specific filtering requirements
}

// Reset machine selection state
function resetMachineSelection() {
    const selectedMachineElement = document.getElementById('selected-machine-name');
    
    selectedMachineElement.textContent = 'Makine Seçin';
    selectedMachineElement.style.color = '#6c757d';
    selectedMachineElement.style.fontWeight = 'normal';
    
    
    // Disable buttons
    document.getElementById('autoschedule-btn').disabled = true;
    document.getElementById('save-plan-btn').disabled = true;
    
    // Clear current selection
    currentMachineId = null;
    currentMachineName = null;
    currentTasks = [];
    plannedTasks = [];
    unplannedTasks = [];
    
    // Reset loading state
    isLoadingMachine = false;
    
    // Show empty state in tasks table
    showTasksTableEmpty();
}

// Show skeleton loading in tasks table
function showTasksTableSkeleton() {
    const tasksTableBody = document.getElementById('tasks-table-body');
    if (!tasksTableBody) return;
    
    // Create skeleton rows (5 rows for loading effect)
    const skeletonRows = Array.from({ length: 5 }, (_, index) => `
        <tr class="skeleton-row">
            <td><div class="skeleton skeleton-text" style="width: 30px; height: 16px;"></div></td>
            <td><div class="skeleton skeleton-text" style="width: 80px; height: 16px;"></div></td>
            <td><div class="skeleton skeleton-text" style="width: 150px; height: 16px;"></div></td>
            <td><div class="skeleton skeleton-text" style="width: 60px; height: 16px;"></div></td>
            <td><div class="skeleton skeleton-text" style="width: 50px; height: 16px;"></div></td>
            <td><div class="skeleton skeleton-text" style="width: 80px; height: 16px;"></div></td>
            <td><div class="skeleton skeleton-text" style="width: 80px; height: 16px;"></div></td>
            <td><div class="skeleton skeleton-text" style="width: 100px; height: 16px;"></div></td>
            <td><div class="skeleton skeleton-text" style="width: 70px; height: 16px;"></div></td>
            <td><div class="skeleton skeleton-text" style="width: 60px; height: 16px;"></div></td>
        </tr>
    `).join('');
    
    tasksTableBody.innerHTML = skeletonRows;
}

// Show error message in tasks table
function showTasksTableError(message) {
    const tasksTableBody = document.getElementById('tasks-table-body');
    if (!tasksTableBody) return;
    
    tasksTableBody.innerHTML = `
        <tr>
            <td colspan="10" class="text-center text-danger">
                <i class="fas fa-exclamation-triangle me-2"></i>
                ${message}
            </td>
        </tr>
    `;
}

// Show empty state in tasks table
function showTasksTableEmpty() {
    const tasksTableBody = document.getElementById('tasks-table-body');
    if (!tasksTableBody) return;
    
    tasksTableBody.innerHTML = `
        <tr>
            <td colspan="10" class="text-center text-muted">
                <i class="fas fa-mouse-pointer me-2"></i>
                Planlamak için bir makine seçin
            </td>
        </tr>
    `;
}

// Add manual row click listeners as fallback
function addManualRowClickListeners() {
    if (!machinesTable) return;
    
    const tableRows = machinesTable.container.querySelectorAll('tbody tr');
    console.log('Adding manual click listeners to', tableRows.length, 'rows');
    
    tableRows.forEach((row, index) => {
        // Add new click listener
        row.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const machine = machines[index];
            if (machine) {
                console.log('Manual row click - machine:', machine);
                selectMachine(machine.id, machine.name);
            }
        });
        
        // Add cursor pointer style
        row.style.cursor = 'pointer';
    });
}

// Update machine task count
function updateMachineTaskCount(machineId, count) {
    // Update the machine in the machines array
    const machineIndex = machines.findIndex(m => m.id === machineId);
    if (machineIndex !== -1) {
        machines[machineIndex].tasks_count = count;
        
        // Update the table if it exists
        if (machinesTable) {
            machinesTable.options.data = machines;
            machinesTable.render();
            
            // Re-add manual click listeners after re-render
            setTimeout(() => {
                addManualRowClickListeners();
            }, 100);
        }
    }
}

// Setup event listeners
function setupEventListeners() {
    // Toggle unplanned tasks
    document.getElementById('toggle-unplanned').addEventListener('click', () => {
        const section = document.getElementById('unplanned-tasks-section');
        const button = document.getElementById('toggle-unplanned');
        
        if (section.style.display === 'none') {
            section.style.display = 'block';
            button.innerHTML = '<i class="fas fa-eye-slash me-1"></i>Planlanmamış Görevleri Gizle';
        } else {
            section.style.display = 'none';
            button.innerHTML = '<i class="fas fa-eye me-1"></i>Planlanmamış Görevler';
        }
    });
    
    // Autoschedule button
    document.getElementById('autoschedule-btn').addEventListener('click', autoscheduleTasks);
    
    // Save plan button
    document.getElementById('save-plan-btn').addEventListener('click', savePlan);
    
    // Save task changes
    document.getElementById('save-task-changes').addEventListener('click', () => {
        const taskKey = document.getElementById('edit-task-key').value;
        const startDate = document.getElementById('edit-start-date').value;
        const endDate = document.getElementById('edit-end-date').value;
        const planOrder = document.getElementById('edit-plan-order').value;
        const planLocked = document.getElementById('edit-plan-locked').checked;
        
        const task = currentTasks.find(t => t.key === taskKey);
        if (task) {
            task.planned_start_ms = startDate ? new Date(startDate).getTime() : null;
            task.planned_end_ms = endDate ? new Date(endDate).getTime() : null;
            task.plan_order = planOrder ? parseInt(planOrder) : null;
            task.plan_locked = planLocked;
            
            hasUnsavedChanges = true;
            
            const modal = bootstrap.Modal.getInstance(document.getElementById('editTaskModal'));
            modal.hide();
            
            loadMachineTasks(currentMachineId);
        }
    });
    
    // Confirm autoschedule
    document.getElementById('confirm-autoschedule').addEventListener('click', confirmAutoschedule);
    
    // Gantt chart period controls
    document.getElementById('gantt-period-day').addEventListener('click', () => {
        setGanttPeriod('day');
    });
    
    document.getElementById('gantt-period-week').addEventListener('click', () => {
        setGanttPeriod('week');
    });
    
    document.getElementById('gantt-period-month').addEventListener('click', () => {
        setGanttPeriod('month');
    });
    
    document.getElementById('gantt-period-year').addEventListener('click', () => {
        setGanttPeriod('year');
    });
    
    // Gantt chart navigation controls
    document.getElementById('gantt-prev').addEventListener('click', () => {
        navigateGantt(-1);
    });
    
    document.getElementById('gantt-next').addEventListener('click', () => {
        navigateGantt(1);
    });
    
    document.getElementById('gantt-today').addEventListener('click', () => {
        ganttCurrentDate = new Date();
        const plannedTasks = currentTasks.filter(t => t.in_plan);
        renderGanttChart(plannedTasks);
    });
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
    }, timeout);
}

// Make functions globally available
window.editTask = editTask;
window.addToPlan = addToPlan;
window.removeFromPlan = removeFromPlan;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initCapacityPlanning();
});
