// Welding Capacity Planning — resource-grouped Gantt with in-memory what-if editing.

import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { GanttChart } from '../../../components/gantt/gantt.js';
import { showNotification } from '../../../components/notification/notification.js';
import { EditModal } from '../../../components/edit-modal/edit-modal.js';
import { ConfirmationModal } from '../../../components/confirmation-modal/confirmation-modal.js';
import {
    getWeldingPlanBoard,
    bulkSaveWeldingPlanAllocations,
    promoteWeldingPlanAllocation,
    setWeldingSubtaskDates,
} from '../../../apis/welding/planAllocations.js';
import { fetchPriceTiers } from '../../../apis/subcontracting/priceTiers.js';

// ---- state ---------------------------------------------------------------
let ganttChart = null;
let lastGanttRows = [];            // last rows passed to the Gantt (for reflow re-renders)
let board = { resources: [], welding_tasks: [], warnings: [] };

// Working copy of allocations. Each: {clientKey, id, department_task, job_no,
// job_order_title, resource_type, resource_id, allocated_weight_kg,
// planned_start_date, planned_end_date, notes, progress, is_promoted}
let currentAllocations = [];
let originalById = new Map();      // numeric id -> JSON snapshot of the saved row
let deletedIds = new Set();        // numeric ids marked for deletion
let newKeyCounter = 0;
let hasUnsavedChanges = false;

let allocModal = null;
let promoteModal = null;
let deleteConfirmModal = null;
let editingKey = null;             // clientKey currently open in the modal
let promotingKey = null;           // clientKey being promoted
let pendingJobTaskId = null;       // department_task id for a drag-initiated allocation
let jobsSearchTerm = '';           // filter text for the jobs list
let showCompleted = false;         // include completed/cancelled jobs on the board

// ---- helpers -------------------------------------------------------------
function resourceKey(type, id) { return `${type}-${id}`; }

function dateToMs(dateStr) {
    if (!dateStr) return null;
    const ms = new Date(dateStr).getTime();
    return isNaN(ms) ? null : ms;
}

function markDirty() {
    hasUnsavedChanges = true;
    const btn = document.getElementById('save-btn');
    if (btn) btn.disabled = false;
}

function flattenBoardToAllocations(boardData) {
    const rows = [];
    (boardData.resources || []).forEach(res => {
        (res.allocations || []).forEach(a => {
            const committed = a.kind === 'committed';
            rows.push({
                // Plan rows have a real id; committed rows are keyed by their source.
                clientKey: a.id != null ? String(a.id) : `committed-${a.source}-${a.source_id}`,
                id: a.id,
                committed,                         // read-only, not saveable
                subtask_id: a.subtask_id != null ? a.subtask_id : null,   // real subtask (committed/promoted)
                department_task: a.department_task != null ? a.department_task : a.department_task_id,
                job_no: a.job_no,
                job_order_title: a.job_order_title,
                resource_type: res.resource_type,
                resource_id: res.id,
                allocated_weight_kg: a.allocated_weight_kg,
                planned_start_date: a.planned_start_date,
                planned_end_date: a.planned_end_date,
                notes: a.notes || '',
                progress: a.progress,
                is_promoted: a.is_promoted,
            });
        });
    });
    return rows;
}

function hydrateFromBoard(boardData) {
    board = boardData;
    currentAllocations = flattenBoardToAllocations(boardData);
    originalById = new Map();
    currentAllocations.forEach(a => { if (a.id != null) originalById.set(a.id, JSON.stringify(a)); });
    deletedIds = new Set();
    hasUnsavedChanges = false;
    const saveBtn = document.getElementById('save-btn');
    if (saveBtn) saveBtn.disabled = true;
    renderWarnings(boardData.warnings || []);
    renderJobsTable();
    renderGantt();
}

// kg planned for a welding task in the current (possibly unsaved) session.
function allocatedForTask(taskId) {
    return currentAllocations
        .filter(a => a.department_task === Number(taskId) && !(a.id && deletedIds.has(a.id)))
        .reduce((sum, a) => sum + Number(a.allocated_weight_kg || 0), 0);
}

