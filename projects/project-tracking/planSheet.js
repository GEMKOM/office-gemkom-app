/**
 * Plan sheet on the meeting slide — the İmalat Planlama grid (PlanningGrid),
 * read-only, fed by GET /projects/job-orders/{job_no}/plan-sheet/.
 *
 * One group row per job order (root and sub-jobs), the department tasks
 * beneath it. The BAR is the plan window with the progress fill; a hatched
 * tail after it is the projected overrun (on task rows labelled with its
 * working days); the violet line is the termin; on a job row a pill after
 * the projection's end says how far that end sits from the termin ("+25g");
 * today is red. The Sapma column says how far the row is from its plan and
 * the Neden column why. Sentences come from planSheetText.js (tested under
 * node).
 */

import { PlanningGrid, ZOOMS } from '../../planning/project-planning/grid.js';
import { createWorkdayCalendar } from '../../utils/workdays.js';
import { escapeHtml } from '../../utils/text.js';
import {
    barState, causeSentence, deviationChip, fmtDateTr, groupRows,
    isDefaultDuration, planSourceLabel, progressText, rootCauseLabel,
} from './planSheetText.js';
import { departmentName, pct, taskTitle, tr, wdText } from './sheetLang.js';

const STATUS_META = {
    pending: ['Başlamadı', 'status-grey'],
    blocked: ['Engellendi', 'status-grey'],
    in_progress: ['Devam Ediyor', 'status-blue'],
    completed: ['Tamamlandı', 'status-green'],
    on_hold: ['Beklemede', 'status-orange'],
    cancelled: ['İptal', 'status-grey'],
    skipped: ['Atlandı', 'status-grey'],
    active: ['Aktif', 'status-blue'],
    draft: ['Taslak', 'status-grey'],
};

const ROLE_ICONS = {
    design: 'fas fa-pen-ruler', procurement: 'fas fa-cart-shopping', cnc: 'fas fa-scissors',
    machining: 'fas fa-gears', welding: 'fas fa-fire', painting: 'fas fa-fill-drip',
    mfg: 'fas fa-industry', block: 'fas fa-users', stage: 'fas fa-list-check',
};
const DEPT_ICONS = {
    design: 'fas fa-pen-ruler', planning: 'fas fa-clipboard-list', procurement: 'fas fa-cart-shopping',
    manufacturing: 'fas fa-industry', painting: 'fas fa-fill-drip', logistics: 'fas fa-truck',
};

const STATUS_EN = {
    pending: 'Not started', blocked: 'Blocked', in_progress: 'In progress', completed: 'Completed',
    on_hold: 'On hold', cancelled: 'Cancelled', skipped: 'Skipped', active: 'Active', draft: 'Draft',
};

export const SHEET_ZOOMS = Object.keys(ZOOMS);

function iconFor(row) {
    if (row.kind === 'block' || row.kind === 'stage') return ROLE_ICONS[row.kind];
    return ROLE_ICONS[row.role] || DEPT_ICONS[row.department] || 'fas fa-circle';
}

// Main tasks carry the product name as their title (every main of 293-15 is
// "LOWER SHELL"), so the department is the label; the title is added only
// when it says more than the job's own title.
export function rowLabel(row, node) {
    const dept = departmentName(row.department, row.department_display);
    if (row.kind === 'main') {
        const title = (row.title || '').trim();
        return title && title !== (node.title || '').trim() ? `${dept} · ${taskTitle(title)}` : dept;
    }
    return taskTitle(row.title) || dept;
}

function statusBadge(status) {
    const [label, cls] = STATUS_META[status] || [status || '—', 'status-grey'];
    const shown = tr(label, STATUS_EN[status] || label);
    return `<span class="status-badge ${cls}">${escapeHtml(shown)}</span>`;
}

