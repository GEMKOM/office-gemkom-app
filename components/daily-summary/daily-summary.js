/**
 * Günlük Özet — first-open modal.
 *
 * Mounted by the navbar on every page. Once per 30 minutes per tab it asks
 * the API for the latest ready summary; if this user has not read it (server
 * record or local seen key) and it is still fresh, a self-contained Bootstrap
 * modal shows it. Any close counts as read. Impersonated sessions never see
 * it, so an admin cannot mark someone else's summary read.
 *
 * Deliberately not DisplayModal: this must work before any page script runs
 * and must never depend on page-level component styles.
 */
import { isLoggedIn, isImpersonating } from '../../authService.js';
import { escapeHtml } from '../../utils/text.js';
import { getLatestDailySummary, markDailySummaryRead } from '../../apis/dailySummary.js';
import {
    bindDailySummaryInteractions,
    currentUserId,
    daysSince,
    ensureDailySummaryStyles,
    formatSummaryDate,
    formatWindowLabel,
    getSeen,
    istanbulDate,
    renderDailySummary,
    renderStatChips,
    seenValue,
    setSeen,
} from './render.js';

const MODAL_ID = 'dailySummaryModal';
const CHECK_TTL_MS = 30 * 60 * 1000;   // one GET per 30 min per tab
const MAX_AGE_DAYS = 3;                // older summaries are history, not news
const SHOWN_KEY = 'ds:shown';

let checking = false;

export function initDailySummary() {
    if (window.__dailySummaryInit) return;
    window.__dailySummaryInit = true;
    if (!isLoggedIn() || isImpersonating()) return;
    if (!window.bootstrap?.Modal) return;

    // Deep links open the Neo widget straight into a pane; don't compete.
    const params = new URLSearchParams(window.location.search);
    if (params.has('bildirim') || params.has('ozet')) return;

    check();
    // Tabs left open overnight: re-check when they come back into view.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
    });
}

// ------------------------------------------------------------------ storage

function checkKey(uid) {
    return `ds:check:${uid}`;
}

function readCheck(uid) {
    try {
        const raw = localStorage.getItem(checkKey(uid));
        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        return null;
    }
}

function writeCheck(uid, value) {
    try {
        localStorage.setItem(checkKey(uid), JSON.stringify(value));
    } catch (error) {
        // Without storage we just check again next time; one GET is cheap.
    }
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

// ------------------------------------------------------------------ check

async function check() {
    if (checking) return;
    if (!isLoggedIn() || isImpersonating()) return;
    const uid = currentUserId();
    if (uid === null) return;

    const today = istanbulDate();
    const last = readCheck(uid);
    if (last && last.date === today && Date.now() - Number(last.at || 0) < CHECK_TTL_MS) return;

    checking = true;
    try {
        const summary = await getLatestDailySummary();
        writeCheck(uid, { date: today, latestId: summary?.id ?? null, at: Date.now() });
        if (!summary || !summary.id) return;

        const seen = seenValue(summary);
        if (summary.is_read) {
            setSeen(uid, seen);
            return;
        }
        if (getSeen(uid) === seen) return;
        if (wasShownThisSession(summary.id)) return;
        if (daysSince(summary.summary_date) > MAX_AGE_DAYS) return;
        // Never stack on top of a page's own modal (or a second copy of ours).
        if (document.querySelector('.modal.show') || document.getElementById(MODAL_ID)) return;

        showModal(summary, uid);
    } catch (error) {
        console.warn('Daily summary check failed:', error);
    } finally {
        checking = false;
    }
}

// ------------------------------------------------------------------ modal

function buildModal(summary) {
    const dateLabel = formatSummaryDate(summary.summary_date);
    const days = Number(summary.payload?.window?.days) || 0;
    let windowLabel = formatWindowLabel(summary);
    if (windowLabel && days > 1) windowLabel += ` · ${days} gün`;

    const historyBtn = window.__assistantSummariesReady
        ? '<button type="button" class="btn btn-outline-secondary ds-btn-history">' +
          '<i class="fas fa-newspaper me-1"></i>Geçmiş özetler</button>'
        : '';
    // The same flag gates "Neo'ya sor": without the new widget code nobody
    // listens for assistant:open, and a locked Neo has no chat to prefill.
    const askBtn = (window.__assistantSummariesReady && !window.__assistantLocked)
        ? '<button type="button" class="btn btn-outline-primary ds-btn-ask">' +
          '<i class="fas fa-robot me-1"></i>Neo\'ya sor</button>'
        : '';

    const modal = document.createElement('div');
    modal.className = 'modal fade ds-modal';
    modal.id = MODAL_ID;
    modal.tabIndex = -1;
    modal.setAttribute('aria-labelledby', `${MODAL_ID}Label`);
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
        <div class="modal-dialog modal-dialog-scrollable modal-lg modal-fullscreen-sm-down">
            <div class="modal-content">
                <div class="modal-header">
                    <div class="ds-modal-heading">
                        <div class="modal-title ds-modal-title" id="${MODAL_ID}Label">
                            <i class="fas fa-newspaper me-2"></i>Günlük Özet · ${escapeHtml(dateLabel)}
                        </div>
                        ${windowLabel ? `<div class="ds-modal-window"><i class="far fa-clock me-1"></i>${escapeHtml(windowLabel)}</div>` : ''}
                        ${renderStatChips(summary.payload?.stats || summary.stats)}
                    </div>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Kapat"></button>
                </div>
                <div class="modal-body ds-modal-body">${renderDailySummary(summary, { showStats: false })}</div>
                <div class="modal-footer">
                    ${historyBtn}
                    ${askBtn}
                    <button type="button" class="btn btn-primary ds-btn-close" data-bs-dismiss="modal">Kapat</button>
                </div>
            </div>
        </div>`;
    return modal;
}

function showModal(summary, uid) {
    ensureDailySummaryStyles();
    const modal = buildModal(summary);
    document.body.appendChild(modal);
    document.body.classList.add('ds-modal-open');
    rememberShown(summary.id);
    bindDailySummaryInteractions(modal.querySelector('.ds-modal-body'));

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

    // Every way out (Kapat, X, Esc, backdrop) lands here → counts as read.
    modal.addEventListener('hidden.bs.modal', () => {
        setSeen(uid, seenValue(summary));
        markDailySummaryRead(summary.id).catch((error) => {
            console.warn('Daily summary read mark failed:', error?.message || error);
        });
        try { instance.dispose(); } catch (error) { /* already disposed */ }
        modal.remove();
        document.body.classList.remove('ds-modal-open');
        if (afterClose) {
            document.dispatchEvent(new CustomEvent('assistant:open', { detail: afterClose }));
        }
    }, { once: true });

    instance.show();
}
