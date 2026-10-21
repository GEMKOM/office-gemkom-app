/**
 * Tahmin — the drawing-based cost and risk report of a job order or a
 * sales offer, as a card (the "Tahmin" tab of the job order modal, the
 * offer modal, and the row detail of /projects/estimates/).
 *
 * One saved report per version, read for free by everyone with the
 * `view_estimates` right; a new version costs a model run (~2–4 USD, 6–15
 * min) and only starts when someone clicks Oluştur / Yenile. While a run is
 * queued or running the card polls the server and offers Durdur (POST
 * …/cancel/: the row becomes failed with "Kullanıcı tarafından durduruldu").
 *
 * A finished report reads top-down: the summary header (price, floor price,
 * expected cost per route, quantities, confidence, risks), then a sticky
 * section nav and one collapsible section per topic (report-view.js). The
 * markdown is split at its numbered headings (report-model.js) and shown
 * next to the structured data it explains, never as one wall of text.
 *
 * Subject: { jobNo } | { offerId } | { reportId } (a fixed report, no
 * create button). Users without access get nothing: the card never renders.
 */
import { TableComponent } from '../table/table.js';
import { renderMarkdown } from '../../utils/markdownLite.js';
import { escapeHtml } from '../../utils/text.js';
import { showNotification } from '../notification/notification.js';
import { loadMethodHtml } from '../estimator-method/estimator-method.js';
import {
    ESTIMATE_STATUS, REVIEW_LABELS, cancelEstimate, createEstimate, getEstimate, getLatestEstimate, getWeldSchedule, reviewEstimate,
} from '../../apis/estimator.js';
import { fmt, progressModel, remainingLabel, reportModel } from './report-model.js';
import {
    COST_ROW_LABELS, DEFAULT_COLLAPSED, JOINT_TYPE_LABELS, MATERIAL_LABELS, ROUTE_LABELS,
    confidenceBadge, costTableHtml, doneReportHtml, formatDateTime, gotoResolver, money, runMinutes, section,
} from './report-view.js';

export { COST_ROW_LABELS, JOINT_TYPE_LABELS, MATERIAL_LABELS, fmt };

const POLL_MS = 5000;
const POLL_MAX = 360;           // 30 minutes; a run is 6-15, the server gives up at 30
const WELD_OPEN_KEY = 'estimateWeldListOpen';
const COLLAPSED_KEY = 'estimateSectionsCollapsed';
const CANCEL_CONFIRM = 'Çalıştırma durdurulsun mu? Harcanan kısım iade edilmez.';
const CANCELLED_PREFIX = 'Kullanıcı tarafından durduruldu';   // the backend's error text of a stopped run
const RUN_HINT = 'Bir çalıştırma yaklaşık 2–4 USD tutar ve 6–15 dakika sürer.';

// Weld process codes of the extraction schema (estimator weld_extraction.JointSchema).
export const PROCESS_LABELS = {
    TIG_root_fill: 'TIG kök + TIG dolgu', TIG_root_MAG_fill: 'TIG kök + MAG dolgu', MAG: 'MAG', TIG_copper: 'TIG (bakır)', other: 'Diğer',
};
export function processLabel(code) {
    return PROCESS_LABELS[code] || String(code || '').replace(/_/g, ' ');
}

let mountCounter = 0;

/**
 * @param {HTMLElement} container
 * @param {{jobNo?: string, offerId?: number, reportId?: number}} subject
 * @param {object} [options]
 * @param {(report: object|null) => void} [options.onChange] fires after every load
 * @returns {{ refresh: Function, destroy: Function }}
 */