function remainingForTask(task) {
    if (!task || task.total_weight_kg == null) return null;
    return Number(task.total_weight_kg) - allocatedForTask(task.department_task_id);
}

// Only jobs WITH a total weight can be planned. Weightless jobs are excluded here (fallback dropdown).
function weldingTaskOptions() {
    return (board.welding_tasks || [])
        .filter(t => t.total_weight_kg != null)
        .map(t => {
            const remaining = remainingForTask(t);
            return {
                value: String(t.department_task_id),
                label: `${t.job_no} — ${t.job_order_title || ''} (kalan ~${remaining} kg)`,
            };
        });
}

function resourceOptions(type) {
    return (board.resources || [])
        .filter(r => r.resource_type === type)
        .map(r => ({ value: String(r.id), label: r.name }));
}

// Subcontractors + teams in one searchable list. Value encodes type: "team:3" / "subcontractor:5".
function combinedResourceOptions() {
    return (board.resources || []).map(r => ({
        value: `${r.resource_type}:${r.id}`,
        label: `${r.resource_type === 'team' ? '👷 Ekip' : '🏭 Taşeron'} · ${r.name}`,
    }));
}

function parseResourceValue(value) {
    const [type, id] = String(value || '').split(':');
    return { type, id: Number(id) };
}

function findResource(type, id) {
    return (board.resources || []).find(r => r.resource_type === type && r.id === Number(id));
}

// ---- rendering -----------------------------------------------------------
function renderWarnings(warnings) {
    const banner = document.getElementById('warnings-banner');
    if (!banner) return;
    if (!warnings || warnings.length === 0) {
        banner.classList.add('d-none');
        banner.innerHTML = '';
        return;
    }
    const lines = warnings.map(w =>
        `<li>${w.job_no}: planlanan <strong>${w.allocated_total} kg</strong> &gt; iş ağırlığı ${w.total_weight_kg} kg</li>`
    ).join('');
    banner.innerHTML = `<i class="fas fa-exclamation-triangle me-1"></i>Aşırı tahsis (yalnızca uyarı, kayıt engellenmez):<ul class="mb-0">${lines}</ul>`;
    banner.classList.remove('d-none');
}

function renderGantt() {
    const rows = [];
    (board.resources || []).forEach(res => {
        const key = resourceKey(res.resource_type, res.id);
        const children = currentAllocations.filter(a =>
            a.resource_type === res.resource_type &&
            a.resource_id === res.id &&
            !(a.id && deletedIds.has(a.id))
        );
        const total = children.reduce((sum, a) => sum + Number(a.allocated_weight_kg || 0), 0);
        rows.push({
            is_group: true,
            id: `group-${key}`,
            group_id: key,
            ti_number: res.name,
            title: `${total.toLocaleString('tr-TR')} kg`,
        });
        children.forEach(a => {
            rows.push({
                id: a.clientKey,
                group_id: key,
                ti_number: `${a.job_no}${a.is_promoted ? ' 🔒' : ''}`,
                title: `${a.job_order_title || ''} — ${a.allocated_weight_kg} kg`,
                planned_start_ms: dateToMs(a.planned_start_date),
                planned_end_ms: dateToMs(a.planned_end_date),
                progress_percentage: typeof a.progress === 'number' ? a.progress : undefined,
                status: a.is_promoted ? 'completed' : 'in-progress',
                _allocKey: a.clientKey,
            });
        });
    });

    if (!ganttChart) {
        ganttChart = new GanttChart('gantt-container', {
            title: 'Kaynak Kapasite Planı',
            defaultPeriod: 'month',
            filterByWorkingDays: false,
            onTaskClick: (task) => {
                if (task && task._allocKey) openAllocationModal(task._allocKey);
            },
        });
        // The Gantt sizes its columns from `.gantt-scrolling-column`'s width, but that
        // element only exists AFTER the first render — so the first render falls back to
        // a narrow default and columns don't stretch. Re-render once on the next frame
        // (column now exists at full width) and on window resize.
        requestAnimationFrame(() => { if (ganttChart) ganttChart.setTasks(lastGanttRows); });
        let resizeTimer = null;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => { if (ganttChart) ganttChart.setTasks(lastGanttRows); }, 150);
        });
    }
    lastGanttRows = rows;
    ganttChart.setTasks(rows);
}

