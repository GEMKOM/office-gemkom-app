import { authedFetch } from '../authService.js';
import { backendBase } from '../base.js';
import { extractResultsFromResponse } from './paginationHelper.js';

export async function fetchMachines(page = 1, pageSize = 10, filters = {}, ordering = null) {
    try {
        let url = `${backendBase}/machines/`;
        
        // Build query parameters from filters
        const params = new URLSearchParams();
        
        if (page) {
            params.append('page', page);
        }
        
        if (pageSize) {
            params.append('page_size', pageSize);
        }
        
        if (filters.name) {
            params.append('name', filters.name);
        }
        
        if (filters.code) {
            params.append('code', filters.code);
        }
        
        if (filters.machine_type) {
            params.append('machine_type', filters.machine_type);
        }
        
        if (filters.used_in) {
            params.append('used_in', filters.used_in);
        }
        
        if (filters.is_active !== undefined && filters.is_active !== '') {
            params.append('is_active', filters.is_active);
        }
        
        // Add ordering parameter
        if (ordering) {
            params.append('ordering', ordering);
        }
        
        // Add query parameters to URL if any exist
        if (params.toString()) {
            url += `?${params.toString()}`;
        }
        
        const response = await authedFetch(url);
        
        if (!response.ok) {
            throw new Error('Failed to fetch machines');
        }
        
        const machines = await response.json();
        return machines;
    } catch (error) {
        // Error fetching machines
        throw error;
    }
}

export async function getMachine(machineId) {
    const response = await authedFetch(`${backendBase}/machines/${machineId}/`);
    return response.json();
}

export async function fetchMachineTypes() {
    const response = await authedFetch(`${backendBase}/machines/types/`);
    return response.json();
}

export async function fetchMachineUsedIn() {
    const response = await authedFetch(`${backendBase}/machines/used_in/`);
    return response.json();
}

// Create a new machine
export async function createMachine(payload) {
    const response = await authedFetch(`${backendBase}/machines/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        const err = await safeParseJson(response);
        throw new Error(err?.message || 'Failed to create machine');
    }
    return response.json();
}

// Update an existing machine (PATCH)
export async function updateMachine(machineId, payload) {
    const response = await authedFetch(`${backendBase}/machines/${machineId}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        const err = await safeParseJson(response);
        throw new Error(err?.message || 'Failed to update machine');
    }
    return response.json();
}

// Delete a machine
export async function deleteMachine(machineId) {
    const response = await authedFetch(`${backendBase}/machines/${machineId}/`, {
        method: 'DELETE'
    });
    if (!response.ok) {
        const err = await safeParseJson(response);
        throw new Error(err?.message || 'Failed to delete machine');
    }
    return response.json();
}

async function safeParseJson(response) {
    try {
        return await response.json();
    } catch (_) {
        return null;
    }
}

export async function getMachineCalendar(machineId) {
    const response = await authedFetch(`${backendBase}/machines/calendar?machine_fk=${machineId}`);
    return response.json();
}