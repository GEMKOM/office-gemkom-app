/**
 * Üretim Planlama (Production Planning)
 *
 * Full-subtree department task schedule for one or more job orders:
 * every task of the selected job orders and all their descendant job orders
 * (incl. phases), grouped by job order, with planned vs. actual dates and
 * working-day lateness. Table view (Excel export, filters) + Gantt view.
 * Read-only v1.
 */
import { initNavbar } from '../../components/navbar.js';
import { initRouteProtection } from '../../apis/routeProtection.js';
import { HeaderComponent } from '../../components/header/header.js';
import { StatisticsCards } from '../../components/statistics-cards/statistics-cards.js';
import { TableComponent } from '../../components/table/table.js';
import { GanttChart } from '../../components/gantt/gantt.js';
import { ModernDropdown } from '../../components/dropdown/dropdown.js';
import { showNotification } from '../../components/notification/notification.js';
import { getJobOrderProductionPlan, getJobOrderDropdown } from '../../apis/projects/jobOrders.js';

// Module state
let plan = null;                 // merged plan for all selected job orders
let currentJobNos = [];
let planTable = null;
let ganttChart = null;
let ganttDirty = false;
let statsCards = null;
let currentView = 'table';
let jobOrderDropdown = null;
let departmentFilterDropdown = null;
let classificationFilterDropdown = null;
let activeFilters = { departments: [], classifications: [] };

// House badge component classes (components/badges/badges.css) — no yellow.
const CLASSIFICATION_BADGES = {
    completed_on_time: { label: 'Zamanında', badgeClass: 'status-green' },
    completed_late: { label: 'Geç Bitti', badgeClass: 'status-red' },
    overdue: { label: 'Gecikmede', badgeClass: 'status-red' },
    in_progress: { label: 'Devam Ediyor', badgeClass: 'status-blue' },
    not_started: { label: 'Başlamadı', badgeClass: 'status-grey' },
    unplanned: { label: 'Plansız', badgeClass: 'status-orange' },
    excluded: { label: 'Kapsam Dışı', badgeClass: 'status-grey' }
};

const TASK_STATUS_BADGES = {
    pending: 'status-grey',
    blocked: 'status-red',
    in_progress: 'status-blue',
    on_hold: 'status-orange',
    completed: 'status-green',
    cancelled: 'status-grey',
    skipped: 'status-grey'
};

document.addEventListener('DOMContentLoaded', async () => {
    if (!initRouteProtection()) {
        return;
    }
    await initNavbar();
    renderHeader();

    currentJobNos = new URLSearchParams(window.location.search).getAll('job_no').filter(Boolean);

    setupJobOrderPicker();

    if (currentJobNos.length) {
        await loadPlans(currentJobNos);
    } else {
        renderEmptyState();
    }
});

function renderHeader(subtitle) {
    new HeaderComponent({
        title: 'Üretim Planlama',
        subtitle: subtitle || 'İş emri departman görevleri — plan ve gerçekleşme',
        icon: 'calendar-check',
        containerId: 'header-placeholder',
        showBackButton: 'block',
        backUrl: '/projects/project-tracking/',
        showRefreshButton: 'block',
        onRefreshClick: () => {
            if (currentJobNos.length) {
                loadPlans(currentJobNos);
            }
        }
    });
}

function renderEmptyState() {
    const container = document.getElementById('plan-view-container');
    container.innerHTML = `
        <div class="dashboard-card">
            <div class="card-body text-center text-muted py-5">
                <i class="fas fa-calendar-check fa-2x mb-3"></i>
                <p class="mb-0">Üretim planını görüntülemek için yukarıdan bir veya birden fazla iş emri seçin.</p>
            </div>
        </div>`;
}

// ---------------------------------------------------------------------------
// Job order picker (multi-select)
// ---------------------------------------------------------------------------

