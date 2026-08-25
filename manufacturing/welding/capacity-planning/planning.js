// İmalat Planlama — Excel-style multi-project tracking on REAL records.
//
// One tab ("sheet") per resource (taşeron / ekip), grouped by JOB ORDER. Each
// group is the job's manufacturing main task, and under it sit its real
// children: Talaşlı İmalat, the welding assignments for this resource with
// their stages (Montaj, Kaynak ve Taşlama + custom), and Boya. Malzeme Tedarik
// and Kesim belong to other departments and show as read-only context.
// Everything is edited in memory (workday-aware date↔duration sync) and
// committed with one bulk save.

import { guardRoute } from '../../../authService.js';
import { initRouteProtection } from '../../../apis/routeProtection.js';
import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { PlanningGrid } from './grid.js';
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

// Editing any one of these reconciles all three, so they travel together.
const SCHEDULE_FIELDS = ['start_date', 'end_date', 'duration_wd'];

// ---- state ---------------------------------------------------------------

let board = null;                 // last raw server board
let calendar = createWorkdayCalendar([]);
let resources = [];               // [{resource_type, id, name, blocks: [BlockVM]}]
let weldingTasks = [];            // assignable jobs
let jobInfo = {};                 // job_no -> {material_supply, machining[], cutting[], painting}
let deptByJob = {};               // job_no -> {manufacturing, welding, painting} VMs
let machiningByJob = {};          // job_no -> Talaşlı İmalat VM (weight only)

let snapBlocks = new Map();       // block.key -> {allocated_weight_kg, notes}
let dirtyBlocks = new Set();      // block.key
let dirtyDept = new Map();        // "job_no|slot" -> Set of edited field names
let dirtyMachining = new Map();   // job_no -> Set of edited field names
let deletedBlocks = [];           // {assignment_type, assignment_id, resourceKey}

let activeResourceKey = null;     // 'team-3' / 'subcontractor-5'
let collapsedJobs = new Set();    // job_no -> collapsed in the grid
let showCompleted = false;
let showEmptyResources = false;   // empty-resource tabs tucked behind a toggle
let newCounter = 0;

let grid = null;
let sheetRows = [];
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

// Summing kg in floats leaves noise (…0.2999999999999545), which then lands in
// the weight input; every kg figure is rounded to 2 decimals.
function round2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

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
    return dirtyBlocks.size > 0 || dirtyDept.size > 0
        || dirtyMachining.size > 0 || deletedBlocks.length > 0;
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
        completed_at: s.completed_at || null,
        forecast_date: s.forecast_date || null,
        forecast_kind: s.forecast_kind || null,
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
            completed_at: b.subtask.completed_at || null,
            forecast_date: b.subtask.forecast_date || null,
            forecast_kind: b.subtask.forecast_kind || null,
        },
        stages: (b.stages || []).map(stageVM),
        createDefaultStages: false,
        deleted: false,
        resource_type: res.resource_type,
        resource_id: res.id,
        resource_name: res.display_name || res.name,
    };
}

