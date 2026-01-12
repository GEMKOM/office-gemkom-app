// Capacity Planning Module JavaScript

// Import required modules
import { initNavbar } from '../../../../components/navbar.js';
import { HeaderComponent } from '../../../../components/header/header.js';
import { FiltersComponent } from '../../../../components/filters/filters.js';
import { TableComponent } from '../../../../components/table/table.js';
import { GanttChart } from '../../../../components/gantt/gantt.js';
import { fetchMachinesDropdown, getMachineCalendar } from '../../../../apis/machines.js';
import { getOperations, bulkSaveOperationsPlanning, updateOperation } from '../../../../apis/machining/operations.js';
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
let inlineEditingSetup = false; // Track if event delegation is already set up

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
        backUrl: '/manufacturing/machining_2/capacity/'
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
        tasksTable = new TableComponent('operations-table-container', {
            title: 'Planlanmış Operasyonlar',
            icon: 'tasks',
            iconColor: 'text-success',
            rowAttributes: (row, rowIndex) => {
                const baseAttr = `data-task-key="${row.key}"`;
                const unplannedAttr = !row.in_plan ? ' data-unplanned="true"' : '';
                return baseAttr + unplannedAttr;
            },
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
                    label: 'OP No',
                    sortable: true,
                    formatter: (value, row) => {
                        const operationName = row.name ? ` <span class="text-muted">(${row.name})</span>` : '';
                        return `<strong>${value}</strong>${operationName}`;
                    }
                },
                {
                    field: 'part_name',
                    label: 'Parça Adı',
                    sortable: true,
                    formatter: (value) => value || '-'
                },
                {
                    field: 'estimated_hours',
                    label: 'Tahmini Saat',
                    sortable: true,
                    formatter: (value, row) => {
                        const displayValue = value ? `${value}h` : '-';
                        return `<span class="editable-cell" data-field="estimated_hours" data-task-key="${row.key}">${displayValue}</span>`;
                    }
                },
                {
                    field: 'remaining_hours',
                    label: 'Kalan Saat',
                    sortable: true,
                    formatter: (value, row) => {
                        const estimatedHours = row.estimated_hours || 0;
                        const totalHoursSpent = row.total_hours_spent || 0;
                        const remainingHours = estimatedHours - totalHoursSpent;
                        const displayValue = remainingHours > 0 ? `${remainingHours.toFixed(2)}h` : '0h';
                        return `<span>${displayValue}</span>`;
                    }
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
                    field: 'actions',
                    label: 'İşlemler',
                    sortable: false,
                    width: '100px',
                    formatter: (value, row) => {
                        // Only show remove button for planned tasks
                        if (row.in_plan) {
                            return `
                                <button class="btn btn-outline-danger btn-sm" onclick="removeFromPlan('${row.key}')" title="Plandan Çıkar">
                                    <i class="fas fa-times"></i>
                                </button>
                            `;
                        }
                        // For unplanned tasks, show nothing or a placeholder
                        return '<span class="text-muted">-</span>';
                    }
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
                // Task click handler removed - no edit modal
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
        machines = await fetchMachinesDropdown('machining');
        
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
        
        // Sort machines by name (alphabetically)
        machines = machines.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        
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

// Load operations for selected machine
async function loadMachineTasks(machineId) {
    try {
        // Always filter for incomplete operations only (completion_date is null)
        const response = await getOperations({ 
            machine_fk: machineId,
            completion_date__isnull: 'true'
        });
        const tasks = Array.isArray(response) ? response : (response.results || []);
        currentTasks = tasks;
        
        // Initialize change tracking with original state
        resetChangeTracking();
        
        // Separate planned and unplanned tasks (optimize with single pass)
        const planned = [];
        const unplanned = [];
        tasks.forEach(task => {
            if (task.in_plan) {
                planned.push(task);
            } else {
                unplanned.push(task);
            }
        });
        
        renderTasksTable(planned, unplanned);
        updateGanttChart(planned);
        
    } catch (error) {
        showNotification('Operasyonlar yüklenirken hata oluştu', 'error');
    }
}

// Render tasks table
function renderTasksTable(plannedTasks, unplannedTasks = []) {
    if (!tasksTable) {
        return;
    }

    // Turn off loading state
    tasksTable.setLoading(false);
    // Sort planned tasks by plan_order
    const sortedPlannedTasks = [...plannedTasks].sort((a, b) => (a.plan_order || 0) - (b.plan_order || 0));
    
    // Combine planned and unplanned tasks (unplanned at the bottom)
    const allTasks = [...sortedPlannedTasks, ...unplannedTasks];

    // Update the table with new data
    tasksTable.updateData(allTasks);
    
    // Setup inline editing once using event delegation (more efficient)
    if (!inlineEditingSetup) {
        setupInlineEditingDelegation();
        inlineEditingSetup = true;
    }
    
    // Use requestAnimationFrame for efficient DOM updates
    requestAnimationFrame(() => {
        // Mark unplanned task rows with colored background using CSS classes instead of inline styles
        const tableBody = tasksTable.container.querySelector('tbody');
        if (tableBody) {
            const tableRows = tableBody.querySelectorAll('tr');
            const plannedCount = sortedPlannedTasks.length;
            
            // Use DocumentFragment for batch DOM updates
            tableRows.forEach((row, index) => {
                const isUnplanned = row.getAttribute('data-unplanned') === 'true' || index >= plannedCount;
                if (isUnplanned) {
                    row.classList.add('unplanned-task-row');
                    row.style.backgroundColor = '#fff3cd'; // Light yellow/warning color
                } else {
                    row.classList.remove('unplanned-task-row');
                    row.style.backgroundColor = '';
                }
            });
        }
    });
}

// Render unplanned tasks table (deprecated - now included in main table)
function renderUnplannedTasksTable(tasks) {
    // This function is no longer used, but kept for compatibility
    // Unplanned tasks are now displayed in the main table
}


// Update Gantt chart with tasks (debounced for performance)
let ganttUpdateTimeout = null;
function updateGanttChart(tasks) {
    if (!ganttChart) {
        return;
    }

    // Debounce Gantt chart updates to avoid excessive re-renders
    if (ganttUpdateTimeout) {
        clearTimeout(ganttUpdateTimeout);
    }
    
    ganttUpdateTimeout = setTimeout(() => {
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
        ganttUpdateTimeout = null;
    }, 150); // Debounce by 150ms
}

// Reorder tasks and update plan_order
function reorderTasks(draggedTaskKey, targetTaskKey, insertPosition = 'after') {
    const draggedTask = currentTasks.find(t => t.key === draggedTaskKey);
    const targetTask = currentTasks.find(t => t.key === targetTaskKey);
    
    if (!draggedTask || !targetTask) return;
    
    // Optimize: Pre-separate tasks to avoid multiple filters
    const plannedTasks = [];
    const unplannedTasks = [];
    currentTasks.forEach(task => {
        if (task.in_plan) {
            plannedTasks.push(task);
        } else {
            unplannedTasks.push(task);
        }
    });
    
    // Sort planned tasks by plan_order
    plannedTasks.sort((a, b) => (a.plan_order || 0) - (b.plan_order || 0));
    
    // Combine for finding indices
    const allTasks = [...plannedTasks, ...unplannedTasks];
    
    // Find indices in the combined array
    const draggedIndex = allTasks.findIndex(t => t.key === draggedTaskKey);
    const targetIndex = allTasks.findIndex(t => t.key === targetTaskKey);
    
    if (draggedIndex === -1 || targetIndex === -1) return;
    
    // If dragging an unplanned task, add it to plan
    if (!draggedTask.in_plan) {
        draggedTask.in_plan = true;
        draggedTask.plan_locked = false;
        markTaskAsChanged(draggedTaskKey);
    }
    
    // Remove dragged task from array
    allTasks.splice(draggedIndex, 1);
    
    // Calculate new index based on insert position
    let newIndex;
    if (insertPosition === 'before') {
        newIndex = draggedIndex < targetIndex ? targetIndex - 1 : targetIndex;
    } else {
        newIndex = draggedIndex < targetIndex ? targetIndex : targetIndex + 1;
    }
    
    // Ensure newIndex is within bounds
    newIndex = Math.max(0, Math.min(newIndex, allTasks.length));
    
    // Insert at new position
    allTasks.splice(newIndex, 0, draggedTask);
    
    // Update plan_order for all planned tasks in a single pass
    const changedKeys = new Set();
    allTasks.forEach((task, index) => {
        if (task.in_plan) {
            const oldOrder = task.plan_order;
            task.plan_order = index + 1;
            
            // Only mark as changed if order actually changed
            if (oldOrder !== task.plan_order) {
                changedKeys.add(task.key);
            }
        }
    });
    
    // Mark changed tasks in batch
    changedKeys.forEach(key => markTaskAsChanged(key));
    
    // Re-separate for rendering (more efficient than filtering)
    const updatedPlannedTasks = allTasks.filter(t => t.in_plan);
    const updatedUnplannedTasks = allTasks.filter(t => !t.in_plan);
    
    // Re-render the table and Gantt chart with all tasks
    renderTasksTable(updatedPlannedTasks, updatedUnplannedTasks);
    updateGanttChart(updatedPlannedTasks);
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
    const updatedUnplannedTasks = currentTasks.filter(t => !t.in_plan);
    renderTasksTable(updatedPlannedTasks, updatedUnplannedTasks);
    updateGanttChart(updatedPlannedTasks);
    
    showNotification('Operasyon plana eklendi', 'success', 2000);
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
    const updatedUnplannedTasks = currentTasks.filter(t => !t.in_plan);
    renderTasksTable(updatedPlannedTasks, updatedUnplannedTasks);
    updateGanttChart(updatedPlannedTasks);
    
    showNotification('Operasyon plandan çıkarıldı', 'info', 2000);
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
                    <strong>Makine Takvimi Aktif (Turkey Time):</strong> Operasyonlar sadece çalışma saatleri içinde planlanacaktır.
                </div>
            `;
        } else {
            calendarInfo.innerHTML = `
                <div class="alert alert-warning">
                    <i class="fas fa-calendar-times me-2"></i>
                    <strong>Makine Takvimi Bulunamadı:</strong> Operasyonlar 7/24 planlanacaktır (Turkey Time).
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

    // Include all tasks (both planned and unplanned) for scheduling
    // First, automatically add all unplanned tasks to plan
    const unplannedTasks = currentTasks.filter(task => !task.in_plan);
    if (unplannedTasks.length > 0) {
        const plannedTasks = currentTasks.filter(task => task.in_plan);
        const maxOrder = Math.max(...plannedTasks.map(t => t.plan_order || 0), 0);
        
        unplannedTasks.forEach((task, index) => {
            task.in_plan = true;
            task.plan_order = maxOrder + index + 1;
            task.plan_locked = false;
            task.planned_start_ms = null;
            task.planned_end_ms = null;
            markTaskAsChanged(task.key);
        });
    }
    
    // Now get all tasks (all should be in plan now)
    const tasksToSchedule = currentTasks.filter(task => task.in_plan);
    
    if (tasksToSchedule.length === 0) {
        showNotification('Planlanacak operasyon bulunmuyor', 'warning');
        return;
    }

    // Sort operations based on criteria - STRICTLY follow the order
    let sortedTasks;
    // Sort by plan_order - this is the default "order" criteria
    sortedTasks = tasksToSchedule.sort((a, b) => (a.plan_order || 0) - (b.plan_order || 0));
    // Keep existing plan_order values - don't overwrite them

    // Start from the chosen start date and find the first working time
    let currentTime = new Date(startDate);
    
    // If we have a calendar, find the next working time from the start date
    if (machineCalendar) {
        currentTime = getNextWorkingTime(currentTime, machineCalendar);
    }
    
    
    // Schedule tasks SEQUENTIALLY - each task starts where the previous one ends
    sortedTasks.forEach((task, index) => {
        // Calculate remaining hours: estimated_hours - total_hours_spent
        const estimatedHours = task.estimated_hours || 0;
        const totalHoursSpent = task.total_hours_spent || 0;
        const remainingHours = Math.max(0, estimatedHours - totalHoursSpent) || 2; // Use at least 2 hours if remaining is 0 or negative
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
    // All tasks should be in plan now after autoschedule
    const plannedTasks = currentTasks.filter(t => t.in_plan);
    const remainingUnplannedTasks = currentTasks.filter(t => !t.in_plan);
    renderTasksTable(plannedTasks, remainingUnplannedTasks);
    updateGanttChart(plannedTasks);
    
    showNotification('Operasyonlar otomatik olarak planlandı', 'success');
}

// Save plan
async function savePlan() {
    try {
        // Automatically add all unplanned tasks to the plan before saving
        const unplannedTasks = currentTasks.filter(t => !t.in_plan);
        
        if (unplannedTasks.length > 0) {
            // Find next available order
            const plannedTasks = currentTasks.filter(t => t.in_plan);
            const maxOrder = Math.max(...plannedTasks.map(t => t.plan_order || 0), 0);
            
            // Add all unplanned tasks to plan
            unplannedTasks.forEach((task, index) => {
                task.in_plan = true;
                task.plan_order = maxOrder + index + 1;
                task.plan_locked = false;
                // Don't set any dates initially - they should be empty
                task.planned_start_ms = null;
                task.planned_end_ms = null;
                markTaskAsChanged(task.key);
            });
            
            showNotification(`${unplannedTasks.length} planlanmamış operasyon plana eklendi`, 'info', 3000);
        }
        
        // Get all changed tasks (including newly added unplanned tasks)
        const changedTasks = getChangedTasks();
        
        if (changedTasks.length === 0) {
            showNotification('Kaydedilecek değişiklik bulunmuyor', 'info');
            return;
        }

        // Build the payload according to the required format (array, not wrapped in items)
        const updateData = changedTasks.map(task => {
            const payload = {
                key: task.key
            };

            // For new operations or operations being added to plan
            if (task.in_plan) {
                payload.in_plan = true;
                
                // Include machine_fk if available
                if (task.machine_fk) {
                    payload.machine_fk = task.machine_fk;
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
            } else {
                // For operations being removed from plan
                payload.in_plan = false;
            }

            return payload;
        });
        
        const result = await bulkSaveOperationsPlanning(updateData);
        
        // Reload tasks to get updated state
        if (currentMachineId) {
            await loadMachineTasks(currentMachineId);
        }
        
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
    // Error will be shown via table component
    if (tasksTable) {
        tasksTable.setLoading(false);
        tasksTable.updateData([]);
    }
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
    // Autoschedule button
    document.getElementById('autoschedule-btn').addEventListener('click', autoscheduleTasks);
    
    // Save plan button
    document.getElementById('save-plan-btn').addEventListener('click', savePlan);
    
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

// Setup inline editing using event delegation (more efficient for large datasets)
function setupInlineEditingDelegation() {
    // Use event delegation on the table container instead of individual listeners
    const tableContainer = tasksTable?.container;
    if (!tableContainer) return;
    
    // Remove any existing listener to avoid duplicates
    tableContainer.removeEventListener('click', handleEditableCellClick);
    
    // Add single event listener using delegation
    tableContainer.addEventListener('click', handleEditableCellClick);
}

// Event handler for editable cell clicks (used with event delegation)
function handleEditableCellClick(e) {
    // Find the closest editable cell
    const cell = e.target.closest('.editable-cell');
    if (!cell) return;
    
    // Don't trigger if clicking on action buttons
    if (e.target.closest('.action-buttons')) {
        return;
    }
    
    // Skip if already editing globally
    if (isInlineEditing) {
        return;
    }
    
    const taskKey = cell.dataset.taskKey;
    const field = cell.dataset.field;
    if (!taskKey || !field) return;
    
    const currentValue = cell.textContent.trim();
    
    // Skip if already editing this cell
    if (cell.querySelector('input')) {
        return;
    }
    
    startInlineEdit(cell, taskKey, field, currentValue);
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
        case 'estimated_hours':
            input = document.createElement('input');
            input.type = 'number';
            input.className = 'form-control form-control-sm';
            input.step = '0.1';
            input.min = '0';
            // Extract numeric value from "Xh" format or use empty string
            let originalNumericValue = null;
            if (currentValue && currentValue !== '-') {
                const numericValue = parseFloat(currentValue.replace('h', '').trim());
                if (!isNaN(numericValue)) {
                    input.value = numericValue;
                    originalNumericValue = numericValue;
                } else {
                    input.value = '';
                }
            } else {
                input.value = '';
            }
            // Store original numeric value for comparison
            input.dataset.originalValue = originalNumericValue !== null ? originalNumericValue.toString() : '';
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
            showNotification('Operasyon bulunamadı', 'error');
            return;
        }
        
        // Update the task data based on field
        let hasChanges = false;
        let updateValue = null;
        
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
            case 'estimated_hours':
                // Get the original value that was in the input when editing started
                const inputElement = cell.querySelector('input');
                const originalInputValue = inputElement ? inputElement.dataset.originalValue : null;
                const originalNumericValue = originalInputValue && originalInputValue !== '' ? parseFloat(originalInputValue) : null;
                
                // Parse the new value from input
                const numericValue = newValue && newValue.trim() !== '' ? parseFloat(newValue) : null;
                
                // Normalize values for comparison (handle null, undefined, NaN)
                const normalizedNew = (numericValue !== null && !isNaN(numericValue)) ? numericValue : null;
                const normalizedOriginal = (originalNumericValue !== null && !isNaN(originalNumericValue)) ? originalNumericValue : null;
                
                // Check if value actually changed (with floating point tolerance)
                const valuesEqual = normalizedNew === normalizedOriginal || 
                    (normalizedNew !== null && normalizedOriginal !== null && 
                     Math.abs(normalizedNew - normalizedOriginal) < 0.0001);
                
                if (valuesEqual) {
                    // No change, restore original content and return without sending request
                    if (cell && cell.parentNode) {
                        cell.innerHTML = originalContent;
                    }
                    return;
                }
                
                if (numericValue !== null && !isNaN(numericValue) && numericValue >= 0) {
                    task.estimated_hours = numericValue;
                    updateValue = numericValue;
                    hasChanges = true;
                } else if (newValue === '' || newValue === null || (newValue && newValue.trim() === '')) {
                    // Only set to null if original value was not already null
                    if (normalizedOriginal !== null) {
                        task.estimated_hours = null;
                        updateValue = null;
                        hasChanges = true;
                    } else {
                        // Already null, no change
                        if (cell && cell.parentNode) {
                            cell.innerHTML = originalContent;
                        }
                        return;
                    }
                } else {
                    // Invalid value, restore original content
                    if (cell && cell.parentNode) {
                        cell.innerHTML = originalContent;
                    }
                    showNotification('Geçerli bir sayı girin', 'error');
                    return;
                }
                break;
        }
        
        if (hasChanges) {
            // For estimated_hours, send immediate update request
            if (field === 'estimated_hours') {
                try {
                    await updateOperation(taskKey, { estimated_hours: updateValue });
                    // Update originalTasks to reflect the change (so it doesn't trigger bulk save)
                    const originalTask = originalTasks.find(ot => ot.key === taskKey);
                    if (originalTask) {
                        originalTask.estimated_hours = updateValue;
                    }
                    
                    // Update display efficiently - only re-render if needed
                    // For estimated_hours updates, we can update the cell directly without full re-render
                    const displayValue = updateValue ? `${updateValue}h` : '-';
                    if (cell && cell.parentNode) {
                        cell.innerHTML = displayValue;
                    }
                    
                    showNotification('Tahmini saat güncellendi', 'success', 2000);
                } catch (error) {
                    showNotification('Güncelleme sırasında hata oluştu', 'error');
                    // Restore original content on error
                    if (cell && cell.parentNode) {
                        cell.innerHTML = originalContent;
                    }
                    // Revert the change in local state
                    task.estimated_hours = originalTasks.find(ot => ot.key === taskKey)?.estimated_hours || null;
                }
            } else {
                // For other fields, use the existing bulk save mechanism
                markTaskAsChanged(taskKey);
                
                // For date fields, update the cell directly without full table re-render
                if (field === 'planned_start_ms' || field === 'planned_end_ms') {
                    const displayValue = newValue ? formatDateTime(new Date(newValue).toISOString()) : '-';
                    if (cell && cell.parentNode) {
                        cell.innerHTML = `<div class="created-date">${displayValue}</div>`;
                    }
                    // Update Gantt chart only (more efficient than full table re-render)
                    const updatedPlannedTasks = currentTasks.filter(t => t.in_plan);
                    updateGanttChart(updatedPlannedTasks);
                } else {
                    // For other fields, update display
                    const updatedPlannedTasks = currentTasks.filter(t => t.in_plan);
                    const updatedUnplannedTasks = currentTasks.filter(t => !t.in_plan);
                    renderTasksTable(updatedPlannedTasks, updatedUnplannedTasks);
                    updateGanttChart(updatedPlannedTasks);
                }
                
                showNotification('Operasyon güncellendi', 'success', 2000);
            }
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
window.removeFromPlan = removeFromPlan;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initCapacityPlanning();
});

