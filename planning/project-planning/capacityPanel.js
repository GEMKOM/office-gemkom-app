/**
 * Kapasite drawer — renders GET /welding/planning/capacity/ next to the sheet.
 *
 * Advisory only (user decision 2026-09-16): the drawer explains which team /
 * subcontractor is too full, which blocks will miss their deadline, what a
 * plan for an unplanned job would look like and who could absorb unassigned
 * kg. Nothing here writes to the plan; "Göster" only navigates the sheet.
 * The one write is the resource's manual capacity override, a resource
 * attribute the planner owns.
 *
 * The host is a Bootstrap offcanvas placed at body level (index.html) with
 * no backdrop and body scroll on, so the grid stays editable while the
 * drawer is open. Sentences come from capacityText.js (tested under node).
 */

import { getWeldingCapacityReport } from '../../apis/welding/planning.js';
import { updateTeam } from '../../apis/welding/teams.js';
import { updateSubcontractor } from '../../apis/subcontracting/subcontractors.js';
import { showNotification } from '../../components/notification/notification.js';
import {
    SUGGESTION_ICONS, backlogSentence, blockVerdictLabel, deadlineText,
    difficultySentence, fmtDateTr, fmtKgText, fmtPerWeek, formatTonnes,
    headcountSentence, indexBlocksByKey, indexResourcesByKey, lateBlocks,
    overdueBlocks, planOrder, planStartBlocks, pressureSentence, rateSentence,
    resourceVerdictSentence, suggestionSentence, summaryLine, verdictMeta,
} from './capacityText.js';

const MONTHS_KEY = 'imalatPlanlama.capacityMonths';
const DIFFICULTY_KEY = 'imalatPlanlama.capacityDifficulty';
const MAX_AGE_MS = 5 * 60 * 1000;   // stale-while-revalidate, like the meeting deck

function esc(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function readStored(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
    } catch (e) {
        return fallback;
    }
}

function store(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ }
}

const THEME_OF_BADGE = {
    'status-green': 'green', 'status-orange': 'orange', 'status-red': 'red', 'status-grey': 'grey',
};

const SUGGESTION_CLASS = {
    late_on_resource: 'cap-sugg-late', no_alternative: 'cap-sugg-late', no_capacity: 'cap-sugg-late',
    deadline_passed: 'cap-sugg-late', move_to: 'cap-sugg-move', assign_to: 'cap-sugg-move',
    start_earlier: 'cap-sugg-move', no_plan: 'cap-sugg-plan',
};

const NOOP_API = {
    open() {}, close() {}, toggle() {}, refresh() {}, isOpen() { return false; },
    hasLoaded() { return false; }, getReport() { return null; },
};

