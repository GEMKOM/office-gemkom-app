// Capacity Planning Module JavaScript

// Import required modules
import { initNavbar } from '../../../../components/navbar.js';
import { HeaderComponent } from '../../../../components/header/header.js';
import { FiltersComponent } from '../../../../components/filters/filters.js';
import { TableComponent } from '../../../../components/table/table.js';
import { GanttChart } from '../../../../components/gantt/gantt.js';
import { fetchMachines, getMachineCalendar } from '../../../../apis/machines.js';
import { getCapacityPlanning, updateCapacityPlanning } from '../../../../apis/machining/capacityPlanning.js';
import { formatDateTime } from '../../../../apis/formatters.js';

// Global state
let currentMachineId = null;
let currentMachineName = '';
let machines = [];
let currentTasks = [];
let hasUnsavedChanges = false;
let machinesTable = null;
let tasksTable = null;
let isLoadingMachine = false;
let isLoadingTasks = false;
let ganttChart = null;
let machineCalendar = null;
let isInlineEditing = false; // Flag to prevent multiple simultaneous inline edits

// Change tracking for efficient submissions
let originalTasks = []; // Store original state for comparison
let changedTasks = new Set(); // Track which tasks have been modified

// Gantt chart state

// Utility functions for date formatting
function formatDateForInput(date) {
    // Format date for datetime-local input (YYYY-MM-DDTHH:MM)
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

// Change tracking utility functions
function markTaskAsChanged(taskKey) {
    changedTasks.add(taskKey);
    hasUnsavedChanges = true;
}


function resetChangeTracking() {
    changedTasks.clear();
    hasUnsavedChanges = false;
    originalTasks = JSON.parse(JSON.stringify(currentTasks)); // Deep copy
}

function getChangedTasks() {
    const changed = [];
    const processedKeys = new Set(); // Track processed task keys to avoid duplicates
    
    
    // Check for new tasks and existing task changes
    currentTasks.forEach(task => {
        const original = originalTasks.find(ot => ot.key === task.key);
        
        if (!original) {
            // New task that wasn't in original data
            if (task.in_plan) {
                changed.push(task);
                processedKeys.add(task.key);
            }
        } else {
            // Existing task - check for changes
            const hasChanges = 
                task.in_plan !== original.in_plan ||
                task.plan_order !== original.plan_order ||
                task.planned_start_ms !== original.planned_start_ms ||
                task.planned_end_ms !== original.planned_end_ms ||
                task.plan_locked !== original.plan_locked;
            
            if (hasChanges) {
                
                // If task was removed from plan, create a minimal payload
                if (original.in_plan && !task.in_plan) {
                    changed.push({
                        key: task.key,
                        in_plan: false
                    });
                } else {
                    // For other changes, include the full task data
                    changed.push(task);
                }
                processedKeys.add(task.key);
            }
        }
    });
    
    // Check for deleted tasks that are no longer in currentTasks at all
    originalTasks.forEach(original => {
        if (!processedKeys.has(original.key)) {
            const current = currentTasks.find(ct => ct.key === original.key);
            
            if (original.in_plan && (!current || !current.in_plan)) {
                // Task was removed from plan and not already processed
                changed.push({
                    key: original.key,
                    in_plan: false
                });
            }
        }
    });
    
    return changed;
}

// Machine Calendar Utility Functions
function parseTimeToMinutes(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
}

function minutesToTime(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

// No timezone conversion needed - all dates are in Turkey time

function isTimeInWorkingHours(date, timeString, calendar) {
    if (!calendar || !calendar.week_template) return true;
    
    const jsDayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const calendarDayOfWeek = (jsDayOfWeek + 6) % 7; // Convert to 0=Monday, 1=Tuesday, ..., 6=Sunday
    const workingDay = calendar.week_template[calendarDayOfWeek.toString()];
    
    if (!workingDay || workingDay.length === 0) return false;
    
    const timeMinutes = parseTimeToMinutes(timeString);
    
    return workingDay.some(window => {
        const startMinutes = parseTimeToMinutes(window.start);
        const endMinutes = parseTimeToMinutes(window.end);
        
        if (window.end_next_day) {
            // Handle overnight shifts (e.g., 18:00 to 02:00 next day)
            return timeMinutes >= startMinutes || timeMinutes <= endMinutes;
        } else {
            return timeMinutes >= startMinutes && timeMinutes <= endMinutes;
        }
    });
}

function isDateInWorkExceptions(date, calendar) {
    if (!calendar || !calendar.work_exceptions) return false;
    
    const dateString = date.toISOString().split('T')[0];
    const exception = calendar.work_exceptions.find(ex => ex.date === dateString);
    
    if (!exception) return false;
    
    // If windows array is empty, it means the day is completely closed
    return exception.windows.length === 0;
}

function getNextWorkingTime(startTime, calendar) {
    if (!calendar) return startTime;
    
    let currentTime = new Date(startTime);
    let attempts = 0;
    const maxAttempts = 365; // Allow up to 1 year to find working time
    
    
    while (attempts < maxAttempts) {
        const jsDayOfWeek = currentTime.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
        const calendarDayOfWeek = (jsDayOfWeek + 6) % 7; // Convert to 0=Monday, 1=Tuesday, ..., 6=Sunday
        const workingDay = calendar.week_template[calendarDayOfWeek.toString()];
        
        
        // Check if this day has work exceptions
        if (isDateInWorkExceptions(currentTime, calendar)) {
            const exception = calendar.work_exceptions.find(ex => ex.date === currentTime.toISOString().split('T')[0]);
            if (exception && exception.windows.length > 0) {
                // Use exception windows instead of regular schedule
                const timeString = currentTime.toTimeString().slice(0, 5);
                if (isTimeInWorkingHours(currentTime, timeString, { week_template: { [calendarDayOfWeek]: exception.windows } })) {
                    return currentTime;
                }
                // Find next working window in the exception
                const nextWindow = exception.windows.find(window => {
                    const windowStart = parseTimeToMinutes(window.start);
                    const currentMinutes = parseTimeToMinutes(timeString);
                    return windowStart > currentMinutes;
                });
                if (nextWindow) {
                    const [hours, minutes] = nextWindow.start.split(':').map(Number);
                    currentTime.setHours(hours, minutes, 0, 0);
                    return currentTime;
                }
            }
            // If exception has no windows or day is closed, move to next day
            currentTime.setDate(currentTime.getDate() + 1);
            currentTime.setHours(0, 0, 0, 0);
            attempts++;
            continue;
        }
        
        // Check regular working hours
        if (workingDay && workingDay.length > 0) {
            const timeString = currentTime.toTimeString().slice(0, 5);
            if (isTimeInWorkingHours(currentTime, timeString, calendar)) {
                return currentTime;
            }
            
            // Find next working window today
            const nextWindow = workingDay.find(window => {
                const windowStart = parseTimeToMinutes(window.start);
                const currentMinutes = parseTimeToMinutes(timeString);
                return windowStart > currentMinutes;
            });
            
            if (nextWindow) {
                const [hours, minutes] = nextWindow.start.split(':').map(Number);
                currentTime.setHours(hours, minutes, 0, 0);
                return currentTime;
            }
        } else {
        }
        
        // Move to next day and start from beginning
        currentTime.setDate(currentTime.getDate() + 1);
        currentTime.setHours(0, 0, 0, 0);
        attempts++;
    }
    
    return startTime; // Fallback to original time if no working time found
}

function getWorkingTimeEnd(startTime, durationMs, calendar) {
    if (!calendar) {
        return new Date(startTime.getTime() + durationMs);
    }
    
    let currentTime = new Date(startTime);
    let remainingDuration = durationMs;
    let attempts = 0;
    const maxAttempts = 365; // Allow up to 1 year to find working time for long tasks
    
    
    while (remainingDuration > 0 && attempts < maxAttempts) {
        const jsDayOfWeek = currentTime.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
        const calendarDayOfWeek = (jsDayOfWeek + 6) % 7; // Convert to 0=Monday, 1=Tuesday, ..., 6=Sunday
        const workingDay = calendar.week_template[calendarDayOfWeek.toString()];
        
        
        // Check if this day has work exceptions
        if (isDateInWorkExceptions(currentTime, calendar)) {
            const exception = calendar.work_exceptions.find(ex => ex.date === currentTime.toISOString().split('T')[0]);
            if (exception && exception.windows.length > 0) {
                // Use exception windows
                const timeString = currentTime.toTimeString().slice(0, 5);
                const currentMinutes = parseTimeToMinutes(timeString);
                
                for (const window of exception.windows) {
                    const windowStart = parseTimeToMinutes(window.start);
                    const windowEnd = parseTimeToMinutes(window.end);
                    
                    if (currentMinutes >= windowStart && currentMinutes < windowEnd) {
                        const availableTime = windowEnd - currentMinutes;
                        const remainingMinutes = remainingDuration / (1000 * 60);
                        
                        
                        if (availableTime >= remainingMinutes) {
                            // Can complete within this window
                            const endMinutes = currentMinutes + remainingMinutes;
                            const [hours, mins] = minutesToTime(endMinutes).split(':').map(Number);
                            currentTime.setHours(hours, mins, 0, 0);
                            return currentTime;
                        } else {
                            // Use remaining time in this window
                            remainingDuration -= availableTime * 60 * 1000;
                            // Move to next day
                            currentTime.setDate(currentTime.getDate() + 1);
                            currentTime.setHours(0, 0, 0, 0);
                            break;
                        }
                    }
                }
            } else {
                // Day is closed, move to next day
                currentTime.setDate(currentTime.getDate() + 1);
                currentTime.setHours(0, 0, 0, 0);
            }
        } else if (workingDay && workingDay.length > 0) {
            // Regular working hours
            const timeString = currentTime.toTimeString().slice(0, 5);
            const currentMinutes = parseTimeToMinutes(timeString);
            
            // Find the current working window
            let currentWindow = null;
            for (const window of workingDay) {
                const windowStart = parseTimeToMinutes(window.start);
                const windowEnd = parseTimeToMinutes(window.end);
                
                if (currentMinutes >= windowStart && currentMinutes < windowEnd) {
                    currentWindow = window;
                    break;
                }
            }
            
            if (currentWindow) {
                const windowStart = parseTimeToMinutes(currentWindow.start);
                const windowEnd = parseTimeToMinutes(currentWindow.end);
                const availableTime = windowEnd - currentMinutes;
                const remainingMinutes = remainingDuration / (1000 * 60);
                
                
                if (availableTime >= remainingMinutes) {
                    // Can complete within this window
                    const endMinutes = currentMinutes + remainingMinutes;
                    const [hours, mins] = minutesToTime(endMinutes).split(':').map(Number);
                    currentTime.setHours(hours, mins, 0, 0);
                    return currentTime;
                } else {
                    // Use remaining time in this window
                    remainingDuration -= availableTime * 60 * 1000;
                    
                    // Check if there's another window today
                    const nextWindow = workingDay.find(window => {
                        const windowStart = parseTimeToMinutes(window.start);
                        const windowEnd = parseTimeToMinutes(window.end);
                        // Find a window that starts after the current window ends
                        return windowStart > parseTimeToMinutes(currentWindow.end);
                    });
                    
                    if (nextWindow) {
                        // Move to next window today
                        const [hours, minutes] = nextWindow.start.split(':').map(Number);
                        currentTime.setHours(hours, minutes, 0, 0);
                    } else {
                        // Move to next day
                        currentTime.setDate(currentTime.getDate() + 1);
                        currentTime.setHours(0, 0, 0, 0);
                    }
                }
            } else {
                // Not in a working window, find next working time
                const nextWindow = workingDay.find(window => {
                    const windowStart = parseTimeToMinutes(window.start);
                    return windowStart > currentMinutes;
                });
                
                if (nextWindow) {
                    // Move to next window today
                    const [hours, minutes] = nextWindow.start.split(':').map(Number);
                    currentTime.setHours(hours, minutes, 0, 0);
                } else {
                    // Move to next day
                    currentTime.setDate(currentTime.getDate() + 1);
                    currentTime.setHours(0, 0, 0, 0);
                }
            }
        } else {
            // No working hours for this day, move to next day
            currentTime.setDate(currentTime.getDate() + 1);
            currentTime.setHours(0, 0, 0, 0);
        }
        
        attempts++;
    }
    
    // Fallback: return start time + duration if we can't find working hours
    return new Date(startTime.getTime() + durationMs);
}

// Initialize capacity planning module
function initCapacityPlanning() {
    
    // Initialize navbar
    initNavbar();
    
    // Initialize header component
    initHeader();
    
    // Initialize filters
    initFilters();
    
    // Initialize machines table
    initMachinesTable();
    
    // Initialize tasks table
    initTasksTable();
    
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
        title: 'Kapasite Planlayıcı',
        subtitle: 'Makine kapasitelerini planlayın ve üretim programını oluşturun',
        icon: 'calendar-alt',
        containerId: 'header-placeholder',
        showBackButton: 'block',
        showRefreshButton: 'none',
        backUrl: '/manufacturing/machining/capacity/'
    });
}

