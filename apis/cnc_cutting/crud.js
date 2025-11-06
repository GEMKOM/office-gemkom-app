import { authedFetch } from '../../authService.js';
import { backendBase } from '../../base.js';

const CNC_CUTTING_BASE_URL = `${backendBase}/cnc_cutting`;

/**
 * CNC Cutting CRUD Operations
 * Handles CNC tasks and parts with file upload support
 */

/**
 * Get all CNC tasks (list view)
 * @param {URLSearchParams|Object} [params] - Optional search params (URLSearchParams or plain object)
 * @returns {Promise<Array|Object>} Array of CNC tasks or paginated response
 */
export async function getCncTasks(params = undefined) {
    try {
        let query = '';
        if (params) {
            const searchParams = params instanceof URLSearchParams ? params : new URLSearchParams(params);
            const qs = searchParams.toString();
            query = qs ? `?${qs}` : '';
        }
        const url = `${CNC_CUTTING_BASE_URL}/tasks/${query}`;
        const response = await authedFetch(url);
        
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
 * @param {number} [taskData.quantity] - Quantity (optional)
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
        
        // Add machine_fk if provided
        if (taskData.machine_fk !== undefined && taskData.machine_fk !== null) {
            formData.append('machine_fk', taskData.machine_fk);
        }
        
        // Add estimated_hours if provided
        if (taskData.estimated_hours !== undefined && taskData.estimated_hours !== null) {
            formData.append('estimated_hours', taskData.estimated_hours);
        }
        
        // Add quantity if provided
        if (taskData.quantity !== undefined && taskData.quantity !== null) {
            formData.append('quantity', taskData.quantity);
        }
        
        // Add selected_plate if provided
        if (taskData.selected_plate !== undefined && taskData.selected_plate !== null) {
            formData.append('selected_plate', taskData.selected_plate);
        }
        
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
 * @param {number} [taskData.quantity] - Quantity (optional)
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
        if (taskData.machine_fk !== undefined && taskData.machine_fk !== null) formData.append('machine_fk', taskData.machine_fk);
        if (taskData.estimated_hours !== undefined && taskData.estimated_hours !== null) formData.append('estimated_hours', taskData.estimated_hours);
        if (taskData.quantity !== undefined && taskData.quantity !== null) formData.append('quantity', taskData.quantity);
        if (taskData.selected_plate !== undefined && taskData.selected_plate !== null) formData.append('selected_plate', taskData.selected_plate);
        
        // Add nesting file if provided
        if (taskData.nesting_file) {
            formData.append('nesting_file', taskData.nesting_file);
        }
        
        const response = await authedFetch(`${CNC_CUTTING_BASE_URL}/tasks/${taskId}/`, {
            method: 'PATCH',
            headers: {
                // Don't set Content-Type for FormData, let browser set it with boundary
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
 * Add files to an existing CNC task
 * @param {number} taskId - The CNC task ID
 * @param {FileList|Array<File>} files - Files to upload
 * @returns {Promise<Object>} Response with uploaded file information
 */
export async function addFilesToCncTask(taskId, files) {
    try {
        // Create FormData for file upload
        const formData = new FormData();
        
        // Handle both FileList and Array
        const fileArray = Array.isArray(files) ? files : Array.from(files);
        
        // Add each file to FormData
        fileArray.forEach(file => {
            formData.append('files', file);
        });
        
        const response = await authedFetch(`${CNC_CUTTING_BASE_URL}/tasks/${taskId}/add-file/`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Failed to add files to CNC task: ${response.statusText} - ${JSON.stringify(errorData)}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error adding files to CNC task:', error);
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

