import { backendBase } from '../../base.js';
import { authedFetch } from '../../authService.js';

export async function fetchJobCostReport(params = {}) {
    let url = `${backendBase}/machining/reports/job-costs/${params.job_no}`;
    const queryParams = new URLSearchParams();

    if (params.job_no) {
        queryParams.append('job_like', params.job_like);
    }

    if (params.breakdown) {
        queryParams.append('breakdown', params.breakdown);
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
        console.error('Error fetching job hours report:', error);
        throw error;
    }
}