// Initialize filters component
function initFilters() {
    const filters = new FiltersComponent('filters-placeholder', {
        title: 'Planlama Filtreleri',
        showApplyButton: true,
        showClearButton: true,
        onApply: (values) => {
            applyFilters(values);
        },
        onClear: () => {
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
                loadMachines();
            },
            onRowClick: (row, index) => {
                if (row && row.id && row.name) {
                    selectMachine(row.id, row.name);
                } else {
                }
            },
            emptyMessage: 'Makine bulunamadı',
            emptyIcon: 'fas fa-industry'
        });
        
    } catch (error) {
    }
}

// Initialize tasks table component
function initTasksTable() {
    
    try {
        tasksTable = new TableComponent('tasks-table-container', {
            title: 'Planlanmış Görevler',
            icon: 'tasks',
            iconColor: 'text-success',
            rowAttributes: (row, rowIndex) => `data-task-key="${row.key}"`,
            skeleton: true,
            skeletonRows: 5,
            columns: [
                {
                    field: 'plan_order',
                    label: 'Sıra',
                    sortable: true,
                    width: '30px',
                    formatter: (value) => `
                        <span class="badge bg-primary">${value || '-'}</span>
                    `
                },
                {
                    field: 'key',
                    label: 'TI No',
                    sortable: true,
                    formatter: (value) => `<strong>${value}</strong>`
                },
                {
                    field: 'name',
                    label: 'Görev Adı',
                    sortable: true
                },
                {
                    field: 'job_no',
                    label: 'İş No',
                    sortable: true,
                    formatter: (value) => value || '-'
                },
                {
                    field: 'quantity',
                    label: 'Adet',
                    sortable: true,
                    formatter: (value) => value || '-'
                },
                {
                    field: 'estimated_hours',
                    label: 'Tahmini Saat',
                    sortable: true,
                    formatter: (value) => value ? `${value}h` : '-'
                },
                {
                    field: 'remaining_hours',
                    label: 'Kalan Saat',
                    sortable: true,
                    formatter: (value) => value ? `${value}h` : '-'
                },
                {
                    field: 'planned_start_ms',
                    label: 'Planlanan Başlangıç',
                    sortable: true,
                    formatter: (value, row) => {
                        if (!value) return '<span class="editable-cell" data-field="planned_start_ms" data-task-key="' + row.key + '">-</span>';
                        return `<span class="editable-cell" data-field="planned_start_ms" data-task-key="${row.key}"><div class="created-date">${formatDateTime(new Date(value).toISOString())}</div></span>`;
                    }
                },
                {
                    field: 'planned_end_ms',
                    label: 'Planlanan Bitiş',
                    sortable: true,
                    formatter: (value, row) => {
                        if (!value) return '<span class="editable-cell" data-field="planned_end_ms" data-task-key="' + row.key + '">-</span>';
                        return `<span class="editable-cell" data-field="planned_end_ms" data-task-key="${row.key}"><div class="created-date">${formatDateTime(new Date(value).toISOString())}</div></span>`;
                    }
                },
                {
                    field: 'finish_time',
                    label: 'Bitiş Tarihi',
                    sortable: true,
                    formatter: (value) => {
                        if (!value) return '-';
                        return `<div class="created-date">${formatDateTime(value, false)}</div>`; // false = date only, no time
                    }
                },
                {
                    field: 'plan_locked',
                    label: 'Durum',
                    sortable: true,
                    formatter: (value) => `
                        <span class="badge ${value ? 'bg-warning' : 'bg-success'}">
                            ${value ? 'Kilitli' : 'Aktif'}
                        </span>
                    `
                },
                {
                    field: 'actions',
                    label: 'İşlemler',
                    sortable: false,
                    width: '100px',
                    formatter: (value, row) => `
                        <div class="btn-group btn-group-sm">
                            <button class="btn btn-outline-primary btn-sm" onclick="editTask('${row.key}')" title="Düzenle">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-outline-danger btn-sm" onclick="removeFromPlan('${row.key}')" title="Plandan Çıkar">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    `
                }
            ],
            sortable: true,
            refreshable: true,
            draggable: true,
            onRefresh: () => {
                if (currentMachineId) {
                    loadMachineTasks(currentMachineId);
                } else {
                    showNotification('Önce bir makine seçin', 'warning');
                }
            },
            onReorder: (draggedTaskKey, targetTaskKey, insertPosition) => {
                reorderTasks(draggedTaskKey, targetTaskKey, insertPosition);
            },
            emptyMessage: 'Planlamak için bir makine seçin',
            emptyIcon: 'fas fa-mouse-pointer',
            onRowClick: (row, index) => {
                // Handle row click if needed
            }
        });
    } catch (error) {
    }
}