function hydrate(boardData) {
    board = boardData;
    calendar = createWorkdayCalendar(boardData.holidays || []);
    weldingTasks = boardData.welding_tasks || [];
    jobInfo = boardData.job_info || {};

    deptByJob = {};
    machiningByJob = {};
    Object.entries(jobInfo).forEach(([jobNo, info]) => {
        const slots = {};
        DEPT_SLOTS.forEach(slot => { slots[slot] = deptVM(info[slot]); });
        deptByJob[jobNo] = slots;
        const machining = (info.machining || [])[0];
        if (machining) {
            machiningByJob[jobNo] = {
                task_id: machining.task_id,
                weight: machining.weight ?? null,
            };
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
    dirtyDept = new Map();
    dirtyMachining = new Map();
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

// The manufacturing task's window must cover everything under it, live —
// dragging a welding stage past its end is the usual way that window moves,
// and the planner should see it happen rather than discover it after a save.
// Widen only: a child pulling inwards leaves the parent where the planner
// put it. Duration always follows the span, never a sum — the children
// overlap, so adding their durations would invent weeks nobody works.
// The three department tasks this sheet plans, in the order they appear under
// a job order. They are real JobOrderDepartmentTask rows — edits here are
// saved back onto them, not into anything the board invented.
const DEPT_SLOTS = ['manufacturing', 'welding', 'painting'];

function deptVM(row) {
    if (!row) return null;
    return {
        task_id: row.task_id,
        status: row.status,
        // How much of its parent's progress this task is worth. Kaynaklı
        // İmalat is 97 of 100 on a typical job, Boya 2 — the split that
        // decides what "İmalat %94" actually means.
        weight: row.weight ?? null,
        progress: Number(row.progress ?? 0),
        duration_wd: row.duration_wd,
        start_date: row.start_date,
        end_date: row.end_date,
        completed_at: row.completed_at || null,
        forecast_date: row.forecast_date || null,
        forecast_kind: row.forecast_kind || null,
        has_subtasks: !!row.has_subtasks,
        // Which parts the planner did not type: the date may be first real
        // progress, the duration a weight share, the window widened to cover a
        // child. None of them may be written back unless the row is edited.
        start_is_actual: !!row.start_is_actual,
        end_is_actual: !!row.end_is_actual,
        duration_is_derived: !!row.duration_is_derived,
        duration_source: row.duration_source || null,
        entered_duration_wd: row.entered_duration_wd == null ? null : row.entered_duration_wd,
        start_from_children: !!row.start_from_children,
        end_from_children: !!row.end_from_children,
        // The stored plan, before any widening — the floor the union keeps.
        entered_start_date: row.entered_start_date || null,
        entered_end_date: row.entered_end_date || null,
    };
}

function deptOf(jobNo, slot) {
    return (deptByJob[jobNo] || {})[slot] || null;
}

function markMachiningDirty(jobNo, field) {
    const fields = dirtyMachining.get(jobNo) || new Set();
    if (field) fields.add(field);
    dirtyMachining.set(jobNo, fields);
    updateSaveState();
}

function markDeptDirty(jobNo, slot, field) {
    const key = `${jobNo}|${slot}`;
    const fields = dirtyDept.get(key) || new Set();
    if (field) fields.add(field);
    dirtyDept.set(key, fields);
    updateSaveState();
}

// Everything scheduled under a task, as the grid currently holds it. Used both
// to widen a parent when a child moves and to refuse a parent edit that would
// cut into its children.
function childCoverage(jobNo, slot) {
    const dated = [];
    if (slot === 'welding' || slot === 'manufacturing') {
        resources.forEach(res => res.blocks
            .filter(b => !b.deleted && b.job_no === jobNo)
            .forEach(b => {
                const staged = b.stages.filter(x => !x.deleted && x.status !== 'cancelled');
                (staged.length ? staged : [b.subtask]).forEach(x => dated.push(x));
            }));
    }
    if (slot === 'manufacturing') {
        const painting = deptOf(jobNo, 'painting');
        if (painting) dated.push(painting);
        (jobInfo[jobNo]?.machining || []).forEach(m => dated.push(m));
    }
    // Only dates somebody planned widen a parent. A machining row borrows its
    // operations' schedule and a paint row may be showing first-progress
    // evidence; widening from those and then saving would write an estimate
    // onto a real task as though it had been typed there.
    const planned = (x, field) => {
        if (!x[field]) return null;
        if (x.date_source) return null;
        if (field === 'start_date' && x.start_is_actual) return null;
        if (field === 'end_date' && x.end_is_actual) return null;
        return x[field];
    };
    const starts = dated.map(x => planned(x, 'start_date')).filter(Boolean).sort();
    const ends = dated.map(x => planned(x, 'end_date')).filter(Boolean).sort();
    return { start: starts[0] || null, end: ends[ends.length - 1] || null };
}

// A parent's window must cover everything under it, live — dragging a welding
// stage past its end is the usual way that window moves, and the planner should
// watch it happen rather than discover it after a save. Widen only: a child
// pulling inwards leaves the parent where the planner put it. Duration follows
// the span, never a sum — the children overlap.
// A parent's window is the UNION of what the planner entered on it and what
// its children occupy. That tracks in both directions: lengthen a stage and
// the parent grows, shorten it and the parent pulls back — but never inside
// the dates somebody actually typed on the parent, which stay a floor.
//
// Widen-only was the first cut, and it left a phantom window behind after a
// stage was shortened: İmalat still claimed 16.10 when nothing under it ran
// past 25.08.
function reflowParents(jobNo) {
    ['welding', 'manufacturing'].forEach(slot => {
        const target = deptOf(jobNo, slot);
        if (!target) return;
        const child = childCoverage(jobNo, slot);
        const earliest = (a, b) => (a && b) ? (a < b ? a : b) : (a || b);
        const latest = (a, b) => (a && b) ? (a > b ? a : b) : (a || b);

        const start = earliest(target.entered_start_date, child.start);
        const end = latest(target.entered_end_date, child.end);
        if (start === target.start_date && end === target.end_date) return;

        target.start_date = start;
        target.end_date = end;
        target.start_from_children = !!(child.start && child.start !== target.entered_start_date);
        target.end_from_children = !!(child.end && child.end !== target.entered_end_date);
        if (start && end) {
            target.duration_wd = calendar.workingDaysInclusive(start, end);
            target.duration_is_derived = !(
                start === target.entered_start_date && end === target.entered_end_date);
        }
        markDeptDirty(jobNo, slot, 'start_date');
    });
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
    return round2(total);
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

    // Who holds the kg on each welding task, from the working copy (so the
    // banner reflects unsaved edits too).
    const holdersByTask = {};
    resources.forEach(res => res.blocks.forEach(b => {
        if (b.deleted) return;
        (holdersByTask[b.welding_task_id] ||= []).push({
            name: res.display_name || res.name,
            type: res.resource_type,
            kg: Number(b.allocated_weight_kg || 0),
        });
    }));

    const lines = [];
    weldingTasks.forEach(t => {
        if (t.total_weight_kg == null) return;
        const allocated = allocatedForTask(t.welding_task_id);
        const total = Number(t.total_weight_kg);
        if (allocated <= total) return;
        const holders = (holdersByTask[t.welding_task_id] || [])
            .sort((a, b) => b.kg - a.kg)
            .map(h => `
                <span class="warn-holder">
                    <i class="fas ${h.type === 'team' ? 'fa-users' : 'fa-industry'}"></i>
                    ${esc(h.name)} <strong>${fmtKg(h.kg)} kg</strong>
                </span>`).join('');
        lines.push(`
            <li>
                <strong>${esc(t.job_no)}</strong>${t.job_order_title ? ` — ${esc(t.job_order_title)}` : ''}:
                atanan <strong>${fmtKg(allocated)} kg</strong> &gt; iş ağırlığı ${fmtKg(total)} kg
                <span class="warn-over">(+${fmtKg(allocated - total)} kg)</span>
                <div class="warn-holders">${holders || '<span class="text-muted">atama bulunamadı</span>'}</div>
            </li>`);
    });

    if (!lines.length) {
        banner.classList.add('d-none');
        banner.innerHTML = '';
        return;
    }
    banner.innerHTML = `
        <div class="fw-semibold mb-1"><i class="fas fa-exclamation-triangle me-1"></i>Aşırı tahsis</div>
        <ul class="warn-list mb-0">${lines.join('')}</ul>`;
    banner.classList.remove('d-none');
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

// A planned date reads plain; a real (started_at/completed_at) date that stands
// in for a missing plan is marked so the two are never confused.
// A date nobody typed on this task has to say where it came from. Talaşlı
// İmalat is the case that forced this: its own dates are empty on 252 of 253
// jobs, so the row now borrows the operations' schedule — which is a real plan,
// just one level down, and must not be mistaken for one entered here.
const DATE_SOURCE_TITLES = {
    operations_plan: 'Operasyon planından hesaplandı — bu göreve girilmiş bir tarih değil',
    operations_actual: 'Operasyonlardaki gerçek çalışmadan alındı',
};

function dateCell(value, isActual, row) {
    if (!value) return '<span class="text-muted">—</span>';
    const derived = row && DATE_SOURCE_TITLES[row.date_source];
    if (derived) {
        return `<span class="date-derived" title="${esc(derived)}">${fmtDate(value)}</span>`;
    }
    if (!isActual) return fmtDate(value);
    return `<span class="date-actual" title="Gerçekleşen tarih (planlanmış tarih girilmemiş)">${fmtDate(value)}</span>`;
}

// A derived duration is not a plan anyone entered, and the two derivations are
// not interchangeable: a weight share is a guess at unplanned work, while a
// children's span has OVERRULED an entered value — and the planner needs to see
// what it overruled, or the sheet and /projects/ look like they disagree for no
// reason.
function durationCell(value, isDerived, row) {
    if (value == null) return '<span class="text-muted">—</span>';
    if (!isDerived) return fmtDuration(value);
    const entered = row && row.entered_duration_wd;
    const source = row && row.duration_source;
    let title;
    if (source === 'children_span') {
        title = `Alt görevlerin kapladığı süreden hesaplandı${
            entered != null ? ` — göreve girilen süre ${fmtDuration(entered)}` : ''}`;
    } else if (source === 'operations_hours') {
        // 9-hour day: 07:30-17:00 less the lunch break.
        title = `Operasyonların girilen saatlerinden hesaplandı${
            row.operation_hours != null ? ` (${row.operation_hours} saat / 9 saatlik gün)` : ''}`;
    } else if (source === 'operations_plan' || source === 'operations_actual') {
        title = 'Operasyonların kapladığı süreden hesaplandı';
    } else {
        title = 'Ağırlık payından hesaplandı — girilmiş bir süre değil';
    }
    return `<span class="duration-derived" title="${esc(title)}">≈${fmtDuration(value)}</span>`;
}

// Actual completion date for finished rows, projected finish for open ones.
function forecastCell(row) {
    if (!row.forecast_date) return '<span class="text-muted">—</span>';
    const isActual = row.forecast_kind === 'actual';
    const late = !isActual && row.end_date && row.forecast_date > row.end_date;
    const cls = ['forecast-cell'];
    if (isActual) cls.push('actual');
    if (late) cls.push('late');
    const title = isActual
        ? 'Gerçekleşen tamamlanma tarihi'
        : (row.forecast_kind === 'rate'
            ? 'Tahmini bitiş — mevcut ilerleme hızına göre'
            : 'Tahmini bitiş — planlanan tarihe göre');
    return `
        <span class="${cls.join(' ')}" title="${title}${late ? ' (hedefin gerisinde)' : ''}">
            <i class="fas ${isActual ? 'fa-circle-check' : 'fa-clock'}"></i>${fmtDate(row.forecast_date)}
        </span>`;
}

function progressBar(value) {
    const pct = Math.max(0, Math.min(100, Number(value ?? 0)));
    const color = pct >= 100 ? 'bg-success' : (pct > 0 ? 'bg-primary' : 'bg-secondary');
    return `
        <div class="mini-progress">
            <div class="progress"><div class="progress-bar ${color}" style="width:${pct}%"></div></div>
            <span class="progress-label">${pct % 1 === 0 ? pct : pct.toFixed(1)}%</span>
        </div>`;
}

function hasStages(blockRef) {
    const block = findBlock(blockRef);
    return !!block && block.stages.some(x => !x.deleted);
}

// Distinct job orders on a resource sheet, in display order — the grid groups
// by job, so a job with two assignments here is still one group.
function jobNosOf(res) {
    const seen = [];
    res.blocks.filter(b => !b.deleted).forEach(b => {
        if (!seen.includes(b.job_no)) seen.push(b.job_no);
    });
    // Always by iş emri number. Assignment order is an accident of when the
    // work was handed out; a planner looking for 293-03-07 wants it where the
    // numbers say it is, on every sheet.
    return seen.sort((a, b) => String(a || '').localeCompare(String(b || ''), 'tr',
        { numeric: true, sensitivity: 'base' }));
}

// One row per task, flat, in tree order — the grid draws the hierarchy from
// `indent` and hides a job's rows when it is collapsed. The shape mirrors the
// real task tree exactly:
//
//   293-03-07 · COOLED PANEL 4      ← the JOB ORDER: opened → promised, read-only
//     Diğer departmanlar
//       Malzeme Tedarik, Kesim      ← other departments, read-only
//     İmalat                        ← manufacturing main task, editable
//       Talaşlı İmalat              ← read-only
//       Kaynaklı İmalat             ← editable
//         HARUN METAL BAKIR         ← a subcontractor/team assignment
//           Montaj, Kaynak ve Taşlama
//       Boya                        ← editable
function buildSheetRows(res) {
    const rows = [];

    jobNosOf(res).forEach(jobNo => {
        const blocks = res.blocks.filter(b => !b.deleted && b.job_no === jobNo);
        const first = blocks[0] || {};
        const info = jobInfo[jobNo] || {};
        const base = { job_no: jobNo, groupKey: jobNo };
        const jo = info.job_order || null;

        // The job order frames everything under it. It is not a department
        // task and nothing here edits it — its dates are when the order was
        // opened and when it was promised.
        rows.push({
            ...base,
            key: `${jobNo}-group`,
            kind: 'group',
            groupKey: null,
            indent: 0,
            collapsed: collapsedJobs.has(jobNo),
            title: jobNo,
            job_order_title: jo?.title || first.job_order_title || '',
            customer_name: first.customer_name || '',
            block_count: blocks.length,
            bar_label: jobNo,
            weight_is_kg: true,
            start_date: jo?.start_date ?? null,
            end_date: jo?.end_date ?? null,
            duration_wd: jo?.duration_wd ?? null,
            weight: jo?.total_weight_kg ?? null,
            progress: jo?.progress ?? 0,
            status: jo?.status || 'active',
            completed_at: jo?.completed_at || null,
            forecast_date: null,
            forecast_kind: null,
            note: '',
        });

        const infoRow = (item, label, kind, indent) => ({
            ...base,
            key: `${jobNo}-info-${item.task_id}`,
            kind: kind || 'info',
            indent,
            title: label,
            start_date: item.start_date,
            end_date: item.end_date,
            duration_wd: item.duration_wd,
            weight: item.weight ?? null,
            progress: item.progress,
            status: item.status,
            start_is_actual: !!item.start_is_actual,
            end_is_actual: !!item.end_is_actual,
            duration_is_derived: !!item.duration_is_derived,
            duration_source: item.duration_source || null,
            date_source: item.date_source || null,
            operation_hours: item.operation_hours == null ? null : item.operation_hours,
            entered_duration_wd: item.entered_duration_wd == null ? null : item.entered_duration_wd,
            completed_at: item.completed_at || null,
            forecast_date: item.forecast_date || null,
            forecast_kind: item.forecast_kind || null,
            note: '',
        });

        const deptRow = (slot, label, indent) => {
            const vm = deptOf(jobNo, slot);
            if (!vm) return null;
            return {
                ...base,
                key: `${jobNo}-${slot}`,
                kind: 'dept',
                slot,
                indent,
                title: label,
                bar_label: label,
                start_date: vm.start_date,
                end_date: vm.end_date,
                duration_wd: vm.duration_wd,
                weight: vm.weight,
                progress: vm.progress,
                status: vm.status,
                has_subtasks: vm.has_subtasks,
                start_is_actual: vm.start_is_actual,
                end_is_actual: vm.end_is_actual,
                duration_is_derived: vm.duration_is_derived,
                duration_source: vm.duration_source,
                entered_duration_wd: vm.entered_duration_wd,
                completed_at: vm.completed_at,
                forecast_date: vm.forecast_date,
                forecast_kind: vm.forecast_kind,
                note: '',
            };
        };

        // Other departments first: material supply and cutting run before any
        // of this, so the group reads top-to-bottom as a sequence.
        const cuttingRows = info.cutting || [];
        const otherRows = [];
        if (info.material_supply) {
            otherRows.push(infoRow(info.material_supply, 'Malzeme Tedarik', 'info', 2));
        }
        cuttingRows.forEach(c => otherRows.push(infoRow(
            c, `Kesim${cuttingRows.length > 1 ? ` — ${c.title}` : ''}`, 'info', 2)));
        if (otherRows.length) {
            rows.push({
                ...base,
                key: `${jobNo}-band-other`,
                kind: 'band',
                indent: 1,
                title: 'Diğer departmanlar',
                start_date: null, end_date: null, duration_wd: null,
                weight: null, progress: null, status: null, note: '',
            });
            rows.push(...otherRows);
        }

        const manufacturing = deptRow('manufacturing', 'İmalat', 1);
        if (manufacturing) rows.push(manufacturing);

        const machiningRows = info.machining || [];
        machiningRows.forEach((x, i) => {
            const row = infoRow(
                x, `Talaşlı İmalat${machiningRows.length > 1 ? ` — ${x.title}` : ''}`,
                'machining', 2);
            if (i === 0 && machiningByJob[jobNo]) row.weight = machiningByJob[jobNo].weight;
            rows.push(row);
        });

        const welding = deptRow('welding', 'Kaynaklı İmalat', 2);
        if (welding) rows.push(welding);

        blocks.forEach(b => {
            const staged = b.stages.filter(s => !s.deleted);
            const rollup = blockRollup(b);
            // With stages, the assignment row is their rollup and reports only.
            // Without them, it IS the schedule and takes the edits directly —
            // which is also the only shape the server accepts a subtask
            // schedule for.
            rows.push({
                ...base,
                key: `${b.key}-block`,
                blockRef: b.key,
                kind: 'block',
                indent: 3,
                isNew: b.isNew,
                is_billed: b.is_billed,
                has_stages: staged.length > 0,
                title: b.resource_name || 'Kaynak İşi',
                bar_label: b.resource_name || 'Kaynak İşi',
                start_date: staged.length ? rollup.windowStart : b.subtask.start_date,
                end_date: staged.length ? rollup.windowEnd : b.subtask.end_date,
                duration_wd: staged.length ? rollup.totalDays : b.subtask.duration_wd,
                weight: b.allocated_weight_kg,
                weight_is_kg: true,
                progress: staged.length ? rollup.progress : b.subtask.progress,
                status: staged.length ? rollup.derived : b.subtask.status,
                completed_at: staged.length ? null : b.subtask.completed_at,
                forecast_date: staged.length ? rollup.forecastDate : b.subtask.forecast_date,
                forecast_kind: staged.length ? rollup.forecastKind : b.subtask.forecast_kind,
                note: b.notes,
            });

            staged.forEach(s => rows.push({
                ...base,
                key: `${b.key}-stage-${s.cid}`,
                blockRef: b.key,
                kind: 'stage',
                indent: 4,
                stageCid: s.cid,
                title: s.title,
                is_default: s.is_default,
                start_date: s.start_date,
                end_date: s.end_date,
                duration_wd: s.duration_wd,
                weight: s.weight,
                progress: s.progress,
                status: s.status,
                completed_at: s.completed_at,
                forecast_date: s.forecast_date,
                forecast_kind: s.forecast_kind,
                note: s.note,
            }));
        });

        const painting = deptRow('painting', 'Boya', 2);
        if (painting) rows.push(painting);
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

    // The block finishes when its last row does.
    const forecastRows = hasStages
        ? b.stages.filter(s => !s.deleted && s.status !== 'cancelled')
        : [b.subtask];
    const forecastDates = forecastRows.map(s => s.forecast_date).filter(Boolean).sort();
    const forecastDate = forecastDates[forecastDates.length - 1] || null;
    const allActual = forecastRows.length > 0
        && forecastRows.every(s => s.forecast_kind === 'actual');

    return {
        progress, windowStart, windowEnd, totalDays, derived, overdue,
        forecastDate,
        forecastKind: forecastDate ? (allActual ? 'actual' : 'rate') : null,
    };
}

// Returns an object keyed by column field: the table renders it as real cells,
// so a block's summary row lines up with the stage rows beneath it.
// The band is a divider, not a task: every column but its label stays empty so
// it cannot be read as a row at 0% progress and 'not started'.
function cellOverride(row, field) {
    return row.kind === 'band' ? '' : null;
}

const ROW_ICONS = {
    machining: 'fas fa-gear',
    block: 'fas fa-user-gear',
    stage: 'fas fa-pen-ruler',
    info: 'fas fa-circle-info',
    band: 'fas fa-diagram-project',
};

const DEPT_ICONS = {
    manufacturing: 'fas fa-industry',
    welding: 'fas fa-fire',
    painting: 'fas fa-fill-drip',
};

function titleCell(value, row) {
    if (row.kind === 'group') {
        const chevron = row.collapsed ? 'fa-chevron-right' : 'fa-chevron-down';
        return `
            <i class="fas ${chevron} pg-toggle"></i>
            <span class="pg-title" title="${esc(row.job_order_title)} — ${esc(row.customer_name)}">
                <strong>${esc(row.title)}</strong>
                <span class="pg-sub">${esc(row.job_order_title)}</span>
                ${row.block_count > 1
                    ? `<span class="block-count">${row.block_count} blok</span>` : ''}
            </span>`;
    }
    if (row.kind === 'stage' && row.is_default) {
        return `<span class="pg-title"><i class="fas fa-thumbtack pg-ico"
                     title="Varsayılan aşama — silinemez, süresiz/iptal edilebilir"></i>${esc(row.title)}</span>`;
    }
    const icon = (row.kind === 'dept' ? DEPT_ICONS[row.slot] : ROW_ICONS[row.kind])
        || 'fas fa-circle';
    return `<span class="pg-title"><i class="${icon} pg-ico"></i>${esc(row.title)}${
        row.isNew ? '<span class="badge bg-info ms-1">yeni</span>' : ''}</span>`;
}

// ---- grid definition -----------------------------------------------------

// Six columns earn their width next to a timeline; the rest are a click away.
// The choice is per user, so a planner who lives in Durum keeps it on.
const GRID_COLUMNS = [
    { field: 'title', label: 'Görev', width: '250px', always: true,
      formatter: (v, row) => titleCell(v, row) },
    { field: 'start_date', label: 'Başlangıç', width: '96px', type: 'date',
      headerClass: 'col-center', cellClass: 'col-center col-date', always: true,
      formatter: (v, row) => cellOverride(row, 'start_date') ?? dateCell(v, row.start_is_actual, row) },
    { field: 'end_date', label: 'Bitiş', width: '96px', type: 'date',
      headerClass: 'col-center', cellClass: 'col-center col-date', always: true,
      formatter: (v, row) => cellOverride(row, 'end_date') ?? dateCell(v, row.end_is_actual, row) },
    { field: 'duration_wd', label: 'Süre', width: '76px', type: 'number', min: 0, step: 0.5,
      headerClass: 'col-center', cellClass: 'col-center col-num', always: true,
      formatter: (v, row) => cellOverride(row, 'duration_wd') ?? durationCell(v, row.duration_is_derived, row) },
    { field: 'weight', label: 'Ağırlık', width: '76px', type: 'number', min: 1, step: 1,
      headerClass: 'col-center', cellClass: 'col-center col-num', always: true,
      // A block row's "weight" is its kg allocation, not a rollup weight —
      // same column, different unit, so it has to say which.
      formatter: (v, row) => cellOverride(row, 'weight') ?? (v == null
          ? '<span class="text-muted">—</span>'
          : (row.weight_is_kg
              ? `<span class="weight-readonly">${fmtKg(v)} kg</span>`
              : (['stage', 'dept', 'machining'].includes(row.kind)
                  ? String(v)
                  : `<span class="weight-readonly">${v}</span>`))) },
    { field: 'progress', label: 'İlerleme', width: '116px', type: 'number', min: 0, max: 100, step: 1,
      headerClass: 'col-center', cellClass: 'col-progress', always: true,
      formatter: (v, row) => cellOverride(row, 'progress') ?? progressBar(v) },
    { field: 'status', label: 'Durum', width: '124px', type: 'select',
      headerClass: 'col-center', cellClass: 'col-center', options: EDITABLE_STATUS_OPTIONS,
      formatter: (v, row) => cellOverride(row, 'status') ?? statusBadge(v, isRowOverdue(row)) },
    { field: 'forecast_date', label: 'Gerçek./Tahmini', width: '118px',
      headerClass: 'col-center', cellClass: 'col-center col-date',
      formatter: (v, row) => cellOverride(row, 'forecast_date') ?? forecastCell(row) },
    { field: 'note', label: 'Not', width: '160px', type: 'text',
      formatter: (v, row) => cellOverride(row, 'note')
          ?? (v ? `<span class="stage-note">${esc(v)}</span>` : '<span class="text-muted">—</span>') },
];

// Rows that only ever report: other departments' work, and the block row,
// which is a summary of the stages beneath it.
// Rows that only ever report: the job order (its dates come from the order
// record), other departments' work, and Talaşlı İmalat.
const READ_ONLY_KINDS = ['group', 'info', 'band'];
const SCHEDULE_ONLY = ['start_date', 'end_date', 'duration_wd', 'status'];

// Per cell, not per row. Showing a cell as editable and then throwing when it
// is touched is a worse answer than not offering it: the planner learns the
// rule from the cursor instead of from an error.
function isCellEditable(row, field) {
    if (READ_ONLY_KINDS.includes(row.kind)) return false;
    // Talaşlı İmalat's share of the manufacturing rollup is set here; its dates
    // are not — those come from the operations underneath it.
    if (row.kind === 'machining') return field === 'weight';
    if (row.kind === 'dept') {
        // Progress on a parent is the rollup of its children — İmalat and
        // Kaynaklı İmalat always have some, Boya usually does.
        if (field === 'progress') return !row.has_subtasks;
        // The rollup weight is the planner's to set on the work they own.
        // İmalat's weight splits the JOB ORDER across departments, which is a
        // different decision and not made from this sheet.
        if (field === 'weight') return row.slot !== 'manufacturing';
        return SCHEDULE_ONLY.includes(field);
    }
    if (row.kind === 'block') {
        // A block WITH stages is their rollup; its schedule is theirs to move,
        // and the server rejects a subtask schedule in that shape anyway. The
        // kg allocation has its own dialog because it touches billing.
        return !row.has_stages && SCHEDULE_ONLY.concat('progress', 'note').includes(field);
    }
    if (field === 'title') return row.kind === 'stage' && !row.is_default;
    if (field === 'weight') return row.kind === 'stage';
    return true;
}
const COLUMNS_KEY = 'imalatPlanlama.columns';
const ZOOM_KEY = 'imalatPlanlama.zoom';
const GRIDW_KEY = 'imalatPlanlama.gridWidth';

function defaultColumnKeys() {
    return GRID_COLUMNS.filter(c => c.always).map(c => c.field);
}

function activeColumnKeys() {
    try {
        const stored = JSON.parse(localStorage.getItem(COLUMNS_KEY) || 'null');
        if (Array.isArray(stored) && stored.length) {
            const known = new Set(GRID_COLUMNS.map(c => c.field));
            return stored.filter(f => known.has(f));
        }
    } catch { /* fall through to the default set */ }
    return defaultColumnKeys();
}

function activeColumns() {
    const keys = new Set(activeColumnKeys());
    return GRID_COLUMNS.filter(c => c.always || keys.has(c.field));
}

// ---- rendering -----------------------------------------------------------

function barState(row) {
    if (['completed', 'skipped'].includes(row.status)) return 'done';
    if (isRowOverdue(row)) return 'late';
    if (row.status === 'on_hold') return 'hold';
    return 'on-time';
}

// Only rows with a real span get a bar. A row whose dates are still unknown
// draws nothing rather than a one-day stub at an invented date.
function rowBar(row) {
    if (row.kind === 'band') return null;
    const start = row.start_date || row.end_date;
    const end = row.end_date || row.start_date;
    if (!start || !end) return null;
    // 57 of 768 job orders carry a promised date EARLIER than the day they
    // were opened. There is no span to draw; the two dates stay visible in the
    // grid so the contradiction is obvious rather than hidden behind a stub.
    if (end < start) return null;
    return {
        start, end,
        progress: Number(row.progress || 0),
        state: barState(row),
        label: row.bar_label || row.title,
        title: `${row.title} · ${fmtDate(row.start_date)} – ${fmtDate(row.end_date)}`,
    };
}

function renderGrid() {
    const container = document.getElementById('planning-grid');
    if (!container) return;
    const res = activeResource();
    const rows = res ? buildSheetRows(res) : [];
    sheetRows = rows;

    if (!grid) {
        grid = new PlanningGrid('planning-grid', {
            columns: activeColumns(),
            rows,
            zoom: localStorage.getItem(ZOOM_KEY) || 'week',
            gridWidth: Number(localStorage.getItem(GRIDW_KEY)) || 560,
            collapsed: collapsedJobs,
            isCellEditable,
            rowAttributes: (row) => ({ class: rowClasses(row) }),
            bar: rowBar,
            isNonWorkingDay: (dateStr) => calendar.isNonWorkingDay(dateStr),
            today: new Date(),
            onEdit: (row, field, value) => onCellEdit(row, field, value),
            onEditError: (err) => showNotification(err?.message || 'Düzenleme başarısız', 'error'),
            onToggleGroup: (row) => toggleJob(row.job_no),
            onToggleAll,
            onAction: onGridAction,
            onGridWidthChange: (px) => localStorage.setItem(GRIDW_KEY, String(px)),
            onZoomChange: (zoom) => applyZoom(zoom),
            actions: GRID_ACTIONS,
        });
    } else {
        grid.options.columns = activeColumns();
        grid.options.collapsed = collapsedJobs;
        grid.options.rows = rows;
    }
    grid.options.allCollapsed = expandedJobCount() === 0;
    grid.render();
    // The header is rebuilt on every render, so the button needs re-binding —
    // and any open menu belongs to the old one.
    closeColumnPicker();
    bindColumnPicker();
}

function rowClasses(row) {
    const classes = [];
    if (row.kind === 'group') classes.push('pg-row-group');
    if (row.kind === 'band') classes.push('pg-row-band');
    if (['info', 'machining'].includes(row.kind)) classes.push('pg-row-info');
    if (row.kind === 'dept') classes.push(`pg-row-dept pg-row-${row.slot}`);
    if (row.kind === 'block') classes.push('pg-row-block');
    if (row.status === 'cancelled') classes.push('pg-row-cancelled');
    classes.push(`pg-indent-${row.indent || 0}`);
    return classes.join(' ');
}

const GRID_ACTIONS = [
    {
        key: 'create-stages',
        icon: 'fas fa-layer-group',
        title: 'Varsayılan aşamaları (Montaj, Kaynak ve Taşlama) oluştur',
        visible: (row) => row.kind === 'block' && !hasStages(row.blockRef),
    },
    {
        key: 'add-custom',
        icon: 'fas fa-plus',
        title: 'Özel aşama ekle',
        visible: (row) => row.kind === 'block' && hasStages(row.blockRef),
    },
    {
        key: 'edit-weight',
        icon: 'fas fa-weight-hanging',
        title: 'Ağırlığı düzenle',
        visible: (row) => row.kind === 'block',
        disabled: (row) => !!findBlock(row.blockRef)?.is_billed,
    },
    {
        key: 'delete-block',
        icon: 'fas fa-trash',
        title: 'Atamayı sil',
        visible: (row) => row.kind === 'block',
        disabled: (row) => !!findBlock(row.blockRef)?.is_billed,
    },
    {
        key: 'delete-stage',
        icon: 'fas fa-trash',
        title: 'Özel aşamayı sil',
        visible: (row) => row.kind === 'stage' && !row.is_default,
    },
];

function onGridAction(action, row) {
    if (action === 'create-stages') onCreateStages(row.blockRef);
    else if (action === 'add-custom') onAddCustomStage(row.blockRef);
    else if (action === 'edit-weight') onEditWeight(row.blockRef);
    else if (action === 'delete-block') onDeleteBlock(row.blockRef);
    else if (action === 'delete-stage') onDeleteCustomStage(row);
}

function toggleJob(jobNo) {
    if (collapsedJobs.has(jobNo)) collapsedJobs.delete(jobNo);
    else collapsedJobs.add(jobNo);
    renderGrid();
}

// One place to change the scale, whether it came from a button or Ctrl+wheel.
function applyZoom(zoom) {
    localStorage.setItem(ZOOM_KEY, zoom);
    document.querySelectorAll('#zoom-buttons [data-zoom]').forEach(
        b => b.classList.toggle('active', b.dataset.zoom === zoom));
    if (grid) grid.setZoom(zoom);
}

function initGridToolbar() {
    const zoomWrap = document.getElementById('zoom-buttons');
    if (zoomWrap) {
        const stored = localStorage.getItem(ZOOM_KEY) || 'week';
        zoomWrap.querySelectorAll('[data-zoom]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.zoom === stored);
            btn.addEventListener('click', () => applyZoom(btn.dataset.zoom));
        });
    }

}

// The picker lives on <body>, not in the grid header: that cell clips its
// contents so columns cannot spill over the timeline, and it sits inside the
// header's stacking context — a menu rendered in place was both cut off and
// painted under the rest of the page. Positioned under the button on open.
let columnPickerEl = null;

function closeColumnPicker() {
    if (columnPickerEl) columnPickerEl.remove();
    columnPickerEl = null;
    document.removeEventListener('click', onColumnPickerOutside, true);
    document.removeEventListener('keydown', onColumnPickerKey, true);
    window.removeEventListener('resize', closeColumnPicker);
}

function onColumnPickerOutside(e) {
    if (columnPickerEl && !columnPickerEl.contains(e.target)
        && !e.target.closest('.pg-columns-btn')) closeColumnPicker();
}

function onColumnPickerKey(e) {
    if (e.key === 'Escape') closeColumnPicker();
}

function openColumnPicker(button) {
    closeColumnPicker();
    const keys = new Set(activeColumnKeys());
    const el = document.createElement('div');
    el.className = 'pg-picker-pop';
    el.innerHTML = '<div class="pg-picker-head">Sütunlar</div>' + GRID_COLUMNS.map(c => `
        <label class="pg-picker-item ${c.always ? 'pg-fixed-col' : ''}">
            <input type="checkbox" class="form-check-input" value="${esc(c.field)}"
                   ${c.always || keys.has(c.field) ? 'checked' : ''}
                   ${c.always ? 'disabled' : ''}>
            <span>${esc(c.label)}</span>
            ${c.always ? '<i class="fas fa-lock pg-lock" title="Her zaman açık"></i>' : ''}
        </label>`).join('');

    document.body.appendChild(el);
    const r = button.getBoundingClientRect();
    // Flip up when there is no room below, and never run off the right edge.
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    const top = (r.bottom + height + 8 > window.innerHeight) ? r.top - height - 6 : r.bottom + 6;
    el.style.top = `${Math.max(8, top)}px`;
    el.style.left = `${Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8))}px`;

    el.addEventListener('change', (e) => {
        const box = e.target.closest('input[type=checkbox]');
        if (!box) return;
        const next = [...el.querySelectorAll('input[type=checkbox]')]
            .filter(i => i.checked).map(i => i.value);
        localStorage.setItem(COLUMNS_KEY, JSON.stringify(next));
        renderGrid();
    });

    columnPickerEl = el;
    document.addEventListener('click', onColumnPickerOutside, true);
    document.addEventListener('keydown', onColumnPickerKey, true);
    window.addEventListener('resize', closeColumnPicker);
}

function bindColumnPicker() {
    const btn = document.querySelector('.pg-columns-btn');
    if (!btn) return;
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (columnPickerEl) closeColumnPicker();
        else openColumnPicker(btn);
    });
}

function expandedJobCount() {
    const res = activeResource();
    if (!res) return 0;
    return jobNosOf(res).filter(jobNo => !collapsedJobs.has(jobNo)).length;
}

function onToggleAll() {
    const res = activeResource();
    if (!res) return;
    const collapse = expandedJobCount() > 0;
    jobNosOf(res).forEach(jobNo => {
        if (collapse) collapsedJobs.add(jobNo);
        else collapsedJobs.delete(jobNo);
    });
    renderGrid();
}

function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
        renderGrid();
        renderWarnings();
    }, 0);
}

// ---- inline editing ------------------------------------------------------

function onCellEdit(row, field, newValue) {
    const block = row.blockRef ? findBlock(row.blockRef) : null;

    let target = null;
    if (row.kind === 'stage') {
        target = block && block.stages.find(s => s.cid === row.stageCid);
    } else if (row.kind === 'machining') {
        target = machiningByJob[row.job_no];
    } else if (row.kind === 'dept') {
        target = deptOf(row.job_no, row.slot);
    } else if (row.kind === 'block') {
        target = block && block.subtask;
    }
    if (!target) return;

    const markDirty = () => {
        if (row.kind === 'dept') markDeptDirty(row.job_no, row.slot, field);
        else if (row.kind === 'machining') markMachiningDirty(row.job_no, field);
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
        if (!['stage', 'dept', 'machining'].includes(row.kind)) {
            throw new Error('Bu satırda ağırlık düzenlenemez.');
        }
        const weight = parseInt(newValue, 10);
        if (!Number.isFinite(weight) || weight < 1) {
            throw new Error('Ağırlık 1 veya daha büyük bir tam sayı olmalıdır.');
        }
        target.weight = weight;
        row.weight = weight;
    } else if (field === 'progress') {
        if (row.kind === 'dept' && row.has_subtasks) {
            throw new Error(`${row.title} ilerlemesi alt görevlerinden hesaplanır.`);
        }
        const progress = Number(newValue);
        if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
            throw new Error('İlerleme 0 ile 100 arasında olmalıdır.');
        }
        target.progress = progress;
        row.progress = progress;
        // A pending row's progress counts as 0 in every rollup — entering
        // progress is itself the signal that the row has started.
        if (progress > 0 && ['pending', 'blocked'].includes(target.status)) {
            target.status = 'in_progress';
            row.status = 'in_progress';
        }
    } else if (field === 'status') {
        const status = String(newValue);
        if (!STATUS_META[status]) throw new Error('Geçersiz durum.');
        target.status = status;
        if (status === 'completed') target.progress = 100;
        row.status = status;
    } else if (field === 'note') {
        if (row.kind === 'stage') {
            target.note = String(newValue || '');
        } else if (row.kind === 'block') {
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

        // Whatever the planner just typed is entered, not derived — the row
        // must stop wearing the "≈" and its tooltip. This applies to every
        // editable row, Boya included: it was still showing its weight-share
        // marker over a duration somebody had keyed in by hand.
        target.duration_is_derived = false;
        target.duration_source = null;
        target.start_is_actual = false;
        target.end_is_actual = false;
        target.date_source = null;
        if (row.kind === 'dept') {
            target.entered_start_date = result.start_date;
            target.entered_end_date = result.end_date;
        }

        if (row.kind === 'dept' && row.slot !== 'painting') {
            const cover = childCoverage(row.job_no, row.slot);
            if (cover.start && result.start_date && result.start_date > cover.start) {
                throw new Error(
                    `Alt görevler ${fmtDate(cover.start)} tarihinde başlıyor; ` +
                    'ana görev daha geç başlayamaz.');
            }
            if (cover.end && result.end_date && result.end_date < cover.end) {
                throw new Error(
                    `Alt görevler ${fmtDate(cover.end)} tarihinde bitiyor; ` +
                    'ana görev daha erken bitemez.');
            }
            // Typing on the parent moves the floor, so a later child change
            // unions against what was just entered, not the stale value.
            target.start_from_children = false;
            target.end_from_children = false;
        }
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
            duration_is_derived: false,
            duration_source: null,
            start_is_actual: false,
            end_is_actual: false,
            date_source: null,
        });
    } else {
        return;
    }

    markDirty();
    if (SCHEDULE_FIELDS.includes(field)
            && (row.kind !== 'dept' || row.slot !== 'manufacturing')) {
        reflowParents(row.job_no);
    }
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
    collapsedJobs.delete(block.job_no);   // show what was just created
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
        collapsedJobs.delete(block.job_no);   // show what was just created
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

