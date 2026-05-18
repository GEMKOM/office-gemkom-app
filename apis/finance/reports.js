import { authedFetch } from '../../authService.js';
import { backendBase } from '../../base.js';

const INFLOW_TRACKER_BASE = `${backendBase}/finance/reports/inflow-tracker/`;

async function parseErrorResponse(response, fallback) {
    try {
        const err = await response.json();
        if (typeof err === 'string') return err;
        if (err.detail) return typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail);
        if (err.errors) {
            const parts = Object.entries(err.errors).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`);
            return parts.join('; ') || fallback;
        }
        return fallback;
    } catch {
        return fallback;
    }
}

/**
 * GET /finance/reports/inflow-tracker/
 * @param {Object} filters - e.g. is_received, source (when supported by backend)
 * @returns {Promise<Array>}
 */
export async function getInflowTracker(filters = {}) {
    const queryParams = new URLSearchParams();
    Object.keys(filters).forEach((key) => {
        const val = filters[key];
        if (val !== null && val !== undefined && val !== '') {
            queryParams.append(key, val);
        }
    });
    const url = queryParams.toString() ? `${INFLOW_TRACKER_BASE}?${queryParams}` : INFLOW_TRACKER_BASE;
    const response = await authedFetch(url);
    if (!response.ok) {
        throw new Error(await parseErrorResponse(response, `HTTP error! status: ${response.status}`));
    }
    const data = await response.json();
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.results)) return data.results;
    return [];
}
