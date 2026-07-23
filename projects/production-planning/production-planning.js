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
import { TableComponent } from '../../components/table/table.js';
import { GanttChart } from '../../components/gantt/gantt.js';
import { ModernDropdown } from '../../components/dropdown/dropdown.js';
import { showNotification } from '../../components/notification/notification.js';
import {
    getJobOrderProductionPlan,
    getJobOrderDropdown,
    getProductionPlanOverview,
    getJobOrderMeetingBrief
} from '../../apis/projects/jobOrders.js';

// Module state
let plan = null;                 // merged plan for all selected job orders
let currentJobNos = [];
let planTable = null;
let ganttChart = null;
let ganttDirty = false;
let currentView = 'table';
let jobOrderDropdown = null;
let viewControlsBound = false;
let departmentFilterDropdown = null;
let classificationFilterDropdown = null;
let activeFilters = { departments: [], classifications: [] };
let taskLabelById = new Map();
let taskById = new Map();
let loadedPlans = [];

// Portfolio (weekly review) mode state
let currentMode = null;                 // 'portfolio' | 'detail' | 'meeting'
let overviewData = null;                // last fetched overview payload
let overviewStatus = 'active';          // status the cached overview was fetched with
let portfolioSort = 'job_no';           // 'job_no' | 'risk'
let portfolioStatusDropdown = null;
let portfolioSortDropdown = null;

// Meeting (Sunum Modu) state
let meetingItems = [];                  // portfolio items in slide order
let meetingIndex = 0;
let meetingBound = false;               // meeting listeners bound once
let meetingWheelAt = 0;                 // wheel debounce timestamp
const meetingBriefCache = new Map();    // job_no -> meeting brief payload
const meetingBriefLoading = new Set();  // job_nos with an in-flight fetch

const PORTFOLIO_STATUS_OPTIONS = [
    { value: 'active', text: 'Aktif' },
    { value: 'all', text: 'Tümü' },
    { value: 'on_hold', text: 'Beklemede' },
    { value: 'draft', text: 'Taslak' },
    { value: 'completed', text: 'Tamamlandı' },
    { value: 'cancelled', text: 'İptal Edildi' }
];

// House badge component classes (components/badges/badges.css) — no yellow.
const CLASSIFICATION_BADGES = {
    completed_on_time: { label: 'Zamanında', badgeClass: 'status-green' },
    completed_late: { label: 'Geç Bitti', badgeClass: 'status-red' },
    overdue: { label: 'Gecikmede', badgeClass: 'status-red' },
    at_risk: { label: 'Riskte', badgeClass: 'status-purple' },
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

    setupJobOrderPicker();
    setupPortfolioControls();
    setupBackButton();
    window.addEventListener('popstate', () => handleRoute());

    await handleRoute();
});

// URL is the source of truth: ?meeting=1 -> meeting view (optional job_no =
// current slide), ?job_no= params -> detail, none -> portfolio.
async function handleRoute() {
    const params = new URLSearchParams(window.location.search);
    const jobNos = params.getAll('job_no').filter(Boolean);
    if (params.get('meeting')) {
        await enterMeeting(jobNos[0] || null);
        return;
    }
    if (jobNos.length) {
        currentJobNos = jobNos;
        if (jobOrderDropdown) jobOrderDropdown.setValue(jobNos);
        await enterDetail(jobNos);
    } else {
        await enterPortfolio();
    }
}

function setModeChrome(mode) {
    currentMode = mode;
    const backButton = document.getElementById('pp-back-portfolio');
    const portfolioControls = document.getElementById('pp-portfolio-controls');
    const detailControls = document.getElementById('pp-view-controls');
    const viewContainer = document.getElementById('plan-view-container');
    const meetingContainer = document.getElementById('pp-meeting-container');
    const verdictContainer = document.getElementById('plan-verdict-container');

    if (backButton) backButton.style.display = mode === 'detail' ? '' : 'none';
    if (portfolioControls) {
        portfolioControls.classList.toggle('d-none', mode !== 'portfolio');
        portfolioControls.classList.toggle('d-flex', mode === 'portfolio');
    }
    if (detailControls && mode !== 'detail') {
        detailControls.classList.add('d-none');
        detailControls.classList.remove('d-flex');
    }
    if (viewContainer) viewContainer.style.display = mode === 'detail' ? '' : 'none';

    // Meeting mode is fullscreen: the body class hides navbar, header,
    // toolbar and page decor via CSS, and freezes page scroll. Toggling it
    // here covers every exit path (Esc, Çık, browser Back, direct URL).
    document.body.classList.toggle('pp-meeting-fullscreen', mode === 'meeting');
    if (meetingContainer) meetingContainer.style.display = mode === 'meeting' ? '' : 'none';
    if (verdictContainer) verdictContainer.style.display = mode === 'meeting' ? 'none' : '';
}

function setupBackButton() {
    const backButton = document.getElementById('pp-back-portfolio');
    if (!backButton) return;
    backButton.addEventListener('click', () => {
        window.history.pushState(null, '', window.location.pathname);
        handleRoute();
    });
}

