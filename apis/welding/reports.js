import { backendBase } from "../../base.js";
import { authedFetch } from "../../authService.js";

/**
 * Welding Reports API Service
 * Handles all welding report-related API requests using authedFetch
 */

/**
 * Get user work hours report
 * @param {Object} params - Query parameters
 * @param {string} params.date_after - Required. Start date (YYYY-MM-DD)
 * @param {string} params.date_before - Required. End date (YYYY-MM-DD)
 * @returns {Promise<Object>} Report data with date range and users
 */
export async function getUserWorkHoursReport(params) {
    if (!params.date_after || !params.date_before) {
        throw new Error('Both date_after and date_before query parameters are required');
    }

    const queryParams = new URLSearchParams();
    queryParams.append('date_after', params.date_after);
    queryParams.append('date_before', params.date_before);

    const url = `${backendBase}/welding/reports/user-work-hours/?${queryParams.toString()}`;
    const resp = await authedFetch(url);
    
    if (!resp.ok) {
        const errorData = await resp.json();
        throw new Error(errorData.error || errorData.detail || 'Rapor yüklenirken hata oluştu');
    }
    
    const data = await resp.json();
    return data;
}

/**
 * Get welding job cost totals (aggregated by job_no)
 * @param {Object} params - Query parameters
 * @param {string} params.job_no - Optional. Job number filter (partial match)
 * @param {string} params.ordering - Optional. Ordering field (job_no, -job_no, total_hours, -total_hours, updated_at, -updated_at)
 * @returns {Promise<Object>} Report data with count and results
 */
export async function getWeldingJobCostTotals(params = {}) {
    const queryParams = new URLSearchParams();
    
    if (params.job_no) {
        queryParams.append('job_no', params.job_no);
    }
    if (params.ordering) {
        queryParams.append('ordering', params.ordering);
    }

    const url = `${backendBase}/welding/reports/job-costs/?${queryParams.toString()}`;
    const resp = await authedFetch(url);
    
    if (!resp.ok) {
        const errorData = await resp.json();
        throw new Error(errorData.error || errorData.detail || 'Rapor yüklenirken hata oluştu');
    }
    
    const data = await resp.json();
    return data;
}

/**
 * Get welding job entries by job number
 * @param {Object} params - Query parameters
 * @param {string} params.job_no - Required. Job number
 * @returns {Promise<Object>} Report data with job_no, summary, and entries
 */
export async function getWeldingJobCostDetail(params) {
    if (!params.job_no) {
        throw new Error('job_no parameter is required');
    }

    const queryParams = new URLSearchParams();
    queryParams.append('job_no', params.job_no);

    const url = `${backendBase}/welding/reports/job-entries/?${queryParams.toString()}`;
    const resp = await authedFetch(url);
    
    if (!resp.ok) {
        const errorData = await resp.json();
        throw new Error(errorData.error || errorData.detail || 'Rapor yüklenirken hata oluştu');
    }
    
    const data = await resp.json();
    return data;
}