export function mountEstimateReport(container, subject, { onChange } = {}) {
    const uid = `est-${++mountCounter}`;
    const fixed = Boolean(subject.reportId);
    const view = {
        uid,
        report: null,          // the report being shown (any status)
        model: null,           // reportModel(report) of a done report
        weldSchedule: null,    // the subject's weld list (from the report or the endpoint)
        loaded: false,
        hidden: false,
        error: null,
        actionError: null,
        busy: false,           // our own create / review request in flight
        noteOpen: false,
        weldOpen: readFlag(WELD_OPEN_KEY),
        collapsed: new Set(readList(COLLAPSED_KEY) ?? DEFAULT_COLLAPSED),
        costRoute: null,       // in_house | subcontract | compare (default: the route the price is based on)
        similarAll: false,
        confOpen: false,       // "Kaynak listesi güveni nedir?"
        methodHtml: null,      // "Nasıl çalışır?" (GET /estimator/method/), loaded on first open
        pollTimer: null,
        pollActive: false,     // a poll chain is alive (timer pending or tick in flight)
        pollGen: 0,            // bumped by stop/start: a tick of an older chain never reschedules
        pollCount: 0,
        pollExpired: false,    // gave up polling a run that is still open
        loadSeq: 0,            // only the newest load() may write the view
        destroyed: false,
        tables: [],
        activeNav: null,
        spyTimer: null,
        tickTimer: null,       // 1 s ticker moving the progress bar between polls
    };

    // ------------------------------------------------------------ data

    async function load({ quiet = false, reportId = null } = {}) {
        const seq = ++view.loadSeq;
        const stale = () => view.destroyed || seq !== view.loadSeq;
        const id = reportId || (fixed ? subject.reportId : null);
        try {
            let report;
            if (id) {
                report = await getEstimate(id);
            } else {
                try {
                    report = await getLatestEstimate(subject);
                } catch (error) {
                    if (error.status !== 404) throw error;
                    report = null;
                }
            }
            if (stale()) return;
            let weldSchedule = report?.weld_schedule || null;
            if (!weldSchedule && !fixed) {
                try {
                    weldSchedule = await getWeldSchedule(subject);
                } catch (error) {
                    if (error.status !== 404) console.warn('Kaynak listesi yüklenemedi:', error);
                }
                if (stale()) return;
            }
            setReport(report);
            view.error = null;
            view.hidden = false;
            view.weldSchedule = weldSchedule;
            // One poll chain at a time: a tick's own load() must not start a second one.
            if (report && isOpen(report.status)) { if (!view.pollActive) startPolling(); }
            else stopPolling();
        } catch (error) {
            if (stale()) return;
            if (error.status === 403) {
                view.hidden = true;
                stopPolling();
            } else if (error.status === 404 && id) {
                // The report shown is gone (deleted, or a stale id): stop asking for it
                // and fall back to the subject's newest report instead of polling a 404.
                stopPolling();
                if (!fixed) { await load({ quiet }); return; }
                setReport(null);
                view.error = 'Rapor bulunamadı (silinmiş olabilir).';
            } else if (!quiet) {
                console.error('Tahmin yüklenemedi:', error);
                view.error = error.message;
            }
        }
        view.loaded = true;
        render();
        onChange?.(view.report);
    }

    /** Swap the report shown; per-report view choices reset when it is another report. */
    function setReport(report) {
        const changed = report?.id !== view.report?.id;
        view.report = report;
        view.model = report && report.status === 'done' ? reportModel(report) : null;
        if (changed) {
            view.costRoute = null;
            view.similarAll = false;
            view.noteOpen = false;
            view.pollExpired = false;
        }
        if (!view.costRoute && view.model) {
            const routes = view.model.routes;
            view.costRoute = routes.includes(view.model.basis?.key) ? view.model.basis.key : (routes[0] || 'in_house');
        }
    }

    /** What a new version is created for: the mount subject, or (fixed
     *  report mode, e.g. the estimates list) the loaded report's subject. */
    function createSubject() {
        if (!fixed) return subject;
        const r = view.report;
        if (!r) return null;
        return r.job_no ? { jobNo: r.job_no } : (r.offer_id ? { offerId: r.offer_id } : null);
    }

    async function generate() {
        if (view.busy) return;
        const target = createSubject();
        if (!target) return;
        view.busy = true;
        view.actionError = null;
        render();
        try {
            const row = await createEstimate(target);
            if (view.destroyed) return;
            showNotification(`Tahmin v${row.version} sıraya alındı. 6–15 dakika sürer; bu sekme kendini günceller.`, 'info');
            await load({ quiet: true, reportId: row.id });
        } catch (error) {
            if (view.destroyed) return;
            if (error.status === 409 && error.data?.id) {
                await load({ quiet: true, reportId: error.data.id });
            } else {
                view.actionError = error.message;
            }
        } finally {
            view.busy = false;
            if (!view.destroyed) render();
        }
    }

    async function review(decision, note = '') {
        if (view.busy || !view.report) return;
        view.busy = true;
        view.actionError = null;
        render();
        try {
            const report = await reviewEstimate(view.report.id, decision, note);
            if (view.destroyed) return;
            setReport(report);
            view.noteOpen = false;
            showNotification(decision === 'accept' ? 'Tahmin kabul edildi.' : 'Düzeltme notu kaydedildi.', 'success');
            onChange?.(report);
        } catch (error) {
            if (view.destroyed) return;
            view.actionError = error.message;
        } finally {
            view.busy = false;
            if (!view.destroyed) render();
        }
    }

    /** Durdur: stop the queued / running run shown. The server answers with
     *  the stopped row; the card is reloaded from it (status failed + the
     *  "durduruldu" text). A 409 means it finished meanwhile: just reload. */
    async function cancel() {
        if (view.busy || !view.report || !isOpen(view.report.status)) return;
        if (!window.confirm(CANCEL_CONFIRM)) return;
        const id = view.report.id;
        view.busy = true;
        view.actionError = null;
        render();
        try {
            await cancelEstimate(id);
            if (view.destroyed) return;
            stopPolling();
            showNotification('Çalıştırma durduruldu.', 'info');
            await load({ quiet: true, reportId: id });
        } catch (error) {
            if (view.destroyed) return;
            if (error.status === 409) {
                await load({ quiet: true, reportId: id });     // already finished: show what it became
            } else {
                view.actionError = error.message;
            }
        } finally {
            view.busy = false;
            if (!view.destroyed) render();
        }
    }

    /** One chain: every start/stop bumps `pollGen`, and a tick whose
     *  generation is no longer current (stopped, restarted or destroyed while
     *  its request was in flight) returns without scheduling another one. */
    function startPolling() {
        stopPolling();
        const gen = view.pollGen;
        view.pollActive = true;
        view.pollCount = 0;
        view.pollExpired = false;
        const tick = async () => {
            if (gen !== view.pollGen || view.destroyed) return;
            view.pollCount += 1;
            if (view.pollCount > POLL_MAX) {
                stopPolling();
                view.pollExpired = true;
                render();
                return;
            }
            await load({ quiet: true, reportId: view.report?.id });
            if (gen !== view.pollGen || view.destroyed) return;
            if (view.report && isOpen(view.report.status)) view.pollTimer = setTimeout(tick, POLL_MS);
            else stopPolling();
        };
        view.pollTimer = setTimeout(tick, POLL_MS);
    }

    function stopPolling() {
        view.pollGen += 1;
        view.pollActive = false;
        if (view.pollTimer) clearTimeout(view.pollTimer);
        view.pollTimer = null;
    }

    // ------------------------------------------------------------ render

    function render() {
        if (view.destroyed) return;
        const openDetails = readDetails();
        destroyTables();
        if (view.hidden) {
            container.innerHTML = '';
            return;
        }
        if (view.error && !view.report) {
            container.innerHTML = `
                <div class="est-report">
                    <div class="est-state est-state-failed">
                        <i class="fas fa-calculator est-state-icon"></i>
                        <div><div class="est-state-title">Tahmin yüklenemedi</div>
                            <div>${escapeHtml(view.error)}</div>
                            <button type="button" class="btn btn-sm btn-outline-secondary mt-2" data-est-action="retry"><i class="fas fa-rotate me-1"></i>Tekrar dene</button></div>
                    </div>
                </div>`;
            return;
        }
        if (!view.loaded) {
            container.innerHTML = `<div class="est-report"><div class="est-state">
                <span class="spinner-border spinner-border-sm" role="status"></span><span>Tahmin yükleniyor…</span></div></div>`;
            return;
        }
        const r = view.report;
        container.innerHTML = `
            <div class="est-report${r?.status === 'done' ? ' is-done' : ''}">
                ${headHtml(r)}
                ${view.actionError ? `<div class="est-alert"><i class="fas fa-circle-exclamation"></i><span>${escapeHtml(view.actionError)}</span></div>` : ''}
                ${versionNotice(r)}
                <div class="est-body">${bodyHtml(r)}</div>
                ${r && r.status === 'done' ? '<div class="est-foot"><i class="fas fa-robot me-1"></i>Yapay zekâ tahminidir; fiyatları ve saatleri referans işlerle doğrulayın.</div>' : ''}
            </div>`;
        writeDetails(openDetails);
        syncTicker();
        mountTables();
        if (!view.collapsed.has('yontem')) ensureMethod();
        view.activeNav = null;
        updateNav();
    }

    /** Step list + determinate bar of a running report that carries `progress`;
     *  the old indeterminate bar for queued rows and older runs. */
    function progressHtml(r) {
        const pm = r.status === 'running' ? progressModel(r.progress) : null;
        if (!pm) return '<div class="est-progress" aria-hidden="true"><span></span></div>';
        const icons = { done: 'fa-check', current: 'fa-circle-notch fa-spin', pending: 'fa-circle' };
        const steps = pm.steps.map((st) => `<li class="est-step is-${st.state}"><i class="${st.state === 'pending' ? 'far' : 'fas'} ${icons[st.state]}"></i><span>${escapeHtml(st.label)}${st.detail ? `<span class="est-step-detail">· ${escapeHtml(st.detail)}</span>` : ''}</span></li>`).join('');
        const pct = Math.round(pm.fraction * 100);
        return `<div class="est-prog">
                <ol class="est-steps">${steps}</ol>
                <div class="est-progress is-determinate" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${(pm.fraction * 100).toFixed(1)}%"></span></div>
                <div class="est-prog-meta"><span class="est-prog-pct">%${pct}</span><span class="est-prog-left">${escapeHtml(remainingLabel(pm))}</span></div>
            </div>`;
    }

    /** Keep a 1 s ticker alive only while a progress block is on screen. */
    function syncTicker() {
        const has = !view.destroyed && container.querySelector('.est-prog');
        if (!has) {
            if (view.tickTimer) clearInterval(view.tickTimer);
            view.tickTimer = null;
            return;
        }
        if (!view.tickTimer) view.tickTimer = setInterval(tickProgress, 1000);
    }

    function tickProgress() {
        const root = container.querySelector('.est-prog');
        const pm = root && view.report?.status === 'running' ? progressModel(view.report.progress) : null;
        if (!pm) { syncTicker(); return; }
        const pct = Math.round(pm.fraction * 100);
        const bar = root.querySelector('.est-progress');
        bar.setAttribute('aria-valuenow', String(pct));
        bar.firstElementChild.style.width = `${(pm.fraction * 100).toFixed(1)}%`;
        root.querySelector('.est-prog-pct').textContent = `%${pct}`;
        root.querySelector('.est-prog-left').textContent = remainingLabel(pm);
    }

    function headHtml(r) {
        const versions = r?.versions || [];
        let versionCtl = '';
        if (versions.length > 1) {
            versionCtl = `<select class="form-select form-select-sm est-version-select" data-est-action="version" title="Sürüm" aria-label="Sürüm">
                ${versions.slice().reverse().map((v) => `<option value="${escapeHtml(v.id)}" ${v.id === r.id ? 'selected' : ''}>v${escapeHtml(v.version)} · ${ESTIMATE_STATUS[v.status]?.label || escapeHtml(v.status)}${v.review_decision ? ` · ${REVIEW_LABELS[v.review_decision]?.label || ''}` : ''}</option>`).join('')}
            </select>`;
        } else if (r) {
            versionCtl = `<span class="est-version">v${escapeHtml(r.version)}</span>`;
        }
        const review = r?.status === 'done'
            ? (() => { const rv = REVIEW_LABELS[r.review_decision || ''] || REVIEW_LABELS['']; return `<span class="status-badge ${rv.badge}">${rv.label}</span>`; })()
            : '';
        return `<div class="est-head">
            <div class="est-head-main">
                <span class="est-icon"><i class="fas fa-calculator"></i></span>
                <div class="est-head-text">
                    <div class="est-head-title"><span>Tahmin raporu</span>${versionCtl}${r ? statusPill(r.status) : ''}${review}</div>
                    <div class="est-head-meta">${metaLine(r)}</div>
                </div>
            </div>
            <div class="est-head-actions">${actions(r)}</div>
        </div>`;
    }

    function metaLine(r) {
        const sep = '<span class="est-dot">·</span>';
        if (!r) {
            const ws = view.weldSchedule;
            return ws
                ? `Henüz rapor yok${sep}kaynak listesi v${escapeHtml(ws.version)} hazır (${fmt(ws.totals?.joints_total ?? 0, 0)} birleşim, ${fmt(ws.totals?.weld_m_total, 1)} m)`
                : 'Henüz rapor yok';
        }
        const parts = [`<span><i class="far fa-calendar"></i>${escapeHtml(formatDateTime(r.created_at))}${r.created_by_name ? ` · ${escapeHtml(r.created_by_name)}` : ''}</span>`];
        if (r.status === 'done') {
            const mins = runMinutes(r);
            if (mins != null) parts.push(`<span title="Çalışma süresi"><i class="far fa-clock"></i>${mins} dk</span>`);
            if (r.usage_usd != null) parts.push(`<span title="Model maliyeti"><i class="fas fa-dollar-sign"></i>${fmt(Number(r.usage_usd), 2)} USD</span>`);
            if (r.model) parts.push(`<span title="Model"><i class="fas fa-microchip"></i>${escapeHtml(r.model)}</span>`);
            if (r.reviewed_by_name) {
                parts.push(`<span>${escapeHtml(REVIEW_LABELS[r.review_decision]?.label || 'İnceleme')}: ${escapeHtml(r.reviewed_by_name)}${r.reviewed_at ? `, ${escapeHtml(formatDateTime(r.reviewed_at))}` : ''}</span>`);
            }
        }
        return parts.join(sep);
    }

    function actions(r) {
        const buttons = [];
        const busy = view.busy ? 'disabled' : '';
        if (r && r.status === 'done') {
            if (r.review_decision !== 'accept') {
                buttons.push(`<button type="button" class="btn btn-sm btn-outline-success" data-est-action="accept" ${busy} title="Tahmini kabul et"><i class="fas fa-check me-1"></i>Kabul</button>`);
            }
            buttons.push(`<button type="button" class="btn btn-sm btn-outline-secondary" data-est-action="note" ${busy}><i class="fas fa-pen me-1"></i>Düzeltme notu</button>`);
            buttons.push(`<button type="button" class="btn btn-sm btn-outline-secondary" data-est-action="print" title="Yazdır / PDF"><i class="fas fa-file-pdf me-1"></i>PDF</button>`);
        }
        if (r && isOpen(r.status)) {
            buttons.push(`<button type="button" class="btn btn-sm btn-outline-danger" data-est-action="cancel" ${busy} title="Çalıştırmayı durdur"><i class="fas fa-stop me-1"></i>Durdur</button>`);
        }
        if (createSubject() && (!r || !isOpen(r.status))) {
            buttons.push(`<button type="button" class="btn btn-sm est-generate" data-est-action="generate" ${busy} title="Yeni sürüm: ${RUN_HINT}">
                <i class="fas ${r ? 'fa-rotate' : 'fa-wand-magic-sparkles'} me-1"></i>${r ? 'Yenile' : 'Oluştur'}</button>`);
        }
        buttons.push('<button type="button" class="btn btn-sm btn-link est-help-link" data-est-action="method-open"><i class="fas fa-circle-question me-1"></i>Nasıl çalışır?</button>');
        return buttons.join('');
    }

    function versionNotice(r) {
        const versions = r?.versions || [];
        const latest = versions[versions.length - 1];
        if (!r || !latest || latest.id === r.id) return '';
        return `<div class="est-notice"><i class="fas fa-clock-rotate-left"></i>
            <span>Eski sürüm görüntüleniyor (v${escapeHtml(r.version)}). En yeni: v${escapeHtml(latest.version)} · ${ESTIMATE_STATUS[latest.status]?.label || escapeHtml(latest.status)}.</span>
            <button type="button" class="btn btn-sm btn-link p-0" data-est-action="show-version" data-id="${latest.id}">En yeniye geç</button></div>`;
    }

    /** The newest finished version other than the one shown (to offer while a run is open or failed). */
    function previousDone(r) {
        return (r?.versions || []).filter((v) => v.status === 'done' && v.id !== r.id).pop() || null;
    }

    function bodyHtml(r) {
        if (!r) {
            if (fixed && !createSubject()) return '<div class="est-state">Rapor bulunamadı.</div>';
            return `<div class="est-empty">
                    <div class="est-empty-icon"><i class="fas fa-wand-magic-sparkles"></i></div>
                    <div class="est-empty-title">Henüz tahmin yok</div>
                    <ol class="est-empty-steps">
                        <li>Çizimlerden <strong>kaynak listesi</strong> çıkarılır (birleşimler, metreler, ağırlık).</li>
                        <li>Benzer işlerin kayıtlı saatleriyle <strong>saat kalibre</strong> edilir.</li>
                        <li><strong>İç imalat / taşeron</strong> maliyet tablosu, teklif önerisi, dikkat noktaları ve istenecekler yazılır.</li>
                    </ol>
                    <div class="est-muted small mb-2">${RUN_HINT}</div>
                    ${createSubject() ? `<button type="button" class="btn est-generate" data-est-action="generate" ${view.busy ? 'disabled' : ''}><i class="fas fa-wand-magic-sparkles me-1"></i>Oluştur</button>` : ''}
                </div>
                ${weldSection()}${methodSection()}`;
        }
        if (isOpen(r.status)) {
            const prev = previousDone(r);
            return `<div class="est-state est-state-running">
                    <span class="spinner-border est-state-spinner" role="status"></span>
                    <div class="est-state-main">
                        <div class="est-state-title">${r.status === 'queued' ? 'Sırada bekliyor' : `Çalışıyor${elapsed(r.started_at)}`}</div>
                        <div>${r.status === 'queued' ? 'Çalıştırma sıraya alındı, birazdan başlar.' : 'Çizimler okunuyor, kaynak listesi çıkarılıyor ve rapor yazılıyor.'}
                            ${r.inputs?.weld_schedule_version ? '' : 'İlk çalıştırmada kaynak listesi çıkarımı da yapılır.'}</div>
                        ${progressHtml(r)}
                        <div class="est-muted small">Genelde 6–15 dakika sürer. Bu sekme kendini günceller; pencereyi kapatabilirsiniz, çalıştırma sunucuda sürer.</div>
                        ${view.pollExpired ? '<div class="mt-2"><span class="est-muted small">Otomatik güncelleme durdu.</span> <button type="button" class="btn btn-link btn-sm p-0" data-est-action="retry">Durumu kontrol et</button></div>' : ''}
                        ${prev ? `<div class="mt-2 small">Önceki hazır sürüm: <button type="button" class="btn btn-link btn-sm p-0 align-baseline" data-est-action="show-version" data-id="${prev.id}">v${escapeHtml(prev.version)} raporunu aç</button></div>` : ''}
                    </div>
                </div>
                ${weldSection()}${methodSection()}`;
        }
        if (r.status === 'failed') {
            const stopped = String(r.error || '').startsWith(CANCELLED_PREFIX);
            const full = String(r.error || '').trim();
            const first = firstLine(full);
            const prev = previousDone(r);
            return `<div class="est-state est-state-failed">
                    <i class="fas ${stopped ? 'fa-circle-stop' : 'fa-triangle-exclamation'} est-state-icon"></i>
                    <div class="est-state-main">
                        <div class="est-state-title">${stopped ? 'Çalıştırma durduruldu' : 'Çalıştırma başarısız'}</div>
                        <div>${escapeHtml(first) || 'Hata metni yok.'}</div>
                        ${full.length > first.length ? `<details class="est-more"><summary>Hata ayrıntısı</summary><pre class="est-pre">${escapeHtml(full)}</pre></details>` : ''}
                        <div class="est-muted small mt-1">${createSubject() ? 'Yenile ile yeni bir sürüm başlatılabilir. ' : ''}${prev ? `Önceki hazır sürüm: <button type="button" class="btn btn-link btn-sm p-0 align-baseline" data-est-action="show-version" data-id="${prev.id}">v${escapeHtml(prev.version)} raporunu aç</button>` : ''}</div>
                    </div>
                </div>
                ${weldSection()}${methodSection()}`;
        }
        // done
        const m = view.model || reportModel(r);
        return `${reviewBlock(r)}${doneReportHtml(r, m, view, weldSection())}${methodSection()}`;
    }

    function reviewBlock(r) {
        if (view.noteOpen) {
            return `<form class="est-review is-form" data-est-form="note">
                <label class="est-review-title" for="${uid}-note"><i class="fas fa-pen"></i>Düzeltme notu</label>
                <textarea class="form-control" rows="3" id="${uid}-note" name="note" placeholder="Nerede, neden düzeltme gerekiyor? (ör. bakır fiyatı güncel değil)" required>${escapeHtml(r.review_note || '')}</textarea>
                <div class="d-flex gap-2 mt-2">
                    <button type="submit" class="btn btn-sm est-generate" ${view.busy ? 'disabled' : ''}><i class="fas fa-save me-1"></i>Kaydet</button>
                    <button type="button" class="btn btn-sm btn-outline-secondary" data-est-action="note-cancel">Vazgeç</button>
                </div>
            </form>`;
        }
        if (r.review_decision === 'correct' && r.review_note) {
            return `<div class="est-review">
                <div class="est-review-title"><i class="fas fa-pen"></i>Düzeltme notu${r.reviewed_by_name ? `<span class="est-muted fw-normal"> · ${escapeHtml(r.reviewed_by_name)}${r.reviewed_at ? `, ${escapeHtml(formatDateTime(r.reviewed_at))}` : ''}</span>` : ''}</div>
                <div class="est-review-text">${escapeHtml(r.review_note)}</div>
            </div>`;
        }
        return '';
    }

    function weldSection() {
        const ws = view.weldSchedule;
        if (!ws) return '';
        const t = ws.totals || {};
        const byMat = Object.entries(t.weld_m_by_material || {}).map(([mat, val]) => `${MATERIAL_LABELS[mat] || escapeHtml(mat)} ${fmt(val, 1)} m`).join(', ');
        const bu = ws.bottom_up || {};
        const facts = [
            ['Birleşim', fmt(t.joints_total ?? 0, 0)],
            ['Kaynak / adet', `${fmt(t.weld_m_total, 1)} m`, byMat],
            ['Parça · büküm', `${fmt(ws.pieces_to_cut_per_unit ?? 0, 0)} · ${fmt(ws.bends_per_unit ?? 0, 0)}`],
            ['Birim kütle', `${fmt(ws.unit_mass_kg, 0)} kg`, ws.mass_basis ? escapeHtml(ws.mass_basis) : ''],
            ['Standart saat / adet', `${fmt(bu.total_h, 1)} h`, `kaynak ${fmt(bu.welding_h, 1)} + diğer ${fmt(bu.non_welding_h, 1)}`],
            ['Güven', confidenceBadge(ws.confidence)],
        ].map(([label, value, sub]) => `<div class="est-fact"><span class="est-fact-label">${label}</span><span class="est-fact-value">${value}</span>${sub ? `<span class="est-fact-sub" title="${escapeHtml(String(sub).replace(/<[^>]+>/g, ''))}">${sub}</span>` : ''}</div>`).join('');
        const toggle = `<button type="button" class="btn btn-link btn-sm" data-est-action="weld-toggle">${view.weldOpen ? 'Listeyi gizle' : 'Listeyi göster'}</button>`;
        const open = view.weldOpen ? `<div id="${uid}-weld" class="est-weld-table"></div>
            ${(ws.open_questions || []).length ? `<div class="est-note-line"><i class="fas fa-circle-question"></i><span><strong>Çizimin söylemediği:</strong> ${ws.open_questions.map(escapeHtml).join(' · ')}</span></div>` : ''}` : '';
        return section(view, 'kaynak', `Kaynak listesi <span class="est-muted fw-normal">· 1 adet · v${escapeHtml(ws.version)}</span>`,
            `<div class="est-facts is-compact">${facts}</div>${open}`, { tools: toggle });
    }

    function methodSection() {
        let html = '<span class="est-muted small"><i class="fas fa-spinner fa-spin me-1"></i>Yükleniyor…</span>';
        if (view.methodHtml) html = `<div class="est-md">${view.methodHtml}</div>`;
        return section(view, 'yontem', 'Nasıl çalışır?', html, { icon: 'fa-circle-question', sub: 'kaynak listesi, birim süreler, referans seçimi ve faktör' });
    }

    function ensureMethod() {
        if (view.methodHtml || view.methodLoading) return;
        view.methodLoading = true;
        loadMethodHtml()
            .then((html) => { view.methodHtml = html; })
            .catch((error) => { view.methodHtml = `<span class="text-danger">${escapeHtml(error.message || 'Açıklama yüklenemedi')}</span>`; })
            .finally(() => {
                view.methodLoading = false;
                const body = container.querySelector('section[data-sec="yontem"] .est-sec-body');
                if (body && !view.destroyed) body.innerHTML = `<div class="est-md">${view.methodHtml}</div>`;
            });
    }

    // ------------------------------------------------------------ tables

    function mountTables() {
        const weldHost = container.querySelector(`#${uid}-weld`);
        if (weldHost && view.weldSchedule) {
            view.tables.push(new TableComponent(`${uid}-weld`, {
                columns: weldColumns(),
                data: (view.weldSchedule.joints || []).map((j) => ({ ...j })),
                sortable: true,
                pagination: false,
                showHeader: false,
                small: true,
                skeleton: false,
                emptyMessage: 'Birleşim yok',
            }));
        }
    }

    function destroyTables() {
        view.tables.forEach((t) => { try { t.destroy?.(); } catch { /* already gone */ } });
        view.tables = [];
    }

    // ------------------------------------------------------------ sections, nav, scrolling

    /** `<details>` open/closed survives a re-render (keyed by section + position). */
    function detailsKeyed() {
        const out = [];
        container.querySelectorAll('section[data-sec]').forEach((sec) => {
            sec.querySelectorAll('details').forEach((d, i) => out.push([`${sec.dataset.sec}:${i}`, d]));
        });
        return out;
    }
    function readDetails() {
        return new Map(detailsKeyed().map(([k, d]) => [k, d.open]));
    }
    function writeDetails(state) {
        detailsKeyed().forEach(([k, d]) => { if (state.has(k)) d.open = state.get(k); });
    }

    function setCollapsed(key, collapsed) {
        if (collapsed) view.collapsed.add(key); else view.collapsed.delete(key);
        writeList(COLLAPSED_KEY, [...view.collapsed]);
        const sec = container.querySelector(`section[data-sec="${key}"]`);
        if (sec) {
            sec.classList.toggle('is-collapsed', collapsed);
            sec.querySelector('.est-sec-toggle')?.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        }
        if (key === 'yontem' && !collapsed) ensureMethod();
    }

    function setAllCollapsed(collapsed) {
        container.querySelectorAll('section[data-sec]').forEach((sec) => {
            if (sec.dataset.sec !== 'ozet') setCollapsed(sec.dataset.sec, collapsed);
        });
    }

    /** The element whose scrolling moves the card: the modal (or modal body), else the page. */
    function scrollRoot() {
        let el = container.parentElement;
        while (el && el !== document.body && el !== document.documentElement) {
            const oy = getComputedStyle(el).overflowY;
            if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1) return el;
            el = el.parentElement;
        }
        return document.scrollingElement || document.documentElement;
    }

    function scrollToY(target, smooth = true) {
        const root = scrollRoot();
        const isPage = root === document.scrollingElement || root === document.documentElement;
        const rootTop = isPage ? 0 : root.getBoundingClientRect().top;
        const top = target - rootTop + (isPage ? window.scrollY : root.scrollTop);
        (isPage ? window : root).scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' });
    }

    function goto(key) {
        const sec = container.querySelector(`section[data-sec="${key}"]`);
        if (!sec) return;
        if (view.collapsed.has(key)) setCollapsed(key, false);
        const nav = container.querySelector('[data-est-nav]');
        const offset = key === 'ozet' ? 12 : (nav ? nav.offsetHeight : 0) + 8;   // the stuck nav sits at the scroll container's top
        scrollToY(sec.getBoundingClientRect().top - offset);
        setActiveNav(key);
    }

    function scrollToTop() {
        scrollToY(container.getBoundingClientRect().top - 12);
    }

    function setActiveNav(key) {
        if (view.activeNav === key) return;
        view.activeNav = key;
        const items = container.querySelector('.est-nav-items');
        container.querySelectorAll('[data-nav-key]').forEach((b) => {
            const on = b.dataset.navKey === key;
            b.classList.toggle('is-active', on);
            if (on && items && items.scrollWidth > items.clientWidth) {
                const left = b.offsetLeft - items.clientWidth / 2 + b.offsetWidth / 2;
                items.scrollLeft = Math.max(0, left);
            }
        });
    }

    /** Scroll spy: highlight the section under the nav; mark the nav once it sticks. */
    function updateNav() {
        const nav = container.querySelector('[data-est-nav]');
        if (!nav || !nav.offsetParent) return;
        const root = scrollRoot();
        const isPage = root === document.scrollingElement || root === document.documentElement;
        // Sticky stops at the scroll container's padding edge: pull the nav up over that padding
        // (the job order modal scrolls its padded .modal-body, the offer modal the whole .modal).
        const pad = isPage ? 0 : parseFloat(getComputedStyle(root).paddingTop) || 0;
        if (nav.dataset.pad !== String(pad)) { nav.style.top = `${-pad}px`; nav.dataset.pad = String(pad); }
        const navRect = nav.getBoundingClientRect();
        const rootTop = isPage ? 0 : root.getBoundingClientRect().top;
        const hero = container.querySelector('section[data-sec="ozet"]');
        // The summary is (nearly) scrolled away: the nav is at, or about to reach, the top.
        const past = !hero || hero.getBoundingClientRect().bottom < rootTop + navRect.height * 1.5;
        nav.classList.toggle('is-stuck', past);
        let active = 'ozet';
        if (past) {
            container.querySelectorAll('section[data-sec]').forEach((sec) => {
                if (sec.dataset.sec === 'yontem' || sec.dataset.sec === 'ozet') return;
                if (sec.getBoundingClientRect().top - 12 <= navRect.bottom) active = sec.dataset.sec;
            });
        }
        setActiveNav(active);
    }

    function onScroll() {
        if (view.spyTimer) return;
        view.spyTimer = setTimeout(() => {
            view.spyTimer = null;
            if (!view.destroyed) updateNav();
        }, 80);
    }

    // ------------------------------------------------------------ events

    function onClick(event) {
        const jump = event.target.closest('[data-est-goto]');
        if (jump && container.contains(jump)) {
            event.preventDefault();
            goto(jump.dataset.estGoto);
            return;
        }
        const el = event.target.closest('[data-est-action]');
        if (!el || !container.contains(el) || el.tagName === 'SELECT') return;
        const action = el.dataset.estAction;
        if (action === 'generate') generate();
        else if (action === 'cancel') cancel();
        else if (action === 'retry') load();
        else if (action === 'accept') review('accept');
        else if (action === 'note') { view.noteOpen = true; render(); container.querySelector(`#${uid}-note`)?.focus(); }
        else if (action === 'note-cancel') { view.noteOpen = false; render(); }
        else if (action === 'print') printReport(view.report, view.weldSchedule);
        else if (action === 'weld-toggle') { view.weldOpen = !view.weldOpen; writeFlag(WELD_OPEN_KEY, view.weldOpen); render(); }
        else if (action === 'toggle') setCollapsed(el.dataset.secKey, !view.collapsed.has(el.dataset.secKey));
        else if (action === 'expand-all') setAllCollapsed(false);
        else if (action === 'collapse-all') setAllCollapsed(true);
        else if (action === 'top') scrollToTop();
        else if (action === 'method-open') { setCollapsed('yontem', false); goto('yontem'); }
        else if (action === 'show-version') load({ reportId: parseInt(el.dataset.id, 10) });
        else if (action === 'conf-help') { view.confOpen = !view.confOpen; render(); }
        else if (action === 'similar-all') { view.similarAll = !view.similarAll; render(); }
        else if (action === 'text-all') {
            const parts = [...container.querySelectorAll('section[data-sec="metin"] details.est-text-part')];
            const open = parts.some((d) => !d.open);
            parts.forEach((d) => { d.open = open; });
            el.textContent = open ? 'Hepsini kapat' : 'Hepsini aç';
        } else if (action === 'route') {
            view.costRoute = el.dataset.route;
            const host = container.querySelector('[data-est-cost]');
            if (host && view.report) host.innerHTML = costTableHtml(view.report.cost_table || {}, view.costRoute, gotoResolver(view.model || reportModel(view.report)));
            el.parentElement.querySelectorAll('[data-route]').forEach((b) => {
                const on = b.dataset.route === view.costRoute;
                b.classList.toggle('is-active', on);
                b.setAttribute('aria-pressed', on ? 'true' : 'false');
            });
        }
    }

    function onChangeEvent(event) {
        const el = event.target.closest('[data-est-action="version"]');
        if (!el || !container.contains(el)) return;
        load({ reportId: parseInt(el.value, 10) });
    }

    function onSubmit(event) {
        const form = event.target.closest('[data-est-form="note"]');
        if (!form || !container.contains(form)) return;
        event.preventDefault();
        review('correct', form.elements.note.value.trim());
    }

    container.addEventListener('click', onClick);
    container.addEventListener('change', onChangeEvent);
    container.addEventListener('submit', onSubmit);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    render();
    load();

    return {
        refresh: () => load({ quiet: true, reportId: view.report?.id }),
        destroy() {
            view.destroyed = true;
            stopPolling();
            if (view.tickTimer) clearInterval(view.tickTimer);
            view.tickTimer = null;
            destroyTables();
            if (view.spyTimer) clearTimeout(view.spyTimer);
            container.removeEventListener('click', onClick);
            container.removeEventListener('change', onChangeEvent);
            container.removeEventListener('submit', onSubmit);
            document.removeEventListener('scroll', onScroll, true);
            window.removeEventListener('resize', onScroll);
            container.innerHTML = '';
        },
    };
}

