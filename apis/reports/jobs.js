import { authedFetch } from '../../authService.js';
import { backendBase } from '../../base.js';

const REPORTS_BASE_URL = `${backendBase}/reports`;

export async function getReportsJobs(params = {}) {
    const qs = new URLSearchParams();
    if (params?.status) {
        const v = Array.isArray(params.status) ? params.status.join(',') : String(params.status);
        if (v.trim()) qs.set('status', v);
    }
    if (params?.ordering) {
        qs.set('ordering', String(params.ordering));
    }

    const url = `${REPORTS_BASE_URL}/jobs/${qs.toString() ? `?${qs.toString()}` : ''}`;
    const resp = await authedFetch(url, { method: 'GET' });
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || err.error || 'Analitik verileri yüklenirken hata oluştu');
    }
    return await resp.json();
}