async function setupJobOrderPicker() {
    const mount = document.getElementById('job-order-picker');
    const container = document.getElementById('job-order-picker-container');
    const applyButton = document.getElementById('apply-job-orders');
    if (!mount || !container || !applyButton) return;

    container.style.display = '';
    jobOrderDropdown = new ModernDropdown(mount, {
        placeholder: 'İş emri seçin (birden fazla seçilebilir)...',
        searchable: true,
        multiple: true,
        maxHeight: 320
    });

    applyButton.addEventListener('click', () => {
        const selected = (jobOrderDropdown.getValue() || []).filter(Boolean);
        if (!selected.length) {
            showNotification('En az bir iş emri seçin', 'warning');
            return;
        }
        currentJobNos = selected;
        const params = new URLSearchParams();
        selected.forEach(jobNo => params.append('job_no', jobNo));
        window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
        loadPlans(selected);
    });

    try {
        const jobOrders = await getJobOrderDropdown(true);
        jobOrderDropdown.setItems((jobOrders || []).map(jo => ({
            value: jo.job_no,
            text: `${jo.job_no} - ${jo.title}`
        })));
        if (currentJobNos.length) {
            jobOrderDropdown.setValue(currentJobNos);
        }
    } catch (error) {
        console.error('Job order dropdown load failed:', error);
    }
}

// ---------------------------------------------------------------------------
// Data loading & merging
// ---------------------------------------------------------------------------

async function loadPlans(jobNos) {
    const viewContainer = document.getElementById('plan-view-container');
    if (!planTable) {
        viewContainer.innerHTML = `
            <div class="dashboard-card">
                <div class="card-body text-center py-5">
                    <div class="spinner-border text-primary" role="status"></div>
                    <p class="text-muted mt-3 mb-0">Üretim planı yükleniyor...</p>
                </div>
            </div>`;
    }

    let plans;
    try {
        plans = await Promise.all(jobNos.map(jobNo => getJobOrderProductionPlan(jobNo)));
    } catch (error) {
        console.error('Production plan load failed:', error);
        if (!planTable) {
            viewContainer.innerHTML = `
                <div class="dashboard-card">
                    <div class="card-body text-center text-danger py-5">
                        <i class="fas fa-exclamation-triangle fa-2x mb-3"></i>
                        <p class="mb-0">Üretim planı yüklenemedi. İş emri numaralarını kontrol edin.</p>
                    </div>
                </div>`;
        }
        showNotification('Üretim planı yüklenemedi', 'error');
        return;
    }

    plan = mergePlans(plans);

    renderHeader(buildSubtitle(plans));
    renderStatistics();
    initViewLayout();
    updateFilterOptions();
    renderAll();
}

function buildSubtitle(plans) {
    if (plans.length === 1) {
        const jo = plans[0].job_order;
        return `${jo.job_no} · ${jo.title}${jo.customer_name ? ' · ' + jo.customer_name : ''}`;
    }
    const jobNos = plans.map(p => p.job_order.job_no);
    const shown = jobNos.slice(0, 4).join(', ');
    return `${jobNos.length} iş emri: ${shown}${jobNos.length > 4 ? ', …' : ''}`;
}

function mergePlans(plans) {
    if (plans.length === 1) {
        return plans[0];
    }
    // Dedupe nodes by job_no and tasks by id (overlapping selections, e.g. a
    // job order and one of its own children, must not double-count).
    const nodes = [];
    const seenNodes = new Set();
    const tasks = [];
    const seenTasks = new Set();
    for (const p of plans) {
        for (const node of p.nodes) {
            if (seenNodes.has(node.job_no)) continue;
            seenNodes.add(node.job_no);
            nodes.push(node);
        }
        for (const task of p.tasks) {
            if (seenTasks.has(task.id)) continue;
            seenTasks.add(task.id);
            tasks.push(task);
        }
    }
    return {
        job_order: plans[0].job_order,
        job_orders: plans.map(p => p.job_order),
        nodes,
        tasks,
        summary: summarizeTasks(tasks, nodes.length),
        today: plans[0].today,
        generated_at: plans[0].generated_at
    };
}

