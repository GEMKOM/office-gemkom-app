/**
 * Üretim Planlama (Production Planning)
 *
 * Full-subtree department task schedule for a job order: every task of the
 * job order and all descendant job orders (incl. phases), grouped by job
 * order, with planned vs. actual dates and working-day lateness.
 * Table view (Excel export) + Gantt view. Read-only v1.
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
let plan = null;
let currentJobNo = null;
let planTable = null;
let ganttChart = null;
let statsCards = null;
let currentView = 'table';

const CLASSIFICATION_BADGES = {
    completed_on_time: { label: 'Zamanında', badgeClass: 'bg-success' },
    completed_late: { label: 'Geç Bitti', badgeClass: 'bg-danger' },
    overdue: { label: 'Gecikmede', badgeClass: 'bg-danger' },
    in_progress: { label: 'Devam Ediyor', badgeClass: 'bg-primary' },
    not_started: { label: 'Başlamadı', badgeClass: 'bg-secondary' },
    unplanned: { label: 'Plansız', badgeClass: 'bg-warning text-dark' },
    excluded: { label: 'Kapsam Dışı', badgeClass: 'bg-light text-muted border' }
};

const STATUS_BADGES = {
    pending: 'bg-secondary',
    blocked: 'bg-dark',
    in_progress: 'bg-primary',
    on_hold: 'bg-warning text-dark',
    completed: 'bg-success',
    cancelled: 'bg-danger',
    skipped: 'bg-info text-dark'
};

document.addEventListener('DOMContentLoaded', async () => {
    if (!initRouteProtection()) {
        return;
    }
    await initNavbar();
    renderHeader();

    currentJobNo = new URLSearchParams(window.location.search).get('job_no');

    // Picker is always available for switching job orders (non-blocking load)
    setupJobOrderPicker();

    if (currentJobNo) {
        await loadPlan(currentJobNo);
    } else {
        const container = document.getElementById('plan-view-container');
        container.innerHTML = `
            <div class="dashboard-card">
                <div class="card-body text-center text-muted py-5">
                    <i class="fas fa-calendar-check fa-2x mb-3"></i>
                    <p class="mb-0">Üretim planını görüntülemek için yukarıdan bir iş emri seçin.</p>
                </div>
            </div>`;
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
            if (currentJobNo) {
                loadPlan(currentJobNo);
            }
        }
    });
}

async function setupJobOrderPicker() {
    const mount = document.getElementById('job-order-picker');
    const container = document.getElementById('job-order-picker-container');
    if (!mount || !container) return;

    container.style.display = '';
    const dropdown = new ModernDropdown(mount, {
        placeholder: 'İş emri seçin...',
        searchable: true,
        multiple: false
    });

    mount.addEventListener('dropdown:select', (e) => {
        const selected = e.detail.value;
        if (selected && selected !== currentJobNo) {
            window.location.href = `${window.location.pathname}?job_no=${encodeURIComponent(selected)}`;
        }
    });

    try {
        const jobOrders = await getJobOrderDropdown(true);
        dropdown.setItems((jobOrders || []).map(jo => ({
            value: jo.job_no,
            text: `${jo.job_no} - ${jo.title}`
        })));
        if (currentJobNo) {
            dropdown.setValue(currentJobNo);
        }
    } catch (error) {
        console.error('Job order dropdown load failed:', error);
    }
}

async function loadPlan(jobNo) {
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

    try {
        plan = await getJobOrderProductionPlan(jobNo);
    } catch (error) {
        console.error('Production plan load failed:', error);
        viewContainer.innerHTML = `
            <div class="dashboard-card">
                <div class="card-body text-center text-danger py-5">
                    <i class="fas fa-exclamation-triangle fa-2x mb-3"></i>
                    <p class="mb-0">Üretim planı yüklenemedi. İş emri numarasını kontrol edin.</p>
                </div>
            </div>`;
        showNotification('Üretim planı yüklenemedi', 'error');
        return;
    }

    const jo = plan.job_order;
    renderHeader(`${jo.job_no} · ${jo.title}${jo.customer_name ? ' · ' + jo.customer_name : ''}`);
    renderStatistics();
    initViewLayout();
    renderTable();
    renderGantt();
    updateViewState();
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
            color: 'warning',
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
// View layout (Tablo / Gantt toggle)
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
                    <span class="text-muted small ms-2">
                        Sapma değerleri iş günü cinsindendir (hafta sonu ve resmi tatiller sayılmaz).
                    </span>
                </div>
            </div>
        </div>
        <div id="production-plan-table-host"></div>
        <div id="production-plan-gantt-host" style="display: none;"></div>
    `;

    container.querySelectorAll('[data-plan-view]').forEach((button) => {
        button.addEventListener('click', () => {
            const selected = button.dataset.planView;
            if (!selected || selected === currentView) return;
            currentView = selected;
            updateViewState();
        });
    });
}

function updateViewState() {
    const tableHost = document.getElementById('production-plan-table-host');
    const ganttHost = document.getElementById('production-plan-gantt-host');
    if (!tableHost || !ganttHost) return;

    tableHost.style.display = currentView === 'table' ? '' : 'none';
    ganttHost.style.display = currentView === 'gantt' ? '' : 'none';

    document.querySelectorAll('[data-plan-view]').forEach((button) => {
        button.classList.toggle('active', button.dataset.planView === currentView);
    });
}

// ---------------------------------------------------------------------------
// Table view
// ---------------------------------------------------------------------------

function buildRows() {
    const tasksByJob = new Map();
    for (const task of plan.tasks) {
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
    const s = node.summary;
    const indent = node.depth * 18;

    const badges = [];
    if (node.is_phase_job) {
        badges.push(`<span class="badge bg-info text-dark">Faz${node.phase_number ? ' P' + node.phase_number : ''}</span>`);
    }
    if (node.is_phased_master) {
        badges.push('<span class="badge bg-secondary">Fazlara Bölünmüş</span>');
    }

    const problems = [];
    if (s.completed_late > 0) problems.push(`<span class="text-danger">${s.completed_late} geç bitti</span>`);
    if (s.overdue > 0) problems.push(`<span class="text-danger">${s.overdue} gecikmede</span>`);
    if (s.unplanned > 0) problems.push(`<span class="text-warning">${s.unplanned} plansız</span>`);

    return `
        <div class="d-flex align-items-center flex-wrap gap-2" style="margin-left: ${indent}px;">
            <i class="fas fa-chevron-down small text-primary"></i>
            <strong>${escapeHtml(node.job_no)}</strong>
            <span class="pp-node-title">${escapeHtml(node.title)}</span>
            ${badges.join(' ')}
            <span class="text-muted small">%${Math.round(node.completion_percentage)} · ${s.total} görev</span>
            ${problems.length ? `<span class="small">— ${problems.join(', ')}</span>` : ''}
        </div>`;
}

function getTableColumns() {
    return [
        {
            field: 'job_no',
            label: 'İş Emri',
            formatter: (value) => `<span class="text-muted small">${escapeHtml(value || '')}</span>`
        },
        {
            field: 'title',
            label: 'Görev',
            formatter: (value, row) => row._isSubtask
                ? `<span class="pp-subtask-title"><i class="fas fa-level-up-alt fa-rotate-90"></i>${escapeHtml(value || '')}</span>`
                : escapeHtml(value || '')
        },
        { field: 'department_display', label: 'Departman' },
        {
            field: 'status_display',
            label: 'Durum',
            formatter: (value, row) =>
                `<span class="badge ${STATUS_BADGES[row.status] || 'bg-secondary'}">${escapeHtml(value || '')}</span>`
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
                const meta = CLASSIFICATION_BADGES[value] || { label: value, badgeClass: 'bg-secondary' };
                return `<span class="badge ${meta.badgeClass}">${meta.label}</span>`;
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
        exportFilename: () =>
            `Uretim_Plani_${(currentJobNo || 'plan').replace(/[/\\]/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`,
        emptyMessage: 'Bu iş emrinde departman görevi bulunmuyor',
        skeleton: true,
        stickyHeader: true
    });
}

// ---------------------------------------------------------------------------
// Gantt view
// ---------------------------------------------------------------------------

function ganttStatus(task) {
    const classification = task.schedule.classification;
    if (classification === 'completed_late' || classification === 'overdue') return 'delayed';
    if (task.status === 'completed' || task.status === 'skipped') return 'completed';
    if (task.status === 'on_hold') return 'on-hold';
    return 'in-progress';
}

function buildGanttTasks() {
    const tasksByJob = new Map();
    for (const task of plan.tasks) {
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
                title: task.title,
                ti_number: task.department_display,
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

function renderGantt() {
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
    }
    ganttChart.setTasks(buildGanttTasks());
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
