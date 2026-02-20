import { authedFetch } from '../authService.js';
import { backendBase } from '../base.js';

/**
 * Quality Control API Service
 * Handles all quality control related API requests
 */

const QC_BASE = `${backendBase}/quality-control`;

// ==================== QC Reviews ====================

/**
 * List QC reviews
 * @param {Object} filters - Optional filters: task, status, task__job_order, task__department
 * @param {string} search - Search query (task title, job order number)
 * @param {string} ordering - Ordering field (submitted_at, status)
 * @param {number} page - Page number
 * @param {number} pageSize - Page size
 * @returns {Promise<Object>} Response with results and pagination
 */
export async function listQCReviews(filters = {}, search = '', ordering = '-submitted_at', page = 1, pageSize = 20) {
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('page_size', pageSize.toString());
    
    if (ordering) {
        params.append('ordering', ordering);
    }
    
    if (search) {
        params.append('search', search);
    }
    
    Object.keys(filters).forEach(key => {
        if (filters[key] !== null && filters[key] !== undefined && filters[key] !== '') {
            params.append(key, filters[key]);
        }
    });
    
    const url = `${QC_BASE}/qc-reviews/?${params.toString()}`;
    const response = await authedFetch(url);
    
    if (!response.ok) {
        throw new Error(`Failed to fetch QC reviews: ${response.status}`);
    }
    
    const data = await response.json();
    return {
        results: data.results || [],
        count: data.count || 0,
        totalPages: data.total_pages || Math.ceil((data.count || 0) / pageSize)
    };
}

/**
 * Get QC review by ID
 * @param {number} reviewId - Review ID
 * @returns {Promise<Object>} QC review details
 */
export async function getQCReview(reviewId) {
    const url = `${QC_BASE}/qc-reviews/${reviewId}/`;
    const response = await authedFetch(url);
    
    if (!response.ok) {
        throw new Error(`Failed to fetch QC review: ${response.status}`);
    }
    
    return await response.json();
}

/**
 * Submit a task for QC review
 * @param {number} taskId - Task ID
 * @param {Object} partData - Part data (location, quantity_inspected, position_no, drawing_no, notes, etc.)
 * @returns {Promise<Object>} Created QC review
 */
export async function submitQCReview(taskId, partData = {}) {
    const url = `${QC_BASE}/qc-reviews/submit/`;
    const response = await authedFetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            task_id: taskId,
            part_data: partData
        })
    });
    
    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(error.detail || `Failed to submit QC review: ${response.status}`);
    }
    
    return await response.json();
}

/**
 * Bulk submit multiple QC reviews for a task
 * @param {number} taskId - Task ID
 * @param {Array<Object>} reviews - Array of review objects (each becomes part_data)
 * @returns {Promise<Array>} Array of created QC reviews
 */
export async function bulkSubmitQCReviews(taskId, reviews = []) {
    const url = `${QC_BASE}/qc-reviews/bulk_submit/`;
    const response = await authedFetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            task_id: taskId,
            reviews: reviews
        })
    });
    
    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(JSON.stringify(error) || `Failed to bulk submit QC reviews: ${response.status}`);
    }
    
    return await response.json();
}

/**
 * Make QC team decision (approve/reject)
 * @param {number} reviewId - Review ID
 * @param {boolean} approve - true to approve, false to reject
 * @param {string} comment - Comment/explanation
 * @param {Object} ncrData - Optional NCR data for rejection (ncr_title, ncr_description, ncr_defect_type, ncr_severity, ncr_affected_quantity, ncr_disposition)
 * @returns {Promise<Object>} Updated QC review
 */
export async function decideQCReview(reviewId, approve, comment = '', ncrData = {}) {
    const url = `${QC_BASE}/qc-reviews/${reviewId}/decide/`;
    const requestBody = {
        approve: approve,
        comment: comment
    };
    
    // Add NCR data if rejecting
    if (!approve && ncrData) {
        if (ncrData.ncr_title) requestBody.ncr_title = ncrData.ncr_title;
        if (ncrData.ncr_description) requestBody.ncr_description = ncrData.ncr_description;
        if (ncrData.ncr_defect_type) requestBody.ncr_defect_type = ncrData.ncr_defect_type;
        if (ncrData.ncr_severity) requestBody.ncr_severity = ncrData.ncr_severity;
        if (ncrData.ncr_affected_quantity !== undefined && ncrData.ncr_affected_quantity !== null) {
            requestBody.ncr_affected_quantity = ncrData.ncr_affected_quantity;
        }
        if (ncrData.ncr_disposition) requestBody.ncr_disposition = ncrData.ncr_disposition;
    }
    
    const response = await authedFetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(error.detail || `Failed to decide QC review: ${response.status}`);
    }
    
    return await response.json();
}

// ==================== NCRs ====================

/**
 * List NCRs
 * @param {Object} filters - Optional filters: job_order, status, status__in, severity, severity__in, defect_type, assigned_team, department_task
 * @param {string} search - Search query (NCR number, title, description, job order number)
 * @param {string} ordering - Ordering field (created_at, severity, status)
 * @param {number} page - Page number
 * @param {number} pageSize - Page size
 * @returns {Promise<Object>} Response with results and pagination
 */