function renderHeader(subtitle) {
    new HeaderComponent({
        title: 'Üretim Planlama',
        subtitle: subtitle || 'İş emri departman görevleri — plan ve gerçekleşme',
        icon: 'calendar-check',
        containerId: 'header-placeholder',
        showBackButton: 'block',
        backUrl: '/projects/project-tracking/',
        showRefreshButton: 'block',
        onRefreshClick: async () => {
            if (currentMode === 'portfolio') {
                await fetchOverview(overviewStatus);
                renderPortfolio();
            } else if (currentJobNos.length) {
                loadPlans(currentJobNos);
            }
        }
    });
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
    mount.style.width = '300px';
    jobOrderDropdown = new ModernDropdown(mount, {
        placeholder: 'İş emri seçin (birden fazla seçilebilir)...',
        searchable: true,
        multiple: true,
        width: '300px',
        maxHeight: 320
    });

    applyButton.addEventListener('click', () => {
        const selected = (jobOrderDropdown.getValue() || []).filter(Boolean);
        if (!selected.length) {
            showNotification('En az bir iş emri seçin', 'warning');
            return;
        }
        const params = new URLSearchParams();
        selected.forEach(jobNo => params.append('job_no', jobNo));
        window.history.pushState(null, '', `${window.location.pathname}?${params.toString()}`);
        handleRoute();
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
    loadedPlans = plans;
    taskById = new Map(plan.tasks.map(t => [t.id, t]));
    taskLabelById = new Map(plan.tasks.map(t => [
        t.id, `${t.job_no} · ${t.department_display}${t.title ? ' · ' + t.title : ''}`
    ]));

    renderHeader(buildSubtitle(plans));
    renderVerdicts();
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
        completed_on_time: 0, completed_late: 0, overdue: 0, at_risk: 0,
        in_progress: 0, not_started: 0, unplanned: 0, excluded: 0,
        max_end_variance_wd: null,
        max_overdue_wd: null,
        max_projected_variance_wd: null
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
        if (sched.projected_variance_wd !== null && sched.projected_variance_wd > 0) {
            summary.max_projected_variance_wd = Math.max(summary.max_projected_variance_wd || 0, sched.projected_variance_wd);
        }
    }
    return summary;
}

// ---------------------------------------------------------------------------
// Job order finish verdicts — the hero panel (Hedef vs Öngörülen Bitiş)
// ---------------------------------------------------------------------------

const VERDICT_META = {
    on_track: { theme: 'green', label: 'Zamanında Bitecek', icon: 'fa-circle-check' },
    late_risk: { theme: 'red', label: 'Gecikecek', icon: 'fa-triangle-exclamation' },
    finished_on_time: { theme: 'green', label: 'Tamamlandı · Zamanında', icon: 'fa-flag-checkered' },
    finished_late: { theme: 'red', label: 'Tamamlandı · Geç', icon: 'fa-flag-checkered' },
    no_target: { theme: 'orange', label: 'Hedef Tarih Girilmemiş', icon: 'fa-circle-question' },
    unknown: { theme: 'grey', label: 'Öngörü Yok', icon: 'fa-circle-question' }
};

function verdictHeadline(forecast) {
    const meta = VERDICT_META[forecast.verdict] || VERDICT_META.unknown;
    let detail = '';
    if (forecast.verdict === 'late_risk' || forecast.verdict === 'finished_late') {
        detail = ` · +${formatWd(forecast.variance_wd)} iş günü`;
    }
    return `
        <div class="pp-verdict-headline pp-vh-${meta.theme}">
            <i class="fas ${meta.icon}"></i>
            <span>${meta.label}${detail}</span>
        </div>`;
}

function verdictTimelineHtml(forecast, summary, todayIso) {
    const ms = (d) => d ? new Date(d).getTime() : null;
    const today = ms(todayIso);
    const target = ms(forecast.target_completion_date);
    const projected = ms(forecast.projected_completion_date);
    const workStart = [
        ms(summary.planned_window && summary.planned_window.start),
        ms(summary.actual_window && summary.actual_window.start),
        today
    ].filter(Boolean).sort()[0];

    const points = [today, target, projected, workStart].filter(Boolean);
    if (points.length < 2 || !(target || projected)) return '';

    let min = Math.min(...points);
    let max = Math.max(...points);
    if (max === min) max = min + 24 * 60 * 60 * 1000;
    const pad = (max - min) * 0.05;
    min -= pad;
    max += pad;
    const pos = (t) => (((t - min) / (max - min)) * 100).toFixed(2);
    const clampLabel = (t) => Math.min(93, Math.max(7, (t - min) / (max - min) * 100)).toFixed(2);
    const shortDate = (t) => new Date(t).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });

    // Base span: work window up to target (or projected when no target)
    const baseEnd = target ?? projected;
    const segments = [
        `<div class="pp-tl-plan" style="left: ${pos(workStart)}%; width: ${(pos(baseEnd) - pos(workStart)).toFixed(2)}%"></div>`
    ];
    if (target && projected && projected > target) {
        segments.push(`<div class="pp-tl-overshoot" style="left: ${pos(target)}%; width: ${(pos(projected) - pos(target)).toFixed(2)}%"></div>`);
    } else if (target && projected && projected < target) {
        segments.push(`<div class="pp-tl-slack" style="left: ${pos(projected)}%; width: ${(pos(target) - pos(projected)).toFixed(2)}%"></div>`);
    }

    const markers = [`
        <div class="pp-tl-today" style="left: ${pos(today)}%">
            <span>Bugün</span>
        </div>`];
    if (target) markers.push(`<div class="pp-tl-marker pp-tl-target" style="left: ${pos(target)}%"></div>`);
    if (projected) markers.push(`<div class="pp-tl-marker pp-tl-projected" style="left: ${pos(projected)}%"></div>`);

    const labels = [];
    if (target) {
        labels.push(`<div class="pp-tl-label pp-tl-label-target" style="left: ${clampLabel(target)}%">
            <i class="fas fa-bullseye"></i> Hedef · ${shortDate(target)}</div>`);
    }
    if (projected) {
        labels.push(`<div class="pp-tl-label pp-tl-label-projected" style="left: ${clampLabel(projected)}%">
            <i class="fas fa-location-arrow"></i> Öngörülen · ${shortDate(projected)}</div>`);
    }

    return `
        <div class="pp-timeline">
            <div class="pp-tl-track">${segments.join('')}${markers.join('')}</div>
            <div class="pp-tl-labels">${labels.join('')}</div>
        </div>`;
}

function verdictMetaHtml(summary, forecast) {
    const bits = [
        `<span>${summary.total || 0} görev</span>`
    ];
    if (summary.completed_late > 0) bits.push(`<span class="pp-dot pp-dot-red">${summary.completed_late} geç bitti</span>`);
    if (summary.overdue > 0) bits.push(`<span class="pp-dot pp-dot-red">${summary.overdue} gecikmede</span>`);
    if (summary.at_risk > 0) bits.push(`<span class="pp-dot pp-dot-purple">${summary.at_risk} riskte</span>`);
    if (forecast.unplanned_open_tasks > 0) {
        bits.push(`<span class="pp-dot pp-dot-orange">${forecast.unplanned_open_tasks} açık görev plansız — öngörü eksik olabilir</span>`);
    } else if (summary.unplanned > 0) {
        bits.push(`<span class="pp-dot pp-dot-orange">${summary.unplanned} plansız</span>`);
    }
    return `<div class="pp-verdict-meta">${bits.join('<span class="pp-meta-sep">·</span>')}</div>`;
}

