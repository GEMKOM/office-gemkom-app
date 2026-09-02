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
import { defaultStagesFrom } from './defaultStages.js';
import { showNotification } from '../../../components/notification/notification.js';
import { EditModal } from '../../../components/edit-modal/edit-modal.js';
import { ConfirmationModal } from '../../../components/confirmation-modal/confirmation-modal.js';
import { ModernDropdown } from '../../../components/dropdown/dropdown.js';
import {
    getWeldingPlanningBoard,
    bulkSaveWeldingPlanning,
} from '../../../apis/welding/planning.js';
import { fetchPriceTiers } from '../../../apis/subcontracting/priceTiers.js';
import { createWorkdayCalendar, reconcileScheduleEdit } from '../../../utils/workdays.js';
import { deptSchedulePatch } from './deptSchedulePatch.js';
import {
    assignmentKey,
    knownAssignmentKeys,
    createdBlocksFromBoard,
    matchCreatedBlock,
    adoptStageIds,
    leftoverDeleted,
    shouldPostNewBlock,
    shouldHydrateAfterSave,
} from './saveReconcile.js';
import { exportPlanningPdf } from './pdf.js';

// ---- constants -----------------------------------------------------------

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

// Date edits reflow parent windows. Duration is independent İmalat sizing
// (top-down model, 2026-08-28) and must not travel with dates on save.
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
// Bumped on every working-copy mutation. Save + background board rebuild
// compare this to the value at send time: a later bump means the planner
// edited during the wait, so hydrate must not replace the working copy.
let mutationClock = 0;
let saveInFlight = false;

let liveForecastJobs = new Set(); // jobs edited this session -> live client projections
let activeResourceKey = null;     // 'team-3' / 'subcontractor-5'
let collapsedJobs = new Set();    // job_no -> collapsed in the grid
// The "Tümü" tab starts with every job folded — open, it is 700+ task rows —
// so it tracks the OPPOSITE state: the jobs the user explicitly opened.
// Separate from collapsedJobs so folding there doesn't fold the team sheets.
let expandedJobsAll = new Set();
let showCompleted = false;
let showEmptyResources = false;   // empty-resource tabs tucked behind a toggle
let newCounter = 0;

// View filters. Purely client-side — the whole board is already in memory, so
// they narrow what is drawn without touching the working copy or the edits in
// it. An empty selection means "no filter".
const UNASSIGNED = '__none__';
let filterJobNos = [];            // job_no strings; a job passes if it is any of them
let filterAssignee = '';          // user id as a string, or UNASSIGNED
let filterText = '';              // free text over job no + title + customer
let filterTextTimer = null;
let jobFilterDropdown = null;
let assigneeFilterDropdown = null;
let filterOptionsSig = '';        // rebuild the dropdowns only when the choices change

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

// Signed working-day gap between the job's promised end (hedef) and its
// projection: positive = the projection lands N workdays AFTER the hedef
// (geride), negative = ahead of it (ileride). Null when either side is
// unknown — 0 means exactly on target.
function targetDeltaWd(target, forecast) {
    if (!target || !forecast) return null;
    if (target === forecast) return 0;
    const [from, to] = forecast > target ? [target, forecast] : [forecast, target];
    let n = 0;
    let cur = from;
    for (let i = 0; i < 1000 && cur < to; i++) {
        const d = new Date(`${cur}T00:00:00`);
        d.setDate(d.getDate() + 1);
        cur = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (!calendar.isNonWorkingDay(cur)) n++;
    }
    return forecast > target ? n : -n;
}

function onAllTab() {
    return activeResourceKey === 'all';
}

function isJobCollapsed(jobNo) {
    return onAllTab() ? !expandedJobsAll.has(jobNo) : collapsedJobs.has(jobNo);
}

// Make a job's rows visible on whichever tab the user is looking at — used
// after creating something under it, so the result doesn't land folded away.
function revealJob(jobNo) {
    collapsedJobs.delete(jobNo);
    expandedJobsAll.add(jobNo);
}

// Every job with a visible block anywhere — the group rows of the "Tümü" tab.
function allSheetJobNos() {
    const seen = new Set();
    resources.forEach(res => visibleBlocks(res).forEach(b => seen.add(b.job_no)));
    return seen;
}

// The grid hides rows via a collapsed-job set. The team sheets hand it
// collapsedJobs directly; the "Tümü" tab materialises its inverse state.
function collapsedForGrid() {
    if (!onAllTab()) return collapsedJobs;
    const out = new Set();
    allSheetJobNos().forEach(jobNo => {
        if (!expandedJobsAll.has(jobNo)) out.add(jobNo);
    });
    return out;
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
        // Weight-share slice inherited down the ancestor chain (Üretim ->
        // Kaynaklı İmalat -> assignment -> this stage). Display + forecast
        // only — never written back unless the planner edits the row.
        duration_is_derived: !!s.duration_is_derived,
        duration_source: s.duration_source || null,
        entered_duration_wd: s.entered_duration_wd == null ? null : s.entered_duration_wd,
        start_date: s.start_date,
        end_date: s.end_date,
        projected_start_date: s.projected_start_date || null,
        projected_end_date: s.projected_end_date || null,
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
        has_statement_line: !!b.has_statement_line,
        price_tier: b.price_tier,
        notes: b.notes || '',
        subtask: {
            status: b.subtask.status,
            progress: Number(b.subtask.progress ?? 0),
            start_date: b.subtask.start_date,
            end_date: b.subtask.end_date,
            duration_wd: b.subtask.duration_wd,
            duration_is_derived: !!b.subtask.duration_is_derived,
            duration_source: b.subtask.duration_source || null,
            entered_duration_wd: (b.subtask.entered_duration_wd == null
                ? null : b.subtask.entered_duration_wd),
            completed_at: b.subtask.completed_at || null,
            forecast_date: b.subtask.forecast_date || null,
            forecast_kind: b.subtask.forecast_kind || null,
            projected_start_date: b.subtask.projected_start_date || null,
            projected_end_date: b.subtask.projected_end_date || null,
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
    // Fresh server truth supersedes every live client approximation.
    liveForecastJobs.clear();
    jobHayCache.clear();
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
                // The weight split has to know when this row is out of scope
                // — a skipped Talaşlı takes no share of the İmalat number.
                status: machining.status,
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

    if (activeResourceKey !== 'all'
            && (!activeResourceKey
                || !resources.some(r => resourceKeyOf(r) === activeResourceKey))) {
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

function bumpMutation() {
    mutationClock += 1;
}

function markBlockDirty(blockRef) {
    dirtyBlocks.add(blockRef);
    bumpMutation();
    const block = findBlock(blockRef);
    if (block && block.job_no) liveForecastJobs.add(block.job_no);
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
        // Only the manufacturing main task carries these — it is the job's
        // owner, and what the Sorumlu filter matches on.
        assigned_to: row.assigned_to ?? null,
        assigned_to_name: row.assigned_to_name || '',
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
        projected_start_date: row.projected_start_date || null,
        projected_end_date: row.projected_end_date || null,
    };
}

function deptOf(jobNo, slot) {
    return (deptByJob[jobNo] || {})[slot] || null;
}

function markMachiningDirty(jobNo, field) {
    const fields = dirtyMachining.get(jobNo) || new Set();
    if (field) fields.add(field);
    dirtyMachining.set(jobNo, fields);
    liveForecastJobs.add(jobNo);
    bumpMutation();
    updateSaveState();
}

function markDeptDirty(jobNo, slot, field) {
    const key = `${jobNo}|${slot}`;
    const fields = dirtyDept.get(key) || new Set();
    if (field) fields.add(field);
    dirtyDept.set(key, fields);
    liveForecastJobs.add(jobNo);
    bumpMutation();
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
    return round2(total);
}

// ---- filters -------------------------------------------------------------

// Every job order the board can display: assigned blocks AND the assignable
// (welding-task) jobs the "Tümü" tab lists — the filter must be able to name
// an unassigned job too, or searching for it comes up empty.
function boardJobs() {
    const seen = new Map();       // job_no -> job_order_title
    resources.forEach(res => res.blocks.forEach(b => {
        if (b.deleted || !b.job_no) return;
        if (!seen.has(b.job_no)) seen.set(b.job_no, b.job_order_title || '');
    }));
    weldingTasks.forEach(t => {
        if (t.job_no && !seen.has(t.job_no)) {
            seen.set(t.job_no, t.job_order_title || '');
        }
    });
    return seen;
}

// Turkish-aware lowering: 'İ' -> 'i', 'I' -> 'ı'. Plain toLowerCase maps 'İ'
// to 'i' + a combining dot, which never matches a typed 'i'.
function trLower(s) {
    return String(s || '').toLocaleLowerCase('tr');
}

// Everything the free-text search can match for one job. Titles never change
// client-side, so the fold is cached until the next hydrate.
const jobHayCache = new Map();
function jobSearchHay(jobNo) {
    let hay = jobHayCache.get(jobNo);
    if (hay !== undefined) return hay;
    const parts = [String(jobNo)];
    const jo = (jobInfo[jobNo] || {}).job_order;
    if (jo && jo.title) parts.push(jo.title);
    const wt = weldingTasks.find(t => t.job_no === jobNo);
    if (wt) parts.push(wt.job_order_title || '', wt.customer_name || '');
    resources.some(res => res.blocks.some(b => {
        if (b.deleted || b.job_no !== jobNo) return false;
        parts.push(b.job_order_title || '', b.customer_name || '');
        return true;
    }));
    hay = trLower(parts.filter(Boolean).join(' '));
    jobHayCache.set(jobNo, hay);
    return hay;
}

// The job's owner: whoever holds its İmalat main task. NOT the resource the
// welding was handed to — that is the tab strip's job.
function jobAssignee(jobNo) {
    const mfg = deptOf(jobNo, 'manufacturing');
    const id = mfg ? mfg.assigned_to : null;
    return (id === null || id === undefined) ? null : String(id);
}

function hasActiveFilter() {
    return !!(filterJobNos.length || filterAssignee || filterText.trim());
}

function jobMatchesFilters(jobNo) {
    if (filterJobNos.length && !filterJobNos.includes(String(jobNo))) return false;
    const text = trLower(filterText.trim());
    if (text && !jobSearchHay(jobNo).includes(text)) return false;
    if (filterAssignee) {
        const assignee = jobAssignee(jobNo);
        return filterAssignee === UNASSIGNED ? assignee === null : assignee === filterAssignee;
    }
    return true;
}

// A resource's live blocks that survive the filters. Deleted blocks are gone
// from every count; filtered-out ones are only hidden, so nothing about the
// working copy or the save payload changes.
function visibleBlocks(res) {
    return res.blocks.filter(b => !b.deleted && jobMatchesFilters(b.job_no));
}

function jobFilterOptions() {
    // Some job titles run to 200 characters (the EBT panels carry their whole
    // part spec). The option shows enough to recognise the job, the collapsed
    // field shows the number alone, and the search still reads the full title.
    const shorten = (title) => (title.length > 44 ? `${title.slice(0, 43)}…` : title);
    // No "all" head option: the dropdown is multi-select, so an empty
    // selection already means every job, and the placeholder says so.
    return [...boardJobs().entries()]
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'tr',
            { numeric: true, sensitivity: 'base' }))
        .map(([jobNo, title]) => ({
            value: String(jobNo),
            text: title ? `${jobNo} — ${shorten(title)}` : String(jobNo),
            searchText: title ? `${jobNo} ${title}` : String(jobNo),
            selectedText: String(jobNo),
        }));
}

