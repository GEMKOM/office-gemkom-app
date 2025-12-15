import { authedFetch } from '../../authService.js';
import { backendBase } from '../../base.js';

const PLANNING_BASE_URL = `${backendBase}/planning`;

/**
 * Planning Request Item API Functions
 * Handles all planning request item operations
 */
/**API to get the number of available planning request items */
export async function getNumberOfAvailablePlanningRequestItems() {
    try {
        const response = await authedFetch(`${PLANNING_BASE_URL}/items/available_count/`);
        return response.json();
    } catch (error) {
        console.error('Error getting number of available planning request items:', error);
        throw error;
    }
}

/**
 * Get all planning request items with optional filtering
 * @param {Object} filters - Filter parameters
 * @param {number} filters.planning_request - Filter by planning request ID
 * @param {number} filters.item - Filter by item ID
 * @param {string} filters.job_no - Filter by job number
 * @param {string} filters.priority - Filter by priority (normal, urgent, critical)
 * @param {string} filters.ordering - Ordering field (e.g., 'order', '-order')
 * @param {number} filters.page - Page number for pagination
 * @param {number} filters.page_size - Page size for pagination
 * @returns {Promise<Object>} Response with planning request items
 */
export async function getPlanningRequestItems(filters = {}) {
    try {
        const queryParams = new URLSearchParams();
        
        Object.entries(filters).forEach(([key, value]) => {
            if (value !== null && value !== undefined && value !== '') {
                queryParams.append(key, value);
            }
        });

        const url = `${PLANNING_BASE_URL}/items/${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
        const response = await authedFetch(url);

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || errorData.error || 'Planlama talebi kalemleri yüklenirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching planning request items:', error);
        throw error;
    }
}

/**
 * Get a single planning request item by ID
 * @param {number} itemId - Planning request item ID
 * @returns {Promise<Object>} Planning request item details
 */
export async function getPlanningRequestItem(itemId) {
    try {
        const response = await authedFetch(`${PLANNING_BASE_URL}/items/${itemId}/`);

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || errorData.error || 'Planlama talebi kalemi yüklenirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching planning request item:', error);
        throw error;
    }
}

/**
 * Create a planning request item
 * @param {Object} itemData - Planning request item data
 * @param {number} itemData.planning_request - Planning request ID (required)
 * @param {number} itemData.item_id - Item ID (required)
 * @param {string} itemData.job_no - Job number (required)
 * @param {number|string} itemData.quantity - Quantity (required)
 * @param {string} [itemData.priority] - Priority (normal, urgent, critical)
 * @param {string} [itemData.specifications] - Specifications
 * @param {number} [itemData.source_item_index] - Source item index from department request
 * @param {number} [itemData.order] - Order/sequence number
 * @param {Array} [itemData.attachments] - Optional file attachments
 * @param {File} [itemData.attachments[].file] - File to upload
 * @param {string} [itemData.attachments[].description] - File description
 * @param {number} [itemData.attachments[].source_attachment_id] - Source attachment ID
 * @returns {Promise<Object>} Created planning request item
 */
export async function createPlanningRequestItem(itemData) {
    try {
        const formData = new FormData();
        
        // Add required fields
        formData.append('planning_request', itemData.planning_request);
        formData.append('item_id', itemData.item_id);
        formData.append('job_no', itemData.job_no);
        formData.append('quantity', itemData.quantity);

        // Add optional fields
        if (itemData.priority) {
            formData.append('priority', itemData.priority);
        }
        if (itemData.specifications) {
            formData.append('specifications', itemData.specifications);
        }
        if (itemData.source_item_index !== undefined) {
            formData.append('source_item_index', itemData.source_item_index);
        }
        if (itemData.order !== undefined) {
            formData.append('order', itemData.order);
        }

        // Add attachments if provided
        if (itemData.attachments && itemData.attachments.length > 0) {
            itemData.attachments.forEach((attachment, index) => {
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

        const response = await authedFetch(`${PLANNING_BASE_URL}/items/`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || errorData.error || 'Planlama talebi kalemi oluşturulurken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error creating planning request item:', error);
        throw error;
    }
}

/**
 * Bulk create planning request items
 * @param {Object} bulkData - Bulk create data
 * @param {number} bulkData.planning_request_id - Planning request ID (required)
 * @param {Array} bulkData.items - Array of items to create (required)
 * @param {number|string} bulkData.items[].item_id - Item ID (or item_code)
 * @param {string} bulkData.items[].item_code - Item code (alternative to item_id)
 * @param {string} bulkData.items[].job_no - Job number (required)
 * @param {number|string} bulkData.items[].quantity - Quantity (required)
 * @param {string} [bulkData.items[].priority] - Priority
 * @param {string} [bulkData.items[].specifications] - Specifications
 * @param {number} [bulkData.items[].source_item_index] - Source item index
 * @returns {Promise<Object>} Response with created items
 */
export async function bulkCreatePlanningRequestItems(bulkData) {
    try {
        const response = await authedFetch(`${PLANNING_BASE_URL}/items/bulk/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(bulkData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || errorData.error || 'Planlama talebi kalemleri toplu oluşturulurken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error bulk creating planning request items:', error);
        throw error;
    }
}

