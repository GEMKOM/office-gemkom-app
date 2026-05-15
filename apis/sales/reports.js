import { authedFetch } from '../../authService.js';
import { backendBase } from '../../base.js';

/**
 * GET /sales/reports/revenue/
 * @param {Object} params - Optional query parameters (e.g. from, to, year, status)
 */
export async function getRevenueReport(params = {}) {
    const queryParams = new URLSearchParams();
    Object.keys(params).forEach((key) => {
        const value = params[key];
        if (value !== null && value !== undefined && value !== '') {
            queryParams.append(key, value);
        }
    });

    const qs = queryParams.toString();
    const url = `${backendBase}/sales/reports/revenue/${qs ? `?${qs}` : ''}`;
    const resp = await authedFetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
    });

    if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || err.error || 'Gelir raporu yüklenirken hata oluştu');
    }

    return resp.json();
}

/**
 * GET /sales/reports/inflow-detail/?month=YYYY-MM
 */
export async function getInflowDetail(month) {
    const params = new URLSearchParams({ month });
    const url = `${backendBase}/sales/reports/inflow-detail/?${params.toString()}`;
    const resp = await authedFetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
    });
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || err.error || 'Giriş detayı yüklenirken hata oluştu');
    }
    return resp.json();
}