function dateCell(value, row, field) {
    if (!value) return '<span class="text-muted">—</span>';
    const tip = row.kind === 'task'
        ? planSourceLabel(row.row)
        : (field === 'plan_end'
            ? tr('planın son görevinin bitişi', "the plan's last task end")
            : tr('planın ilk görevinin başlangıcı', "the plan's first task start"));
    const cls = row.kind === 'task' && isDefaultDuration(row.row) ? ' ps-date-default' : '';
    return `<span class="ps-date${cls}" title="${escapeHtml(tip)}">${fmtDateTr(value)}</span>`;
}

function projectedCell(value, row) {
    if (!value) return '<span class="text-muted">—</span>';
    const dev = Number(row.deviation || 0);
    const cls = dev > 0 ? ' ps-proj-late' : (dev < 0 ? ' ps-proj-early' : '');
    return `<span class="ps-date${cls}">${fmtDateTr(value)}</span>`;
}

function deviationCell(row) {
    const source = row.kind === 'group'
        ? { deviation_wd: row.deviation, own_deviation_wd: row.deviation, chain_deviation_wd: 0, dead: false }
        : row.row;
    const chip = deviationChip(source);
    if (!chip.text) return '<span class="text-muted">—</span>';
    return `<span class="ps-chip ${chip.cls}">${escapeHtml(chip.text)}</span>`;
}

const pctText = value => pct(value);

function progressCell(row) {
    // A dead row's bar is empty for the same reason its text is an em-dash:
    // the work was not done (see progressText).
    const dead = row.kind === 'task' && !!(row.row && row.row.dead);
    const pct = dead
        ? 0
        : Math.max(0, Math.min(100, Math.round(Number(row.progress || 0))));
    const text = row.kind === 'group' ? pctText(pct) : progressText(row.row);
    const expected = row.kind === 'task' && row.row.expected_pct != null
        ? Math.max(0, Math.min(100, Math.round(Number(row.row.expected_pct)))) : null;
    const behind = expected != null && expected > pct;
    const tip = row.kind === 'task'
        ? tr('gerçekleşen / plana göre bugün beklenen', 'actual / expected today by the plan')
        : tr('iş emri ilerlemesi', 'job progress');
    return `
        <span class="ps-progress${behind ? ' ps-progress-behind' : ''}" title="${tip}">
            <span class="ps-progress-track">
                ${expected != null ? `<span class="ps-progress-expected" style="width:${expected}%"></span>` : ''}
                <span class="ps-progress-fill" style="width:${pct}%"></span>
            </span>
            <span class="ps-progress-text">${escapeHtml(text)}</span>
        </span>`;
}

function causeCell(row) {
    const text = row.kind === 'group' ? row.cause : causeSentence(row.row);
    if (!text) return '<span class="text-muted">—</span>';
    return `<span class="ps-cause" title="${escapeHtml(text)}">${escapeHtml(text)}</span>`;
}

function titleCell(value, row) {
    if (row.kind === 'group') {
        const chevron = row.collapsed ? 'fa-chevron-right' : 'fa-chevron-down';
        return `
            <i class="fas ${chevron} pg-toggle"></i>
            <span class="pg-title" title="${escapeHtml(row.job_title || '')}">
                <strong>${escapeHtml(row.title)}</strong>
                <span class="pg-sub">${escapeHtml(row.job_title || '')}</span>
                ${row.late_count ? `<span class="block-count">${row.late_count} ${tr('geride', 'behind')}</span>` : ''}
            </span>`;
    }
    const mark = isDefaultDuration(row.row)
        ? `<span class="ps-default" title="${escapeHtml(tr('Bu görev için süre girilmemiş; departman varsayılanı kullanıldı',
            'No duration entered for this task; the department default was used'))}">${tr('varsayılan süre', 'default duration')}</span>`
        : '';
    return `<span class="pg-title"><i class="${iconFor(row.row)} pg-ico"></i>${escapeHtml(row.title)}${mark}</span>`;
}