function remainingForTask(weldingTaskId, totalWeightKg) {
    if (totalWeightKg == null) return null;
    return round2(Number(totalWeightKg) - allocatedForTask(weldingTaskId));
}

/** Who currently holds kg on a welding task, from the working copy. */
function holdersForTask(weldingTaskId) {
    const holders = [];
    resources.forEach(res => res.blocks.forEach(b => {
        if (b.deleted || b.welding_task_id !== Number(weldingTaskId)) return;
        holders.push({
            name: res.display_name || res.name,
            type: res.resource_type,
            kg: Number(b.allocated_weight_kg || 0),
        });
    }));
    return holders.sort((a, b) => b.kg - a.kg);
}

// Only jobs with capacity left are offerable: a job whose welding weight is
// fully assigned has nothing to hand out.
//
// Each option carries what the decision actually needs — how big the job is,
// how much of it is already out, and who has it — because picking from a list
// of job numbers alone meant opening the modal repeatedly just to find out.
// `searchText` keeps the markup out of what the search box matches.
function weldingTaskOptions() {
    return weldingTasks
        .filter(t => t.total_weight_kg != null)
        .map(t => ({ task: t, remaining: remainingForTask(t.welding_task_id, t.total_weight_kg) }))
        .filter(({ remaining }) => remaining > 0)
        .sort((a, b) => String(a.task.job_no).localeCompare(String(b.task.job_no), 'tr'))
        .map(({ task, remaining }) => {
            const total = Number(task.total_weight_kg);
            const assigned = allocatedForTask(task.welding_task_id);
            const holders = holdersForTask(task.welding_task_id);
            const shown = holders.slice(0, 3);
            const rest = holders.length - shown.length;
            const holderHtml = holders.length
                ? shown.map(h => `<span class="jp-holder">
                        <i class="fas ${h.type === 'subcontractor' ? 'fa-truck-field' : 'fa-users'}"></i>
                        ${esc(h.name)} · ${fmtKg(h.kg)}</span>`).join('')
                    + (rest > 0 ? `<span class="jp-holder jp-more">+${rest}</span>` : '')
                : '<span class="jp-holder jp-none">henüz atanmadı</span>';

            return {
                value: String(task.welding_task_id),
                searchText: [task.job_no, task.job_order_title, task.customer_name,
                    ...holders.map(h => h.name)].filter(Boolean).join(' '),
                // What the field shows once collapsed — the rich label is
                // markup and would print as literal tags there.
                selectedText: `${task.job_no} — ${task.job_order_title || ''}`
                    + ` (kalan ${fmtKg(remaining)} kg)`,
                label: `
                    <span class="jp-opt">
                        <span class="jp-top">
                            <b class="jp-no">${esc(task.job_no)}</b>
                            <span class="jp-title">${esc(task.job_order_title || '')}</span>
                            <span class="jp-rem">kalan ${fmtKg(remaining)} kg</span>
                        </span>
                        <span class="jp-meta">
                            <span class="jp-kg">toplam ${fmtKg(total)}</span>
                            <span class="jp-kg">atanmış ${fmtKg(assigned)}</span>
                            ${holderHtml}
                        </span>
                    </span>`,
            };
        });
}

