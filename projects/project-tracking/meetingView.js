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
    getMeetingBriefSection,
    getJobOrderPlanSheet,
    createPlanSheetShareLink
} from '../../apis/projects/jobOrders.js';
import {
    markPlanningRequestItemCritical,
    unmarkPlanningRequestItemCritical
} from '../../apis/planning/planningRequestItems.js';
import { ZOOMS } from '../../planning/project-planning/grid.js';
import { renderPlanSheet, SHEET_COLUMNS, SHEET_ZOOMS } from './planSheet.js';
import { headerSummary } from './planSheetText.js';
import { heroChainHtml } from './heroChain.js';
import { FINANCIAL_META, FILE_GROUP_LABELS, renderTilesHtml, tilesSkeletonHtml } from './meetingTiles.js';

// Portfolio backing the slide deck. The status/sort controls belonged to the
// retired portfolio page, so the deck is the default view: active projects,
// natural job-no order.
let overviewData = null;                // last fetched overview payload
let overviewFetchedAt = 0;              // Date.now() of that fetch
let overviewError = null;               // last overview failure (null once one succeeds)
const overviewStatus = 'active';        // status the overview was fetched with
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
const meetingPlanCache = new Map();     // job_no -> production plan (job-order table)
const meetingSheetCache = new Map();    // job_no -> plan sheet payload (the slide body)
const meetingSheetPromises = new Map(); // job_no -> in-flight plan sheet fetch
const meetingSectionCache = new Map();  // `${job_no}:${section}` -> detail payload

let meetingModalOpen = false;
let meetingModalContext = null;         // {jobNo, kind} of the open modal
let meetingRefreshing = false;          // a manual "Yenile" is in flight

// Nothing is PRESENTED from a cache older than this. The deck is read while
// the numbers behind it are being edited — someone fixes a target date during
// the meeting and the slide has to show it on the way back — so every cache
// here is a paint-instantly buffer, not a source of truth: a stale entry still
// renders (never a blank slide) and its refetch swaps in over it.
const MEETING_MAX_AGE_MS = 60 * 1000;
const meetingCachedAt = new Map();      // cache key -> Date.now() of the write

function cacheStamp(key) {
    meetingCachedAt.set(key, Date.now());
}

function cacheIsStale(key) {
    const at = meetingCachedAt.get(key);
    return at === undefined || Date.now() - at > MEETING_MAX_AGE_MS;
}

// Every cached payload for one job order — brief, section details, plan,
// plan sheet — so the next read of each goes back to the server.
function dropJobCaches(jobNo) {
    meetingBriefCache.delete(jobNo);
    meetingPlanCache.delete(jobNo);
    meetingSheetCache.delete(jobNo);
    meetingCachedAt.delete(`brief:${jobNo}`);
    meetingCachedAt.delete(`plan:${jobNo}`);
    meetingCachedAt.delete(`sheet:${jobNo}`);
    [...meetingSectionCache.keys()]
        .filter(key => key.startsWith(`${jobNo}:`))
        .forEach((key) => {
            meetingSectionCache.delete(key);
            meetingCachedAt.delete(key);
        });
}

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

// The hero figures (hedef/öngörülen bitiş, sapma, ilerleme) come from the
// portfolio endpoint, which serves a ~15-minute server-side snapshot by
// default. Those figures get read out loud in a meeting, so the deck always
// asks for the recompute instead — the few extra seconds behind the spinner
// is exactly what opening Sunum Modu is for.
async function fetchOverview() {
    try {
        overviewData = await getProductionPlanOverview(overviewStatus, { refresh: true });
        overviewFetchedAt = Date.now();
        overviewError = null;
    } catch (error) {
        console.error('Overview load failed:', error);
        overviewData = null;
        overviewError = error;
        showNotification('Proje portföyü yüklenemedi', 'error');
    }
}

