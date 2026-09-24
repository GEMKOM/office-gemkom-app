/**
 * Günlük Özet API — the once-a-day, company-wide activity summary.
 *
 * User endpoints answer every office user (the brief is company information,
 * not a per-user Neo feature). Analytics endpoints answer only
 * manage_assistant_analytics; the API refuses everyone else with 403.
 * Errors carry `status` so callers can tell 403/404/409/502 apart.
 */
import { authedFetch } from '../authService.js';
import { backendBase } from '../base.js';

const BASE = `${backendBase}/assistant`;

async function dsFetch(url, options, defaultMessage) {
    const response = await authedFetch(url, options);
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: defaultMessage }));
        const error = new Error(errorData.detail || defaultMessage);
        error.status = response.status;
        throw error;
    }
    return await response.json();
}

// ---------------------------------------------------------------- office users

/**
 * Latest ready summary, or null. Never throws: this runs on every page load,
 * and "nothing to show" (403 for non-office accounts, 404, network) is a
 * normal outcome, not an error the user should hear about.
 */
export async function getLatestDailySummary() {
    try {
        const data = await dsFetch(`${BASE}/daily-summary/latest/`, undefined, 'Günlük özet yüklenemedi');
        return data?.summary || null;
    } catch (error) {
        if (error?.status !== 403 && error?.status !== 404) {
            console.warn('Daily summary latest check failed:', error?.message || error);
        }
        return null;
    }
}

/** Past summaries (ok + empty), newest first. Returns the results array. */
export async function listDailySummaries({ days = 30 } = {}) {
    const data = await dsFetch(
        `${BASE}/daily-summary/?days=${encodeURIComponent(days)}`,
        undefined,
        'Geçmiş özetler yüklenemedi',
    );
    return data?.results || data || [];
}

export function getDailySummary(id) {
    return dsFetch(`${BASE}/daily-summary/${encodeURIComponent(id)}/`, undefined, 'Özet yüklenemedi');
}

/** Idempotent; the server ignores it during impersonation (JWT `imp`). */
export function markDailySummaryRead(id) {
    return dsFetch(
        `${BASE}/daily-summary/${encodeURIComponent(id)}/read/`,
        { method: 'POST', body: '{}' },
        'Okundu bilgisi kaydedilemedi',
    );
}

// ------------------------------------------------------------------ analytics

/** All statuses with the cost ledger. Returns the results array. */
export async function getAnalyticsDailySummaries({ days = 90 } = {}) {
    const data = await dsFetch(
        `${BASE}/analytics/daily-summaries/?days=${encodeURIComponent(days)}`,
        undefined,
        'Özet kayıtları yüklenemedi',
    );
    return data?.results || data || [];
}

export function getAnalyticsDailySummary(id) {
    return dsFetch(
        `${BASE}/analytics/daily-summaries/${encodeURIComponent(id)}/`,
        undefined,
        'Özet kaydı yüklenemedi',
    );
}

/** Regenerate in place. Errors: 409 already running, 502 model/API failure. */
export function regenerateDailySummary(id, { resetReads = false } = {}) {
    return dsFetch(
        `${BASE}/analytics/daily-summaries/${encodeURIComponent(id)}/regenerate/`,
        { method: 'POST', body: JSON.stringify({ reset_reads: !!resetReads }) },
        'Özet yeniden üretilemedi',
    );
}

/** Same body as the scheduler's task call: {status, id, summary_date, ...}. */
export function runDailySummary({ date = '', force = false } = {}) {
    const body = { force: !!force };
    if (date) body.date = date;
    return dsFetch(
        `${BASE}/analytics/daily-summaries/run/`,
        { method: 'POST', body: JSON.stringify(body) },
        'Özet üretilemedi',
    );
}
