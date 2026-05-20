import { authedFetch } from '../authService.js';
import { backendBase } from '../base.js';

const BASE = `${backendBase}/bug-reports`;

export async function listBugReports() {
    const r = await authedFetch(`${BASE}/`);
    if (!r.ok) throw new Error('Failed to load bug reports');
    return r.json();
}

export async function getBugReport(id) {
    const r = await authedFetch(`${BASE}/${id}/`);
    if (!r.ok) throw new Error('Failed to load bug report');
    return r.json();
}

export async function createBugReport(data) {
    const r = await authedFetch(`${BASE}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to create bug report');
    }
    return r.json();
}

export async function replyToBugReport(id, content) {
    const r = await authedFetch(`${BASE}/${id}/reply/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
    });
    if (!r.ok) throw new Error('Failed to send reply');
    return r.json();
}

export async function closeBugReport(id) {
    const r = await authedFetch(`${BASE}/${id}/close/`, { method: 'POST' });
    if (!r.ok) throw new Error('Failed to close bug report');
    return r.json();
}

export async function uploadBugReportAttachment(id, file) {
    const formData = new FormData();
    formData.append('file', file);
    const r = await authedFetch(`${BASE}/${id}/upload_attachment/`, {
        method: 'POST',
        body: formData,
    });
    if (!r.ok) throw new Error('Failed to upload attachment');
    return r.json();
}

export const STATUS_LABELS = {
    open:         'Açık',
    waiting_info: 'Bilgi Bekleniyor',
    in_progress:  'İşleniyor',
    pr_created:   'İnceleme Bekliyor',
    escalated:    'Teknik İnceleme',
    closed:       'Kapalı',
};

export const STATUS_BADGE = {
    open:         'bg-primary',
    waiting_info: 'bg-warning text-dark',
    in_progress:  'bg-info text-dark',
    pr_created:   'bg-success',
    escalated:    'bg-danger',
    closed:       'bg-secondary',
};