function assigneeFilterOptions() {
    const byId = new Map();
    let anyUnassigned = false;
    boardJobs().forEach((_title, jobNo) => {
        const id = jobAssignee(jobNo);
        if (id === null) { anyUnassigned = true; return; }
        if (!byId.has(id)) {
            const mfg = deptOf(jobNo, 'manufacturing');
            byId.set(id, (mfg && mfg.assigned_to_name) || `#${id}`);
        }
    });
    const options = [...byId.entries()]
        .sort((a, b) => a[1].localeCompare(b[1], 'tr'))
        .map(([id, name]) => ({ value: id, text: name }));
    if (anyUnassigned) options.push({ value: UNASSIGNED, text: 'Atanmamış' });
    return [{ value: '', text: 'Tüm sorumlular' }, ...options];
}

// The dropdowns are rebuilt only when the choices themselves change — a board
// reload or a newly added block. Rebuilding on every grid refresh would drop
// the menu out from under an open dropdown.
function renderFilters() {
    const jobOptions = jobFilterOptions();
    const assigneeOptions = assigneeFilterOptions();
    const sig = JSON.stringify([jobOptions, assigneeOptions]);

    if (sig !== filterOptionsSig) {
        filterOptionsSig = sig;
        // A filtered-out value that no longer exists (the job finished, its
        // owner changed) would hide the whole board with no way back.
        filterJobNos = filterJobNos.filter(v => jobOptions.some(o => o.value === v));
        if (filterAssignee && !assigneeOptions.some(o => o.value === filterAssignee)) {
            filterAssignee = '';
        }
        buildFilterDropdown('job', jobOptions);
        buildFilterDropdown('assignee', assigneeOptions);
    }
    renderFilterChrome();
}

function buildFilterDropdown(which, options) {
    const container = document.getElementById(`filter-${which}`);
    if (!container) return;
    const isJob = which === 'job';
    const existing = isJob ? jobFilterDropdown : assigneeFilterDropdown;
    if (existing) existing.destroy();

    const dropdown = new ModernDropdown(container, {
        placeholder: isJob ? 'Tüm iş emirleri' : 'Tüm sorumlular',
        // Job numbers run to dozens; the owner list is a handful of names.
        // Both cutoffs mean "more than 7 real choices" — the assignee list
        // still carries a "Tüm sorumlular" head row, the job list does not.
        searchable: options.length > (isJob ? 7 : 8),
        // Planners compare a handful of jobs side by side, so the job filter
        // takes any number of them.
        multiple: isJob,
    });
    dropdown.setItems(options);
    if (isJob) {
        // Copy: setValue keeps the array it is handed, and the dropdown
        // mutates its own copy as boxes are ticked.
        dropdown.setValue([...filterJobNos]);
        jobFilterDropdown = dropdown;
    } else {
        if (filterAssignee) dropdown.setValue(filterAssignee);
        assigneeFilterDropdown = dropdown;
    }
}

function clearFilters() {
    if (!hasActiveFilter()) return;
    filterJobNos = [];
    filterAssignee = '';
    filterText = '';
    const textInput = document.getElementById('filter-text');
    if (textInput) textInput.value = '';
    if (jobFilterDropdown) jobFilterDropdown.setValue([]);
    if (assigneeFilterDropdown) assigneeFilterDropdown.setValue('');
    onFilterChange();
}

// Filtering to a job that is not on the open sheet would leave the planner
// staring at an empty grid, so the strip moves to a tab that has it. The
// "Tümü" tab shows everything already — never hop away from it; hop TO it
// when the only matches are unassigned rows no team sheet can show.
function onFilterChange() {
    const res = activeResource();
    if (hasActiveFilter() && activeResourceKey !== 'all'
            && (!res || !visibleBlocks(res).length)) {
        const next = resources.find(r => visibleBlocks(r).length);
        activeResourceKey = next ? resourceKeyOf(next) : 'all';
    }
    renderFilterChrome();
    renderTabs();
    renderGrid();
}

function renderFilterChrome() {
    const clearBtn = document.getElementById('filter-clear');
    if (clearBtn) clearBtn.classList.toggle('d-none', !hasActiveFilter());

    const summary = document.getElementById('filter-summary');
    if (!summary) return;
    if (!hasActiveFilter()) {
        summary.textContent = '';
        summary.classList.remove('pf-empty');
        return;
    }
    const jobs = new Set();
    let resourceCount = 0;
    resources.forEach(res => {
        const blocks = visibleBlocks(res);
        if (!blocks.length) return;
        resourceCount += 1;
        blocks.forEach(b => jobs.add(b.job_no));
    });
    const empty = !jobs.size;
    summary.classList.toggle('pf-empty', empty);
    summary.textContent = empty
        ? 'Filtreye uyan iş bulunamadı'
        : `${jobs.size} iş emri · ${resourceCount} kaynak`;
}

// ---- rendering: tabs, warnings, jobs list --------------------------------