export const SHEET_COLUMNS = [
    { field: 'title', label: 'Görev', width: '220px', formatter: (v, row) => titleCell(v, row) },
    { field: 'plan_start', label: 'Plan başl.', width: '84px', headerClass: 'col-center', cellClass: 'col-center col-date',
      formatter: (v, row) => dateCell(v, row, 'plan_start') },
    { field: 'plan_end', label: 'Plan bitiş', width: '84px', headerClass: 'col-center', cellClass: 'col-center col-date',
      formatter: (v, row) => dateCell(v, row, 'plan_end') },
    { field: 'plan_wd', label: 'Süre', width: '52px', headerClass: 'col-center', cellClass: 'col-center col-num',
      title: 'Plan penceresinin iş günü uzunluğu',
      formatter: (v) => (v == null ? '<span class="text-muted">—</span>'
          : String(Number(v).toLocaleString('tr-TR', { maximumFractionDigits: 1 }))) },
    { field: 'progress', label: 'İlerleme', width: '124px', headerClass: 'col-center', cellClass: 'col-progress',
      title: 'Gerçekleşen ilerleme; açık renk plana göre bugün beklenen',
      formatter: (v, row) => progressCell(row) },
    { field: 'status', label: 'Durum', width: '110px', headerClass: 'col-center', cellClass: 'col-center col-status',
      formatter: (v) => statusBadge(v) },
    { field: 'deviation', label: 'Sapma', width: '92px', headerClass: 'col-center', cellClass: 'col-center',
      title: 'Plana göre iş günü: + geride, − önde; "zincir" = önceki görev geç bitirdiği için',
      formatter: (v, row) => deviationCell(row) },
    { field: 'projected_end', label: 'Öngörülen', width: '86px', headerClass: 'col-center', cellClass: 'col-center col-date',
      title: 'Plan penceresi artı sapma: bu hızla, bu malzemeyle biteceği tarih',
      formatter: (v, row) => projectedCell(v, row) },
    { field: 'cause', label: 'Neden', width: '264px', grow: true, formatter: (v, row) => causeCell(row) },
];

// Sum of the column widths above: the grid lane starts where the last
// column ends and the timeline takes whatever the slide has left.
export const SHEET_GRID_WIDTH = 1116;

const COLUMN_TEXT_EN = {
    title: ['Task'],
    plan_start: ['Plan start'],
    plan_end: ['Plan end'],
    plan_wd: ['Days', 'Length of the plan window in working days'],
    progress: ['Progress', 'Actual progress; the light fill is what the plan expects today'],
    status: ['Status'],
    deviation: ['Deviation', 'Working days against the plan: + behind, − ahead; "chain" = because the previous task finished late'],
    projected_end: ['Projected', 'Plan window plus deviation: the end date at the current pace'],
    cause: ['Reason'],
};

/** The sheet's columns, or the subset named by `fields` (Görev always),
 *  labelled in the sheet's language. */
export function sheetColumns(fields) {
    const wanted = fields && fields.length ? new Set(['title', ...fields]) : null;
    return SHEET_COLUMNS.filter(c => !wanted || wanted.has(c.field)).map((c) => {
        const en = COLUMN_TEXT_EN[c.field];
        if (!en) return c;
        return { ...c, label: tr(c.label, en[0]), title: c.title ? tr(c.title, en[1] || c.title) : c.title };
    });
}

/** Width the frozen table needs for these columns, so a column subset
 *  hands the difference to the timeline. */
export function columnsWidth(columns) {
    return Math.round(columns.reduce((sum, c) => sum + (parseFloat(c.width) || 0), 0));
}

export function groupKeyOf(node) {
    return `job-${node.job_no}`;
}

/**
 * Grid rows (group per job, task rows beneath) from the payload. A collapsed
 * job folds its own tasks AND every sub-job under it — nodes come in DFS
 * order, so a job whose parent is hidden or collapsed is skipped whole.
 */
