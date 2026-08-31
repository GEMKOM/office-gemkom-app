/**
 * Sunum Modu (meeting view) — one job order per full-page slide.
 *
 * Lives on Proje Takibi: the "Sunum Modu" button hands over the whole
 * viewport (body.pp-meeting-fullscreen hides the app shell and the page
 * behind it), walks the active portfolio one project at a time, and opens
 * every section drill-down as an in-slide modal so the presentation never
 * leaves the screen. Exiting simply un-hides the page underneath — no reload.
 *
 * Was `projects/production-planning/production-planning.js` until the two
 * pages were merged; the portfolio/table/gantt views around it were dropped.
 */
import { showNotification } from '../../components/notification/notification.js';
import { escapeHtml } from '../../utils/text.js';
import { exportElementToPdf } from '../../utils/pdfExport.js';
import {
    getJobOrderProductionPlan,
    getProductionPlanOverview,
    getJobOrderMeetingBrief,
    getMeetingBriefSection
} from '../../apis/projects/jobOrders.js';
import {
    markPlanningRequestItemCritical,
    unmarkPlanningRequestItemCritical
} from '../../apis/planning/planningRequestItems.js';

// Portfolio backing the slide deck. The status/sort controls belonged to the
// retired portfolio page, so the deck is the default view: active projects,
// natural job-no order.
let overviewData = null;                // last fetched overview payload
const overviewStatus = 'active';        // status the cached overview was fetched with
const portfolioSort = 'job_no';         // 'job_no' | 'risk'

// Meeting (Sunum Modu) state
let currentMode = null;                 // 'meeting' while the deck is on screen
let meetingItems = [];                  // portfolio items in slide order
let meetingIndex = 0;
let meetingBound = false;               // meeting listeners bound once
let meetingWheelAt = 0;                 // wheel debounce timestamp
let meetingFetchTimer = null;           // settle-debounce for brief fetching
let meetingPrefetchTimer = null;        // neighbours wait even longer

// The current slide fetches only after the user is still for longer than any
// continuous-navigation cadence (wheel steps alone are 600ms apart), so
// flipping through the portfolio sends nothing at all.
const MEETING_SETTLE_MS = 700;
const MEETING_PREFETCH_MS = 1300;
const meetingBriefCache = new Map();    // job_no -> meeting brief payload
const meetingBriefPromises = new Map(); // job_no -> in-flight fetch promise
const meetingPlanCache = new Map();     // job_no -> production plan (hero modal)
const meetingSectionCache = new Map();  // `${job_no}:${section}` -> detail payload
let meetingModalOpen = false;
let meetingModalContext = null;         // {jobNo, kind} of the open modal

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

// "Material wait" badge — the delay belongs to procurement, not the task.
// CNC rows carry the plate keys (cuts_waiting / plate_items_pending); welding
// and Üretim rows carry the manufacturing keys (pipe/profile + hand-marked
// critical items).
function materialWaitBadgeHtml(materialWait) {
    if (!materialWait) return '';
    const parts = [];
    if (materialWait.cuts_waiting > 0) parts.push(`${materialWait.cuts_waiting} kesim plaka bekliyor`);
    if (materialWait.plate_items_pending > 0) parts.push(`${materialWait.plate_items_pending} plaka kalemi teslim edilmedi`);
    if (materialWait.pipe_profile_items_pending > 0) parts.push(`${materialWait.pipe_profile_items_pending} boru/profil kalemi teslim edilmedi`);
    if (materialWait.critical_items_pending > 0) parts.push(`${materialWait.critical_items_pending} kritik kalem teslim edilmedi`);
    const tooltip = `Satın alma kaynaklı bekleme: ${parts.join(' · ') || 'malzeme teslim edilmedi'}`;
    return `<span class="status-badge status-orange" title="${escapeHtml(tooltip)}">Malzeme Bekliyor</span>`;
}

// ---------------------------------------------------------------------------
// Entry points — the page owns the button, this module owns the deck
// ---------------------------------------------------------------------------

// "?meeting=1" is the source of truth, exactly as it was on the retired page:
// a deep link or a browser Back both land the deck in the right state.
// Returns undefined when the URL is not a meeting URL, else the slide's job_no
// (null = first slide).
function meetingUrlJobNo() {
    const params = new URLSearchParams(window.location.search);
    if (!params.get('meeting')) return undefined;
    return params.get('job_no') || null;
}

export function isMeetingUrl() {
    return meetingUrlJobNo() !== undefined;
}

// Called once on page boot: honours a "?meeting=1" deep link and keeps the
// deck in sync with Back/Forward.
export function initMeetingView() {
    window.addEventListener('popstate', () => {
        const jobNo = meetingUrlJobNo();
        if (jobNo === undefined) {
            if (currentMode === 'meeting') setMeetingChrome(false);
        } else {
            enterMeeting(jobNo);
        }
    });
    if (isMeetingUrl()) {
        enterMeeting(meetingUrlJobNo());
    }
}

// The "Sunum Modu" button. Entering pushes a history entry so browser Back
// leaves the deck; slide changes only replace it.
export function enterMeetingView() {
    window.history.pushState(null, '', `${window.location.pathname}?meeting=1`);
    enterMeeting(null);
}

// Meeting mode is fullscreen: the body class hides the navbar, header and the
// whole page behind the slide via CSS, and freezes page scroll. Toggling it
// here covers every exit path (Esc, Çık, browser Back, direct URL) — and
// leaving simply un-hides the page that was there all along, no reload.
function setMeetingChrome(on) {
    currentMode = on ? 'meeting' : null;
    document.body.classList.toggle('pp-meeting-fullscreen', on);
    if (!on) closeMeetingModal();
    const container = ensureMeetingContainer();
    if (container) container.style.display = on ? '' : 'none';
}

// The slide host is a sibling of the page content inside .container-fluid —
// the fullscreen CSS hides every OTHER child and stretches this one to 100vh.
function ensureMeetingContainer() {
    let container = document.getElementById('pp-meeting-container');
    if (container) return container;
    const parent = document.querySelector('.modules-section > .container-fluid');
    if (!parent) return null;
    container = document.createElement('div');
    container.id = 'pp-meeting-container';
    container.style.display = 'none';
    parent.appendChild(container);
    return container;
}

async function fetchOverview() {
    try {
        overviewData = await getProductionPlanOverview(overviewStatus);
    } catch (error) {
        console.error('Overview load failed:', error);
        overviewData = null;
        showNotification('Proje portföyü yüklenemedi', 'error');
    }
}

// Current portfolio items in slide order.
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

// ---------------------------------------------------------------------------
// Meeting view (Sunum Modu): one job order per full-page slide
// ---------------------------------------------------------------------------

async function enterMeeting(jobNo) {
    setMeetingChrome(true);
    // Bind BEFORE any early return — the empty state must still offer Esc/Çık
    // (fullscreen with no controls would be an exit trap).
    bindMeetingControls();
    const container = ensureMeetingContainer();
    if (!overviewData) {
        // The overview is a multi-second fetch; the deck opens on a spinner
        // rather than leaving the presenter staring at the job-order table.
        if (container) container.innerHTML = meetingLoadingHtml();
        await fetchOverview();
        if (currentMode !== 'meeting') return;
    }
    meetingItems = sortedPortfolioItems();
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

function meetingLoadingHtml() {
    return `
        <div class="pp-slide-empty">
            <div class="spinner-border text-primary mb-3" role="status"></div>
            <p>Proje portföyü yükleniyor...</p>
            <button type="button" class="btn btn-outline-secondary" data-action="exit">
                <i class="fas fa-xmark me-1"></i>Çık
            </button>
        </div>`;
}

function bindMeetingControls() {
    if (meetingBound) return;
    meetingBound = true;

    // The strip is re-rendered with every slide, so its controls are
    // delegated from the static container via data-action attributes.
    const container = ensureMeetingContainer();
    if (container) {
        // The strip is re-rendered per slide, so the search box is handled by
        // delegation too: Enter jumps, Esc leaves the box (next Esc exits).
        container.addEventListener('keydown', (e) => {
            if (e.target.id !== 'pp-meeting-search') return;
            if (e.key === 'Enter') {
                e.preventDefault();
                jumpToJob(e.target.value);
            } else if (e.key === 'Escape') {
                e.stopPropagation();
                e.target.blur();
            }
        });
        container.addEventListener('click', (e) => {
            if (e.target.closest('a')) return;  // real links (files) stay native
            const control = e.target.closest('[data-action]');
            if (control) {
                const action = control.dataset.action;
                if (action === 'prev') meetingStep(-1);
                else if (action === 'next') meetingStep(1);
                else if (action === 'exit') exitMeeting();
                return;
            }
            // A press on a scroll list's scrollbar (thumb or track) targets
            // the container itself, past its content box — that is scrolling,
            // not a drill-down request.
            if (e.target.classList.contains('pp-scroll')
                && e.offsetX > e.target.clientWidth) return;
            // Section drill-down: an in-slide modal — the meeting never leaves
            // the screen.
            const trigger = e.target.closest('[data-modal]');
            if (trigger) openSectionModal(trigger.dataset.modal);
        });
    }

    // Bound once, guarded by mode — inert outside the meeting. An open modal
    // captures Esc (close it, not the meeting) and mutes slide navigation.
    document.addEventListener('keydown', (e) => {
        if (currentMode !== 'meeting') return;
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
        if (meetingModalOpen) {
            if (e.key === 'Escape') { e.preventDefault(); closeMeetingModal(); }
            return;
        }
        if (e.key === 'ArrowLeft') { e.preventDefault(); meetingStep(-1); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); meetingStep(1); }
        else if (e.key === 'Escape') { e.preventDefault(); exitMeeting(); }
    });

    // The page cannot scroll in fullscreen, so a decisive wheel gesture turns
    // the slide. The deltaY threshold keeps trackpad inertia tails from
    // double-stepping (tail deltas decay below it); line-mode mice normalize
    // roughly to pixels first. With a modal open the wheel belongs to the
    // modal's own scroll area.
    window.addEventListener('wheel', (e) => {
        if (currentMode !== 'meeting' || meetingModalOpen) return;
        // A panel list that actually overflows owns the wheel while the
        // pointer is over it — otherwise the deck turns instead of scrolling.
        // Checked per event (not per render) because overflow depends on the
        // slide's own row count.
        const scroller = e.target?.closest?.('.pp-scroll');
        if (scroller && scroller.scrollHeight > scroller.clientHeight) return;
        const delta = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
        if (Math.abs(delta) < 30) return;
        const now = Date.now();
        if (now - meetingWheelAt < 600) return;
        meetingWheelAt = now;
        meetingStep(delta > 0 ? 1 : -1);
    }, { passive: true });
}

// ---------------------------------------------------------------------------
// Verdict vocabulary shared by the hero and the plan modal
// ---------------------------------------------------------------------------

const VERDICT_META = {
    on_track: { theme: 'green', label: 'Zamanında Bitecek', icon: 'fa-circle-check' },
    late_risk: { theme: 'red', label: 'Gecikecek', icon: 'fa-triangle-exclamation' },
    finished_on_time: { theme: 'green', label: 'Tamamlandı · Zamanında', icon: 'fa-flag-checkered' },
    finished_late: { theme: 'red', label: 'Tamamlandı · Geç', icon: 'fa-flag-checkered' },
    no_target: { theme: 'orange', label: 'Hedef Tarih Girilmemiş', icon: 'fa-circle-question' },
    // Every open task is a dataless placeholder — claiming a date would be
    // fiction, so the hero shows the target and says "veri yok" instead.
    no_data: { theme: 'grey', label: 'Öngörü İçin Veri Yok', icon: 'fa-hourglass-start' },
    unknown: { theme: 'grey', label: 'Öngörü Yok', icon: 'fa-circle-question' }
};

