import { authedFetch } from '../../authService.js';
import { backendBase } from '../../base.js';

const PLANNING_BASE_URL = `${backendBase}/planning`;

/**
 * Planning Request API Functions
 * Handles all planning request operations
 */

/**
 * Get all planning requests with optional filtering
 * @param {Object} filters - Filter parameters
 * @param {string} filters.status - Filter by status (draft, ready, converted, cancelled)
 * @param {string} filters.priority - Filter by priority (normal, urgent, critical)
 * @param {number} filters.department_request - Filter by department request ID
 * @param {string} filters.search - Search in title, description
 * @param {string} filters.ordering - Ordering field (e.g., '-created_at', 'request_number')
 * @param {number} filters.page - Page number for pagination
 * @param {number} filters.page_size - Page size for pagination
 * @returns {Promise<Object>} Response with planning requests
 */
export async function getPlanningRequests(filters = {}) {
    try {
        const queryParams = new URLSearchParams();
        
        Object.entries(filters).forEach(([key, value]) => {
            if (value !== null && value !== undefined && value !== '') {
                queryParams.append(key, value);
            }
        });

        const url = `${PLANNING_BASE_URL}/requests/${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
        const response = await authedFetch(url);

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || errorData.error || 'Planlama talepleri yüklenirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching planning requests:', error);
        throw error;
    }
}

/**
 * Get a single planning request by ID
 * @param {number} requestId - Planning request ID
 * @returns {Promise<Object>} Planning request details
 */
export async function getPlanningRequest(requestId) {
    try {
        const response = await authedFetch(`${PLANNING_BASE_URL}/requests/${requestId}/`);

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || errorData.error || 'Planlama talebi yüklenirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching planning request:', error);
        throw error;
    }
}

/**
 * Create a planning request from an approved department request
 * @param {Object} requestData - Planning request data
 * @param {number} requestData.department_request_id - Department request ID (required)
 * @param {Array} [requestData.items] - Optional initial item mappings
 * @param {Array} [requestData.attachments] - Optional file attachments
 * @param {File} [requestData.attachments[].file] - File to upload
 * @param {string} [requestData.attachments[].description] - File description
 * @param {number} [requestData.attachments[].source_attachment_id] - Source attachment ID if mapping from another request
 * @returns {Promise<Object>} Created planning request
 */
export async function createPlanningRequest(requestData) {
    try {
        const formData = new FormData();
        
        // Add department_request_id (required)
        formData.append('department_request_id', requestData.department_request_id);

        // Add items if provided
        // Note: Items are nested serializers, so we send them as JSON string
        // The backend should parse this correctly
        if (requestData.items && requestData.items.length > 0) {
            // For nested serializers with FormData, we typically send as JSON
            // If the backend doesn't accept this format, items should be created separately
            formData.append('items', JSON.stringify(requestData.items));
        }

        // Add attachments if provided
        if (requestData.attachments && requestData.attachments.length > 0) {
            requestData.attachments.forEach((attachment, index) => {
                if (attachment.file) {
                    formData.append(`attachments[${index}].file`, attachment.file);
                }
                if (attachment.description) {
                    formData.append(`attachments[${index}].description`, attachment.description);
                }
                if (attachment.source_attachment_id) {
                    formData.append(`attachments[${index}].source_attachment_id`, attachment.source_attachment_id);
                }
            });
        }

        const response = await authedFetch(`${PLANNING_BASE_URL}/requests/`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || errorData.error || 'Planlama talebi oluşturulurken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error creating planning request:', error);
        throw error;
    }
}

/**
 * Update a planning request (full update)
 * @param {number} requestId - Planning request ID
 * @param {Object} requestData - Updated planning request data
 * @returns {Promise<Object>} Updated planning request
 */
export async function updatePlanningRequest(requestId, requestData) {
    try {
        const response = await authedFetch(`${PLANNING_BASE_URL}/requests/${requestId}/`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || errorData.error || 'Planlama talebi güncellenirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error updating planning request:', error);
        throw error;
    }
}

/**
 * Partially update a planning request
 * @param {number} requestId - Planning request ID
 * @param {Object} requestData - Partial planning request data
 * @returns {Promise<Object>} Updated planning request
 */
export async function partialUpdatePlanningRequest(requestId, requestData) {
    try {
        const response = await authedFetch(`${PLANNING_BASE_URL}/requests/${requestId}/`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || errorData.error || 'Planlama talebi güncellenirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error partially updating planning request:', error);
        throw error;
    }
}

/**
 * Delete a planning request
 * @param {number} requestId - Planning request ID
 * @returns {Promise<boolean>} Success status
 */
export async function deletePlanningRequest(requestId) {
    try {
        const response = await authedFetch(`${PLANNING_BASE_URL}/requests/${requestId}/`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || errorData.error || 'Planlama talebi silinirken hata oluştu');
        }

        return true;
    } catch (error) {
        console.error('Error deleting planning request:', error);
        throw error;
    }
}