export function buildSheetRows(sheet, collapsed = new Set(), { mainOnly = false } = {}) {
    const rows = [];
    const hiddenJobs = new Set();
    for (const { node, rows: taskRows } of groupRows(sheet)) {
        const groupKey = groupKeyOf(node);
        if (node.parent && (hiddenJobs.has(node.parent) || collapsed.has(`job-${node.parent}`))) {
            hiddenJobs.add(node.job_no);
            continue;
        }
        const rc = node.root_cause;
        const rootCauseText = rc
            ? `${rootCauseLabel(rc)}${rc.job_no && rc.job_no !== node.job_no ? ` (${rc.job_no})` : ''}: `
                + causeSentence({ cause: rc.cause, own_deviation_wd: rc.own_deviation_wd })
            : '';
        const targetLate = Number(node.termin_gap_wd || 0) > 0;
        rows.push({
            key: groupKey,
            kind: 'group',
            indent: Math.min(node.depth, 2),
            title: node.job_no,
            job_title: node.title,
            job_no: node.job_no,
            node,
            plan_start: node.plan_start,
            plan_end: node.plan_end,
            plan_wd: null,
            progress: node.completion_percentage,
            status: node.status,
            deviation: node.deviation_wd,
            projected_end: node.projected_end,
            cause: rootCauseText,
            job_target: node.termin,
            job_target_late: targetLate,
            job_target_delta_wd: node.termin_gap_wd,
            late_count: node.late_count,
            collapsed: collapsed.has(groupKey),
        });
        for (const r of taskRows) {
            // A customer's view: the department tasks, not the crews under them.
            if (mainOnly && r.depth > 0) continue;
            rows.push({
                key: r.key,
                groupKey,
                kind: 'task',
                indent: Math.min(1 + r.depth, 4),
                title: rowLabel(r, node),
                job_no: r.job_no,
                node,
                row: r,
                plan_start: r.plan_start,
                plan_end: r.plan_end,
                plan_wd: r.plan_wd,
                progress: r.progress_pct,
                status: r.status,
                deviation: r.deviation_wd,
                projected_end: r.projected_end,
                // What the Neden cell shows, so an editable link's editor
                // opens on it (and can clear it) instead of on nothing.
                cause: causeSentence(r),
                job_target: node.termin,
                job_target_late: targetLate,
            });
        }
    }
    return rows;
}

function rowBar(row) {
    if (row.kind === 'task' && row.row.dead) return null;
    const start = row.plan_start;
    const end = row.plan_end;
    if (!start || !end || end < start) return null;
    // An edited deviation or status is the sales team's word over the
    // computed one, so the bar reads from the row like a job row does.
    const edited = row.edited && (row.edited.has('deviation') || row.edited.has('status'));
    const state = row.kind === 'group' || edited
        ? (row.status === 'completed' ? 'done'
            : (row.status === 'on_hold' ? 'hold' : (Number(row.deviation || 0) > 0 ? 'late' : 'on-time')))
        : barState(row.row, row.node);
    const projected = row.projected_end;
    const deviates = projected && projected !== end;
    const dev = Number(row.deviation || 0);
    const signed = `${dev > 0 ? '+' : ''}${dev}`;
    const title = `${row.title} · plan ${fmtDateTr(start)} – ${fmtDateTr(end)}`
        + (deviates ? ` · ${tr('öngörülen', 'projected')} ${fmtDateTr(projected)} (${signed} ${tr('iş günü', 'working days')})` : '');
    return {
        start, end,
        progress: Math.max(0, Math.min(100, Number(row.progress || 0))),
        state,
        label: row.title,
        title,
    };
}

function rowClasses(row) {
    const classes = [];
    if (row.kind === 'group') classes.push('pg-row-group');
    if (row.kind === 'group' && Number(row.node.termin_gap_wd || 0) > 0) classes.push('pg-group-late');
    if (row.kind === 'task') {
        classes.push('pg-row-dept');
        if (row.row.kind === 'block') classes.push('pg-row-block');
        if (row.row.dead) classes.push('pg-row-cancelled');
        if (Number(row.deviation || 0) > 0) classes.push('ps-row-late');
        if (Number(row.row.chain_deviation_wd || 0) > 0 && Number(row.row.own_deviation_wd || 0) <= 0) {
            classes.push('ps-row-chain');
        }
    }
    classes.push(`pg-indent-${row.indent || 0}`);
    return classes.join(' ');
}

