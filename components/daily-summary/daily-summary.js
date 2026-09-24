/**
 * Günlük Özet — first-open modal, banner and unread signalling.
 *
 * Mounted by the navbar on every page. Once per 30 minutes per tab it asks
 * the API for the latest ready summary. When this user has not read it (no
 * server record, no local seen key) and it is still fresh:
 *   - on the first page after login the modal opens (brief layer first);
 *   - on any other page a slim banner sits under the navbar;
 *   - either way `daily-summary:unread` fires so the Neo launcher shows a dot.
 * Only "Okudum" marks it read. X / Esc / backdrop / "Daha sonra" / the
 * banner's × snooze it: no more modal today, one more banner, then just the
 * dot. Opening a summary from the Neo pane or a deep link is deliberate, so
 * there any close still counts as read. Impersonated sessions never see it,
 * so an admin cannot mark someone else's summary read.
 *
 * Deliberately not DisplayModal: this must work before any page script runs
 * and must never depend on page-level component styles.
 */
import { isLoggedIn, isImpersonating } from '../../authService.js';
import { escapeHtml } from '../../utils/text.js';
import { getDailySummary, getLatestDailySummary, markDailySummaryRead } from '../../apis/dailySummary.js';
import {
    areaOrderFor,
    bindDailySummaryInteractions,
    currentDepartmentCode,
    currentUserId,
    daysSince,
    ensureDailySummaryStyles,
    formatSummaryDate,
    formatWindowLabel,
    getSeen,
    istanbulDate,
    relativeDayLabel,
    renderDailySummary,
    seenValue,
    setSeen,
} from './render.js';

const MODAL_ID = 'dailySummaryModal';
const BANNER_ID = 'dailySummaryBanner';
const CHECK_TTL_MS = 30 * 60 * 1000;   // one GET per 30 min per tab
const MAX_AGE_DAYS = 3;                // older summaries are history, not news
const SHOWN_KEY = 'ds:shown';
const MODAL_MAX_SNOOZES = 1;           // snoozed once today → no more auto-modal
const BANNER_MAX_SNOOZES = 2;          // modal + banner dismissed → only the dot remains

let checking = false;
let quietPage = false;   // ?bildirim / ?ozet: the widget owns the screen; dot only

export function initDailySummary() {
    if (window.__dailySummaryInit) return;
    window.__dailySummaryInit = true;
    if (!isLoggedIn() || isImpersonating()) return;
    if (!window.bootstrap?.Modal) return;

    // Deep links open the Neo widget straight into a pane; don't compete
    // with a modal or a banner there (the launcher dot is still fine).
    const params = new URLSearchParams(window.location.search);
    quietPage = params.has('bildirim') || params.has('ozet');

    check();
    // Tabs left open overnight: re-check when they come back into view.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
    });
}

/**
 * Mark a summary read with metrics, from outside the modal (the widget pane
 * may use it). Fires `daily-summary:read`, clears the local unread state
 * when the summary is the latest one, and never throws.
 *
 * @param {object} summary  row with at least {id, generated_at}
 * @param {object} [meta]   {seconds_open, expanded, source}
 * @returns {Promise<object|null>} the read record, or null (impersonation/error)
 */
export function markDailySummaryReadNow(summary, meta = {}) {
    if (!summary || !summary.id || isImpersonating()) return Promise.resolve(null);
    const uid = currentUserId();
    const last = uid === null ? null : readCheck(uid);
    const isLatest = !!(last && last.latestId !== null && String(last.latestId) === String(summary.id));
    noteRead(uid, summary, { isLatest });
    emit('daily-summary:read', { id: summary.id });
    return markDailySummaryRead(summary.id, meta).catch((error) => {
        console.warn('Daily summary read mark failed:', error?.message || error);
        return null;
    });
}

// ------------------------------------------------------------------ storage

function readJson(key) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        return null;
    }
}

function writeJson(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
        // Without storage we just check again next time; one GET is cheap.
    }
}

// ds:check:<uid> = {date, latestId, at, unread: {id, summary_date, generated_at}|null}.
// `unread` caches the candidate so the banner/dot survive the 30-minute
// throttle without a second GET; old readers ignore the extra key.
function readCheck(uid) {
    return readJson(`ds:check:${uid}`);
}

function writeCheck(uid, value) {
    writeJson(`ds:check:${uid}`, value);
}

// ds:snooze:<uid> = {id, date (Istanbul YYYY-MM-DD), count}
function readSnooze(uid) {
    return readJson(`ds:snooze:${uid}`);
}

function snoozeCount(uid, id, today) {
    const s = readSnooze(uid);
    if (!s || String(s.id) !== String(id) || s.date !== today) return 0;
    const n = Number(s.count);
    return Number.isFinite(n) && n > 0 ? n : 0;
}

