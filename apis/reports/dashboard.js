import { authedFetch } from '../../authService.js';
import { backendBase } from '../../base.js';

const REPORTS_BASE_URL = `${backendBase}/reports`;

/**
 * GET /reports/dashboard/ — the management dashboard envelope.
 *
 * @param {object} [options]
 * @param {'live'|'slow'|null} [options.block]  'live' = live strip + decisions.mine only (60 s poll);
 *                                               'slow' = the slow-tier sub-blocks only (built under the server lock);
 *                                               omitted = the full page (fast + cached slow + live + mine).
 * @param {boolean} [options.refresh]           ?refresh=1 — skips the fresh window (fast tier; with block=slow the slow tier).
 * @returns {Promise<object>} the JSON body. A slow build in progress on another worker answers
 *          HTTP 202 {"status": "building"} — returned as-is so the caller can retry.
 */
export async function getReportsDashboard({ block = null, refresh = false } = {}) {
    const params = new URLSearchParams();
    if (block) params.set('block', block);
    if (refresh) params.set('refresh', '1');
    const qs = params.toString();
    const url = `${REPORTS_BASE_URL}/dashboard/${qs ? `?${qs}` : ''}`;
    const resp = await authedFetch(url, { method: 'GET', cache: refresh ? 'reload' : 'default' });
    if (resp.status === 202) {
        const body = await resp.json().catch(() => ({}));
        return { status: 'building', http_status: 202, ...body };
    }
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        const error = new Error(err.detail || err.error || 'Yönetim paneli verileri yüklenemedi');
        error.status = resp.status;
        throw error;
    }
    return await resp.json();
}
