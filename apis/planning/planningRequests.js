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
 * Create a planning request (standalone or from an approved department request)
 * @param {Object} requestData - Planning request data
 * @param {number} [requestData.department_request_id] - Department request ID (optional, for creating from department request)
 * @param {string} [requestData.title] - Title (required for standalone creation)
 * @param {string} [requestData.description] - Description (optional)
 * @param {string} [requestData.needed_date] - Needed date (optional)
 * @param {string} [requestData.priority] - Priority: 'low', 'normal', 'high', 'urgent' (optional, default: 'normal')
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
        
        // Add department_request_id if provided (for creating from department request)
        if (requestData.department_request_id !== undefined && requestData.department_request_id !== null) {
            formData.append('department_request_id', requestData.department_request_id);
        }

        // Add standalone creation fields (required if no department_request_id)
        if (requestData.title !== undefined && requestData.title !== null) {
            formData.append('title', requestData.title);
        }
        if (requestData.description !== undefined && requestData.description !== null) {
            formData.append('description', requestData.description);
        }
        if (requestData.needed_date !== undefined && requestData.needed_date !== null) {
            formData.append('needed_date', requestData.needed_date);
        }
        if (requestData.priority !== undefined && requestData.priority !== null) {
            formData.append('priority', requestData.priority);
        }
        if (requestData.request_number !== undefined && requestData.request_number !== null && requestData.request_number.trim() !== '') {
            formData.append('request_number', requestData.request_number);
        }
        if (requestData.check_inventory !== undefined && requestData.check_inventory !== null) {
            formData.append('check_inventory', requestData.check_inventory);
        }

        // Add items if provided
        // Send items as JSON string - backend will parse it
        if (requestData.items && requestData.items.length > 0) {
            formData.append('items', JSON.stringify(requestData.items));
        }

        // Add files if provided (new structure with attach_to)
        // Supports both new uploads (file) and existing file references (source_attachment_id)
        if (requestData.files && requestData.files.length > 0) {
            requestData.files.forEach((fileData, index) => {
                // Either file or source_attachment_id is required
                if (!fileData.file && !fileData.source_attachment_id) {
                    throw new Error(`File at index ${index} must have either 'file' or 'source_attachment_id'`);
                }
                
                // Cannot have both
                if (fileData.file && fileData.source_attachment_id) {
                    throw new Error(`File at index ${index} cannot have both 'file' and 'source_attachment_id'`);
                }
                
                // Add file or source_attachment_id
                if (fileData.file) {
                    formData.append(`files[${index}].file`, fileData.file);
                } else if (fileData.source_attachment_id) {
                    formData.append(`files[${index}].source_attachment_id`, fileData.source_attachment_id);
                }
                
                // Description is optional
                if (fileData.description) {
                    formData.append(`files[${index}].description`, fileData.description);
                }
                
                // attach_to is required and must be sent as JSON string
                if (!fileData.attach_to || !Array.isArray(fileData.attach_to) || fileData.attach_to.length === 0) {
                    throw new Error(`attach_to is required for file at index ${index} and must contain at least one target`);
                }
                formData.append(`files[${index}].attach_to`, JSON.stringify(fileData.attach_to));
            });
        }

        // Legacy support: Add attachments if provided (old structure)
        // Also used for existing files with source_attachment_id and attach_to
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
                // Support attach_to for existing files
                if (attachment.attach_to && Array.isArray(attachment.attach_to) && attachment.attach_to.length > 0) {
                    formData.append(`attachments[${index}].attach_to`, JSON.stringify(attachment.attach_to));
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

/**
 * Upload an attachment to a planning request
 * @param {number} requestId - Planning request ID
 * @param {Object} attachmentData - Attachment data
 * @param {File} attachmentData.file - File to upload (required)
 * @param {string} [attachmentData.description] - File description (optional)
 * @param {number} [attachmentData.source_attachment_id] - Source attachment ID if mapping from another request (optional)
 * @returns {Promise<Object>} Created attachment
 */
export async function uploadPlanningRequestAttachment(requestId, attachmentData) {
    try {
        const formData = new FormData();
        
        // Add file (required)
        if (!attachmentData.file) {
            throw new Error('File is required for attachment upload');
        }
        formData.append('file', attachmentData.file);
        
        // Add description if provided
        if (attachmentData.description) {
            formData.append('description', attachmentData.description);
        }
        
        // Add source_attachment_id if provided
        if (attachmentData.source_attachment_id) {
            formData.append('source_attachment_id', attachmentData.source_attachment_id);
        }
        
        const response = await authedFetch(`${PLANNING_BASE_URL}/requests/${requestId}/attachments/`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || errorData.error || 'Dosya yüklenirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error uploading planning request attachment:', error);
        throw error;
    }
}

