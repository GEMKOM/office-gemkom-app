/**
 * Plan sheet on the meeting slide — the İmalat Planlama grid (PlanningGrid),
 * read-only, fed by GET /projects/job-orders/{job_no}/plan-sheet/.
 *
 * One group row per job order (root and sub-jobs), the department tasks
 * beneath it. The BAR is the plan window with the progress fill; a hatched
 * tail after it is the projected overrun; the violet line is the termin,
 * today is red. The Sapma column says how far the row is from its plan and
 * the Neden column why. Sentences come from planSheetText.js (tested under
 * node).
 */

import { PlanningGrid, ZOOMS } from '../../manufacturing/welding/capacity-planning/grid.js';
import { createWorkdayCalendar } from '../../utils/workdays.js';
import { escapeHtml } from '../../utils/text.js';
import {
    barState, causeSentence, deviationChip, fmtDateTr, groupRows,
    isDefaultDuration, planSourceLabel, progressText,
} from './planSheetText.js';

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

export const SHEET_ZOOMS = Object.keys(ZOOMS);

function iconFor(row) {
    if (row.kind === 'block' || row.kind === 'stage') return ROLE_ICONS[row.kind];
    return ROLE_ICONS[row.role] || DEPT_ICONS[row.department] || 'fas fa-circle';
}

// Main tasks carry the product name as their title (every main of 293-15 is
// "LOWER SHELL"), so the department is the label; the title is added only
// when it says more than the job's own title.
export function rowLabel(row, node) {
    const dept = row.department_display || row.department || '';
    if (row.kind === 'main') {
        const title = (row.title || '').trim();
        return title && title !== (node.title || '').trim() ? `${dept} · ${title}` : dept;
    }
    return row.title || dept;
}

function statusBadge(status) {
    const [label, cls] = STATUS_META[status] || [status || '—', 'status-grey'];
    return `<span class="status-badge ${cls}">${escapeHtml(label)}</span>`;
}