// ---- allocation modal ----------------------------------------------------
function syncAllocExtraActions({ isNew, promoted }) {
    const footer = allocModal.container.querySelector('.modal-footer');
    if (!footer) return;

    let extras = footer.querySelector('.alloc-extra-actions');
    if (!extras) {
        extras = document.createElement('div');
        extras.className = 'alloc-extra-actions me-auto d-flex gap-2';
        extras.innerHTML = `
            <button type="button" class="btn btn-sm btn-outline-danger" id="alloc-delete-btn">
                <i class="fas fa-trash me-1"></i>Sil
            </button>
            <button type="button" class="btn btn-sm btn-outline-success" id="alloc-promote-btn">
                <i class="fas fa-check-double me-1"></i>Gerçek Atamaya Dönüştür
            </button>
        `;
        footer.insertBefore(extras, footer.firstChild);
        extras.querySelector('#alloc-delete-btn').addEventListener('click', onAllocationDeleteClick);
        extras.querySelector('#alloc-promote-btn').addEventListener('click', onAllocationPromote);
    }

    extras.querySelector('#alloc-delete-btn').classList.toggle('d-none', isNew || promoted);
    extras.querySelector('#alloc-promote-btn').classList.toggle('d-none', isNew || promoted);

    // Save stays visible even for real rows — their dates are editable.
    const saveBtn = footer.querySelector('#save-edit-btn');
    if (saveBtn) saveBtn.classList.remove('d-none');
}

// ---- jobs list (draggable) ----------------------------------------------
function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('tr-TR');
}

function renderJobsTable() {
    const container = document.getElementById('jobs-table-container');
    if (!container) return;

    const term = jobsSearchTerm.trim().toLocaleLowerCase('tr');
    const tasks = (board.welding_tasks || []).filter(t => {
        if (!term) return true;
        return [t.job_no, t.job_order_title, t.customer_name]
            .some(v => (v || '').toString().toLocaleLowerCase('tr').includes(term));
    });

    if (tasks.length === 0) {
        container.innerHTML = `<div class="text-muted text-center py-4">Kaynak işi bulunamadı.</div>`;
        return;
    }

    const fmt = (n) => Number(n).toLocaleString('tr-TR');
    container.innerHTML = tasks.map(t => {
        const hasWeight = t.total_weight_kg != null;
        const allocated = allocatedForTask(t.department_task_id);
        const remaining = hasWeight ? Number(t.total_weight_kg) - allocated : null;
        const over = hasWeight && remaining < 0;

        if (!hasWeight) {
            // No total weight → cannot be planned. Show but disable.
            return `
                <div class="welding-job-card no-weight" draggable="false" data-task-id="${t.department_task_id}">
                    <div class="job-no">${t.job_no || ''}</div>
                    <div class="job-title">${t.job_order_title || ''}</div>
                    <div class="job-meta">
                        <i class="fas fa-user me-1"></i>${t.customer_name || '—'}
                        &nbsp;·&nbsp;<i class="fas fa-flag-checkered me-1"></i>${formatDate(t.target_completion_date)}
                    </div>
                    <div class="job-meta text-danger">
                        <i class="fas fa-exclamation-triangle me-1"></i>Ağırlık tanımlı değil — tahsis yapılamaz
                    </div>
                </div>`;
        }

        return `
            <div class="welding-job-card" draggable="true" data-task-id="${t.department_task_id}">
                <div class="job-no">${t.job_no || ''}</div>
                <div class="job-title">${t.job_order_title || ''}</div>
                <div class="job-meta">
                    <i class="fas fa-user me-1"></i>${t.customer_name || '—'}
                    &nbsp;·&nbsp;<i class="fas fa-weight-hanging me-1"></i>${fmt(t.total_weight_kg)} kg
                    &nbsp;·&nbsp;<i class="fas fa-flag-checkered me-1"></i>${formatDate(t.target_completion_date)}
                </div>
                <div class="job-meta ${over ? 'job-alloc over' : 'job-alloc'}">
                    <i class="fas fa-industry me-1"></i>Atanmış: ${fmt(allocated)} kg ·
                    Kalan: ${fmt(remaining)} kg
                </div>
            </div>`;
    }).join('');

    container.querySelectorAll('.welding-job-card:not(.no-weight)').forEach(card => {
        card.addEventListener('dragstart', (e) => {
            card.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'copy';
            e.dataTransfer.setData('text/plain', card.dataset.taskId);
        });
        card.addEventListener('dragend', () => card.classList.remove('dragging'));
    });
}