// The projected overrun drawn behind the plan bar: a hatched tail from the
// plan end to the projected end — red for the row's own loss, grey when it
// is only the chain (the row before it finishing late).
function projectionTailHtml(row, timeline) {
    const planEnd = row.plan_end;
    const projected = row.projected_end;
    if (!planEnd || !projected || projected <= planEnd) return '';
    if (row.kind === 'task' && row.row.dead) return '';
    const oneUnit = timeline.unit === 'day' ? timeline.colWidth
        : timeline.colWidth / (timeline.unit === 'week' ? 7 : 30);
    const x0 = timeline.xOf(planEnd);
    const x1 = timeline.xOf(projected);
    if (x0 === null || x1 === null) return '';
    const left = x0 + oneUnit;
    const width = Math.max(4, x1 - x0);
    const dev = Number(row.deviation || 0);
    const chainOnly = row.kind === 'task' && !(row.edited && row.edited.has('deviation'))
        && Number(row.row.own_deviation_wd || 0) <= 0 && Number(row.row.chain_deviation_wd || 0) > 0;
    const label = `${dev > 0 ? '+' : ''}${dev}`;
    return `
        <div class="ps-bar-ext${chainOnly ? ' ps-bar-ext-chain' : ''}" style="left:${left}px;width:${width}px"
             title="${escapeHtml(tr(`Öngörülen bitiş ${fmtDateTr(projected)}: plana göre ${label} iş günü${chainOnly ? ' (zincir)' : ''}`,
                 `Projected end ${fmtDateTr(projected)}: ${label} working days against the plan${chainOnly ? ' (chained)' : ''}`))}">
            ${row.kind !== 'group' && width > 34 ? `<span>${label}</span>` : ''}
        </div>`;
}

// The plan bar, widened to the projected end: what the timeline's domain
// pass sees, so a tail never runs off the lane.
export function domainBarOf(planBar) {
    return (row) => {
        const bar = planBar(row);
        if (!bar || !row.projected_end || row.projected_end <= bar.end) return bar;
        return { ...bar, end: row.projected_end };
    };
}

// The grid sizes its timeline through the bar accessor (start/end of every
// bar), so a projected tail past the last plan end would run off the right
// edge. The domain pass therefore sees the projected end as the bar's end;
// the drawing pass switches back to the plan bar and adds the tail itself.
export class SheetGrid extends PlanningGrid {
    // A job row's Görev cell shows its number and name; on an editable link
    // the name is what changes, never the number.
    _startEdit(cell) {
        const row = this._rowByKey(cell.dataset.row);
        if (row && row.kind === 'group' && cell.dataset.field === 'title') {
            const number = row.title;
            row.title = row.job_title || '';
            try {
                super._startEdit(cell);
            } finally {
                row.title = number;
            }
            return;
        }
        super._startEdit(cell);
    }

    render() {
        const planBar = this.options.bar;
        this._planBar = planBar;
        this.options.bar = domainBarOf(planBar);
        try {
            super.render();
        } finally {
            this.options.bar = planBar;
        }
    }

    _barHtml(row, timeline) {
        const domainBar = this.options.bar;
        this.options.bar = this._planBar || domainBar;
        try {
            return stripTerminTag(super._barHtml(row, timeline))
                + projectionTailHtml(row, timeline) + terminGapPillHtml(row, timeline);
        } finally {
            this.options.bar = domainBar;
        }
    }
}

// The grid pins its termin tag ("⚑ 30.09.2026 +25g") to the termin line —
// where a late job's bar runs straight through it. The sheet drops that tag
// and draws the gap itself, after the projection's end.
const TERMIN_TAG_RE = /<div class="pg-target-tag[^"]*"[^>]*>[\s\S]*?<\/div>/g;

function stripTerminTag(html) {
    return html.replace(TERMIN_TAG_RE, '');
}

