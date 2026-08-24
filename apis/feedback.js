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