let jobsCollapsed = false;
function toggleJobsPanel() {
    jobsCollapsed = !jobsCollapsed;
    const gcol = document.getElementById('gantt-col');
    const jcol = document.getElementById('jobs-col');
    const btn = document.getElementById('toggle-jobs-btn');
    if (jobsCollapsed) {
        jcol.classList.add('d-none');
        gcol.classList.remove('col-lg-8');
        gcol.classList.add('col-12');
        if (btn) btn.innerHTML = '<i class="fas fa-table-columns me-1"></i>İşleri Göster';
    } else {
        jcol.classList.remove('d-none');
        gcol.classList.remove('col-12');
        gcol.classList.add('col-lg-8');
        if (btn) btn.innerHTML = '<i class="fas fa-table-columns me-1"></i>İşleri Gizle';
    }
    // Let the layout settle, then re-render so the Gantt columns re-stretch to the new width.
    requestAnimationFrame(() => { if (ganttChart) ganttChart.setTasks(lastGanttRows); });
}

function setupGanttDropZone() {
    const zone = document.getElementById('gantt-container');
    if (!zone || zone.dataset.dropBound) return;
    zone.dataset.dropBound = '1';

    zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        zone.classList.add('drop-active');
    });
    zone.addEventListener('dragleave', (e) => {
        if (e.target === zone || !zone.contains(e.relatedTarget)) zone.classList.remove('drop-active');
    });
    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('drop-active');
        const taskId = Number(e.dataTransfer.getData('text/plain'));
        if (!taskId) return;
        const task = (board.welding_tasks || []).find(t => t.department_task_id === taskId);
        if (!task || task.total_weight_kg == null) {
            showNotification('Bu işin toplam ağırlığı tanımlı olmadığı için tahsis yapılamaz.', 'error');
            return;
        }
        openAllocationModal(null, taskId);
    });
}

