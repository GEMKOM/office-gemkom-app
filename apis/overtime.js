import { backendBase } from "../base.js";
import { authedFetch } from "../authService.js";

/**
 * Overtime API Service
 * Handles all overtime-related API requests using authedFetch
 * 
 * Based on Django REST Framework ViewSet endpoints:
 * - GET /overtime/requests/            (list)
 * - POST /overtime/requests/           (create)
 * - GET /overtime/requests/{id}/       (detail)
 * - PATCH /overtime/requests/{id}/     (update reason while submitted)
 * - POST /overtime/requests/{id}/cancel/
 */

// ===== Overtime Requests =====

/**
 * Fetch all overtime requests with optional filtering
 * @param {Object} filters - Filter parameters
 * @param {string} filters.status - Filter by status (submitted, approved, cancelled)
 * @param {string} filters.team - Filter by team
 * @param {string} filters.search - Search in reason, job_no, description
 * @param {string} filters.start_date - Filter by start date (YYYY-MM-DD)
 * @param {string} filters.end_date - Filter by end date (YYYY-MM-DD)
 * @param {string} filters.ordering - Ordering field (e.g., '-created_at', 'start_at')
 * @param {number} filters.page - Page number for pagination
 * @param {number} filters.page_size - Page size for pagination
 * @returns {Promise<Object>} Response with overtime requests
 */
export async function fetchOvertimeRequests(filters = {}) {
    const params = new URLSearchParams();
    
    // Add filters to query parameters
    Object.keys(filters).forEach(key => {
        if (filters[key] !== null && filters[key] !== undefined && filters[key] !== '') {
            if (key === 'start_date' || key === 'end_date') {
                // Handle date range filters
                if (filters[key]) {
                    params.append(key, filters[key]);
                }
            } else {
                params.append(key, filters[key]);
            }
        }
    });

    const url = `${backendBase}/overtime/requests/?${params.toString()}`;
    const resp = await authedFetch(url);
    const data = await resp.json();
    return data;
}

/**
 * Fetch a single overtime request by ID
 * @param {number} requestId - Overtime request ID
 * @returns {Promise<Object>} Overtime request details
 */
export async function fetchOvertimeRequest(requestId) {
    const url = `${backendBase}/overtime/requests/${requestId}/`;
    const resp = await authedFetch(url);
    const data = await resp.json();
    return data;
}

/**
 * Create a new overtime request
 * @param {Object} overtimeData - Overtime request data
 * @param {string} overtimeData.start_at - Start date and time (ISO format)
 * @param {string} overtimeData.end_at - End date and time (ISO format)
 * @param {string} overtimeData.reason - Reason for overtime (optional)
 * @param {Array} overtimeData.entries - Array of overtime entries
 * @param {number} overtimeData.entries[].user - User ID
 * @param {string} overtimeData.entries[].job_no - Job number
 * @param {string} overtimeData.entries[].description - Description (optional)
 * @returns {Promise<Object>} Created overtime request
 */
export async function createOvertimeRequest(overtimeData) {
    const url = `${backendBase}/overtime/requests/`;
    const resp = await authedFetch(url, {
        method: 'POST',
        body: JSON.stringify(overtimeData)
    });
    
    const data = await resp.json();
    
    // Check if the response is successful
    if (!resp.ok) {
        // If the response is not ok, throw an error with the API error message
        const errorMessage = data.errors || data.error || data.detail || 'Mesai talebi oluşturulurken hata oluştu.';
        const error = new Error(Array.isArray(errorMessage) ? errorMessage.join(', ') : errorMessage);
        error.response = data; // Attach the full response for detailed error handling
        throw error;
    }
    
    return data;
}

/**
 * Update an existing overtime request (only reason while submitted)
 * @param {number} requestId - Overtime request ID
 * @param {Object} updateData - Data to update
 * @param {string} updateData.reason - New reason
 * @returns {Promise<Object>} Updated overtime request
 */
export async function updateOvertimeRequest(requestId, updateData) {
    const url = `${backendBase}/overtime/requests/${requestId}/`;
    const resp = await authedFetch(url, {
        method: 'PATCH',
        body: JSON.stringify(updateData)
    });
    const data = await resp.json();
    return data;
}

/**
 * Cancel an overtime request
 * @param {number} requestId - Overtime request ID
 * @returns {Promise<Object>} Response indicating success/failure
 */
export async function cancelOvertimeRequest(requestId) {
    const url = `${backendBase}/overtime/requests/${requestId}/cancel/`;
    const resp = await authedFetch(url, {
        method: 'POST'
    });
    const data = await resp.json();
    return data;
}

// ===== Utility Functions =====

/**
 * Check if user can cancel an overtime request
 * @param {Object} overtimeRequest - Overtime request object
 * @param {number} currentUserId - Current user's ID
 * @returns {boolean} True if user can cancel the request
 */
export function canCancelOvertime(overtimeRequest, currentUserId) {
    return overtimeRequest.status === 'submitted' && 
           overtimeRequest.requester === currentUserId;
}

/**
 * Check if user can edit an overtime request
 * @param {Object} overtimeRequest - Overtime request object
 * @param {number} currentUserId - Current user's ID
 * @returns {boolean} True if user can edit the request
 */
export function canEditOvertime(overtimeRequest, currentUserId) {
    return overtimeRequest.status === 'submitted' && 
           overtimeRequest.requester === currentUserId;
}