function dateCell(value, row, field) {
    if (!value) return '<span class="text-muted">—</span>';
    const tip = row.kind === 'task'
        ? planSourceLabel(row.row)
        : (field === 'plan_end' ? 'planın son görevinin bitişi' : 'planın ilk görevinin başlangıcı');
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

function progressCell(row) {
    const pct = Math.max(0, Math.min(100, Math.round(Number(row.progress || 0))));
    const text = row.kind === 'group' ? `%${pct}` : progressText(row.row);
    const expected = row.kind === 'task' && row.row.expected_pct != null
        ? Math.max(0, Math.min(100, Math.round(Number(row.row.expected_pct)))) : null;
    const behind = expected != null && expected > pct;
    const tip = row.kind === 'task' ? 'gerçekleşen / plana göre bugün beklenen' : 'iş emri ilerlemesi';
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
                ${row.late_count ? `<span class="block-count">${row.late_count} geride</span>` : ''}
            </span>`;
    }
    const mark = isDefaultDuration(row.row)
        ? '<span class="ps-default" title="Bu görev için süre girilmemiş; departman varsayılanı kullanıldı">varsayılan süre</span>'
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
    { field: 'status', label: 'Durum', width: '104px', headerClass: 'col-center', cellClass: 'col-center',
      formatter: (v) => statusBadge(v) },
    { field: 'deviation', label: 'Sapma', width: '92px', headerClass: 'col-center', cellClass: 'col-center',
      title: 'Plana göre iş günü: + geride, − önde; "zincir" = önceki görev geç bitirdiği için',
      formatter: (v, row) => deviationCell(row) },
    { field: 'projected_end', label: 'Öngörülen', width: '86px', headerClass: 'col-center', cellClass: 'col-center col-date',
      title: 'Plan penceresi artı sapma: bu hızla, bu malzemeyle biteceği tarih',
      formatter: (v, row) => projectedCell(v, row) },
    { field: 'cause', label: 'Neden', width: '270px', formatter: (v, row) => causeCell(row) },
];

// Sum of the column widths above: the grid lane starts where the last
// column ends and the timeline takes whatever the slide has left.
export const SHEET_GRID_WIDTH = 1116;

/** Grid rows (group per job, task rows beneath) from the payload. */
export function buildSheetRows(sheet, collapsed = new Set()) {
    const rows = [];
    for (const { node, rows: taskRows } of groupRows(sheet)) {
        const groupKey = `job-${node.job_no}`;
        const rc = node.root_cause;
        const rootCauseText = rc
            ? `${rc.department_display || rc.title}${rc.job_no && rc.job_no !== node.job_no ? ` (${rc.job_no})` : ''}: `
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
            forecast_date: node.projected_end,
            cause: rootCauseText,
            job_target: node.termin,
            job_target_late: targetLate,
            job_target_delta_wd: node.termin_gap_wd,
            late_count: node.late_count,
            collapsed: collapsed.has(groupKey),
        });
        for (const r of taskRows) {
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
                forecast_date: r.projected_end,
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
    const state = row.kind === 'group'
        ? (row.status === 'completed' ? 'done'
            : (row.status === 'on_hold' ? 'hold' : (Number(row.deviation || 0) > 0 ? 'late' : 'on-time')))
        : barState(row.row, row.node);
    const projected = row.projected_end;
    const deviates = projected && projected !== end;
    const dev = Number(row.deviation || 0);
    const signed = `${dev > 0 ? '+' : ''}${dev}`;
    const title = `${row.title} · plan ${fmtDateTr(start)} – ${fmtDateTr(end)}`
        + (deviates ? ` · öngörülen ${fmtDateTr(projected)} (${signed} iş günü)` : '');
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
    if (row.kind === 'group' && Number(row.job_target_delta_wd || 0) > 0) classes.push('pg-group-late');
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
    const chainOnly = row.kind === 'task'
        && Number(row.row.own_deviation_wd || 0) <= 0 && Number(row.row.chain_deviation_wd || 0) > 0;
    const label = `${dev > 0 ? '+' : ''}${dev}`;
    return `
        <div class="ps-bar-ext${chainOnly ? ' ps-bar-ext-chain' : ''}" style="left:${left}px;width:${width}px"
             title="Öngörülen bitiş ${fmtDateTr(projected)}: plana göre ${label} iş günü${chainOnly ? ' (zincir)' : ''}">
            ${width > 34 ? `<span>${label}</span>` : ''}
        </div>`;
}

// The grid sizes its timeline through the bar accessor (start/end of every
// bar), so a projected tail past the last plan end would run off the right
// edge. The domain pass therefore sees the projected end as the bar's end;
// the drawing pass switches back to the plan bar and adds the tail itself.
class SheetGrid extends PlanningGrid {
    render() {
        const planBar = this.options.bar;
        this._planBar = planBar;
        this.options.bar = (row) => {
            const bar = planBar(row);
            if (!bar || !row.projected_end || row.projected_end <= bar.end) return bar;
            return { ...bar, end: row.projected_end };
        };
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
            return super._barHtml(row, timeline) + projectionTailHtml(row, timeline);
        } finally {
            this.options.bar = domainBar;
        }
    }
}

/**
 * Render (or re-render) the sheet into `containerId`. `state` keeps the
 * zoom and the collapsed groups across slides; returns the grid.
 */
export function renderPlanSheet(containerId, sheet, state) {
    const calendar = createWorkdayCalendar(sheet.holidays || []);
    const rows = buildSheetRows(sheet, state.collapsed);
    const grid = new SheetGrid(containerId, {
        columns: SHEET_COLUMNS,
        rows,
        zoom: SHEET_ZOOMS.includes(state.zoom) ? state.zoom : 'week',
        gridWidth: state.gridWidth || SHEET_GRID_WIDTH,
        collapsed: state.collapsed,
        isCellEditable: () => false,
        rowAttributes: (row) => ({ class: rowClasses(row) }),
        bar: rowBar,
        isNonWorkingDay: (d) => calendar.isNonWorkingDay(d),
        today: new Date(),
        onToggleGroup: (row) => {
            if (state.collapsed.has(row.key)) state.collapsed.delete(row.key);
            else state.collapsed.add(row.key);
            grid.setRows(buildSheetRows(sheet, state.collapsed));
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
    const lane = scroller.clientWidth - (state.gridWidth || SHEET_GRID_WIDTH);
    if (lane <= 0 || timeline.width <= lane) return;
    const x = timeline.xOf(String(sheet.today).slice(0, 10));
    if (x === null) return;
    scroller.scrollLeft = Math.max(0, Math.round(x - lane / 3));
}