function openAllocationModal(clientKey, prefilledJobTaskId = null) {
    editingKey = clientKey;
    const isNew = clientKey == null;
    const alloc = isNew ? null : currentAllocations.find(a => a.clientKey === clientKey);
    const promoted = !!(alloc && alloc.is_promoted);

    // For a new (drag-initiated) allocation, remember which welding task it's for.
    pendingJobTaskId = isNew ? prefilledJobTaskId : null;
    const prefilledJob = isNew && prefilledJobTaskId != null
        ? (board.welding_tasks || []).find(t => t.department_task_id === Number(prefilledJobTaskId))
        : null;

    // Weight context for the welding task this allocation targets.
    const contextTaskId = isNew ? prefilledJobTaskId : (alloc ? alloc.department_task : null);
    const contextTask = contextTaskId != null
        ? (board.welding_tasks || []).find(t => t.department_task_id === Number(contextTaskId))
        : null;
    const totalWeight = contextTask && contextTask.total_weight_kg != null
        ? Number(contextTask.total_weight_kg) : null;
    const fmtKg = (n) => Number(n).toLocaleString('tr-TR');
    const isRealRow = !!(alloc && alloc.subtask_id);

    // DISPLAY: total already assigned to this welding task, INCLUDING the row being edited.
    const allocatedTotal = contextTask ? allocatedForTask(contextTask.department_task_id) : 0;
    const remainingOverall = totalWeight != null ? totalWeight - allocatedTotal : null;
    const weightInfoValue = totalWeight != null
        ? `Toplam ${fmtKg(totalWeight)} kg · Atanmış ${fmtKg(allocatedTotal)} kg · Kalan ${fmtKg(remainingOverall)} kg`
        : 'Bu iş için ağırlık tanımlı değil';

    // INPUT: room available for THIS allocation — exclude its own current weight so re-sizing is intuitive.
    const ownWeight = alloc ? Number(alloc.allocated_weight_kg || 0) : 0;
    const assignableRemaining = totalWeight != null ? totalWeight - (allocatedTotal - ownWeight) : null;
    const defaultWeight = alloc
        ? alloc.allocated_weight_kg
        : (remainingOverall != null && remainingOverall > 0 ? remainingOverall : '');

    allocModal.clearAll();
    allocModal.setTitle(isNew ? 'Tahsis Ekle' : 'Tahsis Düzenle');
    allocModal.setIcon(isNew ? 'fas fa-plus-circle' : 'fas fa-edit');
    allocModal.setSaveButtonText('Uygula');

    if (promoted) {
        allocModal.addSection({
            title: 'Gerçek Atama',
            icon: 'fas fa-lock',
            iconColor: 'text-info',
            fields: [{
                id: 'promoted_hint',
                name: 'promoted_hint',
                label: 'Durum',
                type: 'text',
                value: 'Bu gerçek bir atama. Ağırlık ve kaynak değiştirilemez; yalnızca planlama tarihlerini düzenleyebilirsiniz.',
                readonly: true,
                colSize: 12,
            }],
        });
    }

    allocModal.addSection({
        title: 'Tahsis Bilgileri',
        icon: 'fas fa-fire',
        iconColor: 'text-danger',
        fields: isNew ? [
            prefilledJob ? {
                id: 'job_label',
                name: 'job_label',
                label: 'Kaynak Görevi (İş No)',
                type: 'text',
                readonly: true,
                icon: 'fas fa-tasks',
                colSize: 12,
                value: `${prefilledJob.job_no} — ${prefilledJob.job_order_title || ''}`,
            } : {
                id: 'department_task',
                name: 'department_task',
                label: 'Kaynak Görevi (İş No)',
                type: 'dropdown',
                required: true,
                searchable: true,
                icon: 'fas fa-tasks',
                colSize: 12,
                options: weldingTaskOptions(),
                value: weldingTaskOptions()[0]?.value || '',
            },
            {
                id: 'resource',
                name: 'resource',
                label: 'Kaynak (Taşeron / Ekip)',
                type: 'dropdown',
                required: true,
                searchable: true,
                icon: 'fas fa-industry',
                colSize: 12,
                placeholder: 'Taşeron veya ekip ara...',
                options: combinedResourceOptions(),
                value: '',
            },
        ] : [
            {
                id: 'job_label',
                name: 'job_label',
                label: 'Kaynak Görevi (İş No)',
                type: 'text',
                readonly: true,
                icon: 'fas fa-tasks',
                colSize: 12,
                value: `${alloc.job_no} — ${alloc.job_order_title || ''}`,
            },
            {
                id: 'resource_label',
                name: 'resource_label',
                label: 'Kaynak',
                type: 'text',
                readonly: true,
                icon: 'fas fa-industry',
                colSize: 12,
                value: (() => {
                    const res = findResource(alloc.resource_type, alloc.resource_id);
                    const typeLabel = alloc.resource_type === 'team' ? 'Ekip' : 'Taşeron';
                    return `${typeLabel}: ${res ? res.name : alloc.resource_id}`;
                })(),
            },
        ],
    });

    allocModal.addSection({
        title: 'Plan',
        icon: 'fas fa-calendar-alt',
        iconColor: 'text-primary',
        fields: [
            {
                id: 'weight_info',
                name: 'weight_info',
                label: 'Ağırlık Durumu',
                type: 'text',
                readonly: true,
                icon: 'fas fa-balance-scale',
                colSize: 12,
                value: weightInfoValue,
            },
            {
                id: 'allocated_weight_kg',
                name: 'allocated_weight_kg',
                label: 'Ağırlık (kg)',
                type: 'number',
                required: !promoted,
                min: 0.01,
                step: 0.01,
                icon: 'fas fa-weight-hanging',
                colSize: 12,
                value: defaultWeight,
                readonly: promoted,
                help: (!isRealRow && assignableRemaining != null) ? `Atanabilir kalan: ${fmtKg(assignableRemaining)} kg` : '',
            },
            {
                id: 'planned_start_date',
                name: 'planned_start_date',
                label: 'Başlangıç',
                type: 'date',
                icon: 'fas fa-play',
                colSize: 6,
                value: alloc ? (alloc.planned_start_date || '') : '',
                // Dates are always schedulable — even for real (committed/promoted) rows.
            },
            {
                id: 'planned_end_date',
                name: 'planned_end_date',
                label: 'Bitiş',
                type: 'date',
                icon: 'fas fa-flag-checkered',
                colSize: 6,
                value: alloc ? (alloc.planned_end_date || '') : '',
            },
            {
                id: 'notes',
                name: 'notes',
                label: 'Not',
                type: 'textarea',
                rows: 2,
                icon: 'fas fa-sticky-note',
                colSize: 12,
                value: alloc ? (alloc.notes || '') : '',
                readonly: promoted,
            },
        ],
    });

    allocModal.render();
    syncAllocExtraActions({ isNew, promoted });
    allocModal.show();
}

