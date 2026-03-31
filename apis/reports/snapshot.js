import { authedFetch } from '../../authService.js';
import { backendBase } from '../../base.js';

const REPORTS_BASE_URL = `${backendBase}/reports`;

export async function getReportsSnapshot() {
    const url = `${REPORTS_BASE_URL}/snapshot/`;
    const resp = await authedFetch(url, { method: 'GET' });
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || err.error || 'Dashboard verileri yüklenirken hata oluştu');
    }
    return await resp.json();
}

