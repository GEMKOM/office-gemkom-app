import { authedFetch } from '../../authService.js';
import { backendBase } from '../../base.js';

const CNC_CUTTING_BASE_URL = `${backendBase}/cnc_cutting`;

/**
 * CNC Cutting CRUD Operations
 * Handles CNC tasks and parts with file upload support
 */

/**
 * Get all CNC tasks (list view)
 * @returns {Promise<Array>} Array of CNC tasks
 */
export async function getCncTasks() {
    try {
        const response = await authedFetch(`${CNC_CUTTING_BASE_URL}/tasks/`);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch CNC tasks: ${response.statusText}`);
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
        console.error('Error fetching CNC tasks:', error);
        throw error;
    }
}

/**
 * Get a single CNC task by ID (detail view)
 * @param {number} taskId - The CNC task ID
 * @returns {Promise<Object>} CNC task with parts
 */
export async function getCncTask(taskId) {
    try {
        const response = await authedFetch(`${CNC_CUTTING_BASE_URL}/tasks/${taskId}/`);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch CNC task: ${response.statusText}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error fetching CNC task:', error);
        throw error;
    }
}

/**
 * Create a new CNC task
 * @param {Object} taskData - CNC task data
 * @param {string} taskData.name - Task name
 * @param {string} taskData.nesting_id - Nesting ID
 * @param {string} taskData.material - Material type
 * @param {string} taskData.dimensions - Dimensions
 * @param {number} taskData.thickness_mm - Thickness in mm
 * @param {File} taskData.nesting_file - Nesting file (optional)
 * @param {Array} taskData.parts_data - Array of parts data (optional)
 * @returns {Promise<Object>} Created CNC task
 */
export async function createCncTask(taskData) {
    try {
        // Create FormData for file upload support
        const formData = new FormData();
        
        // Add basic task fields
        formData.append('name', taskData.name);
        formData.append('nesting_id', taskData.nesting_id);
        formData.append('material', taskData.material);
        formData.append('dimensions', taskData.dimensions);
        formData.append('thickness_mm', taskData.thickness_mm);
        
        // Add files if provided
        if (taskData.files && taskData.files.length > 0) {
            taskData.files.forEach(file => {
                formData.append('files', file);
            });
        }
        
        // Add parts data if provided - send as JSON array
        if (taskData.parts_data && taskData.parts_data.length > 0) {
            formData.append('parts_data', JSON.stringify(taskData.parts_data));
        }
        
        const response = await authedFetch(`${CNC_CUTTING_BASE_URL}/tasks/`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Failed to create CNC task: ${response.statusText} - ${JSON.stringify(errorData)}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error creating CNC task:', error);
        throw error;
    }
}

/**
 * Update an existing CNC task
 * @param {number} taskId - The CNC task ID
 * @param {Object} taskData - Updated CNC task data
 * @param {string} [taskData.name] - Task name
 * @param {string} [taskData.nesting_id] - Nesting ID
 * @param {string} [taskData.material] - Material type
 * @param {string} [taskData.dimensions] - Dimensions
 * @param {number} [taskData.thickness_mm] - Thickness in mm
 * @param {File} [taskData.nesting_file] - New nesting file (optional)
 * @returns {Promise<Object>} Updated CNC task
 */
export async function updateCncTask(taskId, taskData) {
    try {
        // Create FormData for potential file upload
        const formData = new FormData();
        
        // Add only provided fields
        if (taskData.name !== undefined) formData.append('name', taskData.name);
        if (taskData.nesting_id !== undefined) formData.append('nesting_id', taskData.nesting_id);
        if (taskData.material !== undefined) formData.append('material', taskData.material);
        if (taskData.dimensions !== undefined) formData.append('dimensions', taskData.dimensions);
        if (taskData.thickness_mm !== undefined) formData.append('thickness_mm', taskData.thickness_mm);
        
        // Add nesting file if provided
        if (taskData.nesting_file) {
            formData.append('nesting_file', taskData.nesting_file);
        }
        
        const response = await authedFetch(`${CNC_CUTTING_BASE_URL}/tasks/${taskId}/`, {
            method: 'PATCH',
            headers: {
                // Don't set Content-Type for FormData, let browser set it with boundary
                'Authorization': response.headers.get('Authorization'),
                'X-Subdomain': 'ofis.gemcore.com.tr'
            },
            body: formData
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Failed to update CNC task: ${response.statusText} - ${JSON.stringify(errorData)}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error updating CNC task:', error);
        throw error;
    }
}

/**
 * Delete a CNC task
 * @param {number} taskId - The CNC task ID
 * @returns {Promise<boolean>} Success status
 */
export async function deleteCncTask(taskId) {
    try {
        const response = await authedFetch(`${CNC_CUTTING_BASE_URL}/tasks/${taskId}/`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error(`Failed to delete CNC task: ${response.statusText}`);
        }
        
        return true;
    } catch (error) {
        console.error('Error deleting CNC task:', error);
        throw error;
    }
}

/**
 * Create a new CNC part for a specific task
 * @param {number} taskId - The CNC task ID
 * @param {Object} partData - Part data
 * @param {string} partData.job_no - Job number
 * @param {string} partData.image_no - Image number
 * @param {string} partData.position_no - Position number
 * @param {number} partData.weight_kg - Weight in kg
 * @returns {Promise<Object>} Created CNC part
 */
export async function createCncPart(taskId, partData) {
    try {
        const response = await authedFetch(`${CNC_CUTTING_BASE_URL}/tasks/${taskId}/parts/`, {
            method: 'POST',
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
 * Update a CNC part
 * @param {number} taskId - The CNC task ID
 * @param {number} partId - The CNC part ID
 * @param {Object} partData - Updated part data
 * @returns {Promise<Object>} Updated CNC part
 */
export async function updateCncPart(taskId, partId, partData) {
    try {
        const response = await authedFetch(`${CNC_CUTTING_BASE_URL}/tasks/${taskId}/parts/${partId}/`, {
            method: 'PATCH',
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
 * @param {number} taskId - The CNC task ID
 * @param {number} partId - The CNC part ID
 * @returns {Promise<boolean>} Success status
 */
export async function deleteCncPart(taskId, partId) {
    try {
        const response = await authedFetch(`${CNC_CUTTING_BASE_URL}/tasks/${taskId}/parts/${partId}/`, {
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
 * Utility function to format CNC task data for display
 * @param {Object} task - CNC task object
 * @returns {Object} Formatted task data
 */
export function formatCncTaskForDisplay(task) {
    return {
        id: task.key,
        name: task.name,
        nestingId: task.nesting_id,
        material: task.material,
        dimensions: task.dimensions,
        thicknessMm: task.thickness_mm,
        nestingFileUrl: task.nesting_file_url,
        parts: task.parts || [],
        createdAt: task.created_at,
        updatedAt: task.updated_at
    };
}

/**
 * Utility function to validate CNC task data before submission
 * @param {Object} taskData - CNC task data to validate
 * @returns {Object} Validation result with isValid and errors
 */
export function validateCncTaskData(taskData) {
    const errors = [];
    
    if (!taskData.name || taskData.name.trim() === '') {
        errors.push('Task name is required');
    }
    
    if (!taskData.nesting_id || taskData.nesting_id.trim() === '') {
        errors.push('Nesting ID is required');
    }
    
    if (!taskData.material || taskData.material.trim() === '') {
        errors.push('Material is required');
    }
    
    if (!taskData.dimensions || taskData.dimensions.trim() === '') {
        errors.push('Dimensions are required');
    }
    
    if (!taskData.thickness_mm || isNaN(taskData.thickness_mm) || taskData.thickness_mm <= 0) {
        errors.push('Valid thickness (mm) is required');
    }
    
    return {
        isValid: errors.length === 0,
        errors
    };
}

/**
 * Utility function to validate CNC part data
 * @param {Object} partData - CNC part data to validate
 * @returns {Object} Validation result with isValid and errors
 */
export function validateCncPartData(partData) {
    const errors = [];
    
    if (!partData.job_no || partData.job_no.trim() === '') {
        errors.push('Job number is required');
    }
    
    if (!partData.image_no || partData.image_no.trim() === '') {
        errors.push('Image number is required');
    }
    
    if (!partData.position_no || partData.position_no.trim() === '') {
        errors.push('Position number is required');
    }
    
    if (!partData.weight_kg || isNaN(partData.weight_kg) || partData.weight_kg <= 0) {
        errors.push('Valid weight (kg) is required');
    }
    
    return {
        isValid: errors.length === 0,
        errors
    };
}