// Initialize Gantt chart component
function initGanttChart() {
    try {
        ganttChart = new GanttChart('gantt-container', {
            title: 'Zaman Çizelgesi',
            defaultPeriod: 'month',
            showDateOverlay: true,
            showCurrentTime: true,
            onPeriodChange: (period, date) => {
                // Re-render with current tasks if any
                if (currentMachineId) {
                    const plannedTasks = currentTasks.filter(t => t.in_plan);
                    ganttChart.setTasks(plannedTasks);
                }
            },
            onTaskClick: (task, event) => {
                if (task && task.key) {
                    editTask(task.key);
                }
            }
        });
    } catch (error) {
    }
}

// Load machines from API
async function loadMachines() {
    try {
        if (machinesTable) {
            machinesTable.setLoading(true);
        }
        const response = await fetchMachines(1, 100, { used_in: 'cnc_cutting' });
        
        machines = response.results || response;
        // Handle case where no machines are returned
        if (!machines || !Array.isArray(machines)) {
            machines = [];
        }
        
        // If no machines found, add some mock data for testing
        if (machines.length === 0) {
            machines = [
                { id: 1, name: 'CNC Tezgah 1', is_active: true },
                { id: 2, name: 'CNC Tezgah 2', is_active: true },
                { id: 3, name: 'Torna Tezgahı', is_active: false },
                { id: 4, name: 'Freze Tezgahı', is_active: true }
            ];
        }
        
        // Use tasks_count from API response (don't override it)
        // Sort machines by task count (most to least)
        machines = machines.sort((a, b) => (b.tasks_count || 0) - (a.tasks_count || 0));
        
        if (machinesTable) {
            // Update the table's internal state first
            machinesTable.options.loading = false;
            machinesTable.options.data = machines;
            // Then render the table
            machinesTable.render();
            
            // Check if table was rendered properly
            setTimeout(() => {
                const tableRows = machinesTable.container.querySelectorAll('tbody tr');
                addManualRowClickListeners();
            }, 100);
        } else {
        }
    } catch (error) {
        showNotification('Makineler yüklenirken hata oluştu', 'error');
        if (machinesTable) {
            machinesTable.options.loading = false;
            machinesTable.options.data = [];
            machinesTable.render();
        }
    }
}


