import { authedFetch } from '../../authService.js';
import { backendBase } from '../../base.js';

// Fetch Machine Faults Summary Report
// GET /machines/reports/faults/
// Accepts optional filters (including page, page_size)
export async function fetchMachineFaultsSummaryReport(filters = {}) {
    const queryParams = new URLSearchParams();

    // Standard pagination params
    if (filters.page) queryParams.append('page', filters.page);
    if (filters.page_size) queryParams.append('page_size', filters.page_size);

    // Other filters
    Object.keys(filters).forEach((key) => {
        if (key === 'page' || key === 'page_size') return;
        const value = filters[key];
        if (value !== null && value !== undefined && value !== '') {
            queryParams.append(key, value);
        }
    });

    const url = `${backendBase}/machines/reports/faults/${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;

    const response = await authedFetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
        throw new Error('Failed to fetch machine faults summary report');
    }

    return response.json();
}

// Fetch User Resolution Report
// GET /machines/reports/user-resolution/
// Accepts optional filters (including page, page_size)
export async function fetchUserResolutionReport(filters = {}) {
    const queryParams = new URLSearchParams();

    // Standard pagination params
    if (filters.page) queryParams.append('page', filters.page);
    if (filters.page_size) queryParams.append('page_size', filters.page_size);

    // Other filters
    Object.keys(filters).forEach((key) => {
        if (key === 'page' || key === 'page_size') return;
        const value = filters[key];
        if (value !== null && value !== undefined && value !== '') {
            queryParams.append(key, value);
        }
    });

    const url = `${backendBase}/machines/reports/user-resolution/${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;

    const response = await authedFetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
        throw new Error('Failed to fetch user resolution report');
    }

    return response.json();
}


