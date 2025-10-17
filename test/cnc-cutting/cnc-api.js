/**
 * CNC Cutting API functions
 * Test API for creating CNC cutting tasks
 */

import { backendBase } from '../../base.js';
import { authedFetch } from '../../authService.js';

/**
 * Create a new CNC cutting task
 * @param {Object} taskData - The CNC task data
 * @param {string} taskData.name - Task name (required)
 * @param {string} taskData.job_no - Job number (required)
 * @param {string} [taskData.nesting_id] - Nesting ID
 * @param {string} [taskData.material] - Material type
 * @param {string} [taskData.dimensions] - Dimensions
 * @param {number} [taskData.thickness_mm] - Thickness in mm
 * @param {File} [taskData.nesting_pdf] - Nesting PDF file
 * @returns {Promise<Response>} API response
 */
export async function createCncTask(taskData) {
    try {
        // Create FormData for multipart/form-data request
        const formData = new FormData();
        
        // Add required fields
        formData.append('name', taskData.name);
        formData.append('job_no', taskData.job_no);
        
        // Add optional fields if provided
        if (taskData.nesting_id) {
            formData.append('nesting_id', taskData.nesting_id);
        }
        if (taskData.material) {
            formData.append('material', taskData.material);
        }
        if (taskData.dimensions) {
            formData.append('dimensions', taskData.dimensions);
        }
        if (taskData.thickness_mm) {
            formData.append('thickness_mm', taskData.thickness_mm);
        }
        if (taskData.nesting_pdf) {
            formData.append('nesting_pdf', taskData.nesting_pdf);
        }
        
        // Make the API request using authedFetch
        const response = await authedFetch(`${backendBase}/cnc_cutting/`, {
            method: 'POST',
            body: formData
            // Note: Don't set Content-Type header, let the browser set it with boundary for multipart/form-data
        });
        
        return response;
        
    } catch (error) {
        console.error('Error creating CNC task:', error);
        throw error;
    }
}

/**
 * Get CNC cutting tasks (if needed for testing)
 * @param {Object} params - Query parameters
 * @returns {Promise<Response>} API response
 */
export async function getCncTasks(params = {}) {
    try {
        const queryString = new URLSearchParams(params).toString();
        const url = queryString ? `${backendBase}/cnc_cutting/?${queryString}` : `${backendBase}/cnc_cutting/`;
        
        const response = await authedFetch(url, {
            method: 'GET'
        });
        
        return response;
        
    } catch (error) {
        console.error('Error fetching CNC tasks:', error);
        throw error;
    }
}

/**
 * Update a CNC cutting task
 * @param {number} taskId - The task ID to update
 * @param {Object} taskData - The updated task data
 * @returns {Promise<Response>} API response
 */
export async function updateCncTask(taskId, taskData) {
    try {
        // Create FormData for multipart/form-data request
        const formData = new FormData();
        
        // Add fields if provided
        if (taskData.name) {
            formData.append('name', taskData.name);
        }
        if (taskData.job_no) {
            formData.append('job_no', taskData.job_no);
        }
        if (taskData.nesting_id) {
            formData.append('nesting_id', taskData.nesting_id);
        }
        if (taskData.material) {
            formData.append('material', taskData.material);
        }
        if (taskData.dimensions) {
            formData.append('dimensions', taskData.dimensions);
        }
        if (taskData.thickness_mm) {
            formData.append('thickness_mm', taskData.thickness_mm);
        }
        if (taskData.nesting_pdf) {
            formData.append('nesting_pdf', taskData.nesting_pdf);
        }
        
        const response = await authedFetch(`${backendBase}/cnc_cutting/${taskId}/`, {
            method: 'PATCH',
            body: formData
        });
        
        return response;
        
    } catch (error) {
        console.error('Error updating CNC task:', error);
        throw error;
    }
}

/**
 * Delete a CNC cutting task
 * @param {number} taskId - The task ID to delete
 * @returns {Promise<Response>} API response
 */
export async function deleteCncTask(taskId) {
    try {
        const response = await authedFetch(`${backendBase}/cnc_cutting/${taskId}/`, {
            method: 'DELETE'
        });
        
        return response;
        
    } catch (error) {
        console.error('Error deleting CNC task:', error);
        throw error;
    }
}
