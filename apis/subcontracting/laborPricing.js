import { backendBase } from "../../base.js";
import { authedFetch } from "../../authService.js";

/**
 * Subcontractor Labor Pricing API
 *
 * - GET  /subcontracting/labor-pricing/   compute rates for a job order selection
 * - POST /subcontracting/labor-pricing/   save the knobs onto those job orders
 *
 * The GET is read-only: it creates no price tiers and no assignments.
 */

/**
 * Compute labor rates for one or more job orders.
 *
 * @param {string[]} jobNos - Job order numbers. Selecting a job together with
 *   one of its own parents, or with one of its delivery phases, is rejected by
 *   the backend because it would count the same work twice.
 * @param {Object} params - Overrides; anything omitted falls back to what is
 *   stored on the first selected job order.
 * @param {number|string} params.material_rate - Material cost, EUR/kg
 * @param {number|string} params.general_rate - General expenses, EUR/kg
 * @param {number|string} params.margin_pct - Margin to keep, percent
 * @param {number|string} params.alpha - Weight exponent, 0..1
 * @param {number|string} params.factor_min - Size factor floor
 * @param {number|string} params.factor_max - Size factor ceiling
 * @param {Object} difficulty - { [jobNo]: multiplier } per-line overrides
 * @returns {Promise<Object>} { params, totals, lines, skipped, selection }
 */
export async function fetchLaborPricing(jobNos = [], params = {}, difficulty = {}) {
    const query = new URLSearchParams();
    jobNos.forEach(jobNo => query.append('job_no', jobNo));

    Object.entries(params).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') {
            query.append(key, value);
        }
    });

    const overrides = Object.entries(difficulty)
        .filter(([, value]) => Number(value) > 0 && Number(value) !== 1)
        .map(([jobNo, value]) => `${jobNo}:${value}`);
    if (overrides.length) {
        query.append('difficulty', overrides.join(','));
    }

    const resp = await authedFetch(`${backendBase}/subcontracting/labor-pricing/?${query}`);
    if (!resp.ok) {
        const error = await resp.json().catch(() => ({}));
        throw new Error(error.detail || 'İşçilik fiyatı hesaplanırken hata oluştu');
    }
    return resp.json();
}

/**
 * Persist the calculation inputs onto the selected job orders, so the next
 * person opening them sees the numbers this quote was built with.
 *
 * @param {string[]} jobNos
 * @param {Object} params - Same keys as fetchLaborPricing's params
 * @returns {Promise<Object>} { saved, params }
 */
export async function saveLaborPricingParams(jobNos = [], params = {}) {
    const resp = await authedFetch(`${backendBase}/subcontracting/labor-pricing/`, {
        method: 'POST',
        body: JSON.stringify({ job_no: jobNos, ...params })
    });
    if (!resp.ok) {
        const error = await resp.json().catch(() => ({}));
        throw new Error(error.detail || 'Parametreler kaydedilirken hata oluştu');
    }
    return resp.json();
}
