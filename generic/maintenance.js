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

export async function fetchMachineFaults() {
    const response = await authedFetch(`${backendBase}/machines/faults/`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        }
    });
    
    if (!response.ok) {
        throw new Error('Failed to fetch machine faults');
    }
    
    const data = await response.json();
    return extractResultsFromResponse(data);
}