// Per-phase cards for phased masters — each faz ships on its own date, so
// the single Hedef/Öngörülen/Sapma triple is replaced by one card per phase.
function phaseCardsHtml(forecast, xl) {
    const phases = forecast.phases || [];
    if (!phases.length) return '';
    const cls = xl ? 'pp-phase-card pp-phase-card-xl' : 'pp-phase-card';
    const cards = phases.map((p) => {
        const worst = p.phase_number === forecast.worst_phase;
        const quiet = p.verdict === 'not_started';
        let statusHtml;
        if (quiet) {
            statusHtml = '<span class="pp-phase-status pp-num-grey">Başlamadı</span>';
        } else if (p.variance_wd !== null && p.variance_wd > 0) {
            statusHtml = `<span class="pp-phase-status pp-num-red">+${formatWd(p.variance_wd)} iş günü</span>`;
        } else if (p.variance_wd !== null && p.variance_wd < 0) {
            statusHtml = `<span class="pp-phase-status pp-num-green">${formatWd(p.variance_wd)} g erken</span>`;
        } else {
            statusHtml = '<span class="pp-phase-status pp-num-green">Zamanında</span>';
        }
        return `
            <div class="${cls}${worst ? ' pp-phase-worst' : ''}${quiet ? ' pp-phase-quiet' : ''}">
                <div class="pp-phase-name">Faz ${p.phase_number}</div>
                <div class="pp-phase-line"><label>Hedef</label><span>${fmtShortDate(p.target_completion_date)}</span></div>
                <div class="pp-phase-line"><label>Öngörü</label><span>${quiet ? '—' : fmtShortDate(p.projected_completion_date)}</span></div>
                ${statusHtml}
            </div>`;
    }).join('');
    return `<div class="pp-phase-cards">${cards}</div>`;
}

// ---------------------------------------------------------------------------
// Meeting detail modals — every section opens in place
// ---------------------------------------------------------------------------

function ensureMeetingModalHost() {
    let host = document.getElementById('pp-meeting-modal');
    if (host) return host;
    host = document.createElement('div');
    host.id = 'pp-meeting-modal';
    host.className = 'pp-modal-backdrop';
    host.style.display = 'none';
    host.innerHTML = `
        <div class="pp-modal" role="dialog" aria-modal="true">
            <div class="pp-modal-head">
                <span class="pp-modal-title" id="pp-modal-title"></span>
                <div class="pp-modal-actions">
                    <button type="button" class="pp-modal-pdf" data-modal-pdf
                            title="Detayın tamamını PDF olarak indir">
                        <i class="fas fa-file-pdf"></i> PDF
                    </button>
                    <button type="button" class="pp-modal-close" data-modal-close aria-label="Kapat">
                        <i class="fas fa-xmark"></i>
                    </button>
                </div>
            </div>
            <div class="pp-modal-body" id="pp-modal-body"></div>
        </div>`;
    host.addEventListener('click', (e) => {
        const pdfBtn = e.target.closest('[data-modal-pdf]');
        if (pdfBtn) { downloadModalPdf(pdfBtn); return; }
        if (e.target === host || e.target.closest('[data-modal-close]')) closeMeetingModal();
    });
    host.addEventListener('change', (e) => {
        const box = e.target.closest('.pp-crit-toggle');
        if (box) onCriticalToggle(box);
    });
    document.body.appendChild(host);
    return host;
}

function openMeetingModal(title, bodyHtml, context = null) {
    const host = ensureMeetingModalHost();
    host.querySelector('.pp-modal').classList.toggle(
        'pp-modal-plan', !!context && context.kind === 'plan');
    host.querySelector('#pp-modal-title').innerHTML = title;
    host.querySelector('#pp-modal-body').innerHTML = bodyHtml;
    host.style.display = 'flex';
    meetingModalOpen = true;
    meetingModalContext = context;
}

function closeMeetingModal() {
    const host = document.getElementById('pp-meeting-modal');
    if (host) host.style.display = 'none';
    meetingModalOpen = false;
    meetingModalContext = null;
}

const MODAL_LOADING_HTML =
    '<div class="pp-modal-loading"><div class="spinner-border spinner-border-sm"></div> Yükleniyor...</div>';

