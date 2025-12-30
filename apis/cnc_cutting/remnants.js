import { authedFetch } from '../../authService.js';
import { backendBase } from '../../base.js';
/**
 * Get all remnant plates (list view)
 * @param {URLSearchParams|Object} [params] - Optional search params (URLSearchParams or plain object)
 * @returns {Promise<Array|Object>} Array of remnant plates or paginated response
 */
export async function getRemnantPlates(params = undefined) {
    try {
        let query = '';
        if (params) {
            const searchParams = params instanceof URLSearchParams ? params : new URLSearchParams(params);
            const qs = searchParams.toString();
            query = qs ? `?${qs}` : '';
        }
        const url = `${backendBase}/cnc_cutting/remnants/${query}`;
        const response = await authedFetch(url);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch remnant plates: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Handle both direct array response and paginated response
        if (data.results && Array.isArray(data.results)) {
            return data; // Return the full paginated response
        } else if (Array.isArray(data)) {
            return data; // Return the direct array
        } else {
            throw new Error('Unexpected response format');
        }
    } catch (error) {
        console.error('Error fetching remnant plates:', error);
        throw error;
    }
}

/**
 * Get a single remnant plate by ID
 * @param {number|string} remnantId - Remnant plate ID
 * @returns {Promise<Object>} Remnant plate object
 */
export async function getRemnantPlateById(remnantId) {
    try {
        const response = await authedFetch(`${backendBase}/cnc_cutting/remnants/${remnantId}/`);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch remnant plate: ${response.statusText}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error fetching remnant plate by ID:', error);
        throw error;
    }
}

/**
 * Create a new remnant plate
 * @param {Object} remnantData - Remnant plate data
 * @param {string} remnantData.thickness_mm - Thickness in mm
 * @param {string} remnantData.dimensions - Dimensions (e.g., "1200x800")
 * @param {number} remnantData.quantity - Quantity
 * @param {string} remnantData.material - Material type
 * @param {string|null} remnantData.assigned_to - Assigned user (optional)
 * @returns {Promise<Object>} Created remnant plate
 */
export async function createRemnantPlate(remnantData) {
    try {
        const response = await authedFetch(`${backendBase}/cnc_cutting/remnants/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(remnantData)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Failed to create remnant plate: ${response.statusText} - ${JSON.stringify(errorData)}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error creating remnant plate:', error);
        throw error;
    }
}

/**
 * Bulk create remnant plates
 * @param {Array<Object>} remnantsData - Array of remnant plate data objects
 * @returns {Promise<Array>} Array of created remnant plates
 */
export async function bulkCreateRemnantPlates(remnantsData) {
    try {
        const response = await authedFetch(`${backendBase}/cnc_cutting/remnants/bulk-create/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(remnantsData)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Failed to bulk create remnant plates: ${response.statusText} - ${JSON.stringify(errorData)}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error bulk creating remnant plates:', error);
        throw error;
    }
}

/**
 * Update an existing remnant plate
 * @param {number|string} remnantId - Remnant plate ID
 * @param {Object} remnantData - Updated remnant plate data
 * @param {string} [remnantData.thickness_mm] - Thickness in mm
 * @param {string} [remnantData.thickness_mm_2] - Second thickness in mm (optional)
 * @param {string} [remnantData.dimensions] - Dimensions (e.g., "1200x800")
 * @param {number} [remnantData.quantity] - Quantity
 * @param {string} [remnantData.material] - Material type
 * @param {string} [remnantData.heat_number] - Heat number (optional)
 * @returns {Promise<Object>} Updated remnant plate
 */
export async function updateRemnantPlate(remnantId, remnantData) {
    try {
        const response = await authedFetch(`${backendBase}/cnc_cutting/remnants/${remnantId}/`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(remnantData)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Failed to update remnant plate: ${response.statusText} - ${JSON.stringify(errorData)}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error updating remnant plate:', error);
        throw error;
    }
}

/**
 * Delete a remnant plate
 * @param {number|string} remnantId - Remnant plate ID to delete
 * @returns {Promise<Object>} Deletion response
 */
export async function deleteRemnantPlate(remnantId) {
    try {
        const response = await authedFetch(`${backendBase}/cnc_cutting/remnants/${remnantId}/`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Failed to delete remnant plate: ${response.statusText} - ${JSON.stringify(errorData)}`);
        }
        
        // DELETE requests may not have a response body
        if (response.status === 204 || response.status === 200) {
            return { success: true };
        }
        
        return await response.json().catch(() => ({ success: true }));
    } catch (error) {
        console.error('Error deleting remnant plate:', error);
        throw error;
    }
}