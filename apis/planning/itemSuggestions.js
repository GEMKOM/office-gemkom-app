import { authedFetch } from '../../authService.js';
import { backendBase } from '../../base.js';

const PLANNING_BASE_URL = `${backendBase}/planning`;

/**
 * Item Suggestions API Functions
 * Handles item suggestion/search operations
 */

/**
 * Get item suggestions based on search query
 * @param {Object} params - Search parameters
 * @param {string} params.query - Search query (searches in item code, name)
 * @param {number} [params.limit] - Maximum number of results to return
 * @returns {Promise<Array>} Array of suggested items
 */
export async function getItemSuggestions(params = {}) {
    try {
        const queryParams = new URLSearchParams();
        
        if (params.query) {
            queryParams.append('query', params.query);
        }
        if (params.limit) {
            queryParams.append('limit', params.limit);
        }

        const url = `${PLANNING_BASE_URL}/item-suggestions/${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
        const response = await authedFetch(url);

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || errorData.error || 'Ürün önerileri yüklenirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching item suggestions:', error);
        throw error;
    }
}

