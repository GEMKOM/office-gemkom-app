import { authedFetch } from '../authService.js';
import { extractResultsFromResponse } from './paginationHelper.js';
import { backendBase } from '../base.js';

export async function createMaintenanceRequest(requestData) {
    const response = await authedFetch(`${backendBase}/machines/faults/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData)
    });
    
    if (!response.ok) {
        throw new Error('Failed to create maintenance request');
    }
    
    return response.json();
}

export async function resolveMaintenanceRequest(requestId, resolutionData) { 
    // Now resolve the maintenance request
    const response = await authedFetch(`${backendBase}/machines/faults/${requestId}/`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(resolutionData)
    });

    if (!response.ok) {
        throw new Error('Failed to resolve maintenance request');
    }
    
    const data = await response.json();
    return extractResultsFromResponse(data);
}

export async function fetchMachineFaults(filters = {}) {
    try {
        const queryParams = new URLSearchParams();
        
        // Add pagination parameters
        if (filters.page) {
            queryParams.append('page', filters.page);
        }
        if (filters.page_size) {
            queryParams.append('page_size', filters.page_size);
        }
        
        // Add other filters
        Object.keys(filters).forEach(key => {
            if (filters[key] !== null && filters[key] !== undefined && filters[key] !== '' && 
                key !== 'page' && key !== 'page_size') {
                queryParams.append(key, filters[key]);
            }
        });

        const url = `${backendBase}/machines/faults/${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
        
        const response = await authedFetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch machine faults');
        }
        
        const data = await response.json();
        return data; // Return the full response for pagination info
    } catch (error) {
        console.error('Error fetching machine faults:', error);
        throw error;
    }
}