// ---------------------------------------------------------------- cost table (TableComponent shape, kept for callers)

export function costTableColumns(costTable) {
    const routes = costTable.routes?.length ? costTable.routes : ['in_house'];
    const cols = [{ field: 'label', label: 'Kalem', width: '190px', formatter: (v, row) => (row.key === 'total' ? `<strong>${escapeHtml(v)}</strong>` : escapeHtml(v)) }];
    const num = (field, label, headerClass) => ({
        field, label, headerClass: `est-num ${headerClass}`, cellClass: 'est-num', exportType: 'money',
        formatter: (v, row) => (v == null ? '—' : fmt(v, row.key === 'eur_per_kg' ? 2 : 0)),
    });
    if (routes.includes('in_house')) {
        cols.push(num('in_low', 'İç imalat · Düşük', 'est-route-in'), num('in_expected', 'İç imalat · Beklenen', 'est-route-in'), num('in_high', 'İç imalat · Yüksek', 'est-route-in'));
    }
    if (routes.includes('subcontract')) {
        cols.push(num('sub_low', 'Taşeron · Düşük', 'est-route-sub'), num('sub_expected', 'Taşeron · Beklenen', 'est-route-sub'), num('sub_high', 'Taşeron · Yüksek', 'est-route-sub'));
    }
    cols.push({ field: 'basis', label: 'Dayanak', formatter: (v) => `<span class="text-muted small">${escapeHtml(v || '')}</span>` });
    return cols;
}

