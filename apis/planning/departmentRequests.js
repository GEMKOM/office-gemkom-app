import { authedFetch } from '../../authService.js';
import { backendBase } from '../../base.js';

// Department Request API Functions
/**
 * Create a new department request
 * @param {Object} requestData - Department request data
 * @param {string} requestData.title - Request title
 * @param {string} [requestData.description] - Request description (optional)
 * @param {string} [requestData.department] - Department (optional)
 * @param {string} [requestData.needed_date] - Needed date (optional)
 * @param {string} [requestData.priority] - Priority (optional)
 * @param {Array} [requestData.items] - Array of items data (optional)
 * @param {Array<Object>} [requestData.attachments] - Array of attachment objects (optional)
 * @param {File} [requestData.attachments[].file] - File to upload
 * @param {string} [requestData.attachments[].description] - File description (optional)
 * @param {number} [requestData.attachments[].source_attachment_id] - Source attachment ID if mapping from another request (optional)
 * @returns {Promise<Object>} Created department request
 */
export async function createDepartmentRequest(requestData) {
    try {
        // Create FormData for file upload support
        const formData = new FormData();
        
        // Add basic request fields
        if (requestData.title !== undefined && requestData.title !== null) {
            formData.append('title', requestData.title);
        }
        if (requestData.description !== undefined && requestData.description !== null) {
            formData.append('description', requestData.description);
        }
        if (requestData.department !== undefined && requestData.department !== null) {
            formData.append('department', requestData.department);
        }
        if (requestData.needed_date !== undefined && requestData.needed_date !== null) {
            formData.append('needed_date', requestData.needed_date);
        }
        if (requestData.priority !== undefined && requestData.priority !== null) {
            formData.append('priority', requestData.priority);
        }
        
        // Add items if provided - send as JSON array
        if (requestData.items && requestData.items.length > 0) {
            formData.append('items', JSON.stringify(requestData.items));
        }
        
        // Add attachments if provided - format: attachments[index].file, attachments[index].description
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
        
        const response = await authedFetch(`${backendBase}/planning/department-requests/`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || errorData.detail || 'Sunucu hatası');
        }

        return await response.json();
    } catch (error) {
        console.error('Error creating department request:', error);
        throw error;
    }
}

export async function updateDepartmentRequest(requestId, requestData) {
    try {
        const response = await authedFetch(`${backendBase}/planning/department-requests/${requestId}/`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Sunucu hatas1');
        }

        return await response.json();
    } catch (error) {
        console.error('Error updating department request:', error);
        throw error;
    }
}

export async function approveDepartmentRequest(requestId, comment = '') {
    try {
        const response = await authedFetch(`${backendBase}/planning/department-requests/${requestId}/approve/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                comment: comment
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || errorData.error || 'Talep onaylan1rken hata olu_tu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error approving department request:', error);
        throw error;
    }
}

export async function rejectDepartmentRequest(requestId, comment = '') {
    try {
        const response = await authedFetch(`${backendBase}/planning/department-requests/${requestId}/reject/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                comment: comment
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || errorData.error || 'Talep reddedilirken hata olu_tu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error rejecting department request:', error);
        throw error;
    }
}

export async function getDepartmentRequests(filters = {}) {
    try {
        // Build query parameters
        const queryParams = new URLSearchParams();

        // Add filters if provided
        Object.entries(filters).forEach(([key, value]) => {
            if (value !== null && value !== undefined && value !== '') {
                queryParams.append(key, value);
            }
        });

        const url = `${backendBase}/planning/department-requests/${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
        const response = await authedFetch(url);

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Talepler y�klenirken hata olu_tu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching department requests:', error);
        throw error;
    }
}

export async function getMyDepartmentRequests(filters = {}) {
    try {
        // Build query parameters
        const queryParams = new URLSearchParams();

        // Add filters if provided
        Object.entries(filters).forEach(([key, value]) => {
            if (value !== null && value !== undefined && value !== '') {
                queryParams.append(key, value);
            }
        });

        const url = `${backendBase}/planning/department-requests/my_requests/${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
        const response = await authedFetch(url);

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Taleplerim y�klenirken hata olu_tu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching my department requests:', error);
        throw error;
    }
}

export async function getPendingApprovalDepartmentRequests(filters = {}) {
    try {
        // Build query parameters
        const queryParams = new URLSearchParams();

        // Add filters if provided
        Object.entries(filters).forEach(([key, value]) => {
            if (value !== null && value !== undefined && value !== '') {
                queryParams.append(key, value);
            }
        });

        const url = `${backendBase}/planning/department-requests/pending_approval/${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
        const response = await authedFetch(url);

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Onay bekleyen talepler y�klenirken hata olu_tu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching pending approval department requests:', error);
        throw error;
    }
}

export async function getApprovedDepartmentRequests(filters = {}) {
    try {
        // Build query parameters
        const queryParams = new URLSearchParams();

        // Add filters if provided
        Object.entries(filters).forEach(([key, value]) => {
            if (value !== null && value !== undefined && value !== '') {
                queryParams.append(key, value);
            }
        });

        const url = `${backendBase}/planning/department-requests/approved_requests/${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
        const response = await authedFetch(url);

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || errorData.error || 'Onaylanan talepler y�klenirken hata olu_tu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching approved department requests:', error);
        throw error;
    }
}

export async function getCompletedDepartmentRequests(filters = {}) {
    try {
        // Build query parameters
        const queryParams = new URLSearchParams();

        // Add filters if provided
        Object.entries(filters).forEach(([key, value]) => {
            if (value !== null && value !== undefined && value !== '') {
                queryParams.append(key, value);
            }
        });

        const url = `${backendBase}/planning/department-requests/completed_requests/${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
        const response = await authedFetch(url);

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || errorData.error || 'Tamamlanan talepler y�klenirken hata olu_tu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching completed department requests:', error);
        throw error;
    }
}

export async function getDepartmentRequest(requestId) {
    try {
        const response = await authedFetch(`${backendBase}/planning/department-requests/${requestId}/`);

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Talep y�klenirken hata olu_tu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching department request:', error);
        throw error;
    }
}

export async function markDepartmentRequestTransferred(requestId) {
    try {
        const response = await authedFetch(`${backendBase}/planning/department-requests/${requestId}/mark_transferred/`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || errorData.error || 'Talep transfer edilirken hata olu_tu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error marking department request as transferred:', error);
        throw error;
    }
}

export async function deleteDepartmentRequest(requestId) {
    try {
        const response = await authedFetch(`${backendBase}/planning/department-requests/${requestId}/`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Talep silinirken hata olu_tu');
        }

        return true; // Successfully deleted
    } catch (error) {
        console.error('Error deleting department request:', error);
        throw error;
    }
}