// Select a machine and load its tasks
async function selectMachine(machineId, machineName) {
    // Prevent multiple simultaneous requests
    if (isLoadingMachine) {
        showNotification('Makine yükleniyor, lütfen bekleyin...', 'info', 1500);
        return;
    }
    
    // Check if same machine is already selected
    if (currentMachineId === machineId) {
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
            tableRows.forEach(row => {
                row.classList.remove('selected');
            });
            
            // Find and select the clicked row
            const machineIndex = machines.findIndex(m => m.id === machineId);
            if (machineIndex !== -1 && tableRows[machineIndex]) {
                tableRows[machineIndex].classList.add('selected');
            }
        }
        
        // Show skeleton loading in tasks table
        showTasksTableSkeleton();
        
        // Disable buttons during loading
        document.getElementById('autoschedule-btn').disabled = true;
        document.getElementById('save-plan-btn').disabled = true;
        
        // Add a small delay to ensure skeleton is visible
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Load machine calendar and tasks
        await Promise.all([
            loadMachineCalendar(machineId),
            loadMachineTasks(machineId)
        ]);
        
        // Enable buttons
        document.getElementById('autoschedule-btn').disabled = false;
        document.getElementById('save-plan-btn').disabled = false;
        
        
    } catch (error) {
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

// Load machine calendar
async function loadMachineCalendar(machineId) {
    try {
        machineCalendar = await getMachineCalendar(machineId);
    } catch (error) {
        machineCalendar = null;
        showNotification('Makine takvimi yüklenirken hata oluştu', 'warning');
    }
}

// Load tasks for selected machine
async function loadMachineTasks(machineId) {
    try {
        const tasks = await getCapacityPlanning(machineId, 'cnc_cutting');
        currentTasks = tasks;
        
        // Initialize change tracking with original state
        resetChangeTracking();
        
        // Separate planned and unplanned tasks
        const planned = tasks.filter(task => task.in_plan);
        const unplanned = tasks.filter(task => !task.in_plan);
        
        
        renderTasksTable(planned);
        renderUnplannedTasksTable(unplanned);
        updateGanttChart(planned);
        
    } catch (error) {
        showNotification('Görevler yüklenirken hata oluştu', 'error');
    }
}

// Render tasks table
function renderTasksTable(tasks) {
    if (!tasksTable) {
        return;
    }

    // Turn off loading state
    tasksTable.setLoading(false);
    // Sort tasks by plan_order
    const sortedTasks = [...tasks].sort((a, b) => (a.plan_order || 0) - (b.plan_order || 0));

    // Update the table with new data
    tasksTable.updateData(sortedTasks);
    // Setup inline editing after table is updated
    setTimeout(() => {
        setupInlineEditing();
    }, 100);
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


// Update Gantt chart with tasks
function updateGanttChart(tasks) {
    if (!ganttChart) {
        return;
    }

    // Transform tasks to match the Gantt component's expected format
    const transformedTasks = tasks.map(task => ({
        id: task.key,
        title: task.name,
        name: task.name,
        key: task.key,
        ti_number: task.key, // Add TI number for gantt display
        planned_start_ms: task.planned_start_ms,
        planned_end_ms: task.planned_end_ms,
        plan_order: task.plan_order,
        plan_locked: task.plan_locked
    }));
    // Pass machine calendar to Gantt chart for working hours display
    if (machineCalendar) {
        ganttChart.setMachineCalendar(machineCalendar);
    }
    
    ganttChart.setTasks(transformedTasks);
}

// Reorder tasks and update plan_order
function reorderTasks(draggedTaskKey, targetTaskKey, insertPosition = 'after') {
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
    
    // Calculate new index based on insert position
    let newIndex;
    if (insertPosition === 'before') {
        // Insert before the target task
        newIndex = draggedIndex < targetIndex ? targetIndex - 1 : targetIndex;
    } else {
        // Insert after the target task (default behavior)
        newIndex = draggedIndex < targetIndex ? targetIndex - 1 : targetIndex;
    }
    
    // Ensure newIndex is within bounds
    newIndex = Math.max(0, Math.min(newIndex, plannedTasks.length));
    
    // Insert at new position
    plannedTasks.splice(newIndex, 0, draggedTask);
    
    // Update plan_order for all tasks in the original currentTasks array
    plannedTasks.forEach((task, index) => {
        task.plan_order = index + 1;
        // Also update the task in the original currentTasks array
        const originalTask = currentTasks.find(t => t.key === task.key);
        if (originalTask) {
            originalTask.plan_order = index + 1;
            markTaskAsChanged(task.key);
        }
    });
    
    // Re-render the table and Gantt chart
    const updatedPlannedTasks = currentTasks.filter(t => t.in_plan);
    renderTasksTable(updatedPlannedTasks);
    updateGanttChart(updatedPlannedTasks);
}






// Edit task
function editTask(taskKey) {
    const task = currentTasks.find(t => t.key === taskKey);
    if (!task) return;

    // Populate modal with dates (display as local time)
    document.getElementById('edit-task-key').value = taskKey;
    document.getElementById('edit-start-date').value = task.planned_start_ms 
        ? formatDateForInput(new Date(task.planned_start_ms))
        : '';
    document.getElementById('edit-end-date').value = task.planned_end_ms 
        ? formatDateForInput(new Date(task.planned_end_ms))
        : '';
    document.getElementById('edit-plan-order').value = task.plan_order || '';
    document.getElementById('edit-plan-locked').checked = task.plan_locked || false;

    // Show modal
    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('editTaskModal'));
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

    markTaskAsChanged(taskKey);
    
    // Update the display immediately
    const updatedPlannedTasks = currentTasks.filter(t => t.in_plan);
    renderTasksTable(updatedPlannedTasks);
    updateGanttChart(updatedPlannedTasks);
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

    markTaskAsChanged(taskKey);
    
    // Update the display immediately
    const updatedPlannedTasks = currentTasks.filter(t => t.in_plan);
    renderTasksTable(updatedPlannedTasks);
    updateGanttChart(updatedPlannedTasks);
    renderUnplannedTasksTable(currentTasks.filter(t => !t.in_plan));
    
    showNotification('Görev plandan çıkarıldı', 'info', 2000);
}

// Autoschedule tasks
function autoscheduleTasks() {
    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('autoscheduleModal'));
    
    // Set default start date to now (local time)
    const now = new Date();
    const defaultStartDate = now.getFullYear() + '-' + 
        String(now.getMonth() + 1).padStart(2, '0') + '-' + 
        String(now.getDate()).padStart(2, '0') + 'T' + 
        String(now.getHours()).padStart(2, '0') + ':' + 
        String(now.getMinutes()).padStart(2, '0');
    
    document.getElementById('autoschedule-start-date').value = defaultStartDate;
    
    // Update calendar info in modal
    const calendarInfo = document.getElementById('calendar-info');
    if (calendarInfo) {
        if (machineCalendar) {
            calendarInfo.innerHTML = `
                <div class="alert alert-success">
                    <i class="fas fa-calendar-check me-2"></i>
                    <strong>Makine Takvimi Aktif (Turkey Time):</strong> Görevler sadece çalışma saatleri içinde planlanacaktır.
                </div>
            `;
        } else {
            calendarInfo.innerHTML = `
                <div class="alert alert-warning">
                    <i class="fas fa-calendar-times me-2"></i>
                    <strong>Makine Takvimi Bulunamadı:</strong> Görevler 7/24 planlanacaktır (Turkey Time).
                </div>
            `;
        }
    }
    
    modal.show();
}

