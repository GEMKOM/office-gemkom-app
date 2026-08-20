// Kaynak Planlama — Excel-style multi-project tracking on REAL records.
//
// One tab ("sheet") per resource (taşeron / ekip). Each block is a real
// assignment; its rows are real department tasks: read-only info rows
// (Malzeme Tedarik, Talaşlı İmalat, Kesim), editable stages (Montaj,
// Kaynak ve Taşlama + custom), and the job's editable Boya task.
// Everything is edited in memory (workday-aware date↔duration sync) and
// committed with one bulk save.

import { guardRoute } from '../../../authService.js';
import { initRouteProtection } from '../../../apis/routeProtection.js';
import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { TableComponent } from '../../../components/table/table.js';
import { GanttChart } from '../../../components/gantt/gantt.js';
import { showNotification } from '../../../components/notification/notification.js';
import { EditModal } from '../../../components/edit-modal/edit-modal.js';
import { ConfirmationModal } from '../../../components/confirmation-modal/confirmation-modal.js';
import {
    getWeldingPlanningBoard,
    bulkSaveWeldingPlanning,
} from '../../../apis/welding/planning.js';
import { fetchPriceTiers } from '../../../apis/subcontracting/priceTiers.js';
import { createWorkdayCalendar, reconcileScheduleEdit } from '../../../utils/workdays.js';

// ---- constants -----------------------------------------------------------

const DEFAULT_STAGE_TITLES = ['Montaj', 'Kaynak ve Taşlama'];

const STATUS_META = {
    pending:     { label: 'Başlamadı',     badge: 'status-grey' },
    blocked:     { label: 'Engellendi',    badge: 'status-grey' },
    in_progress: { label: 'Devam Ediyor',  badge: 'status-blue' },
    completed:   { label: 'Tamamlandı',    badge: 'status-green' },
    on_hold:     { label: 'Beklemede',     badge: 'status-orange' },
    cancelled:   { label: 'İptal',         badge: 'status-grey' },
    skipped:     { label: 'Atlandı',       badge: 'status-grey' },
};

const EDITABLE_STATUS_OPTIONS = ['pending', 'in_progress', 'completed', 'on_hold', 'cancelled']
    .map(s => ({ value: s, label: STATUS_META[s].label }));

// ---- state ---------------------------------------------------------------

let board = null;                 // last raw server board
let calendar = createWorkdayCalendar([]);
let resources = [];               // [{resource_type, id, name, blocks: [BlockVM]}]
let weldingTasks = [];            // assignable jobs
let jobInfo = {};                 // job_no -> {material_supply, machining[], cutting[], painting}
let paintingByJob = {};           // job_no -> mutable painting VM (shared across tabs)

let snapBlocks = new Map();       // block.key -> {allocated_weight_kg, notes}
let snapPainting = new Map();     // job_no -> JSON snapshot
let dirtyBlocks = new Set();      // block.key
let dirtyPainting = new Set();    // job_no
let deletedBlocks = [];           // {assignment_type, assignment_id, resourceKey}

let activeResourceKey = null;     // 'team-3' / 'subcontractor-5'
let expandedByBlockKey = {};      // block.key -> bool
let jobsSearchTerm = '';
let showCompleted = false;
let showEmptyResources = false;   // empty-resource tabs tucked behind a toggle
let newCounter = 0;

let sheetTable = null;
let sheetRows = [];
let ganttChart = null;
let lastGanttRows = [];
let refreshTimer = null;

let blockModal = null;            // add job / edit weight
let tierModal = null;             // price tier picker (subcontractor)
let customStageModal = null;
let confirmModal = null;
let pendingNewBlock = null;       // waiting for tier selection
let blockModalMode = null;        // {mode: 'add'|'weight', blockRef?, prefillTaskId?}

// ---- helpers -------------------------------------------------------------

