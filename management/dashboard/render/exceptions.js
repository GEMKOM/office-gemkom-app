/**
 * İstisnalar: ONE hand-rolled renderer. Semantic <table> on >= 768 px; the same
 * DOM turns into card rows below 768 px through CSS only (data-label cells).
 * Top 8 rows; on phones rows 6-8 stay behind 'Tümünü gör (N)'.
 * No '€' in any string from the API; impact_eur only when money is visible.
 */
import { escapeHtml, n0, num, formatTons, stamp, chip, sbadge, dots, skeleton, slowState, SLOW_TEXT, moneyFmt } from './util.js';
import { KIND_META } from './labels.js';

const PHONE_VISIBLE = 5;

function kindBadge(row) {
    const meta = KIND_META[row.kind] || { label: row.kind_label || row.kind || '—', color: 'grey' };
    const color = ['red', 'orange', 'purple', 'grey', 'green', 'blue'].includes(row.severity) ? row.severity : meta.color;
    return sbadge(color, row.kind_label || meta.label);
}

function impactCell(row, money) {
    const parts = [];
    const kg = formatTons(row.impact_kg);
    if (kg) parts.push(kg);
    const eur = money(row.impact_eur);
    if (eur) parts.push(eur);
    const flags = Array.isArray(row.flags) ? row.flags : [];
    if (!kg && flags.includes('ağırlık yok')) parts.push(chip('grey', 'ağırlık yok'));
    return parts.length ? parts.join(' · ') : '—';
}

function urgencyCell(row) {
    if (row.urgency === null || row.urgency === undefined) return '—';
    return `${num(row.urgency)} ${escapeHtml(row.urgency_unit || '')}`.trim();
}

function rowHtml(row, idx, money) {
    const url = row.url || (row.job_no ? `/projects/project-tracking?job_no=${encodeURIComponent(row.job_no)}` : '');
    const hidden = idx >= PHONE_VISIBLE ? ' exc-row-more' : '';
    const flags = Array.isArray(row.flags) ? row.flags.filter((f) => f !== 'ağırlık yok' && f !== 'pinned') : [];
    return `<tr class="exc-row${hidden}" data-kind="${escapeHtml(row.kind || '')}" data-url="${escapeHtml(url)}" ${url ? 'role="link" tabindex="0"' : ''}>
        <td class="exc-kind" data-label="Tür">${kindBadge(row)}</td>
        <td class="exc-job" data-label="İş Emri">${row.job_no ? `<a href="${escapeHtml(url)}"><code class="job-number">${escapeHtml(row.job_no)}</code></a>` : '—'}</td>
        <td class="exc-customer" data-label="Müşteri">${escapeHtml(row.customer || '—')}</td>
        <td class="exc-title" data-label="İş Adı">${escapeHtml(row.title || '—')}${flags.length ? ` <span class="text-muted small">(${escapeHtml(flags.join(', '))})</span>` : ''}</td>
        <td class="exc-impact" data-label="Etki">${impactCell(row, money)}</td>
        <td class="exc-urgency" data-label="Aciliyet">${urgencyCell(row)}</td>
        <td class="exc-owner" data-label="Sorumlu">${escapeHtml(row.owner || '—')}</td>
    </tr>`;
}

/**
 * @param {HTMLElement} host
 * @param {object|null|undefined} exceptions sections.exceptions (undefined = loading)
 */
export function renderExceptions(host, exceptions, { meta = {}, errors = {}, slowStatus = 'idle', loading = false } = {}) {
    if (!host) return;
    const title = 'Bu hafta dikkat isteyen işler';
    const head = (stampText) => `<div class="card-header dash-card-head"><h5><i class="fas fa-exclamation-circle text-danger"></i> İstisnalar <span class="dash-card-sub">${escapeHtml(title)}</span></h5><span class="dash-card-stamp" data-stamp>${escapeHtml(stampText || '')}</span></div>`;
    if (loading) {
        host.dataset.state = 'loading';
        host.innerHTML = `${head('')}<div class="card-body">${skeleton(6)}</div>`;
        return;
    }
    const state = slowState(exceptions, { slowStatus, errors, section: 'exceptions', sub: null });
    if (state !== 'ready') {
        host.dataset.state = state;
        const text = state === 'failed'
            ? `Bu blok yüklenemedi${errors.exceptions || errors['slow.exceptions'] ? `: ${escapeHtml(errors.exceptions || errors['slow.exceptions'])}` : ''}`
            : (state === 'pending' ? 'İstisna listesi hesaplanıyor…' : 'İstisna listesi henüz hesaplanmadı');
        host.innerHTML = `${head('')}<div class="card-body"><div class="dash-empty" data-slow-state="${state}">${state === 'pending' ? '<span class="spinner-border spinner-border-sm text-secondary me-2" role="status"></span>' : ''}${text}</div></div>`;
        return;
    }
    host.dataset.state = 'ready';
    const money = moneyFmt(meta);
    const rows = Array.isArray(exceptions.rows) ? exceptions.rows.slice(0, 8) : [];
    const at = stamp(exceptions.generated_at);
    const footer = `<div class="exc-footer">${escapeHtml(dots(
        `${num(exceptions.total_candidates)} aday`, 'sıralama: öncelik × iş günü', at ? `hesaplama ${at}` : '',
    ))}</div>`;
    if (!rows.length) {
        host.innerHTML = `${head(at ? `Veri ${at}` : '')}<div class="card-body"><div class="dash-empty"><i class="fas fa-check-circle text-success me-1"></i>Bu hafta istisna yok</div>${footer}</div>`;
        return;
    }
    const moreBtn = rows.length > PHONE_VISIBLE
        ? `<button type="button" class="btn btn-sm btn-outline-secondary exc-more-btn" data-exc-more aria-expanded="false">Tümünü gör (${rows.length})</button>`
        : '';
    host.innerHTML = `${head(at ? `Veri ${at}` : '')}
        <div class="card-body exc-body">
            <table class="exc-table" data-rows="${rows.length}">
                <thead><tr><th>Tür</th><th>İş Emri</th><th>Müşteri</th><th>İş Adı</th><th>Etki</th><th>Aciliyet</th><th>Sorumlu</th></tr></thead>
                <tbody>${rows.map((r, i) => rowHtml(r, i, money)).join('')}</tbody>
            </table>
            ${moreBtn}
            ${footer}
        </div>`;
}

/** Row click → row.url; 'Tümünü gör' toggle (delegated once per host). */
export function bindExceptions(host) {
    if (!host || host.dataset.excBound === '1') return;
    host.dataset.excBound = '1';
    host.addEventListener('click', (e) => {
        const more = e.target.closest('[data-exc-more]');
        if (more) {
            const table = host.querySelector('.exc-table');
            const open = !table.classList.contains('exc-expanded');
            table.classList.toggle('exc-expanded', open);
            more.setAttribute('aria-expanded', open ? 'true' : 'false');
            more.textContent = open ? 'Daha az göster' : `Tümünü gör (${table.dataset.rows || ''})`;
            return;
        }
        if (e.target.closest('a')) return; // the job link navigates by itself
        const tr = e.target.closest('tr.exc-row');
        if (tr && tr.dataset.url) window.location.assign(tr.dataset.url);
    });
    host.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        const tr = e.target.closest('tr.exc-row');
        if (tr && tr.dataset.url) window.location.assign(tr.dataset.url);
    });
}
