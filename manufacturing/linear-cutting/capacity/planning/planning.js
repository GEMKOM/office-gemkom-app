// Linear Cutting Capacity Planning (mirrors CNC capacity planner)
import { initNavbar } from '../../../../components/navbar.js';
import { HeaderComponent } from '../../../../components/header/header.js';
import { FiltersComponent } from '../../../../components/filters/filters.js';
import { TableComponent } from '../../../../components/table/table.js';
import { GanttChart } from '../../../../components/gantt/gantt.js';
import { fetchMachines, getMachineCalendar } from '../../../../apis/machines.js';
import { getCapacityPlanning, updateCapacityPlanning } from '../../../../apis/machining/capacityPlanning.js';
import { formatDateTime } from '../../../../apis/formatters.js';
import { DisplayModal } from '../../../../components/display-modal/display-modal.js';
import { getLinearCuttingTask, patchLinearCuttingTask } from '../../../../apis/linear_cutting/tasks.js';
import { showNotification } from '../../../../components/notification/notification.js';

// Global state (kept close to CNC planning.js)
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
let isInlineEditing = false;
let unplannedTasksTable = null;
let planningFilters = null;

// Change tracking
let originalTasks = [];
let changedTasks = new Set();

const MODULE = 'linear_cutting';

function formatDateForInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function markTaskAsChanged(taskKey) {
    changedTasks.add(taskKey);
    hasUnsavedChanges = true;
}

function resetChangeTracking() {
    changedTasks.clear();
    hasUnsavedChanges = false;
    originalTasks = JSON.parse(JSON.stringify(currentTasks));
}

function getChangedTasks() {
    const changed = [];
    const processedKeys = new Set();

    currentTasks.forEach(task => {
        const original = originalTasks.find(ot => ot.key === task.key);
        if (!original) {
            if (task.in_plan) {
                changed.push(task);
                processedKeys.add(task.key);
            }
        } else {
            const hasChanges =
                task.in_plan !== original.in_plan ||
                task.plan_order !== original.plan_order ||
                task.planned_start_ms !== original.planned_start_ms ||
                task.planned_end_ms !== original.planned_end_ms ||
                task.plan_locked !== original.plan_locked;

            if (hasChanges) {
                if (original.in_plan && !task.in_plan) {
                    changed.push({ key: task.key, in_plan: false });
                } else {
                    changed.push(task);
                }
                processedKeys.add(task.key);
            }
        }
    });

    originalTasks.forEach(original => {
        if (!processedKeys.has(original.key)) {
            const current = currentTasks.find(ct => ct.key === original.key);
            if (original.in_plan && (!current || !current.in_plan)) {
                changed.push({ key: original.key, in_plan: false });
            }
        }
    });

    return changed;
}

window.showTaskDetails = async function (taskKey) {
    try {
        const task = await getLinearCuttingTask(taskKey);
        if (!task) {
            showNotification('Görev bulunamadı', 'error');
            return;
        }

        const displayModal = new DisplayModal('display-modal-container', {
            title: `Kesim Görevi - ${task.key}`,
            icon: 'fas fa-ruler-horizontal text-primary',
            size: 'lg',
            showEditButton: false
        });

        displayModal.addSection({
            title: 'Görev Bilgileri',
            icon: 'fas fa-info-circle',
            iconColor: 'text-primary',
            fields: [
                { id: 't-key', label: 'Görev No', value: task.key, type: 'text', colSize: 4, copyable: true },
                { id: 't-name', label: 'Ad', value: task.name, type: 'text', colSize: 8 },
                { id: 't-session', label: 'Kesim Planı', value: `${task.session} — ${task.session_title || ''}`.trim(), type: 'text', colSize: 6 },
                { id: 't-bar', label: 'Bar', value: task.bar_index, type: 'number', colSize: 2 },
                { id: 't-item', label: 'Malzeme', value: task.item_name || task.material || '-', type: 'text', colSize: 4 },
                { id: 't-stock', label: 'Stok (mm)', value: task.stock_length_mm, type: 'number', colSize: 3 },
                { id: 't-waste', label: 'Fire (mm)', value: task.waste_mm, type: 'number', colSize: 3 }
            ]
        });

        if (task.description) {
            displayModal.addSection({
                title: 'Açıklama',
                icon: 'fas fa-align-left',
                iconColor: 'text-muted',
                fields: [{ id: 't-desc', label: 'Açıklama', value: task.description, type: 'textarea', colSize: 12 }]
            });
        }

        if (Array.isArray(task.layout_json) && task.layout_json.length) {
            const cutsHtml = `
                <div class="mt-3">
                    <div id="lc-task-layout-table"></div>
                </div>
            `;
            const lastSection = displayModal.container.querySelector('[data-section-id*="section"]:last-of-type');
            if (lastSection) {
                const body = lastSection.querySelector('.row.g-2');
                if (body) body.insertAdjacentHTML('beforeend', cutsHtml);
            }
            // Render after show
        }

        displayModal.render().show();

        if (Array.isArray(task.layout_json) && task.layout_json.length) {
            new TableComponent('lc-task-layout-table', {
                title: 'Kesim Listesi',
                icon: 'fas fa-stream',
                iconColor: 'text-success',
                columns: [
                    { field: 'job_no', label: 'İş No', sortable: true, width: '18%', formatter: v => v || '-' },
                    { field: 'label', label: 'Parça', sortable: true, width: '32%', formatter: v => v || '-' },
                    { field: 'nominal_mm', label: 'Nominal (mm)', sortable: true, width: '16%', formatter: v => v ?? '-' },
                    { field: 'effective_mm', label: 'Effective (mm)', sortable: true, width: '16%', formatter: v => v ?? '-' },
                    { field: 'offset_mm', label: 'Offset (mm)', sortable: true, width: '16%', formatter: v => v ?? '-' }
                ],
                data: task.layout_json,
                sortable: true,
                pagination: false,
                exportable: false,
                refreshable: false,
                striped: true,
                small: true,
                emptyMessage: 'Kesim bulunamadı',
                emptyIcon: 'fas fa-stream'
            });
        }
    } catch (e) {
        console.error(e);
        showNotification('Görev detayı yüklenemedi', 'error');
    }
};

