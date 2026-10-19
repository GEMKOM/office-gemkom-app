/**
 * Tahmin — the drawing-based cost and risk report of a job order or a
 * sales offer, as a card (the "Tahmin" tab of the job order modal, the
 * offer modal, and the row detail of /projects/estimates/).
 *
 * Modelled on the Neo Özeti card (discussion-summary.js): one saved report
 * per version, read for free by everyone with the `view_estimates` right;
 * a new version costs a model run (~2 USD, 7-10 min) and only starts when
 * someone clicks Oluştur / Yenile. While a run is queued or running the
 * card polls the server; the status pill is a badges.css status-badge.
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
    ESTIMATE_STATUS, REVIEW_LABELS, createEstimate, getEstimate, getLatestEstimate, getWeldSchedule, reviewEstimate,
} from '../../apis/estimator.js';

const POLL_MS = 5000;
const POLL_MAX = 180;           // 15 minutes; a run is 7-10
const WELD_OPEN_KEY = 'estimateWeldListOpen';

export const COST_ROW_LABELS = {
    material: 'Malzeme', labor: 'İşçilik', subcontractor: 'Taşeron', paint: 'Boya', paint_material: 'Boya Malzemesi',
    general_expenses: 'Genel Giderler', employee_overhead: 'Personel Genel Giderleri', qc: 'Kalite Kontrol',
    shipping: 'Sevkiyat', machine_rental: 'Makine Kirası', other: 'Diğer', total: 'TOPLAM', eur_per_kg: '€/kg',
};

export const JOINT_TYPE_LABELS = {
    pipe_butt: 'Boru alın', pipe_to_cap: 'Boru–kep', pipe_to_elbow: 'Boru–dirsek', pipe_to_plate: 'Boru–sac',
    plate_fillet: 'Sac köşe', plate_butt: 'Sac alın', stitch_fillet: 'Aralıklı köşe', pin_to_plate: 'Pim–sac',
    nozzle_coupling: 'Nozul/manşon', other: 'Diğer',
};
// Weld process codes of the extraction schema (estimator weld_extraction.JointSchema).
export const PROCESS_LABELS = {
    TIG_root_fill: 'TIG kök + TIG dolgu', TIG_root_MAG_fill: 'TIG kök + MAG dolgu', MAG: 'MAG', TIG_copper: 'TIG (bakır)', other: 'Diğer',
};
export function processLabel(code) {
    return PROCESS_LABELS[code] || String(code || '').replace(/_/g, ' ');
}
export const MATERIAL_LABELS = { copper: 'Bakır', carbon_steel: 'Çelik', stainless: 'Paslanmaz', copper_to_steel: 'Cu–çelik', other: 'Diğer' };

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
        report: null,          // the report being shown (any status)
        weldSchedule: null,    // the subject's weld list (from the report or the endpoint)
        hidden: false,
        error: null,
        actionError: null,
        busy: false,           // our own create / review request in flight
        noteOpen: false,
        weldOpen: readFlag(WELD_OPEN_KEY),
        methodOpen: false,
        methodHtml: null,      // "Nasıl çalışır?" (GET /estimator/method/), loaded on first open
        pollTimer: null,
        pollCount: 0,
        destroyed: false,
        tables: [],
    };

    // ------------------------------------------------------------ data

    async function load({ quiet = false, reportId = null } = {}) {
        try {
            let report;
            const id = reportId || (fixed ? subject.reportId : null);
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
            if (view.destroyed) return;
            view.report = report;
            view.error = null;
            view.hidden = false;
            view.weldSchedule = report?.weld_schedule || null;
            if (!view.weldSchedule && !fixed) {
                try {
                    view.weldSchedule = await getWeldSchedule(subject);
                } catch (error) {
                    if (error.status !== 404) console.warn('Kaynak listesi yüklenemedi:', error);
                }
                if (view.destroyed) return;
            }
            if (report && isOpen(report.status)) startPolling();
            else stopPolling();
        } catch (error) {
            if (view.destroyed) return;
            if (error.status === 403) {
                view.hidden = true;
            } else if (!quiet) {
                console.error('Tahmin yüklenemedi:', error);
                view.error = error.message;
            }
        }
        render();
        onChange?.(view.report);
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
            showNotification(`Tahmin v${row.version} sıraya alındı. 7–10 dakika sürer; bu sekme kendini günceller.`, 'info');
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
            view.report = report;
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

    function startPolling() {
        stopPolling();
        view.pollCount = 0;
        const tick = async () => {
            view.pollCount += 1;
            if (view.destroyed || view.pollCount > POLL_MAX) return;
            await load({ quiet: true, reportId: view.report?.id });
            if (!view.destroyed && view.report && isOpen(view.report.status) && view.pollCount <= POLL_MAX) {
                view.pollTimer = setTimeout(tick, POLL_MS);
            }
        };
        view.pollTimer = setTimeout(tick, POLL_MS);
    }

    function stopPolling() {
        if (view.pollTimer) clearTimeout(view.pollTimer);
        view.pollTimer = null;
    }

    // ------------------------------------------------------------ render

    function render() {
        if (view.destroyed) return;
        destroyTables();
        if (view.hidden) {
            container.innerHTML = '';
            return;
        }
        if (view.error && !view.report) {
            container.innerHTML = `
                <div class="est-report">
                    <div class="est-report-empty">
                        <i class="fas fa-calculator me-1"></i> Tahmin yüklenemedi: ${escapeHtml(view.error)}
                        <button type="button" class="btn btn-link btn-sm p-0 ms-1" data-est-action="retry">Tekrar dene</button>
                    </div>
                </div>`;
            return;
        }
        if (!view.report && !view.error && view.pollCount === 0 && view.weldSchedule === null && !view._loaded) {
            // first paint, before the first answer
            container.innerHTML = `<div class="est-report"><div class="est-report-progress">
                <span class="spinner-border spinner-border-sm" role="status"></span> Tahmin yükleniyor…</div></div>`;
        }
        view._loaded = true;

        const r = view.report;
        container.innerHTML = `
            <div class="est-report">
                <div class="est-report-head">
                    <div class="est-report-heading">
                        <span class="est-report-icon"><i class="fas fa-calculator"></i></span>
                        <div>
                            <div class="est-report-title">
                                Tahmin raporu
                                ${r ? `<span class="est-report-version">v${r.version}</span>` : ''}
                                ${r ? statusPill(r.status) : ''}
                            </div>
                            <div class="est-report-sub">${subLine(r)}</div>
                        </div>
                    </div>
                    <div class="est-report-actions">${actions(r)}</div>
                </div>
                ${view.actionError ? `<div class="est-report-alert"><i class="fas fa-circle-exclamation mt-1"></i><span>${escapeHtml(view.actionError)}</span></div>` : ''}
                ${body(r)}
                ${r && r.status === 'done' ? foot(r) : ''}
            </div>`;
        mountTables(r);
    }

    function subLine(r) {
        if (!r) {
            const ws = view.weldSchedule;
            return ws
                ? `Henüz rapor yok · kaynak listesi v${ws.version} hazır (${ws.totals?.joints_total ?? 0} birleşim, ${fmt(ws.totals?.weld_m_total, 1)} m)`
                : 'Henüz rapor yok · çizimlerden kaynak listesi çıkarılır, sonra rapor yazılır.';
        }
        const parts = [];
        parts.push(`${escapeHtml(formatDateTime(r.created_at))}${r.created_by_name ? ` · ${escapeHtml(r.created_by_name)}` : ''}`);
        if (r.status === 'done') {
            const rv = REVIEW_LABELS[r.review_decision || ''] || REVIEW_LABELS[''];
            parts.push(`<span class="status-badge ${rv.badge}">${rv.label}</span>`);
            if (r.reviewed_by_name) parts.push(`${escapeHtml(r.reviewed_by_name)} · ${escapeHtml(formatDateTime(r.reviewed_at))}`);
        }
        if (isOpen(r.status)) {
            parts.push(`<span class="spinner-border spinner-border-sm" role="status"></span> ${r.status === 'queued' ? 'Sırada bekliyor' : `Çalışıyor${elapsed(r.started_at)}`} · 7–10 dakika sürer, bu kart kendini günceller.`);
        }
        return parts.join('<span class="mx-1">·</span>');
    }

    function actions(r) {
        const buttons = [];
        const busy = view.busy;
        const versions = r?.versions || [];
        if (versions.length > 1) {
            buttons.push(`<select class="form-select form-select-sm" data-est-action="version" title="Sürüm">
                ${versions.slice().reverse().map((v) => `<option value="${v.id}" ${v.id === r.id ? 'selected' : ''}>v${v.version} · ${ESTIMATE_STATUS[v.status]?.label || v.status}${v.review_decision ? ` · ${REVIEW_LABELS[v.review_decision]?.label}` : ''}</option>`).join('')}
            </select>`);
        }
        if (createSubject() && (!r || !isOpen(r.status))) {
            buttons.push(`<button type="button" class="btn btn-sm est-report-generate" data-est-action="generate" ${busy ? 'disabled' : ''}>
                <i class="fas ${r ? 'fa-rotate' : 'fa-wand-magic-sparkles'} me-1"></i>${r ? 'Yenile' : 'Oluştur'}</button>`);
        }
        if (r && r.status === 'done') {
            if (r.review_decision !== 'accept') {
                buttons.push(`<button type="button" class="btn btn-sm btn-outline-success" data-est-action="accept" ${busy ? 'disabled' : ''}>
                    <i class="fas fa-check me-1"></i>Kabul</button>`);
            }
            buttons.push(`<button type="button" class="btn btn-sm btn-outline-secondary" data-est-action="note" ${busy ? 'disabled' : ''}>
                <i class="fas fa-pen me-1"></i>Düzeltme notu</button>`);
            buttons.push(`<button type="button" class="btn btn-sm btn-outline-secondary" data-est-action="print">
                <i class="fas fa-file-pdf me-1"></i>PDF indir</button>`);
        }
        return buttons.join('');
    }

    function body(r) {
        if (!r) {
            return `
                <div class="est-report-empty">
                    ${fixed && !createSubject() ? 'Rapor bulunamadı.' : `<i class="fas fa-wand-magic-sparkles me-1" style="color:#6d28d9"></i>
                    <strong>Oluştur</strong> ile çizimlerden kaynak listesi çıkarılır, benzer işlerle kalibre edilir ve beş bölümlük tahmin raporu yazılır
                    (malzeme, işçilik iki rotayla, teklif önerisi, dikkat noktaları, istenecekler). Bir çalıştırma yaklaşık 2 USD ve 7–10 dakikadır.`}
                </div>
                ${view.weldSchedule ? `<div class="est-report-body">${weldSection(view.weldSchedule)}</div>` : ''}`;
        }
        if (isOpen(r.status)) {
            return `<div class="est-report-progress">
                <i class="fas fa-hourglass-half" style="color:#6d28d9"></i>
                <span>${r.status === 'queued' ? 'Çalıştırma sırada.' : 'Çizimler okunuyor, kaynak listesi ve rapor yazılıyor.'}
                ${r.inputs?.weld_schedule_version ? '' : 'İlk çalıştırmada kaynak listesi çıkarımı da yapılır.'}</span>
            </div>`;
        }
        if (r.status === 'failed') {
            return `<div class="est-report-alert"><i class="fas fa-triangle-exclamation mt-1"></i>
                <span><strong>Çalıştırma başarısız.</strong> ${escapeHtml(firstLine(r.error))}
                ${createSubject() ? '<br>Yenile ile yeni bir sürüm başlatılabilir.' : ''}</span></div>
                ${view.weldSchedule ? `<div class="est-report-body">${weldSection(view.weldSchedule)}</div>` : ''}`;
        }
        // done
        const sections = [];
        sections.push(section('Özet', tiles(r)));
        if (view.noteOpen) {
            sections.push(section('Düzeltme notu', `
                <form class="est-report-note-form" data-est-form="note">
                    <textarea class="form-control" rows="3" name="note" placeholder="Nerede, neden düzeltme gerekiyor? (ör. bakır fiyatı güncel değil)" required>${escapeHtml(r.review_note || '')}</textarea>
                    <div class="d-flex gap-2 mt-2">
                        <button type="submit" class="btn btn-sm est-report-generate" ${view.busy ? 'disabled' : ''}><i class="fas fa-save me-1"></i>Kaydet</button>
                        <button type="button" class="btn btn-sm btn-outline-secondary" data-est-action="note-cancel">Vazgeç</button>
                    </div>
                </form>`));
        } else if (r.review_decision === 'correct' && r.review_note) {
            sections.push(section('Düzeltme notu', `<div class="est-report-review"><div class="est-note">${escapeHtml(r.review_note)}</div></div>`));
        }
        if (r.cost_table?.found && (r.cost_table.rows || []).length) {
            sections.push(section('Maliyet tablosu (€, toplam adet)', `<div id="${uid}-cost"></div>`));
        }
        sections.push(section('Rapor', `<div class="est-markdown">${renderMarkdown(r.markdown, { headingOffset: 1 })}</div>`));
        if (view.weldSchedule) sections.push(weldSection(view.weldSchedule));
        const q = r.questions || {};
        if ((q.design?.length || q.customer?.length || q.procurement?.length)) {
            sections.push(section('Teklif öncesi istenecekler', `
                <div class="est-questions">
                    ${questionList('Tasarımdan', q.design)}
                    ${questionList('Müşteriden', q.customer)}
                    ${questionList('Satın almadan', q.procurement)}
                </div>`));
        }
        sections.push(methodSection());
        return `<div class="est-report-body">${sections.join('')}</div>`;
    }

    function tiles(r) {
        const ct = r.cost_table || {};
        const exp = ct.expected_total || {};
        const kg = ct.eur_per_kg || {};
        const price = r.suggested_price_eur ?? r.hours?.summary?.suggested_price_eur;
        const floor = r.hours?.summary?.floor_price_eur;
        const hrs = r.hours || {};
        const tile = (label, value, small = '') => `<div class="est-tile"><div class="est-tile-label">${label}</div><div class="est-tile-value">${value}${small ? ` <small>${small}</small>` : ''}</div></div>`;
        return `<div class="est-tiles">
            ${tile('Beklenen maliyet · iç imalat', money(exp.in_house), kg.in_house != null ? `${fmt(kg.in_house, 2)} €/kg` : '')}
            ${tile('Beklenen maliyet · taşeron', money(exp.subcontract), kg.subcontract != null ? `${fmt(kg.subcontract, 2)} €/kg` : '')}
            ${tile('Önerilen fiyat', money(price), floor != null ? `taban ${money(floor)}` : '')}
            ${tile('Kaynak saati · iç imalat', hrs.expected_h_total != null ? `${fmt(hrs.expected_h_total, 0)} h` : '—',
                hrs.low_h_total != null ? `${fmt(hrs.low_h_total, 0)}–${fmt(hrs.high_h_total, 0)} h · faktör ${fmt(hrs.calibration?.in_house?.factor_mean, 2)}` : 'kalibrasyon yok')}
        </div>`;
    }

    function weldSection(ws) {
        const t = ws.totals || {};
        const byMat = Object.entries(t.weld_m_by_material || {}).map(([m, v]) => `${MATERIAL_LABELS[m] || m} ${fmt(v, 1)} m`).join(', ');
        const bu = ws.bottom_up || {};
        const summary = `<div class="est-weld-summary">
            <strong>${t.joints_total ?? 0} birleşim</strong>, <strong>${fmt(t.weld_m_total, 1)} m</strong> kaynak / adet${byMat ? ` (${byMat})` : ''} ·
            ${ws.pieces_to_cut_per_unit ?? 0} parça, ${ws.bends_per_unit ?? 0} büküm · birim kütle ${fmt(ws.unit_mass_kg, 0)} kg${ws.mass_basis ? ` [${escapeHtml(ws.mass_basis)}]` : ''} ·
            standart birim sürelerle <strong>${fmt(bu.total_h, 1)} h/adet</strong> (kaynak ${fmt(bu.welding_h, 1)} + diğer ${fmt(bu.non_welding_h, 1)}) · güven ${fmt((ws.confidence || 0) * 100, 0)}% · v${ws.version}
        </div>`;
        const toggle = `<button type="button" class="btn btn-link btn-sm" data-est-action="weld-toggle">${view.weldOpen ? 'Gizle' : 'Listeyi göster'}</button>`;
        const open = view.weldOpen ? `<div id="${uid}-weld"></div>
            ${(ws.open_questions || []).length ? `<div class="mt-2 small text-muted"><strong>Çizimin söylemediği:</strong> ${ws.open_questions.map(escapeHtml).join(' · ')}</div>` : ''}` : '';
        return section(`Kaynak listesi (1 adet)`, summary + open, toggle);
    }

    function methodSection() {
        const toggle = `<button type="button" class="btn btn-link btn-sm" data-est-action="method-toggle">${view.methodOpen ? 'Gizle' : 'Göster'}</button>`;
        let html = '<span class="small text-muted">Kaynak listesi, birim süreler, referans seçimi ve faktör.</span>';
        if (view.methodOpen) {
            html = view.methodHtml
                ? `<div class="est-markdown">${view.methodHtml}</div>`
                : '<span class="small text-muted"><i class="fas fa-spinner fa-spin me-1"></i>Yükleniyor…</span>';
        }
        return section('Nasıl çalışır?', html, toggle);
    }

    function toggleMethod() {
        view.methodOpen = !view.methodOpen;
        render();
        if (view.methodOpen && !view.methodHtml) {
            loadMethodHtml()
                .then((html) => { view.methodHtml = html; })
                .catch((error) => { view.methodHtml = `<span class="text-danger">${escapeHtml(error.message || 'Açıklama yüklenemedi')}</span>`; })
                .finally(() => { if (!view.destroyed) render(); });
        }
    }

    function foot(r) {
        const u = r.usage?.report || {};
        const secs = u.seconds ? `${Math.round(u.seconds / 60)} dk` : '';
        return `<div class="est-report-foot">
            ${r.model ? `${escapeHtml(r.model)} · ` : ''}${secs ? `${secs} · ` : ''}${r.usage_usd != null ? `${fmt(Number(r.usage_usd), 2)} USD` : ''}
            ${r.inputs?.weld_schedule_version ? ` · kaynak listesi v${r.inputs.weld_schedule_version}${r.inputs.weld_schedule_created ? ' (bu çalıştırmada çıkarıldı)' : ''}` : ''}
            ${r.inputs?.references_used?.length ? ` · kalibrasyon: ${r.inputs.references_used.map(escapeHtml).join(', ')}` : ''}
            · Yapay zekâ tahminidir; fiyatları ve saatleri referans işlerle doğrulayın.
        </div>`;
    }

    function section(title, html, extra = '') {
        return `<section class="est-report-section"><h6 class="est-report-section-title"><span>${title}</span>${extra}</h6>${html}</section>`;
    }

    function questionList(title, items) {
        if (!items || !items.length) return '';
        return `<div><h6>${title}</h6><ul>${items.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul></div>`;
    }

    // ------------------------------------------------------------ tables

    function mountTables(r) {
        const costHost = container.querySelector(`#${uid}-cost`);
        if (costHost && r?.cost_table?.rows) {
            view.tables.push(new TableComponent(`${uid}-cost`, {
                columns: costTableColumns(r.cost_table),
                data: costTableRows(r.cost_table),
                sortable: false,
                pagination: false,
                showHeader: false,
                small: true,
                skeleton: false,
                rowAttributes: (row) => (row.key === 'total' || row.key === 'eur_per_kg' ? { class: 'est-total' } : {}),
                emptyMessage: 'Maliyet tablosu ayrıştırılamadı',
            }));
        }
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

    // ------------------------------------------------------------ events

    function onClick(event) {
        const el = event.target.closest('[data-est-action]');
        if (!el || !container.contains(el) || el.tagName === 'SELECT') return;
        const action = el.dataset.estAction;
        if (action === 'generate') generate();
        else if (action === 'retry') load();
        else if (action === 'accept') review('accept');
        else if (action === 'note') { view.noteOpen = true; render(); }
        else if (action === 'note-cancel') { view.noteOpen = false; render(); }
        else if (action === 'print') printReport(view.report, view.weldSchedule);
        else if (action === 'method-toggle') toggleMethod();
        else if (action === 'weld-toggle') { view.weldOpen = !view.weldOpen; writeFlag(WELD_OPEN_KEY, view.weldOpen); render(); }
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
    render();
    load();

    return {
        refresh: () => load({ quiet: true, reportId: view.report?.id }),
        destroy() {
            view.destroyed = true;
            stopPolling();
            destroyTables();
            container.removeEventListener('click', onClick);
            container.removeEventListener('change', onChangeEvent);
            container.removeEventListener('submit', onSubmit);
            container.innerHTML = '';
        },
    };
}

// ---------------------------------------------------------------- cost table

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
    const s = ESTIMATE_STATUS[status] || { label: status, badge: 'status-grey', icon: '' };
    return `<span class="status-badge ${s.badge}">${s.icon ? `<i class="fas ${s.icon}"></i>` : ''}${s.label}</span>`;
}

function elapsed(startedAt) {
    if (!startedAt) return '';
    const mins = Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 60000));
    return mins ? ` (${mins} dk)` : '';
}

function firstLine(text) {
    return String(text || '').split('\n')[0].slice(0, 300);
}

export function fmt(value, digits = 0) {
    if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '—';
    return Number(value).toLocaleString('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function money(value) {
    return value == null ? '—' : `${fmt(value, 0)} €`;
}

function formatDateTime(value) {
    if (!value) return '';
    return new Date(value).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function readFlag(key) {
    try { return localStorage.getItem(key) === '1'; } catch { return false; }
}

function writeFlag(key, value) {
    try { localStorage.setItem(key, value ? '1' : '0'); } catch { /* a per-viewer nicety */ }
}