/**
 * Format overtime duration for display
 * @param {number} durationHours - Duration in hours
 * @returns {string} Formatted duration string
 */
export function formatOvertimeDuration(durationHours) {
    if (!durationHours || durationHours <= 0) return '0 saat';
    
    const hours = Math.floor(durationHours);
    const minutes = Math.round((durationHours - hours) * 60);
    
    if (minutes === 0) {
        return `${hours} saat`;
    } else {
        return `${hours} saat ${minutes} dakika`;
    }
}

/**
 * Get status display information
 * @param {string} status - Overtime status
 * @returns {Object} Status display configuration
 */
export function getOvertimeStatusInfo(status) {
    const statusMap = {
        'submitted': {
            label: 'Bekliyor',
            class: 'status-yellow',
            icon: 'fas fa-clock',
            color: 'warning'
        },
        'approved': {
            label: 'Onaylandı',
            class: 'status-green',
            icon: 'fas fa-check-circle',
            color: 'success'
        },
        'cancelled': {
            label: 'İptal Edildi',
            class: 'status-red',
            icon: 'fas fa-ban',
            color: 'secondary'
        }
    };

    return statusMap[status] || {
        label: status,
        class: 'status-unknown',
        icon: 'fas fa-question-circle',
        color: 'secondary'
    };
}

/**
 * Validate overtime request data before submission
 * @param {Object} overtimeData - Overtime request data
 * @returns {Object} Validation result with isValid boolean and errors array
 */
export function validateOvertimeRequest(overtimeData) {
    const errors = [];

    // Check required fields
    if (!overtimeData.start_at) {
        errors.push('Başlangıç zamanı gereklidir');
    }
    if (!overtimeData.end_at) {
        errors.push('Bitiş zamanı gereklidir');
    }
    if (!overtimeData.entries || overtimeData.entries.length === 0) {
        errors.push('En az 1 katılımcı eklemelisiniz');
    }

    // Check date logic
    if (overtimeData.start_at && overtimeData.end_at) {
        const startDate = new Date(overtimeData.start_at);
        const endDate = new Date(overtimeData.end_at);
        
        if (startDate >= endDate) {
            errors.push('Bitiş zamanı başlangıç zamanından sonra olmalıdır');
        }
        
        if (startDate < new Date()) {
            errors.push('Başlangıç zamanı geçmiş bir tarih olamaz');
        }
    }

    // Check entries
    if (overtimeData.entries && overtimeData.entries.length > 0) {
        overtimeData.entries.forEach((entry, index) => {
            if (!entry.user) {
                errors.push(`Katılımcı ${index + 1}: Kullanıcı seçimi gereklidir`);
            }
            if (!entry.job_no || entry.job_no.trim() === '') {
                errors.push(`Katılımcı ${index + 1}: İş numarası gereklidir`);
            }
        });
    }

    return {
        isValid: errors.length === 0,
        errors: errors
    };
}

/**
 * Approve an overtime request
 * @param {number} requestId - Overtime request ID
 * @returns {Promise<Object>} Response data
 */
export async function approveOvertimeRequest(requestId) {
    const url = `${backendBase}/overtime/requests/${requestId}/approve/`;
    const resp = await authedFetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    });
    
    if (!resp.ok) {
        const errorData = await resp.json();
        throw new Error(errorData.detail || errorData.message || 'Onaylama işlemi başarısız');
    }
    
    return await resp.json();
}

/**
 * Reject an overtime request
 * @param {number} requestId - Overtime request ID
 * @param {string} comment - Rejection comment (optional)
 * @returns {Promise<Object>} Response data
 */
export async function rejectOvertimeRequest(requestId, comment = '') {
    const url = `${backendBase}/overtime/requests/${requestId}/reject/`;
    const resp = await authedFetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            comment: comment
        })
    });
    
    if (!resp.ok) {
        const errorData = await resp.json();
        throw new Error(errorData.detail || errorData.message || 'Reddetme işlemi başarısız');
    }
    
    return await resp.json();
}

export async function getPendingOvertimeApprovalRequests(filters = {}) {
    try {
        // Build query parameters
        const queryParams = new URLSearchParams();
        
        // Add filters if provided
        Object.entries(filters).forEach(([key, value]) => {
            if (value !== null && value !== undefined && value !== '') {
                queryParams.append(key, value);
            }
        });
        
        const url = `${backendBase}/overtime/requests/pending_approval/${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
        const response = await authedFetch(url);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Onay bekleyen talepler yüklenirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching pending approval requests:', error);
        throw error;
    }
}

export async function getOvertimeApprovedByMeRequests(filters = {}) {
    try {
        // Build query parameters
        const queryParams = new URLSearchParams();
        
        // Add filters if provided
        Object.entries(filters).forEach(([key, value]) => {
            if (value !== null && value !== undefined && value !== '') {
                queryParams.append(key, value);
            }
        });
        
        const url = `${backendBase}/overtime/requests/decision_by_me/${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
        const response = await authedFetch(url);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Onayladığınız talepler yüklenirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching approved by me requests:', error);
        throw error;
    }
}


export async function getOvertimeUsersForDate(dateStr) {
    const url = `${backendBase}/overtime/users-for-date/${dateStr}/`;
    const response = await authedFetch(url);
    const data = await response.json();
    return data;
}