function verdictCardHtml(jobOrderLike, summary, todayIso, opts = {}) {
    const forecast = jobOrderLike.forecast || { verdict: 'unknown', unplanned_open_tasks: 0 };
    const meta = VERDICT_META[forecast.verdict] || VERDICT_META.unknown;
    const variance = forecast.variance_wd;
    const varianceFigure = variance === null || variance === undefined
        ? '<span class="pp-fig-value">—</span>'
        : (variance > 0
            ? `<span class="pp-fig-value pp-fig-late">+${formatWd(variance)} iş günü</span>`
            : (variance < 0
                ? `<span class="pp-fig-value pp-fig-early">${formatWd(variance)} iş günü erken</span>`
                : '<span class="pp-fig-value">Tam zamanında</span>'));
    const projectedClass = variance !== null && variance !== undefined && variance > 0
        ? 'pp-fig-late' : '';
    const pct = Math.round(jobOrderLike.completion_percentage || 0);
    const statusChip = jobOrderLike.status && jobOrderLike.status !== 'active'
        ? `<span class="status-badge status-grey ms-2">${escapeHtml(jobOrderLike.status_display || jobOrderLike.status)}</span>`
        : '';
    const clickable = opts.clickable
        ? ` pp-clickable" role="button" data-job-no="${escapeHtml(jobOrderLike.job_no)}` : '';

    return `
        <div class="dashboard-card pp-verdict-card pp-verdict-${meta.theme} mb-4${clickable}">
            <div class="card-body">
                <div class="pp-verdict-head">
                    <div class="pp-verdict-job">
                        <span class="pp-verdict-jobno">${escapeHtml(jobOrderLike.job_no)}</span>
                        <span class="pp-verdict-title">${escapeHtml(jobOrderLike.title || '')}</span>
                        ${statusChip}
                        ${jobOrderLike.customer_name ? `<span class="pp-verdict-customer">${escapeHtml(jobOrderLike.customer_name)}</span>` : ''}
                    </div>
                    ${verdictHeadline(forecast)}
                </div>
                <div class="pp-verdict-figures">
                    <div class="pp-fig">
                        <label>Hedef Bitiş</label>
                        <span class="pp-fig-value">${formatDateCell(forecast.target_completion_date)}</span>
                    </div>
                    <div class="pp-fig-arrow"><i class="fas fa-arrow-right-long"></i></div>
                    <div class="pp-fig">
                        <label>Öngörülen Bitiş</label>
                        <span class="pp-fig-value ${projectedClass}">${formatDateCell(forecast.projected_completion_date)}</span>
                    </div>
                    <div class="pp-fig">
                        <label>Sapma</label>
                        ${varianceFigure}
                    </div>
                    <div class="pp-fig">
                        <label>İlerleme</label>
                        <span class="pp-fig-value">%${pct}</span>
                        <div class="pp-fig-progressbar">
                            <div class="pp-fig-progressfill pp-pf-${meta.theme}" style="width: ${Math.min(pct, 100)}%"></div>
                        </div>
                    </div>
                </div>
                ${verdictTimelineHtml(forecast, summary, todayIso)}
                ${verdictMetaHtml(summary, forecast)}
            </div>
        </div>`;
}

function renderVerdicts() {
    const container = document.getElementById('plan-verdict-container');
    if (!container) return;

    container.innerHTML = loadedPlans.map((p) => verdictCardHtml(
        p.job_order,
        {
            // Counts follow the visible rule; windows come from the server
            // summary over ALL tasks (same as the portfolio cards).
            ...summarizeTasks(visibleOf(p.tasks), (p.nodes || []).length),
            planned_window: p.summary.planned_window,
            actual_window: p.summary.actual_window,
            projected_completion: p.summary.projected_completion
        },
        p.today
    )).join('');
}

// ---------------------------------------------------------------------------
// Portfolio mode (weekly review): verdict cards for all root job orders
// ---------------------------------------------------------------------------

async function fetchOverview(status) {
    const container = document.getElementById('plan-verdict-container');
    if (container && !overviewData) {
        container.innerHTML = `
            <div class="dashboard-card">
                <div class="card-body text-center py-5">
                    <div class="spinner-border text-primary" role="status"></div>
                    <p class="text-muted mt-3 mb-0">Proje portföyü yükleniyor...</p>
                </div>
            </div>`;
    }
    try {
        overviewData = await getProductionPlanOverview(status);
        overviewStatus = status;
    } catch (error) {
        console.error('Overview load failed:', error);
        overviewData = null;
        showNotification('Proje portföyü yüklenemedi', 'error');
    }
}

async function enterPortfolio() {
    setModeChrome('portfolio');
    if (!overviewData) {
        await fetchOverview(overviewStatus);
    }
    renderPortfolio();
}

// Current portfolio items in display order (shared by cards and slides).
function sortedPortfolioItems() {
    if (!overviewData) return [];
    const items = [...overviewData.items];
    if (portfolioSort === 'risk') {
        const severity = (item) => {
            const v = item.forecast ? item.forecast.variance_wd : null;
            return v === null || v === undefined ? -Infinity : v;
        };
        items.sort((a, b) => severity(b) - severity(a));
    } else {
        items.sort((a, b) => (a.job_no || '').localeCompare(b.job_no || '', undefined, { numeric: true }));
    }
    return items;
}

function renderPortfolio() {
    const container = document.getElementById('plan-verdict-container');
    if (!container) return;
    if (!overviewData) {
        container.innerHTML = `
            <div class="dashboard-card">
                <div class="card-body text-center text-danger py-5">
                    <i class="fas fa-exclamation-triangle fa-2x mb-3"></i>
                    <p class="mb-0">Proje portföyü yüklenemedi.</p>
                </div>
            </div>`;
        return;
    }

    const items = sortedPortfolioItems();

    const statusOption = PORTFOLIO_STATUS_OPTIONS.find(o => o.value === overviewStatus);
    renderHeader(`${items.length} proje · ${statusOption ? statusOption.text : overviewStatus} · Haftalık gözden geçirme`);

    container.innerHTML = items.length
        ? items.map(item => verdictCardHtml(item, item.summary || {}, overviewData.today, { clickable: true })).join('')
        : `
            <div class="dashboard-card">
                <div class="card-body text-center text-muted py-5">
                    <i class="fas fa-folder-open fa-2x mb-3"></i>
                    <p class="mb-0">Bu durumda proje bulunamadı.</p>
                </div>
            </div>`;
}

async function enterDetail(jobNos) {
    setModeChrome('detail');
    await loadPlans(jobNos);
}

function setupPortfolioControls() {
    const statusMount = document.getElementById('pp-portfolio-status');
    const sortMount = document.getElementById('pp-portfolio-sort');
    if (!statusMount || !sortMount) return;

    statusMount.style.width = '150px';
    sortMount.style.width = '150px';
    portfolioStatusDropdown = new ModernDropdown(statusMount, { placeholder: 'Durum', width: '150px' });
    portfolioStatusDropdown.setItems(PORTFOLIO_STATUS_OPTIONS);
    portfolioStatusDropdown.setValue('active');
    statusMount.addEventListener('dropdown:select', async (e) => {
        await fetchOverview(e.detail.value || 'active');
        renderPortfolio();
    });

    portfolioSortDropdown = new ModernDropdown(sortMount, { placeholder: 'Sırala', width: '150px' });
    portfolioSortDropdown.setItems([
        { value: 'job_no', text: 'İş No' },
        { value: 'risk', text: 'En Riskli' }
    ]);
    portfolioSortDropdown.setValue('job_no');
    sortMount.addEventListener('dropdown:select', (e) => {
        portfolioSort = e.detail.value || 'job_no';
        renderPortfolio();
    });

    // Card click -> drill into the detail view for that job order
    const verdictContainer = document.getElementById('plan-verdict-container');
    if (verdictContainer) {
        verdictContainer.addEventListener('click', (e) => {
            if (currentMode !== 'portfolio') return;
            const card = e.target.closest('.pp-verdict-card[data-job-no]');
            if (!card) return;
            const jobNo = card.dataset.jobNo;
            window.history.pushState(null, '', `${window.location.pathname}?job_no=${encodeURIComponent(jobNo)}`);
            handleRoute();
        });
    }

    const meetingButton = document.getElementById('pp-enter-meeting');
    if (meetingButton) {
        meetingButton.addEventListener('click', () => {
            window.history.pushState(null, '', `${window.location.pathname}?meeting=1`);
            handleRoute();
        });
    }
}