// Server-side computation time of the portfolio on screen, as "Veri 14:32" —
// the presenter must be able to say how old the numbers are without taking
// the deck's word for it. Falls back to our own fetch time if the payload
// carries no stamp.
function overviewStampText() {
    const raw = overviewData && overviewData.generated_at;
    const at = raw ? new Date(raw) : (overviewFetchedAt ? new Date(overviewFetchedAt) : null);
    if (!at || isNaN(at.getTime())) return '';
    return `Veri ${at.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
}

// The portfolio rows out of an overview payload. The endpoint answers with
// `{items: [...]}`, but a DRF-paginated (`{count, results}`) or bare-array
// response has to land on the same slides — reading only `items` turns any
// other shape into "Sunulacak proje bulunamadı" with nothing to diagnose.
function overviewItems(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload?.results)) return payload.results;
    return [];
}

// Current portfolio items in slide order.
function sortedPortfolioItems() {
    if (!overviewData) return [];
    const items = [...overviewItems(overviewData)];
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
    // Every entry into the deck re-pulls the portfolio: the previous one may
    // be from before lunch. Only a return within the freshness window reuses
    // it, so Back/Forward through the slides cannot cost a recompute per
    // keypress. The fetch is multi-second, so the deck opens on a spinner
    // rather than leaving the presenter staring at the job-order table.
    if (!overviewData || Date.now() - overviewFetchedAt > MEETING_MAX_AGE_MS) {
        if (container) container.innerHTML = meetingLoadingHtml();
        await fetchOverview();
        if (currentMode !== 'meeting') return;
    }
    // A failed portfolio call is not an empty portfolio: saying "Sunulacak
    // proje bulunamadı" over a 500 or a dropped connection sends the presenter
    // looking for missing projects instead of a broken request.
    if (overviewError) {
        if (container) container.innerHTML = meetingErrorHtml(overviewError);
        return;
    }
    meetingItems = sortedPortfolioItems();
    if (!meetingItems.length) {
        if (container) container.innerHTML = meetingEmptyHtml();
        return;
    }
    const index = jobNo ? meetingItems.findIndex(i => i.job_no === jobNo) : 0;
    meetingIndex = index >= 0 ? index : 0;
    renderMeetingSlide();
}

function meetingEmptyHtml() {
    return `
        <div class="pp-slide-empty">
            <i class="fas fa-folder-open fa-2x mb-3"></i>
            <p>Sunulacak proje bulunamadı.</p>
            <p class="small">Sunum modu yalnızca aktif iş emirlerini listeler.</p>
            <button type="button" class="btn btn-outline-secondary" data-action="exit">
                <i class="fas fa-xmark me-1"></i>Çık
            </button>
        </div>`;
}

// Shown when the portfolio request itself failed — a distinct message with a
// retry, rather than the empty state. The error is already on the console
// (fetchOverview + the API helper both log it); its text goes on screen too so
// a report can say WHAT failed.
function meetingErrorHtml(error) {
    const detail = error && error.message ? error.message : '';
    return `
        <div class="pp-slide-empty">
            <i class="fas fa-triangle-exclamation fa-2x mb-3"></i>
            <p>Proje portföyü yüklenemedi.</p>
            ${detail ? `<p class="small">${escapeHtml(detail)}</p>` : ''}
            <div class="d-flex gap-2">
                <button type="button" class="btn btn-outline-primary" data-action="retry">
                    <i class="fas fa-rotate me-1"></i>Tekrar Dene
                </button>
                <button type="button" class="btn btn-outline-secondary" data-action="exit">
                    <i class="fas fa-xmark me-1"></i>Çık
                </button>
            </div>
        </div>`;
}

// "Tekrar Dene" on the error state: drop the failed attempt so enterMeeting
// re-fetches instead of reusing it, and land on the first slide.
function retryOverview() {
    overviewData = null;
    overviewFetchedAt = 0;
    overviewError = null;
    enterMeeting(null);
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
                else if (action === 'refresh') refreshCurrentSlide(control);
                else if (action === 'retry') retryOverview();
                else if (action === 'exit') exitMeeting();
                else if (action === 'sheet-share') openSheetShareDialog();
                return;
            }
            // A press on a scroll list's scrollbar (thumb or track) targets
            // the container itself, past its content box — that is scrolling,
            // not a drill-down request.
            if (e.target.classList.contains('pp-scroll')
                && e.offsetX > e.target.clientWidth) return;
            // Sheet zoom (Gün / Hafta / Ay): the grid re-renders in place.
            const zoomBtn = e.target.closest('[data-zoom]');
            if (zoomBtn) { setSheetZoom(zoomBtn.dataset.zoom); return; }
            // Clicks inside the sheet belong to the grid (group toggles).
            if (e.target.closest('.pp-sheet-body')) return;
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
        // Someone fixes the data while the slide is up; R brings it back
        // without leaving the deck.
        else if (e.key === 'r' || e.key === 'R') {
            e.preventDefault();
            refreshCurrentSlide(document.querySelector('.pp-strip [data-action="refresh"]'));
        }
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
        // The plan sheet scrolls (and Ctrl+wheel zooms) on its own whenever
        // it has more rows or more timeline than fits.
        const sheet = e.target?.closest?.('.pg-scroll');
        if (sheet && (e.ctrlKey || sheet.scrollHeight > sheet.clientHeight
            || sheet.scrollWidth > sheet.clientWidth)) return;
        const delta = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
        if (Math.abs(delta) < 30) return;
        const now = Date.now();
        if (now - meetingWheelAt < 600) return;
        meetingWheelAt = now;
        meetingStep(delta > 0 ? 1 : -1);
    }, { passive: true });
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
        const sheetBtn = e.target.closest('[data-sheet-action]');
        if (sheetBtn) { onSheetDialogAction(sheetBtn); return; }
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
    host.querySelector('.pp-modal').classList.toggle(
        'pp-modal-sheet-pdf', !!context && context.kind === 'sheet-pdf');
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
    if (!modal || !context || context.kind === 'sheet-pdf') return;
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
    files: 'Dosyalar',
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
    const brief = meetingBriefCache.get(item.job_no);
    if (!brief) return;

    // Welding and files render straight from the brief (their tiles already
    // hold the data); everything else fetches its detail on demand.
    if (kind === 'welding' || kind === 'files') {
        const built = kind === 'welding' ? weldingModalHtml(brief) : filesModalHtml(brief);
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
    let detail = cacheIsStale(cacheKey) ? null : meetingSectionCache.get(cacheKey);
    if (!detail) {
        try {
            detail = await getMeetingBriefSection(item.job_no, kind);
            meetingSectionCache.set(cacheKey, detail);
            cacheStamp(cacheKey);
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
    const rows = operations.map((op) => {
        // A part shared with other job orders: show this job's share and
        // its allocated quantity next to the part name (hours are already scaled).
        const share = Number(op.share);
        const isShared = Number.isFinite(share) && share > 0 && share < 1;
        const shareHtml = isShared
            ? ` <span class="text-muted" title="Bu iş emrine düşen pay">×${share.toFixed(2)}</span>`
                + (op.allocated_quantity !== null && op.allocated_quantity !== undefined
                    ? ` <span class="text-muted">(${fmtInt(op.allocated_quantity)} adet)</span>`
                    : '')
            : '';
        return `
        <tr>
            <td class="pp-td-main" title="${escapeHtml(op.name || op.key)}">${escapeHtml(op.name || op.key)}</td>
            <td class="pp-td-muted" title="${escapeHtml(op.part_name || '')}">${escapeHtml(op.part_name || '—')}${shareHtml}</td>
            <td>${escapeHtml(op.job_no || '')}</td>
            <td class="pp-td-num">${fmtHours(op.estimated_hours)} s</td>
            <td class="pp-td-num">${fmtHours(op.hours_spent)} s</td>
            <td>${op.completed
                ? '<span class="status-badge status-green">Tamam</span>'
                : '<span class="status-badge status-blue">Açık</span>'}</td>
        </tr>`;
    });
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
            meetingCachedAt.delete(`plan:${jobNo}`);
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

// "Yenile" (and the R key): everything on screen comes back from the server —
// the portfolio is recomputed and this slide's brief, section details and plan
// are dropped. The slide stays on its job order across the refetch, because a
// recomputed portfolio can reorder rows or lose one (a project completed
// between two passes) under the index we were sitting on.
async function refreshCurrentSlide(btn) {
    const item = meetingItems[meetingIndex];
    if (!item || meetingRefreshing) return;
    const jobNo = item.job_no;
    meetingRefreshing = true;
    const original = btn ? btn.innerHTML : null;
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
    }
    try {
        dropJobCaches(jobNo);
        await fetchOverview();
        if (currentMode !== 'meeting') return;
        if (overviewData) {
            meetingItems = sortedPortfolioItems();
            const found = meetingItems.findIndex(i => i.job_no === jobNo);
            meetingIndex = found >= 0
                ? found
                : Math.max(0, Math.min(meetingIndex, meetingItems.length - 1));
        }
        if (!meetingItems.length) {
            const container = document.getElementById('pp-meeting-container');
            if (container) container.innerHTML = meetingEmptyHtml();
            return;
        }
        // The brief refetch is the settle timer's job (renderMeetingSlide
        // schedules it); dropJobCaches above guarantees it goes to the server.
        renderMeetingSlide();
    } finally {
        meetingRefreshing = false;
        // The strip this button lives in was replaced by the render above, so
        // restoring it only matters on the paths that did not re-render.
        if (btn && original !== null && btn.isConnected) {
            btn.disabled = false;
            btn.innerHTML = original;
        }
    }
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
    const sheet = meetingSheetCache.get(item.job_no);
    sheetGrid = null;
    container.innerHTML =
        meetingStripHtml(item) +
        meetingHeroHtml(item, sheet) +
        `<div id="pp-meeting-tiles" class="pp-tiles">${brief ? renderTilesHtml(brief) : tilesSkeletonHtml()}</div>` +
        `<div id="pp-meeting-sheet" class="pp-sheet">${sheet ? '' : sheetSkeletonHtml()}</div>`;
    if (sheet) renderSheet(item, sheet);

    // Fetching waits until the user SETTLES on a slide — flipping through ten
    // slides must not fire ten briefs plus twenty prefetches. Cached slides
    // render instantly above regardless.
    clearTimeout(meetingFetchTimer);
    clearTimeout(meetingPrefetchTimer);
    meetingFetchTimer = setTimeout(() => {
        const current = meetingItems[meetingIndex];
        if (currentMode !== 'meeting' || !current) return;
        // Stale-while-revalidate: a cached brief has already painted above,
        // but one older than the freshness window is refetched and swapped in
        // place — a meeting must not read out numbers from earlier in itself.
        if (cacheIsStale(`brief:${current.job_no}`)) {
            ensureBrief(current.job_no).then((loaded) => {
                const still = meetingItems[meetingIndex];
                if (currentMode === 'meeting' && loaded && still && still.job_no === current.job_no) {
                    renderTiles(loaded);
                }
            });
        }
        if (cacheIsStale(`sheet:${current.job_no}`)) {
            ensureSheet(current.job_no).then((loaded) => {
                const still = meetingItems[meetingIndex];
                if (currentMode === 'meeting' && loaded && still && still.job_no === current.job_no) {
                    renderSheet(still, loaded);
                }
            });
        }
        // Warm the neighbours so prev/next feels instant — but only once the
        // user has clearly parked on this slide.
        meetingPrefetchTimer = setTimeout(() => {
            if (currentMode !== 'meeting') return;
            [meetingIndex - 1, meetingIndex + 1].forEach((i) => {
                if (!meetingItems[i]) return;
                ensureBrief(meetingItems[i].job_no);
                ensureSheet(meetingItems[i].job_no);
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
                <span class="pp-strip-stamp d-none d-xl-inline"
                      title="Portföy verisinin sunucuda hesaplandığı an">${escapeHtml(overviewStampText())}</span>
                <button type="button" class="btn btn-sm pp-strip-btn" data-action="refresh"
                        title="Bu slaydın verisini sunucudan yeniden çek (R)">
                    <i class="fas fa-rotate me-1"></i>Yenile
                </button>
                <button type="button" class="btn btn-sm pp-strip-btn" data-action="exit">
                    <i class="fas fa-xmark me-1"></i>Çık
                </button>
            </div>
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

// ---------------------------------------------------------------------------
// The slide body: hero (plan vs termin), section tiles, the plan sheet
// ---------------------------------------------------------------------------

// Zoom and collapsed groups persist across slides: the presenter sets the
// sheet once and every job order reads the same way.
const sheetState = { zoom: 'week', collapsed: new Set(), gridWidth: null };
let sheetGrid = null;

function setSheetZoom(zoom) {
    if (!SHEET_ZOOMS.includes(zoom)) return;
    sheetState.zoom = zoom;
    if (sheetGrid) sheetGrid.setZoom(zoom);
    document.querySelectorAll('.pp-sheet-zoom [data-zoom]').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.zoom === zoom);
    });
}

// The hero: job no and title on the left; on the right the date chain —
// Başlangıç (when the order was opened), Termin (the commitment), Plan
// bitişi (the plan entered on the planning board) and Öngörülen (the plan
// plus today's deviations) in one fixed row, each working-day distance
// written once on the connector between the two dates it compares and the
// termin total on a bracket above (heroChain.js). The theme is the plan
// verdict (red = behind the plan, orange = on plan but past the termin,
// green = inside both).
function meetingHeroHtml(item, sheet) {
    const statusChip = item.status === 'on_hold' && item.hold_kind === 'revision'
        ? '<span class="status-badge status-orange">Revizyonda</span>'
        : (item.status && item.status !== 'active'
            ? `<span class="status-badge status-grey">${escapeHtml(item.status_display || item.status)}</span>`
            : '');
    const theme = sheet ? headerSummary(sheet).theme : 'grey';
    const jobOrder = (sheet && sheet.job_order) || {};
    const created = jobOrder.created_at || item.created_date || null;
    // Before the sheet arrives the portfolio row already knows the termin;
    // the rest of the chain shows "…" until the numbers are in.
    const chain = sheet
        ? heroChainHtml({
            start: created,
            termin: sheet.termin,
            planEnd: sheet.plan_end,
            projectedEnd: sheet.projected_end,
            planVsTerminWd: sheet.plan_vs_termin_wd,
            deviationWd: sheet.deviation_wd,
            terminGapWd: sheet.termin_gap_wd,
        })
        : heroChainHtml({
            start: created,
            termin: (item.forecast && item.forecast.target_completion_date) || null,
            pending: true,
        });
    const pct = Math.round(item.completion_percentage || 0);
    return `
        <div id="pp-meeting-hero" class="pp-hero-ps ps-theme-${theme}">
            <div class="ps-hero-id">
                <div class="ps-hero-jobno">${escapeHtml(item.job_no)}${statusChip}</div>
                <div class="ps-hero-title" title="${escapeHtml(item.title || '')}">${escapeHtml(item.title || '')}</div>
                ${item.customer_name ? `<div class="ps-hero-customer">${escapeHtml(item.customer_name)}</div>` : ''}
            </div>
            ${chain}
            <div class="ps-hero-progress">
                <span>İlerleme</span>
                <div class="ps-hero-progress-bar"><div class="ps-hero-progress-fill" style="width: ${Math.min(pct, 100)}%"></div></div>
                <span class="ps-hero-progress-pct">%${pct}</span>
            </div>
        </div>`;
}

function renderTiles(brief) {
    const host = document.getElementById('pp-meeting-tiles');
    if (host) host.innerHTML = renderTilesHtml(brief);
}

function sheetSkeletonHtml() {
    return `
        <div class="pp-sheet-skeleton">
            <div class="pp-skeleton pp-skeleton-title"></div>
            <div class="pp-skeleton"></div>
            <div class="pp-skeleton pp-skeleton-short"></div>
            <div class="pp-skeleton"></div>
            <div class="pp-skeleton pp-skeleton-short"></div>
        </div>`;
}

// Sheet header: what the summary counted, the legend, the zoom.
function sheetHeadHtml(sheet) {
    const s = sheet.summary || {};
    const chips = [];
    if (s.late_rows) chips.push(`<span class="ps-chip ps-chip-late">${s.late_rows} görev planın gerisinde</span>`);
    if (s.own_late_rows) chips.push(`<span class="ps-chip ps-chip-late" title="Kendi kaybı olan görevler">${s.own_late_rows} kendi</span>`);
    if (s.chain_only_rows) chips.push(`<span class="ps-chip ps-chip-chain" title="Yalnızca önceki görev geç bitirdiği için geride">${s.chain_only_rows} zincir</span>`);
    if (s.default_duration_rows) chips.push(`<span class="ps-chip ps-chip-muted" title="Süre girilmemiş, departman varsayılanı kullanıldı">${s.default_duration_rows} varsayılan süre</span>`);
    if (!chips.length && s.rows) chips.push('<span class="ps-chip ps-chip-ok">tüm görevler planında</span>');
    const zoom = SHEET_ZOOMS.map(z => `
        <button type="button" class="btn btn-outline-secondary${sheetState.zoom === z ? ' active' : ''}"
                data-zoom="${z}">${ZOOMS[z].label}</button>`).join('');
    return `
        <div class="pp-sheet-head">
            <span class="pp-sheet-title"><i class="fas fa-table-list"></i>Plan ve sapmalar</span>
            <span class="pp-sheet-chips">${chips.join('')}</span>
            <span class="pp-sheet-legend">
                <span><i class="lg-ontime"></i>plan</span>
                <span><i class="lg-late"></i>geride</span>
                <span><i class="lg-ext"></i>öngörülen uzama</span>
                <span><i class="lg-termin"></i>termin</span>
                <span><i class="lg-today"></i>bugün</span>
            </span>
            <span class="pp-sheet-zoom btn-group">${zoom}</span>
            <button type="button" class="btn btn-outline-secondary pp-sheet-pdf-btn" data-action="sheet-share"
                    title="Sütunları seçerek yazdırın (PDF) ya da müşteri için geçici bağlantı oluşturun">
                <i class="fas fa-file-export me-1"></i>PDF / Bağlantı
            </button>
        </div>`;
}

function renderSheet(item, sheet) {
    const hero = document.getElementById('pp-meeting-hero');
    if (hero) hero.outerHTML = meetingHeroHtml(item, sheet);
    const host = document.getElementById('pp-meeting-sheet');
    if (!host) return;
    if (!sheet.rows || !sheet.rows.length) {
        host.innerHTML = sheetHeadHtml(sheet)
            + '<div class="pp-sheet-empty">Bu iş emrinde departman görevi yok.</div>';
        sheetGrid = null;
        return;
    }
    host.innerHTML = sheetHeadHtml(sheet)
        + '<div class="pp-sheet-body"><div id="pp-sheet-grid" class="pg"></div></div>';
    sheetGrid = renderPlanSheet('pp-sheet-grid', sheet, sheetState);
}

// ---------------------------------------------------------------------------
// Plan ve Sapmalar on its own page (projects/plan-sheet/): print it — the
// browser's print gives a vector PDF laid out for A4 landscape — or hand the
// customer a temporary, login-free link. The dialog picks the columns and
// the rows for both.
// ---------------------------------------------------------------------------

// Last choice per viewer — a convenience, never state.
const SHEET_SHARE_KEY = 'pp.sheetShare';

function sheetShareDefaults() {
    try {
        const stored = JSON.parse(localStorage.getItem(SHEET_SHARE_KEY) || 'null');
        if (stored && typeof stored === 'object') return stored;
    } catch (error) {
        // no stored preference
    }
    return { fields: null, expandAll: true, mainOnly: false, days: 7 };
}

function sheetPageUrl(item, prefs, print) {
    const params = new URLSearchParams();
    params.set('job_no', item.job_no);
    if (prefs.fields && prefs.fields.length) params.set('cols', prefs.fields.join(','));
    if (prefs.mainOnly) params.set('main', '1');
    if (!prefs.expandAll && sheetState.collapsed.size) params.set('collapsed', [...sheetState.collapsed].join(','));
    params.set('zoom', sheetState.zoom);
    if (print) params.set('print', '1');
    return `${window.location.origin}/projects/plan-sheet/?${params.toString()}`;
}

function sheetShareUrl(token) {
    return `${window.location.origin}/projects/plan-sheet/?share=${encodeURIComponent(token)}`;
}

function openSheetShareDialog() {
    const item = meetingItems[meetingIndex];
    const sheet = item && meetingSheetCache.get(item.job_no);
    if (!item || !sheet || !sheetGrid) {
        showNotification('Plan henüz yüklenmedi.', 'info');
        return;
    }
    const prefs = sheetShareDefaults();
    const chosen = new Set(prefs.fields || SHEET_COLUMNS.map(c => c.field));
    const boxes = SHEET_COLUMNS.map((col) => {
        const locked = col.field === 'title';
        const checked = locked || chosen.has(col.field);
        return `
            <label class="pp-sheetpdf-col${locked ? ' is-locked' : ''}">
                <input type="checkbox" data-col="${col.field}" ${checked ? 'checked' : ''} ${locked ? 'disabled' : ''}>
                <span>${escapeHtml(col.label)}</span>
                ${locked ? '<small>her zaman</small>' : ''}
            </label>`;
    }).join('');
    const dayOptions = [3, 7, 14, 30].map(d =>
        `<option value="${d}"${Number(prefs.days) === d ? ' selected' : ''}>${d} gün</option>`).join('');
    const body = `
        <div class="pp-sheetpdf">
            <p class="pp-sheetpdf-hint">Sütunları seçin; Görev sütunu ve zaman çizelgesi her zaman yer alır.
                Sayfa yalnızca bu tabloyu gösterir: yazdırıp PDF olarak kaydedebilir ya da müşteriye giriş
                gerektirmeyen geçici bir bağlantı verebilirsiniz.</p>
            <div class="pp-sheetpdf-cols">${boxes}</div>
            <label class="pp-sheetpdf-opt">
                <input type="checkbox" data-opt="expand" ${prefs.expandAll !== false ? 'checked' : ''}>
                <span>Katlanmış iş emirlerini de açık göster</span>
            </label>
            <label class="pp-sheetpdf-opt pp-sheetpdf-opt-tight">
                <input type="checkbox" data-opt="main" ${prefs.mainOnly ? 'checked' : ''}>
                <span>Yalnızca departman görevleri (alt satırlar, ekip ve taşeron adları gizli)</span>
            </label>
            <div class="pp-sheetpdf-row">
                <label for="pp-share-days">Bağlantının geçerlilik süresi</label>
                <select id="pp-share-days" class="form-select form-select-sm" data-opt="days">${dayOptions}</select>
            </div>
            <div class="pp-sheetpdf-link" id="pp-share-result" hidden></div>
            <div class="pp-sheetpdf-actions">
                <button type="button" class="btn btn-outline-secondary btn-sm" data-modal-close>Kapat</button>
                <button type="button" class="btn btn-outline-danger btn-sm" data-sheet-action="print"
                        title="Yeni sekmede açılır; tarayıcının yazdırma penceresinden PDF olarak kaydedin">
                    <i class="fas fa-print me-1"></i>Yazdır / PDF
                </button>
                <button type="button" class="btn btn-danger btn-sm" data-sheet-action="share">
                    <i class="fas fa-link me-1"></i>Müşteri bağlantısı oluştur
                </button>
            </div>
        </div>`;
    openMeetingModal(
        `Plan ve Sapmalar · yazdır ya da paylaş <span class="pp-modal-job">· ${escapeHtml(item.job_no)}</span>`,
        body, { jobNo: item.job_no, kind: 'sheet-pdf' });
}

function readSheetDialog(modal) {
    const fields = [...modal.querySelectorAll('input[data-col]:checked')].map(el => el.dataset.col);
    const expandAll = !!modal.querySelector('input[data-opt="expand"]:checked');
    const mainOnly = !!modal.querySelector('input[data-opt="main"]:checked');
    const daysEl = modal.querySelector('select[data-opt="days"]');
    const days = Number(daysEl ? daysEl.value : 7) || 7;
    const prefs = { fields, expandAll, mainOnly, days };
    try {
        localStorage.setItem(SHEET_SHARE_KEY, JSON.stringify(prefs));
    } catch (error) {
        // storage blocked: the choice still applies to this run
    }
    return prefs;
}

async function onSheetDialogAction(btn) {
    const action = btn.dataset.sheetAction;
    const item = meetingItems[meetingIndex];
    const modal = document.getElementById('pp-meeting-modal');
    if (!item || !modal) return;
    if (action === 'copy') {
        const input = modal.querySelector('#pp-share-url');
        if (!input) return;
        try {
            await navigator.clipboard.writeText(input.value);
            showNotification('Bağlantı kopyalandı.', 'success');
        } catch (error) {
            input.select();
            showNotification('Kopyalanamadı; bağlantıyı elle kopyalayın.', 'warning');
        }
        return;
    }
    const prefs = readSheetDialog(modal);
    if (action === 'print') {
        window.open(sheetPageUrl(item, prefs, true), '_blank', 'noopener');
        return;
    }
    if (action !== 'share') return;
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Oluşturuluyor';
    try {
        const link = await createPlanSheetShareLink(item.job_no, {
            columns: prefs.fields,
            expires_in_days: prefs.days,
            options: {
                expand_all: prefs.expandAll,
                main_only: prefs.mainOnly,
                collapsed: prefs.expandAll ? [] : [...sheetState.collapsed],
            },
        });
        const url = sheetShareUrl(link.token);
        const until = new Date(link.expires_at).toLocaleDateString('tr-TR');
        const box = modal.querySelector('#pp-share-result');
        if (box) {
            box.hidden = false;
            box.innerHTML = `
                <div class="pp-sheetpdf-link-head">
                    <i class="fas fa-link me-1"></i>Müşteri bağlantısı hazır: ${escapeHtml(until)} tarihine kadar geçerli, giriş gerektirmez.
                </div>
                <div class="pp-sheetpdf-link-row">
                    <input id="pp-share-url" class="form-control form-control-sm" type="text" readonly value="${escapeHtml(url)}">
                    <button type="button" class="btn btn-outline-secondary btn-sm" data-sheet-action="copy">
                        <i class="fas fa-copy me-1"></i>Kopyala
                    </button>
                    <a class="btn btn-outline-secondary btn-sm" href="${escapeHtml(url)}" target="_blank" rel="noopener">
                        <i class="fas fa-arrow-up-right-from-square me-1"></i>Aç
                    </a>
                </div>`;
        }
    } catch (error) {
        console.error('Share link failed:', error);
        showNotification(error && error.message ? error.message : 'Bağlantı oluşturulamadı.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = original;
    }
}

function ensureSheet(jobNo) {
    const key = `sheet:${jobNo}`;
    if (meetingSheetCache.has(jobNo) && !cacheIsStale(key)) {
        return Promise.resolve(meetingSheetCache.get(jobNo));
    }
    if (meetingSheetPromises.has(jobNo)) return meetingSheetPromises.get(jobNo);
    const promise = getJobOrderPlanSheet(jobNo)
        .then((sheet) => {
            meetingSheetCache.set(jobNo, sheet);
            cacheStamp(key);
            return sheet;
        })
        .catch((error) => {
            console.error(`Plan sheet failed for ${jobNo}:`, error);
            // Same rule as the brief: a failed revalidation keeps the last
            // sheet on screen; only a slide with nothing to show says so.
            if (meetingSheetCache.has(jobNo)) return meetingSheetCache.get(jobNo);
            const item = meetingItems[meetingIndex];
            if (currentMode === 'meeting' && item && item.job_no === jobNo) {
                const host = document.getElementById('pp-meeting-sheet');
                if (host) {
                    host.innerHTML = `
                        <div class="pp-sheet-error">
                            <i class="fas fa-triangle-exclamation me-2"></i>Plan yüklenemedi.
                            <button type="button" class="btn btn-sm btn-outline-secondary ms-2" data-action="refresh">Tekrar dene</button>
                        </div>`;
                }
            }
            return null;
        })
        .finally(() => meetingSheetPromises.delete(jobNo));
    meetingSheetPromises.set(jobNo, promise);
    return promise;
}

// Files: every attachment of the job order, its tasks and discussions, as
// links — rendered from the brief the tile already holds.
function filesModalHtml(brief) {
    const files = brief.files || {};
    const merged = FILE_GROUP_LABELS.flatMap(([key, label]) =>
        ((files[key] || {}).items || []).map(f => ({ ...f, source: label })));
    merged.sort((a, b) => String(b.uploaded_at || '').localeCompare(String(a.uploaded_at || '')));
    const rows = merged.map((f) => {
        const name = escapeHtml(f.name || 'dosya');
        const link = f.url
            ? `<a href="${escapeHtml(f.url)}" target="_blank" rel="noopener" title="${name}">${name}</a>`
            : `<span title="${name}">${name}</span>`;
        return `
            <tr>
                <td class="pp-td-main">${link}</td>
                <td>${escapeHtml(f.source)}${f.label ? ` · ${escapeHtml(f.label)}` : ''}</td>
                <td>${fmtShortDate(f.uploaded_at)}</td>
            </tr>`;
    });
    const stats = FILE_GROUP_LABELS.map(([key, label]) =>
        `<span>${label} <strong>${fmtInt((files[key] || {}).total)}</strong></span>`).join('');
    const body = `
        <div class="pp-modal-stats">${stats}</div>
        ${modalTableHtml(['Dosya', 'Kaynak', 'Yüklendi'], rows)}`;
    return { title: 'Dosyalar', body };
}

function ensureBrief(jobNo) {
    // A navigation can land on a slide whose brief is already in flight from
    // neighbour prefetching — the caller must get THAT promise (resolving when
    // the data arrives), not an immediately-resolved void. Returning early
    // here was exactly the "response arrived but the page never rendered" bug.
    const key = `brief:${jobNo}`;
    if (meetingBriefCache.has(jobNo) && !cacheIsStale(key)) {
        return Promise.resolve(meetingBriefCache.get(jobNo));
    }
    if (meetingBriefPromises.has(jobNo)) {
        return meetingBriefPromises.get(jobNo);
    }
    const promise = getJobOrderMeetingBrief(jobNo)
        .then((brief) => {
            meetingBriefCache.set(jobNo, brief);
            cacheStamp(key);
            return brief;
        })
        .catch((error) => {
            console.error(`Meeting brief failed for ${jobNo}:`, error);
            // A failed REVALIDATION must not wipe the slide it was refreshing:
            // last-known numbers on screen beat an error panel. Only a slide
            // with nothing to show gets one.
            if (meetingBriefCache.has(jobNo)) return meetingBriefCache.get(jobNo);
            const item = meetingItems[meetingIndex];
            if (currentMode === 'meeting' && item && item.job_no === jobNo) {
                const tiles = document.getElementById('pp-meeting-tiles');
                if (tiles) {
                    tiles.innerHTML = `
                        <div class="pp-tile pp-tile-red">
                            <div class="pp-tile-head"><i class="fas fa-triangle-exclamation"></i>Özet</div>
                            <div class="pp-tile-label text-danger">Toplantı özeti yüklenemedi.</div>
                        </div>`;
                }
            }
            return null;
        })
        .finally(() => meetingBriefPromises.delete(jobNo));
    meetingBriefPromises.set(jobNo, promise);
    return promise;
}

function miniBarHtml(ratio, theme = 'blue') {
    const pct = Math.max(0, Math.min(100, Math.round((ratio || 0) * 100)));
    return `
        <div class="pp-mini-bar"><div class="pp-mini-fill pp-mini-${theme}" style="width: ${pct}%"></div></div>`;
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

const NCR_SEVERITY_BADGES = { critical: 'status-red', major: 'status-orange', minor: 'status-grey' };

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
    const key = `plan:${jobNo}`;
    if (meetingPlanCache.has(jobNo) && !cacheIsStale(key)) {
        return Promise.resolve(meetingPlanCache.get(jobNo));
    }
    if (planFetchPromises.has(jobNo)) return planFetchPromises.get(jobNo);
    const promise = getJobOrderProductionPlan(jobNo)
        .then((plan) => {
            meetingPlanCache.set(jobNo, plan);
            cacheStamp(key);
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