function snooze(uid, lite) {
    if (uid === null || !lite || !lite.id) return;
    const today = istanbulDate();
    writeJson(`ds:snooze:${uid}`, { id: lite.id, date: today, count: snoozeCount(uid, lite.id, today) + 1 });
    emit('daily-summary:unread', { id: lite.id, summary_date: lite.summary_date });
}

function wasShownThisSession(id) {
    try {
        return sessionStorage.getItem(SHOWN_KEY) === String(id);
    } catch (error) {
        return false;
    }
}

function rememberShown(id) {
    try {
        sessionStorage.setItem(SHOWN_KEY, String(id));
    } catch (error) {
        // ignore
    }
}

// Local bookkeeping for a read: seen key (latest only), cached unread
// candidate cleared so the banner cannot resurface within the throttle
// window, banner gone.
function noteRead(uid, summary, { isLatest = false } = {}) {
    if (uid !== null && isLatest) setSeen(uid, seenValue(summary));
    if (uid !== null) {
        const last = readCheck(uid);
        if (last && last.unread && String(last.unread.id) === String(summary.id)) {
            writeCheck(uid, { ...last, unread: null });
        }
    }
    removeBanner();
}

function emit(name, detail) {
    try {
        document.dispatchEvent(new CustomEvent(name, { detail }));
    } catch (error) {
        // ignore — signalling only
    }
}

function liteOf(summary) {
    return { id: summary.id, summary_date: summary.summary_date || null, generated_at: summary.generated_at || null };
}

// login.js navigates with window.location.href, so the first page after a
// login carries the login page as referrer; a fresh tab carries none.
function isFirstPageAfterLogin() {
    const ref = document.referrer || '';
    return !ref || ref.includes('/login/');
}

function pageModalOpen() {
    return !!(document.querySelector('.modal.show') || document.getElementById(MODAL_ID));
}

// ------------------------------------------------------------------ check

async function check() {
    if (checking) return;
    if (!isLoggedIn() || isImpersonating()) return;
    const uid = currentUserId();
    if (uid === null) return;

    checking = true;
    try {
        const today = istanbulDate();
        const last = readCheck(uid);
        const cached = !!(last && last.date === today && Date.now() - Number(last.at || 0) < CHECK_TTL_MS);

        let summary = null;   // full Detail row, only when fetched this time
        let lite = null;      // {id, summary_date, generated_at}
        if (cached) {
            lite = last.unread && last.unread.id ? last.unread : null;
            if (!lite) return;   // nothing unread as of the last check
        } else {
            summary = await getLatestDailySummary();
            lite = summary && summary.id ? liteOf(summary) : null;
        }
        // Written only once the guards below have decided, so a transient
        // block (a page modal) does not silence the next page for 30 min.
        const settle = (unread) => writeCheck(uid, {
            date: today,
            latestId: summary ? summary.id : (last?.latestId ?? null),
            at: cached ? last.at : Date.now(),
            unread,
        });

        if (!lite) { settle(null); return; }
        const seen = seenValue(lite);
        if (summary && summary.is_read) { setSeen(uid, seen); settle(null); return; }
        if (getSeen(uid) === seen) { settle(null); return; }
        if (daysSince(lite.summary_date) > MAX_AGE_DAYS) { settle(null); return; }

        // Unread and fresh: the launcher dot always, whatever else we decide.
        emit('daily-summary:unread', { id: lite.id, summary_date: lite.summary_date });
        if (quietPage) { settle(lite); return; }

        const snoozes = snoozeCount(uid, lite.id, today);
        const wantModal = isFirstPageAfterLogin() && !wasShownThisSession(lite.id) && snoozes < MODAL_MAX_SNOOZES;
        if (wantModal) {
            // Never stack on top of a page's own modal (or a second copy of
            // ours); leave ds:check unwritten so the next load tries again.
            if (pageModalOpen()) return;
            if (!summary) {
                summary = await getDailySummary(lite.id);
                // Read on another device since the cached check.
                if (summary?.is_read) { setSeen(uid, seen); settle(null); return; }
            }
            settle(lite);
            openDailySummaryModal(summary, { isLatest: true, source: 'modal' });
            return;
        }
        settle(lite);
        if (snoozes < BANNER_MAX_SNOOZES && !pageModalOpen()) showBanner(uid, lite);
    } catch (error) {
        console.warn('Daily summary check failed:', error);
    } finally {
        checking = false;
    }
}

// ------------------------------------------------------------------ banner

function removeBanner() {
    const banner = document.getElementById(BANNER_ID);
    if (banner) banner.remove();
}