document.addEventListener('DOMContentLoaded', async () => {
    await initNavbar();

    new HeaderComponent({
        title: 'Lineer Kesim Kapasite Planlayıcı',
        subtitle: 'Lineer kesim bar görevlerini planlayın',
        icon: 'calendar-alt',
        showBackButton: 'block',
        showCreateButton: 'none',
        showExportButton: 'none',
        showRefreshButton: 'none',
        onBackClick: () => (window.location.href = '/manufacturing/linear-cutting/')
    });

    initializeFiltersComponent();
    await loadMachines();
    initializeMachinesTable();
    initializeTasksTable();
    initializeGantt();
    setupEventListeners();
});

function initializeFiltersComponent() {
    planningFilters = new FiltersComponent('filters-placeholder', {
        title: 'Filtreler',
        onApply: () => {
            if (currentMachineId) loadCapacity(currentMachineId);
        },
        onClear: () => {
            if (currentMachineId) loadCapacity(currentMachineId);
        }
    });

    planningFilters.addTextFilter({
        id: 'session-filter',
        label: 'Kesim Planı',
        placeholder: 'LC-0004',
        defaultValue: ''
    });

    planningFilters.addSelectFilter({
        id: 'completed-filter',
        label: 'Durum',
        options: [
            { value: '', label: 'Tümü' },
            { value: 'false', label: 'Tamamlanmamış' },
            { value: 'true', label: 'Tamamlanan' }
        ],
        defaultValue: ''
    });
}

async function loadMachines() {
    try {
        const machinesResponse = await fetchMachines(1, 100, { used_in: 'linear_cutting' });
        machines = machinesResponse.results || machinesResponse || [];
    } catch (e) {
        console.error(e);
        machines = [];
        showNotification('Makineler yüklenemedi', 'error');
    }
}

function initializeMachinesTable() {
    machinesTable = new TableComponent('machines-table-container', {
        title: 'Makineler',
        icon: 'fas fa-cogs',
        iconColor: 'text-primary',
        columns: [{ field: 'name', label: 'Makine', sortable: true, formatter: v => v || '-' }],
        data: machines,
        sortable: true,
        pagination: false,
        exportable: false,
        refreshable: false,
        striped: true,
        small: true,
        emptyMessage: 'Makine bulunamadı',
        emptyIcon: 'fas fa-cogs',
        onRowClick: (row) => {
            if (row?.id) selectMachine(row.id, row.name);
        }
    });
}

function initializeTasksTable() {
    tasksTable = new TableComponent('tasks-table-container', {
        title: 'Planlanmış Görevler',
        icon: 'fas fa-tasks',
        iconColor: 'text-success',
        columns: [
            { field: 'plan_order', label: '#', sortable: true, width: '6%', formatter: v => v ?? '-' },
            { field: 'key', label: 'Görev', sortable: true, width: '18%', formatter: v => `<a href="javascript:void(0)" onclick="showTaskDetails('${v}')">${v}</a>` },
            { field: 'name', label: 'Ad', sortable: true, width: '36%', formatter: v => v || '-' },
            { field: 'item_name', label: 'Malzeme', sortable: true, width: '22%', formatter: (v, r) => v || r.material || '-' },
            { field: 'planned_start_ms', label: 'Başlangıç', sortable: true, width: '18%', formatter: v => v ? formatDateTime(new Date(v)) : '-' }
        ],
        data: [],
        sortable: true,
        pagination: false,
        exportable: false,
        refreshable: false,
        striped: true,
        small: true,
        emptyMessage: 'Görev bulunamadı',
        emptyIcon: 'fas fa-tasks'
    });

    unplannedTasksTable = new TableComponent('unplanned-tasks-table-container', {
        title: 'Planlanmamış Görevler',
        icon: 'fas fa-inbox',
        iconColor: 'text-muted',
        columns: [
            { field: 'key', label: 'Görev', sortable: true, width: '20%', formatter: v => `<a href="javascript:void(0)" onclick="showTaskDetails('${v}')">${v}</a>` },
            { field: 'name', label: 'Ad', sortable: true, width: '50%', formatter: v => v || '-' },
            { field: 'item_name', label: 'Malzeme', sortable: true, width: '30%', formatter: (v, r) => v || r.material || '-' }
        ],
        data: [],
        sortable: true,
        pagination: false,
        exportable: false,
        refreshable: false,
        striped: true,
        small: true,
        emptyMessage: 'Görev bulunamadı',
        emptyIcon: 'fas fa-inbox'
    });
}