// ---------------------------------------------------------------------------
// Meeting view (Sunum Modu): one job order per full-page slide
// ---------------------------------------------------------------------------

async function enterMeeting(jobNo) {
    setModeChrome('meeting');
    // Bind BEFORE any early return — the empty state must still offer Esc/Çık
    // (fullscreen with no controls would be an exit trap).
    bindMeetingControls();
    if (!overviewData) {
        await fetchOverview(overviewStatus);
    }
    meetingItems = sortedPortfolioItems();
    const container = document.getElementById('pp-meeting-container');
    if (!meetingItems.length) {
        if (container) {
            container.innerHTML = `
                <div class="pp-slide-empty">
                    <i class="fas fa-folder-open fa-2x mb-3"></i>
                    <p>Sunulacak proje bulunamadı.</p>
                    <button type="button" class="btn btn-outline-secondary" data-action="exit">
                        <i class="fas fa-xmark me-1"></i>Çık
                    </button>
                </div>`;
        }
        return;
    }
    const index = jobNo ? meetingItems.findIndex(i => i.job_no === jobNo) : 0;
    meetingIndex = index >= 0 ? index : 0;
    renderMeetingSlide();
}

function bindMeetingControls() {
    if (meetingBound) return;
    meetingBound = true;

    // The strip is re-rendered with every slide, so its controls are
    // delegated from the static container via data-action attributes.
    const container = document.getElementById('pp-meeting-container');
    if (container) {
        container.addEventListener('click', (e) => {
            const control = e.target.closest('[data-action]');
            if (!control) return;
            const action = control.dataset.action;
            if (action === 'prev') meetingStep(-1);
            else if (action === 'next') meetingStep(1);
            else if (action === 'exit') exitMeeting();
            else if (action === 'detail') {
                const item = meetingItems[meetingIndex];
                if (!item) return;
                window.history.pushState(null, '', `${window.location.pathname}?job_no=${encodeURIComponent(item.job_no)}`);
                handleRoute();
            }
        });
    }

    // Bound once, guarded by mode — inert outside the meeting.
    document.addEventListener('keydown', (e) => {
        if (currentMode !== 'meeting') return;
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
        if (e.key === 'ArrowLeft') { e.preventDefault(); meetingStep(-1); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); meetingStep(1); }
        else if (e.key === 'Escape') { e.preventDefault(); exitMeeting(); }
    });

    // The page cannot scroll in fullscreen, so a decisive wheel gesture turns
    // the slide. The deltaY threshold keeps trackpad inertia tails from
    // double-stepping (tail deltas decay below it); line-mode mice normalize
    // roughly to pixels first.
    window.addEventListener('wheel', (e) => {
        if (currentMode !== 'meeting') return;
        const delta = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
        if (Math.abs(delta) < 30) return;
        const now = Date.now();
        if (now - meetingWheelAt < 600) return;
        meetingWheelAt = now;
        meetingStep(delta > 0 ? 1 : -1);
    }, { passive: true });
}

function exitMeeting() {
    window.history.pushState(null, '', window.location.pathname);
    handleRoute();
}

function meetingStep(delta) {
    const target = meetingIndex + delta;
    if (target < 0 || target >= meetingItems.length) return;
    meetingIndex = target;
    renderMeetingSlide();
}

function renderMeetingSlide() {
    const item = meetingItems[meetingIndex];
    const container = document.getElementById('pp-meeting-container');
    if (!item || !container) return;

    // Slide changes replace the history entry: browser Back exits the meeting.
    window.history.replaceState(
        null, '', `${window.location.pathname}?meeting=1&job_no=${encodeURIComponent(item.job_no)}`);

    const brief = meetingBriefCache.get(item.job_no);
    container.innerHTML =
        meetingStripHtml(item) +
        meetingHeroHtml(item, brief && brief.financial) +
        `<div id="pp-meeting-panels" class="pp-meeting-grid">${brief ? '' : meetingSkeletonHtml()}</div>`;

    if (brief) {
        renderMeetingPanels(item, brief);
    } else {
        ensureBrief(item.job_no).then(() => {
            const current = meetingItems[meetingIndex];
            const loaded = current && meetingBriefCache.get(current.job_no);
            if (currentMode === 'meeting' && loaded && current.job_no === item.job_no) {
                renderMeetingPanels(current, loaded);
            }
        });
    }
    // Warm the neighbours so prev/next feels instant on the projector.
    [meetingIndex - 1, meetingIndex + 1].forEach((i) => {
        if (meetingItems[i]) ensureBrief(meetingItems[i].job_no);
    });
}

function meetingStripHtml(item) {
    const atStart = meetingIndex === 0;
    const atEnd = meetingIndex === meetingItems.length - 1;
    return `
        <div class="pp-strip">
            <div class="pp-strip-nav">
                <button type="button" class="btn btn-sm pp-strip-btn" data-action="prev"
                        ${atStart ? 'disabled' : ''} aria-label="Önceki proje">
                    <i class="fas fa-chevron-left"></i>
                </button>
                <span class="pp-strip-count">${meetingIndex + 1} / ${meetingItems.length}</span>
                <button type="button" class="btn btn-sm pp-strip-btn" data-action="next"
                        ${atEnd ? 'disabled' : ''} aria-label="Sonraki proje">
                    <i class="fas fa-chevron-right"></i>
                </button>
            </div>
            <div class="pp-strip-title">Haftalık Gözden Geçirme</div>
            <div class="pp-strip-actions">
                <span class="pp-strip-hint d-none d-lg-inline">← → gezin · Esc çık</span>
                <button type="button" class="btn btn-sm pp-strip-btn" data-action="detail">
                    <i class="fas fa-table-list me-1"></i>Planı Aç
                </button>
                <button type="button" class="btn btn-sm pp-strip-btn" data-action="exit">
                    <i class="fas fa-xmark me-1"></i>Çık
                </button>
            </div>
        </div>`;
}

const FINANCIAL_META = {
    healthy: { theme: 'green', label: 'Finans · Sağlıklı' },
    risky: { theme: 'orange', label: 'Finans · Riskli' },
    critical: { theme: 'red', label: 'Finans · Kritik' },
    no_price: { theme: 'grey', label: 'Finans · Fiyat Yok' },
    no_data: { theme: 'grey', label: 'Finans · Veri Yok' },
};

