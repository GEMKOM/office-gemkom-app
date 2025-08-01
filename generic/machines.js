import { authedFetch } from '../authService.js';
import { backendBase } from '../base.js';

export async function fetchMachines(used_in = null) {
    try {
        let url = `${backendBase}/machines/`;
        
        // Add used_in filter if provided
        if (used_in) {
            url += `?used_in=${encodeURIComponent(used_in)}`;
        }
        
        const response = await authedFetch(url);
        
        if (!response.ok) {
            throw new Error('Failed to fetch machines');
        }
        
        const machines = await response.json();
        return machines;
    } catch (error) {
        console.error('Error fetching machines:', error);
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