function esc(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function resourceKeyOf(res) { return `${res.resource_type}-${res.id}`; }

function fmtKg(n) {
    if (n === null || n === undefined || n === '') return '—';
    return Number(n).toLocaleString('tr-TR');
}

function fmtDate(dateStr) {
    if (!dateStr) return '—';
    const [y, m, d] = dateStr.split('-');
    return `${d}.${m}.${y}`;
}

function fmtDuration(wd) {
    if (wd === null || wd === undefined || wd === '') return '—';
    return `${Number(wd).toLocaleString('tr-TR')} g`;
}

function activeResource() {
    return resources.find(r => resourceKeyOf(r) === activeResourceKey) || null;
}

function findBlock(blockRef) {
    for (const res of resources) {
        const block = res.blocks.find(b => b.key === blockRef);
        if (block) return block;
    }
    return null;
}

function hasUnsavedChanges() {
    return dirtyBlocks.size > 0 || dirtyPainting.size > 0 || deletedBlocks.length > 0;
}

function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isRowOverdue(row) {
    return !!(row.end_date && row.end_date < todayStr()
        && !['completed', 'skipped', 'cancelled'].includes(row.status));
}

// ---- hydrate -------------------------------------------------------------

function stageVM(s) {
    return {
        cid: `s${s.id}`,
        id: s.id,
        title: s.title,
        is_default: !!s.is_default,
        weight: s.weight,
        status: s.status,
        progress: Number(s.progress ?? 0),
        duration_wd: s.duration_wd,
        start_date: s.start_date,
        end_date: s.end_date,
        note: s.note || '',
        deleted: false,
    };
}

function blockVM(b, res) {
    return {
        key: `${b.assignment_type}-${b.assignment_id}`,
        isNew: false,
        assignment_type: b.assignment_type,
        assignment_id: b.assignment_id,
        subtask_id: b.subtask_id,
        welding_task_id: b.welding_task_id,
        job_no: b.job_no,
        job_order_title: b.job_order_title,
        customer_name: b.customer_name,
        allocated_weight_kg: Number(b.allocated_weight_kg),
        is_billed: !!b.is_billed,
        price_tier: b.price_tier,
        notes: b.notes || '',
        subtask: {
            status: b.subtask.status,
            progress: Number(b.subtask.progress ?? 0),
            start_date: b.subtask.start_date,
            end_date: b.subtask.end_date,
            duration_wd: b.subtask.duration_wd,
        },
        stages: (b.stages || []).map(stageVM),
        createDefaultStages: false,
        deleted: false,
        resource_type: res.resource_type,
        resource_id: res.id,
    };
}

function hydrate(boardData) {
    board = boardData;
    calendar = createWorkdayCalendar(boardData.holidays || []);
    weldingTasks = boardData.welding_tasks || [];
    jobInfo = boardData.job_info || {};

    paintingByJob = {};
    snapPainting = new Map();
    Object.entries(jobInfo).forEach(([jobNo, info]) => {
        if (info.painting) {
            const p = info.painting;
            paintingByJob[jobNo] = {
                task_id: p.task_id,
                title: p.title || 'Boya',
                status: p.status,
                progress: Number(p.progress ?? 0),
                duration_wd: p.duration_wd,
                start_date: p.start_date,
                end_date: p.end_date,
                has_subtasks: !!p.has_subtasks,
            };
            snapPainting.set(jobNo, JSON.stringify(paintingByJob[jobNo]));
        }
    });

    resources = (boardData.resources || []).map(res => ({
        resource_type: res.resource_type,
        id: res.id,
        name: res.name,
        display_name: res.display_name || res.name,
        blocks: (res.blocks || []).map(b => blockVM(b, res)),
    }));

    snapBlocks = new Map();
    resources.forEach(res => res.blocks.forEach(b => {
        snapBlocks.set(b.key, {
            allocated_weight_kg: b.allocated_weight_kg,
            notes: b.notes,
        });
    }));

    dirtyBlocks = new Set();
    dirtyPainting = new Set();
    deletedBlocks = [];

    if (!activeResourceKey || !resources.some(r => resourceKeyOf(r) === activeResourceKey)) {
        activeResourceKey = resources.length ? resourceKeyOf(resources[0]) : null;
    }

    renderAll();
}

async function loadBoard() {
    try {
        const data = await getWeldingPlanningBoard(showCompleted);
        hydrate(data);
    } catch (e) {
        showNotification(e.message, 'error');
    }
}

// ---- dirty tracking ------------------------------------------------------

function markBlockDirty(blockRef) {
    dirtyBlocks.add(blockRef);
    updateSaveState();
}

function markPaintingDirty(jobNo) {
    dirtyPainting.add(jobNo);
    updateSaveState();
}

function updateSaveState() {
    const btn = document.getElementById('save-btn');
    if (btn) btn.disabled = !hasUnsavedChanges();
    renderTabs();
}

// kg assigned to a welding task across ALL resources in the working copy.
function allocatedForTask(weldingTaskId) {
    let total = 0;
    resources.forEach(res => res.blocks.forEach(b => {
        if (!b.deleted && b.welding_task_id === Number(weldingTaskId)) {
            total += Number(b.allocated_weight_kg || 0);
        }
    }));
    return total;
}

// ---- rendering: tabs, warnings, jobs list --------------------------------

function renderTabs() {
    const container = document.getElementById('resource-tabs');
    if (!container) return;
    // Custom tab class on purpose — navbar.css hijacks the global .nav-link
    // class with !important white text/backgrounds meant for the top navbar.
    const tabHTML = (res) => {
        const key = resourceKeyOf(res);
        const blockCount = res.blocks.filter(b => !b.deleted).length;
        const totalKg = res.blocks
            .filter(b => !b.deleted)
            .reduce((sum, b) => sum + Number(b.allocated_weight_kg || 0), 0);
        const dirty = res.blocks.some(b => dirtyBlocks.has(b.key))
            || deletedBlocks.some(d => d.resourceKey === key);
        const icon = res.resource_type === 'team' ? 'fa-users' : 'fa-industry';
        const classes = ['planning-tab'];
        if (key === activeResourceKey) classes.push('active');
        if (!blockCount) classes.push('empty');
        return `
            <button type="button" class="${classes.join(' ')}" data-resource-key="${esc(key)}"
                    title="${esc(res.name)}${blockCount ? ` — ${blockCount} iş, ${fmtKg(totalKg)} kg` : ' — atanmış iş yok'}">
                <i class="fas ${icon}"></i>
                <span class="tab-label">${esc(res.display_name || res.name)}</span>
                ${blockCount ? `<span class="resource-kg">${fmtKg(totalKg)} kg</span>` : ''}
                ${dirty ? '<span class="dirty-dot" title="Kaydedilmemiş değişiklik"></span>' : ''}
            </button>`;
    };

    const hasBlocks = (res) => res.blocks.some(b => !b.deleted);
    const filled = resources.filter(hasBlocks);
    // Empty resources stay reachable but don't eat rows of the strip; the
    // active one is always shown even when empty.
    const empty = resources.filter(res => !hasBlocks(res));
    const visibleEmpty = showEmptyResources
        ? empty
        : empty.filter(res => resourceKeyOf(res) === activeResourceKey);
    const hiddenCount = empty.length - visibleEmpty.length;

    container.innerHTML = [
        ...filled.map(tabHTML),
        ...visibleEmpty.map(tabHTML),
        ((hiddenCount > 0 || showEmptyResources) ? `
            <button type="button" class="planning-tab more-toggle" data-toggle-empty="1"
                    title="${showEmptyResources ? 'Boş kaynakları gizle' : 'Atanmış işi olmayan kaynakları göster'}">
                <i class="fas ${showEmptyResources ? 'fa-chevron-left' : 'fa-ellipsis'}"></i>
                ${showEmptyResources ? 'Gizle' : `+${hiddenCount} boş`}
            </button>` : ''),
    ].join('');
}

function renderWarnings() {
    const banner = document.getElementById('warnings-banner');
    if (!banner) return;
    const lines = [];
    weldingTasks.forEach(t => {
        if (t.total_weight_kg == null) return;
        const allocated = allocatedForTask(t.welding_task_id);
        if (allocated > Number(t.total_weight_kg)) {
            lines.push(`<li>${esc(t.job_no)}: atanan <strong>${fmtKg(allocated)} kg</strong> &gt; iş ağırlığı ${fmtKg(t.total_weight_kg)} kg</li>`);
        }
    });
    if (!lines.length) {
        banner.classList.add('d-none');
        banner.innerHTML = '';
        return;
    }
    banner.innerHTML = `<i class="fas fa-exclamation-triangle me-1"></i>Aşırı tahsis:<ul class="mb-0">${lines.join('')}</ul>`;
    banner.classList.remove('d-none');
}

function renderJobsList() {
    const container = document.getElementById('jobs-list-container');
    if (!container) return;

    const term = jobsSearchTerm.trim().toLocaleLowerCase('tr');
    const tasks = weldingTasks.filter(t => {
        if (!term) return true;
        return [t.job_no, t.job_order_title, t.customer_name]
            .some(v => (v || '').toString().toLocaleLowerCase('tr').includes(term));
    });

    if (!tasks.length) {
        container.innerHTML = `<div class="text-muted text-center py-4">Kaynak işi bulunamadı.</div>`;
        return;
    }

    container.innerHTML = tasks.map(t => {
        const hasWeight = t.total_weight_kg != null;
        const allocated = allocatedForTask(t.welding_task_id);
        const remaining = hasWeight ? Number(t.total_weight_kg) - allocated : null;
        const over = hasWeight && remaining < 0;
        const meta = `
            <div class="job-meta">
                <i class="fas fa-user me-1"></i>${esc(t.customer_name || '—')}
                ${hasWeight ? `&nbsp;·&nbsp;<i class="fas fa-weight-hanging me-1"></i>${fmtKg(t.total_weight_kg)} kg` : ''}
                &nbsp;·&nbsp;<i class="fas fa-flag-checkered me-1"></i>${fmtDate(t.target_completion_date)}
            </div>`;
        if (!hasWeight) {
            return `
                <div class="welding-job-card no-weight" draggable="false">
                    <div class="job-no">${esc(t.job_no || '')}</div>
                    <div class="job-title">${esc(t.job_order_title || '')}</div>
                    ${meta}
                    <div class="job-meta text-danger">
                        <i class="fas fa-exclamation-triangle me-1"></i>Ağırlık tanımlı değil — atama yapılamaz
                    </div>
                </div>`;
        }
        return `
            <div class="welding-job-card" draggable="true" data-task-id="${t.welding_task_id}">
                <div class="job-no">${esc(t.job_no || '')}</div>
                <div class="job-title">${esc(t.job_order_title || '')}</div>
                ${meta}
                <div class="job-meta ${over ? 'job-alloc over' : 'job-alloc'}">
                    <i class="fas fa-industry me-1"></i>Atanmış: ${fmtKg(allocated)} kg · Kalan: ${fmtKg(remaining)} kg
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

// ---- rendering: the sheet (grouped table) --------------------------------

function statusBadge(status, overdue) {
    const meta = STATUS_META[status] || STATUS_META.pending;
    let html = `<span class="status-badge ${meta.badge}">${meta.label}</span>`;
    if (overdue) {
        html += ` <span class="status-badge status-red" title="Bitiş tarihi geçti">Gecikmiş</span>`;
    }
    return html;
}

function progressBar(value) {
    const pct = Math.max(0, Math.min(100, Number(value ?? 0)));
    const color = pct >= 100 ? 'bg-success' : (pct > 0 ? 'bg-primary' : 'bg-secondary');
    return `
        <div class="mini-progress">
            <div class="progress"><div class="progress-bar ${color}" style="width:${pct}%"></div></div>
            <span class="small">${pct % 1 === 0 ? pct : pct.toFixed(1)}%</span>
        </div>`;
}

function buildSheetRows(res) {
    const rows = [];
    const visibleBlocks = res.blocks.filter(b => !b.deleted);

    visibleBlocks.forEach((b, idx) => {
        const groupKey = `${String(idx).padStart(3, '0')}|${b.key}`;
        const info = jobInfo[b.job_no] || {};
        const painting = paintingByJob[b.job_no] || null;

        const pushInfo = (item, label) => {
            if (!item) return;
            rows.push({
                key: `${b.key}-info-${item.task_id}`,
                blockKey: groupKey,
                blockRef: b.key,
                kind: 'info',
                title: label,
                start_date: item.start_date,
                end_date: item.end_date,
                duration_wd: item.duration_wd,
                weight: null,
                progress: item.progress,
                status: item.status,
                note: '',
            });
        };

        const machiningRows = info.machining || [];
        const cuttingRows = info.cutting || [];
        pushInfo(info.material_supply, 'Malzeme Tedarik');
        machiningRows.forEach(m => pushInfo(m, `Talaşlı İmalat${machiningRows.length > 1 ? ` — ${m.title}` : ''}`));
        cuttingRows.forEach(c => pushInfo(c, `Kesim${cuttingRows.length > 1 ? ` — ${c.title}` : ''}`));

        const visibleStages = b.stages.filter(s => !s.deleted);
        if (visibleStages.length) {
            visibleStages.forEach(s => {
                rows.push({
                    key: `${b.key}-stage-${s.cid}`,
                    blockKey: groupKey,
                    blockRef: b.key,
                    kind: 'stage',
                    stageCid: s.cid,
                    title: s.title,
                    is_default: s.is_default,
                    start_date: s.start_date,
                    end_date: s.end_date,
                    duration_wd: s.duration_wd,
                    weight: s.weight,
                    progress: s.progress,
                    status: s.status,
                    note: s.note,
                });
            });
        } else {
            rows.push({
                key: `${b.key}-subtask`,
                blockKey: groupKey,
                blockRef: b.key,
                kind: 'subtask',
                title: 'Kaynak İşi (aşamasız)',
                start_date: b.subtask.start_date,
                end_date: b.subtask.end_date,
                duration_wd: b.subtask.duration_wd,
                weight: null,
                progress: b.subtask.progress,
                status: b.subtask.status,
                note: b.notes,
            });
        }

        if (painting) {
            rows.push({
                key: `${b.key}-painting`,
                blockKey: groupKey,
                blockRef: b.key,
                kind: 'painting',
                job_no: b.job_no,
                title: 'Boya (iş emri geneli)',
                start_date: painting.start_date,
                end_date: painting.end_date,
                duration_wd: painting.duration_wd,
                weight: null,
                progress: painting.progress,
                status: painting.status,
                note: '',
            });
        }
    });

    return rows;
}

// Client mirror of the backend rollup for the block header.
function blockRollup(b) {
    const active = b.stages.filter(s => !s.deleted && !['skipped', 'cancelled'].includes(s.status));
    let progress;
    if (b.subtask.status === 'completed' || b.subtask.status === 'skipped') {
        progress = 100;
    } else if (active.length) {
        const totalW = active.reduce((s, x) => s + Number(x.weight || 0), 0);
        if (totalW > 0) {
            const leaf = (s) => s.status === 'completed' ? 100
                : (['pending', 'blocked', 'cancelled'].includes(s.status) ? 0
                    : Math.min(Number(s.progress || 0), 99));
            progress = Math.min(
                active.reduce((sum, s) => sum + leaf(s) * Number(s.weight || 0), 0) / totalW, 99);
        } else {
            progress = 0;
        }
    } else {
        progress = b.subtask.status === 'completed' ? 100 : Math.min(Number(b.subtask.progress || 0), 99);
    }

    const hasStages = b.stages.some(s => !s.deleted);
    const dated = hasStages
        ? b.stages.filter(s => !s.deleted && s.status !== 'cancelled')
        : [b.subtask];
    const starts = dated.map(s => s.start_date).filter(Boolean).sort();
    const ends = dated.map(s => s.end_date).filter(Boolean).sort();
    const windowStart = starts[0] || null;
    const windowEnd = ends[ends.length - 1] || null;
    const totalDays = windowStart && windowEnd
        ? calendar.workingDaysInclusive(windowStart, windowEnd) : null;

    let derived;
    if (b.subtask.status === 'completed' || b.subtask.status === 'skipped') {
        derived = 'completed';
    } else if (active.length) {
        const statuses = new Set(active.map(s => s.status));
        if ([...statuses].every(s => s === 'completed')) derived = 'completed';
        else if (statuses.has('in_progress') || statuses.has('completed')) derived = 'in_progress';
        else if (statuses.has('on_hold')) derived = 'on_hold';
        else derived = 'pending';
    } else {
        derived = b.subtask.status;
    }

    const overdue = !!(windowEnd && windowEnd < todayStr() && derived !== 'completed');
    return { progress, windowStart, windowEnd, totalDays, derived, overdue };
}

function blockHeaderHTML(b, groupValue) {
    const rollup = blockRollup(b);
    const hasStages = b.stages.some(s => !s.deleted);
    const weightLocked = b.is_billed;
    const pct = Math.round(rollup.progress);
    // The table's default group header draws the collapse chevron, but a
    // custom formatter must render its own; the row's own onclick toggles.
    const expanded = sheetTable?.groupExpandedState?.[groupValue] !== false;
    return `
        <div class="block-header" data-block-ref="${esc(b.key)}">
            <i class="fas ${expanded ? 'fa-chevron-down' : 'fa-chevron-right'} block-toggle-ico"
               title="${expanded ? 'Daralt' : 'Genişlet'}"></i>
            <span class="block-job">${esc(b.job_no || '')}${b.isNew ? ' <span class="badge bg-info">yeni</span>' : ''}</span>
            <span class="block-title" title="${esc(b.job_order_title || '')}">${esc(b.job_order_title || '')}</span>
            <span class="block-meta"><i class="fas fa-user me-1"></i>${esc(b.customer_name || '—')}</span>
            <span class="block-weight-chip ${weightLocked ? 'locked' : ''}" data-action="edit-weight"
                  title="${weightLocked ? 'Hakediş kesilmiş — ağırlık kilitli' : 'Ağırlığı düzenle'}">
                <i class="fas fa-weight-hanging me-1"></i>${fmtKg(b.allocated_weight_kg)} kg${weightLocked ? ' <i class="fas fa-lock ms-1"></i>' : ''}
            </span>
            <span class="block-meta">
                <i class="fas fa-calendar me-1"></i>${fmtDate(rollup.windowStart)} – ${fmtDate(rollup.windowEnd)}
                ${rollup.totalDays != null ? ` · ${fmtDuration(rollup.totalDays)}` : ''}
            </span>
            <span class="block-progress">
                <div class="progress"><div class="progress-bar ${pct >= 100 ? 'bg-success' : 'bg-primary'}" style="width:${Math.min(pct, 100)}%"></div></div>
                <span class="small">${pct}%</span>
            </span>
            ${statusBadge(rollup.derived, rollup.overdue)}
            <span class="block-actions">
                ${!hasStages ? `
                    <button class="btn btn-outline-primary" data-action="create-stages" title="Varsayılan aşamaları (Montaj, Kaynak ve Taşlama) oluştur">
                        <i class="fas fa-layer-group me-1"></i>Aşamaları oluştur
                    </button>` : `
                    <button class="btn btn-outline-secondary" data-action="add-custom" title="Özel aşama ekle">
                        <i class="fas fa-plus"></i>
                    </button>`}
                <button class="btn btn-outline-danger" data-action="delete-block"
                        ${b.is_billed ? 'disabled title="Hakediş kesilmiş — silinemez"' : 'title="Atamayı sil"'}>
                    <i class="fas fa-trash"></i>
                </button>
            </span>
        </div>`;
}

function titleCell(value, row) {
    if (row.kind === 'info') {
        return `<span class="stage-title"><i class="fas fa-circle-info custom-ico"></i>${esc(row.title)}</span>`;
    }
    if (row.kind === 'painting') {
        return `<span class="stage-title"><i class="fas fa-fill-drip custom-ico"></i>${esc(row.title)}</span>`;
    }
    if (row.kind === 'subtask') {
        return `<span class="stage-title"><i class="fas fa-fire custom-ico"></i>${esc(row.title)}</span>`;
    }
    const icon = row.is_default
        ? '<i class="fas fa-thumbtack default-ico" title="Varsayılan aşama — silinemez, süresiz/iptal edilebilir"></i>'
        : '<i class="fas fa-pen-ruler custom-ico" title="Özel aşama"></i>';
    return `<span class="stage-title">${icon}${esc(row.title)}</span>`;
}

function renderSheet() {
    const container = document.getElementById('sheet-container');
    if (!container) return;
    const res = activeResource();
    const totalKgEl = document.getElementById('sheet-total-kg');

    if (!res) {
        container.innerHTML = `<div class="empty-sheet">Kaynak (taşeron/ekip) bulunamadı.</div>`;
        if (totalKgEl) totalKgEl.textContent = '';
        sheetTable = null;
        return;
    }

    const totalKg = res.blocks.filter(b => !b.deleted)
        .reduce((sum, b) => sum + Number(b.allocated_weight_kg || 0), 0);
    if (totalKgEl) totalKgEl.textContent = `Toplam: ${fmtKg(totalKg)} kg`;

    sheetRows = buildSheetRows(res);

    if (!sheetRows.length) {
        container.innerHTML = `
            <div class="empty-sheet">
                <i class="fas fa-inbox fa-2x mb-2 d-block"></i>
                Bu kaynağa atanmış iş yok. "İş Ekle" ile başlayın veya işler listesinden sürükleyin.
            </div>`;
        sheetTable = null;
        return;
    }

    const blocksByRef = {};
    res.blocks.forEach(b => { blocksByRef[b.key] = b; });

    if (!sheetTable) {
        container.innerHTML = '';
        sheetTable = new TableComponent('sheet-container', {
            title: '',
            data: sheetRows,
            sortable: false,
            pagination: false,
            responsive: true,
            stickyHeader: true,
            groupBy: 'blockKey',
            groupCollapsible: true,
            groupHeaderFormatter: (groupValue) => {
                const blockRef = String(groupValue).split('|').slice(1).join('|');
                const block = findBlock(blockRef);
                return block ? blockHeaderHTML(block, String(groupValue)) : esc(groupValue);
            },
            editable: true,
            editableColumns: ['title', 'start_date', 'end_date', 'duration_wd', 'weight', 'progress', 'status', 'note'],
            isRowEditable: (row) => row.kind !== 'info',
            onEdit: onCellEdit,
            rowAttributes: (row) => {
                const classes = [];
                if (row.kind === 'info') classes.push('info-row');
                if (row.kind === 'painting') classes.push('painting-row');
                if (row.status === 'cancelled') classes.push('row-cancelled');
                return { class: classes.join(' '), 'data-row-ref': row.key };
            },
            columns: [
                { field: 'title', label: 'Aşama', formatter: (v, row) => titleCell(v, row) },
                { field: 'start_date', label: 'Başlangıç', type: 'date', width: '120px', formatter: (v) => fmtDate(v) },
                { field: 'end_date', label: 'Bitiş', type: 'date', width: '120px', formatter: (v) => fmtDate(v) },
                {
                    field: 'duration_wd', label: 'Süre (iş g.)', type: 'number',
                    min: 0, step: 0.5, width: '100px', formatter: (v) => fmtDuration(v),
                },
                {
                    field: 'weight', label: 'Ağırlık', type: 'number', min: 1, step: 1, width: '90px',
                    formatter: (v, row) => row.kind === 'stage' ? String(v ?? '') : '—',
                },
                {
                    field: 'progress', label: 'İlerleme', type: 'number', min: 0, max: 100, step: 1,
                    width: '140px', formatter: (v) => progressBar(v),
                },
                {
                    field: 'status', label: 'Durum', type: 'select', width: '150px',
                    options: EDITABLE_STATUS_OPTIONS,
                    formatter: (v, row) => statusBadge(v, isRowOverdue(row)),
                },
                {
                    field: 'note', label: 'Not', type: 'text',
                    formatter: (v) => v ? `<span class="stage-note">${esc(v)}</span>` : '<span class="text-muted">—</span>',
                },
            ],
            actions: [
                {
                    key: 'delete-stage',
                    icon: 'fas fa-trash',
                    class: 'btn-outline-danger',
                    title: 'Özel aşamayı sil',
                    visible: (row) => row.kind === 'stage' && !row.is_default,
                    onClick: (row) => onDeleteCustomStage(row),
                },
            ],
        });
    }

    // Re-seed collapse state (keys carry a position prefix that can shift).
    const expandedState = {};
    const seen = new Set();
    sheetRows.forEach(row => {
        if (seen.has(row.blockKey)) return;
        seen.add(row.blockKey);
        const blockRef = row.blockRef;
        expandedState[row.blockKey] = expandedByBlockKey[blockRef] !== false;
    });
    sheetTable.groupExpandedState = expandedState;
    sheetTable.updateData(sheetRows);
}

function bindSheetHeaderActions(container) {
    if (container.dataset.headerActionsBound) return;
    container.dataset.headerActionsBound = '1';
    // Capture phase: the group-header TR carries an inline onclick that toggles
    // collapse — stopPropagation here must run BEFORE that inline handler.
    container.addEventListener('click', (e) => {
        const actionEl = e.target.closest('[data-action]');
        if (!actionEl || actionEl.disabled) return;
        const header = actionEl.closest('.block-header');
        if (!header) return;
        e.preventDefault();
        e.stopPropagation();
        const blockRef = header.dataset.blockRef;
        const action = actionEl.dataset.action;
        if (action === 'edit-weight') onEditWeight(blockRef);
        else if (action === 'create-stages') onCreateStages(blockRef);
        else if (action === 'add-custom') onAddCustomStage(blockRef);
        else if (action === 'delete-block') onDeleteBlock(blockRef);
    }, true);

    // Track collapse toggles so tab switches / refreshes keep the state.
    container.addEventListener('toggleGroup', (e) => {
        const groupKey = e.detail?.groupKey;
        if (!groupKey) return;
        const blockRef = String(groupKey).split('|').slice(1).join('|');
        // The table flips state after this event; mirror it.
        setTimeout(() => {
            if (sheetTable) expandedByBlockKey[blockRef] = !!sheetTable.groupExpandedState[groupKey];
        }, 0);
    });
}

// Deferred refresh: rebuild rows + gantt after in-place VM edits.
function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
        renderSheet();
        renderWarnings();
        renderGantt();
        renderJobsList();
    }, 0);
}

// ---- inline editing ------------------------------------------------------

function onCellEdit(row, field, newValue) {
    const block = findBlock(row.blockRef);
    if (!block) return;

    let target = null;
    if (row.kind === 'stage') {
        target = block.stages.find(s => s.cid === row.stageCid);
    } else if (row.kind === 'subtask') {
        target = block.subtask;
    } else if (row.kind === 'painting') {
        target = paintingByJob[row.job_no];
    }
    if (!target) return;

    const markDirty = () => {
        if (row.kind === 'painting') markPaintingDirty(row.job_no);
        else markBlockDirty(block.key);
    };

    if (field === 'title') {
        if (row.kind !== 'stage' || row.is_default) {
            throw new Error('Yalnızca özel aşamaların adı değiştirilebilir.');
        }
        const title = String(newValue || '').trim();
        if (!title) throw new Error('Aşama adı boş olamaz.');
        target.title = title;
        row.title = title;
    } else if (field === 'weight') {
        if (row.kind !== 'stage') {
            throw new Error('Ağırlık yalnızca aşamalarda düzenlenebilir.');
        }
        const weight = parseInt(newValue, 10);
        if (!Number.isFinite(weight) || weight < 1) {
            throw new Error('Ağırlık 1 veya daha büyük bir tam sayı olmalıdır.');
        }
        target.weight = weight;
        row.weight = weight;
    } else if (field === 'progress') {
        if (row.kind === 'painting' && target.has_subtasks) {
            throw new Error('Boya görevinin ilerlemesi alt görevlerinden hesaplanır.');
        }
        const progress = Number(newValue);
        if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
            throw new Error('İlerleme 0 ile 100 arasında olmalıdır.');
        }
        target.progress = progress;
        row.progress = progress;
    } else if (field === 'status') {
        const status = String(newValue);
        if (!STATUS_META[status]) throw new Error('Geçersiz durum.');
        target.status = status;
        if (status === 'completed') target.progress = 100;
        row.status = status;
    } else if (field === 'note') {
        if (row.kind === 'stage') {
            target.note = String(newValue || '');
        } else if (row.kind === 'subtask') {
            block.notes = String(newValue || '');
        } else {
            throw new Error('Bu satırda not düzenlenemez.');
        }
        row.note = String(newValue || '');
    } else if (field === 'start_date' || field === 'end_date' || field === 'duration_wd') {
        const current = {
            duration_wd: target.duration_wd != null ? Number(target.duration_wd) : null,
            start_date: target.start_date || null,
            end_date: target.end_date || null,
        };
        const editedField = field === 'duration_wd' ? 'duration' : (field === 'start_date' ? 'start' : 'end');
        if (field === 'duration_wd') {
            const raw = String(newValue ?? '').trim();
            current.duration_wd = raw === '' ? null : Number(raw);
            if (current.duration_wd != null && (!Number.isFinite(current.duration_wd) || current.duration_wd < 0)) {
                throw new Error('Süre 0 veya daha büyük olmalıdır.');
            }
        } else {
            current[field] = newValue || null;
        }

        // Duration 0 on a DEFAULT stage = cancel (Excel's "0 gün" convention).
        if (row.kind === 'stage' && row.is_default && field === 'duration_wd' && current.duration_wd === 0) {
            target.duration_wd = 0;
            target.start_date = null;
            target.end_date = null;
            target.status = 'cancelled';
            Object.assign(row, {
                duration_wd: 0, start_date: null, end_date: null, status: 'cancelled',
            });
            markDirty();
            scheduleRefresh();
            return;
        }

        const result = reconcileScheduleEdit(editedField, current, calendar);
        if (result.error) throw new Error(result.error);

        target.duration_wd = result.duration_wd;
        target.start_date = result.start_date;
        target.end_date = result.end_date;
        // Re-activate a cancelled default stage when it gets duration again.
        if (row.kind === 'stage' && target.status === 'cancelled'
            && ((result.duration_wd && result.duration_wd > 0) || result.start_date)) {
            target.status = 'pending';
        }
        Object.assign(row, {
            duration_wd: result.duration_wd,
            start_date: result.start_date,
            end_date: result.end_date,
            status: target.status ?? row.status,
        });
    } else {
        return;
    }

    markDirty();
    scheduleRefresh();
}

// ---- block-level actions -------------------------------------------------

function onCreateStages(blockRef) {
    const block = findBlock(blockRef);
    if (!block) return;
    const seed = Number(block.subtask.progress || 0);
    DEFAULT_STAGE_TITLES.forEach(title => {
        if (block.stages.some(s => !s.deleted && s.title === title)) return;
        block.stages.push({
            cid: `new-${++newCounter}`,
            id: null,
            title,
            is_default: true,
            weight: 10,
            status: seed > 0 ? 'in_progress' : 'pending',
            progress: seed,
            duration_wd: null,
            start_date: null,
            end_date: null,
            note: '',
            deleted: false,
        });
    });
    block.createDefaultStages = true;
    markBlockDirty(block.key);
    scheduleRefresh();
}

function onAddCustomStage(blockRef) {
    const block = findBlock(blockRef);
    if (!block) return;
    customStageModal.clearAll();
    customStageModal.addSection({
        title: 'Özel Aşama',
        icon: 'fas fa-pen-ruler',
        iconColor: 'text-primary',
        fields: [
            {
                id: 'title', name: 'title', label: 'Aşama Adı', type: 'text',
                required: true, colSize: 12, placeholder: 'örn. Final Machinery',
            },
            {
                id: 'weight', name: 'weight', label: 'Ağırlık (katkı payı)', type: 'number',
                min: 1, step: 1, value: 10, colSize: 12,
                help: 'Bloğun ilerlemesine katkı ağırlığı (kg değil).',
            },
        ],
    });
    customStageModal.onSaveCallback((formData) => {
        const title = String(formData.title || '').trim();
        if (!title) {
            showNotification('Aşama adı zorunludur.', 'error');
            return;
        }
        if (block.stages.some(s => !s.deleted && s.title === title)) {
            showNotification('Bu adla bir aşama zaten var.', 'error');
            return;
        }
        block.stages.push({
            cid: `new-${++newCounter}`,
            id: null,
            title,
            is_default: false,
            weight: Math.max(1, parseInt(formData.weight, 10) || 10),
            status: 'pending',
            progress: 0,
            duration_wd: null,
            start_date: null,
            end_date: null,
            note: '',
            deleted: false,
        });
        markBlockDirty(block.key);
        customStageModal.hide();
        scheduleRefresh();
    });
    customStageModal.render();
    customStageModal.show();
}

function onDeleteCustomStage(row) {
    const block = findBlock(row.blockRef);
    if (!block) return;
    const stage = block.stages.find(s => s.cid === row.stageCid);
    if (!stage || stage.is_default) return;
    confirmModal.show({
        title: 'Aşama Sil',
        message: `"${stage.title}" aşamasını silmek istediğinize emin misiniz?`,
        confirmText: 'Sil',
        onConfirm: () => {
            if (stage.id == null) {
                block.stages = block.stages.filter(s => s.cid !== stage.cid);
            } else {
                stage.deleted = true;
            }
            markBlockDirty(block.key);
            scheduleRefresh();
        },
    });
}

function onDeleteBlock(blockRef) {
    const block = findBlock(blockRef);
    if (!block) return;
    if (block.is_billed) {
        showNotification('Hakediş kesilmiş atama silinemez.', 'error');
        return;
    }
    confirmModal.show({
        title: 'Atama Sil',
        message: `${block.job_no} — ${fmtKg(block.allocated_weight_kg)} kg atamasını silmek istediğinize emin misiniz?`,
        description: 'Atama, kaynak alt görevi ve tüm aşamaları birlikte silinir.',
        confirmText: 'Sil',
        onConfirm: () => {
            const res = resources.find(r =>
                r.resource_type === block.resource_type && r.id === block.resource_id);
            if (block.isNew) {
                if (res) res.blocks = res.blocks.filter(b => b.key !== block.key);
                dirtyBlocks.delete(block.key);
            } else {
                block.deleted = true;
                dirtyBlocks.delete(block.key);
                deletedBlocks.push({
                    assignment_type: block.assignment_type,
                    assignment_id: block.assignment_id,
                    resourceKey: res ? resourceKeyOf(res) : activeResourceKey,
                });
            }
            updateSaveState();
            scheduleRefresh();
        },
    });
}

// ---- add job / edit weight modals ---------------------------------------

function weldingTaskOptions() {
    return weldingTasks
        .filter(t => t.total_weight_kg != null)
        .map(t => {
            const remaining = Number(t.total_weight_kg) - allocatedForTask(t.welding_task_id);
            return {
                value: String(t.welding_task_id),
                label: `${t.job_no} — ${t.job_order_title || ''} (kalan ~${fmtKg(remaining)} kg)`,
            };
        });
}

function openAddJobModal(prefillTaskId = null) {
    const res = activeResource();
    if (!res) return;
    blockModalMode = { mode: 'add', prefillTaskId };

    const options = weldingTaskOptions();
    if (!options.length) {
        showNotification('Atanabilir kaynak işi bulunamadı (işlerin toplam ağırlığı tanımlı olmalı).', 'error');
        return;
    }
    const isSub = res.resource_type === 'subcontractor';
    const prefillTask = prefillTaskId != null
        ? weldingTasks.find(t => t.welding_task_id === Number(prefillTaskId)) : null;
    const defaultTaskId = prefillTask ? String(prefillTask.welding_task_id) : options[0].value;
    const defaultTask = weldingTasks.find(t => String(t.welding_task_id) === defaultTaskId);
    const defaultRemaining = defaultTask
        ? Number(defaultTask.total_weight_kg) - allocatedForTask(defaultTask.welding_task_id) : '';

    blockModal.clearAll();
    blockModal.setTitle(`İş Ekle — ${res.display_name || res.name}`);
    blockModal.setIcon('fas fa-plus-circle');
    blockModal.setSaveButtonText(isSub ? 'Devam (Fiyat Kademesi)' : 'Ekle');
    blockModal.addSection({
        title: 'Atama',
        icon: 'fas fa-fire',
        iconColor: 'text-danger',
        fields: [
            {
                id: 'welding_task_id', name: 'welding_task_id',
                label: 'Kaynak Görevi (İş No)', type: 'dropdown', required: true,
                searchable: true, icon: 'fas fa-tasks', colSize: 12,
                options, value: defaultTaskId,
            },
            {
                id: 'allocated_weight_kg', name: 'allocated_weight_kg',
                label: 'Ağırlık (kg)', type: 'number', required: true,
                min: 0.01, step: 0.01, icon: 'fas fa-weight-hanging', colSize: 12,
                value: defaultRemaining > 0 ? defaultRemaining : '',
                help: 'Bu ekibin/taşeronun yapacağı ekipman ağırlığı.',
            },
            {
                id: 'notes', name: 'notes', label: 'Not', type: 'textarea',
                rows: 2, icon: 'fas fa-sticky-note', colSize: 12, value: '',
            },
        ],
    });
    blockModal.onSaveCallback(onBlockModalSave);
    blockModal.render();
    blockModal.show();
}

function onEditWeight(blockRef) {
    const block = findBlock(blockRef);
    if (!block) return;
    if (block.is_billed) {
        showNotification('Hakediş kesilmiş atamanın ağırlığı değiştirilemez.', 'error');
        return;
    }
    blockModalMode = { mode: 'weight', blockRef };
    const task = weldingTasks.find(t => t.welding_task_id === block.welding_task_id);
    const total = task && task.total_weight_kg != null ? Number(task.total_weight_kg) : null;
    const allocated = allocatedForTask(block.welding_task_id);
    const assignable = total != null ? total - (allocated - Number(block.allocated_weight_kg || 0)) : null;

    blockModal.clearAll();
    blockModal.setTitle(`Ağırlık — ${block.job_no}`);
    blockModal.setIcon('fas fa-weight-hanging');
    blockModal.setSaveButtonText('Uygula');
    blockModal.addSection({
        title: 'Ağırlık',
        icon: 'fas fa-balance-scale',
        iconColor: 'text-primary',
        fields: [
            {
                id: 'allocated_weight_kg', name: 'allocated_weight_kg',
                label: 'Ağırlık (kg)', type: 'number', required: true,
                min: 0.01, step: 0.01, colSize: 12,
                value: block.allocated_weight_kg,
                help: assignable != null ? `Atanabilir üst sınır: ~${fmtKg(assignable)} kg` : '',
            },
            ...(block.assignment_type === 'internal_team' ? [{
                id: 'notes', name: 'notes', label: 'Not', type: 'textarea',
                rows: 2, colSize: 12, value: block.notes || '',
            }] : []),
        ],
    });
    blockModal.onSaveCallback(onBlockModalSave);
    blockModal.render();
    blockModal.show();
}

async function onBlockModalSave(formData) {
    const mode = blockModalMode;
    if (!mode) return;

    if (mode.mode === 'weight') {
        const block = findBlock(mode.blockRef);
        if (!block) { blockModal.hide(); return; }
        const weight = Number(formData.allocated_weight_kg);
        if (!Number.isFinite(weight) || weight <= 0) {
            showNotification('Geçerli bir ağırlık girin.', 'error');
            return;
        }
        block.allocated_weight_kg = weight;
        if ('notes' in formData) block.notes = formData.notes || '';
        markBlockDirty(block.key);
        blockModal.hide();
        scheduleRefresh();
        return;
    }

    // mode === 'add'
    const res = activeResource();
    if (!res) { blockModal.hide(); return; }
    const weldingTaskId = Number(formData.welding_task_id || mode.prefillTaskId);
    const weight = Number(formData.allocated_weight_kg);
    const task = weldingTasks.find(t => t.welding_task_id === weldingTaskId);
    if (!task || !Number.isFinite(weight) || weight <= 0) {
        showNotification('Görev ve geçerli bir ağırlık zorunludur.', 'error');
        return;
    }

    const draft = {
        resource: res,
        welding_task: task,
        allocated_weight_kg: weight,
        notes: formData.notes || '',
        price_tier: null,
    };

    if (res.resource_type === 'subcontractor') {
        // Tier is mandatory for subcontractor assignments — pick it now.
        blockModal.hide();
        pendingNewBlock = draft;
        await openTierModal(draft);
        return;
    }

    blockModal.hide();
    pushNewBlock(draft);
}

async function openTierModal(draft) {
    try {
        const tiersResp = await fetchPriceTiers({ job_order: draft.welding_task.job_no, ordering: 'name' });
        const tiers = (tiersResp.results || tiersResp || [])
            .filter(t => t.tier_type === 'welding')
            .map(t => ({
                value: String(t.id),
                label: `${t.name} — ${t.price_per_kg} ${t.currency}/kg (kalan ${t.remaining_weight_kg} kg)`,
            }));
        if (!tiers.length) {
            showNotification('Bu iş için kaynak fiyat kademesi bulunamadı. Önce planlamadan fiyat kademesi tanımlayın.', 'error');
            pendingNewBlock = null;
            return;
        }
        tierModal.clearAll();
        tierModal.addSection({
            title: 'Fiyat Kademesi',
            icon: 'fas fa-tags',
            iconColor: 'text-success',
            fields: [{
                id: 'price_tier', name: 'price_tier', label: 'Fiyat Kademesi',
                type: 'dropdown', required: true, searchable: true,
                icon: 'fas fa-tag', colSize: 12,
                help: 'Taşeron ataması hakedişe dahildir; fiyat kademesi zorunludur.',
                options: tiers, value: tiers[0].value,
            }],
        });
        tierModal.onSaveCallback((formData) => {
            const tierId = Number(formData.price_tier);
            if (!tierId) {
                showNotification('Fiyat kademesi seçin.', 'error');
                return;
            }
            draft.price_tier = tierId;
            tierModal.hide();
            pendingNewBlock = null;
            pushNewBlock(draft);
        });
        tierModal.render();
        tierModal.show();
    } catch (e) {
        pendingNewBlock = null;
        showNotification(e.message, 'error');
    }
}

function pushNewBlock(draft) {
    const res = draft.resource;
    const key = `new-${++newCounter}`;
    const block = {
        key,
        isNew: true,
        assignment_type: res.resource_type === 'team' ? 'internal_team' : 'subcontracting',
        assignment_id: null,
        subtask_id: null,
        welding_task_id: draft.welding_task.welding_task_id,
        job_no: draft.welding_task.job_no,
        job_order_title: draft.welding_task.job_order_title,
        customer_name: draft.welding_task.customer_name,
        allocated_weight_kg: draft.allocated_weight_kg,
        is_billed: false,
        price_tier: draft.price_tier ? { id: draft.price_tier } : null,
        notes: draft.notes,
        subtask: { status: 'in_progress', progress: 0, start_date: null, end_date: null, duration_wd: null },
        stages: DEFAULT_STAGE_TITLES.map(title => ({
            cid: `new-${++newCounter}`,
            id: null,
            title,
            is_default: true,
            weight: 10,
            status: 'pending',
            progress: 0,
            duration_wd: null,
            start_date: null,
            end_date: null,
            note: '',
            deleted: false,
        })),
        createDefaultStages: false,   // server creates them for new blocks anyway
        deleted: false,
        resource_type: res.resource_type,
        resource_id: res.id,
    };
    res.blocks.push(block);
    expandedByBlockKey[key] = true;
    markBlockDirty(key);
    scheduleRefresh();
    showNotification('Blok eklendi — Kaydet ile kalıcılaşır.', 'info');
}

// ---- gantt ---------------------------------------------------------------

function dateToMs(dateStr) {
    if (!dateStr) return null;
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).getTime();
}

function ganttStatus(status, overdue) {
    if (status === 'completed' || status === 'skipped') return 'completed';
    if (overdue) return 'delayed';
    if (status === 'on_hold') return 'on-hold';
    return 'in-progress';
}

function renderGantt() {
    const res = activeResource();
    const rows = [];

    if (res) {
        res.blocks.filter(b => !b.deleted).forEach(b => {
            rows.push({
                is_group: true,
                id: `group-${b.key}`,
                group_id: b.key,
                ti_number: b.job_no || '',
                title: `${b.job_order_title || ''} — ${fmtKg(b.allocated_weight_kg)} kg`,
            });
            const visibleStages = b.stages.filter(s => !s.deleted && s.status !== 'cancelled');
            if (visibleStages.length) {
                visibleStages.forEach(s => {
                    if (!s.start_date && !s.end_date) return;
                    const overdue = !!(s.end_date && s.end_date < todayStr()
                        && !['completed', 'skipped'].includes(s.status));
                    rows.push({
                        id: `${b.key}-${s.cid}`,
                        group_id: b.key,
                        ti_number: s.title,
                        title: `${b.job_no} · %${Math.round(s.progress || 0)}`,
                        planned_start_ms: dateToMs(s.start_date || s.end_date),
                        planned_end_ms: dateToMs(s.end_date || s.start_date),
                        progress_percentage: Number(s.progress || 0),
                        status: ganttStatus(s.status, overdue),
                        is_overdue: overdue,
                        _rowRef: `${b.key}-stage-${s.cid}`,
                    });
                });
            } else if (b.subtask.start_date || b.subtask.end_date) {
                const overdue = !!(b.subtask.end_date && b.subtask.end_date < todayStr()
                    && !['completed', 'skipped'].includes(b.subtask.status));
                rows.push({
                    id: `${b.key}-subtask`,
                    group_id: b.key,
                    ti_number: 'Kaynak İşi',
                    title: `${b.job_no} · %${Math.round(b.subtask.progress || 0)}`,
                    planned_start_ms: dateToMs(b.subtask.start_date || b.subtask.end_date),
                    planned_end_ms: dateToMs(b.subtask.end_date || b.subtask.start_date),
                    progress_percentage: Number(b.subtask.progress || 0),
                    status: ganttStatus(b.subtask.status, overdue),
                    is_overdue: overdue,
                    _rowRef: `${b.key}-subtask`,
                });
            }
            const painting = paintingByJob[b.job_no];
            if (painting && (painting.start_date || painting.end_date)) {
                const overdue = !!(painting.end_date && painting.end_date < todayStr()
                    && !['completed', 'skipped'].includes(painting.status));
                rows.push({
                    id: `${b.key}-painting`,
                    group_id: b.key,
                    ti_number: 'Boya',
                    title: `${b.job_no} (iş emri geneli)`,
                    planned_start_ms: dateToMs(painting.start_date || painting.end_date),
                    planned_end_ms: dateToMs(painting.end_date || painting.start_date),
                    progress_percentage: Number(painting.progress || 0),
                    status: ganttStatus(painting.status, overdue),
                    is_overdue: overdue,
                    _rowRef: `${b.key}-painting`,
                });
            }
        });
    }

    if (!ganttChart) {
        ganttChart = new GanttChart('gantt-container', {
            title: 'Kaynak Planı',
            defaultPeriod: 'month',
            availableViews: ['week', 'month', 'year'],
            filterByWorkingDays: false,
            showCurrentTime: true,
            isNonWorkingDay: (dateStr) => calendar.isNonWorkingDay(dateStr),
            onTaskClick: (task) => {
                if (task && task._rowRef) scrollToSheetRow(task._rowRef);
            },
        });
        // Columns are measured from .gantt-scrolling-column, which only exists
        // after the first render — re-render once on the next frame.
        requestAnimationFrame(() => { if (ganttChart) ganttChart.setTasks(lastGanttRows); });
    }
    lastGanttRows = rows;
    ganttChart.setTasks(rows);
}

function scrollToSheetRow(rowRef) {
    const tr = document.querySelector(`#sheet-container tr[data-row-ref="${CSS.escape(rowRef)}"]`);
    if (!tr) return;
    tr.scrollIntoView({ behavior: 'smooth', block: 'center' });
    tr.classList.remove('row-flash');
    void tr.offsetWidth;
    tr.classList.add('row-flash');
}

// ---- save ----------------------------------------------------------------

function stagePayload(s) {
    const item = {
        title: s.title,
        weight: s.weight,
        status: s.status,
        progress: s.progress,
        note: s.note || '',
        duration_wd: s.duration_wd,
        start_date: s.start_date,
        end_date: s.end_date,
    };
    if (s.id != null) item.id = s.id;
    return item;
}

function buildPayload() {
    const payload = { new_blocks: [], blocks: [], deleted_blocks: [], painting_tasks: [] };

    deletedBlocks.forEach(d => payload.deleted_blocks.push({
        assignment_type: d.assignment_type,
        assignment_id: d.assignment_id,
    }));

    resources.forEach(res => res.blocks.forEach(b => {
        if (b.deleted) return;
        if (b.isNew) {
            payload.new_blocks.push({
                resource_type: res.resource_type,
                resource_id: res.id,
                welding_task_id: b.welding_task_id,
                allocated_weight_kg: b.allocated_weight_kg,
                ...(b.price_tier ? { price_tier: b.price_tier.id } : {}),
                notes: b.notes || '',
                stages: b.stages.filter(s => !s.deleted).map(stagePayload),
            });
            return;
        }
        if (!dirtyBlocks.has(b.key)) return;

        const snap = snapBlocks.get(b.key) || {};
        const item = { assignment_type: b.assignment_type, assignment_id: b.assignment_id };
        if (Number(snap.allocated_weight_kg) !== Number(b.allocated_weight_kg)) {
            item.allocated_weight_kg = b.allocated_weight_kg;
        }
        if ((snap.notes || '') !== (b.notes || '') && b.assignment_type === 'internal_team') {
            item.notes = b.notes || '';
        }
        if (b.createDefaultStages) item.create_default_stages = true;

        const hasStages = b.stages.some(s => !s.deleted);
        const stageItems = [];
        b.stages.forEach(s => {
            if (s.deleted) {
                if (s.id != null) stageItems.push({ id: s.id, deleted: true });
                return;
            }
            stageItems.push(stagePayload(s));
        });
        if (stageItems.length) item.stages = stageItems;

        if (!hasStages) {
            item.subtask_schedule = {
                status: b.subtask.status,
                progress: b.subtask.progress,
                duration_wd: b.subtask.duration_wd,
                start_date: b.subtask.start_date,
                end_date: b.subtask.end_date,
            };
        }
        payload.blocks.push(item);
    }));

    dirtyPainting.forEach(jobNo => {
        const p = paintingByJob[jobNo];
        if (!p) return;
        const item = {
            task_id: p.task_id,
            status: p.status,
            duration_wd: p.duration_wd,
            start_date: p.start_date,
            end_date: p.end_date,
        };
        if (!p.has_subtasks) item.progress = p.progress;
        payload.painting_tasks.push(item);
    });

    return payload;
}

async function onSave() {
    if (!hasUnsavedChanges()) {
        showNotification('Kaydedilecek değişiklik yok.', 'info');
        return;
    }
    const btn = document.getElementById('save-btn');
    if (btn) btn.disabled = true;
    try {
        const resp = await bulkSaveWeldingPlanning(buildPayload());
        showNotification('Plan kaydedildi.', 'success');
        hydrate(resp.board);
    } catch (e) {
        if (btn) btn.disabled = false;
        showNotification(e.message, 'error');
    }
}

// ---- init ----------------------------------------------------------------

function renderAll() {
    renderTabs();
    renderWarnings();
    renderSheet();
    renderGantt();
    renderJobsList();
    updateSaveState();
}

function switchResource(key) {
    if (key === activeResourceKey) return;
    activeResourceKey = key;
    // The container element (and its once-bound delegated listeners) stays;
    // only the table instance is rebuilt for the new resource.
    sheetTable = null;
    const container = document.getElementById('sheet-container');
    if (container) container.innerHTML = '';
    renderTabs();
    renderSheet();
    renderGantt();
}

function setupDropZone() {
    const zone = document.getElementById('sheet-container');
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
        const offcanvasEl = document.getElementById('jobs-offcanvas');
        const offcanvas = offcanvasEl ? bootstrap.Offcanvas.getInstance(offcanvasEl) : null;
        if (offcanvas) offcanvas.hide();
        openAddJobModal(taskId);
    });
}

function init() {
    if (!guardRoute()) return;
    if (!initRouteProtection()) return;

    initNavbar();

    new HeaderComponent({
        title: 'Kaynak Planlama',
        subtitle: 'Taşeron ve ekip bazında iş takibi — aşamalar, süreler ve ilerleme',
        icon: 'fire',
        containerId: 'header-placeholder',
        showBackButton: 'block',
        showRefreshButton: 'block',
        refreshButtonText: 'Yenile',
        backUrl: '/manufacturing/welding/',
        onRefreshClick: () => {
            if (hasUnsavedChanges() && !confirm('Kaydedilmemiş değişiklikler var. Yenilemek istediğinize emin misiniz?')) {
                return;
            }
            loadBoard();
        },
    });

    blockModal = new EditModal('block-modal-container', {
        title: 'İş Ekle', icon: 'fas fa-plus-circle', saveButtonText: 'Ekle', size: 'md',
    });
    tierModal = new EditModal('tier-modal-container', {
        title: 'Fiyat Kademesi', icon: 'fas fa-tags', saveButtonText: 'Ekle', size: 'md',
    });
    customStageModal = new EditModal('custom-stage-modal-container', {
        title: 'Özel Aşama Ekle', icon: 'fas fa-pen-ruler', saveButtonText: 'Ekle', size: 'md',
    });
    confirmModal = new ConfirmationModal('confirm-modal-container', {
        title: 'Onay', icon: 'fas fa-exclamation-triangle',
        confirmText: 'Sil', cancelText: 'İptal', confirmButtonClass: 'btn-danger',
    });

    document.getElementById('resource-tabs').addEventListener('click', (e) => {
        if (e.target.closest('[data-toggle-empty]')) {
            showEmptyResources = !showEmptyResources;
            renderTabs();
            return;
        }
        const tab = e.target.closest('[data-resource-key]');
        if (tab) switchResource(tab.dataset.resourceKey);
    });
    document.getElementById('save-btn').addEventListener('click', onSave);
    document.getElementById('add-job-btn').addEventListener('click', () => openAddJobModal());
    document.getElementById('open-jobs-btn').addEventListener('click', () => {
        const el = document.getElementById('jobs-offcanvas');
        bootstrap.Offcanvas.getOrCreateInstance(el).show();
    });

    const jobsSearch = document.getElementById('jobs-search');
    if (jobsSearch) {
        jobsSearch.addEventListener('input', (e) => {
            jobsSearchTerm = e.target.value || '';
            renderJobsList();
        });
    }
    const completedToggle = document.getElementById('show-completed-toggle');
    if (completedToggle) {
        completedToggle.addEventListener('change', (e) => {
            if (hasUnsavedChanges() && !confirm('Kaydedilmemiş değişiklikler var. Devam edilsin mi?')) {
                e.target.checked = showCompleted;
                return;
            }
            showCompleted = e.target.checked;
            loadBoard();
        });
    }

    setupDropZone();
    bindSheetHeaderActions(document.getElementById('sheet-container'));

    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => { if (ganttChart) ganttChart.setTasks(lastGanttRows); }, 150);
    });

    window.addEventListener('beforeunload', (e) => {
        if (hasUnsavedChanges()) {
            e.preventDefault();
            e.returnValue = '';
        }
    });

    loadBoard();
}

document.addEventListener('DOMContentLoaded', init);