function financialChipHtml(financial) {
    if (!financial) return '';
    const meta = FINANCIAL_META[financial.verdict] || FINANCIAL_META.no_data;
    const reason = (financial.reason || '') +
        (financial.price_is_derived ? ' (satış fiyatı türetilmiş)' : '');
    return `<span class="pp-verdict-headline pp-fin-pill pp-vh-${meta.theme}" title="${escapeHtml(reason)}">
        <i class="fas fa-coins"></i>${meta.label}</span>`;
}

// Compact hero for the slide — reuses the verdict pill + timeline helpers but
// never touches verdictCardHtml (portfolio/detail keep their card as-is).
function meetingHeroHtml(item, financial) {
    const forecast = item.forecast || { verdict: 'unknown', unplanned_open_tasks: 0 };
    const meta = VERDICT_META[forecast.verdict] || VERDICT_META.unknown;
    const summary = item.summary || {};
    const variance = forecast.variance_wd;
    const varianceFigure = variance === null || variance === undefined
        ? '<span class="pp-fig-value">—</span>'
        : (variance > 0
            ? `<span class="pp-fig-value pp-fig-late">+${formatWd(variance)} iş günü</span>`
            : (variance < 0
                ? `<span class="pp-fig-value pp-fig-early">${formatWd(variance)} iş günü erken</span>`
                : '<span class="pp-fig-value">Tam zamanında</span>'));
    const projectedClass = variance !== null && variance !== undefined && variance > 0
        ? 'pp-fig-late' : '';
    const pct = Math.round(item.completion_percentage || 0);
    const statusChip = item.status && item.status !== 'active'
        ? `<span class="status-badge status-grey">${escapeHtml(item.status_display || item.status)}</span>`
        : '';

    return `
        <div class="dashboard-card pp-hero pp-verdict-card pp-verdict-${meta.theme}">
            <div class="card-body">
                <div class="pp-hero-top">
                    <div class="pp-hero-id">
                        <span class="pp-verdict-jobno">${escapeHtml(item.job_no)}</span>
                        <span class="pp-hero-title">${escapeHtml(item.title || '')}</span>
                        ${item.customer_name ? `<span class="pp-hero-customer">${escapeHtml(item.customer_name)}</span>` : ''}
                        ${statusChip}
                    </div>
                    <div class="pp-hero-pills">
                        ${verdictHeadline(forecast)}
                        <span id="pp-fin-chip">${financialChipHtml(financial)}</span>
                    </div>
                </div>
                <div class="pp-verdict-figures pp-hero-figures">
                    <div class="pp-fig">
                        <label>Hedef Bitiş</label>
                        <span class="pp-fig-value">${formatDateCell(forecast.target_completion_date)}</span>
                    </div>
                    <div class="pp-fig-arrow"><i class="fas fa-arrow-right-long"></i></div>
                    <div class="pp-fig">
                        <label>Öngörülen Bitiş</label>
                        <span class="pp-fig-value ${projectedClass}">${formatDateCell(forecast.projected_completion_date)}</span>
                    </div>
                    <div class="pp-fig">
                        <label>Sapma</label>
                        ${varianceFigure}
                    </div>
                    <div class="pp-fig">
                        <label>İlerleme</label>
                        <span class="pp-fig-value">%${pct}</span>
                        <div class="pp-fig-progressbar">
                            <div class="pp-fig-progressfill pp-pf-${meta.theme}" style="width: ${Math.min(pct, 100)}%"></div>
                        </div>
                    </div>
                </div>
                ${verdictTimelineHtml(forecast, summary, overviewData ? overviewData.today : null)}
            </div>
        </div>`;
}

// Content caps shrink one step on short screens (laptop 768p) so every panel
// stays inside its clipped cell.
function meetingCaps() {
    const short = window.matchMedia('(max-height: 860px)').matches;
    return { resources: short ? 3 : 4, files: short ? 3 : 4, ncrs: short ? 2 : 3 };
}

async function ensureBrief(jobNo) {
    if (meetingBriefCache.has(jobNo) || meetingBriefLoading.has(jobNo)) return;
    meetingBriefLoading.add(jobNo);
    try {
        meetingBriefCache.set(jobNo, await getJobOrderMeetingBrief(jobNo));
    } catch (error) {
        console.error(`Meeting brief failed for ${jobNo}:`, error);
        const item = meetingItems[meetingIndex];
        if (currentMode === 'meeting' && item && item.job_no === jobNo) {
            const panels = document.getElementById('pp-meeting-panels');
            if (panels) {
                panels.innerHTML = `
                    <div class="dashboard-card pp-panel pp-panel-wide">
                        <div class="card-body text-center text-danger py-4">
                            <i class="fas fa-exclamation-triangle me-2"></i>Toplantı özeti yüklenemedi.
                        </div>
                    </div>`;
            }
        }
    } finally {
        meetingBriefLoading.delete(jobNo);
    }
}

function meetingSkeletonHtml() {
    return ['pp-span-5', 'pp-span-4', 'pp-span-3', 'pp-span-3', 'pp-span-3', 'pp-span-3', 'pp-span-3']
        .map(span => `
        <div class="dashboard-card pp-panel ${span}">
            <div class="card-body">
                <div class="pp-skeleton pp-skeleton-title"></div>
                <div class="pp-skeleton pp-skeleton-big"></div>
                <div class="pp-skeleton"></div>
                <div class="pp-skeleton pp-skeleton-short"></div>
            </div>
        </div>`).join('');
}

function panelHtml(icon, title, bodyHtml, extraClass = '') {
    return `
        <div class="dashboard-card pp-panel${extraClass ? ' ' + extraClass : ''}">
            <div class="card-body">
                <div class="pp-panel-title"><i class="fas fa-${icon} me-2"></i>${title}</div>
                ${bodyHtml}
            </div>
        </div>`;
}

function fmtInt(value) {
    return Math.round(value ?? 0).toLocaleString('tr-TR');
}

function fmtHours(value) {
    return (value ?? 0).toLocaleString('tr-TR', { maximumFractionDigits: 1 });
}

function fmtShortDate(value) {
    return value ? formatDateCell(String(value)) : '—';
}

function miniBarHtml(ratio, theme = 'blue') {
    const pct = Math.max(0, Math.min(100, Math.round((ratio || 0) * 100)));
    return `
        <div class="pp-mini-bar"><div class="pp-mini-fill pp-mini-${theme}" style="width: ${pct}%"></div></div>`;
}