function jobAllocInfoHTML(weldingTaskId) {
    const task = weldingTasks.find(t => String(t.welding_task_id) === String(weldingTaskId));
    if (!task) return '';
    const total = task.total_weight_kg != null ? Number(task.total_weight_kg) : null;
    const assigned = allocatedForTask(task.welding_task_id);
    const remaining = total != null ? total - assigned : null;
    const holders = holdersForTask(task.welding_task_id);

    return `
        <div class="alloc-summary">
            <span><span class="lbl">Toplam</span><strong>${fmtKg(total)} kg</strong></span>
            <span><span class="lbl">Atanmış</span><strong>${fmtKg(assigned)} kg</strong></span>
            <span class="${remaining != null && remaining <= 0 ? 'is-empty' : 'is-free'}">
                <span class="lbl">Kalan</span><strong>${fmtKg(remaining)} kg</strong>
            </span>
        </div>
        <div class="alloc-holders">
            ${holders.length
                ? holders.map(h => `
                    <span class="alloc-holder">
                        <i class="fas ${h.type === 'team' ? 'fa-users' : 'fa-industry'}"></i>
                        ${esc(h.name)} <strong>${fmtKg(h.kg)} kg</strong>
                    </span>`).join('')
                : '<span class="text-muted small">Bu işe henüz atama yapılmamış.</span>'}
        </div>`;
}