export function initCapacityPanel({
    hostId = 'capacity-drawer', onReport, onLocate, hasUnsavedChanges,
} = {}) {
    const host = document.getElementById(hostId);
    const body = host ? host.querySelector('#cap-drawer-body') : null;
    const stamp = host ? host.querySelector('#cap-drawer-stamp') : null;
    if (!host || !body) return NOOP_API;

    let report = null;
    let loadedAt = 0;
    let fetchSeq = 0;
    let isOpen = false;
    let months = Number(readStored(MONTHS_KEY, 6)) || 6;
    let difficulty = readStored(DIFFICULTY_KEY, true) !== false;

    const offcanvas = () => (window.bootstrap && window.bootstrap.Offcanvas)
        ? window.bootstrap.Offcanvas.getOrCreateInstance(host) : null;

    host.addEventListener('shown.bs.offcanvas', () => { isOpen = true; });
    host.addEventListener('hidden.bs.offcanvas', () => { isOpen = false; });

    // ---- toolbar ---------------------------------------------------------
    function syncToolbar() {
        host.querySelectorAll('[data-cap-months]').forEach(btn => {
            btn.classList.toggle('active', Number(btn.dataset.capMonths) === months);
        });
        host.querySelectorAll('[data-cap-difficulty]').forEach(btn => {
            btn.classList.toggle('active', (btn.dataset.capDifficulty === '1') === difficulty);
        });
    }

    host.addEventListener('click', (e) => {
        const monthsBtn = e.target.closest('[data-cap-months]');
        if (monthsBtn) {
            months = Number(monthsBtn.dataset.capMonths) || 6;
            store(MONTHS_KEY, months);
            syncToolbar();
            load({ silent: false });
            return;
        }
        const diffBtn = e.target.closest('[data-cap-difficulty]');
        if (diffBtn) {
            difficulty = diffBtn.dataset.capDifficulty === '1';
            store(DIFFICULTY_KEY, difficulty);
            syncToolbar();
            load({ silent: false });
            return;
        }
        if (e.target.closest('#cap-refresh') || e.target.closest('[data-cap-retry]')) {
            load({ silent: false });
            return;
        }
        const save = e.target.closest('[data-cap-save]');
        if (save) {
            saveCapacity(save.dataset.capSave, false);
            return;
        }
        const clear = e.target.closest('[data-cap-clear]');
        if (clear) {
            saveCapacity(clear.dataset.capClear, true);
            return;
        }
        const locate = e.target.closest('[data-cap-locate]');
        if (locate && typeof onLocate === 'function') {
            onLocate({
                blockKey: locate.dataset.blockKey || null,
                resourceKey: locate.dataset.resourceKey || null,
                jobNo: locate.dataset.jobNo || null,
            });
        }
    });

    host.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target && e.target.classList
                && e.target.classList.contains('cap-rate-input')) {
            e.preventDefault();
            saveCapacity(e.target.dataset.resourceKey, false);
        }
    });

    // ---- data --------------------------------------------------------------
    async function load({ silent = true } = {}) {
        const seq = ++fetchSeq;
        if (!report) renderLoading();
        try {
            const data = await getWeldingCapacityReport({ months, difficulty });
            if (seq !== fetchSeq) return;          // a newer request superseded this one
            report = data;
            loadedAt = Date.now();
            render();
            if (typeof onReport === 'function') {
                onReport({
                    report,
                    byBlockKey: indexBlocksByKey(report),
                    byResourceKey: indexResourcesByKey(report),
                });
            }
        } catch (e) {
            if (seq !== fetchSeq) return;
            if (!report) renderError(e.message);
            if (!silent) showNotification(e.message, 'error');
        }
    }

    async function saveCapacity(resourceKey, clear) {
        if (!report) return;
        const res = indexResourcesByKey(report).get(resourceKey);
        if (!res) return;
        let value = null;
        if (!clear) {
            const input = host.querySelector(`.cap-rate-input[data-resource-key="${CSS.escape(resourceKey)}"]`);
            const raw = input ? String(input.value).replace(',', '.').trim() : '';
            if (raw !== '') {
                value = Number(raw);
                if (!Number.isFinite(value) || value <= 0) {
                    showNotification('Kapasite 0\'dan büyük bir sayı olmalı.', 'error');
                    return;
                }
                value = Math.round(value * 10) / 10;
            }
        }
        try {
            const payload = { capacity_kg_per_wd: value };
            if (res.resource_type === 'team') await updateTeam(res.id, payload);
            else await updateSubcontractor(res.id, payload);
            showNotification(value == null
                ? 'Elle girilen kapasite kaldırıldı — rapor yenileniyor.'
                : 'Kapasite kaydedildi — rapor yenileniyor.', 'success');
            await load({ silent: false });
        } catch (e) {
            showNotification(e.message || 'Kapasite kaydedilemedi.', 'error');
        }
    }

    // ---- rendering ---------------------------------------------------------
    function setStamp() {
        if (!stamp) return;
        if (!report || !report.generated_at) { stamp.textContent = ''; return; }
        const d = new Date(report.generated_at);
        const time = Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        const p = report.params || {};
        const ref = p.difficulty && p.reference_eur_per_kg != null
            ? ` · referans ${Number(p.reference_eur_per_kg).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} €/kg`
            : (p.difficulty ? '' : ' · zorluk ağırlığı kapalı');
        stamp.textContent = `Veri ${time}${ref}`;
    }

    function renderLoading() {
        body.innerHTML = `
            <div class="cap-loading">
                <div class="spinner-border spinner-border-sm text-secondary me-2" role="status"></div>
                Kapasite hesaplanıyor…
            </div>`;
    }

    function renderError(message) {
        body.innerHTML = `
            <div class="cap-note cap-note-error">Kapasite raporu yüklenemedi. ${esc(message || '')}</div>
            <button type="button" class="btn btn-sm btn-outline-secondary" data-cap-retry="1">Tekrar dene</button>`;
    }

    function locateBtn({ blockKey, resourceKey, jobNo }, label = 'Göster') {
        return `<button type="button" class="cap-locate" data-cap-locate="1"
                    data-block-key="${esc(blockKey || '')}" data-resource-key="${esc(resourceKey || '')}"
                    data-job-no="${esc(jobNo || '')}" title="Tabloda göster">${esc(label)}</button>`;
    }

    function chip(block) {
        const label = blockVerdictLabel(block);
        const cls = block.verdict === 'late_risk' ? 'cap-late-chip'
            : block.verdict === 'on_track' && block.late_cause !== 'plan_start' ? 'cap-early-chip'
            : 'cap-muted-chip';
        return `<span class="${cls}">${esc(label)}</span>`;
    }

    function jobCell(block) {
        return `<span class="cap-job">${esc(block.job_no)}<span class="cap-job-sub">${esc(block.job_order_title || '')}</span></span>`;
    }

    function suggestionList(suggestions, ctx, skipKinds = []) {
        const items = (suggestions || [])
            .filter(s => s && !skipKinds.includes(s.kind))
            .map(s => ({ s, text: suggestionSentence(s, ctx) }))
            .filter(x => x.text);
        if (!items.length) return '';
        return `<ul class="cap-sugg">${items.map(({ s, text }) => `
            <li class="${SUGGESTION_CLASS[s.kind] || ''}"><i class="fas ${SUGGESTION_ICONS[s.kind] || 'fa-circle-info'}"></i><span>${esc(text)}</span></li>`).join('')}</ul>`;
    }

    function planTable(res) {
        const rows = planOrder(res.blocks || []);
        if (!rows.length) return '';
        return `
            <details class="cap-plan">
                <summary>Sıralı plan — ${rows.length} blok</summary>
                <div class="cap-table-wrap"><table class="cap-table">
                    <thead><tr><th>İş</th><th class="cap-td-num">Kalan</th><th>Zorluk</th><th>Termin</th><th>En erken bitiş</th><th>Durum</th><th></th></tr></thead>
                    <tbody>${rows.map(b => `
                        <tr class="${b.verdict === 'late_risk' ? ((b.flags || []).includes('deadline_passed') ? 'cap-row-overdue' : 'cap-row-late') : ''}">
                            <td>${jobCell(b)}</td>
                            <td class="cap-td-num">${esc(fmtKgText(b.remaining_kg))} kg</td>
                            <td title="${esc(difficultySentence(b, report.params))}">${esc(b.difficulty != null ? `×${Number(b.difficulty).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}` : '—')}</td>
                            <td class="cap-td-date" title="${esc(deadlineText(b.deadline, b.deadline_basis))}">${esc(fmtDateTr(b.deadline))}</td>
                            <td class="cap-td-date">${esc(b.finish ? fmtDateTr(b.finish) : (b.verdict === 'no_data' ? '—' : 'ufuk dışı'))}</td>
                            <td>${chip(b)}</td>
                            <td>${locateBtn({ blockKey: `${b.assignment_type}-${b.assignment_id}`, resourceKey: res.key, jobNo: b.job_no })}</td>
                        </tr>`).join('')}</tbody>
                </table></div>
            </details>`;
    }

    function capacityEditor(res) {
        if (report.params && report.params.ignore_manual_rates) {
            return '<div class="cap-card-edit"><span>Elle kapasite girişi bu ortamda kapalı — kapasite sütunları henüz uygulanmamış.</span></div>';
        }
        const manual = res.rate_source === 'manual' && res.rate_kg_per_wd != null ? res.rate_kg_per_wd : '';
        const measured = res.rate_source !== 'manual' && res.rate_kg_per_wd != null
            ? `ölçülen ≈ ${Math.round(res.rate_kg_per_wd)}` : 'örn. 500';
        const perWeek = res.rate_kg_per_wd != null ? ` (≈ ${fmtPerWeek(res.rate_kg_per_wd)})` : '';
        return `
            <div class="cap-card-edit">
                <span>Kapasite</span>
                <input type="number" min="0" step="10" class="form-control form-control-sm cap-rate-input"
                       data-resource-key="${esc(res.key)}" value="${esc(manual)}" placeholder="${esc(measured)}"
                       title="Ortalama zorlukta bir iş için kg/iş günü. Boş bırakılırsa geçmişten ölçülür.">
                <span>kg-eş/iş günü${esc(perWeek)}</span>
                <button type="button" class="btn btn-outline-secondary" data-cap-save="${esc(res.key)}">Kaydet</button>
                ${res.rate_source === 'manual' ? `<button type="button" class="btn btn-outline-secondary" data-cap-clear="${esc(res.key)}" title="Elle girilen değeri kaldır, ölçüme dön">Sil</button>` : ''}
            </div>`;
    }

    function resourceCard(res, compact = false) {
        const meta = verdictMeta(res.verdict, 'resource');
        const theme = THEME_OF_BADGE[meta.badge] || 'grey';
        const kindBadge = res.resource_type === 'team'
            ? '<span class="status-badge status-blue">Ekip</span>'
            : '<span class="status-badge status-purple">Taşeron</span>';
        const icon = res.resource_type === 'team' ? 'fa-users' : 'fa-industry';
        const facts = [
            ['Hız', rateSentence(res, months)],
            res.resource_type === 'subcontractor' ? ['Kişi', headcountSentence(res)] : null,
            ['Açık iş', backlogSentence(res)],
            !compact && res.required_eff_kg_per_wd != null ? ['Baskı', pressureSentence(res)] : null,
        ].filter(Boolean);
        return `
            <div class="cap-card cap-v-${theme}${compact ? ' cap-card-compact' : ''}" data-resource-key="${esc(res.key)}">
                <div class="cap-card-head">
                    <i class="fas ${icon}"></i>
                    <span class="cap-card-name">${esc(res.display_name || res.name)}</span>
                    ${kindBadge}
                    <span class="status-badge ${meta.badge} cap-verdict-badge"><i class="fas ${meta.icon} me-1"></i>${esc(meta.label)}</span>
                </div>
                ${compact ? '' : `<div class="cap-card-verdict cap-v-${theme}"><i class="fas ${meta.icon}"></i><span>${esc(resourceVerdictSentence(res))}</span></div>`}
                <div class="cap-facts">${facts.map(([k, v]) => `<span class="cap-fact-label">${esc(k)}</span><span class="cap-fact-value">${esc(v)}</span>`).join('')}</div>
                ${compact ? '' : suggestionList(res.suggestions, { resource: res })}
                ${compact ? '' : planTable(res)}
                ${capacityEditor(res)}
            </div>`;
    }

    function lateSection() {
        const late = lateBlocks(report);
        if (!late.length) {
            return '<div class="cap-section">Termine yetişmeyen bloklar</div><div class="cap-empty">Termine yetişmeyen blok yok.</div>';
        }
        return `
            <div class="cap-section">Termine yetişmeyen bloklar (${late.length})</div>
            <div class="cap-table-wrap"><table class="cap-table cap-problems">
                <thead><tr><th>İş</th><th>Kaynak</th><th class="cap-td-num">Kalan</th><th>Termin</th><th>En erken bitiş</th><th>Gecikme</th><th>Öneriler</th><th></th></tr></thead>
                <tbody>${late.map(({ block, resource }) => `
                    <tr class="cap-row-late">
                        <td>${jobCell(block)}</td>
                        <td>${esc(resource.display_name || resource.name)}</td>
                        <td class="cap-td-num">${esc(fmtKgText(block.remaining_kg))} kg</td>
                        <td class="cap-td-date" title="${esc(deadlineText(block.deadline, block.deadline_basis))}">${esc(fmtDateTr(block.deadline))}</td>
                        <td class="cap-td-date">${esc(block.relaxed_finish ? fmtDateTr(block.relaxed_finish) : 'ufuk dışı')}</td>
                        <td>${chip(block)}</td>
                        <td>${suggestionList(block.suggestions, { block, resource }, ['no_plan', 'late_on_resource'])}</td>
                        <td>${locateBtn({ blockKey: `${block.assignment_type}-${block.assignment_id}`, resourceKey: resource.key, jobNo: block.job_no })}</td>
                    </tr>`).join('')}</tbody>
            </table></div>`;
    }

    function planStartSection() {
        const items = planStartBlocks(report);
        if (!items.length) return '';
        return `
            <div class="cap-section">Plan başlangıcı geç kalan bloklar (${items.length})</div>
            <div class="cap-table-wrap"><table class="cap-table">
                <thead><tr><th>İş</th><th>Kaynak</th><th>Öneri</th><th></th></tr></thead>
                <tbody>${items.map(({ block, resource }) => `
                    <tr>
                        <td>${jobCell(block)}</td>
                        <td>${esc(resource.display_name || resource.name)}</td>
                        <td>${suggestionList(block.suggestions, { block, resource }, ['no_plan'])}</td>
                        <td>${locateBtn({ blockKey: `${block.assignment_type}-${block.assignment_id}`, resourceKey: resource.key, jobNo: block.job_no })}</td>
                    </tr>`).join('')}</tbody>
            </table></div>`;
    }

    function unplannedSection() {
        const jobs = report.unplanned_jobs || [];
        if (!jobs.length) return '';
        return `
            <div class="cap-section">Plan girilmemiş işler (${jobs.length})</div>
            <div class="cap-table-wrap"><table class="cap-table">
                <thead><tr><th>İş</th><th>Termin</th><th>Öneri</th><th></th></tr></thead>
                <tbody>${jobs.map(p => `
                    <tr>
                        <td><span class="cap-job">${esc(p.job_no)}<span class="cap-job-sub">${esc(p.job_order_title || '')}</span></span></td>
                        <td class="cap-td-date" title="${esc(deadlineText(p.deadline, p.deadline_basis))}">${esc(fmtDateTr(p.deadline))}</td>
                        <td>${suggestionList([p], { })}</td>
                        <td>${locateBtn({ resourceKey: 'all', jobNo: p.job_no })}</td>
                    </tr>`).join('')}</tbody>
            </table></div>`;
    }

    function unassignedSection() {
        const items = report.unassigned || [];
        if (!items.length) return '';
        return `
            <div class="cap-section">Atanmamış işler (${items.length})</div>
            ${items.map(u => `
                <div class="cap-unassigned-item">
                    <div class="cap-unassigned-head">
                        <span class="cap-job">${esc(u.job_no)}</span>
                        <span>${esc(u.job_order_title || '')}</span>
                        <span class="cap-muted-chip">${esc(formatTonnes(u.remaining_weight_kg))} atanmamış</span>
                        <span class="text-muted">${esc(deadlineText(u.deadline, u.deadline_basis))}</span>
                        ${locateBtn({ resourceKey: 'all', jobNo: u.job_no }, 'Tümü sekmesinde göster')}
                    </div>
                    ${suggestionList([u.suggestion], {})}
                </div>`).join('')}`;
    }

    function overdueSection() {
        const items = overdueBlocks(report);
        if (!items.length) return '';
        return `
            <details class="cap-overdue">
                <summary>Termini geçmiş ${items.length} açık blok — hedefi güncelleyin ya da işi kapatın</summary>
                <div class="cap-table-wrap"><table class="cap-table">
                    <thead><tr><th>İş</th><th>Kaynak</th><th class="cap-td-num">Kalan</th><th>Termin</th><th></th></tr></thead>
                    <tbody>${items.map(({ block, resource }) => `
                        <tr class="cap-row-overdue">
                            <td>${jobCell(block)}</td>
                            <td>${esc(resource.display_name || resource.name)}</td>
                            <td class="cap-td-num">${esc(fmtKgText(block.remaining_kg))} kg</td>
                            <td class="cap-td-date">${esc(fmtDateTr(block.deadline))}</td>
                            <td>${locateBtn({ blockKey: `${block.assignment_type}-${block.assignment_id}`, resourceKey: resource.key, jobNo: block.job_no })}</td>
                        </tr>`).join('')}</tbody>
                </table></div>
            </details>`;
    }

    function summaryChips() {
        const s = report.summary || {};
        const chips = [];
        const add = (n, text, cls) => { if (n) chips.push(`<span class="cap-chip ${cls}">${esc(`${n} ${text}`)}</span>`); };
        add(s.late_blocks, 'blok gecikme riskinde', 'cap-chip-red');
        add(s.plan_start_late_blocks, 'blokta plan başlangıcı geç', 'cap-chip-orange');
        add(s.overloaded_resources, 'kaynak dolu', 'cap-chip-red');
        add(s.tight_resources, 'kaynak sıkışık', 'cap-chip-orange');
        add(s.no_rate_resources, 'kaynakta hız verisi yok', 'cap-chip-grey');
        add(s.overdue_blocks, 'blokta termin geçmiş', 'cap-chip-grey');
        add(s.unplanned_jobs, 'iş plansız', 'cap-chip-grey');
        add(s.unassigned_jobs, 'işte atanmamış kg', 'cap-chip-grey');
        if (!chips.length) chips.push(`<span class="cap-chip cap-chip-green">${esc(summaryLine(s))}</span>`);
        return `<div class="cap-summary">${chips.join('')}</div>`;
    }

    function render() {
        if (!report) return;
        setStamp();
        const resources = report.resources || [];
        const active = resources.filter(r => r.open_blocks > 0 || r.placeholder_blocks > 0);
        const idle = resources.filter(r => !(r.open_blocks > 0 || r.placeholder_blocks > 0));
        const unsaved = typeof hasUnsavedChanges === 'function' && hasUnsavedChanges();
        const p = report.params || {};
        const refText = p.difficulty
            ? `Kg'lar işin kg fiyatına göre zorluk ağırlıklıdır${p.reference_eur_per_kg != null ? ` (referans ${Number(p.reference_eur_per_kg).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} €/kg)` : ''}; fiyatı olmayan işler ×1 sayılır.`
            : 'Zorluk ağırlığı kapalı: kg\'lar olduğu gibi sayılır.';
        body.innerHTML = `
            ${summaryChips()}
            ${unsaved ? '<div class="cap-note cap-note-unsaved">Kaydedilmemiş değişiklikler var — rapor son kaydedilen plana göre.</div>' : ''}
            <div class="cap-section">Kaynaklar</div>
            ${active.map(r => resourceCard(r)).join('') || '<div class="cap-empty">Açık işi olan kaynak yok.</div>'}
            ${idle.length ? `
                <details class="cap-empty-resources">
                    <summary>+${idle.length} boş kaynak</summary>
                    ${idle.map(r => resourceCard(r, true)).join('')}
                </details>` : ''}
            ${lateSection()}
            ${planStartSection()}
            ${unplannedSection()}
            ${unassignedSection()}
            ${overdueSection()}
            <div class="cap-foot">
                Sıralı simülasyon: her kaynak açık işlerini termin önceliğiyle, ölçülen hızıyla art arda işler;
                "en erken bitiş" o sıradaki bitiştir, plan tarihi değildir. Hızlar son ${esc(months)} ayın
                verisinden; hız verisi olmayan kaynaklar için tarih üretilmez. ${esc(refText)}
                Kaydedilmemiş değişiklikler hesaba katılmaz.
                ${report.timing_ms != null ? `Hesap ${esc(report.timing_ms)} ms.` : ''}
            </div>`;
    }

    // ---- public API ----------------------------------------------------------
    function open() {
        const oc = offcanvas();
        if (oc) oc.show();
        isOpen = true;
        if (!report) load({ silent: false });
        else if (Date.now() - loadedAt > MAX_AGE_MS) load({ silent: true });
        else render();   // the unsaved note may have changed since the last paint
    }

    function close() {
        const oc = offcanvas();
        if (oc) oc.hide();
        isOpen = false;
    }

    function toggle() {
        if (isOpen) close(); else open();
    }

    function refresh({ silent = true } = {}) {
        if (!report) return Promise.resolve();
        return load({ silent });
    }

    syncToolbar();

    return {
        open, close, toggle, refresh,
        isOpen: () => isOpen,
        hasLoaded: () => !!report,
        getReport: () => report,
    };
}