// The open modal, downloaded as it looks on screen — same colours, badges and
// sentences — but unclipped: the whole scroll length, not the visible window.
// Plan Detayı is the wide one (seven columns and a paragraph per row), so it
// goes to landscape; the narrower section modals read better upright.
async function downloadModalPdf(btn) {
    const modal = document.querySelector('#pp-meeting-modal .pp-modal');
    const context = meetingModalContext;
    if (!modal || !context) return;
    if (modal.querySelector('.pp-modal-loading')) {
        showNotification('Detay henüz yükleniyor, birazdan tekrar deneyin.', 'info');
        return;
    }

    const plan = context.kind === 'plan';
    const kindLabel = plan ? 'Plan Detayı'
        : (context.kind === 'welding' ? 'Kaynak Detayı'
            : (SECTION_MODAL_TITLES[context.kind] || 'Detay'));
    const item = meetingItems[meetingIndex] || {};
    const now = new Date();
    const stamp = now.toLocaleDateString('tr-TR');
    const fileStamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const subtitle = [item.title, item.customer_name, `GEMKOM · ${stamp}`]
        .filter(Boolean).join(' · ');

    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> PDF';
    try {
        await exportElementToPdf(modal, {
            fileName: `${context.jobNo} ${kindLabel} ${fileStamp}`,
            orientation: plan ? 'landscape' : 'portrait',
            captureWidth: plan ? 1400 : 1000,
            captureClass: 'pp-pdf-capture',
            stageClass: 'pp-pdf-stage',
            footerText: context.jobNo,
            prepare: (clone) => {
                clone.querySelectorAll('[data-modal-pdf], [data-modal-close]')
                    .forEach(el => el.remove());
                // Who and when — the slide carries it on screen, the sheet
                // has to say it itself.
                const head = clone.querySelector('.pp-modal-head');
                if (head && subtitle) {
                    head.insertAdjacentHTML(
                        'afterend', `<div class="pp-pdf-meta">${escapeHtml(subtitle)}</div>`);
                }
            }
        });
        showNotification('PDF indirildi.', 'success');
    } catch (error) {
        console.error('PDF export failed:', error);
        showNotification('PDF oluşturulamadı.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = original;
    }
}

const SECTION_MODAL_TITLES = {
    machining: 'Talaşlı İmalat Detayı',
    cutting: 'CNC Kesim Detayı',
    quality: 'Kalite · NCR Detayı',
    procurement: 'Satın Alma Detayı',
    revisions: 'Dizayn Detayı',
    financial: 'Finans Detayı',
};

// Sections whose detail list is fetched only when the modal opens — the main
// brief carries aggregates, not item lists.
const SECTION_MODAL_BUILDERS = {
    machining: machiningModalHtml,
    cutting: cuttingModalHtml,
    quality: qualityModalHtml,
    procurement: procurementModalHtml,
    revisions: revisionsModalHtml,
    financial: financialModalHtml,
};

async function openSectionModal(kind) {
    const item = meetingItems[meetingIndex];
    if (!item) return;
    if (kind === 'plan') { openPlanModal(item); return; }
    const brief = meetingBriefCache.get(item.job_no);
    if (!brief) return;

    // Welding renders straight from the brief (its resources already drive
    // the panel); everything else fetches its detail on demand.
    if (kind === 'welding') {
        const built = weldingModalHtml(brief);
        openMeetingModal(
            `${built.title} <span class="pp-modal-job">· ${escapeHtml(item.job_no)}</span>`,
            built.body, { jobNo: item.job_no, kind });
        return;
    }

    const build = SECTION_MODAL_BUILDERS[kind];
    if (!build) return;
    openMeetingModal(
        `${SECTION_MODAL_TITLES[kind]} <span class="pp-modal-job">· ${escapeHtml(item.job_no)}</span>`,
        MODAL_LOADING_HTML, { jobNo: item.job_no, kind });

    const cacheKey = `${item.job_no}:${kind}`;
    let detail = meetingSectionCache.get(cacheKey);
    if (!detail) {
        try {
            detail = await getMeetingBriefSection(item.job_no, kind);
            meetingSectionCache.set(cacheKey, detail);
        } catch (error) {
            console.error(`Section ${kind} failed for ${item.job_no}:`, error);
            if (meetingModalOpen && meetingModalContext
                && meetingModalContext.jobNo === item.job_no && meetingModalContext.kind === kind) {
                document.getElementById('pp-modal-body').innerHTML =
                    '<div class="text-danger pp-empty">Detay yüklenemedi.</div>';
            }
            return;
        }
    }
    // Only render if this modal is still the one the user is looking at.
    if (meetingModalOpen && meetingModalContext
        && meetingModalContext.jobNo === item.job_no && meetingModalContext.kind === kind) {
        document.getElementById('pp-modal-body').innerHTML = build(brief, detail).body;
    }
}

// Headers are strings, or {label, num: true} for right-aligned numeric
// columns — the header must sit directly above its (right-aligned) data.
function modalTableHtml(headers, rows) {
    if (!rows.length) return '<div class="text-muted pp-empty">Kayıt yok.</div>';
    const ths = headers.map(h => typeof h === 'object'
        ? `<th${h.num ? ' class="pp-th-num"' : ''}>${h.label}</th>`
        : `<th>${h}</th>`).join('');
    return `
        <table class="pp-modal-table">
            <thead><tr>${ths}</tr></thead>
            <tbody>${rows.join('')}</tbody>
        </table>`;
}

// 2a — the "why": per-task plan with variances and pushers, fetched on demand.
async function openPlanModal(item) {
    openMeetingModal(
        `Plan Detayı <span class="pp-modal-job">· ${escapeHtml(item.job_no)}</span>`,
        MODAL_LOADING_HTML, { jobNo: item.job_no, kind: 'plan' });
    const stillCurrent = () => meetingModalOpen && meetingModalContext
        && meetingModalContext.jobNo === item.job_no && meetingModalContext.kind === 'plan';
    let planData = meetingPlanCache.get(item.job_no);
    if (!planData) {
        try {
            planData = await getJobOrderProductionPlan(item.job_no);
            meetingPlanCache.set(item.job_no, planData);
        } catch (error) {
            console.error(`Plan fetch failed for ${item.job_no}:`, error);
            if (stillCurrent()) {
                document.getElementById('pp-modal-body').innerHTML =
                    '<div class="text-danger pp-empty">Plan yüklenemedi.</div>';
            }
            return;
        }
    }
    if (!stillCurrent()) return;

    const byId = new Map(planData.tasks.map(t => [t.id, t]));
    const nodeByJob = new Map((planData.nodes || []).map(n => [n.job_no, n]));
    const label = (task) => {
        const node = nodeByJob.get(task.job_no);
        if (task.parent !== null) {
            const parent = byId.get(task.parent);
            const parentLabel = parent
                ? (parent.title && node && parent.title !== node.title
                    ? parent.title : parent.department_display)
                : null;
            return parentLabel ? `${parentLabel} - ${task.title || ''}` : (task.title || '');
        }
        // A main titled after its own department ("Dizayn" under Dizayn)
        // must not render as "Dizayn - Dizayn".
        const hasCustomTitle = task.title && node && task.title !== node.title
            && task.title !== task.department_display;
        return hasCustomTitle ? `${task.department_display} - ${task.title}` : task.department_display;
    };

    // Indented rows carry their parent visually, so the row label drops the
    // "Üretim - " prefix `label()` builds for the driver box and the counts.
    const rowLabel = (task) => {
        if (task.parent !== null) return task.title || '';
        const node = nodeByJob.get(task.job_no);
        const hasCustomTitle = task.title && node && task.title !== node.title
            && task.title !== task.department_display;
        return hasCustomTitle ? `${task.department_display} - ${task.title}` : task.department_display;
    };

    // A parent's entered duration is split down to its children by weight, so
    // the two figures describe the same work. When they disagree the backend
    // flags the highest task where it shows, and we say which entries collide
    // — the planner, not the reader, is the one who can fix it.
    const conflictSentence = (t) => {
        const c = t.schedule.duration_conflict;
        if (!c) return '';
        const source = byId.get(c.source_task_id);
        const sourceName = source ? label(source) : (c.source_title || 'üst görev');
        const where = c.actual_source === 'own'
            ? `bu göreve ${formatWd(c.actual_wd)} iş günü girili`
            : `alt görevlerinde toplam ${formatWd(c.actual_wd)} iş günü girili`;
        return `Süre tutarsızlığı: "${sourceName}" görevinde ${formatWd(c.source_wd)} iş günü girili`
            + ` ve bu görevin ağırlık payı %${formatWd(c.share_pct)}, yani ~${formatWd(c.implied_wd)} iş günü`
            + ` beklenir — ama ${where}.`;
    };

    // Plain-language answer to "why this date?" — one short sentence per task,
    // so the column reads without a legend.
    const coreBasisSentence = (t) => {
        const s = t.schedule;
        if (t.status === 'completed') {
            const v = s.end_variance_wd;
            if (v !== null && v !== undefined && v > 0) {
                return `Bitti — hedefinden ${formatWd(v)} iş günü geç tamamlandı.`;
            }
            return 'Bitti.';
        }
        const rem = s.projection_remaining_wd;
        if (s.projection_kind === 'done') {
            return '%100 görünüyor — kapanışı bekleniyor.';
        }
        if (s.projection_kind === 'rate') {
            const b = s.projection_basis || {};
            let compare = '';
            if (b.term === 'rate_vs_entered') {
                const slower = rem > b.entered_remaining_wd;
                compare = ` Girilen süre ${formatWd(b.entered_total_wd)} g (kalan ~${formatWd(b.entered_remaining_wd)} g) — tempo ${slower ? 'daha yavaş' : 'daha hızlı'}.`;
            }
            // Hand-entered %: the tempo window closes at the last progress
            // entry — the idle tail after it measures typing, not pace.
            const lastEntry = b.last_entry
                ? ` (son ilerleme girişi ${fmtShortDate(b.last_entry)})` : '';
            return `${formatWd(s.projection_elapsed_wd)} iş gününde %${Math.round(t.completion_percentage)} ilerledi${lastEntry}; bu hızla ~${formatWd(rem)} iş günü daha sürer.${compare}`;
        }
        // All progress arrived in ONE entry: a milestone, not a pace — no
        // tempo to extrapolate, so the duration chain projects the remaining
        // share as a calendar budget (293-03: "1 of 2 painted" entered as
        // 50% must not read as half the paint time).
        if ((s.projection_basis || {}).term === 'single_entry') {
            const b = s.projection_basis;
            return `%${Math.round(t.completion_percentage)} tek girişte kaydedildi (${fmtShortDate(b.last_entry)}) — tempo ölçülemiyor; ${formatWd(b.total_wd)} iş günlük süre başlangıçtan itibaren bütçe olarak sayılıyor (~${formatWd(rem)} iş günü kaldı).`;
        }
        // Slow progress never stretches an entered duration — it is a
        // calendar budget from the task's real start; overruns surface as
        // sapma, not as a quietly longer estimate.
        if (['duration', 'parent_duration', 'parent_window'].includes(s.projection_kind)
                && (s.projection_basis || {}).term === 'duration_budget') {
            const b = s.projection_basis;
            return `Girilen süre başlangıçtan itibaren bütçe olarak sayılıyor: ${formatWd(b.total_wd)} iş günü (${fmtShortDate(b.anchor)}'dan). Yavaş ilerleme bütçeyi uzatmaz — aşım, sapma olarak görünür.`;
        }
        if (s.projection_kind === 'duration') {
            return `Girilen süre esas alındı: ~${formatWd(rem)} iş günü.`;
        }
        if (s.projection_kind === 'parent_duration') {
            return `Ana göreve girilen süreden ağırlık payıyla: ~${formatWd(rem)} iş günü.`;
        }
        if (s.projection_kind === 'parent_window') {
            return `Ana görevin plan penceresinden ağırlık payıyla: ~${formatWd(rem)} iş günü.`;
        }
        if (s.projection_kind === 'gate') {
            const g = (s.projection_gates || []).find(x => x.binding);
            const durationNote = {
                weight: ' Süre girilmediği için ağırlık payına göre tahmin edildi.',
                start: '',
                duration: ' (girilen süre)',
                parent_duration: ' Süre, ana göreve girilen süreden ağırlık payıyla türetildi.',
                parent_window: ' Süre, ana görevin plan penceresinden ağırlık payıyla türetildi.',
            }[s.projection_duration_kind] || '';
            if (g && g.kind === 'dependency' && g.via_label) {
                // The full chain: what holds the PARENT holds this row too.
                return `Ana görevi tutan koşul: ${g.via_label} — bu yüzden en erken ${fmtShortDate(g.date)}'de başlayabilir. Sonrasında ~${formatWd(rem)} iş günü sürer.${durationNote}`;
            }
            if (g) {
                const overdueNote = g.overdue ? ' (teslimat gecikmiş — en erken bugünden itibaren)' : '';
                return `${g.label}: ${fmtShortDate(g.date)}${overdueNote}. Sonrasında ~${formatWd(rem)} iş günü sürer.${durationNote}`;
            }
            return `Başlama koşulu bekleniyor; sonrasında ~${formatWd(rem)} iş günü sürer.${durationNote}`;
        }
        if (s.projection_kind === 'coupled') {
            const b = s.projection_basis || {};
            const cutNote = b.cut_ratio !== undefined && b.cut_ratio !== null
                ? ` (kesilen: %${Math.round(b.cut_ratio * 100)})` : '';
            return `Kesim bittikçe ilerleyebilir — kesim öngörüsü ${fmtShortDate(b.base_end)} + son parti için ~${formatWd(b.tail_wd)} iş günü${cutNote}.`;
        }
        if (s.projection_kind === 'chained') {
            // Remaining work of a chained task runs after its predecessor's
            // projected close — the % records the overlap that already
            // happened, but the overlap of what is LEFT is unproven.
            const b = s.projection_basis || {};
            return `Kalan iş (~${formatWd(b.work_wd)} iş günü), "${b.pred_label}" bittikten (${fmtShortDate(b.pred_end)}) sonra sayılıyor.`;
        }
        if (s.projection_kind === 'floored') {
            const b = s.projection_basis || {};
            return `${b.label || 'Bitiş koşulu'} — öngörü: ${fmtShortDate(s.projected_end_date)}.`;
        }
        if (s.projection_kind === 'weight') {
            return `Henüz ilerleme yok; görevin ağırlığına ve işin genel hızına göre ~${formatWd(rem)} iş günü sürmesi bekleniyor.`;
        }
        if (s.projection_kind === 'push') {
            const pusher = s.pushed_by && byId.get(s.pushed_by);
            return `Önce şu görev bitmeli: ${pusher ? label(pusher) : 'önceki görev'}. Sonrasında ~${formatWd(rem)} iş günü sürer.`;
        }
        if (s.projection_kind === 'subtasks') {
            return 'Alt görevlerine göre: en geç biten alt görevi bu tarihte bitiyor.';
        }
        if (s.projection_kind === 'start') {
            // A started-but-0% task restarts its window from TODAY — without
            // saying so, "plandaki aralık" next to a date past the planned
            // end reads as a contradiction (266-13-02 BAKIR EKİBİ).
            const started = s.projection_elapsed_wd !== null
                && s.projection_elapsed_wd !== undefined;
            if (t.target_start_date || t.target_completion_date) {
                return started
                    ? `Plandaki aralığın süresi esas alındı (~${formatWd(rem)} iş günü) — ilerleme %0 olduğu için bugünden itibaren sayılıyor.`
                    : `Plandaki tarih aralığı esas alındı (~${formatWd(rem)} iş günü).`;
            }
            return 'Süre bilgisi yok — 1 iş günü varsayıldı.';
        }
        return '';
    };

    // Started tasks are never held by their conditions, but open waits must
    // stay visible ("Üretim başladı ama kritik borular Eylül'de gelecek").
    // The table renders them as separate note lines under the core sentence;
    // prose consumers (driver box) get them joined. Gate rows already
    // narrate their binding condition.
    const basisNotes = (t) => {
        const s = t.schedule;
        if (s.projection_kind === 'gate' || t.status === 'completed') return [];
        return (s.projection_gates || [])
            .filter(g => g.open && !g.binding)
            .map(g => g.date ? `${g.label}: ${fmtShortDate(g.date)}` : g.label);
    };
    const basisSentence = (t) => {
        const core = coreBasisSentence(t);
        const notes = basisNotes(t);
        return notes.length ? `${core} Açık koşul — ${notes.join(' · ')}.` : core;
    };

    // One glyph per projection family so the column scans without reading:
    // tempo is measured, budgets are entered, chains are ordering, floors are
    // external constraints. The legend above the table names them.
    const BASIS_ICONS = {
        rate: ['fa-gauge-high', 'Ölçülen tempo'],
        duration: ['fa-ruler-horizontal', 'Girilen süre (takvim bütçesi)'],
        parent_duration: ['fa-ruler-horizontal', 'Üst görevden ağırlık payı (bütçe)'],
        parent_window: ['fa-ruler-horizontal', 'Plan penceresinden ağırlık payı'],
        start: ['fa-ruler-horizontal', 'Plan penceresi'],
        subtasks: ['fa-sitemap', 'Alt görevlerin en geç biteni'],
        push: ['fa-link', 'Sıra: önceki görev bitince başlar'],
        chained: ['fa-link', 'Sıra: kalan iş öncekinden sonra sayılır'],
        gate: ['fa-hourglass-half', 'Başlama koşulu bekliyor'],
        floored: ['fa-anchor', 'Bitiş tabanı (teslimat / koşul)'],
        coupled: ['fa-anchor', 'Kesim ilerledikçe ilerleyebilir'],
        weight: ['fa-scale-balanced', 'Ağırlık payından tahmin'],
        done: ['fa-check', 'Kapanış bekleniyor'],
    };

    const MINI_THEME = {
        overdue: 'red', completed_late: 'red', at_risk: 'orange',
        completed_on_time: 'green',
    };
    const progressCell = (t) => {
        const pct = Math.round(t.completion_percentage || 0);
        const theme = t.status === 'completed'
            ? 'green' : (MINI_THEME[t.schedule.classification] || 'blue');
        return `
            <div class="pp-plan-progress">
                ${miniBarHtml(pct / 100, theme)}<span class="pp-plan-pct">%${pct}</span>
            </div>`;
    };

    const taskRow = (t, depth = 0, isParent = false) => {
        const s = t.schedule;
        const completed = t.status === 'completed';
        // "Plansız" on a finished row reads as a problem — a completed task
        // without a target date is simply done.
        const badge = completed && s.classification === 'unplanned'
            ? { label: 'Bitti', badgeClass: 'status-green' }
            : (CLASSIFICATION_BADGES[s.classification] || CLASSIFICATION_BADGES.not_started);
        const end = s.projected_end_date || s.actual_end_date;
        const variance = s.projected_variance_wd ?? s.end_variance_wd ?? s.overdue_wd;
        const varianceHtml = variance === null || variance === undefined ? ''
            : (variance > 0
                ? ` <span class="pp-var-chip pp-var-late">${formatWd(variance)} g geç</span>`
                : (variance < 0 ? ` <span class="pp-var-chip pp-var-early">${formatWd(variance)} g erken</span>` : ''));
        const materialWaitHtml = s.material_wait ? ` ${materialWaitBadgeHtml(s.material_wait)}` : '';
        const driver = s.drives_completion;
        const conflict = conflictSentence(t);
        const warnIcon = conflict
            ? `<i class="fas fa-triangle-exclamation pp-warn-flag" title="${escapeHtml(conflict)}"></i> ` : '';
        const branch = depth > 0 ? '<span class="pp-tree-branch">└</span>' : '';
        const icon = completed ? null : BASIS_ICONS[s.projection_kind];
        const notes = basisNotes(t);
        const basisCell = `
            <div class="pp-basis">
                ${icon ? `<i class="fas ${icon[0]} pp-basis-icon" title="${escapeHtml(icon[1])}"></i>` : ''}
                <div class="pp-basis-text">
                    <div class="pp-basis-core">${escapeHtml(coreBasisSentence(t))}</div>
                    ${notes.map(n => `<div class="pp-basis-note"><i class="far fa-clock"></i>Açık koşul · ${escapeHtml(n)}</div>`).join('')}
                    ${conflict ? `<div class="pp-td-conflict"><i class="fas fa-triangle-exclamation"></i> ${escapeHtml(conflict)}</div>` : ''}
                </div>
            </div>`;
        const rowClasses = [
            driver ? 'pp-modal-driver' : '',
            (isParent || depth === 0) ? 'pp-row-parent' : '',
        ].filter(Boolean).join(' ');
        return `
            <tr${rowClasses ? ` class="${rowClasses}"` : ''}>
                <td class="pp-td-main" style="padding-left: ${8 + depth * 18}px" title="${escapeHtml(label(t))}">${branch}${driver ? '<i class="fas fa-flag pp-driver-flag" title="Bitişi belirleyen görev"></i> ' : ''}${warnIcon}${escapeHtml(rowLabel(t))}</td>
                <td><span class="status-badge ${badge.badgeClass}">${badge.label}</span>${materialWaitHtml}</td>
                <td>${progressCell(t)}</td>
                <td class="pp-td-date">${startCell(t)}</td>
                <td class="pp-td-date">${fmtShortDate(t.target_completion_date)}</td>
                <td class="pp-td-date pp-td-proj">${fmtShortDate(end)}${completed ? ' <span class="pp-td-muted-sm">(gerçek)</span>' : ''}${varianceHtml}</td>
                <td class="pp-td-basis">${basisCell}</td>
            </tr>`;
    };

    // Başlangıç: the actual (evidence/entered) start when the task has one,
    // otherwise the forecast's projected start with a ~ prefix — gates and
    // pushes are start stories, and the column makes them visible.
    function startCell(t) {
        const s = t.schedule;
        if (s.actual_start_date) return fmtShortDate(s.actual_start_date);
        if (s.projected_start_date) {
            return `<span title="Öngörülen başlangıç">~${fmtShortDate(s.projected_start_date)}</span>`;
        }
        return '—';
    }

    // Subtrees group by job order in tree order (the endpoint's nodes array
    // is DFS), tasks in their original plan order within each group — a lone
    // job order renders as a flat list with no group chrome.
    // Parents used to be hidden here, on the grounds that their row repeated
    // the children's story. It hid exactly the rows the push arrows point AT:
    // "Boya · Önce şu görev bitmeli: Üretim - Kaynaklı İmalat" named a task
    // that was nowhere in the table, so its date looked like it came from
    // nothing. The whole tree renders now, indented by depth.
    const tasksByJob = new Map();
    for (const t of planData.tasks) {
        if (!tasksByJob.has(t.job_no)) tasksByJob.set(t.job_no, []);
        tasksByJob.get(t.job_no).push(t);
    }
    // Depth-first within each job, children under their parent, plan order
    // preserved among siblings. Anything whose parent sits outside the group
    // (shouldn't happen) is appended rather than dropped.
    const asTree = (list) => {
        const ids = new Set(list.map(t => t.id));
        const byParent = new Map();
        for (const t of list) {
            const key = (t.parent !== null && ids.has(t.parent)) ? t.parent : '_';
            if (!byParent.has(key)) byParent.set(key, []);
            byParent.get(key).push(t);
        }
        const out = [];
        const walk = (key, depth) => {
            for (const t of byParent.get(key) || []) {
                const kids = byParent.get(t.id);
                out.push({ task: t, depth, isParent: !!(kids && kids.length) });
                walk(t.id, depth + 1);
            }
        };
        walk('_', 0);
        return out;
    };
    const groups = (planData.nodes || [])
        .filter(n => (tasksByJob.get(n.job_no) || []).length)
        .map(n => ({ node: n, tasks: tasksByJob.get(n.job_no) }));
    const multiNode = groups.length > 1;

    const rows = [];
    for (const { node, tasks } of groups) {
        // A subtree job where every task finished with no lateness has no
        // story left to tell — one header line says it all (270-06: 40+
        // finished panel jobs each spent rows repeating "Bitti."). Any late
        // finish keeps the group expanded so the red badge stays visible.
        const allDone = multiNode && tasks.every(t => t.status === 'completed');
        const anyLate = tasks.some(
            t => t.schedule.classification === 'completed_late');
        const collapse = allDone && !anyLate;
        if (multiNode) {
            const projected = node.summary && node.summary.projected_completion;
            rows.push(`
                <tr class="pp-modal-group">
                    <td colspan="7" style="padding-left: ${node.depth * 18}px">
                        ${escapeHtml(node.job_no)}
                        <span class="pp-modal-group-title">${escapeHtml(node.title || '')}</span>
                        <span class="pp-modal-group-meta">%${Math.round(node.completion_percentage || 0)}${projected ? ` · Öngörülen ${fmtShortDate(projected)}` : ''}${collapse ? ' · <i class="fas fa-circle-check pp-num-green"></i> tamamlandı' : ''}</span>
                    </td>
                </tr>`);
        }
        if (!collapse) {
            rows.push(...asTree(tasks).map(
                ({ task, depth, isParent }) => taskRow(task, depth, isParent)));
        }
    }

    // The story, top-down: verdict sentence → the three dates → the task that
    // decides the end date → task counts → the per-task table.
    //
    // Read the forecast from the PLAN, not from `item`. The slide item comes
    // from the production-plan OVERVIEW, which is cached ~15 minutes server
    // side; the plan below is recomputed per request. Sourcing the header from
    // `item` let this modal contradict itself — the Sapma figure quoting a
    // stale snapshot while the driver box and the table, built from `planData`
    // two lines down, quoted the current one. Same shape, same values when
    // both are fresh (verified across phased and unphased roots), so the only
    // thing that changes is which of the two can be out of date.
    const forecast = planData.job_order?.forecast || item.forecast || {};
    const vMeta = VERDICT_META[forecast.verdict] || VERDICT_META.unknown;
    const phased = !!(forecast.phases && forecast.phases.length);
    let verdictSentence = {
        late_risk: `Bu gidişle iş, hedefinden <strong>${formatWd(forecast.variance_wd)} iş günü geç</strong> bitecek görünüyor.`,
        on_track: 'Bu gidişle iş <strong>hedef tarihinde</strong> bitecek görünüyor.',
        finished_late: `İş tamamlandı — hedefinden <strong>${formatWd(forecast.variance_wd)} iş günü geç</strong> bitti.`,
        finished_on_time: 'İş tamamlandı — <strong>zamanında</strong> bitti.',
        no_target: 'Hedef tarih girilmediği için sapma hesaplanamıyor.',
        no_data: 'Öngörü için henüz veri yok: açık görevlerin hiçbirinde süre, hedef tarih veya ilerleme bulunmuyor. Öngörü, ilk gerçek veriyle (dizayn süresi, teknik resim yayını, planlama talebi) netleşmeye başlar.',
    }[forecast.verdict] || 'Öngörü hesaplanacak veri yok.';
    if (phased && forecast.worst_phase !== null && forecast.worst_phase !== undefined) {
        verdictSentence = forecast.verdict === 'late_risk'
            ? `En geç faz: <strong>Faz ${forecast.worst_phase}</strong> — kendi hedefinden <strong>${formatWd(forecast.variance_wd)} iş günü geç</strong> görünüyor. Fazlar kendi sevk tarihlerine göre ayrı değerlendirilir.`
            : `Fazlar kendi sevk tarihlerine göre ayrı değerlendirilir — geciken faz yok.`;
    }

    const v = forecast.variance_wd;
    const sapmaHtml = v === null || v === undefined ? '—'
        : (v > 0
            ? `<span class="pp-fig-late">+${formatWd(v)} iş günü</span>`
            : (v < 0 ? `<span class="pp-fig-early">${formatWd(v)} iş günü erken</span>` : 'Tam zamanında'));

    const driverTask = planData.tasks.find(t => t.schedule.drives_completion);
    const driverBox = driverTask ? `
        <div class="pp-plan-driver">
            <i class="fas fa-flag pp-driver-flag"></i>
            <div>
                <div class="pp-plan-driver-title">Bitiş tarihini bu görev belirliyor:
                    <strong>${escapeHtml(label(driverTask))}</strong>
                    <span class="pp-td-muted-sm">· ${escapeHtml(driverTask.job_no)}</span></div>
                <div class="pp-plan-driver-sub">En geç bitmesi öngörülen görev bu:
                    ${fmtShortDate(driverTask.schedule.projected_end_date)} — iş de o gün tamamlanır.
                    ${escapeHtml(basisSentence(driverTask))}</div>
            </div>
        </div>` : '';

    // Every date under a contradicted duration rests on one of two entries
    // that cannot both be right, so the count belongs above the table rather
    // than only in the rows.
    const conflicted = planData.tasks.filter(t => t.schedule.duration_conflict);
    const conflictBanner = conflicted.length ? `
        <div class="pp-plan-warn">
            <i class="fas fa-triangle-exclamation"></i>
            <div><strong>${conflicted.length} görevde süre tutarsızlığı var.</strong>
                Bir üst görevin süresi, alt görevlere ağırlık payına göre bölünür;
                girilen süreler bu payla çelişiyor. Aşağıdaki tarihlerden bir kısmı
                hatalı süreye dayanıyor olabilir.</div>
        </div>` : '';

    const counts = summarizePlanTasks(planData.tasks);
    const chip = (n, txt, cls) => n ? `<span class="pp-plan-count ${cls}">${n} ${txt}</span>` : '';
    const countsHtml = `
        <div class="pp-plan-counts">
            ${chip(counts.late, 'gecikmede', 'pp-pc-red')}
            ${chip(counts.risk, 'risk altında', 'pp-pc-orange')}
            ${chip(counts.active, 'devam ediyor', 'pp-pc-blue')}
            ${chip(counts.waiting, 'başlamadı', 'pp-pc-grey')}
            ${chip(counts.lateDone, 'geç bitti', 'pp-pc-red')}
            ${chip(counts.done, 'bitti', 'pp-pc-green')}
            ${chip(counts.excluded, 'kapsam dışı', 'pp-pc-grey')}
        </div>`;

    document.getElementById('pp-modal-body').innerHTML = `
        <div class="pp-plan-verdict pp-pv-${vMeta.theme}">
            <i class="fas ${vMeta.icon}"></i>
            <div>${verdictSentence}</div>
        </div>
        ${phased ? phaseCardsHtml(forecast, false) : `
        <div class="pp-plan-figures">
            <div class="pp-plan-fig">
                <label>Hedef Bitiş</label>
                <span>${formatDateLong(forecast.target_completion_date)}</span>
            </div>
            <div class="pp-plan-fig">
                <label>Öngörülen Bitiş</label>
                <span class="${forecast.verdict === 'late_risk' ? 'pp-fig-late' : ''}">${formatDateLong(forecast.projected_completion_date)}</span>
            </div>
            <div class="pp-plan-fig">
                <label>Sapma</label>
                <span>${sapmaHtml}</span>
            </div>
        </div>`}
        ${driverBox}
        ${countsHtml}
        ${conflictBanner}
        <div class="pp-plan-section">
            Görev bazında öngörü
            <span>— her satır kendi verisinden hesaplanır; bir ana görev, en geç
            biten alt görevinde biter${multiNode ? '. Görevler alt iş emirlerine göre gruplu' : ''}.</span>
        </div>
        <div class="pp-plan-legend">
            <span><i class="fas fa-flag pp-driver-flag"></i>bitişi belirleyen görev</span>
            <span><i class="fas fa-gauge-high"></i>ölçülen tempo</span>
            <span><i class="fas fa-ruler-horizontal"></i>süre bütçesi</span>
            <span><i class="fas fa-sitemap"></i>en geç alt görev</span>
            <span><i class="fas fa-link"></i>sıra bağımlılığı</span>
            <span><i class="fas fa-anchor"></i>bitiş tabanı</span>
            <span><i class="fas fa-scale-balanced"></i>ağırlık payı</span>
            <span><i class="far fa-clock"></i>açık koşul</span>
            <span class="pp-plan-legend-tilde">~ öngörülen değer</span>
        </div>
        ${modalTableHtml(['Görev', 'Durum', 'İlerleme', 'Başlangıç', 'Hedef', 'Öngörülen Bitiş', 'Neden bu tarih?'], rows)}`;
}

function weldingModalHtml(brief) {
    const welding = brief.welding || {};
    // The panel leads with the biggest allocations; the modal reads as a
    // job-order listing.
    const resources = [...(welding.resources || [])].sort((a, b) =>
        (a.job_no || '').localeCompare(b.job_no || '', undefined, { numeric: true })
        || (a.planned - b.planned)
        || b.allocated_weight_kg - a.allocated_weight_kg);
    const rows = resources.map((r) => {
        const badge = r.kind === 'subcontractor'
            ? '<span class="status-badge status-purple">Taşeron</span>'
            : '<span class="status-badge status-blue">Dahili</span>';
        const progress = r.planned
            ? `<span class="text-muted">plan${r.planned_start_date ? ` · ${fmtShortDate(r.planned_start_date)} – ${fmtShortDate(r.planned_end_date)}` : ''}</span>`
            : `${miniBarHtml((r.progress_pct || 0) / 100, 'blue')} <strong>%${fmtInt(r.progress_pct)}</strong>`;
        return `
            <tr>
                <td>${badge}</td>
                <td class="pp-td-main" title="${escapeHtml(r.name)}">${escapeHtml(r.name)}</td>
                <td>${escapeHtml(r.job_no)}</td>
                <td class="pp-td-num">${fmtInt(r.allocated_weight_kg)} kg</td>
                <td>${progress}</td>
            </tr>`;
    });
    const hours = welding.hours || {};
    const body = `
        <div class="pp-modal-stats">
            <span>Ağırlıklı ilerleme <strong>${welding.weighted_progress_pct == null ? '—' : '%' + fmtInt(welding.weighted_progress_pct)}</strong></span>
            <span>Görev ilerlemesi <strong>${welding.task_progress_pct == null ? '—' : '%' + fmtInt(welding.task_progress_pct)}</strong></span>
            <span>Tahsis <strong>${fmtInt(welding.allocated_kg_total)} kg</strong></span>
            <span>İşçilik <strong>${fmtHours(hours.regular)} s</strong></span>
            <span>Fazla mesai <strong>${fmtHours(hours.after_hours)} s</strong></span>
            <span>Tatil <strong>${fmtHours(hours.holiday)} s</strong></span>
        </div>
        ${modalTableHtml(['Tür', 'Kaynak', 'İş Emri', { label: 'Tahsis', num: true }, 'İlerleme'], rows)}`;
    return { title: 'Kaynaklı İmalat Detayı', body };
}

function machiningModalHtml(brief, detail) {
    const machining = brief.machining || {};
    const operations = (detail && detail.operations) || [];
    const rows = operations.map((op) => `
        <tr>
            <td class="pp-td-main" title="${escapeHtml(op.name || op.key)}">${escapeHtml(op.name || op.key)}</td>
            <td class="pp-td-muted" title="${escapeHtml(op.part_name || '')}">${escapeHtml(op.part_name || '—')}</td>
            <td>${escapeHtml(op.job_no || '')}</td>
            <td class="pp-td-num">${fmtHours(op.estimated_hours)} s</td>
            <td class="pp-td-num">${fmtHours(op.hours_spent)} s</td>
            <td>${op.completed
                ? '<span class="status-badge status-green">Tamam</span>'
                : '<span class="status-badge status-blue">Açık</span>'}</td>
        </tr>`);
    const body = `
        <div class="pp-modal-stats">
            <span>Operasyon <strong>${fmtInt(machining.operations_completed)} / ${fmtInt(machining.operations_total)}</strong></span>
            <span>Tahmini <strong>${fmtHours(machining.estimated_hours_total)} s</strong></span>
            <span>Harcanan <strong>${fmtHours(machining.hours_spent)} s</strong></span>
            <span>Kalan <strong>~${fmtHours(machining.hours_remaining)} s</strong></span>
            <span>Parça <strong>${fmtInt(machining.parts_completed)} / ${fmtInt(machining.parts_total)}</strong></span>
        </div>
        ${modalTableHtml(['Operasyon', 'Parça', 'İş Emri',
            { label: 'Tahmini', num: true }, { label: 'Harcanan', num: true }, 'Durum'], rows)}`;
    return { title: 'Talaşlı İmalat Detayı', body };
}

function cuttingModalHtml(brief, detail) {
    const cutting = brief.cutting || {};
    const parts = (detail && detail.parts) || [];
    const rows = parts.map((p) => `
        <tr>
            <td class="pp-td-main">${escapeHtml(p.image_no || '—')}${p.position_no ? ` <span class="text-muted">/ ${escapeHtml(p.position_no)}</span>` : ''}</td>
            <td class="pp-td-muted">${escapeHtml(p.nesting || '—')}</td>
            <td>${escapeHtml(p.job_no || '')}</td>
            <td class="pp-td-num">${fmtInt(p.quantity)} adet</td>
            <td class="pp-td-num">${fmtInt(p.weight_kg)} kg</td>
            <td>${p.cut
                ? '<span class="status-badge status-green">Kesildi</span>'
                : (p.material_pending
                    ? `<span class="status-badge status-orange" title="Plaka teslim edilmedi${p.plate_item_code ? ' — ' + escapeHtml(p.plate_item_code) : ''} (satın alma)">Malzeme Bekliyor</span>`
                    : '<span class="status-badge status-orange">Bekliyor</span>')}</td>
        </tr>`);
    const materialWaiting = cutting.parts_waiting_material || 0;
    const body = `
        <div class="pp-modal-stats">
            <span>Bekleyen <strong>${fmtInt(cutting.parts_waiting)} parça · ${fmtInt(cutting.weight_waiting)} kg</strong></span>
            ${materialWaiting ? `<span>Malzeme bekleyen <strong class="pp-num-orange">${fmtInt(materialWaiting)} parça · ${fmtInt(cutting.weight_waiting_material)} kg</strong></span>` : ''}
            <span>Kesilen <strong>${fmtInt(cutting.parts_cut)} / ${fmtInt(cutting.parts_total)} parça</strong></span>
            <span>Ağırlık <strong>${fmtInt(cutting.weight_cut)} / ${fmtInt(cutting.weight_total)} kg</strong></span>
        </div>
        <div class="pp-modal-note">Bekleyenler üstte, ağır olan önce. "Malzeme Bekliyor" = plaka teslim edilmedi, gecikme satın almada.</div>
        ${modalTableHtml(['Resim / Poz', 'Nesting', 'İş Emri',
            { label: 'Adet', num: true }, { label: 'Ağırlık', num: true }, 'Durum'], rows)}`;
    return { title: 'CNC Kesim Detayı', body };
}

function qualityModalHtml(brief, detail) {
    const quality = brief.quality || {};
    const rows = ((detail && detail.list) || []).map((n) => `
        <tr>
            <td><strong>${escapeHtml(n.ncr_number)}</strong></td>
            <td class="pp-td-main" title="${escapeHtml(n.title)}">${escapeHtml(n.title)}</td>
            <td><span class="status-badge ${NCR_SEVERITY_BADGES[n.severity] || 'status-grey'}">${escapeHtml(n.severity_display)}</span></td>
            <td><span class="status-badge ${['approved', 'closed'].includes(n.status) ? 'status-green' : 'status-red'}">${escapeHtml(n.status_display)}</span></td>
            <td>${escapeHtml(n.job_no)}</td>
            <td>${fmtShortDate(n.created_at)}</td>
        </tr>`);
    const sev = quality.open_by_severity || {};
    const body = `
        <div class="pp-modal-stats">
            <span>Açık <strong class="${quality.open ? 'pp-num-red' : 'pp-num-green'}">${fmtInt(quality.open)}</strong></span>
            <span>Kritik <strong>${fmtInt(sev.critical)}</strong></span>
            <span>Majör <strong>${fmtInt(sev.major)}</strong></span>
            <span>Minör <strong>${fmtInt(sev.minor)}</strong></span>
            <span>Toplam <strong>${fmtInt(quality.total)}</strong></span>
        </div>
        ${modalTableHtml(['NCR', 'Başlık', 'Önem', 'Durum', 'İş Emri', 'Tarih'], rows)}`;
    return { title: 'Kalite · NCR Detayı', body };
}

const PROCUREMENT_STAGE_BADGES = {
    not_requested: '<span class="status-badge status-orange">Talebe dönüşmedi</span>',
    requested: '<span class="status-badge status-blue">Talepte · bekliyor</span>',
    delivered: '<span class="status-badge status-green">Teslim edildi</span>',
};

function procurementModalHtml(brief, detail) {
    const procurement = brief.procurement || {};
    const items = (detail && detail.items) || [];
    // Teslim tarihi: delivered rows show the actual date (green); pending
    // rows the last open PO line's promise (red + "gecikti" once passed);
    // no live PO = no date to promise.
    const deliveryCell = (w) => {
        if (w.stage === 'delivered') {
            return w.delivered_at
                ? `<span class="pp-num-green">${fmtShortDate(w.delivered_at)}</span>`
                : '<span class="pp-num-green">teslim edildi</span>';
        }
        if (w.projected_delivery) {
            return w.delivery_overdue
                ? `<span class="pp-num-red" title="Söz verilen teslim tarihi geçti">${fmtShortDate(w.projected_delivery)} · gecikti</span>`
                : `<span title="Öngörülen teslim (sipariş + teslim süresi)">~${fmtShortDate(w.projected_delivery)}</span>`;
        }
        return '<span class="text-muted" title="Açık sipariş yok — teslim tarihi öngörülemiyor">sipariş yok</span>';
    };
    const rows = items.map((w) => `
        <tr>
            <td class="pp-td-main" title="${escapeHtml(w.item_name || '')}">${escapeHtml(w.item_name || '—')}
                <span class="text-muted">${escapeHtml(w.item_code || '')}</span></td>
            <td class="pp-td-muted">${escapeHtml(w.request_number || '—')}</td>
            <td>${escapeHtml(w.job_no || '')}</td>
            <td class="pp-td-num">${fmtInt(w.quantity_to_purchase)}</td>
            <td>${PROCUREMENT_STAGE_BADGES[w.stage] || ''}</td>
            <td class="pp-td-date">${deliveryCell(w)}</td>
            <td class="pp-td-crit">${w.id !== undefined ? `<input type="checkbox" class="pp-crit-toggle"
                data-item-id="${w.id}" ${w.is_critical ? 'checked' : ''}
                title="Kritik: imalat bu kalem teslim edilmeden devam edemez">` : ''}</td>
        </tr>`);
    const criticalStat = procurement.critical_waiting
        ? `<span>Kritik bekleyen <strong class="pp-num-red">${fmtInt(procurement.critical_waiting)}</strong></span>`
        : '';
    // Depodan çekilen malzemeler — one row per pulled item line, so the
    // slide answers "what left the warehouse, to whom, when" directly.
    const pullRequests = (detail && detail.pull_requests) || [];
    const pullRows = pullRequests.flatMap((p) => {
        const kindBadge = p.kind === 'subcontractor'
            ? '<span class="status-badge status-purple">Taşeron</span>'
            : '<span class="status-badge status-blue">Ekip</span>';
        const statusBadge = p.status === 'transferred'
            ? `<span class="status-badge status-green">${escapeHtml(p.status_label || 'Teslim Edildi')}</span>`
            : `<span class="status-badge status-orange">${escapeHtml(p.status_label || 'Beklemede')}</span>`;
        const who = p.status === 'transferred' && p.confirmed_by
            ? `${escapeHtml(p.confirmed_by)} · ${fmtShortDate(p.confirmed_at || p.requested_at)}`
            : `${escapeHtml(p.requested_by || '—')} · ${fmtShortDate(p.requested_at)}`;
        return (p.items || []).map((item) => `
            <tr>
                <td class="pp-td-muted"><strong>${escapeHtml(p.number)}</strong></td>
                <td class="pp-td-main" title="${escapeHtml(p.destination || '')}">${escapeHtml(p.destination || '—')} ${kindBadge}</td>
                <td class="pp-td-main" title="${escapeHtml(item.item_name || '')}">${escapeHtml(item.item_name || '—')}
                    <span class="text-muted">${escapeHtml(item.item_code || '')}</span></td>
                <td>${escapeHtml(item.job_no || '')}</td>
                <td class="pp-td-num">${fmtInt(item.quantity)} ${escapeHtml(item.item_unit || '')}</td>
                <td>${statusBadge}</td>
                <td class="pp-td-date">${who}</td>
            </tr>`);
    });
    const pulls = procurement.material_pulls || {};
    const pullSection = pullRows.length ? `
        <div class="pp-modal-section">Depodan Çekilen Malzemeler
            <span class="text-muted">· ${fmtInt(pulls.transferred)} talep teslim edildi / ${fmtInt(pulls.pending)} bekliyor</span></div>
        ${modalTableHtml(['Talep', 'Hedef', 'Malzeme', 'İş Emri', { label: 'Miktar', num: true }, 'Durum', 'Kim · Tarih'], pullRows)}` : '';
    const body = `
        <div class="pp-modal-stats">
            <span>Bekleyen <strong>${fmtInt(procurement.items_waiting)}</strong></span>
            <span>Talebe dönüşmedi <strong>${fmtInt(procurement.not_yet_requested)}</strong></span>
            <span>Talepte <strong>${fmtInt(procurement.requested_waiting)}</strong></span>
            <span>Teslim edildi <strong class="pp-num-green">${fmtInt(procurement.items_delivered)} / ${fmtInt(procurement.items_total)}</strong></span>
            ${criticalStat}
        </div>
        ${modalTableHtml(['Malzeme', 'Talep', 'İş Emri', { label: 'Miktar', num: true }, 'Aşama', 'Teslim Tarihi', 'Kritik'], rows)}
        ${pullSection}`;
    return { title: 'Satın Alma Detayı', body };
}

// Critical toggle — imalat bu kalem olmadan devam edemez. The forecast holds
// Üretim's start until every critical item is delivered, so a toggle
// invalidates the cached plan (Plan Detayı must refetch the new gates).
async function onCriticalToggle(box) {
    const itemId = Number(box.dataset.itemId);
    const makeCritical = box.checked;
    box.disabled = true;
    try {
        if (makeCritical) await markPlanningRequestItemCritical(itemId);
        else await unmarkPlanningRequestItemCritical(itemId);

        const jobNo = meetingModalContext && meetingModalContext.jobNo;
        if (jobNo) {
            const detail = meetingSectionCache.get(`${jobNo}:procurement`);
            const row = detail && (detail.items || []).find(i => i.id === itemId);
            if (row) {
                row.is_critical = makeCritical;
                const brief = meetingBriefCache.get(jobNo);
                if (brief && brief.procurement && row.stage !== 'delivered') {
                    brief.procurement.critical_waiting =
                        (brief.procurement.critical_waiting || 0) + (makeCritical ? 1 : -1);
                }
            }
            meetingPlanCache.delete(jobNo);
        }
        showNotification(makeCritical
            ? 'Kalem kritik olarak işaretlendi — imalat öngörüsü bu teslimatı bekleyecek'
            : 'Kritik işareti kaldırıldı', 'success');
    } catch (error) {
        console.error('Critical toggle failed:', error);
        box.checked = !makeCritical;
        showNotification(error?.message || 'Kritik işareti güncellenemedi', 'danger');
    } finally {
        box.disabled = false;
    }
}

const RELEASE_STATUS_BADGES = {
    released: 'status-green',
    superseded: 'status-grey',
    in_revision: 'status-orange',
    pending_approval: 'status-blue',
    rejected: 'status-red',
};

function revisionsModalHtml(brief, detail) {
    const drawing = (brief.revisions || {}).drawing || {};
    const targets = (brief.revisions || {}).design_targets || {};
    const releaseRows = ((detail && detail.releases) || []).map((r) => `
        <tr>
            <td><strong>Rev ${escapeHtml(r.revision_code || `R${r.revision_number}`)}</strong></td>
            <td><span class="status-badge ${RELEASE_STATUS_BADGES[r.status] || 'status-grey'}">${escapeHtml(r.status_display)}</span></td>
            <td>${escapeHtml(r.job_no)}</td>
            <td>${fmtShortDate(r.released_at)}</td>
        </tr>`);
    const taskRows = ((detail && detail.design_tasks) || []).map((t) => `
        <tr>
            <td class="pp-td-main" title="${escapeHtml(t.title || '')}">${escapeHtml(t.title || '—')}</td>
            <td>${escapeHtml(t.job_no)}</td>
            <td>${t.target_completion_date
                ? `<strong>${fmtShortDate(t.target_completion_date)}</strong>`
                : '<span class="pp-num-orange">Girilmemiş</span>'}</td>
            <td><span class="status-badge ${TASK_STATUS_BADGES[t.status] || 'status-grey'}">${escapeHtml(t.status_display)}</span></td>
        </tr>`);
    const body = `
        <div class="pp-modal-section">Teknik Resim Yayınları
            <span class="text-muted">· ${fmtInt(drawing.revision_count)} kez revize</span></div>
        ${modalTableHtml(['Revizyon', 'Durum', 'İş Emri', 'Tarih'], releaseRows)}
        <div class="pp-modal-section">Dizayn Görevleri Hedef Tarihleri
            <span class="text-muted">· ${fmtInt(targets.with_target)}/${fmtInt(targets.total)} görevde tarih</span></div>
        ${modalTableHtml(['Görev', 'İş Emri', 'Hedef Tarih', 'Durum'], taskRows)}`;
    return { title: 'Dizayn Detayı', body };
}

// Leaving restores the page underneath — it was only hidden, never unmounted.
function exitMeeting() {
    window.history.pushState(null, '', window.location.pathname);
    setMeetingChrome(false);
}

function jumpToJob(query) {
    const needle = (query || '').trim().toUpperCase();
    if (!needle) return;
    const index = meetingItems.findIndex(i => i.job_no.toUpperCase() === needle);
    const fallback = index >= 0 ? index
        : meetingItems.findIndex(i => i.job_no.toUpperCase().startsWith(needle));
    const found = fallback >= 0 ? fallback
        : meetingItems.findIndex(i => i.job_no.toUpperCase().includes(needle));
    if (found < 0) {
        showNotification(`"${needle}" portföyde bulunamadı`, 'warning');
        return;
    }
    meetingIndex = found;
    renderMeetingSlide();
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
        meetingHeroHtml(item) +
        `<div id="pp-meeting-panels" class="pp-meeting-grid">${brief ? '' : meetingSkeletonHtml()}</div>`;

    if (brief) {
        renderMeetingPanels(item, brief);
    }

    // Fetching waits until the user SETTLES on a slide — flipping through ten
    // slides must not fire ten briefs plus twenty prefetches. Cached slides
    // render instantly above regardless.
    clearTimeout(meetingFetchTimer);
    clearTimeout(meetingPrefetchTimer);
    meetingFetchTimer = setTimeout(() => {
        const current = meetingItems[meetingIndex];
        if (currentMode !== 'meeting' || !current) return;
        if (!meetingBriefCache.has(current.job_no)) {
            ensureBrief(current.job_no).then((loaded) => {
                const still = meetingItems[meetingIndex];
                if (currentMode === 'meeting' && loaded && still && still.job_no === current.job_no) {
                    renderMeetingPanels(still, loaded);
                }
            });
        }
        // Warm the neighbours so prev/next feels instant — but only once the
        // user has clearly parked on this slide.
        meetingPrefetchTimer = setTimeout(() => {
            if (currentMode !== 'meeting') return;
            [meetingIndex - 1, meetingIndex + 1].forEach((i) => {
                if (meetingItems[i]) ensureBrief(meetingItems[i].job_no);
            });
        }, MEETING_PREFETCH_MS);
    }, MEETING_SETTLE_MS);
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
            <div class="pp-strip-title"></div>
            <div class="pp-strip-actions">
                <input type="text" id="pp-meeting-search" class="pp-strip-search"
                       placeholder="İş no + Enter" autocomplete="off" spellcheck="false">
                <span class="pp-strip-hint d-none d-lg-inline">← → gezin · Esc çık</span>
                <button type="button" class="btn btn-sm pp-strip-btn" data-modal="plan">
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

// Financial medallion: a compact circular badge floating at the center of
// the panel grid, clipping over the section seams. Verdict word ONLY — the
// slide is company-public, so no ratios, no amounts (user decision
// 2026-08-04). Absent financial data (no cost access) renders nothing; the
// badge is an overlay, so the grid never has a hole.
function financialBadgeHtml(financial) {
    if (!financial) return '';
    const meta = FINANCIAL_META[financial.verdict] || FINANCIAL_META.no_data;
    const word = meta.label.replace('Finans · ', '');
    // Cost-permitted users click through to the amounts modal (the section
    // endpoint re-checks the permission server-side); everyone else gets
    // the words-only medal.
    const clickable = !!financial.can_view_details;
    const reason = (financial.reason || '') +
        (financial.price_is_derived ? ' — satış fiyatı türetilmiş' : '') +
        (clickable ? ' — detay için tıklayın' : '');
    return `
        <div class="pp-fin-medal pp-fin-medal-${meta.theme}${clickable ? ' pp-fin-medal-click' : ''}"
             ${clickable ? 'data-modal="financial" role="button"' : ''} title="${escapeHtml(reason)}">
            <i class="fas fa-coins"></i>
            <span class="pp-fin-medal-caption">Finans</span>
            <span class="pp-fin-medal-word">${word}</span>
        </div>`;
}

function financialModalHtml(brief, detail) {
    const d = detail || {};
    const meta = FINANCIAL_META[d.verdict] || FINANCIAL_META.no_data;
    const fmtEur = (v) => v === null || v === undefined
        ? '—' : `€${Math.round(v).toLocaleString('tr-TR')}`;
    const fmtPerKg = (v) => v === null || v === undefined
        ? '—' : `€${v.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}/kg`;
    const perKgNote = (v) => v === null || v === undefined
        ? '' : ` <span class="pp-td-muted-sm">(${fmtPerKg(v)})</span>`;
    const derivedMark = d.price_is_derived
        ? ' <span class="status-badge status-grey" style="min-width:auto;">türetilmiş</span>' : '';
    // Kâr oranı = (satış − öngörülen maliyet) / satış — profit, not cost
    // coverage.
    const profitHtml = d.profit_pct === null || d.profit_pct === undefined ? '—'
        : `<span class="${d.profit_pct < 0 ? 'pp-num-red' : 'pp-num-green'}">%${d.profit_pct.toLocaleString('tr-TR')}</span>`;
    const marginHtml = d.margin_eur === null || d.margin_eur === undefined ? '—'
        : (d.margin_eur < 0
            ? `<span class="pp-num-red">${fmtEur(d.margin_eur)}</span>`
            : `<span class="pp-num-green">${fmtEur(d.margin_eur)}</span>`);
    const rows = (d.categories || []).map((c) => `
        <tr>
            <td class="pp-td-main">${escapeHtml(c.label)}</td>
            <td class="pp-td-num">${fmtEur(c.amount_eur)}</td>
            <td class="pp-td-num">${fmtPerKg(c.eur_per_kg)}</td>
        </tr>`);
    if (rows.length) {
        rows.push(`
        <tr>
            <td class="pp-td-main"><strong>Toplam (gerçekleşen)</strong></td>
            <td class="pp-td-num"><strong>${fmtEur(d.actual_total_eur)}</strong></td>
            <td class="pp-td-num"><strong>${fmtPerKg(d.actual_eur_per_kg)}</strong></td>
        </tr>`);
    }
    const body = `
        <div class="pp-modal-stats">
            <span><span class="status-badge ${meta.theme === 'green' ? 'status-green' : meta.theme === 'red' ? 'status-red' : meta.theme === 'orange' ? 'status-orange' : 'status-grey'}">${meta.label}</span></span>
            <span>Satış Fiyatı <strong>${fmtEur(d.price_eur)}</strong>${perKgNote(d.price_eur_per_kg)}${derivedMark}</span>
            <span>Gerçekleşen <strong>${fmtEur(d.actual_total_eur)}</strong>${perKgNote(d.actual_eur_per_kg)}</span>
            <span>Öngörülen Toplam <strong>${fmtEur(d.projected_total_eur)}</strong>${perKgNote(d.projected_eur_per_kg)}</span>
            <span>Kâr <strong>${profitHtml}</strong></span>
            <span>Marj <strong>${marginHtml}</strong></span>
            ${d.total_weight_kg ? `<span>Ağırlık <strong>${fmtInt(d.total_weight_kg)} kg</strong></span>` : ''}
        </div>
        <div class="pp-modal-note">${escapeHtml(d.reason || '')}${d.delivered_uncosted_deduction_eur ? ` (maliyeti girilmemiş teslim alınan kalemler için ${fmtEur(d.delivered_uncosted_deduction_eur)} düşüldü)` : ''}</div>
        <div class="pp-modal-section">Gerçekleşen Maliyet Dağılımı</div>
        ${modalTableHtml(['Kalem', { label: 'Tutar', num: true }, { label: '€/kg', num: true }], rows)}`;
    return { title: 'Finans Detayı', body };
}

// The slide hero: job no, title, the Hedef/Öngörülen/Sapma triple (or one
// card per phase) and the progress bar. Clicking it opens Plan Detayı.
// Finans lives in the center medallion (financialBadgeHtml), not here.
function meetingHeroHtml(item) {
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
    const startLine = item.created_date
        ? `<div class="pp-fig-xl-start" title="İş emrinin açıldığı tarih">Başlangıç · ${fmtShortDate(item.created_date)}</div>`
        : '';
    // Phased heroes have no Hedef Bitiş figure to anchor the opening date to,
    // and their card row already fills the height budget — so the line rides
    // in the empty right zone of the header instead of adding a row.
    const phased = !!(forecast.phases && forecast.phases.length);

    return `
        <div class="dashboard-card pp-hero pp-verdict-card pp-verdict-${meta.theme}"
             data-modal="plan" role="button"
             title="Neden erken/geç? Görev bazında detay">
            <div class="card-body">
                <div class="pp-hero-top">
                    <div class="pp-hero-id">
                        <span class="pp-verdict-jobno">${escapeHtml(item.job_no)}</span>
                        ${statusChip}
                    </div>
                    <div class="pp-hero-center">
                        <div class="pp-hero-title" title="${escapeHtml(item.title || '')}">${escapeHtml(item.title || '')}</div>
                        ${item.customer_name ? `<div class="pp-hero-customer">${escapeHtml(item.customer_name)}</div>` : ''}
                    </div>
                    <div class="pp-hero-pills">${phased ? startLine : ''}</div>
                </div>
                ${phased ? phaseCardsHtml(forecast, true) : `
                <div class="pp-hero-figures-xl">
                    <div class="pp-fig-xl">
                        ${startLine}
                        <label>Hedef Bitiş</label>
                        <span class="pp-fig-xl-value">${formatDateLong(forecast.target_completion_date)}</span>
                    </div>
                    <div class="pp-fig-xl pp-fig-xl-primary">
                        <label>Öngörülen Bitiş</label>
                        <span class="pp-fig-xl-value ${projectedClass}">${formatDateLong(forecast.projected_completion_date)}</span>
                    </div>
                    <div class="pp-fig-xl">
                        <label>Sapma</label>
                        ${varianceFigure.replace(/pp-fig-value/g, 'pp-fig-xl-value')}
                    </div>
                </div>`}
                <div class="pp-hero-progress">
                    <span class="pp-hero-progress-label">İlerleme</span>
                    <div class="pp-hero-progress-bar">
                        <div class="pp-hero-progress-fill pp-pf-${meta.theme}" style="width: ${Math.min(pct, 100)}%"></div>
                    </div>
                    <span class="pp-hero-progress-pct">%${pct}</span>
                </div>
            </div>
        </div>`;
}

// Content caps shrink one step on short screens (laptop 768p) so every panel
// stays inside its clipped cell. Welding is deliberately NOT here: its
// resource list scrolls instead (.pp-scroll). A row cap made the same slide
// show different welders to different people — whoever sat at a 768p laptop,
// or ran browser/display zoom, silently lost the tail of the list.
function meetingCaps() {
    const short = window.matchMedia('(max-height: 860px)').matches;
    return { files: short ? 3 : 4, ncrs: 3 };
}

function ensureBrief(jobNo) {
    // A navigation can land on a slide whose brief is already in flight from
    // neighbour prefetching — the caller must get THAT promise (resolving when
    // the data arrives), not an immediately-resolved void. Returning early
    // here was exactly the "response arrived but the page never rendered" bug.
    if (meetingBriefCache.has(jobNo)) {
        return Promise.resolve(meetingBriefCache.get(jobNo));
    }
    if (meetingBriefPromises.has(jobNo)) {
        return meetingBriefPromises.get(jobNo);
    }
    const promise = getJobOrderMeetingBrief(jobNo)
        .then((brief) => {
            meetingBriefCache.set(jobNo, brief);
            return brief;
        })
        .catch((error) => {
            console.error(`Meeting brief failed for ${jobNo}:`, error);
            const item = meetingItems[meetingIndex];
            if (currentMode === 'meeting' && item && item.job_no === jobNo) {
                const panels = document.getElementById('pp-meeting-panels');
                if (panels) {
                    panels.innerHTML = `
                        <div class="dashboard-card pp-panel pp-area-welding">
                            <div class="card-body text-center text-danger py-4">
                                <i class="fas fa-exclamation-triangle me-2"></i>Toplantı özeti yüklenemedi.
                            </div>
                        </div>`;
                }
            }
            return null;
        })
        .finally(() => meetingBriefPromises.delete(jobNo));
    meetingBriefPromises.set(jobNo, promise);
    return promise;
}

function meetingSkeletonHtml() {
    return ['pp-area-welding', 'pp-area-machining', 'pp-area-cutting',
            'pp-area-quality', 'pp-area-procurement', 'pp-area-revisions',
            'pp-area-files']
        .map(area => `
        <div class="dashboard-card pp-panel ${area}">
            <div class="card-body">
                <div class="pp-skeleton pp-skeleton-title"></div>
                <div class="pp-skeleton pp-skeleton-big"></div>
                <div class="pp-skeleton"></div>
                <div class="pp-skeleton pp-skeleton-short"></div>
            </div>
        </div>`).join('');
}

function panelHtml(icon, title, bodyHtml, extraClass = '', modalKind = null) {
    const linkAttrs = modalKind
        ? ` data-modal="${modalKind}" role="button" title="Detayı aç"` : '';
    const linkHint = modalKind
        ? '<span class="pp-link-hint"><i class="fas fa-expand"></i></span>' : '';
    return `
        <div class="dashboard-card pp-panel${extraClass ? ' ' + extraClass : ''}"${linkAttrs}>
            <div class="card-body">
                <div class="pp-panel-title"><i class="fas fa-${icon} me-2"></i>${title}${linkHint}</div>
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
    const panels = document.getElementById('pp-meeting-panels');
    if (!panels) return;
    // Two full-width rows (placement via pp-area-* grid areas); the finans
    // medallion floats over the center seam as an absolutely-positioned
    // badge, clipping the neighbouring panels.
    panels.innerHTML = [
        weldingPanelHtml(brief.welding),
        machiningPanelHtml(brief.machining, item.job_no),
        cuttingPanelHtml(brief.cutting),
        qualityPanelHtml(brief.quality, item.job_no),
        procurementPanelHtml(brief.procurement),
        revisionsPanelHtml(brief.revisions, item.job_no),
        filesPanelHtml(brief.files, item.job_no),
        financialBadgeHtml(brief.financial),
    ].join('');
}

const NCR_SEVERITY_BADGES = { critical: 'status-red', major: 'status-orange', minor: 'status-grey' };

function qualityPanelHtml(quality, jobNo) {
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
        return panelHtml('clipboard-check', 'Kalite · NCR', body, 'pp-area-quality', 'quality');
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
                ${open > shown.length ? `<span class="text-muted">+${fmtInt(open - shown.length)} daha</span>` : ''}
            </span>
        </div>
        ${list}`;
    // The ONLY panel with a colored top strip — quality problems must pop.
    return panelHtml('clipboard-check', 'Kalite · NCR', body, 'pp-area-quality pp-panel-alert', 'quality');
}

function revisionsPanelHtml(revisions, jobNo) {
    if (!revisions) return '';
    const drawing = revisions.drawing || {};
    const targets = revisions.design_targets || {};
    const latest = drawing.latest;
    const missing = (targets.total || 0) - (targets.with_target || 0);
    const hasWindow = targets.earliest && targets.latest && targets.earliest !== targets.latest;
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
                    <span class="pp-panel-big">${targets.latest ? fmtShortDate(targets.latest) : '—'}</span>
                </div>
                ${hasWindow ? `<div class="pp-panel-sub">En erken: ${fmtShortDate(targets.earliest)}</div>` : ''}
                <div class="pp-panel-sub ${missing ? 'pp-num-orange' : 'text-muted'}">${fmtInt(targets.with_target)}/${fmtInt(targets.total)} dizayn görevinde tarih</div>
            </div>
        </div>`;
    return panelHtml('pen-ruler', 'Dizayn', body, 'pp-area-revisions', 'revisions');
}

function procurementPanelHtml(procurement) {
    if (!procurement) return '';
    const waiting = procurement.items_waiting || 0;
    const total = procurement.items_total || 0;
    // Stage-weighted progress (same basis as the procurement task's own %:
    // miktar x birim ağırlık, boru/profil boost, PO aşamaları) — NOT the
    // item-count ratio, which over-credits small delivered fittings.
    const pct = procurement.progress_pct;
    const body = `
        <div class="pp-panel-hero">
            <span class="pp-panel-big ${waiting ? 'pp-num-orange' : 'pp-num-green'}">${fmtInt(waiting)}<span class="pp-panel-big-dim">/${fmtInt(total)}</span></span>
            <span class="pp-panel-big-label">bekleyen kalem</span>
        </div>
        <div class="pp-panel-sub"><strong class="pp-num-green">%${pct !== null && pct !== undefined ? pct.toLocaleString('tr-TR', { maximumFractionDigits: 1 }) : 0}</strong> tedarik ilerlemesi
            ${miniBarHtml((pct || 0) / 100, 'green')}</div>
        <div class="pp-panel-sub">Talebe dönüşmedi: <strong>${fmtInt(procurement.not_yet_requested)}</strong></div>
        <div class="pp-panel-sub">Talepte · teslim bekliyor: <strong>${fmtInt(procurement.requested_waiting)}</strong></div>
        <div class="pp-panel-sub">Teslim edildi: <strong>${fmtInt(procurement.items_delivered)}</strong> / ${fmtInt(total)} kalem</div>
        ${pullsLine(procurement.material_pulls)}
        ${procurement.critical_waiting ? `<div class="pp-panel-sub"><span class="pp-num-red">Kritik bekleyen: <strong>${fmtInt(procurement.critical_waiting)}</strong> — imalatı tutuyor</span></div>` : ''}`;
    return panelHtml('cart-shopping', 'Satın Alma', body, 'pp-area-procurement', 'procurement');
}

// Warehouse pull requests — material handed out of the warehouse to a
// subcontractor or internal team. Absent on cached/older briefs.
function pullsLine(pulls) {
    if (!pulls || !(pulls.items_pulled > 0)) return '';
    const pendingPart = pulls.pending > 0
        ? ` · <span class="pp-num-orange"><strong>${fmtInt(pulls.pending)}</strong> talep bekliyor</span>`
        : '';
    return `<div class="pp-panel-sub"><i class="fas fa-dolly me-1"></i>Depodan çekilen: <strong>${fmtInt(pulls.items_pulled)}</strong> kalem${pendingPart}</div>`;
}

function cuttingPanelHtml(cutting) {
    if (!cutting) return '';
    const waiting = cutting.parts_waiting || 0;
    const materialWaiting = cutting.parts_waiting_material || 0;
    const body = `
        <div class="pp-panel-hero">
            <span class="pp-panel-big ${waiting ? 'pp-num-orange' : 'pp-num-green'}">${fmtInt(waiting)}</span>
            <span class="pp-panel-big-label">parça kesim bekliyor</span>
            <span class="pp-panel-sub text-muted">${fmtInt(cutting.weight_waiting)} kg</span>
        </div>
        <div class="pp-panel-sub">Kesilen: <strong>${fmtInt(cutting.parts_cut)}</strong> / ${fmtInt(cutting.parts_total)} parça · ${fmtInt(cutting.weight_cut)} / ${fmtInt(cutting.weight_total)} kg</div>
        ${materialWaiting ? `<div class="pp-panel-sub"><span class="pp-num-orange"><strong>${fmtInt(materialWaiting)} parça · ${fmtInt(cutting.weight_waiting_material)} kg</strong> malzeme bekliyor (satın alma)</span></div>` : ''}
        ${miniBarHtml(cutting.weight_total ? cutting.weight_cut / cutting.weight_total : 0, 'blue')}`;
    return panelHtml('scissors', 'CNC Kesim', body, 'pp-area-cutting', 'cutting');
}

function machiningPanelHtml(machining, jobNo) {
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
    return panelHtml('gears', 'Talaşlı İmalat', body, 'pp-area-machining', 'machining');
}

function weldingPanelHtml(welding) {
    if (!welding) return '';
    const resources = welding.resources || [];
    const rows = resources.map((r) => {
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
    const countNote = resources.length
        ? `<span class="pp-panel-sub text-muted">${fmtInt(resources.length)} kaynak</span>` : '';

    const hours = welding.hours || {};
    const hourParts = [];
    if (hours.regular) hourParts.push(`İşçilik <strong>${fmtHours(hours.regular)} s</strong>`);
    if (hours.after_hours) hourParts.push(`Fazla mesai <strong>${fmtHours(hours.after_hours)} s</strong>`);
    if (hours.holiday) hourParts.push(`Tatil <strong>${fmtHours(hours.holiday)} s</strong>`);
    const hoursStrip = hourParts.length
        ? `<div class="pp-hours-strip"><i class="fas fa-user-clock me-1"></i>${hourParts.join('<span class="pp-meta-sep"> · </span>')}</div>`
        : '';

    // Manufacturing material wait — same "the delay belongs to procurement"
    // signal the Kesim panel shows for plates, here for pipes/profiles and
    // hand-marked critical items.
    const wait = welding.material_wait || {};
    const waitParts = [];
    if (wait.pipe_profile_items_pending) waitParts.push(`${fmtInt(wait.pipe_profile_items_pending)} boru/profil kalemi`);
    if (wait.critical_items_pending) waitParts.push(`${fmtInt(wait.critical_items_pending)} kritik kalem`);
    const waitLine = waitParts.length
        ? `<div class="pp-panel-sub"><span class="pp-num-orange"><strong>${waitParts.join(' · ')}</strong> malzeme bekliyor (satın alma)</span></div>`
        : '';

    const body = `
        <div class="pp-panel-hero">
            <span class="pp-panel-big">${big === null || big === undefined ? '—' : `%${fmtInt(big)}`}</span>
            <span class="pp-panel-big-label">${bigLabel}</span>
            ${kgNote}${countNote}
        </div>
        <div class="pp-scroll pp-res-scroll">${rows || (usingTaskProgress || big === null
            ? '<div class="text-muted pp-empty">Kaynak ataması yok.</div>' : '')}</div>
        <div class="pp-welding-foot">${waitLine}${hoursStrip}</div>`;
    return panelHtml('fire', 'Kaynaklı İmalat', body, 'pp-area-welding', 'welding');
}

const FILE_GROUP_LABELS = [
    ['job_order', 'İş Emri'],
    ['task', 'Görev'],
    ['discussion', 'Tartışma'],
];

function filesPanelHtml(files, jobNo) {
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
    return panelHtml('folder-open', 'Dosyalar', body, 'pp-area-files');
}

// Parents whose progress is carried by their children are hidden — the
// children rows represent them (renamed "Parent - Child").
function visibleOf(tasks) {
    const parentIds = new Set();
    for (const t of tasks) {
        if (t.parent !== null) parentIds.add(t.parent);
    }
    return tasks.filter(t => !parentIds.has(t.id));
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatDateCell(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('tr-TR');
}

// Long form for the hero figures: "27 Temmuz 2026"
function formatDateLong(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatWd(value) {
    if (value === null || value === undefined) return '-';
    const abs = Math.abs(value);
    return (abs % 1 === 0 ? abs.toFixed(0) : abs.toFixed(1)).replace('.', ',');
}


// Task counts for a plan payload, the single source for both Plan Detayı and
// the Üretim Planı tab. Two rules the raw server summary does not apply:
// completed tasks WITHOUT a target date come back classification='unplanned',
// and reporting finished work as "plansız" reads as a problem — status wins;
// and cancelled/skipped tasks ('excluded') are their own bucket instead of
// silently inflating "başlamadı". Counts follow the VISIBLE rule, so a parent
// represented by its children is not counted twice.
export function summarizePlanTasks(tasks) {
    const counts = { total: 0, done: 0, lateDone: 0, late: 0, risk: 0, active: 0, waiting: 0, excluded: 0 };
    for (const task of visibleOf(tasks || [])) {
        const classification = task.schedule.classification;
        if (classification === 'excluded') { counts.excluded += 1; continue; }
        counts.total += 1;
        if (task.status === 'completed') {
            if (classification === 'completed_late') counts.lateDone += 1;
            else counts.done += 1;
        } else if (classification === 'overdue') counts.late += 1;
        else if (classification === 'at_risk') counts.risk += 1;
        else if (classification === 'in_progress') counts.active += 1;
        else counts.waiting += 1;
    }
    return counts;
}

// ---------------------------------------------------------------------------
// Shared with the job-order table (jobOrderList.js)
// ---------------------------------------------------------------------------
// The Öngörülen Bitiş column shows the same numbers as the slides, so it reads
// them through here rather than growing a second copy of the vocabulary.

// One plan per job order, shared with Plan Detayı: expanding a row and opening
// the modal for the same job must not fetch the plan twice. onCriticalToggle
// invalidates this cache, so both views pick up the new gates together.
const planFetchPromises = new Map();

export function getCachedProductionPlan(jobNo) {
    if (meetingPlanCache.has(jobNo)) return Promise.resolve(meetingPlanCache.get(jobNo));
    if (planFetchPromises.has(jobNo)) return planFetchPromises.get(jobNo);
    const promise = getJobOrderProductionPlan(jobNo)
        .then((plan) => {
            meetingPlanCache.set(jobNo, plan);
            return plan;
        })
        .finally(() => planFetchPromises.delete(jobNo));
    planFetchPromises.set(jobNo, promise);
    return promise;
}

export { CLASSIFICATION_BADGES, formatWd as formatWorkDays };

// The job-order verdict as a date + one house badge — the hero's headline
// vocabulary, condensed to a table cell.
export function verdictBadge(forecast) {
    const f = forecast || {};
    const wd = f.variance_wd;
    const late = wd !== null && wd !== undefined && wd > 0;
    const early = wd !== null && wd !== undefined && wd < 0;
    switch (f.verdict) {
        case 'on_track':
            return { badgeClass: 'status-green', label: early ? `${formatWd(wd)} iş günü erken` : 'Zamanında' };
        case 'late_risk':
            return { badgeClass: 'status-red', label: late ? `+${formatWd(wd)} iş günü geç` : 'Gecikecek' };
        case 'finished_on_time':
            return { badgeClass: 'status-green', label: 'Zamanında bitti' };
        case 'finished_late':
            return { badgeClass: 'status-red', label: late ? `+${formatWd(wd)} iş günü geç bitti` : 'Geç bitti' };
        case 'no_target':
            return { badgeClass: 'status-orange', label: 'Hedef tarih yok' };
        case 'no_data':
            return { badgeClass: 'status-grey', label: 'Veri yok' };
        default:
            return { badgeClass: 'status-grey', label: 'Öngörü yok' };
    }
}