function summarizeTasks(tasks, nodeCount) {
    const summary = {
        node_count: nodeCount,
        total: tasks.length,
        main_tasks: 0,
        completed_on_time: 0, completed_late: 0, overdue: 0,
        in_progress: 0, not_started: 0, unplanned: 0, excluded: 0,
        max_end_variance_wd: null,
        max_overdue_wd: null
    };
    for (const task of tasks) {
        const sched = task.schedule;
        if (task.parent === null) summary.main_tasks += 1;
        summary[sched.classification] += 1;
        if (sched.end_variance_wd !== null && sched.end_variance_wd > 0) {
            summary.max_end_variance_wd = Math.max(summary.max_end_variance_wd || 0, sched.end_variance_wd);
        }
        if (sched.overdue_wd !== null) {
            summary.max_overdue_wd = Math.max(summary.max_overdue_wd || 0, sched.overdue_wd);
        }
    }
    return summary;
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

function renderStatistics() {
    const s = plan.summary;
    const maxLate = Math.max(s.max_end_variance_wd || 0, s.max_overdue_wd || 0);
    const cards = [
        {
            title: 'Toplam Görev',
            value: String(s.total),
            icon: 'fas fa-tasks',
            color: 'primary',
            tooltip: `${s.main_tasks} ana görev · ${s.node_count} iş emri`
        },
        {
            title: 'Zamanında Biten',
            value: String(s.completed_on_time),
            icon: 'fas fa-check-circle',
            color: 'success'
        },
        {
            title: 'Geç Biten',
            value: String(s.completed_late),
            icon: 'fas fa-exclamation-circle',
            color: 'danger'
        },
        {
            title: 'Gecikmede',
            value: String(s.overdue),
            icon: 'fas fa-hourglass-end',
            color: 'danger',
            tooltip: 'Hedef bitişi geçmiş, hâlâ tamamlanmamış görevler'
        },
        {
            title: 'Plansız',
            value: String(s.unplanned),
            icon: 'fas fa-question-circle',
            color: 'secondary',
            tooltip: 'Hedef bitiş tarihi girilmemiş görevler'
        },
        {
            title: 'En Büyük Gecikme',
            value: maxLate > 0 ? `${formatWd(maxLate)} iş günü` : '-',
            icon: 'fas fa-clock',
            color: maxLate > 0 ? 'danger' : 'secondary'
        }
    ];

    if (!statsCards) {
        statsCards = new StatisticsCards('plan-statistics-container', {
            cards,
            compact: true,
            animation: true,
            itemsPerRow: 6
        });
    } else {
        statsCards.setCards(cards);
    }
}

// ---------------------------------------------------------------------------
// View layout: toolbar (Tablo/Gantt + filters), table host, gantt card
// ---------------------------------------------------------------------------

function initViewLayout() {
    if (document.getElementById('production-plan-table-host')) {
        return;
    }
    const container = document.getElementById('plan-view-container');
    container.innerHTML = `
        <div class="dashboard-card mb-3">
            <div class="card-body py-2">
                <div class="d-flex flex-wrap align-items-center pp-toolbar">
                    <div class="btn-group btn-group-sm" role="group" aria-label="Görünüm seçimi">
                        <button type="button" class="btn btn-outline-primary" data-plan-view="table">
                            <i class="fas fa-table me-1"></i>Tablo
                        </button>
                        <button type="button" class="btn btn-outline-primary" data-plan-view="gantt">
                            <i class="fas fa-chart-gantt me-1"></i>Gantt
                        </button>
                    </div>
                    <div id="pp-filter-department" class="pp-filter"></div>
                    <div id="pp-filter-classification" class="pp-filter"></div>
                    <button type="button" id="pp-filter-clear" class="btn btn-sm btn-outline-secondary" style="display: none;">
                        <i class="fas fa-times me-1"></i>Filtreleri Temizle
                    </button>
                    <span class="text-muted small ms-auto">
                        Sapma değerleri iş günü cinsindendir (hafta sonu ve resmi tatiller sayılmaz).
                    </span>
                </div>
            </div>
        </div>
        <div id="production-plan-table-host"></div>
        <div id="production-plan-gantt-card" class="dashboard-card" style="display: none;">
            <div class="card-body">
                <div id="production-plan-gantt-host"></div>
            </div>
        </div>
    `;

    container.querySelectorAll('[data-plan-view]').forEach((button) => {
        button.addEventListener('click', () => {
            const selected = button.dataset.planView;
            if (!selected || selected === currentView) return;
            currentView = selected;
            updateViewState();
        });
    });

    setupFilterDropdowns();
    updateViewState();
}

function setupFilterDropdowns() {
    const departmentMount = document.getElementById('pp-filter-department');
    const classificationMount = document.getElementById('pp-filter-classification');
    const clearButton = document.getElementById('pp-filter-clear');

    departmentFilterDropdown = new ModernDropdown(departmentMount, {
        placeholder: 'Departman (tümü)',
        multiple: true,
        width: '190px',
        maxHeight: 280
    });
    classificationFilterDropdown = new ModernDropdown(classificationMount, {
        placeholder: 'Plan Durumu (tümü)',
        multiple: true,
        width: '190px',
        maxHeight: 280
    });

    departmentMount.addEventListener('dropdown:select', (e) => {
        activeFilters.departments = e.detail.value || [];
        onFiltersChanged();
    });
    classificationMount.addEventListener('dropdown:select', (e) => {
        activeFilters.classifications = e.detail.value || [];
        onFiltersChanged();
    });
    clearButton.addEventListener('click', () => {
        activeFilters = { departments: [], classifications: [] };
        departmentFilterDropdown.setValue([]);
        classificationFilterDropdown.setValue([]);
        onFiltersChanged();
    });
}

function onFiltersChanged() {
    const clearButton = document.getElementById('pp-filter-clear');
    const hasFilters = activeFilters.departments.length > 0 || activeFilters.classifications.length > 0;
    if (clearButton) clearButton.style.display = hasFilters ? '' : 'none';
    renderAll();
}

function updateFilterOptions() {
    if (!departmentFilterDropdown) return;

    const departments = new Map();
    for (const task of plan.tasks) {
        if (!departments.has(task.department)) {
            departments.set(task.department, task.department_display);
        }
    }
    departmentFilterDropdown.setItems(
        [...departments.entries()].map(([value, text]) => ({ value, text }))
    );
    departmentFilterDropdown.setValue(activeFilters.departments.filter(d => departments.has(d)));
    activeFilters.departments = departmentFilterDropdown.getValue() || [];

    const present = new Set(plan.tasks.map(t => t.schedule.classification));
    classificationFilterDropdown.setItems(
        Object.entries(CLASSIFICATION_BADGES)
            .filter(([key]) => present.has(key))
            .map(([key, meta]) => ({ value: key, text: meta.label }))
    );
    classificationFilterDropdown.setValue(activeFilters.classifications.filter(c => present.has(c)));
    activeFilters.classifications = classificationFilterDropdown.getValue() || [];
}

function updateViewState() {
    const tableHost = document.getElementById('production-plan-table-host');
    const ganttCard = document.getElementById('production-plan-gantt-card');
    if (!tableHost || !ganttCard) return;

    tableHost.style.display = currentView === 'table' ? '' : 'none';
    ganttCard.style.display = currentView === 'gantt' ? '' : 'none';

    document.querySelectorAll('[data-plan-view]').forEach((button) => {
        button.classList.toggle('active', button.dataset.planView === currentView);
    });

    if (currentView === 'gantt') {
        ensureGantt();
    }
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

function getFilteredTasks() {
    const { departments, classifications } = activeFilters;
    return plan.tasks.filter(task =>
        (departments.length === 0 || departments.includes(task.department)) &&
        (classifications.length === 0 || classifications.includes(task.schedule.classification))
    );
}

function renderAll() {
    renderTable();
    if (currentView === 'gantt' && ganttChart) {
        ganttChart.setTasks(buildGanttTasks());
        ganttDirty = false;
    } else {
        ganttDirty = true;
    }
}

// ---------------------------------------------------------------------------
// Table view
// ---------------------------------------------------------------------------

function buildRows() {
    const filtered = getFilteredTasks();
    const tasksByJob = new Map();
    for (const task of filtered) {
        if (!tasksByJob.has(task.job_no)) tasksByJob.set(task.job_no, []);
        tasksByJob.get(task.job_no).push(task);
    }

    const rows = [];
    plan.nodes.forEach((node, index) => {
        const nodeTasks = tasksByJob.get(node.job_no) || [];
        for (const task of nodeTasks) {
            rows.push({
                ...task,
                actual_start_date: task.schedule.actual_start_date,
                actual_end_date: task.schedule.actual_end_date,
                variance_wd: task.schedule.end_variance_wd ?? task.schedule.overdue_wd ?? null,
                classification: task.schedule.classification,
                _isSubtask: task.parent !== null,
                _node: node,
                // Zero-padded DFS index: alphabetical group-key sort == tree order
                _group_key: String(index).padStart(4, '0')
            });
        }
    });
    return rows;
}

function groupHeaderHtml(rows) {
    const node = rows[0]?._node;
    if (!node) return '';
    const indent = node.depth * 18;

    const badges = [];
    if (node.is_phase_job) {
        badges.push(`<span class="status-badge status-purple">Faz${node.phase_number ? ' P' + node.phase_number : ''}</span>`);
    }
    if (node.is_phased_master) {
        badges.push('<span class="status-badge status-grey">Fazlara Bölünmüş</span>');
    }

    // Problem counts from the visible rows so they stay truthful under filters
    const late = rows.filter(r => r.classification === 'completed_late').length;
    const overdue = rows.filter(r => r.classification === 'overdue').length;
    const unplanned = rows.filter(r => r.classification === 'unplanned').length;
    const problems = [];
    if (late > 0) problems.push(`<span class="text-danger">${late} geç bitti</span>`);
    if (overdue > 0) problems.push(`<span class="text-danger">${overdue} gecikmede</span>`);
    if (unplanned > 0) problems.push(`<span class="pp-text-orange">${unplanned} plansız</span>`);

    return `
        <div class="d-flex align-items-center flex-wrap gap-2" style="margin-left: ${indent}px;">
            <i class="fas fa-chevron-down small text-primary"></i>
            <strong>${escapeHtml(node.job_no)}</strong>
            <span class="pp-node-title">${escapeHtml(node.title)}</span>
            ${badges.join(' ')}
            <span class="text-muted small">%${Math.round(node.completion_percentage)} · ${rows.length} görev</span>
            ${problems.length ? `<span class="small">— ${problems.join(', ')}</span>` : ''}
        </div>`;
}

function taskCellHtml(row) {
    if (row._isSubtask) {
        return `<span class="pp-subtask-title"><i class="fas fa-level-up-alt fa-rotate-90"></i>${escapeHtml(row.title || '')}</span>`;
    }
    // Main tasks are auto-titled with the job order title; the department is
    // the meaningful label. Show the title only when it's a custom one.
    const hasCustomTitle = row.title && row._node && row.title !== row._node.title;
    return `
        <div class="pp-main-task">
            <span class="pp-main-task-dept">${escapeHtml(row.department_display || '')}</span>
            ${hasCustomTitle ? `<div class="pp-task-subtitle">${escapeHtml(row.title)}</div>` : ''}
        </div>`;
}

function getTableColumns() {
    return [
        {
            field: 'title',
            label: 'Görev',
            formatter: (value, row) => taskCellHtml(row)
        },
        {
            field: 'status_display',
            label: 'Durum',
            formatter: (value, row) =>
                `<span class="status-badge ${TASK_STATUS_BADGES[row.status] || 'status-grey'}">${escapeHtml(value || '')}</span>`
        },
        {
            field: 'assigned_to_name',
            label: 'Atanan',
            formatter: (value) => value ? escapeHtml(value) : '-'
        },
        { field: 'target_start_date', label: 'Hedef Başlangıç', formatter: formatDateCell },
        { field: 'target_completion_date', label: 'Hedef Bitiş', formatter: formatDateCell },
        { field: 'actual_start_date', label: 'Gerçek Başlangıç', formatter: formatDateCell },
        { field: 'actual_end_date', label: 'Gerçek Bitiş', formatter: formatDateCell },
        {
            field: 'variance_wd',
            label: 'Sapma (İş Günü)',
            formatter: (value, row) => formatVarianceCell(value, row)
        },
        {
            field: 'classification',
            label: 'Plan Durumu',
            formatter: (value) => {
                const meta = CLASSIFICATION_BADGES[value] || { label: value, badgeClass: 'status-grey' };
                return `<span class="status-badge ${meta.badgeClass}">${meta.label}</span>`;
            }
        },
        {
            field: 'completion_percentage',
            label: 'İlerleme',
            formatter: (value) => {
                const pct = Math.round(value || 0);
                const barClass = pct >= 100 ? 'bg-success' : (pct > 0 ? 'bg-primary' : 'bg-secondary');
                return `
                    <div class="pp-progress">
                        <div class="progress">
                            <div class="progress-bar ${barClass}" style="width: ${Math.min(pct, 100)}%">%${pct}</div>
                        </div>
                    </div>`;
            }
        }
    ];
}

function renderTable() {
    const rows = buildRows();
    if (planTable) {
        planTable.updateData(rows);
        return;
    }
    planTable = new TableComponent('production-plan-table-host', {
        title: 'Departman Görevleri Planı',
        icon: 'fas fa-calendar-check',
        iconColor: 'text-primary',
        columns: getTableColumns(),
        data: rows,
        sortable: false,
        pagination: false,
        groupBy: '_group_key',
        groupHeaderFormatter: (groupValue, groupRows) => groupHeaderHtml(groupRows),
        groupCollapsible: true,
        defaultGroupExpanded: true,
        exportable: true,
        onExport: () => exportToExcel(),
        emptyMessage: 'Seçili filtrelerle görev bulunamadı',
        skeleton: true,
        stickyHeader: true
    });
}

// ---------------------------------------------------------------------------
// Excel export (custom sheet: includes job order columns the table omits)
// ---------------------------------------------------------------------------

function exportToExcel() {
    if (typeof XLSX === 'undefined') {
        showNotification('Excel kütüphanesi yüklenemedi', 'error');
        return;
    }
    const rows = buildRows();
    if (!rows.length) {
        showNotification('Dışa aktarılacak veri bulunamadı', 'warning');
        return;
    }

    const headers = [
        'İş Emri', 'İş Emri Başlığı', 'Departman', 'Görev', 'Alt Görev mi',
        'Durum', 'Atanan', 'Hedef Başlangıç', 'Hedef Bitiş',
        'Gerçek Başlangıç', 'Gerçek Bitiş', 'Sapma (İş Günü)', 'Plan Durumu', 'İlerleme %'
    ];
    const data = rows.map(row => [
        row.job_no,
        row._node ? row._node.title : '',
        row.department_display || '',
        row.title || '',
        row._isSubtask ? 'Evet' : 'Hayır',
        row.status_display || '',
        row.assigned_to_name || '',
        formatDateCell(row.target_start_date),
        formatDateCell(row.target_completion_date),
        formatDateCell(row.actual_start_date),
        formatDateCell(row.actual_end_date),
        row.variance_wd === null || row.variance_wd === undefined ? '' : row.variance_wd,
        (CLASSIFICATION_BADGES[row.classification] || { label: row.classification }).label,
        typeof row.completion_percentage === 'number' ? Math.round(row.completion_percentage) : ''
    ]);

    try {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
        XLSX.utils.book_append_sheet(wb, ws, 'Üretim Planı');
        const jobPart = (currentJobNos.join('_') || 'plan').replace(/[/\\]/g, '-');
        XLSX.writeFile(wb, `Uretim_Plani_${jobPart}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (error) {
        console.error('Excel export error:', error);
        showNotification('Excel dosyası oluşturulurken hata oluştu', 'error');
    }
}

// ---------------------------------------------------------------------------
// Gantt view (created lazily, on first switch, so it renders while visible)
// ---------------------------------------------------------------------------

function ensureGantt() {
    if (!ganttChart) {
        ganttChart = new GanttChart('production-plan-gantt-host', {
            title: 'Üretim Planı Gantt',
            defaultPeriod: 'month',
            filterByWorkingDays: false,
            showCurrentTime: true,
            onTaskClick: (task) => {
                if (task?.is_group || !task?.job_no) return;
                window.open(
                    `/projects/project-tracking/?job_no=${encodeURIComponent(task.job_no)}`,
                    '_blank'
                );
            }
        });
        ganttChart.setTasks(buildGanttTasks());
        ganttDirty = false;
        return;
    }
    if (ganttDirty) {
        ganttChart.setTasks(buildGanttTasks());
        ganttDirty = false;
    }
}

function ganttStatus(task) {
    const classification = task.schedule.classification;
    if (classification === 'completed_late' || classification === 'overdue') return 'delayed';
    if (task.status === 'completed' || task.status === 'skipped') return 'completed';
    if (task.status === 'on_hold') return 'on-hold';
    return 'in-progress';
}

function buildGanttTasks() {
    const filtered = getFilteredTasks();
    const tasksByJob = new Map();
    for (const task of filtered) {
        if (!tasksByJob.has(task.job_no)) tasksByJob.set(task.job_no, []);
        tasksByJob.get(task.job_no).push(task);
    }

    const ganttTasks = [];
    let order = 0;
    const dayMs = 24 * 60 * 60 * 1000;

    for (const node of plan.nodes) {
        const nodeTasks = (tasksByJob.get(node.job_no) || [])
            .filter(t => t.target_start_date || t.target_completion_date);
        if (!nodeTasks.length) continue;

        ganttTasks.push({
            id: `node-${node.job_no}`,
            is_group: true,
            title: node.title,
            ti_number: node.job_no,
            plan_order: order++
        });

        for (const task of nodeTasks) {
            let startMs = task.target_start_date ? new Date(task.target_start_date).getTime() : null;
            let endMs = task.target_completion_date ? new Date(task.target_completion_date).getTime() : null;
            if (startMs && !endMs) endMs = startMs + dayMs;
            else if (!startMs && endMs) startMs = endMs - dayMs;

            ganttTasks.push({
                id: task.id,
                title: task.parent === null ? task.department_display : task.title,
                ti_number: task.job_no,
                job_no: task.job_no,
                planned_start_ms: startMs,
                planned_end_ms: endMs,
                plan_order: order++,
                progress_percentage: task.completion_percentage,
                status: ganttStatus(task),
                is_overdue: task.schedule.classification === 'overdue'
            });
        }
    }
    return ganttTasks;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text ?? '';
    return div.innerHTML;
}

function formatDateCell(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('tr-TR');
}

function formatWd(value) {
    if (value === null || value === undefined) return '-';
    const abs = Math.abs(value);
    return (abs % 1 === 0 ? abs.toFixed(0) : abs.toFixed(1)).replace('.', ',');
}

function formatVarianceCell(value, row) {
    if (value === null || value === undefined) return '<span class="text-muted">-</span>';
    if (value > 0) {
        const suffix = row.classification === 'overdue' ? ' <i class="fas fa-hourglass-half small"></i>' : '';
        return `<span class="pp-variance-late">+${formatWd(value)}${suffix}</span>`;
    }
    if (value < 0) {
        return `<span class="pp-variance-early">-${formatWd(value)}</span>`;
    }
    return '<span class="pp-variance-zero">0</span>';
}