async function onAllocationSave(formData) {
    const isNew = editingKey == null;
    const weight = formData.allocated_weight_kg;
    const start = formData.planned_start_date || null;
    const end = formData.planned_end_date || null;
    const notes = formData.notes || '';

    if (isNew) {
        // Job comes from the dragged card (pendingJobTaskId) or, as a fallback, the dropdown.
        const departmentTask = pendingJobTaskId != null
            ? Number(pendingJobTaskId)
            : Number(formData.department_task);
        const { type, id: resourceId } = parseResourceValue(formData.resource);

        if (!departmentTask || !type || !resourceId || !weight || Number(weight) <= 0) {
            showNotification('Görev, kaynak ve geçerli bir ağırlık zorunludur.', 'error');
            return;
        }

        const task = (board.welding_tasks || []).find(t => t.department_task_id === departmentTask);
        currentAllocations.push({
            clientKey: `new-${++newKeyCounter}`,
            id: null,
            department_task: departmentTask,
            job_no: task ? task.job_no : '',
            job_order_title: task ? task.job_order_title : '',
            resource_type: type,
            resource_id: resourceId,
            allocated_weight_kg: weight,
            planned_start_date: start,
            planned_end_date: end,
            notes,
            progress: 0,
            is_promoted: false,
        });
        markDirty();
        allocModal.hide();
        renderGantt();
        return;
    }

    const alloc = currentAllocations.find(a => a.clientKey === editingKey);
    if (!alloc) { allocModal.hide(); return; }

    // Real subtask (committed / promoted): only the dates are editable, saved immediately.
    if (alloc.subtask_id) {
        // Reloading after the immediate date save replaces the entire working plan.
        // Require pending plan changes to be persisted first so they are not lost.
        if (hasUnsavedChanges) {
            showNotification('Tarihleri güncellemeden önce plan değişikliklerini kaydedin.', 'error');
            return;
        }
        try {
            await setWeldingSubtaskDates(alloc.subtask_id, start, end);
            showNotification('Tarihler kaydedildi.', 'success');
            allocModal.hide();
            await loadBoard();
        } catch (e) {
            showNotification(e.message, 'error');
        }
        return;
    }

    // Pure planning row: edit in memory.
    if (!weight || Number(weight) <= 0) {
        showNotification('Geçerli bir ağırlık zorunludur.', 'error');
        return;
    }
    alloc.allocated_weight_kg = weight;
    alloc.planned_start_date = start;
    alloc.planned_end_date = end;
    alloc.notes = notes;
    markDirty();
    allocModal.hide();
    renderGantt();
}