function renderMeetingPanels(item, brief) {
    const finChip = document.getElementById('pp-fin-chip');
    if (finChip && brief.financial) finChip.innerHTML = financialChipHtml(brief.financial);
    const panels = document.getElementById('pp-meeting-panels');
    if (!panels) return;
    // Grid placement: row A = welding(5) machining(4) cutting(3),
    // row B = quality(3) procurement(3) revisions(3) files(3).
    panels.innerHTML = [
        weldingPanelHtml(brief.welding),
        machiningPanelHtml(brief.machining),
        cuttingPanelHtml(brief.cutting),
        qualityPanelHtml(brief.quality),
        procurementPanelHtml(brief.procurement),
        revisionsPanelHtml(brief.revisions),
        filesPanelHtml(brief.files),
    ].join('');
}

const NCR_SEVERITY_BADGES = { critical: 'status-red', major: 'status-orange', minor: 'status-grey' };

function qualityPanelHtml(quality) {
    if (!quality) return '';
    const caps = meetingCaps();
    const open = quality.open || 0;
    const sev = quality.open_by_severity || {};
    if (!open) {
        const body = `
            <div class="pp-panel-hero">
                <span class="pp-panel-big pp-num-green"><i class="fas fa-circle-check"></i></span>
                <span class="pp-panel-big-label">Açık NCR yok</span>
                <span class="pp-panel-sub text-muted">toplam ${fmtInt(quality.total)}</span>
            </div>`;
        return panelHtml('clipboard-check', 'Kalite · NCR', body, 'pp-span-3');
    }
    const shown = (quality.open_list || []).slice(0, caps.ncrs);
    const list = shown.map(n => `
        <div class="pp-line">
            <span class="pp-line-main"><strong>${escapeHtml(n.ncr_number)}</strong> ${escapeHtml(n.title)}</span>
            <span class="status-badge ${NCR_SEVERITY_BADGES[n.severity] || 'status-grey'}">${escapeHtml(n.severity_display)}</span>
        </div>`).join('');
    const body = `
        <div class="pp-panel-hero">
            <span class="pp-panel-big pp-num-red">${fmtInt(open)}</span>
            <span class="pp-panel-big-label">açık NCR</span>
            <span class="pp-panel-dots">
                ${sev.critical ? `<span class="pp-dot pp-dot-red">Kritik ${fmtInt(sev.critical)}</span>` : ''}
                ${sev.major ? `<span class="pp-dot pp-dot-orange">Majör ${fmtInt(sev.major)}</span>` : ''}
                ${sev.minor ? `<span class="pp-dot pp-dot-grey">Minör ${fmtInt(sev.minor)}</span>` : ''}
                ${open > shown.length ? `<span class="text-muted">+${fmtInt(open - shown.length)}</span>` : ''}
            </span>
        </div>
        ${list}`;
    // The ONLY panel with a colored top strip — quality problems must pop.
    return panelHtml('clipboard-check', 'Kalite · NCR', body, 'pp-span-3 pp-panel-alert');
}

function revisionsPanelHtml(revisions) {
    if (!revisions) return '';
    const drawing = revisions.drawing || {};
    const target = revisions.target_date || {};
    const latest = drawing.latest;
    const latestTarget = (target.latest_list || [])[0];
    // Date-led: WHEN it was last revised is the meeting signal, the code is
    // supporting detail.
    const body = `
        <div class="pp-rev-cols">
            <div>
                <div class="pp-rev-heading">Teknik Resim</div>
                <div class="pp-panel-hero">
                    <span class="pp-panel-big">${latest ? fmtShortDate(latest.released_at) : '—'}</span>
                </div>
                ${latest
                    ? `<div class="pp-panel-sub">Rev ${escapeHtml(latest.revision_code || `R${latest.revision_number}`)} · ${escapeHtml(latest.job_no)}</div>`
                    : '<div class="pp-panel-sub text-muted">Yayın yok</div>'}
                <div class="pp-panel-sub ${drawing.revision_count ? 'pp-num-orange' : 'text-muted'}">${fmtInt(drawing.revision_count)} kez revize edildi</div>
                ${drawing.in_revision_count ? `<div class="pp-panel-sub pp-text-orange">${fmtInt(drawing.in_revision_count)} yayın revizyonda</div>` : ''}
            </div>
            <div>
                <div class="pp-rev-heading">Hedef Tarih</div>
                <div class="pp-panel-hero">
                    <span class="pp-panel-big">${latestTarget ? fmtShortDate(latestTarget.changed_at) : '—'}</span>
                </div>
                ${latestTarget ? `
                    <div class="pp-panel-sub">${fmtShortDate(latestTarget.previous_date)} → ${fmtShortDate(latestTarget.new_date)}</div>
                    ${latestTarget.reason ? `<div class="pp-panel-sub text-muted">“${escapeHtml(latestTarget.reason)}”</div>` : ''}`
                : '<div class="pp-panel-sub text-muted">Değişiklik yok</div>'}
                <div class="pp-panel-sub ${target.count ? 'pp-num-orange' : 'text-muted'}">${fmtInt(target.count)} kez değişti</div>
            </div>
        </div>`;
    return panelHtml('code-branch', 'Revizyonlar', body, 'pp-span-3');
}

function procurementPanelHtml(procurement) {
    if (!procurement) return '';
    const waiting = procurement.items_waiting || 0;
    const body = `
        <div class="pp-panel-hero">
            <span class="pp-panel-big ${waiting ? 'pp-num-orange' : 'pp-num-green'}">${fmtInt(waiting)}</span>
            <span class="pp-panel-big-label">bekleyen kalem</span>
            <span class="pp-panel-sub text-muted">toplam ${fmtInt(procurement.items_total)}</span>
        </div>
        <div class="pp-panel-sub">Talebe dönüşmedi: <strong>${fmtInt(procurement.not_yet_requested)}</strong></div>
        <div class="pp-panel-sub">Talepte · teslim bekliyor: <strong>${fmtInt(procurement.requested_waiting)}</strong></div>
        <div class="pp-panel-sub pp-num-green">Teslim edildi: <strong>${fmtInt(procurement.items_delivered)}</strong></div>
        ${miniBarHtml(procurement.items_total ? procurement.items_delivered / procurement.items_total : 0, 'green')}`;
    return panelHtml('cart-shopping', 'Satın Alma', body, 'pp-span-3');
}

function cuttingPanelHtml(cutting) {
    if (!cutting) return '';
    const waiting = cutting.parts_waiting || 0;
    const body = `
        <div class="pp-panel-hero">
            <span class="pp-panel-big ${waiting ? 'pp-num-orange' : 'pp-num-green'}">${fmtInt(waiting)}</span>
            <span class="pp-panel-big-label">parça kesim bekliyor</span>
            <span class="pp-panel-sub text-muted">${fmtInt(cutting.weight_waiting)} kg</span>
        </div>
        <div class="pp-panel-sub">Kesilen: <strong>${fmtInt(cutting.parts_cut)}</strong> / ${fmtInt(cutting.parts_total)} parça · ${fmtInt(cutting.weight_cut)} / ${fmtInt(cutting.weight_total)} kg</div>
        ${miniBarHtml(cutting.weight_total ? cutting.weight_cut / cutting.weight_total : 0, 'blue')}`;
    return panelHtml('scissors', 'CNC Kesim', body, 'pp-span-3');
}