function openAddJobModal(prefillTaskId = null) {
    const res = activeResource();
    if (!res) return;
    blockModalMode = { mode: 'add', prefillTaskId };

    const options = weldingTaskOptions();
    if (!options.length) {
        showNotification(
            'Atanabilir kaynak işi yok: işlerin toplam ağırlığı tanımlı ve atanmamış ağırlığı kalmış olmalı.',
            'error');
        return;
    }
    const isSub = res.resource_type === 'subcontractor';
    const prefillTask = prefillTaskId != null
        ? weldingTasks.find(t => t.welding_task_id === Number(prefillTaskId)) : null;
    const prefillIsOfferable = prefillTask
        && options.some(o => o.value === String(prefillTask.welding_task_id));
    const defaultTaskId = prefillIsOfferable ? String(prefillTask.welding_task_id) : options[0].value;
    const defaultTask = weldingTasks.find(t => String(t.welding_task_id) === defaultTaskId);
    const defaultRemaining = defaultTask
        ? remainingForTask(defaultTask.welding_task_id, defaultTask.total_weight_kg) : '';

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
                // Two-line options need the room; the component still clamps
                // this to whatever the viewport actually has.
                maxHeight: 460,
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
    bindJobAllocInfo(defaultTaskId);
    blockModal.show();
}

