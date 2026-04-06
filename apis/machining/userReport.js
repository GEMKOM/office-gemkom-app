import { backendBase } from '../../base.js';
import { authedFetch } from '../../authService.js';

/**
 * @param {{ start_date?: string, end_date?: string }} params - Both optional; backend defaults to today
 */
export async function fetchUserReport(params = {}) {
    const queryParams = new URLSearchParams();
    if (params.start_date) {
        queryParams.append('start_date', params.start_date);
    }
    if (params.end_date) {
        queryParams.append('end_date', params.end_date);
    }
    const qs = queryParams.toString();
    const url = `${backendBase}/machining/reports/user-report/${qs ? `?${qs}` : ''}`;

    const response = await authedFetch(url);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
}

/**
 * @param {number|string} userId
 * @param {{ start_date?: string, end_date?: string }} params
 */
export async function fetchUserTaskDetail(userId, params = {}) {
    const queryParams = new URLSearchParams();
    queryParams.append('user_id', String(userId));
    if (params.start_date) {
        queryParams.append('start_date', params.start_date);
    }
    if (params.end_date) {
        queryParams.append('end_date', params.end_date);
    }
    const url = `${backendBase}/machining/reports/user-task-detail/?${queryParams.toString()}`;

    const response = await authedFetch(url);
    if (!response.ok) {
        const err = new Error(`HTTP error! status: ${response.status}`);
        err.status = response.status;
        throw err;
    }
    return response.json();
}
