import { backendBase } from '../../base.js';
import { authedFetch } from '../../authService.js';

/**
 * Planning Reports API Service
 * Handles all planning report-related API requests using authedFetch
 */

/**
 * Get combined job costs from both machining and welding departments
 * @param {Object} params - Query parameters
 * @param {string} params.job_no - Optional. Job number filter (partial match)
 * @param {string} params.ordering - Optional. Ordering field (job_no, -job_no, combined_total_cost, -combined_total_cost, combined_total_hours, -combined_total_hours)
 * @returns {Promise<Object>} Report data with count and results
 */
export async function getCombinedJobCosts(params = {}) {
    const queryParams = new URLSearchParams();
    
    if (params.job_no) {
        queryParams.append('job_no', params.job_no);
    }
    if (params.ordering) {
        queryParams.append('ordering', params.ordering);
    }

    const url = `${backendBase}/reports/combined-job-costs${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    const resp = await authedFetch(url);
    
    if (!resp.ok) {
        const errorData = await resp.json();
        throw new Error(errorData.error || errorData.detail || 'Rapor yüklenirken hata oluştu');
    }
    
    const data = await resp.json();
    return data;
}

