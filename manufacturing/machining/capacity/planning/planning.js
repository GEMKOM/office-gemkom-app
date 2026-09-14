// Capacity Planning Module JavaScript

// Import required modules
import { initNavbar } from '../../../../components/navbar.js';
import { HeaderComponent } from '../../../../components/header/header.js';
import { FiltersComponent } from '../../../../components/filters/filters.js';
import { TableComponent } from '../../../../components/table/table.js';
import { GanttChart } from '../../../../components/gantt/gantt.js';
import { fetchMachinesDropdown, getMachineCalendar } from '../../../../apis/machines.js';
import { getOperations, bulkSaveOperationsPlanning, updateOperation, lockOperation, unlockOperation, rescheduleMachiningPlan } from '../../../../apis/machining/operations.js';
import { formatDateTime } from '../../../../apis/formatters.js';
import { showNotification } from '../../../../components/notification/notification.js';

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
let machineCalendar = null; // Only consumed by the Gantt for working-hour shading
let isInlineEditing = false; // Flag to prevent multiple simultaneous inline edits
let inlineEditingSetup = false; // Track if event delegation is already set up
let isRescheduling = false;
let isTogglingLock = false;

// Change tracking for efficient submissions
let originalTasks = []; // Store original state for comparison
let changedTasks = new Set(); // Track which tasks have been modified
let movedTasks = new Set(); // Rows the user dragged by hand; saved with plan_locked: true

// Planned dates (planned_start_ms / planned_end_ms) are computed by the server from the
// queue order and the machine calendar. This page only edits order, locks and estimates,
// and refetches after every save so the re-sorted queue is what the planner sees.

// Utility functions for date formatting
function formatDueDate(dueDate) {
    // "2026-09-30" -> "30.09.2026" (string split; no timezone drift through Date)
    if (!dueDate || typeof dueDate !== 'string') return '';
    const [year, month, day] = dueDate.split('-');
    if (!year || !month || !day) return dueDate;
    return `${day}.${month}.${year}`;
}

function formatPlannedMs(value) {
    if (!value) return '<span class="text-muted">-</span>';
    return `<div class="created-date">${formatDateTime(new Date(value).toISOString())}</div>`;
}

const DUE_SOURCE_LABELS = {
    part: { label: 'parça', icon: 'fa-cube', title: 'Parçanın kendi termini' },
    job_order: { label: 'iş emri', icon: 'fa-file-alt', title: 'Bağlı iş emrinin hedef tarihi' }
};

// Change tracking utility functions
function markTaskAsChanged(taskKey) {
    changedTasks.add(taskKey);
    hasUnsavedChanges = true;
}


function resetChangeTracking() {
    changedTasks.clear();
    movedTasks.clear();
    hasUnsavedChanges = false;
    originalTasks = JSON.parse(JSON.stringify(currentTasks)); // Deep copy
}

