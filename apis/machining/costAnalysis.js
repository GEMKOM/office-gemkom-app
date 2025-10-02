import { backendBase } from '../../base.js';
import { authedFetch } from '../../authService.js';

export async function fetchJobCostReport(params = {}) {
    let url = `${backendBase}/machining/reports/job-costs/`;
    const queryParams = new URLSearchParams();

    if (params.job_no) {
        queryParams.append('job_no', params.job_no);
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

export async function fetchJobCostDetailsReportByJobNo(params = {}) {
    if (!params.job_no) {
        throw new Error('Job number is required');
    }
    let url = `${backendBase}/machining/reports/job-costs/${params.job_no}`;
    const queryParams = new URLSearchParams();

    //true or false
    if (params.job_like) {
        queryParams.append('job_like', params.job_like);
    }
    if (params.ordering) {
        queryParams.append('ordering', params.ordering);
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
        console.error('Error fetching job cost details report:', error);
        throw error;
    }
}