// Job rows: "+25g" just past the end of the projection (the hatched tail, or
// the bar when there is no overrun) — the space there is clear, and the pill
// reads as "ends here, 25 working days past the termin". The date itself is
// in the Termin figure and the columns.
function terminGapPillHtml(row, timeline) {
    if (row.kind !== 'group' || !row.job_target) return '';
    const delta = Number(row.job_target_delta_wd || 0);
    if (!delta) return '';
    const planEnd = row.plan_end;
    const projected = row.projected_end;
    const endDate = projected && planEnd && projected > planEnd ? projected : (planEnd || projected);
    if (!endDate) return '';
    const x = timeline.xOf(endDate);
    if (x === null) return '';
    const oneUnit = timeline.unit === 'day' ? timeline.colWidth
        : timeline.colWidth / (timeline.unit === 'week' ? 7 : 30);
    const late = delta > 0;
    const label = `${late ? '+' : '−'}${Math.abs(delta)}${tr('g', 'd')}`;
    const title = tr(`Termin ${fmtDateTr(row.job_target)}: öngörülen bitiş termini ${Math.abs(delta)} iş günü ${late ? 'aşıyor' : 'önce'}`,
        `Due date ${fmtDateTr(row.job_target)}: the projected end is ${wdText(delta)} ${late ? 'past it' : 'before it'}`);
    return `
        <div class="pg-target-tag ps-gap-pill${late ? ' is-late' : ' is-early'}" style="left:${x + oneUnit}px"
             title="${escapeHtml(title)}">${label}</div>`;
}

// ---- editable links ---------------------------------------------------------
//
// A sales link (PlanSheetShareLink.editable) lets every cell be changed
// before the PDF is printed. The edits are overrides keyed by row key
// ("task:12", "job-009-37") and field; they sit on top of the computed rows
// and never reach the plan itself.

const EDIT_TYPES = {
    title: 'text', plan_start: 'date', plan_end: 'date', plan_wd: 'number',
    progress: 'number', status: 'select', deviation: 'number', projected_end: 'date',
    cause: 'text',
};
export const NUMBER_FIELDS = new Set(['plan_wd', 'progress', 'deviation']);
const STATUS_OPTIONS = Object.entries(STATUS_META)
    .filter(([value]) => !['active', 'draft'].includes(value))
    .map(([value, [label]]) => ({ value, label }));

/** The override field an edit of `field` on `row` lands in: a job row's
 *  Görev cell edits the job's name. */
export function overrideFieldOf(row, field) {
    return row.kind === 'group' && field === 'title' ? 'job_title' : field;
}

/** Rows with the link's edits laid over them; `base` keeps the computed row
 *  so an edit back to the original can drop the override. */
export function applyRowOverrides(rows, overrides) {
    if (!overrides) return rows;
    return rows.map((row) => {
        const fields = overrides[row.key];
        if (!fields || !Object.keys(fields).length) return { ...row, base: row };
        return { ...row, ...fields, base: row, edited: new Set(Object.keys(fields)) };
    });
}

// The formatters above read task rows' computed payload (row.row) for their
// sentences and chips; an edited value has to win over that.
function editedHtml(field, value, row) {
    if (field === 'deviation') {
        return deviationCell({ kind: 'group', deviation: value });
    }
    if (field === 'progress') {
        const pct = Math.max(0, Math.min(100, Math.round(Number(value || 0))));
        return `
            <span class="ps-progress">
                <span class="ps-progress-track"><span class="ps-progress-fill" style="width:${pct}%"></span></span>
                <span class="ps-progress-text">${pctText(pct)}</span>
            </span>`;
    }
    if (field === 'cause') {
        // Cleared on purpose: blank, not the "—" of a row with no reason.
        return `<span class="ps-cause" title="${escapeHtml(value || '')}">${escapeHtml(value || '')}</span>`;
    }
    return null;
}

function editableColumns(columns) {
    return columns.map(col => ({
        ...col,
        type: EDIT_TYPES[col.field] || 'text',
        options: col.field === 'status' ? STATUS_OPTIONS : undefined,
        min: col.field === 'progress' ? 0 : undefined,
        max: col.field === 'progress' ? 100 : undefined,
        step: NUMBER_FIELDS.has(col.field) ? 'any' : undefined,
        formatter: (v, row) => {
            const field = overrideFieldOf(row, col.field);
            const edited = row.edited && row.edited.has(field);
            const html = (edited && editedHtml(col.field, v, row)) || col.formatter(v, row);
            return edited
                ? `${html}<span class="ps-edit-dot" title="Bu bağlantıda değiştirildi"></span>`
                : html;
        },
    }));
}