// One line under the navbar: "Bugünün özeti hazır" + Oku + ×. Built only
// when the modal is not up; opening the modal removes it.
function showBanner(uid, lite) {
    if (document.getElementById(BANNER_ID) || document.getElementById(MODAL_ID)) return;
    const anchor = document.getElementById('navbar-container');
    if (!anchor) return;
    ensureDailySummaryStyles();

    const text = daysSince(lite.summary_date) === 0
        ? 'Bugünün özeti hazır'
        : `Günlük özet hazır · ${relativeDayLabel(lite.summary_date)}`;
    const banner = document.createElement('div');
    banner.id = BANNER_ID;
    banner.className = 'ds-banner';
    banner.setAttribute('role', 'status');
    banner.innerHTML =
        '<div class="ds-banner-inner">' +
            '<i class="fas fa-newspaper ds-banner-icon" aria-hidden="true"></i>' +
            `<span class="ds-banner-text">${escapeHtml(text)}</span>` +
            '<button type="button" class="btn btn-sm ds-banner-read">Oku</button>' +
            '<button type="button" class="ds-banner-close" aria-label="Daha sonra" title="Daha sonra">&times;</button>' +
        '</div>';
    anchor.insertAdjacentElement('afterend', banner);

    const readBtn = banner.querySelector('.ds-banner-read');
    readBtn.addEventListener('click', async () => {
        if (readBtn.disabled) return;
        readBtn.disabled = true;
        try {
            const detail = await getDailySummary(lite.id);
            removeBanner();
            openDailySummaryModal(detail, { isLatest: true, source: 'banner' });
        } catch (error) {
            readBtn.disabled = false;
            console.warn('Daily summary could not be opened from the banner:', error?.message || error);
        }
    });
    banner.querySelector('.ds-banner-close').addEventListener('click', () => {
        snooze(uid, lite);
        removeBanner();
    });
}

// ------------------------------------------------------------------ modal