function getChangedTasks() {
    // Only order, lock and plan membership are client-owned; planned dates are
    // server-computed and never compared or sent back.
    return currentTasks.filter(task => {
        const original = originalTasks.find(ot => ot.key === task.key);
        if (!original) {
            return Boolean(task.in_plan);
        }
        return task.in_plan !== original.in_plan ||
            task.plan_order !== original.plan_order ||
            task.plan_locked !== original.plan_locked;
    });
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
                    field: 'part_job_no',
                    label: 'İş No',
                    sortable: true,
                    formatter: (value) => value || '-'
                },
                {
                    field: 'due_date',
                    label: 'Termin',
                    sortable: true,
                    formatter: (value, row) => {
                        const formatted = formatDueDate(value);
                        if (!formatted) return '<span class="text-muted">-</span>';
                        const source = DUE_SOURCE_LABELS[row.due_source];
                        const sourceHtml = source
                            ? ` <small class="text-muted plan-due-source" title="${source.title}"><i class="fas ${source.icon} me-1"></i>${source.label}</small>`
                            : '';
                        return `<span class="created-date">${formatted}</span>${sourceHtml}`;
                    }
                },
                {
                    field: 'slack_hours',
                    label: 'Bolluk',
                    sortable: true,
                    formatter: (value) => {
                        if (value === null || value === undefined || value === '') return '<span class="text-muted">-</span>';
                        const hours = Number(value);
                        if (Number.isNaN(hours)) return '<span class="text-muted">-</span>';
                        const cls = hours < 0 ? 'text-danger fw-semibold' : '';
                        return `<span class="${cls}" title="Termin ile (şimdi + parçanın kalan süresi) arasındaki fark">${hours.toFixed(1)}h</span>`;
                    }
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
                    formatter: (value) => formatPlannedMs(value)
                },
                {
                    field: 'planned_end_ms',
                    label: 'Planlanan Bitiş',
                    sortable: true,
                    formatter: (value) => formatPlannedMs(value)
                },
                {
                    field: 'projected_late',
                    label: 'Geç',
                    sortable: true,
                    width: '70px',
                    formatter: (value) => value
                        ? '<span class="status-badge status-red plan-chip" title="Parçanın tahmini bitişi termini aşıyor">Geç</span>'
                        : ''
                },
                {
                    field: 'is_running',
                    label: 'Durum',
                    sortable: false,
                    formatter: (value, row) => {
                        const parts = [];
                        if (value) {
                            parts.push('<span class="status-badge status-green plan-chip" title="Bu operasyonda aktif zamanlayıcı var">Çalışıyor</span>');
                        }
                        const flags = Array.isArray(row.plan_flags) ? row.plan_flags : [];
                        if (flags.includes('estimate_missing')) {
                            parts.push('<small class="text-muted plan-flag" title="Tahmini saat girilmemiş; varsayılan süre ile planlandı">tahmin yok</small>');
                        }
                        if (flags.includes('due_missing')) {
                            parts.push('<small class="text-muted plan-flag" title="Termin yok; sıranın sonuna planlandı">termin yok</small>');
                        }
                        if (parts.length === 0) return '<span class="text-muted">-</span>';
                        return `<div class="d-flex flex-column align-items-start gap-1">${parts.join('')}</div>`;
                    }
                },
                {
                    field: 'plan_locked',
                    label: 'Kilit',
                    sortable: true,
                    width: '60px',
                    formatter: (value, row) => {
                        const locked = Boolean(value);
                        const title = locked
                            ? 'Kilidi aç (sıra termine göre yeniden hesaplanır)'
                            : 'Sırayı kilitle (yeniden planlamada yerinde kalır)';
                        return `
                            <button type="button" class="btn btn-sm ${locked ? 'btn-secondary' : 'btn-outline-secondary'} plan-lock-btn"
                                    data-task-key="${row.key}" data-locked="${locked ? '1' : '0'}" title="${title}">
                                <i class="fas ${locked ? 'fa-lock' : 'fa-lock-open'}"></i>
                            </button>
                        `;
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
        document.getElementById('save-plan-btn').disabled = true;

        // Add a small delay to ensure skeleton is visible
        await new Promise(resolve => setTimeout(resolve, 100));

        // Load machine calendar and tasks
        await Promise.all([
            loadMachineCalendar(machineId),
            loadMachineTasks(machineId)
        ]);

        // Enable buttons
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
        document.getElementById('save-plan-btn').disabled = true;

        showNotification('Makine yüklenirken hata oluştu', 'error');

    } finally {
        isLoadingMachine = false;
    }
}

// Load machine calendar (used by the Gantt for working-hour shading only)
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
            completion_date__isnull: 'true',
            page_size: 1000
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
        // Mark unplanned task rows with a muted background via CSS class (see index.html)
        const tableBody = tasksTable.container.querySelector('tbody');
        if (tableBody) {
            const tableRows = tableBody.querySelectorAll('tr');
            const plannedCount = sortedPlannedTasks.length;

            tableRows.forEach((row, index) => {
                const isUnplanned = row.getAttribute('data-unplanned') === 'true' || index >= plannedCount;
                row.classList.toggle('unplanned-task-row', isUnplanned);
            });
        }
    });
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
    }

    // A hand-placed row is shown locked immediately and saved with plan_locked: true,
    // so the server keeps it where the planner put it when it re-sorts by due date.
    draggedTask.plan_locked = true;
    movedTasks.add(draggedTaskKey);
    markTaskAsChanged(draggedTaskKey);

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