export function costTableRows(costTable) {
    return (costTable.rows || []).map((r) => ({
        key: r.key,
        label: COST_ROW_LABELS[r.key] || r.label,
        in_low: r.in_house?.low ?? null, in_expected: r.in_house?.expected ?? null, in_high: r.in_house?.high ?? null,
        sub_low: r.subcontract?.low ?? null, sub_expected: r.subcontract?.expected ?? null, sub_high: r.subcontract?.high ?? null,
        basis: r.basis || '',
    }));
}

export function weldColumns() {
    return [
        { field: 'joint_id', label: 'No', width: '60px', sortable: true },
        { field: 'description', label: 'Birleşim', sortable: false, formatter: (v) => escapeHtml(v || '') },
        { field: 'joint_type', label: 'Tip', sortable: true, formatter: (v) => JOINT_TYPE_LABELS[v] || escapeHtml(v || '') },
        { field: 'material', label: 'Malzeme', sortable: true, formatter: (v) => MATERIAL_LABELS[v] || escapeHtml(v || '') },
        { field: 'size', label: 'Ölçü', sortable: false, formatter: (v) => escapeHtml(v || '') },
        { field: 'process', label: 'Proses', sortable: false, formatter: (v) => escapeHtml(processLabel(v)) },
        { field: 'count_per_unit', label: 'Adet', type: 'number', sortable: true, headerClass: 'est-num', cellClass: 'est-num' },
        { field: 'length_m_each', label: 'm / birleşim', type: 'number', sortable: true, headerClass: 'est-num', cellClass: 'est-num', formatter: (v) => fmt(v, 3) },
        { field: 'total_m_per_unit', label: 'm toplam', type: 'number', sortable: true, headerClass: 'est-num', cellClass: 'est-num', formatter: (v) => fmt(v, 2) },
        { field: 'ndt', label: 'NDT', sortable: true, formatter: (v) => escapeHtml(v || '') },
    ];
}