// Confirm autoschedule
async function confirmAutoschedule() {
    const criteria = document.getElementById('autoschedule-criteria').value;
    const startDateInput = document.getElementById('autoschedule-start-date').value;
    
    if (!startDateInput) {
        showNotification('Geçerli bir başlangıç tarihi seçin', 'error');
        return;
    }
    
    // Parse the datetime-local input directly (no conversion needed)
    const startDate = new Date(startDateInput);
    
    if (!startDate || isNaN(startDate.getTime())) {
        showNotification('Geçerli bir başlangıç tarihi seçin', 'error');
        return;
    }

    const tasksToSchedule = currentTasks.filter(task => task.in_plan);
    
    if (tasksToSchedule.length === 0) {
        showNotification('Planlanacak görev bulunmuyor', 'warning');
        return;
    }

    // Sort tasks based on criteria - STRICTLY follow the order
    let sortedTasks;
    if (criteria === 'finish_time') {
        // Sort by finish time, but maintain sequential order
        sortedTasks = tasksToSchedule.sort((a, b) => {
            const dateA = a.finish_time ? new Date(a.finish_time) : new Date('2099-12-31');
            const dateB = b.finish_time ? new Date(b.finish_time) : new Date('2099-12-31');
            return dateA - dateB;
        });
        // When sorting by finish_time, update plan_order to reflect new order
        sortedTasks.forEach((task, index) => {
            task.plan_order = index + 1;
        });
    } else {
        // Sort by plan_order - this is the default "order" criteria
        sortedTasks = tasksToSchedule.sort((a, b) => (a.plan_order || 0) - (b.plan_order || 0));
        // Keep existing plan_order values - don't overwrite them
    }

    // Start from the chosen start date and find the first working time
    let currentTime = new Date(startDate);
    
    // If we have a calendar, find the next working time from the start date
    if (machineCalendar) {
        currentTime = getNextWorkingTime(currentTime, machineCalendar);
    }
    
    
    // Schedule tasks SEQUENTIALLY - each task starts where the previous one ends
    sortedTasks.forEach((task, index) => {
        const remainingHours = task.remaining_hours || task.estimated_hours || 2;
        const duration = remainingHours * 60 * 60 * 1000; // Convert hours to milliseconds
        
        // For the first task, use the current time (which respects the start date)
        // For subsequent tasks, they start where the previous task ended
        const taskStartTime = new Date(currentTime);
        let taskEndTime;
        
        if (machineCalendar) {
            // Ensure we're starting at a working time
            const workingStartTime = getNextWorkingTime(taskStartTime, machineCalendar);
            taskEndTime = getWorkingTimeEnd(workingStartTime, duration, machineCalendar);
            currentTime = new Date(taskEndTime); // Next task starts where this one ends
            
            // Update task with working times
            task.planned_start_ms = workingStartTime.getTime();
        } else {
            taskEndTime = new Date(taskStartTime.getTime() + duration);
            currentTime = new Date(taskEndTime); // Next task starts where this one ends
            
            // Update task with simple times
            task.planned_start_ms = taskStartTime.getTime();
        }
        task.planned_end_ms = taskEndTime.getTime();
        // Don't overwrite plan_order here - it should already be set correctly from sorting
        
        // Mark task as changed
        markTaskAsChanged(task.key);
    });
    
    // Close modal
    const modal = bootstrap.Modal.getInstance(document.getElementById('autoscheduleModal'));
    modal.hide();
    
    // Update display (frontend only)
    const plannedTasks = currentTasks.filter(t => t.in_plan);
    renderTasksTable(plannedTasks);
    updateGanttChart(plannedTasks);
    
    showNotification('Görevler otomatik olarak planlandı', 'success');
}

