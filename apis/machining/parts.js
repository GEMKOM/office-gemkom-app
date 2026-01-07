import { authedFetch } from '../../authService.js';
import { backendBase } from '../../base.js';

const MACHINING_2_BASE_URL = `${backendBase}/tasks`;

/**
 * Machining Parts API Operations
 * Handles Part model CRUD operations
 * Based on PartViewSet Django REST Framework ViewSet
 */

/**
 * Get all parts (list view)
 * @param {Object} [filters] - Optional filters and query parameters
 * @param {string} [filters.job_no] - Filter by job number
 * @param {number} [filters.completion_date] - Filter by completion date (timestamp)
 * @param {string} [filters.ordering] - Ordering field (e.g., '-created_at', 'finish_time')
 * @param {number} [filters.page] - Page number for pagination
 * @param {number} [filters.page_size] - Page size for pagination
 * @returns {Promise<Array|Object>} Array of parts or paginated response
 */
export async function getParts(filters = {}) {
    try {
        const queryParams = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
                queryParams.append(key, value);
            }
        });
        
        const url = queryParams.toString() 
            ? `${MACHINING_2_BASE_URL}/parts/?${queryParams.toString()}`
            : `${MACHINING_2_BASE_URL}/parts/`;
        
        const response = await authedFetch(url);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Failed to fetch parts: ${response.statusText} - ${JSON.stringify(errorData)}`);
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
        console.error('Error fetching parts:', error);
        throw error;
    }
}

/**
 * Get a single part by key (detail view)
 * @param {string} partKey - The part key (primary key)
 * @returns {Promise<Object>} Part data with operations
 */
export async function getPart(partKey) {
    try {
        const response = await authedFetch(`${MACHINING_2_BASE_URL}/parts/${partKey}/`);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Failed to fetch part: ${response.statusText} - ${JSON.stringify(errorData)}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error fetching part:', error);
        throw error;
    }
}

/**
 * Create a new part with nested operations
 * Uses PartWithOperationsSerializer on backend
 * @param {Object} partData - Part data with operations
 * @param {string} partData.name - Part name (required)
 * @param {string} [partData.description] - Part description
 * @param {string} [partData.job_no] - Job number
 * @param {string} [partData.image_no] - Image number
 * @param {string} [partData.position_no] - Position number
 * @param {number} [partData.quantity] - Quantity
 * @param {string} [partData.material] - Material
 * @param {string} [partData.dimensions] - Dimensions
 * @param {number} [partData.weight_kg] - Weight in kg
 * @param {string} [partData.finish_time] - Finish time (date string)
 * @param {Array<Object>} partData.operations - Array of operation data (required)
 * @param {string} operations[].name - Operation name (required)
 * @param {string} [operations[].description] - Operation description
 * @param {number} operations[].order - Operation order (required)
 * @param {number} operations[].machine_fk - Machine ID (required)
 * @param {boolean} [operations[].interchangeable] - Whether operation can be done out of order
 * @param {number} [operations[].estimated_hours] - Estimated hours
 * @param {Array<number>} [operations[].tools] - Array of tool IDs
 * @returns {Promise<Object>} Created part with operations
 */
export async function createPart(partData) {
    try {
        const response = await authedFetch(`${MACHINING_2_BASE_URL}/parts/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(partData)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Failed to create part: ${response.statusText} - ${JSON.stringify(errorData)}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error creating part:', error);
        throw error;
    }
}

/**
 * Bulk create multiple parts with their operations in a single request
 * Uses atomic transactions - all parts are created or none if validation fails
 * @param {Array<Object>} partsData - Array of part data with operations
 * @param {string} [partsData[].task_key] - Task key (optional)
 * @param {string} partsData[].name - Part name (required)
 * @param {string} [partsData[].description] - Part description
 * @param {string} [partsData[].job_no] - Job number
 * @param {string} [partsData[].image_no] - Image number
 * @param {string} [partsData[].position_no] - Position number
 * @param {number} [partsData[].quantity] - Quantity
 * @param {string} [partsData[].material] - Material
 * @param {string} [partsData[].dimensions] - Dimensions
 * @param {number} [partsData[].weight_kg] - Weight in kg
 * @param {string} [partsData[].finish_time] - Finish time (date string)
 * @param {Array<Object>} [partsData[].operations] - Array of operation data (can be empty)
 * @param {string} operations[].name - Operation name (required if operations provided)
 * @param {string} [operations[].description] - Operation description
 * @param {number} operations[].order - Operation order (required if operations provided)
 * @param {number} operations[].machine_fk - Machine ID (required if operations provided)
 * @param {boolean} [operations[].interchangeable] - Whether operation can be done out of order
 * @param {number|string} [operations[].estimated_hours] - Estimated hours
 * @param {Array<number|Object>} [operations[].tools] - Array of tool IDs or objects with tool and quantity
 * @param {number} tools[].tool - Tool ID (if tools is array of objects)
 * @param {number} tools[].quantity - Tool quantity (if tools is array of objects)
 * @returns {Promise<Object>} Response with created count and parts array, or error with failures
 * @throws {Error} If the request fails with validation errors
 */