/**
 * Live "who holds what" panel under the job picker: total / assigned /
 * remaining for the selected job plus a chip per team and subcontractor,
 * refreshed whenever the selection changes.
 */
function bindJobAllocInfo(initialTaskId) {
    // The EditModal builds its ModernDropdown on a 100ms timer.
    setTimeout(() => {
        const dropdownEl = blockModal.container.querySelector('#dropdown-welding_task_id');
        const fieldWrap = dropdownEl?.closest('.dropdown-field-container') || dropdownEl;
        if (!fieldWrap) return;

        let panel = blockModal.container.querySelector('#job-alloc-info');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'job-alloc-info';
            panel.className = 'job-alloc-info';
            fieldWrap.parentElement.appendChild(panel);
        }

        const weightInput = blockModal.container.querySelector('#allocated_weight_kg');
        const refresh = (taskId) => {
            panel.innerHTML = jobAllocInfoHTML(taskId);
            const task = weldingTasks.find(t => String(t.welding_task_id) === String(taskId));
            if (task && weightInput) {
                const remaining = remainingForTask(task.welding_task_id, task.total_weight_kg);
                if (remaining != null && remaining > 0) weightInput.value = remaining;
            }
        };

        refresh(initialTaskId);
        dropdownEl.addEventListener('dropdown:select', (e) => refresh(e.detail?.value));
    }, 150);
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
            {
                id: 'notes', name: 'notes', label: 'Not', type: 'textarea',
                rows: 2, colSize: 12, value: block.notes || '',
                help: 'Kaynak alt görevinin notuna kaydedilir.',
            },
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
    collapsedJobs.delete(block.job_no);
    markBlockDirty(key);
    scheduleRefresh();
    showNotification('Blok eklendi — Kaydet ile kalıcılaşır.', 'info');
}