function onAllocationDeleteClick() {
    const alloc = currentAllocations.find(a => a.clientKey === editingKey);
    if (!alloc) {
        allocModal.hide();
        return;
    }
    if (alloc.is_promoted) {
        showNotification('Gerçek atamaya dönüştürülmüş tahsis silinemez.', 'error');
        return;
    }

    deleteConfirmModal.show({
        title: 'Tahsis Sil',
        message: 'Bu tahsisi silmek istediğinize emin misiniz?',
        description: alloc.job_no
            ? `${alloc.job_no} — ${alloc.allocated_weight_kg} kg`
            : '',
        confirmText: 'Sil',
        onConfirm: () => {
            if (alloc.id) deletedIds.add(alloc.id);
            currentAllocations = currentAllocations.filter(a => a.clientKey !== editingKey);
            markDirty();
            allocModal.hide();
            renderGantt();
        },
    });
}

// ---- promote -------------------------------------------------------------
async function onAllocationPromote() {
    const alloc = currentAllocations.find(a => a.clientKey === editingKey);
    if (!alloc) return;
    if (!alloc.id || hasUnsavedChanges) {
        showNotification('Dönüştürmeden önce değişiklikleri kaydedin.', 'error');
        return;
    }
    if (alloc.resource_type === 'team') {
        try {
            await promoteWeldingPlanAllocation(alloc.id, {});
            showNotification('Ekip ataması oluşturuldu.', 'success');
            allocModal.hide();
            await loadBoard();
        } catch (e) {
            showNotification(e.message, 'error');
        }
        return;
    }

    promotingKey = editingKey;
    allocModal.hide();
    try {
        const tiersResp = await fetchPriceTiers({ job_order: alloc.job_no, ordering: 'name' });
        const tiers = (tiersResp.results || tiersResp || [])
            .filter(t => t.tier_type === 'welding')
            .map(t => ({
                value: String(t.id),
                label: `${t.name} — ${t.price_per_kg} ${t.currency}/kg (kalan ${t.remaining_weight_kg} kg)`,
            }));

        if (tiers.length === 0) {
            showNotification('Bu iş için kaynak fiyat kademesi bulunamadı. Önce planlamadan fiyat kademesi tanımlayın.', 'error');
            return;
        }

        promoteModal.clearAll();
        promoteModal.addSection({
            title: 'Fiyat Kademesi',
            icon: 'fas fa-tags',
            iconColor: 'text-success',
            fields: [{
                id: 'price_tier',
                name: 'price_tier',
                label: 'Fiyat Kademesi',
                type: 'dropdown',
                required: true,
                searchable: true,
                icon: 'fas fa-tag',
                colSize: 12,
                help: 'Bu tahsisi gerçek, hakedişe dahil bir taşeron atamasına dönüştürmek için fiyat kademesi seçin.',
                options: tiers,
                value: tiers[0].value,
            }],
        });
        promoteModal.render();
        promoteModal.show();
    } catch (e) {
        showNotification(e.message, 'error');
    }
}

async function onPromoteConfirm(formData) {
    const alloc = currentAllocations.find(a => a.clientKey === promotingKey);
    if (!alloc) return;
    const priceTier = Number(formData.price_tier);
    if (!priceTier) {
        showNotification('Fiyat kademesi seçin.', 'error');
        return;
    }
    try {
        await promoteWeldingPlanAllocation(alloc.id, { price_tier: priceTier });
        showNotification('Taşeron ataması oluşturuldu.', 'success');
        promoteModal.hide();
        await loadBoard();
    } catch (e) {
        showNotification(e.message, 'error');
    }
}

// ---- save ----------------------------------------------------------------
function buildBulkItems() {
    const items = [];
    currentAllocations.forEach(a => {
        if (a.committed) return;   // real assignments made outside planning — never saved from here
        const payload = {
            department_task: a.department_task,
            subcontractor: a.resource_type === 'subcontractor' ? a.resource_id : null,
            team: a.resource_type === 'team' ? a.resource_id : null,
            allocated_weight_kg: a.allocated_weight_kg,
            planned_start_date: a.planned_start_date,
            planned_end_date: a.planned_end_date,
            notes: a.notes || '',
        };
        if (!a.id) {
            items.push(payload);
        } else {
            const original = originalById.get(a.id);
            if (original && original !== JSON.stringify(a)) {
                items.push({ id: a.id, ...payload });
            }
        }
    });
    deletedIds.forEach(id => items.push({ id, deleted: true }));
    return items;
}