// Save plan
async function savePlan() {
    try {
        const changed = getChangedTasks();

        if (changed.length === 0) {
            showNotification('Kaydedilecek değişiklik bulunmuyor', 'info');
            return;
        }

        // Bare array payload. Planned dates are never sent: the server recomputes them
        // from the queue right after this save. Rows the user dragged go out with
        // plan_locked: true so they keep their position; everything else is re-sorted
        // by due date on the server.
        const updateData = changed.map(task => {
            const payload = {
                key: task.key,
                in_plan: true
            };
            if (task.plan_order) {
                payload.plan_order = task.plan_order;
            }
            if (movedTasks.has(task.key)) {
                payload.plan_locked = true;
            }
            return payload;
        });

        const saveBtn = document.getElementById('save-plan-btn');
        if (saveBtn) saveBtn.disabled = true;
        try {
            await bulkSaveOperationsPlanning(updateData);
        } finally {
            if (saveBtn) saveBtn.disabled = false;
        }

        // Reload: the server has re-sorted and re-dated the queue (this also resets change tracking)
        if (currentMachineId) {
            await loadMachineTasks(currentMachineId);
        } else {
            resetChangeTracking();
        }
        showNotification('Plan kaydedildi; sıra ve tarihler yeniden hesaplandı', 'success');

    } catch (error) {
        showNotification(`Plan kaydedilirken hata oluştu: ${error.message}`, 'error');
    }
}

function describeRescheduleFlag(value, label) {
    // The reschedule endpoint's flags may come back as counts, lists or booleans
    if (Array.isArray(value)) return value.length ? `${value.length} ${label}` : '';
    if (typeof value === 'number') return value > 0 ? `${value} ${label}` : '';
    return value ? label : '';
}

// Manual "Yeniden Planla": full server-side re-plan across all machining machines.
// Every relevant change already triggers one silently; this is the planner's safety net.
async function reschedulePlan() {
    if (isRescheduling) return;
    if (hasUnsavedChanges && !confirm('Kaydedilmemiş sıra değişiklikleri var. Yeniden planlama bunları geri alır. Devam edilsin mi?')) {
        return;
    }

    const btn = document.getElementById('reschedule-btn');
    isRescheduling = true;
    if (btn) btn.disabled = true;

    try {
        const result = await rescheduleMachiningPlan();
        const scheduled = Number(result?.scheduled) || 0;
        const lateParts = Array.isArray(result?.late_parts) ? result.late_parts : [];
        const flags = result?.flags || {};
        const extras = [
            describeRescheduleFlag(flags.estimate_missing, 'tahmin eksik'),
            describeRescheduleFlag(flags.due_missing, 'termin yok')
        ].filter(Boolean);

        const message = `Yeniden planlandı: ${scheduled} operasyon, ${lateParts.length} geç parça${extras.length ? ` (${extras.join(', ')})` : ''}`;
        showNotification(message, lateParts.length > 0 ? 'info' : 'success', 5000);

        if (currentMachineId) {
            await loadMachineTasks(currentMachineId);
        }
    } catch (error) {
        showNotification(`Yeniden planlama sırasında hata oluştu: ${error.message}`, 'error');
    } finally {
        isRescheduling = false;
        if (btn) btn.disabled = false;
    }
}