export async function listNCRs(filters = {}, search = '', ordering = '-created_at', page = 1, pageSize = 20) {
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('page_size', pageSize.toString());
    
    if (ordering) {
        params.append('ordering', ordering);
    }
    
    if (search) {
        params.append('search', search);
    }
    
    Object.keys(filters).forEach(key => {
        if (filters[key] !== null && filters[key] !== undefined && filters[key] !== '') {
            if (Array.isArray(filters[key])) {
                filters[key].forEach(val => params.append(key, val));
            } else {
                params.append(key, filters[key]);
            }
        }
    });
    
    const url = `${QC_BASE}/ncrs/?${params.toString()}`;
    const response = await authedFetch(url);
    
    if (!response.ok) {
        throw new Error(`Failed to fetch NCRs: ${response.status}`);
    }
    
    const data = await response.json();
    return {
        results: data.results || [],
        count: data.count || 0,
        totalPages: data.total_pages || Math.ceil((data.count || 0) / pageSize)
    };
}

/**
 * Get NCR by ID
 * @param {number} ncrId - NCR ID
 * @returns {Promise<Object>} NCR details
 */
export async function getNCR(ncrId) {
    const url = `${QC_BASE}/ncrs/${ncrId}/`;
    const response = await authedFetch(url);
    
    if (!response.ok) {
        throw new Error(`Failed to fetch NCR: ${response.status}`);
    }
    
    return await response.json();
}

/**
 * Create a manual NCR
 * @param {Object} ncrData - NCR data
 * @returns {Promise<Object>} Created NCR
 */
export async function createNCR(ncrData) {
    const url = `${QC_BASE}/ncrs/`;
    const response = await authedFetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(ncrData)
    });
    
    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(error.detail || `Failed to create NCR: ${response.status}`);
    }
    
    return await response.json();
}

/**
 * Update NCR
 * @param {number} ncrId - NCR ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated NCR
 */
export async function updateNCR(ncrId, updates) {
    const url = `${QC_BASE}/ncrs/${ncrId}/`;
    const response = await authedFetch(url, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
    });
    
    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(error.detail || `Failed to update NCR: ${response.status}`);
    }
    
    return await response.json();
}

/**
 * Submit NCR for QC approval
 * @param {number} ncrId - NCR ID
 * @param {Object} submitData - Optional submit data (root_cause, corrective_action, disposition)
 * @returns {Promise<Object>} Updated NCR
 */
export async function submitNCR(ncrId, submitData = {}) {
    const url = `${QC_BASE}/ncrs/${ncrId}/submit/`;
    const response = await authedFetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(submitData)
    });
    
    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(error.detail || `Failed to submit NCR: ${response.status}`);
    }
    
    return await response.json();
}

/**
 * QC team approve/reject NCR
 * @param {number} ncrId - NCR ID
 * @param {boolean} approve - true to approve, false to reject
 * @param {string} comment - Comment/explanation
 * @returns {Promise<Object>} Updated NCR
 */
export async function decideNCR(ncrId, approve, comment = '') {
    const url = `${QC_BASE}/ncrs/${ncrId}/decide/`;
    const response = await authedFetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            approve: approve,
            comment: comment
        })
    });
    
    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(error.detail || `Failed to decide NCR: ${response.status}`);
    }
    
    return await response.json();
}

/**
 * Close NCR
 * @param {number} ncrId - NCR ID
 * @returns {Promise<Object>} Updated NCR
 */
export async function closeNCR(ncrId) {
    const url = `${QC_BASE}/ncrs/${ncrId}/close/`;
    const response = await authedFetch(url, {
        method: 'POST'
    });
    
    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(error.detail || `Failed to close NCR: ${response.status}`);
    }
    
    return await response.json();
}

// ==================== Choice Values ====================

/**
 * Get defect type choices
 */
export const DEFECT_TYPE_CHOICES = [
    { value: 'dimensional', label: 'Boyutsal' },
    { value: 'surface', label: 'Yüzey' },
    { value: 'material', label: 'Malzeme' },
    { value: 'welding', label: 'Kaynak' },
    { value: 'machining', label: 'Talaşlı İmalat' },
    { value: 'assembly', label: 'Montaj' },
    { value: 'documentation', label: 'Dokümantasyon' },
    { value: 'other', label: 'Diğer' }
];

/**
 * Get severity choices
 */
export const SEVERITY_CHOICES = [
    { value: 'minor', label: 'Minör' },
    { value: 'major', label: 'Majör' },
    { value: 'critical', label: 'Kritik' }
];

/**
 * Get disposition choices
 */
export const DISPOSITION_CHOICES = [
    { value: 'rework', label: 'Yeniden İşleme' },
    { value: 'scrap', label: 'Hurda' },
    { value: 'accept_as_is', label: 'Olduğu Gibi Kabul' },
    { value: 'pending', label: 'Karar Bekliyor' }
];

/**
 * Get NCR status choices
 */
export const NCR_STATUS_CHOICES = [
    { value: 'draft', label: 'Taslak' },
    { value: 'submitted', label: 'Gönderildi' },
    { value: 'approved', label: 'Onaylandı' },
    { value: 'rejected', label: 'Reddedildi' },
    { value: 'closed', label: 'Kapatıldı' }
];

/**
 * Get QC review status choices
 */
export const QC_REVIEW_STATUS_CHOICES = [
    { value: 'pending', label: 'İnceleme Bekliyor' },
    { value: 'approved', label: 'Onaylandı' },
    { value: 'rejected', label: 'Reddedildi' }
];