/**
 * Update a planning request item (full update)
 * @param {number} itemId - Planning request item ID
 * @param {Object} itemData - Updated planning request item data
 * @returns {Promise<Object>} Updated planning request item
 */
export async function updatePlanningRequestItem(itemId, itemData) {
    try {
        const response = await authedFetch(`${PLANNING_BASE_URL}/items/${itemId}/`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(itemData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || errorData.error || 'Planlama talebi kalemi güncellenirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error updating planning request item:', error);
        throw error;
    }
}

/**
 * Partially update a planning request item
 * @param {number} itemId - Planning request item ID
 * @param {Object} itemData - Partial planning request item data
 * @returns {Promise<Object>} Updated planning request item
 */
export async function partialUpdatePlanningRequestItem(itemId, itemData) {
    try {
        const response = await authedFetch(`${PLANNING_BASE_URL}/items/${itemId}/`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(itemData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || errorData.error || 'Planlama talebi kalemi güncellenirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error partially updating planning request item:', error);
        throw error;
    }
}

/**
 * Delete a planning request item
 * @param {number} itemId - Planning request item ID
 * @returns {Promise<boolean>} Success status
 */
export async function deletePlanningRequestItem(itemId) {
    try {
        const response = await authedFetch(`${PLANNING_BASE_URL}/items/${itemId}/`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || errorData.error || 'Planlama talebi kalemi silinirken hata oluştu');
        }

        return true;
    } catch (error) {
        console.error('Error deleting planning request item:', error);
        throw error;
    }
}

/**
 * Upload an attachment to a planning request item
 * @param {number} itemId - Planning request item ID
 * @param {Object} attachmentData - Attachment data
 * @param {File} attachmentData.file - File to upload (required)
 * @param {string} [attachmentData.description] - File description (optional)
 * @param {number} [attachmentData.source_attachment_id] - Source attachment ID if mapping from another request (optional)
 * @returns {Promise<Object>} Created attachment
 */
export async function uploadPlanningRequestItemAttachment(itemId, attachmentData) {
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
        
        const response = await authedFetch(`${PLANNING_BASE_URL}/items/${itemId}/attachments/`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || errorData.error || 'Dosya yüklenirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error uploading planning request item attachment:', error);
        throw error;
    }
}

/**
 * Get files for multiple planning request items in a single request
 * @param {number[]} itemIds - Array of planning request item IDs (required, non-empty)
 * @returns {Promise<Object>} Response containing items with their files
 */
export async function getPlanningRequestItemsFiles(itemIds = []) {
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
        throw new Error('item_ids is required and must be a non-empty array');
    }

    try {
        const response = await authedFetch(`${PLANNING_BASE_URL}/items/bulk_files/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ item_ids: itemIds })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || errorData.error || 'Planlama talebi dosyaları yüklenirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching planning request item files:', error);
        throw error;
    }
}

