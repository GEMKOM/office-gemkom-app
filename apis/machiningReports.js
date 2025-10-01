import { backendBase } from '../base.js';
import { authedFetch } from '../authService.js';

/**
 * Fetch job hours report data
 * @param {Object} params - Query parameters
 * @param {string} params.q - Partial job number to search for
 * @param {number} params.start_after - Start time filter (epoch seconds)
 * @param {number} params.start_before - End time filter (epoch seconds)
 * @param {number} params.page - Page number for pagination
 * @param {number} params.page_size - Number of items per page
 * @param {string} params.ordering - Sort ordering (e.g., 'job_no', '-total_hours')
 * @returns {Promise<Object>} Job hours report data
 */
export async function fetchJobHoursReport(params = {}) {
    let url = `${backendBase}/machining/reports/job-hours/`;
    const queryParams = new URLSearchParams();
    
    // Add query parameters
    if (params.q) {
        queryParams.append('q', params.q);
    }
    if (params.start_after) {
        queryParams.append('start_after', params.start_after);
    }
    if (params.start_before) {
        queryParams.append('start_before', params.start_before);
    }
    if (params.page) {
        queryParams.append('page', params.page);
    }
    if (params.page_size) {
        queryParams.append('page_size', params.page_size);
    }
    if (params.ordering) {
        queryParams.append('ordering', params.ordering);
    }
    
    // Build final URL
    if (queryParams.toString()) {
        url += `?${queryParams.toString()}`;
    }
    
    try {
        const response = await authedFetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching job hours report:', error);
        throw error;
    }
}

/**
 * Fetch job hours report with automatic pagination
 * @param {Object} params - Query parameters
 * @returns {Promise<Object>} Complete job hours report data
 */
export async function fetchAllJobHoursReport(params = {}) {
    const allResults = [];
    let page = 1;
    const pageSize = 100; // Fetch in batches
    
    while (true) {
        const batchParams = {
            ...params,
            page: page,
            page_size: pageSize
        };
        
        const data = await fetchJobHoursReport(batchParams);
        
        if (!data.results || data.results.length === 0) {
            break;
        }
        
        allResults.push(...data.results);
        
        // Check if we've fetched all pages
        if (data.results.length < pageSize) {
            break;
        }
        
        page++;
    }
    
    return {
        query: params.q || '',
        job_nos: [...new Set(allResults.map(job => job.job_no))],
        results: allResults
    };
}

/**
 * Fetch job hours report for a specific job number
 * @param {string} jobNo - Job number to fetch
 * @param {Object} timeFilters - Optional time filters
 * @returns {Promise<Object|null>} Job hours data or null if not found
 */
export async function fetchJobHoursByJobNo(jobNo, timeFilters = {}) {
    try {
        const params = {
            q: jobNo,
            ...timeFilters
        };
        
        const data = await fetchJobHoursReport(params);
        
        // Find the specific job
        const job = data.results?.find(job => job.job_no === jobNo);
        return job || null;
    } catch (error) {
        console.error(`Error fetching job hours for ${jobNo}:`, error);
        return null;
    }
}

/**
 * Get job hours statistics
 * @param {Object} params - Query parameters
 * @returns {Promise<Object>} Statistics data
 */
export async function getJobHoursStatistics(params = {}) {
    try {
        const data = await fetchJobHoursReport(params);
        const results = data.results || [];
        
        const stats = {
            totalJobs: results.length,
            totalHours: 0,
            uniqueUsers: new Set(),
            avgHoursPerJob: 0,
            weekdayWorkHours: 0,
            afterHoursHours: 0,
            sundayHours: 0
        };
        
        results.forEach(job => {
            const totals = job.totals || {};
            stats.totalHours += totals.total || 0;
            stats.weekdayWorkHours += totals.weekday_work || 0;
            stats.afterHoursHours += totals.after_hours || 0;
            stats.sundayHours += totals.sunday || 0;
            
            // Count unique users
            if (job.users) {
                job.users.forEach(user => {
                    stats.uniqueUsers.add(user.user);
                });
            }
        });
        
        stats.uniqueUserCount = stats.uniqueUsers.size;
        stats.avgHoursPerJob = stats.totalJobs > 0 ? stats.totalHours / stats.totalJobs : 0;
        
        return stats;
    } catch (error) {
        console.error('Error getting job hours statistics:', error);
        throw error;
    }
}