// Save plan
async function savePlan() {
    if (!hasUnsavedChanges) {
        showNotification('Kaydedilecek değişiklik bulunmuyor', 'info');
        return;
    }

    try {
        // Get only the changed tasks
        const changedTasks = getChangedTasks();
        
        if (changedTasks.length === 0) {
            showNotification('Kaydedilecek değişiklik bulunmuyor', 'info');
            return;
        }

        // Build the payload according to the required format
        const updateData = {
            items: changedTasks.map(task => {
                const payload = {
                    key: task.key
                };

                // For new tasks or tasks being added to plan
                if (task.in_plan) {
                    payload.in_plan = true;
                    
                    // Include machine_fk if available
                    if (task.machine_fk) {
                        payload.machine_fk = task.machine_fk;
                    }
                    
                    // Include name for new tasks
                    if (task.name) {
                        payload.name = task.name;
                    }
                    
                    // Include timing information if available
                    if (task.planned_start_ms) {
                        payload.planned_start_ms = task.planned_start_ms;
                    }
                    if (task.planned_end_ms) {
                        payload.planned_end_ms = task.planned_end_ms;
                    }
                    
                    // Include order if available
                    if (task.plan_order) {
                        payload.plan_order = task.plan_order;
                    }
                    
                    // Include lock status if available
                    if (task.plan_locked !== undefined) {
                        payload.plan_locked = task.plan_locked;
                    }
                } else {
                    // For tasks being removed from plan
                    payload.in_plan = false;
                }

                return payload;
            })
        };
        
        const result = await updateCapacityPlanning(updateData);
        // Reset change tracking after successful save
        resetChangeTracking();
        showNotification('Plan başarıyla kaydedildi', 'success');
        
    } catch (error) {
        showNotification(`Plan kaydedilirken hata oluştu: ${error.message}`, 'error');
    }
}