// Lock / unlock a row's queue position through the thin endpoints, then reload
// (the server re-sorts the unlocked rows by due date right away).
async function toggleLock(taskKey, currentlyLocked) {
    if (isTogglingLock) return;
    if (hasUnsavedChanges) {
        showNotification('Kilidi değiştirmeden önce planı kaydedin', 'info');
        return;
    }
    const task = currentTasks.find(t => t.key === taskKey);
    if (!task) return;

    isTogglingLock = true;
    try {
        if (currentlyLocked) {
            await unlockOperation(taskKey);
        } else {
            await lockOperation(taskKey);
        }
        showNotification(currentlyLocked ? 'Kilit açıldı; sıra termine göre yeniden hesaplandı' : 'Sıra kilitlendi', 'success', 2000);
        if (currentMachineId) {
            await loadMachineTasks(currentMachineId);
        }
    } catch (error) {
        showNotification(`Kilit değiştirilirken hata oluştu: ${error.message}`, 'error');
    } finally {
        isTogglingLock = false;
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


    // Disable buttons (the reschedule button is global and stays enabled)
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
    // Reschedule button (server-side, all machines)
    document.getElementById('reschedule-btn').addEventListener('click', reschedulePlan);

    // Save plan button
    document.getElementById('save-plan-btn').addEventListener('click', savePlan);
}


// Setup inline editing using event delegation (more efficient for large datasets)
function setupInlineEditingDelegation() {
    // Use event delegation on the table container instead of individual listeners
    const tableContainer = tasksTable?.container;
    if (!tableContainer) return;

    // Remove any existing listeners to avoid duplicates
    tableContainer.removeEventListener('click', handleEditableCellClick);
    tableContainer.removeEventListener('click', handleLockButtonClick);

    // Add single event listeners using delegation
    tableContainer.addEventListener('click', handleEditableCellClick);
    tableContainer.addEventListener('click', handleLockButtonClick);
}

// Event handler for lock toggle buttons (used with event delegation)
function handleLockButtonClick(e) {
    const btn = e.target.closest('.plan-lock-btn');
    if (!btn) return;

    e.preventDefault();
    e.stopPropagation();

    const taskKey = btn.dataset.taskKey;
    if (!taskKey) return;

    toggleLock(taskKey, btn.dataset.locked === '1');
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

    // Only the estimate is editable inline; planned dates are computed server-side
    if (field !== 'estimated_hours') {
        return;
    }

    // Set inline editing flag
    isInlineEditing = true;

    // Clear the flag after 30 seconds as a safety measure
    setTimeout(() => {
        isInlineEditing = false;
    }, 30000);

    const input = document.createElement('input');
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

    // Store original content
    const originalContent = cell.innerHTML;

    // Replace cell content with input
    cell.innerHTML = '';
    cell.appendChild(input);

    // Focus on input
    input.focus();
    input.select();

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

        if (field !== 'estimated_hours') {
            if (cell && cell.parentNode) {
                cell.innerHTML = originalContent;
            }
            return;
        }

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

        let updateValue = null;
        if (numericValue !== null && !isNaN(numericValue) && numericValue >= 0) {
            task.estimated_hours = numericValue;
            updateValue = numericValue;
        } else if (newValue === '' || newValue === null || (newValue && newValue.trim() === '')) {
            // Only set to null if original value was not already null
            if (normalizedOriginal !== null) {
                task.estimated_hours = null;
                updateValue = null;
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

        // Send immediate update request
        try {
            await updateOperation(taskKey, { estimated_hours: updateValue });
            // Update originalTasks to reflect the change (so it doesn't trigger bulk save)
            const originalTask = originalTasks.find(ot => ot.key === taskKey);
            if (originalTask) {
                originalTask.estimated_hours = updateValue;
            }

            const displayValue = updateValue ? `${updateValue}h` : '-';
            if (cell && cell.parentNode) {
                cell.innerHTML = displayValue;
            }

            showNotification('Tahmini saat güncellendi', 'success', 2000);

            // The estimate drives the plan and the server has already rescheduled, so
            // refetch the queue - unless that would discard an unsaved manual reorder.
            if (currentMachineId && !hasUnsavedChanges) {
                await loadMachineTasks(currentMachineId);
            }
        } catch (error) {
            showNotification('Güncelleme sırasında hata oluştu', 'error');
            // Restore original content on error
            if (cell && cell.parentNode) {
                cell.innerHTML = originalContent;
            }
            // Revert the change in local state
            task.estimated_hours = originalTasks.find(ot => ot.key === taskKey)?.estimated_hours || null;
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

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initCapacityPlanning();
});