function renderTabs() {
    const container = document.getElementById('resource-tabs');
    if (!container) return;
    // Custom tab class on purpose — navbar.css hijacks the global .nav-link
    // class with !important white text/backgrounds meant for the top navbar.
    const tabHTML = (res) => {
        const key = resourceKeyOf(res);
        // Counts follow the filters, so the strip itself answers "who is on
        // this job" — the resources without it drop behind the +N toggle.
        const blocks = visibleBlocks(res);
        const blockCount = blocks.length;
        const totalKg = blocks.reduce((sum, b) => sum + Number(b.allocated_weight_kg || 0), 0);
        // Unsaved work is never hidden by a view filter.
        const dirty = res.blocks.some(b => dirtyBlocks.has(b.key))
            || deletedBlocks.some(d => d.resourceKey === key);
        const icon = res.resource_type === 'team' ? 'fa-users' : 'fa-industry';
        const classes = ['planning-tab'];
        if (key === activeResourceKey) classes.push('active');
        if (!blockCount) classes.push('empty');
        const emptyHint = hasActiveFilter() ? ' — filtreye uyan iş yok' : ' — atanmış iş yok';
        return `
            <button type="button" class="${classes.join(' ')}" data-resource-key="${esc(key)}"
                    title="${esc(res.name)}${blockCount ? ` — ${blockCount} iş, ${fmtKg(totalKg)} kg` : emptyHint}">
                <i class="fas ${icon}"></i>
                <span class="tab-label">${esc(res.display_name || res.name)}</span>
                ${blockCount ? `<span class="resource-kg">${fmtKg(totalKg)} kg</span>` : ''}
                ${dirty ? '<span class="dirty-dot" title="Kaydedilmemiş değişiklik"></span>' : ''}
            </button>`;
    };

    const hasBlocks = (res) => visibleBlocks(res).length > 0;
    const filled = resources.filter(hasBlocks);
    // Empty resources stay reachable but don't eat rows of the strip; the
    // active one is always shown even when empty.
    const empty = resources.filter(res => !hasBlocks(res));
    const visibleEmpty = showEmptyResources
        ? empty
        : empty.filter(res => resourceKeyOf(res) === activeResourceKey);
    const hiddenCount = empty.length - visibleEmpty.length;

    // "Tümü": every resource's jobs plus the unassigned ones on one sheet.
    const totalBlocks = resources.reduce(
        (acc, res) => acc + visibleBlocks(res).length, 0);
    const allTab = `
        <button type="button" class="planning-tab${activeResourceKey === 'all' ? ' active' : ''}"
                data-resource-key="all"
                title="Bütün iş emirleri — atanmışlar kaynak sırasıyla, atanmamışlar sonda">
            <i class="fas fa-table-list"></i>
            <span class="tab-label">Tümü</span>
            ${totalBlocks ? `<span class="resource-kg">${totalBlocks} atama</span>` : ''}
        </button>`;

    container.innerHTML = [
        allTab,
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
    engine: 'Üretim planı öngörüsü (proje takibi ile aynı hesap) — bu göreve girilmiş bir tarih değil',
};

// Derived rows borrow the forecast engine's projected window for display and
// for their gantt bar — nothing here is written back. Sources are tracked
// PER FIELD: an İmalat row's entered start must not carry the "engine"
// styling its projected end earns.
function withEngineDates(row, vm) {
    if (row.start_date == null && vm.projected_start_date) {
        row.start_date = vm.projected_start_date;
        row.start_date_source = row.start_date_source || 'engine';
    }
    if (row.end_date == null && vm.projected_end_date) {
        row.end_date = vm.projected_end_date;
        row.end_date_source = row.end_date_source || 'engine';
    }
    return row;
}

// Başlangıç and Bitiş on this sheet are the PLAN (user 2026-09-01: "we enter
// start date and duration, then all other dates and durations should
// propagate based on the weight; on save, save them as the actual data of
// each task"). The server lays that plan out from the İmalat entry by weight
// and stores it on every row, so here the STORED value is what shows — the
// forecast has its own column (Gerçek./Tahmini) and its own home on project
// tracking. Before 2026-09-01 both cells showed the engine's projection,
// which is how Kaynaklı İmalat came to display 12.08 (two welders' 3 hours)
// against an İmalat start of 31.08.
//
// The projection still fills a gap — a row the plan has nothing to say about
// — and while a job carries unsaved edits the client's own cascade owns both
// columns (`live`), so typing a start or a duration re-lays the rows below it
// before saving. `keepStart` is for the İmalat row: its start is the
// planner's single date input and must show exactly as typed.
function withDerivedDates(row, vm, { keepStart = false } = {}) {
    if (!['completed', 'cancelled', 'skipped'].includes(row.status)) {
        if (!keepStart && row.start_date == null && vm.projected_start_date) {
            row.start_date = vm.projected_start_date;
            row.start_date_source = row.start_date_source || 'engine';
        }
        if (row.end_date == null && vm.projected_end_date) {
            row.end_date = vm.projected_end_date;
            row.end_date_source = row.end_date_source || 'engine';
        }
    }
    return withEngineDates(row, vm);
}

// The Bitiş cell of a row that carries the job hedef says, on hover, how far
// the projection sits from it: "2 gün geride" (late) / "2 gün ileride" (ahead).
function endDateCell(value, row) {
    const d = row.job_target_delta_wd;
    if ((row.kind === 'group' || row.unassignedRow) && value && d != null && d !== 0) {
        const text = d > 0
            ? `Öngörülen bitiş hedeften ${d} gün geride`
            : `Öngörülen bitiş hedeften ${Math.abs(d)} gün ileride`;
        return `<span title="${esc(text)}">${fmtDate(value)}</span>`;
    }
    return dateCell(value, row.end_is_actual, row, 'end_date');
}

function dateCell(value, isActual, row, field) {
    if (!value) return '<span class="text-muted">—</span>';
    const source = row && ((field && row[`${field}_source`]) ?? row.date_source);
    const derived = row && DATE_SOURCE_TITLES[source];
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

// Actual completion date for finished rows, the ENGINE's projected finish for
// open ones — the same arithmetic project tracking shows, per row (user
// decision 2026-08-28: one forecast, not two).
const FORECAST_KIND_TITLES = {
    rate: 'ölçülen tempoya göre',
    duration: 'girilen sürenin bütçesine göre',
    parent_duration: 'üst görevden inen süre payına göre',
    parent_window: 'plan penceresi payına göre',
    start: 'plan penceresine göre',
    subtasks: 'en geç biten alt görevine göre',
    push: 'önceki görevin bitişine göre',
    chained: 'kalan işin önceki görevden sonra sayılmasıyla',
    gate: 'başlama koşuluna göre',
    floored: 'bitiş tabanına (teslimat/koşul) göre',
    coupled: 'kesim ilerleyişine göre',
    weight: 'ağırlık payı tahminiyle',
    done: 'kapanış bekleniyor',
};

function forecastCell(row) {
    if (!row.forecast_date) return '<span class="text-muted">—</span>';
    const isActual = row.forecast_kind === 'actual';
    // Lateness is measured against the JOB ORDER's promised end (the target
    // line on the gantt) — falling back to the row's own end where the job
    // has no promise.
    const jobLate = !isActual && row.job_target
        && row.forecast_date > row.job_target;
    const ownLate = !isActual && !row.job_target && row.end_date
        && row.forecast_date > row.end_date;
    const late = jobLate || ownLate;
    const cls = ['forecast-cell'];
    if (isActual) cls.push('actual');
    if (late) cls.push('late');
    const how = FORECAST_KIND_TITLES[row.forecast_kind];
    const title = isActual
        ? 'Gerçekleşen tamamlanma tarihi'
        : `Üretim planı öngörüsü${how ? ` — ${how}` : ''} (proje takibi ile aynı hesap)`;
    const lateNote = jobLate
        ? ` — iş emri hedefinden (${fmtDate(row.job_target)}) sonra`
        : (ownLate ? ' (hedefin gerisinde)' : '');
    return `
        <span class="${cls.join(' ')}" title="${title}${lateNote}">
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
    visibleBlocks(res).forEach(b => {
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
function buildSheetRows(res, sortJobs = false) {
    const rows = [];

    const jobList = sortJobs
        ? jobNosOf(res).slice().sort((a, b) =>
            String(a).localeCompare(String(b), 'tr', { numeric: true }))
        : jobNosOf(res);
    jobList.forEach(jobNo => {
        const blocks = res.blocks.filter(b => !b.deleted && b.job_no === jobNo);
        const first = blocks[0] || {};
        const info = jobInfo[jobNo] || {};
        const jo = info.job_order || null;
        // The job order's promised end rides on EVERY row of the group: the
        // gantt draws it as one continuous target line, and forecast cells
        // compare against it. Late = the İmalat engine projection overshoots.
        const mfgForecast = (deptOf(jobNo, 'manufacturing') || {}).forecast_date || null;
        const jobLate = !!(jo && jo.end_date && mfgForecast && mfgForecast > jo.end_date);
        const base = {
            job_no: jobNo,
            groupKey: jobNo,
            job_target: jo ? jo.end_date : null,
            job_target_late: jobLate,
            // How far the projection sits from the hedef, in workdays —
            // the "+2 gün / −2 gün" label on the gantt.
            job_target_delta_wd: targetDeltaWd(jo ? jo.end_date : null, mfgForecast),
        };

        // The job order frames everything under it. It is not a department
        // task and nothing here edits it — its dates are when the order was
        // opened and when it was promised.
        rows.push({
            ...base,
            key: `${jobNo}-group`,
            kind: 'group',
            groupKey: null,
            indent: 0,
            collapsed: isJobCollapsed(jobNo),
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
            // The job's Öngörü is İmalat's engine projection — comparing it
            // with end_date (the promised date) is the group's whole story.
            forecast_date: mfgForecast,
            forecast_kind: (deptOf(jobNo, 'manufacturing') || {}).forecast_kind || null,
            note: '',
        });

        const infoRow = (item, label, kind, indent) => withEngineDates({
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
        }, item);

        const deptRow = (slot, label, indent) => {
            const vm = deptOf(jobNo, slot);
            if (!vm) return null;
            // İmalat keeps its entered start (the single date input); its
            // end and every other dept row's window are projections.
            return withDerivedDates({
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
                // What the last save actually stored — the container rule
                // below only fills in when there is nothing stored.
                entered_start_date: vm.entered_start_date,
                completed_at: vm.completed_at,
                forecast_date: vm.forecast_date,
                forecast_kind: vm.forecast_kind,
                note: '',
            }, vm, { keepStart: slot === 'manufacturing' });
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
        const weldingBlockStarts = [];

        blocks.forEach(b => {
            const staged = b.stages.filter(s => !s.deleted);
            const rollup = blockRollup(b);
            // With stages, the assignment row is their rollup and reports only.
            // Without them, it IS the schedule and takes the edits directly —
            // which is also the only shape the server accepts a subtask
            // schedule for.
            rows.push(withDerivedDates({
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
                duration_is_derived: staged.length
                    ? rollup.totalDays != null
                    : !!b.subtask.duration_is_derived,
                duration_source: staged.length
                    ? (rollup.totalDays != null ? 'children_span' : null)
                    : b.subtask.duration_source,
                entered_duration_wd: b.subtask.entered_duration_wd ?? null,
                weight: b.allocated_weight_kg,
                weight_is_kg: true,
                progress: staged.length ? rollup.progress : b.subtask.progress,
                status: staged.length ? rollup.derived : b.subtask.status,
                completed_at: staged.length ? null : b.subtask.completed_at,
                forecast_date: staged.length ? rollup.forecastDate : b.subtask.forecast_date,
                forecast_kind: staged.length ? rollup.forecastKind : b.subtask.forecast_kind,
                note: b.notes,
            }, b.subtask));
            const blockStart = rows[rows.length - 1].start_date;
            if (blockStart) weldingBlockStarts.push(blockStart);

            staged.forEach(s => rows.push(withDerivedDates({
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
                duration_is_derived: !!s.duration_is_derived,
                duration_source: s.duration_source || null,
                entered_duration_wd: s.entered_duration_wd ?? null,
                weight: s.weight,
                progress: s.progress,
                status: s.status,
                completed_at: s.completed_at,
                forecast_date: s.forecast_date,
                forecast_kind: s.forecast_kind,
                note: s.note,
            }, s)));
        });

        // Kaynaklı İmalat is a container: its start is where its blocks
        // start. Without this it fell back to the job's first welding time
        // entry — real evidence, but not a plan — so the row sat 12.08 while
        // the İmalat entry above it said 31.08 and the blocks below said
        // 31.08, and it never moved when the İmalat start was re-typed
        // (user 2026-09-01, 009-37). A stored start still wins: after a save
        // the row shows exactly what was written.
        if (welding && !welding.entered_start_date && weldingBlockStarts.length) {
            const earliest = weldingBlockStarts.reduce((a, b) => (a < b ? a : b));
            if (welding.start_date !== earliest) {
                welding.start_date = earliest;
                welding.start_date_source = 'engine';
                welding.start_is_actual = false;
            }
        }

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
    // Projection-first (2026-08-31): stored dates are last-save snapshots,
    // so the rollup window follows the live projections when they exist.
    const starts = dated.map(s => s.projected_start_date || s.start_date).filter(Boolean).sort();
    const ends = dated.map(s => s.projected_end_date || s.end_date).filter(Boolean).sort();
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
      formatter: (v, row) => cellOverride(row, 'start_date') ?? dateCell(v, row.start_is_actual, row, 'start_date') },
    { field: 'end_date', label: 'Bitiş', width: '96px', type: 'date',
      headerClass: 'col-center', cellClass: 'col-center col-date', always: true,
      formatter: (v, row) => cellOverride(row, 'end_date') ?? endDateCell(v, row) },
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
              // A partially assigned job says how much is out right in the
              // weight cell — the note column is usually hidden.
              ? (row.allocated_kg != null
                  ? `<span class="weight-readonly" title="Atanan ${fmtKg(row.allocated_kg)} kg — Kalan ${fmtKg(round2(v - row.allocated_kg))} kg">${fmtKg(row.allocated_kg)} / ${fmtKg(v)} kg</span>`
                  : `<span class="weight-readonly">${fmtKg(v)} kg</span>`)
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
const READ_ONLY_KINDS = ['group', 'info', 'band', 'unassigned'];
const SCHEDULE_ONLY = ['start_date', 'end_date', 'duration_wd', 'status'];

// Per cell, not per row. Showing a cell as editable and then throwing when it
// is touched is a worse answer than not offering it: the planner learns the
// rule from the cursor instead of from an error.
function isCellEditable(row, field) {
    if (READ_ONLY_KINDS.includes(row.kind)) return false;
    // Skipped work is display-only — the row exists to say what happened to
    // it, not to be planned. (Cancelled stays editable: scheduling a
    // cancelled stage is how it is brought back.)
    if (row.status === 'skipped') return false;
    // ONE duration entry point (top-down model, 2026-08-28): the İmalat
    // row. Everything under it — Kaynaklı İmalat, Boya, blocks, stages —
    // sizes as a live weight-share slice of that number; weights are the
    // lever, dates remain free (scheduling is a different decision).
    if (field === 'duration_wd'
            && !(row.kind === 'dept' && row.slot === 'manufacturing')) {
        return false;
    }
    // ONE date entry point too (user decision 2026-08-28): the İmalat START.
    // Every other date on the sheet is DERIVED — the forecast engine projects
    // the schedule from that start, the entered duration and the progress,
    // with the same arithmetic project tracking uses. İmalat's own end is
    // the engine's projection; its Hedef lives on project tracking.
    if (field === 'start_date' || field === 'end_date') {
        return field === 'start_date'
            && row.kind === 'dept' && row.slot === 'manufacturing';
    }
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

// Live top-down duration propagation (user model 2026-08-28): the İmalat
// entry divides down by weight at every level — dept rows, blocks, stages —
// recomputed from the CURRENT VMs on every render, so a weight edit, a new
// stage or a changed İmalat number redistributes instantly. Only rows with
// no entered duration take the slice (legacy per-child entries display until
// saving the İmalat number purges them server-side). The server recomputes
// authoritatively on reload — this is the same arithmetic, sooner.
function rederiveDerivedDurations() {
    const round1 = (v) => Math.round(v * 10) / 10;
    const w = (x) => Number(x || 0);

    const jobBlocks = {};
    resources.forEach(res => res.blocks.forEach(b => {
        if (b.deleted) return;
        (jobBlocks[b.job_no] = jobBlocks[b.job_no] || []).push(b);
    }));

    Object.entries(deptByJob).forEach(([jobNo, slots]) => {
        const imalat = slots.manufacturing;
        if (!imalat) return;
        const top = imalat.entered_duration_wd != null
            ? Number(imalat.entered_duration_wd)
            : (!imalat.duration_is_derived && imalat.duration_wd != null
                ? Number(imalat.duration_wd) : null);
        if (top == null || top <= 0) return;

        const skipped = (vm) => !vm || ['cancelled', 'skipped'].includes(vm.status);
        const weld = skipped(slots.welding) ? null : slots.welding;
        const paint = skipped(slots.painting) ? null : slots.painting;
        // A skipped row takes no share of the İmalat number — the server's
        // plan split drops it the same way (plan_windows.live()).
        const mach = skipped(machiningByJob[jobNo]) ? null : machiningByJob[jobNo];
        const sibSum = w(weld && weld.weight) + w(paint && paint.weight)
            + w(mach && mach.weight);
        if (sibSum <= 0) return;

        const setSlice = (vm, value) => {
            if (!vm || vm.entered_duration_wd != null) return;
            vm.duration_wd = round1(value);
            vm.duration_is_derived = true;
            vm.duration_source = 'weight_share';
        };

        const weldSlice = top * w(weld && weld.weight) / sibSum;
        setSlice(weld, weldSlice);
        setSlice(paint, top * w(paint && paint.weight) / sibSum);

        const blocks = (jobBlocks[jobNo] || []);
        const kgSum = blocks.reduce((acc, b) => acc + w(b.allocated_weight_kg), 0);
        blocks.forEach(b => {
            if (kgSum <= 0) return;
            const blockSlice = weldSlice * w(b.allocated_weight_kg) / kgSum;
            setSlice(b.subtask, blockSlice);
            const live = b.stages.filter(s => !s.deleted && s.status !== 'cancelled');
            const stageSum = live.reduce((acc, s) => acc + w(s.weight), 0);
            if (stageSum <= 0) return;
            live.forEach(s => setSlice(s, blockSlice * w(s.weight) / stageSum));
        });
    });
}

// The PLAN, laid out live for a job the planner is editing — the client
// mirror of projects/services/plan_windows.py, so typing an İmalat start or
// duration moves every row under it before the save does (user 2026-09-01:
// the sheet showed İmalat on 01.09 with Kaynaklı İmalat still on 31.08 until
// Kaydet). Same shape as the server: Kaynaklı and Talaşlı run side by side
// from the start, Boya follows them, blocks are parallel and stages
// sequential, and machining keeps the operations' dates.
function rederivePlanWindows() {
    if (!liveForecastJobs.size) return;
    const w = (x) => Number(x || 0);
    const live = (vm) => vm && !['cancelled', 'skipped'].includes(vm.status);
    const spanEnd = (start, days) => calendar.spanEnd(start, Math.max(days, 0.1));
    const nextWorkday = (d) => {
        const p = new Date(`${d}T00:00:00`);
        do {
            p.setDate(p.getDate() + 1);
        } while (calendar.isNonWorkingDay(
            `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}-${String(p.getDate()).padStart(2, '0')}`));
        return `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}-${String(p.getDate()).padStart(2, '0')}`;
    };
    const later = (a, b) => (a && b ? (a > b ? a : b) : (a || b));

    const jobBlocks = {};
    resources.forEach(res => res.blocks.forEach(b => {
        if (b.deleted) return;
        (jobBlocks[b.job_no] = jobBlocks[b.job_no] || []).push(b);
    }));

    liveForecastJobs.forEach(jobNo => {
        const slots = deptByJob[jobNo] || {};
        const imalat = slots.manufacturing;
        if (!imalat || !imalat.start_date) return;
        const total = imalat.entered_duration_wd != null
            ? Number(imalat.entered_duration_wd)
            : (imalat.duration_wd != null ? Number(imalat.duration_wd) : null);
        if (!total || total <= 0) return;

        const start = imalat.start_date;
        const weld = live(slots.welding) ? slots.welding : null;
        const paint = live(slots.painting) ? slots.painting : null;
        // A skipped Talaşlı takes no share — the server's split drops it the
        // same way, and counting it here shrank every other row's slice.
        const machRow = machiningByJob[jobNo];
        const mach = live(machRow) ? machRow : null;
        const sibSum = w(weld && weld.weight) + w(paint && paint.weight) + w(mach && mach.weight);
        if (sibSum <= 0) return;

        const set = (vm, from, days) => {
            if (!vm) return null;
            const end = spanEnd(from, days);
            vm.start_date = from;
            vm.end_date = end;
            vm.start_is_actual = false;
            vm.end_is_actual = false;
            return end;
        };

        let parallelEnd = null;
        if (mach) parallelEnd = later(parallelEnd, spanEnd(start, total * w(mach.weight) / sibSum));
        if (weld) {
            const weldDays = total * w(weld.weight) / sibSum;
            let weldEnd = set(weld, start, weldDays);
            const blocks = jobBlocks[jobNo] || [];
            const kgSum = blocks.reduce((acc, b) => acc + w(b.allocated_weight_kg), 0);
            blocks.forEach(b => {
                if (kgSum <= 0) return;
                const blockDays = weldDays * w(b.allocated_weight_kg) / kgSum;
                const blockEnd = set(b.subtask, start, blockDays);
                const stages = b.stages.filter(s => !s.deleted && s.status !== 'cancelled');
                const stageSum = stages.reduce((acc, s) => acc + w(s.weight), 0);
                let cursor = start, deepest = null;
                stages.forEach(s => {
                    if (stageSum <= 0) return;
                    const e = set(s, cursor, blockDays * w(s.weight) / stageSum);
                    deepest = later(deepest, e);
                    cursor = nextWorkday(e);
                });
                if (deepest && deepest > blockEnd) b.subtask.end_date = deepest;
                weldEnd = later(weldEnd, b.subtask.end_date);
            });
            weld.end_date = weldEnd;
            parallelEnd = later(parallelEnd, weldEnd);
        }
        let latest = parallelEnd;
        if (paint) {
            const paintStart = parallelEnd ? nextWorkday(parallelEnd) : start;
            latest = later(latest, set(paint, paintStart, total * w(paint.weight) / sibSum));
        }
        // The İmalat row covers what it contains — its own span, extended if
        // the paint tail spills past it.
        imalat.end_date = later(spanEnd(start, total), latest);
        imalat.end_is_actual = false;
    });
}

// Live parent-progress rollup (user: "when a subtask's progress changes,
// the parents don't change before saving"): a stage edit re-weights its
// block, the Kaynaklı İmalat row and İmalat immediately — display only;
// parent progress is never sent, the server recomputes the same rollup.
function rederiveProgress() {
    const cap99 = (p) => Math.min(Number(p || 0), 99);
    const jobBlocks = {};
    resources.forEach(res => res.blocks.forEach(b => {
        if (b.deleted) return;
        (jobBlocks[b.job_no] = jobBlocks[b.job_no] || []).push(b);
    }));
    Object.entries(deptByJob).forEach(([jobNo, slots]) => {
        const weld = slots.welding;
        const blocks = jobBlocks[jobNo] || [];
        if (weld && weld.status !== 'completed' && blocks.length) {
            let wSum = 0;
            let earned = 0;
            blocks.forEach(b => {
                if (['cancelled', 'skipped'].includes(b.subtask.status)) return;
                const hasStages = b.stages.some(s => !s.deleted);
                const pct = b.subtask.status === 'completed' ? 100
                    : cap99(hasStages ? blockRollup(b).progress : b.subtask.progress);
                const w = Number(b.allocated_weight_kg || 0);
                wSum += w;
                earned += w * pct;
            });
            if (wSum > 0) weld.progress = Math.round(earned / wSum * 100) / 100;
        }
        const imalat = slots.manufacturing;
        if (imalat && imalat.status !== 'completed') {
            const machInfo = ((jobInfo[jobNo] || {}).machining || [])[0];
            const parts = [];
            if (weld) parts.push([weld.weight, weld.status, weld.progress]);
            if (machInfo) parts.push([machInfo.weight, machInfo.status, machInfo.progress]);
            if (slots.painting) {
                parts.push([slots.painting.weight, slots.painting.status,
                            slots.painting.progress]);
            }
            let wSum = 0;
            let earned = 0;
            parts.forEach(([w, st, p]) => {
                if (['cancelled', 'skipped'].includes(st)) return;
                const wp = Number(w || 0);
                wSum += wp;
                earned += wp * (st === 'completed' ? 100 : cap99(p));
            });
            if (wSum > 0) imalat.progress = Math.round(earned / wSum * 100) / 100;
        }
    });
}

// LIVE projections for jobs the planner just edited (user asks 2026-08-29):
// a client mini-SCHEDULER over the system's workday calendar — from the
// İmalat start, stages lay out sequentially within each block, blocks run
// in parallel, Kaynaklı İmalat is the latest block, Boya always starts the
// next workday AFTER welding and machining finish, and İmalat ends with its
// last child. Duration, progress and START edits all re-cascade instantly;
// a started row keeps its real start and projects the remaining share of
// its budget from today ("if it moves faster"). Measured tempo, material
// floors and machining operations stay the server engine's job — the
// save's fresh board restores the exact numbers, and untouched jobs keep
// engine values verbatim.
function rederiveEngineDates() {
    if (!liveForecastJobs.size) return;
    const today = todayStr();
    const later = (a, b) => (a && b ? (a > b ? a : b) : (a || b));
    const nextDay = (d) => {
        const p = new Date(`${d}T00:00:00`);
        p.setDate(p.getDate() + 1);
        return `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}-${String(p.getDate()).padStart(2, '0')}`;
    };
    const nextWorkday = (d) => {
        let c = nextDay(d);
        for (let i = 0; i < 60 && calendar.isNonWorkingDay(c); i++) c = nextDay(c);
        return c;
    };
    // One row's window: unstarted work spans its full duration from the
    // chained anchor; started work keeps its real start and finishes at the
    // EARLIER of the anchored budget and the remaining share from today —
    // exactly Kural 1's calendar-budget clamp, on the workday calendar.
    const layout = (vm, chainedStart, durationWd) => {
        const d = Number(durationWd || 0);
        const p = Math.min(Number(vm.progress || 0), 99);
        if (d <= 0) return null;
        if (p <= 0) {
            const start = later(chainedStart, null) || today;
            const from = start > today ? start : today;
            vm.projected_start_date = from;
            const end = calendar.spanEnd(from, d);
            vm.projected_end_date = end;
            vm.forecast_date = end;
            return end;
        }
        const anchor = vm.start_date || vm.projected_start_date || chainedStart || today;
        const full = calendar.spanEnd(anchor, d);
        const scaled = calendar.spanEnd(today, Math.max(d * (100 - p) / 100, 0.1));
        let end = full < scaled ? full : scaled;
        if (end < today) end = today;
        vm.projected_start_date = anchor;
        vm.projected_end_date = end;
        vm.forecast_date = end;
        return end;
    };
    const jobBlocks = {};
    resources.forEach(res => res.blocks.forEach(b => {
        if (b.deleted) return;
        (jobBlocks[b.job_no] = jobBlocks[b.job_no] || []).push(b);
    }));
    liveForecastJobs.forEach(jobNo => {
        const slots = deptByJob[jobNo] || {};
        const imalat = slots.manufacturing;
        const jobStart = (imalat && imalat.start_date) || today;

        let weldEnd = null;
        (jobBlocks[jobNo] || []).forEach(b => {
            let blockEnd = null;
            let cursor = jobStart;
            const live = b.stages.filter(
                s => !s.deleted && !['cancelled', 'skipped'].includes(s.status));
            if (live.length) {
                live.forEach(s => {
                    if (s.status === 'completed') {
                        blockEnd = later(blockEnd, s.projected_end_date || s.end_date);
                        if (blockEnd) cursor = nextWorkday(blockEnd);
                        return;
                    }
                    const e = layout(s, cursor, s.duration_wd);
                    blockEnd = later(blockEnd, e || s.projected_end_date);
                    if (blockEnd) cursor = nextWorkday(blockEnd);
                });
            } else if (b.subtask.status !== 'completed') {
                blockEnd = layout(b.subtask, jobStart, b.subtask.duration_wd);
            }
            if (blockEnd && b.subtask.status !== 'completed') {
                if (live.length) {
                    // The header window must track its re-laid stages — a
                    // stale projected start would show the parent starting
                    // after its own first child.
                    const stageStarts = live
                        .map(s => s.projected_start_date || s.start_date)
                        .filter(Boolean).sort();
                    if (stageStarts.length) {
                        b.subtask.projected_start_date = stageStarts[0];
                    }
                }
                b.subtask.projected_end_date = blockEnd;
                b.subtask.forecast_date = blockEnd;
            }
            weldEnd = later(weldEnd, blockEnd);
        });
        const weld = slots.welding;
        if (weld && weld.status !== 'completed' && weldEnd) {
            weld.projected_start_date = weld.start_date
                || weld.projected_start_date || jobStart;
            weld.projected_end_date = weldEnd;
            weld.forecast_date = weldEnd;
        }

        const machEnd = ((jobInfo[jobNo] || {}).machining || [])
            .reduce((acc, m) => later(acc, m.forecast_date || m.end_date), null);

        // Boya is ALWAYS after the rest of the manufacturing work: it starts
        // the next workday after welding and machining are both done.
        let paintEnd = null;
        const paint = slots.painting;
        if (paint && paint.status !== 'completed') {
            const preds = later(weldEnd, machEnd);
            const paintStart = preds ? nextWorkday(preds) : jobStart;
            paintEnd = layout(paint, paintStart, paint.duration_wd);
        }

        if (imalat && imalat.status !== 'completed') {
            const kids = later(later(weldEnd, paintEnd), machEnd);
            const end = kids || layout(
                imalat, jobStart,
                imalat.entered_duration_wd ?? imalat.duration_wd);
            if (end) {
                imalat.projected_end_date = end;
                imalat.forecast_date = end;
            }
        }
    });
}

// The "Tümü" tab: every resource's jobs on one sheet — ordered by
// subcontractor/team first, job number second (user ask 2026-08-29) — with
// an "Atanmamış / Eksik Atanan" section at the end: each row is the job's
// İmalat department task (editable start + duration, job-order weight),
// listed while any of the job's welding weight is still unassigned, with
// an assign action.
function buildAllRows() {
    const rows = [];
    resources.forEach(res => {
        const blocks = visibleBlocks(res);
        if (!blocks.length) return;
        const key = resourceKeyOf(res);
        rows.push({
            key: `all-head-${key}`,
            kind: 'band',
            indent: 0,
            job_no: null,
            title: `${res.resource_type === 'team' ? 'Ekip' : 'Taşeron'} — ${res.display_name || res.name}`,
            start_date: null, end_date: null, duration_wd: null,
            weight: null, progress: null, status: null, note: '',
        });
        const resRows = buildSheetRows(res, true);
        // A job can sit under two resources on this sheet — namespace the
        // row keys so the grid's key lookup stays unambiguous.
        resRows.forEach(r => { r.key = `${key}::${r.key}`; });
        rows.push(...resRows);
    });

    const assigned = new Set();
    resources.forEach(res => res.blocks.forEach(b => {
        if (!b.deleted) assigned.add(b.job_no);
    }));
    // The pending section lists the İMALAT DEPARTMENT TASK, not a bare job
    // number (user decision 2026-08-29): its start and duration edit the real
    // task, its weight is the job order's, and a job stays listed while any
    // of its welding weight is still unhanded — showing exactly how much.
    // Jobs with no manufacturing task have nothing to plan here.
    const pending = weldingTasks
        .filter(t => jobMatchesFilters(t.job_no))
        .map(t => ({
            t,
            vm: deptOf(t.job_no, 'manufacturing'),
            remaining: remainingForTask(t.welding_task_id, t.total_weight_kg),
        }))
        .filter(({ t, vm, remaining }) => {
            if (!vm) return false;
            if (!assigned.has(t.job_no)) return true;
            return remaining != null && remaining > 0.05;
        })
        .sort((a, b) => String(a.t.job_no).localeCompare(
            String(b.t.job_no), 'tr', { numeric: true }));
    if (pending.length) {
        rows.push({
            key: 'all-head-unassigned',
            kind: 'band',
            indent: 0,
            job_no: null,
            title: `Atanmamış / Eksik Atanan — ${pending.length} iş`,
            start_date: null, end_date: null, duration_wd: null,
            weight: null, progress: null, status: null, note: '',
        });
        pending.forEach(({ t, vm, remaining }) => {
            const jo = (jobInfo[t.job_no] || {}).job_order || null;
            const partly = assigned.has(t.job_no);
            const noteParts = [];
            if (vm.status === 'skipped') noteParts.push('İmalat görevi atlandı');
            if (partly) {
                noteParts.push(
                    `Atanan ${fmtKg(allocatedForTask(t.welding_task_id))}`
                    + ` / ${fmtKg(t.total_weight_kg)} kg`
                    + (remaining != null ? ` · Kalan ${fmtKg(remaining)} kg` : ''));
            }
            rows.push(withDerivedDates({
                key: `all-unassigned-${t.welding_task_id}`,
                kind: 'dept',
                slot: 'manufacturing',
                unassignedRow: true,
                welding_task_id: t.welding_task_id,
                job_no: t.job_no,
                // No group row above these — never folded away.
                groupKey: null,
                indent: 1,
                title: t.job_order_title
                    ? `${t.job_no} — ${t.job_order_title}` : String(t.job_no),
                bar_label: String(t.job_no),
                customer_name: t.customer_name || '',
                task_id: vm.task_id,
                start_date: vm.start_date,
                end_date: vm.end_date,
                duration_wd: vm.duration_wd,
                entered_duration_wd: vm.entered_duration_wd,
                duration_is_derived: vm.duration_is_derived,
                duration_source: vm.duration_source,
                start_is_actual: vm.start_is_actual,
                end_is_actual: vm.end_is_actual,
                has_subtasks: vm.has_subtasks,
                weight: t.total_weight_kg ?? (jo ? jo.total_weight_kg : null),
                weight_is_kg: true,
                allocated_kg: partly && t.total_weight_kg != null
                    ? round2(allocatedForTask(t.welding_task_id)) : null,
                progress: vm.progress,
                status: vm.status,
                completed_at: vm.completed_at,
                forecast_date: vm.forecast_date,
                forecast_kind: vm.forecast_kind,
                job_target: (jo && jo.end_date) || t.target_completion_date || null,
                job_target_late: !!(jo && jo.end_date && vm.forecast_date
                    && vm.forecast_date > jo.end_date),
                job_target_delta_wd: targetDeltaWd(
                    (jo && jo.end_date) || t.target_completion_date || null,
                    vm.forecast_date),
                note: noteParts.join(' — '),
                // keepStart: this IS an İmalat row — its start is the
                // planner's entry and must show (and edit) as typed.
            }, vm, { keepStart: true }));
        });
    }
    return rows;
}

function renderGrid() {
    const container = document.getElementById('planning-grid');
    if (!container) return;
    rederiveDerivedDurations();
    rederivePlanWindows();
    rederiveProgress();
    rederiveEngineDates();
    const res = activeResource();
    const rows = activeResourceKey === 'all'
        ? buildAllRows()
        : (res ? buildSheetRows(res) : []);
    sheetRows = rows;

    if (!grid) {
        grid = new PlanningGrid('planning-grid', {
            columns: activeColumns(),
            rows,
            zoom: localStorage.getItem(ZOOM_KEY) || 'week',
            gridWidth: Number(localStorage.getItem(GRIDW_KEY)) || 560,
            collapsed: collapsedForGrid(),
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
        grid.options.collapsed = collapsedForGrid();
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
    if (row.kind === 'group' && row.job_target_late) classes.push('pg-group-late');
    if (row.kind === 'band') classes.push('pg-row-band');
    if (['info', 'machining'].includes(row.kind)) classes.push('pg-row-info');
    if (row.kind === 'unassigned' || row.unassignedRow) classes.push('pg-row-unassigned');
    if (row.status === 'skipped') classes.push('pg-row-skipped');
    if (row.kind === 'dept') classes.push(`pg-row-dept pg-row-${row.slot}`);
    if (row.kind === 'block') classes.push('pg-row-block');
    if (row.status === 'cancelled') classes.push('pg-row-cancelled');
    classes.push(`pg-indent-${row.indent || 0}`);
    return classes.join(' ');
}

// Two different billing locks (mirroring welding/services/planning.py): a
// billed baseline freezes the weight, while ANY statement line — a draft
// statement already makes one, nothing billed yet — blocks a move.
function isMoveLocked(block) {
    return !!(block.is_billed || block.has_statement_line);
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
        // A greyed-out button has to say why it is greyed out.
        title: (row) => (findBlock(row.blockRef)?.is_billed
            ? 'Hakediş kesilmiş atamanın ağırlığı değiştirilemez'
            : 'Ağırlığı düzenle'),
        visible: (row) => row.kind === 'block',
        disabled: (row) => !!findBlock(row.blockRef)?.is_billed,
    },
    {
        key: 'move-block',
        icon: 'fas fa-people-arrows',
        title: (row) => {
            const b = findBlock(row.blockRef);
            if (b && isMoveLocked(b)) {
                return 'Hakedişe girmiş atama taşınamaz — kalan işi yeni bir'
                    + ' atamayla verin';
            }
            if (b?.isNew) return 'Önce kaydedin — kaydedilmemiş blok taşınamaz';
            return 'Atamayı değiştir';
        },
        visible: (row) => row.kind === 'block',
        // A new block is not saved yet (delete and re-add it instead), and a
        // block that has entered billing is immutable history.
        disabled: (row) => {
            const b = findBlock(row.blockRef);
            return !b || b.isNew || isMoveLocked(b);
        },
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
        // Delete is as available as add (user decision 2026-08-29) —
        // default stages included; the block can re-create them by title.
        title: 'Aşamayı sil',
        visible: (row) => row.kind === 'stage',
    },
    {
        key: 'assign-job',
        icon: 'fas fa-user-plus',
        title: 'Ekibe / taşerona ata',
        // Not on a skipped İmalat — there is no manufacturing to hand out.
        visible: (row) => !!row.unassignedRow && row.status !== 'skipped',
    },
];

function onGridAction(action, row) {
    if (action === 'create-stages') onCreateStages(row.blockRef);
    else if (action === 'add-custom') onAddCustomStage(row.blockRef);
    else if (action === 'edit-weight') onEditWeight(row.blockRef);
    else if (action === 'delete-block') onDeleteBlock(row.blockRef);
    else if (action === 'delete-stage') onDeleteCustomStage(row);
    else if (action === 'assign-job') openAssignModal(row);
    else if (action === 'move-block') openMoveModal(row.blockRef);
}

function toggleJob(jobNo) {
    if (onAllTab()) {
        if (expandedJobsAll.has(jobNo)) expandedJobsAll.delete(jobNo);
        else expandedJobsAll.add(jobNo);
    } else if (collapsedJobs.has(jobNo)) {
        collapsedJobs.delete(jobNo);
    } else {
        collapsedJobs.add(jobNo);
    }
    renderGrid();
}

// One place to change the scale, whether it came from a button or Ctrl+wheel.
function applyZoom(zoom) {
    localStorage.setItem(ZOOM_KEY, zoom);
    document.querySelectorAll('#zoom-buttons [data-zoom]').forEach(
        b => b.classList.toggle('active', b.dataset.zoom === zoom));
    if (grid) grid.setZoom(zoom);
}

// What narrows the printed sheet, said on the sheet itself: a filtered export
// that does not admit to being filtered reads as the whole plan.
function exportContextText() {
    const parts = [];
    if (filterJobNos.length) {
        parts.push(`İş emri: ${filterJobNos.slice(0, 4).join(', ')}`
            + (filterJobNos.length > 4 ? ` +${filterJobNos.length - 4}` : ''));
    }
    if (filterAssignee) {
        const opt = assigneeFilterOptions().find(o => o.value === filterAssignee);
        parts.push(`Sorumlu: ${opt ? opt.text : filterAssignee}`);
    }
    if (filterText.trim()) parts.push(`Ara: "${filterText.trim()}"`);
    if (showCompleted) parts.push('Tamamlananlar dahil');
    return parts.length ? `Filtre — ${parts.join(' · ')}` : '';
}

// Exports exactly what is on screen — this tab, these filters, these open
// groups, these columns. Re-scaled to the page, not screenshotted: see pdf.js.
async function onExportPdf() {
    const btn = document.getElementById('pdf-btn');
    if (!btn || btn.disabled) return;
    const res = activeResource();
    const tab = onAllTab() ? 'Tümü' : (res ? (res.display_name || res.name) : '');
    const now = new Date();
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
        + `-${String(now.getDate()).padStart(2, '0')}`;

    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>PDF';
    try {
        const out = await exportPlanningPdf({
            grid,
            title: 'İmalat Planlama',
            subtitle: tab,
            context: exportContextText(),
            legend: document.querySelector('.pg-legend'),
            fileName: `İmalat Planlama - ${tab || 'Plan'} - ${stamp}`,
            // A 20-page board takes a moment per page; the button counts them
            // off rather than sitting there looking hung.
            onProgress: (done, total) => {
                btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1">'
                    + `</span>${done}/${total}`;
            },
        });
        showNotification(
            `PDF indirildi — ${out.pages} sayfa, ${out.rows} satır.`, 'success');
    } catch (error) {
        console.error('PDF export failed:', error);
        showNotification(error?.message || 'PDF oluşturulamadı.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = original;
    }
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
    if (onAllTab()) {
        let open = 0;
        allSheetJobNos().forEach(jobNo => { if (expandedJobsAll.has(jobNo)) open++; });
        return open;
    }
    const res = activeResource();
    if (!res) return 0;
    return jobNosOf(res).filter(jobNo => !collapsedJobs.has(jobNo)).length;
}

function onToggleAll() {
    const collapse = expandedJobCount() > 0;
    if (onAllTab()) {
        if (collapse) expandedJobsAll.clear();
        else allSheetJobNos().forEach(jobNo => expandedJobsAll.add(jobNo));
        renderGrid();
        return;
    }
    const res = activeResource();
    if (!res) return;
    jobNosOf(res).forEach(jobNo => {
        if (collapse) collapsedJobs.add(jobNo);
        else collapsedJobs.delete(jobNo);
    });
    renderGrid();
}

function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
        // Adding or deleting a block changes which jobs are on the board, so
        // the filter choices and the match summary are refreshed with it.
        renderFilters();
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
        if (status === 'completed') {
            target.progress = 100;
            row.progress = 100;
            // Dept payload omits progress unless this field is dirty.
            // Completing is itself a progress write (100); without marking
            // it, bulk-save would persist "completed" with the old percent.
            if (row.kind === 'dept') markDeptDirty(row.job_no, row.slot, 'progress');
        }
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
    } else if (field === 'duration_wd') {
        // Only the İmalat row reaches here (isCellEditable). Duration is
        // PURE SIZING, fully decoupled from dates (user model 2026-08-28):
        // it never moves a date, and the render pass redistributes every
        // child slice immediately — before any save.
        const raw = String(newValue ?? '').trim();
        const num = raw === '' ? null : Number(raw);
        if (num != null && (!Number.isFinite(num) || num < 0)) {
            throw new Error('Süre 0 veya daha büyük olmalıdır.');
        }
        target.duration_wd = num;
        target.entered_duration_wd = num;
        target.duration_is_derived = false;
        target.duration_source = null;
        Object.assign(row, {
            duration_wd: num,
            duration_is_derived: false,
            duration_source: null,
        });
        // Mirror of the server-side purge: asserting the İmalat number
        // re-bases the WHOLE subtree on it, stray child entries included —
        // cleared here too so the redistribution shows immediately, before
        // any save (the save clears them in the DB).
        if (num != null) {
            const clearEntry = (vm) => {
                if (!vm) return;
                vm.entered_duration_wd = null;
                vm.duration_is_derived = true;
                vm.duration_source = 'weight_share';
            };
            clearEntry(deptOf(row.job_no, 'welding'));
            clearEntry(deptOf(row.job_no, 'painting'));
            resources.forEach(res => res.blocks.forEach(b => {
                if (b.job_no !== row.job_no || b.deleted) return;
                clearEntry(b.subtask);
                b.stages.forEach(s => { if (!s.deleted) clearEntry(s); });
            }));
        }
    } else if (field === 'start_date' || field === 'end_date') {
        // Dates are PURE SCHEDULING — they never derive a duration and no
        // duration ever derives them (decoupled, 2026-08-28).
        const start = field === 'start_date'
            ? (newValue || null) : (target.start_date || null);
        const end = field === 'end_date'
            ? (newValue || null) : (target.end_date || null);
        if (start && end && end < start) {
            throw new Error('Bitiş tarihi başlangıç tarihinden önce olamaz.');
        }

        // NO child-coverage check any more (user 2026-09-01: "I can't edit
        // subtasks anyway"). It came from the days when a planner scheduled
        // stages by hand and a parent had to cover them; today every date
        // below İmalat is derived from this very entry, so the children move
        // WITH the start being typed — refusing it left the sheet's only date
        // input unusable, blocked by dates nobody could reach.
        if (row.kind === 'dept' && row.slot !== 'painting') {
            target.start_from_children = false;
            target.end_from_children = false;
        }

        target.start_date = start;
        target.end_date = end;
        target.start_is_actual = false;
        target.end_is_actual = false;
        target.date_source = null;
        if (row.kind === 'dept') {
            target.entered_start_date = start;
            target.entered_end_date = end;
        }
        // Scheduling a cancelled default stage brings it back.
        if (row.kind === 'stage' && target.status === 'cancelled' && start) {
            target.status = 'pending';
        }
        Object.assign(row, {
            start_date: start,
            end_date: end,
            status: target.status ?? row.status,
            start_is_actual: false,
            end_is_actual: false,
            date_source: null,
            start_date_source: null,
            end_date_source: null,
        });
    } else {
        return;
    }

    markDirty();
    // Any edit that can move a projection switches the job to live client
    // projections until the next save/reload brings server truth.
    if (['duration_wd', 'progress', 'start_date', 'status', 'weight'].includes(field)) {
        liveForecastJobs.add(row.job_no);
    }
    scheduleRefresh();
}

// ---- block-level actions -------------------------------------------------

function onCreateStages(blockRef) {
    const block = findBlock(blockRef);
    if (!block) return;
    const existing = new Set(
        block.stages.filter(s => !s.deleted).map(s => s.title));
    defaultStagesFrom(block.subtask, () => `new-${++newCounter}`)
        .filter(s => !existing.has(s.title))
        .forEach(s => block.stages.push(s));
    // Stages travel in the payload (same as a new block / custom stage).
    // create_default_stages would ask the server to insert them again.
    block.createDefaultStages = false;
    revealJob(block.job_no);   // show what was just created
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
        revealJob(block.job_no);   // show what was just created
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
    if (!stage) return;
    confirmModal.show({
        title: 'Aşama Sil',
        message: `"${stage.title}" aşamasını silmek istediğinize emin misiniz?`
            + (Number(stage.progress || 0) > 0
                ? ` (Üzerinde %${stage.progress} ilerleme var — silinince blok yüzdesinden düşer.)`
                : '')
            + (stage.is_default
                ? ' Varsayılan aşama gerekirse bloktan yeniden oluşturulabilir.'
                : ''),
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
            bumpMutation();
            // The deletion moves the job's projection (the deleted block's
            // window no longer counts) — recompute live like any other edit.
            liveForecastJobs.add(block.job_no);
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

// Assign from the "Tümü" tab: the job is fixed (the unassigned row), the
// planner picks the resource — the rest (kg, notes, subcontractor tier)
// rides the exact same draft flow as a resource-tab add.
function openAssignModal(row) {
    const task = weldingTasks.find(
        t => t.welding_task_id === Number(row.welding_task_id));
    if (!task) return;
    blockModalMode = { mode: 'assign', weldingTaskId: task.welding_task_id };

    const resourceOptions = resources.map(r => ({
        value: resourceKeyOf(r),
        text: `${r.resource_type === 'team' ? 'Ekip' : 'Taşeron'} — ${r.display_name || r.name}`,
        searchText: r.name,
        selectedText: r.display_name || r.name,
    }));
    const remaining = remainingForTask(task.welding_task_id, task.total_weight_kg);
    // What the decision needs, next to where the kg is typed: the job's total,
    // how much of it is already out and with whom, and what is left.
    const assignedKg = round2(allocatedForTask(task.welding_task_id));
    const holders = holdersForTask(task.welding_task_id);
    const holderText = holders.length
        ? ` (${holders.map(h => `${h.name}: ${fmtKg(h.kg)} kg`).join(', ')})`
        : '';
    const weightSummary = task.total_weight_kg != null
        ? `Toplam ${fmtKg(task.total_weight_kg)} kg · Atanan ${fmtKg(assignedKg)} kg${holderText}`
            + ` · Kalan ${fmtKg(remaining)} kg. `
        : (assignedKg > 0 ? `Atanan ${fmtKg(assignedKg)} kg${holderText}. ` : '');

    blockModal.clearAll();
    blockModal.setTitle(`Ata — ${task.job_no}${task.job_order_title ? ` · ${task.job_order_title}` : ''}`);
    blockModal.setIcon('fas fa-user-plus');
    blockModal.setSaveButtonText('Ata');
    blockModal.addSection({
        title: 'Atama',
        icon: 'fas fa-fire',
        iconColor: 'text-danger',
        fields: [
            {
                id: 'resource_key', name: 'resource_key',
                label: 'Ekip / Taşeron', type: 'dropdown', required: true,
                searchable: true, icon: 'fas fa-users', colSize: 12,
                maxHeight: 460,
                options: resourceOptions, value: resourceOptions[0]?.value,
            },
            {
                id: 'allocated_weight_kg', name: 'allocated_weight_kg',
                label: 'Ağırlık (kg)', type: 'number', required: true,
                min: 0.01, step: 0.01, icon: 'fas fa-weight-hanging', colSize: 12,
                value: remaining != null && remaining > 0 ? remaining : '',
                help: weightSummary
                    + 'Bu ekibin/taşeronun yapacağı ekipman ağırlığı. '
                    + '(Taşeron seçilirse bir sonraki adımda fiyat kademesi sorulur.)',
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

// "Atamayı değiştir": move a saved block to another team/subcontractor. The
// subtask (stages, progress, schedule) travels with it — the server re-homes
// the assignment on Kaydet.
function openMoveModal(blockRef) {
    const block = findBlock(blockRef);
    if (!block) return;
    // Say why instead of doing nothing: both refusals are also the server's
    // (a billed block is immutable history there too).
    if (block.isNew) {
        showNotification(
            'Bu blok henüz kaydedilmedi — önce Kaydet, sonra taşıyın.', 'info');
        return;
    }
    if (isMoveLocked(block)) {
        showNotification(
            'Hakedişe girmiş atama taşınamaz — kalan işi yeni bir atamayla verin.',
            'error');
        return;
    }
    const currentKey = `${block.resource_type}-${block.resource_id}`;
    const currentRes = resources.find(r => resourceKeyOf(r) === currentKey);
    const resourceOptions = resources
        .filter(r => resourceKeyOf(r) !== currentKey)
        .map(r => ({
            value: resourceKeyOf(r),
            text: `${r.resource_type === 'team' ? 'Ekip' : 'Taşeron'} — ${r.display_name || r.name}`,
            searchText: r.name,
            selectedText: r.display_name || r.name,
        }));
    if (!resourceOptions.length) return;
    blockModalMode = { mode: 'move', blockRef };

    blockModal.clearAll();
    blockModal.setTitle(`Atamayı değiştir — ${block.job_no}`);
    blockModal.setIcon('fas fa-people-arrows');
    blockModal.setSaveButtonText('Taşı');
    blockModal.addSection({
        title: 'Yeni Ekip / Taşeron',
        icon: 'fas fa-people-arrows',
        iconColor: 'text-primary',
        fields: [{
            id: 'resource_key', name: 'resource_key',
            label: 'Ekip / Taşeron', type: 'dropdown', required: true,
            searchable: true, icon: 'fas fa-users', colSize: 12,
            maxHeight: 460,
            options: resourceOptions, value: resourceOptions[0]?.value,
            help: `Şu an: ${currentRes ? (currentRes.display_name || currentRes.name) : '—'}`
                + ` · ${fmtKg(block.allocated_weight_kg)} kg. Aşamalar ve ilerleme`
                + ' atamayla birlikte taşınır. (Taşeron seçilirse bir sonraki'
                + ' adımda fiyat kademesi sorulur.)',
        }],
    });
    blockModal.onSaveCallback(onBlockModalSave);
    blockModal.render();
    blockModal.show();
}

async function openMoveTierModal(block, res) {
    try {
        const tiersResp = await fetchPriceTiers({ job_order: block.job_no, ordering: 'name' });
        const kg = Number(block.allocated_weight_kg || 0);
        const currentTierId = block.price_tier ? Number(block.price_tier.id) : null;
        // Whether the block fits is the decision here, so each tier says so —
        // the capacity refusal used to arrive only at Kaydet.
        const tiers = (tiersResp.results || tiersResp || [])
            .filter(t => t.tier_type === 'welding')
            .map(t => {
                // A block that already sits on this tier frees its own kg.
                const free = Number(t.remaining_weight_kg)
                    + (Number(t.id) === currentTierId ? kg : 0);
                const short = round2(kg - free);
                // An over-used tier has negative room; "-200 kg boş" is noise.
                const shown = Math.max(free, 0);
                return {
                    value: String(t.id),
                    fits: short <= 0,
                    label: `${t.name} — ${t.price_per_kg} ${t.currency}/kg`
                        + (short <= 0
                            ? ` (${fmtKg(shown)} kg boş)`
                            : ` (${fmtKg(shown)} kg boş — ${fmtKg(short)} kg eksik)`),
                };
            });
        if (!tiers.length) {
            showNotification('Bu iş için kaynak fiyat kademesi bulunamadı. Önce planlamadan fiyat kademesi tanımlayın.', 'error');
            return;
        }
        tiers.sort((a, b) => (b.fits ? 1 : 0) - (a.fits ? 1 : 0));
        tierModal.clearAll();
        tierModal.addSection({
            title: 'Fiyat Kademesi',
            icon: 'fas fa-tags',
            iconColor: 'text-success',
            fields: [{
                id: 'price_tier', name: 'price_tier', label: 'Fiyat Kademesi',
                type: 'dropdown', required: true, searchable: true,
                icon: 'fas fa-tag', colSize: 12,
                help: `Taşınan iş ${fmtKg(kg)} kg. Taşeron ataması hakedişe`
                    + ' dahildir; fiyat kademesi zorunludur.'
                    + (tiers.some(t => t.fits) ? ''
                        : ' Hiçbir kademede bu blok kadar yer yok — iş emrinin'
                          + ' fiyatlanmamış ağırlığı yetiyorsa kademe kaydederken'
                          + ' büyütülür, yetmiyorsa taşıma reddedilir.'),
                options: tiers, value: tiers[0].value,
            }],
        });
        tierModal.onSaveCallback((formData) => {
            const tierId = Number(formData.price_tier);
            if (!tierId) {
                showNotification('Fiyat kademesi seçin.', 'error');
                return;
            }
            tierModal.hide();
            applyMove(block, res, tierId);
        });
        tierModal.render();
        tierModal.show();
    } catch (e) {
        showNotification(e.message, 'error');
    }
}

// Working copy only — the server applies the move on Kaydet.
function applyMove(block, res, tierId) {
    const from = resources.find(r =>
        r.resource_type === block.resource_type && r.id === block.resource_id);
    if (from) from.blocks = from.blocks.filter(b => b.key !== block.key);
    block.resource_type = res.resource_type;
    block.resource_id = res.id;
    block.moveTo = {
        resource_type: res.resource_type,
        resource_id: res.id,
        ...(tierId ? { price_tier: tierId } : {}),
    };
    res.blocks.push(block);
    markBlockDirty(block.key);
    revealJob(block.job_no);
    scheduleRefresh();
    showNotification(
        `${block.job_no} → ${res.display_name || res.name} (kaydedilmedi)`, 'info');
}

function openAddJobModal(prefillTaskId = null) {
    const res = activeResource();
    if (!res) {
        if (activeResourceKey === 'all') {
            showNotification(
                'Tümü sekmesinde atama, "Atanmamış" bölümündeki satırların '
                + 'ata düğmesiyle yapılır — ya da önce bir kaynak sekmesi seçin.',
                'info');
        }
        return;
    }
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

    if (mode.mode === 'move') {
        const block = findBlock(mode.blockRef);
        const res = resources.find(r => resourceKeyOf(r) === formData.resource_key);
        if (!block || !res) { blockModal.hide(); return; }
        blockModal.hide();
        if (res.resource_type === 'subcontractor') {
            // A subcontractor destination re-prices the work — tier first.
            await openMoveTierModal(block, res);
            return;
        }
        applyMove(block, res, null);
        return;
    }

    if (mode.mode === 'assign') {
        // From the "Tümü" tab: the job came from the row, the resource from
        // the form; from here on it is the same draft as a resource-tab add.
        const res = resources.find(
            r => resourceKeyOf(r) === formData.resource_key);
        const task = weldingTasks.find(
            t => t.welding_task_id === Number(mode.weldingTaskId));
        const weight = Number(formData.allocated_weight_kg);
        if (!res) {
            showNotification('Ekip veya taşeron seçin.', 'error');
            return;
        }
        if (!task || !Number.isFinite(weight) || weight <= 0) {
            showNotification('Geçerli bir ağırlık girin.', 'error');
            return;
        }
        const draft = {
            resource: res,
            welding_task: task,
            allocated_weight_kg: weight,
            notes: formData.notes || '',
            price_tier: null,
        };
        blockModal.hide();
        if (res.resource_type === 'subcontractor') {
            pendingNewBlock = draft;
            await openTierModal(draft);
            return;
        }
        pushNewBlock(draft);
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
        has_statement_line: false,
        price_tier: draft.price_tier ? { id: draft.price_tier } : null,
        notes: draft.notes,
        subtask: { status: 'in_progress', progress: 0, start_date: null, end_date: null, duration_wd: null },
        // NO auto-stages (user decision 2026-08-29): a new assignment is ONE
        // task. The Montaj / Kaynak ve Taşlama pair is added on demand via
        // the block's create-stages action.
        stages: [],
        createDefaultStages: false,
        deleted: false,
        resource_type: res.resource_type,
        resource_id: res.id,
    };
    res.blocks.push(block);
    revealJob(block.job_no);
    markBlockDirty(key);
    // Adding a job the active filters hide would look like the add silently
    // failed, so the filters step aside for it.
    const hidden = !jobMatchesFilters(block.job_no);
    if (hidden) clearFilters();
    scheduleRefresh();
    showNotification(
        hidden
            ? 'Blok eklendi — filtre dışında kaldığı için filtreler temizlendi.'
            : 'Blok eklendi — Kaydet ile kalıcılaşır.',
        'info');
}

// ---- gantt ---------------------------------------------------------------

// ---- save ----------------------------------------------------------------

function stagePayload(s) {
    // No duration_wd on purpose: a stage's size IS its weight-share slice
    // of the İmalat entry (top-down model) — the sheet never writes stage
    // durations, and saving the İmalat number purges legacy ones.
    // No dates either: a stage's dates are the engine's projection — the
    // SERVER materializes them onto the task at save time (user decision
    // 2026-08-31), so the sheet sends neither sizing nor schedule.
    const item = {
        title: s.title,
        weight: s.weight,
        status: s.status,
        progress: s.progress,
        note: s.note || '',
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
        if (shouldPostNewBlock(b)) {
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
        // Created on the last save but the board refresh has not given us
        // an assignment_id yet — posting again would duplicate the row.
        if (b.isNew) return;
        if (!dirtyBlocks.has(b.key)) return;

        const snap = snapBlocks.get(b.key) || {};
        const item = { assignment_type: b.assignment_type, assignment_id: b.assignment_id };
        // "Atamayı değiştir" — the server re-homes the block, keeping its
        // subtask (stages, progress) with it.
        if (b.moveTo) item.move_to = b.moveTo;
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
            // No duration_wd and no dates — the block sizes from its
            // weight-share slice of the İmalat entry, and the server
            // materializes its projected dates at save time.
            item.subtask_schedule = {
                status: b.subtask.status,
                progress: b.subtask.progress,
            };
        }
        payload.blocks.push(item);
    }));

    dirtyDept.forEach((fields, key) => {
        const [jobNo, slot] = key.split('|');
        const vm = deptOf(jobNo, slot);
        if (!vm) return;
        const item = { task_id: vm.task_id, status: vm.status };
        Object.assign(item, deptSchedulePatch(slot, fields, vm));
        // Leaf dept progress is omitted unless edited — except
        // completed, which always means 100 and is set as a side effect
        // of the status change (see onCellEdit).
        if (!vm.has_subtasks && (fields.has('progress') || vm.status === 'completed')) {
            item.progress = vm.progress;
        }
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
    if (saveInFlight) return;
    if (!hasUnsavedChanges()) {
        showNotification('Kaydedilecek değişiklik yok.', 'info');
        return;
    }
    const btn = document.getElementById('save-btn');
    if (btn) btn.disabled = true;
    saveInFlight = true;
    const payload = buildPayload();
    const clockAtSend = mutationClock;
    const knownIds = knownAssignmentKeys(resources);
    const sentNewKeys = [];
    resources.forEach(res => res.blocks.forEach(b => {
        if (shouldPostNewBlock(b)) sentNewKeys.push(b.key);
    }));
    try {
        const resp = await bulkSaveWeldingPlanning(payload);
        showNotification('Plan kaydedildi.', 'success');
        // What the save changed on its own — a move shifting price-tier
        // capacity — must not go unseen.
        (resp && resp.messages || []).forEach(m => showNotification(m, 'info'));
        // Neutralize one-shot creates/moves/deletes immediately so a second
        // save (or a skipped hydrate) cannot recreate them. Cell-level dirty
        // stays until hydrate so an edit typed during this request is not
        // dropped.
        finalizeSavedStructuralOps(payload, sentNewKeys);
        const board = resp && resp.board;
        if (shouldHydrateAfterSave(clockAtSend, mutationClock)) {
            // This payload is fully committed and nobody typed during the
            // request. Drop its dirty flags so Kaydet goes idle; a later
            // edit during the board rebuild bumps the clock and is kept.
            dirtyBlocks = new Set();
            dirtyDept = new Map();
            dirtyMachining = new Map();
            updateSaveState();
            if (board) {
                hydrate(board);
                return;
            }
        }
        refreshBoardInBackground({ clockAtSend, knownIds, sentNewKeys });
    } catch (e) {
        if (btn) btn.disabled = false;
        showNotification(e.message, 'error');
    } finally {
        saveInFlight = false;
        if (hasUnsavedChanges()) updateSaveState();
    }
}

function finalizeSavedStructuralOps(payload, sentNewKeys) {
    (sentNewKeys || []).forEach((key) => {
        const b = findBlock(key);
        if (!b) return;
        b.createdOnServer = true;
        b.createDefaultStages = false;
        delete b.moveTo;
    });
    const sentBlockIds = new Set(
        (payload.blocks || []).map((b) => assignmentKey(b.assignment_type, b.assignment_id)),
    );
    resources.forEach((res) => res.blocks.forEach((b) => {
        if (b.isNew || b.assignment_id == null) return;
        if (sentBlockIds.has(assignmentKey(b.assignment_type, b.assignment_id))) {
            b.createDefaultStages = false;
            delete b.moveTo;
        }
    }));
    deletedBlocks = leftoverDeleted(deletedBlocks, payload.deleted_blocks || []);
}

function adoptCreatedBlockIdentities(board, knownIds, sentNewKeys) {
    const created = createdBlocksFromBoard(board, knownIds);
    const used = new Set();
    (sentNewKeys || []).forEach((key) => {
        const client = findBlock(key);
        if (!client || !client.isNew) return;
        const idx = matchCreatedBlock(client, created, used);
        if (idx < 0) return;
        const matched = created[idx];
        used.add(assignmentKey(matched.block.assignment_type, matched.block.assignment_id));
        client.isNew = false;
        client.createdOnServer = false;
        client.assignment_type = matched.block.assignment_type;
        client.assignment_id = matched.block.assignment_id;
        client.subtask_id = matched.block.subtask_id;
        client.createDefaultStages = false;
        delete client.moveTo;
        adoptStageIds(client.stages, matched.block.stages);
        snapBlocks.set(client.key, {
            allocated_weight_kg: client.allocated_weight_kg,
            notes: client.notes,
        });
    });
}

async function refreshBoardInBackground({ clockAtSend, knownIds, sentNewKeys } = {}) {
    try {
        const data = await getWeldingPlanningBoard(showCompleted);
        if (shouldHydrateAfterSave(clockAtSend, mutationClock)) {
            hydrate(data);
            return;
        }
        // Planner typed during the rebuild: keep the working copy, but stitch
        // server identities onto the blocks this save created so the next
        // save updates them instead of posting duplicates.
        adoptCreatedBlockIdentities(data, knownIds || knownAssignmentKeys(resources), sentNewKeys || []);
        updateSaveState();
        scheduleRefresh();
    } catch (e) {
        console.error('Board refresh failed:', e);
        showNotification(
            'Tablo arka planda güncellenemedi — gerekirse Yenile\'ye basın.',
            'error');
    }
}

// ---- init ----------------------------------------------------------------

function renderAll() {
    renderFilters();
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
    // Bound on the containers, not the dropdown instances: the instances are
    // rebuilt whenever the choices change, and destroy() leaves container-level
    // listeners alone — so registering per instance would stack duplicates.
    document.getElementById('filter-job').addEventListener('dropdown:select', (e) => {
        // Copy: multi-select hands out its live selectedValues array.
        filterJobNos = Array.isArray(e.detail.value) ? [...e.detail.value] : [];
        onFilterChange();
    });
    document.getElementById('filter-assignee').addEventListener('dropdown:select', (e) => {
        filterAssignee = e.detail.value || '';
        onFilterChange();
    });
    // Debounced: re-rendering 700 rows per keystroke would make typing lag.
    document.getElementById('filter-text')?.addEventListener('input', (e) => {
        clearTimeout(filterTextTimer);
        filterTextTimer = setTimeout(() => {
            filterText = e.target.value || '';
            onFilterChange();
        }, 200);
    });
    document.getElementById('filter-clear').addEventListener('click', clearFilters);
    document.getElementById('save-btn').addEventListener('click', onSave);
    document.getElementById('add-job-btn').addEventListener('click', () => openAddJobModal());
    document.getElementById('pdf-btn')?.addEventListener('click', onExportPdf);

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
