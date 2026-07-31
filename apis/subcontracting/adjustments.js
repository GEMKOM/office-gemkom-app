import { backendBase } from "../../base.js";
import { authedFetch } from "../../authService.js";

/**
 * Subcontracting Adjustments Report API Service
 *
 * Backend endpoint:
 * - GET /subcontracting/adjustments/   (flat report of all statement adjustments)
 */

/**
 * Fetch the flat adjustments report across all statements/subcontractors.
 * @param {Object} filters - Optional filters
 * @param {number|string} filters.subcontractor - Subcontractor id
 * @param {number|string} filters.year - Statement year
 * @param {number|string} filters.month - Statement month (1-12)
 * @param {string} filters.adjustment_type - 'addition' | 'deduction'
 * @param {string} filters.job_no - Job order no (partial match)
 * @param {string} filters.ordering - created_at | -created_at | amount | -amount | period | -period
 * @returns {Promise<{count: number, results: Array, summary: Array}>}
 */
export async function fetchAdjustmentsReport(filters = {}) {
    const params = new URLSearchParams();

    Object.keys(filters).forEach(key => {
        if (filters[key] !== null && filters[key] !== undefined && filters[key] !== '') {
            params.append(key, filters[key]);
        }
    });

    const url = `${backendBase}/subcontracting/adjustments/?${params.toString()}`;
    const resp = await authedFetch(url);

    if (!resp.ok) {
        const errorData = await resp.json().catch(() => ({}));
        throw new Error(errorData.detail || errorData.message || 'Düzeltmeler yüklenirken hata oluştu');
    }

    return await resp.json();
}
