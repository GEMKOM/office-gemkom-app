import { backendBase } from '../../base.js';
import { authedFetch } from '../../authService.js';

export async function fetchDailyEfficiencyReport(date = null) {
    let url = `${backendBase}/machining/reports/daily-efficiency/`;
    const queryParams = new URLSearchParams();

    if (date) {
        queryParams.append('date', date);
    }

    url += `?${queryParams.toString()}`;
    
    try {
        const response = await authedFetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching daily efficiency report:', error);
        throw error;
    }
}

/**
 * Get machining job entries by job number
 * @param {Object} params - Query parameters
 * @param {string} params.job_no - Required. Job number
 * @returns {Promise<Object>} Report data with job_no, summary, and entries
 */
export async function getMachiningJobEntries(params) {
    if (!params.job_no) {
        throw new Error('job_no parameter is required');
    }

    const queryParams = new URLSearchParams();
    queryParams.append('job_no', params.job_no);

    const url = `${backendBase}/machining/reports/job-entries/?${queryParams.toString()}`;
    const resp = await authedFetch(url);
    
    if (!resp.ok) {
        const errorData = await resp.json();
        throw new Error(errorData.error || errorData.detail || 'Rapor yüklenirken hata oluştu');
    }
    
    const data = await resp.json();
    return data;
}
