import { authedFetch } from '../../authService.js';
import { backendBase } from '../../base.js';

const CNC_CUTTING_BASE_URL = `${backendBase}/cnc_cutting`;

/**
 * CNC Parts API Operations
 * Handles individual CNC parts management
 */

/**
 * Create a new CNC part
 * @param {Object} partData - Part data
 * @param {number} partData.cnc_task - CNC task ID (required)
 * @param {string} partData.job_no - Job number (required)
 * @param {string} [partData.image_no] - Image number (optional)
 * @param {string} [partData.position_no] - Position number (optional)
 * @param {string} [partData.weight_kg] - Weight in kg (optional)
 * @returns {Promise<Object>} Created CNC part
 */
export async function createCncPart(partData) {
    try {
        const response = await authedFetch(`${CNC_CUTTING_BASE_URL}/parts/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(partData)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Failed to create CNC part: ${response.statusText} - ${JSON.stringify(errorData)}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error creating CNC part:', error);
        throw error;
    }
}

/**
 * Partially update a CNC part
 * @param {number} partId - The CNC part ID
 * @param {Object} partData - Updated part data (only fields to update)
 * @param {string} [partData.job_no] - Job number
 * @param {string} [partData.image_no] - Image number
 * @param {string} [partData.position_no] - Position number
 * @param {string} [partData.weight_kg] - Weight in kg
 * @returns {Promise<Object>} Updated CNC part
 */
export async function updateCncPart(partId, partData) {
    try {
        const response = await authedFetch(`${CNC_CUTTING_BASE_URL}/parts/${partId}/`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(partData)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Failed to update CNC part: ${response.statusText} - ${JSON.stringify(errorData)}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error updating CNC part:', error);
        throw error;
    }
}

/**
 * Delete a CNC part
 * @param {number} partId - The CNC part ID
 * @returns {Promise<boolean>} Success status
 */
export async function deleteCncPart(partId) {
    try {
        const response = await authedFetch(`${CNC_CUTTING_BASE_URL}/parts/${partId}/`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error(`Failed to delete CNC part: ${response.statusText}`);
        }
        
        return true;
    } catch (error) {
        console.error('Error deleting CNC part:', error);
        throw error;
    }
}

/**
 * Get a single CNC part by ID
 * @param {number} partId - The CNC part ID
 * @returns {Promise<Object>} CNC part data
 */
export async function getCncPart(partId) {
    try {
        const response = await authedFetch(`${CNC_CUTTING_BASE_URL}/parts/${partId}/`);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch CNC part: ${response.statusText}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error fetching CNC part:', error);
        throw error;
    }
}

/**
 * Get all CNC parts (with optional filtering)
 * @param {Object} [filters] - Optional filters
 * @param {number} [filters.cnc_task] - Filter by CNC task ID
 * @param {string} [filters.job_no] - Filter by job number
 * @returns {Promise<Array>} Array of CNC parts
 */
export async function getCncParts(filters = {}) {
    try {
        // Build query parameters
        const queryParams = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
                queryParams.append(key, value);
            }
        });
        
        const url = queryParams.toString() 
            ? `${CNC_CUTTING_BASE_URL}/parts/?${queryParams.toString()}`
            : `${CNC_CUTTING_BASE_URL}/parts/`;
        
        const response = await authedFetch(url);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch CNC parts: ${response.statusText}`);
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
        console.error('Error fetching CNC parts:', error);
        throw error;
    }
}

/**
 * Utility function to validate CNC part data
 * @param {Object} partData - CNC part data to validate
 * @param {boolean} isUpdate - Whether this is an update operation (optional fields)
 * @returns {Object} Validation result with isValid and errors
 */
export function validateCncPartData(partData, isUpdate = false) {
    const errors = [];
    
    if (!isUpdate) {
        // For creation, cnc_task and job_no are required
        if (!partData.cnc_task) {
            errors.push('CNC task ID is required');
        }
        
        if (!partData.job_no || partData.job_no.trim() === '') {
            errors.push('Job number is required');
        }
    }
    
    // Validate optional fields if provided
    if (partData.weight_kg !== undefined && partData.weight_kg !== null && partData.weight_kg !== '') {
        const weight = parseFloat(partData.weight_kg);
        if (isNaN(weight) || weight < 0) {
            errors.push('Weight must be a valid positive number');
        }
    }
    
    return {
        isValid: errors.length === 0,
        errors
    };
}

/**
 * Utility function to format CNC part data for display
 * @param {Object} part - CNC part object
 * @returns {Object} Formatted part data
 */
export function formatCncPartForDisplay(part) {
    return {
        id: part.id,
        cncTask: part.cnc_task,
        jobNo: part.job_no,
        imageNo: part.image_no,
        positionNo: part.position_no,
        weightKg: part.weight_kg,
        createdAt: part.created_at,
        updatedAt: part.updated_at
    };
}
