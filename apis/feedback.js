/**
 * Feedback API — bug reports / feature requests filed from the Neo widget.
 *
 * POST /feedback/reports/ creates a report; the backend AI-triages it
 * asynchronously and (when eligible) queues it for automatic implementation.
 * GET /feedback/reports/ returns the caller's own reports with their status.
 */
import { authedFetch } from '../authService.js';
import { backendBase } from '../base.js';

const FEEDBACK_BASE = `${backendBase}/feedback`;

export async function createFeedbackReport({ kind, title, description, pageUrl, context }) {
    const response = await authedFetch(`${FEEDBACK_BASE}/reports/`, {
        method: 'POST',
        body: JSON.stringify({
            kind,
            title,
            description,
            page_url: pageUrl || '',
            context: context || {},
        }),
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const firstFieldError = Object.values(errorData).find(Array.isArray)?.[0];
        const error = new Error(errorData.detail || firstFieldError || 'Bildirim gönderilemedi');
        error.status = response.status;
        throw error;
    }
    return await response.json();
}

export async function listMyFeedbackReports() {
    const response = await authedFetch(`${FEEDBACK_BASE}/reports/`);
    if (!response.ok) {
        const error = new Error('Bildirimler yüklenemedi');
        error.status = response.status;
        throw error;
    }
    const data = await response.json();
    return data.results || data;
}

export async function respondFeedbackReport(id, message) {
    const response = await authedFetch(`${FEEDBACK_BASE}/reports/${id}/respond/`, {
        method: 'POST',
        body: JSON.stringify({ message }),
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const error = new Error(errorData.detail || 'Yanıt gönderilemedi');
        error.status = response.status;
        throw error;
    }
    return await response.json();
}

// ---------------------------------------------------------------------------
// Management (manage_feedback only — the API refuses everyone else)
// ---------------------------------------------------------------------------

async function manageFetch(url, options, defaultMessage) {
    const response = await authedFetch(url, options);
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: defaultMessage }));
        const error = new Error(errorData.detail || defaultMessage);
        error.status = response.status;
        throw error;
    }
    return await response.json();
}

export function listAllFeedbackReports({ status = '', kind = '', q = '' } = {}) {
    const params = new URLSearchParams({ all: '1' });
    if (status) params.set('status', status);
    if (kind) params.set('kind', kind);
    if (q) params.set('q', q);
    return manageFetch(
        `${FEEDBACK_BASE}/reports/?${params}`, undefined, 'Bildirimler yüklenemedi',
    ).then((data) => data.results || data);
}

export function getFeedbackStats() {
    return manageFetch(`${FEEDBACK_BASE}/reports/stats/`, undefined, 'İstatistikler yüklenemedi');
}

export function getFeedbackReport(id) {
    return manageFetch(`${FEEDBACK_BASE}/reports/${id}/`, undefined, 'Bildirim yüklenemedi');
}

export function analyzeFeedbackReport(id) {
    return manageFetch(
        `${FEEDBACK_BASE}/reports/${id}/analyze/`, { method: 'POST' }, 'Analiz başlatılamadı',
    );
}

export function queueFeedbackReport(id) {
    return manageFetch(
        `${FEEDBACK_BASE}/reports/${id}/queue/`, { method: 'POST' }, 'Kuyruğa alınamadı',
    );
}

export function dismissFeedbackReport(id, note = '') {
    return manageFetch(
        `${FEEDBACK_BASE}/reports/${id}/dismiss/`,
        { method: 'POST', body: JSON.stringify({ note }) },
        'Reddedilemedi',
    );
}

export function syncFeedbackReport(id) {
    return manageFetch(
        `${FEEDBACK_BASE}/reports/${id}/sync/`, { method: 'POST' }, 'Senkronize edilemedi',
    );
}