// Apply filters
function applyFilters(values) {
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
    machineCalendar = null;
    
    // Reset change tracking
    resetChangeTracking();
    
    // Reset loading state
    isLoadingMachine = false;
    
    // Show empty state in tasks table
    showTasksTableEmpty();
}

// Show skeleton loading in tasks table
function showTasksTableSkeleton() {
    if (!tasksTable) {
        return;
    }
    
    // Set loading state to show skeleton
    tasksTable.setLoading(true);
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
    if (!tasksTable) return;
    
    // Set loading to false and update with empty data
    tasksTable.setLoading(false);
    tasksTable.updateData([]);
}

// Add manual row click listeners as fallback
function addManualRowClickListeners() {
    if (!machinesTable) return;
    
    const tableRows = machinesTable.container.querySelectorAll('tbody tr');
    tableRows.forEach((row, index) => {
        // Add new click listener
        row.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const machine = machines[index];
            if (machine) {
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
            // Use dates directly (no conversion needed)
            task.planned_start_ms = startDate ? new Date(startDate).getTime() : null;
            task.planned_end_ms = endDate ? new Date(endDate).getTime() : null;
            
            task.plan_order = planOrder ? parseInt(planOrder) : null;
            task.plan_locked = planLocked;
            
            markTaskAsChanged(taskKey);
            
            const modal = bootstrap.Modal.getInstance(document.getElementById('editTaskModal'));
            modal.hide();
            
            // Update the display immediately instead of reloading
            const updatedPlannedTasks = currentTasks.filter(t => t.in_plan);
            renderTasksTable(updatedPlannedTasks);
            updateGanttChart(updatedPlannedTasks);
        }
    });
    
    // Confirm autoschedule
    document.getElementById('confirm-autoschedule').addEventListener('click', confirmAutoschedule);
    
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

// Setup inline editing for editable cells
function setupInlineEditing() {
    const editableCells = document.querySelectorAll('.editable-cell');
    
    editableCells.forEach(cell => {
        cell.addEventListener('click', function(e) {
            // Don't trigger if clicking on action buttons
            if (e.target.closest('.action-buttons')) {
                return;
            }
            
            // Skip if already editing globally
            if (isInlineEditing) {
                return;
            }
            
            const taskKey = this.dataset.taskKey;
            const field = this.dataset.field;
            const currentValue = this.textContent.trim();
            
            // Skip if already editing this cell
            if (this.querySelector('input')) {
                return;
            }
            
            startInlineEdit(this, taskKey, field, currentValue);
        });
    });
}

function startInlineEdit(cell, taskKey, field, currentValue) {
    // Prevent multiple simultaneous inline edits
    if (isInlineEditing) {
        return;
    }
    
    // Set inline editing flag
    isInlineEditing = true;
    
    // Clear the flag after 30 seconds as a safety measure
    setTimeout(() => {
        isInlineEditing = false;
    }, 30000);
    
    // Create input element based on field type
    let input;
    
    // Set input type and attributes based on field
    switch (field) {
        case 'planned_start_ms':
        case 'planned_end_ms':
            input = document.createElement('input');
            input.type = 'datetime-local';
            input.className = 'form-control form-control-sm';
            
            // Convert current value to datetime-local format
            if (currentValue && currentValue !== '-') {
                try {
                    // Parse the formatted date string
                    const date = new Date(currentValue);
                    if (!isNaN(date.getTime())) {
                        // Format for datetime-local input (YYYY-MM-DDTHH:MM)
                        const year = date.getFullYear();
                        const month = String(date.getMonth() + 1).padStart(2, '0');
                        const day = String(date.getDate()).padStart(2, '0');
                        const hours = String(date.getHours()).padStart(2, '0');
                        const minutes = String(date.getMinutes()).padStart(2, '0');
                        input.value = `${year}-${month}-${day}T${hours}:${minutes}`;
                    } else {
                        input.value = '';
                    }
                } catch (e) {
                    input.value = '';
                }
            } else {
                input.value = '';
            }
            break;
        default:
            input = document.createElement('input');
            input.type = 'text';
            input.className = 'form-control form-control-sm';
            input.value = currentValue === '-' ? '' : currentValue;
    }
    
    // Store original content
    const originalContent = cell.innerHTML;
    
    // Replace cell content with input
    cell.innerHTML = '';
    cell.appendChild(input);
    
    // Focus on input
    input.focus();
    if (input.type !== 'select-one') {
        input.select();
    }
    
    // Handle input events
    input.addEventListener('blur', (e) => {
        // Check if input still exists in DOM before proceeding
        if (!input.parentNode) {
            return;
        }
        
        // Add a small delay to prevent race conditions
        setTimeout(() => {
            // Check again if input still exists
            if (input.parentNode) {
                finishInlineEdit(cell, taskKey, field, input.value, originalContent);
            }
        }, 100);
    });
    
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            finishInlineEdit(cell, taskKey, field, input.value, originalContent);
        } else if (e.key === 'Escape') {
            // Check if cell still exists before setting innerHTML
            if (cell && cell.parentNode) {
                cell.innerHTML = originalContent;
                isInlineEditing = false;
            }
        }
    });
}