// ---- gantt ---------------------------------------------------------------

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
    const payload = {
        new_blocks: [], blocks: [], deleted_blocks: [], department_tasks: [],
    };

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
        // Notes are stored for both assignment kinds (on the subtask).
        if ((snap.notes || '') !== (b.notes || '')) {
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

    dirtyDept.forEach((fields, key) => {
        const [jobNo, slot] = key.split('|');
        const vm = deptOf(jobNo, slot);
        if (!vm) return;
        const item = { task_id: vm.task_id, status: vm.status };
        // An absent key means "unchanged" to the server, so the schedule trio
        // only travels when the planner actually touched one of them —
        // otherwise a status edit would freeze the derived start/duration in.
        if (SCHEDULE_FIELDS.some(f => fields.has(f))) {
            item.duration_wd = vm.duration_wd;
            item.start_date = vm.start_date;
            item.end_date = vm.end_date;
        }
        if (!vm.has_subtasks && fields.has('progress')) item.progress = vm.progress;
        if (fields.has('weight') && vm.weight != null) item.weight = vm.weight;
        payload.department_tasks.push(item);
    });

    // Talaşlı İmalat travels the same channel, but only ever its weight — the
    // server refuses a schedule on it, because those dates are its operations'.
    dirtyMachining.forEach((fields, jobNo) => {
        const vm = machiningByJob[jobNo];
        if (!vm || !fields.has('weight') || vm.weight == null) return;
        payload.department_tasks.push({ task_id: vm.task_id, weight: vm.weight });
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
    renderGrid();
    updateSaveState();
}

function switchResource(key) {
    if (key === activeResourceKey) return;
    activeResourceKey = key;
    renderTabs();
    renderGrid();
}

function init() {
    if (!guardRoute()) return;
    if (!initRouteProtection()) return;

    initNavbar();

    new HeaderComponent({
        // The sheet plans the whole manufacturing task now — machining,
        // welding and paint together — not just the welding assignments.
        title: 'İmalat Planlama',
        subtitle: 'İş emri bazında imalat takibi — talaşlı, kaynak, boya; süreler ve ilerleme',
        icon: 'industry',
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

    // xl, not md: the job picker's options carry the job, its tonnage, what is
    // already assigned and to whom, and the allocation panel sits under them.
    blockModal = new EditModal('block-modal-container', {
        title: 'İş Ekle', icon: 'fas fa-plus-circle', saveButtonText: 'Ekle', size: 'xl',
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

    initGridToolbar();

    window.addEventListener('beforeunload', (e) => {
        if (hasUnsavedChanges()) {
            e.preventDefault();
            e.returnValue = '';
        }
    });

    loadBoard();
}

document.addEventListener('DOMContentLoaded', init);
