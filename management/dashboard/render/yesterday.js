/**
 * Dünden bugüne: the Günlük Özet card (zero backend cost beyond
 * GET /assistant/daily-summary/latest/). The card never marks the summary
 * read; closing the modal opened from it does (user-initiated).
 */
import { escapeHtml, skeleton } from './util.js';
import { getLatestDailySummary } from '../../../apis/dailySummary.js';
import {
    renderKpiTiles, renderStatChips, bindDailySummaryInteractions, ensureDailySummaryStyles,
    formatWindowLabel, relativeDayLabel,
} from '../../../components/daily-summary/render.js';
import { openDailySummaryModal } from '../../../components/daily-summary/daily-summary.js';

const EMPTY_TEXT = 'Özet yok (ofis yetkisi gerekir veya özet üretilmedi)';

function head(sub = '') {
    return `<div class="card-header dash-card-head"><h5><i class="fas fa-sun text-primary"></i> Dünden Bugüne <span class="dash-card-sub">Günlük Özet</span></h5><span class="dash-card-stamp">${escapeHtml(sub)}</span></div>`;
}

let current = null;

export async function renderYesterday(host) {
    if (!host) return;
    host.dataset.state = 'loading';
    host.innerHTML = `${head('')}<div class="card-body">${skeleton(4)}</div>`;
    let summary = null;
    try { summary = await getLatestDailySummary(); } catch (_) { summary = null; }
    current = summary;
    if (!summary) {
        host.dataset.state = 'empty';
        host.innerHTML = `${head('')}<div class="card-body"><div class="dash-empty">${escapeHtml(EMPTY_TEXT)}</div></div>`;
        return;
    }
    ensureDailySummaryStyles();
    const payload = summary.payload && typeof summary.payload === 'object' ? summary.payload : {};
    const stats = payload.stats && typeof payload.stats === 'object' ? payload.stats : (summary.stats || {});
    const headline = payload.headline || summary.headline || '';
    const windowLabel = formatWindowLabel(summary);
    const day = summary.summary_date ? relativeDayLabel(summary.summary_date) : '';
    host.dataset.state = 'ready';
    host.dataset.summaryId = String(summary.id || '');
    host.innerHTML = `${head([day, windowLabel].filter(Boolean).join(' · '))}
        <div class="card-body ds-root dash-yesterday-body">
            ${headline ? `<p class="ds-headline">${escapeHtml(headline)}</p>` : '<div class="ds-muted">Bu dönemde kayda değer bir hareket yok.</div>'}
            ${renderKpiTiles(stats)}
            ${renderStatChips(stats, { limit: 6 })}
            <div class="dash-yesterday-actions">
                <button type="button" class="btn btn-sm btn-primary" data-open-summary><i class="fas fa-book-open me-1"></i>Özeti aç</button>
            </div>
        </div>`;
    bindDailySummaryInteractions(host.querySelector('.dash-yesterday-body'));
    const btn = host.querySelector('[data-open-summary]');
    if (btn) {
        btn.addEventListener('click', () => {
            if (!current) return;
            const opened = openDailySummaryModal(current, { fromWidget: true });
            if (!opened) {
                btn.disabled = true;
                btn.title = 'Özet penceresi açılamadı';
            }
        });
    }
}