function buildModal(summary, { fromWidget = false } = {}) {
    const dateLabel = formatSummaryDate(summary.summary_date);
    const days = Number(summary.payload?.window?.days) || 0;
    let windowLabel = formatWindowLabel(summary);
    if (windowLabel && days > 1) windowLabel += ` · ${days} gün`;

    // Opened from the Neo pane: the list is already behind the modal.
    const historyBtn = (window.__assistantSummariesReady && !fromWidget)
        ? '<button type="button" class="btn btn-outline-secondary ds-btn-history">' +
          '<i class="fas fa-newspaper me-1"></i>Geçmiş özetler</button>'
        : '';
    // The same flag gates "Neo'ya sor": without the new widget code nobody
    // listens for assistant:open, and a locked Neo has no chat to prefill.
    const askBtn = (window.__assistantSummariesReady && !window.__assistantLocked)
        ? '<button type="button" class="btn btn-outline-primary ds-btn-ask">' +
          '<i class="fas fa-robot me-1"></i>Neo\'ya sor</button>'
        : '';
    // From the pane every close is a read, so "Daha sonra" would be a lie there.
    const laterBtn = fromWidget
        ? ''
        : '<button type="button" class="btn btn-outline-secondary ds-btn-later" data-bs-dismiss="modal">' +
          '<i class="far fa-clock me-1"></i>Daha sonra</button>';
    const readLabel = (fromWidget && summary.is_read) ? 'Kapat' : 'Okudum';

    // The server's for_you.department_code is current; the cached `user`
    // record only covers the window before the backend ships it.
    const body = renderDailySummary(summary, {
        layer: 'brief',
        areaOrder: areaOrderFor(summary.for_you?.department_code || currentDepartmentCode()),
    });

    // `ds-modal-v2`, not `ds-modal`: a cached first-release stylesheet paints
    // .ds-modal's header as a dark gradient, which would swallow this dark title.
    const modal = document.createElement('div');
    modal.className = 'modal fade ds-modal-v2';
    modal.id = MODAL_ID;
    modal.tabIndex = -1;
    modal.setAttribute('aria-labelledby', `${MODAL_ID}Label`);
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
        <div class="modal-dialog modal-dialog-scrollable modal-lg modal-fullscreen-sm-down">
            <div class="modal-content">
                <div class="modal-header ds-modal-header">
                    <div class="ds-modal-heading">
                        <div class="ds-modal-eyebrow"><i class="fas fa-newspaper me-1"></i>Günlük Özet</div>
                        <h5 class="modal-title ds-modal-title" id="${MODAL_ID}Label">${escapeHtml(dateLabel)}</h5>
                        ${windowLabel ? `<div class="ds-modal-window"><i class="far fa-clock me-1"></i>${escapeHtml(windowLabel)}</div>` : ''}
                    </div>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Daha sonra"></button>
                </div>
                <div class="modal-body ds-modal-body">${body}</div>
                <div class="modal-footer ds-modal-footer">
                    <div class="ds-footer-left">${historyBtn}${askBtn}</div>
                    ${laterBtn}
                    <button type="button" class="btn btn-primary ds-btn-read"><i class="fas fa-check me-1"></i>${readLabel}</button>
                </div>
            </div>
        </div>`;
    return modal;
}

/**
 * Show a summary in the popup. Used by the first-open check and the banner
 * (isLatest) and by the Neo pane for any past summary (fromWidget).
 *
 * Auto/banner opens: only "Okudum" marks it read (server + local seen key);
 * every other way out snoozes. Pane/deep-link opens are deliberate reads, so
 * there any close marks it read. The seen key only ever describes the latest
 * summary, so reading an older one cannot silence tomorrow's popup guard.
 *
 * @param {object} summary  Detail row (with payload)
 * @param {object} [options]
 * @param {boolean} [options.isLatest]   summary is the newest one
 * @param {boolean} [options.fromWidget] opened from the Neo pane / deep link
 * @param {Function} [options.onClose]   called after the modal is gone
 * @param {string}  [options.source]     read-metric source: modal|pane|deeplink|banner
 *                                       (default: fromWidget → pane, or deeplink on ?ozet pages; else modal)
 * @returns {boolean} whether a modal was opened
 */
export function openDailySummaryModal(summary, { isLatest = false, fromWidget = false, onClose = null, source = null } = {}) {
    if (!summary || !summary.id || !window.bootstrap?.Modal) return false;
    if (document.getElementById(MODAL_ID)) return false;
    const uid = currentUserId();
    let src = source;
    if (!src) {
        if (fromWidget) {
            src = new URLSearchParams(window.location.search).has('ozet') ? 'deeplink' : 'pane';
        } else {
            src = 'modal';
        }
    }
    showModal(summary, uid, { isLatest, fromWidget, onClose, source: src });
    return true;
}

function showModal(summary, uid, { isLatest = false, fromWidget = false, onClose = null, source = 'modal' } = {}) {
    ensureDailySummaryStyles();
    removeBanner();
    const modal = buildModal(summary, { fromWidget });
    document.body.appendChild(modal);
    document.body.classList.add('ds-modal-open');
    rememberShown(summary.id);

    // Metrics: how long it stayed open and whether "Tümünü gör" was clicked.
    // The reveal state is never persisted — a second open is brief again.
    const openedAt = Date.now();
    let expanded = false;
    let outcome = fromWidget ? 'read' : 'snooze';
    bindDailySummaryInteractions(modal.querySelector('.ds-modal-body'), { onReveal: () => { expanded = true; } });

    const instance = window.bootstrap.Modal.getOrCreateInstance(modal);

    // Footer actions open the Neo widget, but only after the backdrop is
    // gone — the panel sits under it while the modal is open.
    let afterClose = null;
    const historyBtn = modal.querySelector('.ds-btn-history');
    if (historyBtn) {
        historyBtn.addEventListener('click', () => {
            afterClose = { view: 'summaries', summaryId: summary.id };
            instance.hide();
        });
    }
    const askBtn = modal.querySelector('.ds-btn-ask');
    if (askBtn) {
        askBtn.addEventListener('click', () => {
            afterClose = { view: 'chat', prefill: 'Dün neler oldu?' };
            instance.hide();
        });
    }
    modal.querySelector('.ds-btn-read').addEventListener('click', () => {
        outcome = 'read';
        instance.hide();
    });

    // Every way out (Okudum, Daha sonra, X, Esc, backdrop) lands here.
    modal.addEventListener('hidden.bs.modal', () => {
        // An admin browsing as someone else must not touch their read state.
        if (!isImpersonating()) {
            if (outcome === 'read') {
                const meta = { seconds_open: Math.round((Date.now() - openedAt) / 1000), expanded, source };
                noteRead(uid, summary, { isLatest });
                emit('daily-summary:read', { id: summary.id });
                markDailySummaryRead(summary.id, meta).catch((error) => {
                    console.warn('Daily summary read mark failed:', error?.message || error);
                });
            } else if (isLatest) {
                snooze(uid, liteOf(summary));
            }
        }
        try { instance.dispose(); } catch (error) { /* already disposed */ }
        modal.remove();
        document.body.classList.remove('ds-modal-open');
        if (afterClose) {
            document.dispatchEvent(new CustomEvent('assistant:open', { detail: afterClose }));
        }
        if (typeof onClose === 'function') {
            try { onClose(); } catch (error) { console.warn('Daily summary onClose failed:', error); }
        }
    }, { once: true });

    instance.show();
}