export async function bulkCreateParts(partsData) {
    try {
        if (!Array.isArray(partsData) || partsData.length === 0) {
            throw new Error('partsData must be a non-empty array');
        }

        const response = await authedFetch(`${MACHINING_2_BASE_URL}/parts/bulk-create/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(partsData)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            
            // If there are detailed failures, include them in the error
            if (errorData.failures && Array.isArray(errorData.failures)) {
                const failureMessages = errorData.failures.map((failure, idx) => {
                    const index = failure.index !== undefined ? failure.index : idx;
                    const errors = failure.errors || {};
                    const errorMessages = Object.entries(errors)
                        .map(([field, messages]) => `${field}: ${Array.isArray(messages) ? messages.join(', ') : messages}`)
                        .join('; ');
                    return `Item ${index + 1}: ${errorMessages || 'Unknown error'}`;
                }).join('\n');
                
                throw new Error(`Bulk creation failed:\n${failureMessages}`);
            }
            
            throw new Error(`Failed to bulk create parts: ${response.statusText} - ${JSON.stringify(errorData)}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error bulk creating parts:', error);
        throw error;
    }
}

/**
 * Update an existing part
 * @param {string} partKey - The part key (primary key)
 * @param {Object} partData - Updated part data (only fields to update)
 * @param {string} [partData.name] - Part name
 * @param {string} [partData.description] - Part description
 * @param {string} [partData.job_no] - Job number
 * @param {string} [partData.image_no] - Image number
 * @param {string} [partData.position_no] - Position number
 * @param {number} [partData.quantity] - Quantity
 * @param {string} [partData.material] - Material
 * @param {string} [partData.dimensions] - Dimensions
 * @param {number} [partData.weight_kg] - Weight in kg
 * @param {string} [partData.finish_time] - Finish time (date string)
 * @returns {Promise<Object>} Updated part
 */
export async function updatePart(partKey, partData) {
    try {
        const response = await authedFetch(`${MACHINING_2_BASE_URL}/parts/${partKey}/`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(partData)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Failed to update part: ${response.statusText} - ${JSON.stringify(errorData)}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error updating part:', error);
        throw error;
    }
}

/**
 * Delete a part
 * @param {string} partKey - The part key (primary key)
 * @returns {Promise<boolean>} Success status
 */
export async function deletePart(partKey) {
    try {
        const response = await authedFetch(`${MACHINING_2_BASE_URL}/parts/${partKey}/`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Failed to delete part: ${response.statusText} - ${JSON.stringify(errorData)}`);
        }
        
        return true;
    } catch (error) {
        console.error('Error deleting part:', error);
        throw error;
    }
}

/**
 * Utility function to validate part data
 * @param {Object} partData - Part data to validate
 * @param {boolean} isUpdate - Whether this is an update operation (optional fields)
 * @returns {Object} Validation result with isValid and errors
 */
export function validatePartData(partData, isUpdate = false) {
    const errors = [];
    
    if (!isUpdate) {
        // For creation, name and operations are required
        if (!partData.name || partData.name.trim() === '') {
            errors.push('Part name is required');
        }
        
        if (!partData.operations || !Array.isArray(partData.operations) || partData.operations.length === 0) {
            errors.push('At least one operation is required');
        } else {
            // Validate each operation
            partData.operations.forEach((op, index) => {
                if (!op.name || op.name.trim() === '') {
                    errors.push(`Operation ${index + 1}: name is required`);
                }
                if (op.order === undefined || op.order === null) {
                    errors.push(`Operation ${index + 1}: order is required`);
                }
                if (!op.machine_fk) {
                    errors.push(`Operation ${index + 1}: machine_fk is required`);
                }
            });
        }
    }
    
    // Validate optional fields if provided
    if (partData.weight_kg !== undefined && partData.weight_kg !== null && partData.weight_kg !== '') {
        const weight = parseFloat(partData.weight_kg);
        if (isNaN(weight) || weight < 0) {
            errors.push('Weight must be a valid positive number');
        }
    }
    
    if (partData.quantity !== undefined && partData.quantity !== null && partData.quantity !== '') {
        const quantity = parseInt(partData.quantity);
        if (isNaN(quantity) || quantity < 0) {
            errors.push('Quantity must be a valid positive integer');
        }
    }
    
    return {
        isValid: errors.length === 0,
        errors
    };
}

/**
 * Update part operations (bulk add/update/delete)
 * @param {string} partKey - The part key (primary key)
 * @param {Object} updateData - Update data
 * @param {Array<Object>} updateData.operations - Array of operations to add/update
 * @param {Array<string>} updateData.delete_operations - Array of operation keys to delete
 * @returns {Promise<Object>} Updated operations response
 */
export async function updatePartOperations(partKey, updateData) {
    try {
        const response = await authedFetch(`${MACHINING_2_BASE_URL}/parts/${partKey}/update_operations/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updateData)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Failed to update part operations: ${response.statusText} - ${JSON.stringify(errorData)}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error updating part operations:', error);
        throw error;
    }
}

/**
 * Utility function to format part data for display
 * @param {Object} part - Part object
 * @returns {Object} Formatted part data
 */
export function formatPartForDisplay(part) {
    return {
        key: part.key,
        name: part.name,
        description: part.description,
        jobNo: part.job_no,
        imageNo: part.image_no,
        positionNo: part.position_no,
        quantity: part.quantity,
        material: part.material,
        dimensions: part.dimensions,
        weightKg: part.weight_kg,
        finishTime: part.finish_time,
        createdBy: part.created_by_username,
        createdAt: part.created_at,
        completedBy: part.completed_by_username,
        completionDate: part.completion_date,
        hasIncompleteOperations: part.has_incomplete_operations,
        operations: part.operations || []
    };
}