async function finishInlineEdit(cell, taskKey, field, newValue, originalContent) {
    try {
        // Clear inline editing flag
        isInlineEditing = false;
        
        // Check if this cell is already being processed
        if (cell.dataset.processing === 'true') {
            return;
        }
        
        // Mark this cell as being processed
        cell.dataset.processing = 'true';
        
        // Find the task in our local array
        const task = currentTasks.find(t => t.key === taskKey);
        if (!task) {
            // Check if cell still exists before setting innerHTML
            if (cell && cell.parentNode) {
                cell.innerHTML = originalContent;
            }
            showNotification('Görev bulunamadı', 'error');
            return;
        }
        
        // Update the task data based on field
        let hasChanges = false;
        
        switch (field) {
            case 'planned_start_ms':
                if (newValue) {
                    const newDate = new Date(newValue);
                    if (!isNaN(newDate.getTime())) {
                        task.planned_start_ms = newDate.getTime();
                        hasChanges = true;
                    }
                } else {
                    task.planned_start_ms = null;
                    hasChanges = true;
                }
                break;
            case 'planned_end_ms':
                if (newValue) {
                    const newDate = new Date(newValue);
                    if (!isNaN(newDate.getTime())) {
                        task.planned_end_ms = newDate.getTime();
                        hasChanges = true;
                    }
                } else {
                    task.planned_end_ms = null;
                    hasChanges = true;
                }
                break;
        }
        
        if (hasChanges) {
            markTaskAsChanged(taskKey);
            
            // Update the display immediately
            const updatedPlannedTasks = currentTasks.filter(t => t.in_plan);
            renderTasksTable(updatedPlannedTasks);
            updateGanttChart(updatedPlannedTasks);
            
            showNotification('Görev güncellendi', 'success', 2000);
        } else {
            // No changes, restore original content
            if (cell && cell.parentNode) {
                cell.innerHTML = originalContent;
            }
        }
        
    } catch (error) {
        showNotification('Güncelleme sırasında hata oluştu', 'error');
        
        // Restore original content on error
        if (cell && cell.parentNode) {
            cell.innerHTML = originalContent;
        }
    } finally {
        // Clear processing flag
        if (cell) {
            cell.dataset.processing = 'false';
        }
    }
}

// Make functions globally available
window.editTask = editTask;
window.addToPlan = addToPlan;
window.removeFromPlan = removeFromPlan;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initCapacityPlanning();
});