function initializeGantt() {
    ganttChart = new GanttChart('gantt-container', {
        onTaskChange: (task) => {
            markTaskAsChanged(task.key);
            updateSaveButton();
        }
    });
}

async function selectMachine(machineId, machineName) {
    if (isLoadingMachine) return;
    isLoadingMachine = true;
    try {
        currentMachineId = machineId;
        currentMachineName = machineName;
        document.getElementById('selected-machine-name').textContent = machineName || 'Makine';

        machineCalendar = await getMachineCalendar(machineId).catch(() => null);
        await loadCapacity(machineId);
    } finally {
        isLoadingMachine = false;
    }
}

function buildFiltersPayload() {
    const values = planningFilters?.getValues ? planningFilters.getValues() : {};
    const session = values?.['session-filter'] || '';
    const completed = values?.['completed-filter'] || '';
    const filters = {};
    if (session) filters.session = session;
    if (completed !== '') filters.completed = completed;
    return filters;
}

async function loadCapacity(machineId) {
    if (isLoadingTasks) return;
    isLoadingTasks = true;
    try {
        const filters = buildFiltersPayload();
        const data = await getCapacityPlanning(machineId, MODULE, filters);
        const tasks = Array.isArray(data?.tasks) ? data.tasks : Array.isArray(data) ? data : [];

        currentTasks = tasks;
        resetChangeTracking();

        const planned = tasks.filter(t => t.in_plan);
        const unplanned = tasks.filter(t => !t.in_plan);

        tasksTable.setData(planned.sort((a, b) => (a.plan_order ?? 1e9) - (b.plan_order ?? 1e9)));
        unplannedTasksTable.setData(unplanned);

        ganttChart.setTasks(planned, machineCalendar);
        updateSaveButton();
    } catch (e) {
        console.error(e);
        showNotification('Plan verisi yüklenemedi', 'error');
    } finally {
        isLoadingTasks = false;
    }
}

function updateSaveButton() {
    const btn = document.getElementById('save-plan-btn');
    if (!btn) return;
    btn.disabled = !currentMachineId || !hasUnsavedChanges;
}

function setupEventListeners() {
    document.getElementById('toggle-unplanned')?.addEventListener('click', () => {
        const section = document.getElementById('unplanned-tasks-section');
        if (!section) return;
        const show = section.style.display === 'none';
        section.style.display = show ? '' : 'none';
    });

    document.getElementById('save-plan-btn')?.addEventListener('click', async () => {
        if (!currentMachineId) return;
        try {
            const changed = getChangedTasks();
            if (!changed.length) {
                showNotification('Kaydedilecek değişiklik yok', 'info');
                return;
            }
            const updateData = {
                items: changed.map(task => {
                    const payload = { key: task.key };
                    if (task.in_plan) {
                        payload.in_plan = true;
                        if (task.machine_fk) payload.machine_fk = task.machine_fk;
                        if (task.name) payload.name = task.name;
                        if (task.planned_start_ms) payload.planned_start_ms = task.planned_start_ms;
                        if (task.planned_end_ms) payload.planned_end_ms = task.planned_end_ms;
                        if (task.plan_order) payload.plan_order = task.plan_order;
                        if (task.plan_locked !== undefined) payload.plan_locked = task.plan_locked;
                    } else {
                        payload.in_plan = false;
                    }
                    return payload;
                })
            };
            await updateCapacityPlanning(updateData, MODULE);
            showNotification('Plan kaydedildi', 'success');
            await loadCapacity(currentMachineId);
        } catch (e) {
            console.error(e);
            showNotification('Plan kaydedilemedi', 'error');
        }
    });

    // Inline edit modal in this planner is implemented in the original CNC file; keep minimal here.
    document.getElementById('autoschedule-btn')?.addEventListener('click', () => {
        showNotification('Otomatik planlama yakında', 'info');
    });
}