/**
 * Render (or re-render) the sheet into `containerId`. `state` keeps the
 * zoom and the collapsed groups across slides, and may narrow the sheet:
 * `columns` (field names, Görev always), `mainOnly` (department tasks
 * only), `gridWidth` / `colWidth` (print geometry). An editable link
 * adds `overrides` (row key → field → value) and `onEdit(row, field, value)`,
 * which stores the edit; every cell then takes a click. Returns the grid.
 */
export function renderPlanSheet(containerId, sheet, state) {
    const calendar = createWorkdayCalendar(sheet.holidays || []);
    const editable = typeof state.onEdit === 'function';
    const baseColumns = sheetColumns(state.columns);
    const columns = editable ? editableColumns(baseColumns) : baseColumns;
    const rowOptions = { mainOnly: !!state.mainOnly };
    const rowsNow = () => applyRowOverrides(
        buildSheetRows(sheet, state.collapsed, rowOptions), editable ? state.overrides : null);
    const rows = rowsNow();
    const groupKeys = (sheet.nodes || []).map(groupKeyOf);
    const allCollapsed = () => groupKeys.length > 0 && groupKeys.every(k => state.collapsed.has(k));
    const refresh = () => {
        grid.options.allCollapsed = allCollapsed();
        grid.setRows(rowsNow());
    };
    const grid = new SheetGrid(containerId, {
        columns,
        rows,
        zoom: SHEET_ZOOMS.includes(state.zoom) ? state.zoom : 'week',
        gridWidth: state.gridWidth || columnsWidth(baseColumns),
        // No cap: the grip may widen the table (and so Neden) all the way.
        maxGridWidth: Infinity,
        colWidth: state.colWidth || null,
        collapsed: state.collapsed,
        allCollapsed: allCollapsed(),
        isCellEditable: () => editable,
        onEdit: editable ? async (row, field, value) => {
            await state.onEdit(row, overrideFieldOf(row, field), value);
            refresh();
        } : null,
        onEditError: editable ? state.onEditError || null : null,
        rowAttributes: (row) => ({ class: rowClasses(row) }),
        bar: rowBar,
        isNonWorkingDay: (d) => calendar.isNonWorkingDay(d),
        today: state.today || new Date(),
        onToggleGroup: (row) => {
            if (state.collapsed.has(row.key)) state.collapsed.delete(row.key);
            else state.collapsed.add(row.key);
            refresh();
        },
        // The header's double chevron: fold every job, or open every job.
        onToggleAll: () => {
            if (allCollapsed()) groupKeys.forEach(k => state.collapsed.delete(k));
            else groupKeys.forEach(k => state.collapsed.add(k));
            refresh();
        },
        onZoomChange: (zoom) => { state.zoom = zoom; },
        onGridWidthChange: (px) => { state.gridWidth = px; },
        actions: [],
    });
    grid.render();
    scrollTimelineToToday(containerId, grid, sheet, state);
    return grid;
}

// A plan that runs longer than the lane opens on the past otherwise; today
// sits a third of the way in, with the recent weeks to its left.
function scrollTimelineToToday(containerId, grid, sheet, state) {
    const host = document.getElementById(containerId);
    const scroller = host ? host.querySelector('.pg-scroll') : null;
    const timeline = grid.timeline;
    if (!scroller || !timeline || !sheet.today) return;
    const lane = scroller.clientWidth - grid.options.gridWidth;
    if (lane <= 0 || timeline.width <= lane) return;
    const x = timeline.xOf(String(sheet.today).slice(0, 10));
    if (x === null) return;
    scroller.scrollLeft = Math.max(0, Math.round(x - lane / 3));
}
