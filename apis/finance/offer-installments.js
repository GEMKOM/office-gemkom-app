import { authedFetch } from '../../authService.js';
import { backendBase } from '../../base.js';

const BASE = `${backendBase}/finance/offer-installments/`;

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
 * POST /finance/offer-installments/<offer_id>/<sequence>/mark-received/
 * @param {string|number} offerId
 * @param {string|number} sequence
 * @param {{ notes?: string }} payload
 */
export async function markOfferInstallmentReceived(offerId, sequence, payload = {}) {
    const response = await authedFetch(`${BASE}${offerId}/${sequence}/mark-received/`, {
        method: 'POST',
        body: JSON.stringify({ notes: payload.notes ?? '' })
    });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(await parseErrorResponse(response, 'Taksit tahsil edilirken hata oluştu.'));
    }
    return data;
}

/**
 * POST /finance/offer-installments/<offer_id>/<sequence>/unmark-received/
 */
export async function unmarkOfferInstallmentReceived(offerId, sequence) {
    const response = await authedFetch(`${BASE}${offerId}/${sequence}/unmark-received/`, {
        method: 'POST'
    });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(await parseErrorResponse(response, 'Tahsilat işareti kaldırılırken hata oluştu.'));
    }
    return data;
}