// ---------------------------------------------------------------- print (PDF indir)

export function printReport(report, weldSchedule) {
    if (!report) return;
    const title = `Tahmin raporu v${report.version} · ${report.subject_key}${report.title ? ` · ${report.title}` : ''}`;
    const ct = report.cost_table || {};
    const rows = costTableRows(ct);
    const routes = ct.routes?.length ? ct.routes : ['in_house'];
    const m = report.status === 'done' ? reportModel(report) : null;
    const exp = ct.expected_total || {};
    const kg = ct.eur_per_kg || {};
    const summary = m ? `<table class="summary"><tbody>
        ${m.price ? `<tr><th>Önerilen fiyat</th><td>${money(m.price.total ?? m.price.raw)}${m.price.perUnit != null ? ` · ${money(m.price.perUnit)}/adet` : ''}${m.price.perKg != null ? ` · ${fmt(m.price.perKg, 2)} €/kg` : ''}</td></tr>` : ''}
        ${m.floor ? `<tr><th>Taban fiyat</th><td>${money(m.floor.total ?? m.floor.raw)}${m.floor.perUnit != null ? ` · ${money(m.floor.perUnit)}/adet` : ''}</td></tr>` : ''}
        ${routes.filter((k) => exp[k] != null).map((k) => `<tr><th>Beklenen maliyet · ${ROUTE_LABELS[k] || k}</th><td>${money(exp[k])}${kg[k] != null ? ` · ${fmt(kg[k], 2)} €/kg` : ''}${k === m.basis?.key && routes.length > 1 ? ' (fiyat dayanağı)' : ''}</td></tr>`).join('')}
        ${m.quantity != null ? `<tr><th>Adet · ağırlık</th><td>${fmt(m.quantity, 0)} adet${m.unitKg != null ? ` · ${fmt(m.unitKg, 0)} kg/adet` : ''}${m.totalKg != null ? ` · ${fmt(m.totalKg, 0)} kg toplam` : ''}</td></tr>` : ''}
    </tbody></table>` : '';
    const costHtml = rows.length ? `
        <table class="cost">
            <thead><tr><th>Kalem</th>
                ${routes.includes('in_house') ? '<th>İç imalat Düşük</th><th>İç imalat Beklenen</th><th>İç imalat Yüksek</th>' : ''}
                ${routes.includes('subcontract') ? '<th>Taşeron Düşük</th><th>Taşeron Beklenen</th><th>Taşeron Yüksek</th>' : ''}
                <th>Dayanak</th></tr></thead>
            <tbody>${rows.map((r) => `<tr class="${r.key === 'total' ? 'total' : ''}"><td>${escapeHtml(r.label)}</td>
                ${routes.includes('in_house') ? [r.in_low, r.in_expected, r.in_high].map((v) => `<td class="n">${v == null ? '—' : fmt(v, r.key === 'eur_per_kg' ? 2 : 0)}</td>`).join('') : ''}
                ${routes.includes('subcontract') ? [r.sub_low, r.sub_expected, r.sub_high].map((v) => `<td class="n">${v == null ? '—' : fmt(v, r.key === 'eur_per_kg' ? 2 : 0)}</td>`).join('') : ''}
                <td class="basis">${escapeHtml(r.basis)}</td></tr>`).join('')}</tbody>
        </table>` : '';
    const weldHtml = weldSchedule ? `
        <h2>Kaynak listesi (1 adet) · v${weldSchedule.version}</h2>
        <table class="weld"><thead><tr><th>No</th><th>Birleşim</th><th>Tip</th><th>Malzeme</th><th>Ölçü</th><th>Proses</th><th class="n">Adet</th><th class="n">m/birleşim</th><th class="n">m toplam</th><th>NDT</th></tr></thead>
        <tbody>${(weldSchedule.joints || []).map((j) => `<tr><td>${escapeHtml(j.joint_id || '')}</td><td>${escapeHtml(j.description || '')}</td><td>${JOINT_TYPE_LABELS[j.joint_type] || escapeHtml(j.joint_type || '')}</td><td>${MATERIAL_LABELS[j.material] || escapeHtml(j.material || '')}</td><td>${escapeHtml(j.size || '')}</td><td>${escapeHtml(processLabel(j.process))}</td><td class="n">${j.count_per_unit ?? ''}</td><td class="n">${fmt(j.length_m_each, 3)}</td><td class="n">${fmt(j.total_m_per_unit, 2)}</td><td>${escapeHtml(j.ndt || '')}</td></tr>`).join('')}</tbody></table>` : '';
    const u = report.usage?.report || {};
    const html = `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
        <style>
            body { font: 11pt/1.45 "Segoe UI", Arial, sans-serif; color: #111; margin: 18mm 16mm; }
            h1 { font-size: 16pt; margin: 0 0 2mm; } h2 { font-size: 13pt; margin: 8mm 0 2mm; color: #3b1a8a; page-break-after: avoid; }
            h3 { font-size: 11.5pt; margin: 5mm 0 1.5mm; } h4, h5, h6 { font-size: 11pt; margin: 4mm 0 1mm; }
            .meta { color: #555; font-size: 9.5pt; margin-bottom: 4mm; }
            table { border-collapse: collapse; width: 100%; font-size: 9pt; margin: 2mm 0 4mm; page-break-inside: auto; }
            th, td { border: 1px solid #bbb; padding: 1.2mm 1.8mm; vertical-align: top; } th { background: #f1eafe; text-align: left; }
            table.summary th { width: 38%; } table.summary td { font-weight: 600; }
            td.n, th.n, .text-end { text-align: right; font-variant-numeric: tabular-nums; }
            tr.total td { font-weight: 700; background: #f8f6ff; } td.basis { color: #555; }
            tr { page-break-inside: avoid; } ul, ol { margin: 0 0 2mm; padding-left: 5mm; } p { margin: 0 0 2mm; }
            blockquote { margin: 0 0 3mm; padding: 1mm 3mm; border-left: 2pt solid #c4b5fd; color: #444; font-size: 9.5pt; }
            .foot { margin-top: 6mm; font-size: 8.5pt; color: #666; border-top: 1px solid #ddd; padding-top: 2mm; }
            @page { size: A4; margin: 12mm; }
        </style></head><body>
        <h1>${escapeHtml(title)}</h1>
        <div class="meta">${escapeHtml(report.customer || '')}${report.customer ? ' · ' : ''}${escapeHtml(formatDateTime(report.created_at))}${report.created_by_name ? ` · ${escapeHtml(report.created_by_name)}` : ''}
            ${report.review_decision ? ` · ${REVIEW_LABELS[report.review_decision]?.label}${report.reviewed_by_name ? ` (${escapeHtml(report.reviewed_by_name)})` : ''}` : ''}</div>
        ${summary}
        ${costHtml ? `<h2>Maliyet tablosu (€, toplam adet)</h2>${costHtml}` : ''}
        ${report.review_decision === 'correct' && report.review_note ? `<h2>Düzeltme notu</h2><p>${escapeHtml(report.review_note)}</p>` : ''}
        ${renderMarkdown(report.markdown, { headingOffset: 0 })}
        ${weldHtml}
        <div class="foot">${escapeHtml(report.model || '')} · ${u.seconds ? `${Math.round(u.seconds / 60)} dk · ` : ''}${report.usage_usd != null ? `${fmt(Number(report.usage_usd), 2)} USD · ` : ''}Yapay zekâ tahminidir; fiyatları ve saatleri referans işlerle doğrulayın.</div>
        </body></html>`;
    const win = window.open('', '_blank');
    if (!win) {
        showNotification('Yazdırma penceresi açılamadı (açılır pencere engellenmiş olabilir).', 'warning');
        return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { try { win.print(); } catch { /* the user can print from the window */ } }, 400);
}

// ---------------------------------------------------------------- helpers

function isOpen(status) {
    return status === 'queued' || status === 'running';
}

function statusPill(status) {
    const s = ESTIMATE_STATUS[status] || { label: escapeHtml(status), badge: 'status-grey', icon: '' };
    return `<span class="status-badge ${s.badge}">${s.icon ? `<i class="fas ${s.icon}"></i>` : ''}${s.label}</span>`;
}

function elapsed(startedAt) {
    if (!startedAt) return '';
    const mins = Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 60000));
    return mins ? ` · ${mins} dk` : '';
}

function firstLine(text) {
    return String(text || '').split('\n')[0].slice(0, 300);
}

function readFlag(key) {
    try { return localStorage.getItem(key) === '1'; } catch { return false; }
}

function writeFlag(key, value) {
    try { localStorage.setItem(key, value ? '1' : '0'); } catch { /* a per-viewer nicety */ }
}

function readList(key) {
    try {
        const v = JSON.parse(localStorage.getItem(key) || 'null');
        return Array.isArray(v) ? v : null;
    } catch { return null; }
}

function writeList(key, list) {
    try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* a per-viewer nicety */ }
}
