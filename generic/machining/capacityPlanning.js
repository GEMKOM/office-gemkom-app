import { authedFetch } from '../../authService.js';
import { backendBase } from '../../base.js';

export async function getCapacityPlanning(machine_id, filters = {}) {
    try {
        const queryParams = new URLSearchParams();
        
        // Add filters to query parameters
        Object.keys(filters).forEach(key => {
            if (filters[key] !== null && filters[key] !== undefined && filters[key] !== '') {
                queryParams.append(key, filters[key]);
            }
        });

        if (machine_id) {
            queryParams.append('machine_fk', machine_id);
        } else {
            throw new Error('Machine ID is required');
        }

        const url = `${backendBase}/machining/planning/list/${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
        
        const response = await authedFetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching capacity planning:', error);
        throw error;
    }
}


export async function updateCapacityPlanning(data) {
    try {
        const response = await authedFetch(`${backendBase}/machining/planning/bulk-save/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        return result;
    } catch (error) {
        console.error('Error updating capacity planning:', error);
        throw error;
    }
}

export async function getMachineTimeline(machine_id, start_after = null, start_before = null) {
    try {
        const queryParams = new URLSearchParams();
        
        // Add required machine_fk parameter
        if (machine_id) {
            queryParams.append('machine_fk', machine_id);
        } else {
            throw new Error('Machine ID is required');
        }
        
        // Add optional time range parameters
        if (start_after !== null) {
            queryParams.append('start_after', start_after);
        }
        if (start_before !== null) {
            queryParams.append('start_before', start_before);
        }

        const url = `${backendBase}/machining/analytics/machine-timeline/?${queryParams.toString()}`;
        
        const response = await authedFetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching machine timeline:', error);
        throw error;
    }
}