function machiningPanelHtml(machining) {
    if (!machining) return '';
    const waiting = machining.operations_waiting || 0;
    const body = `
        <div class="pp-panel-hero">
            <span class="pp-panel-big ${waiting ? 'pp-num-orange' : 'pp-num-green'}">${fmtInt(waiting)}</span>
            <span class="pp-panel-big-label">operasyon bekliyor</span>
            <span class="pp-panel-sub text-muted">${fmtInt(machining.operations_completed)} / ${fmtInt(machining.operations_total)} tamamlandı</span>
        </div>
        <div class="pp-panel-sub">Tahmini <strong>${fmtHours(machining.estimated_hours_total)} s</strong> · Harcanan <strong>${fmtHours(machining.hours_spent)} s</strong> · Kalan ~<strong>${fmtHours(machining.hours_remaining)} s</strong></div>
        <div class="pp-panel-sub text-muted">${fmtInt(machining.parts_completed)} / ${fmtInt(machining.parts_total)} parça tamam</div>
        ${miniBarHtml(machining.estimated_hours_total ? machining.hours_earned / machining.estimated_hours_total : 0, 'blue')}`;
    return panelHtml('gears', 'Talaşlı İmalat', body, 'pp-span-4');
}

function weldingPanelHtml(welding) {
    if (!welding) return '';
    const caps = meetingCaps();
    const resources = welding.resources || [];
    const shown = resources.slice(0, caps.resources);
    const rows = shown.map((r) => {
        const badge = r.kind === 'subcontractor'
            ? '<span class="status-badge status-purple">Taşeron</span>'
            : '<span class="status-badge status-blue">Dahili</span>';
        const right = r.planned
            ? `<span class="text-muted">(plan${r.planned_start_date ? ` · ${fmtShortDate(r.planned_start_date)} – ${fmtShortDate(r.planned_end_date)}` : ''})</span>`
            : `${miniBarHtml((r.progress_pct || 0) / 100, 'blue')}<span class="pp-res-pct">%${fmtInt(r.progress_pct)}</span>`;
        return `
            <div class="pp-line${r.planned ? ' pp-line-muted' : ''}">
                <span class="pp-line-main" title="${escapeHtml(r.name)}">${badge} ${escapeHtml(r.name)}
                    <span class="text-muted">· ${fmtInt(r.allocated_weight_kg)} kg</span></span>
                <span class="pp-res-right">${right}</span>
            </div>`;
    }).join('');

    // Assignments carry the headline; without committed kg the welding tasks'
    // own (manual) progress speaks — work happens before allocation.
    const overall = welding.weighted_progress_pct;
    const taskPct = welding.task_progress_pct;
    const usingTaskProgress = (overall === null || overall === undefined)
        && taskPct !== null && taskPct !== undefined;
    const big = usingTaskProgress ? taskPct : overall;
    const bigLabel = usingTaskProgress ? 'görev ilerlemesi' : 'ağırlıklı ilerleme';
    const kgNote = welding.allocated_kg_total
        ? `<span class="pp-panel-sub text-muted">${fmtInt(welding.allocated_kg_total)} kg tahsis</span>` : '';
    const moreNote = resources.length > shown.length
        ? `<span class="pp-panel-sub text-muted">+${fmtInt(resources.length - shown.length)} kaynak</span>` : '';

    const hours = welding.hours || {};
    const hourParts = [];
    if (hours.regular) hourParts.push(`İşçilik <strong>${fmtHours(hours.regular)} s</strong>`);
    if (hours.after_hours) hourParts.push(`Fazla mesai <strong>${fmtHours(hours.after_hours)} s</strong>`);
    if (hours.holiday) hourParts.push(`Tatil <strong>${fmtHours(hours.holiday)} s</strong>`);
    const hoursStrip = hourParts.length
        ? `<div class="pp-hours-strip"><i class="fas fa-user-clock me-1"></i>${hourParts.join('<span class="pp-meta-sep"> · </span>')}</div>`
        : '';

    const body = `
        <div class="pp-panel-hero">
            <span class="pp-panel-big">${big === null || big === undefined ? '—' : `%${fmtInt(big)}`}</span>
            <span class="pp-panel-big-label">${bigLabel}</span>
            ${kgNote}${moreNote}
        </div>
        ${rows || (usingTaskProgress || big === null
            ? '<div class="text-muted pp-empty">Kaynak ataması yok.</div>' : '')}
        ${hoursStrip}`;
    return panelHtml('fire', 'Kaynaklı İmalat', body, 'pp-span-5');
}

const FILE_GROUP_LABELS = [
    ['job_order', 'İş Emri'],
    ['task', 'Görev'],
    ['discussion', 'Tartışma'],
];

function filesPanelHtml(files) {
    if (!files) return '';
    const caps = meetingCaps();
    const totalAll = FILE_GROUP_LABELS.reduce(
        (n, [key]) => n + ((files[key] || {}).total || 0), 0);
    const merged = FILE_GROUP_LABELS.flatMap(([key, label]) =>
        ((files[key] || {}).items || []).map(f => ({ ...f, source: label })));
    merged.sort((a, b) => String(b.uploaded_at || '').localeCompare(String(a.uploaded_at || '')));
    const shown = merged.slice(0, caps.files);

    const chips = FILE_GROUP_LABELS.map(([key, label]) =>
        `<span class="pp-chip">${label} <strong>${fmtInt((files[key] || {}).total)}</strong></span>`).join('');
    const moreChip = totalAll > shown.length
        ? `<span class="pp-chip pp-chip-muted">+${fmtInt(totalAll - shown.length)}</span>` : '';

    const lines = shown.map((f) => {
        const name = escapeHtml(f.name || 'dosya');
        const link = f.url
            ? `<a href="${escapeHtml(f.url)}" target="_blank" rel="noopener" title="${name}">${name}</a>`
            : `<span title="${name}">${name}</span>`;
        return `
            <div class="pp-file-line">
                ${link}
                <span class="pp-file-src">${escapeHtml(f.source)} · ${fmtShortDate(f.uploaded_at)}</span>
            </div>`;
    }).join('');

    const body = `
        <div class="pp-chips-row">${chips}${moreChip}</div>
        ${lines || '<div class="text-muted pp-empty">Dosya yok.</div>'}`;
    return panelHtml('folder-open', 'Dosyalar', body, 'pp-span-3');
}

// ---------------------------------------------------------------------------
// View layout: toolbar (Tablo/Gantt + filters), table host, gantt card
// ---------------------------------------------------------------------------