async function onSave() {
    const items = buildBulkItems();
    if (items.length === 0) {
        showNotification('Kaydedilecek değişiklik yok.', 'info');
        return;
    }
    try {
        const resp = await bulkSaveWeldingPlanAllocations(items);
        showNotification('Plan kaydedildi.', 'success');
        hydrateFromBoard(resp.board);
    } catch (e) {
        showNotification(e.message, 'error');
    }
}

async function loadBoard() {
    try {
        const data = await getWeldingPlanBoard(showCompleted);
        hydrateFromBoard(data);
    } catch (e) {
        showNotification(e.message, 'error');
    }
}

function onReload() {
    if (hasUnsavedChanges && !confirm('Kaydedilmemiş değişiklikler var. Yenilemek istediğinize emin misiniz?')) {
        return;
    }
    loadBoard();
}

// ---- init ----------------------------------------------------------------
function initModals() {
    allocModal = new EditModal('allocation-modal-container', {
        title: 'Tahsis Ekle',
        icon: 'fas fa-plus-circle',
        saveButtonText: 'Uygula',
        size: 'md',
    });
    allocModal.onSaveCallback(onAllocationSave);

    promoteModal = new EditModal('promote-modal-container', {
        title: 'Taşeron Atamasına Dönüştür',
        icon: 'fas fa-check-double',
        saveButtonText: 'Dönüştür',
        size: 'md',
    });
    promoteModal.onSaveCallback(onPromoteConfirm);

    deleteConfirmModal = new ConfirmationModal('delete-confirm-modal-container', {
        title: 'Tahsis Sil',
        icon: 'fas fa-exclamation-triangle',
        message: 'Bu tahsisi silmek istediğinize emin misiniz?',
        confirmText: 'Sil',
        cancelText: 'İptal',
        confirmButtonClass: 'btn-danger',
    });
}

function init() {
    initNavbar();

    new HeaderComponent({
        title: 'Kaynak Kapasite Planlama',
        subtitle: 'Kaynak görevlerini taşeron ve ekiplere ağırlıkla dağıtın (planlama amaçlı)',
        icon: 'fire',
        containerId: 'header-placeholder',
        showBackButton: 'block',
        showCreateButton: 'block',
        showRefreshButton: 'block',
        createButtonText: 'Tahsis Ekle',
        refreshButtonText: 'Yenile',
        backUrl: '/manufacturing/welding/',
        onCreateClick: () => openAllocationModal(null),
        onRefreshClick: onReload,
    });

    initModals();
    setupGanttDropZone();

    const toggleBtn = document.getElementById('toggle-jobs-btn');
    if (toggleBtn) toggleBtn.addEventListener('click', toggleJobsPanel);

    const jobsSearch = document.getElementById('jobs-search');
    if (jobsSearch) {
        jobsSearch.addEventListener('input', (e) => {
            jobsSearchTerm = e.target.value || '';
            renderJobsTable();
        });
    }

    const completedToggle = document.getElementById('show-completed-toggle');
    if (completedToggle) {
        completedToggle.addEventListener('change', (e) => {
            if (hasUnsavedChanges && !confirm('Kaydedilmemiş değişiklikler var. Devam edilsin mi?')) {
                e.target.checked = showCompleted;
                return;
            }
            showCompleted = e.target.checked;
            loadBoard();
        });
    }

    document.getElementById('save-btn').addEventListener('click', onSave);

    window.addEventListener('beforeunload', (e) => {
        if (hasUnsavedChanges) {
            e.preventDefault();
            e.returnValue = '';
        }
    });

    loadBoard();
}

document.addEventListener('DOMContentLoaded', init);
