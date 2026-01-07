import { authedFetch } from '../../authService.js';
import { backendBase } from '../../base.js';

const MACHINING_2_BASE_URL = `${backendBase}/tasks`;

/**
 * Machining General API Operations
 * General utility functions and shared operations for machining
 */

/**
 * Get machining statistics or summary
 * Can be extended with additional general endpoints as needed
 * @param {Object} [filters] - Optional filters
 * @returns {Promise<Object>} Statistics or summary data
 */
export async function getMachiningStats(filters = {}) {
    try {
        const queryParams = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
                queryParams.append(key, value);
            }
        });
        
        const url = queryParams.toString() 
            ? `${MACHINING_2_BASE_URL}/stats/?${queryParams.toString()}`
            : `${MACHINING_2_BASE_URL}/stats/`;
        
        const response = await authedFetch(url);
        
        if (!response.ok) {
            // If endpoint doesn't exist, return null (not an error)
            if (response.status === 404) {
                return null;
            }
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Failed to fetch machining stats: ${response.statusText} - ${JSON.stringify(errorData)}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error fetching machining stats:', error);
        throw error;
    }
}