function initViewLayout() {
    if (!document.getElementById('production-plan-table-host')) {
        const container = document.getElementById('plan-view-container');
        container.innerHTML = `
            <div id="production-plan-table-host"></div>
            <div id="production-plan-gantt-card" class="dashboard-card" style="display: none;">
                <div class="card-body">
                    <div id="production-plan-gantt-host"></div>
                </div>
            </div>
        `;
    }

    // Toolbar controls live in the static header row (index.html). Reveal on
    // every detail entry (portfolio mode hides them), but bind only ONCE —
    // gating on the class would duplicate listeners/dropdowns after a
    // portfolio round-trip.
    const controls = document.getElementById('pp-view-controls');
    if (controls) {
        controls.classList.remove('d-none');
        controls.classList.add('d-flex');
        if (!viewControlsBound) {
            viewControlsBound = true;

            document.querySelectorAll('[data-plan-view]').forEach((button) => {
                button.addEventListener('click', () => {
                    const selected = button.dataset.planView;
                    if (!selected || selected === currentView) return;
                    currentView = selected;
                    updateViewState();
                });
            });

            setupFilterDropdowns();
        }
    }
    updateViewState();
}

function setupFilterDropdowns() {
    const departmentMount = document.getElementById('pp-filter-department');
    const classificationMount = document.getElementById('pp-filter-classification');
    const clearButton = document.getElementById('pp-filter-clear');

    departmentMount.style.width = '170px';
    classificationMount.style.width = '170px';
    departmentFilterDropdown = new ModernDropdown(departmentMount, {
        placeholder: 'Departman',
        multiple: true,
        width: '170px',
        maxHeight: 280
    });
    classificationFilterDropdown = new ModernDropdown(classificationMount, {
        placeholder: 'Plan Durumu',
        multiple: true,
        width: '170px',
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

    const visible = visibleOf(plan.tasks);
    const departments = new Map();
    for (const task of visible) {
        if (!departments.has(task.department)) {
            departments.set(task.department, task.department_display);
        }
    }
    departmentFilterDropdown.setItems(
        [...departments.entries()].map(([value, text]) => ({ value, text }))
    );
    departmentFilterDropdown.setValue(activeFilters.departments.filter(d => departments.has(d)));
    activeFilters.departments = departmentFilterDropdown.getValue() || [];

    const present = new Set(visible.map(t => t.schedule.classification));
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
// Filtering & visibility
// ---------------------------------------------------------------------------

// Parents whose progress is carried by their children are hidden — the
// children rows represent them (renamed "Parent - Child").
function visibleOf(tasks) {
    const parentIds = new Set();
    for (const t of tasks) {
        if (t.parent !== null) parentIds.add(t.parent);
    }
    return tasks.filter(t => !parentIds.has(t.id));
}

function getFilteredTasks() {
    const { departments, classifications } = activeFilters;
    return visibleOf(plan.tasks).filter(task =>
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
                projected_end_date: task.schedule.projected_end_date,
                projected_variance_wd: task.schedule.projected_variance_wd,
                pushed_by: task.schedule.pushed_by,
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

function parentLabelOf(parentTask, node) {
    if (!parentTask) return null;
    const hasCustomTitle = parentTask.title && node && parentTask.title !== node.title;
    return hasCustomTitle ? parentTask.title : parentTask.department_display;
}

function taskCellHtml(row) {
    // Visible child rows stand in for their (hidden) parent: "Parent - Child".
    if (row.parent !== null) {
        const parentLabel = parentLabelOf(taskById.get(row.parent), row._node);
        return `
            <div class="pp-main-task">
                ${parentLabel ? `<span class="pp-main-task-dept">${escapeHtml(parentLabel)}</span><span class="pp-child-sep"> - </span>` : ''}<span class="pp-child-name">${escapeHtml(row.title || '')}</span>
            </div>`;
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

function displayLabelOf(task, node) {
    if (task.parent !== null) {
        const parentLabel = parentLabelOf(taskById.get(task.parent), node);
        return parentLabel ? `${parentLabel} - ${task.title || ''}` : (task.title || '');
    }
    const hasCustomTitle = task.title && node && task.title !== node.title;
    return hasCustomTitle ? `${task.department_display} - ${task.title}` : task.department_display;
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
            field: 'projected_end_date',
            label: 'Öngörülen Bitiş',
            formatter: (value, row) => formatProjectedCell(row)
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
                // Label overlays the whole track (a tiny bar can't hold text):
                // dark text while the center is over the track, white once the
                // bar reaches past it.
                const labelClass = pct >= 50 ? 'pp-progress-label-light' : 'pp-progress-label-dark';
                return `
                    <div class="pp-progress">
                        <div class="progress">
                            <div class="progress-bar ${barClass}" style="width: ${Math.min(pct, 100)}%"></div>
                            <span class="pp-progress-label ${labelClass}">%${pct}</span>
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
        'Gerçek Başlangıç', 'Gerçek Bitiş', 'Sapma (İş Günü)',
        'Öngörülen Bitiş', 'Öngörülen Sapma (İş Günü)', 'İten Görev',
        'Plan Durumu', 'İlerleme %'
    ];
    const data = rows.map(row => [
        row.job_no,
        row._node ? row._node.title : '',
        row.department_display || '',
        displayLabelOf(row, row._node),
        row._isSubtask ? 'Evet' : 'Hayır',
        row.status_display || '',
        row.assigned_to_name || '',
        formatDateCell(row.target_start_date),
        formatDateCell(row.target_completion_date),
        formatDateCell(row.actual_start_date),
        formatDateCell(row.actual_end_date),
        row.variance_wd === null || row.variance_wd === undefined ? '' : row.variance_wd,
        row.projected_end_date ? formatDateCell(row.projected_end_date) : '',
        row.projected_variance_wd === null || row.projected_variance_wd === undefined ? '' : row.projected_variance_wd,
        row.pushed_by ? (taskLabelById.get(row.pushed_by) || row.pushed_by) : '',
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
                title: displayLabelOf(task, node),
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

function formatProjectedCell(row) {
    if (!row.projected_end_date) return '<span class="text-muted">-</span>';
    const parts = [formatDateCell(row.projected_end_date)];
    const variance = row.projected_variance_wd;
    if (variance !== null && variance !== undefined && variance > 0) {
        parts.push(`<span class="pp-variance-risk">(+${formatWd(variance)})</span>`);
    } else if (variance !== null && variance !== undefined && variance < 0) {
        parts.push(`<span class="pp-variance-early">(-${formatWd(variance)})</span>`);
    }
    if (row.pushed_by) {
        const pusher = escapeHtml(taskLabelById.get(row.pushed_by) || `#${row.pushed_by}`);
        parts.push(`<i class="fas fa-link pp-push-icon" title="Önceki görev itiyor: ${pusher}"></i>`);
    }
    return parts.join(' ');
}
