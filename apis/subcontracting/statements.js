import { backendBase } from "../../base.js";
import { authedFetch } from "../../authService.js";

/**
 * Subcontracting Statements API Service
 * Handles all statement-related API requests using authedFetch
 * 
 * Based on Django REST Framework ViewSet endpoints:
 * - GET /subcontracting/statements/            (list)
 * - POST /subcontracting/statements/generate/  (generate statement)
 * - GET /subcontracting/statements/{id}/       (detail)
 * - PATCH /subcontracting/statements/{id}/     (update)
 * - POST /subcontracting/statements/{id}/decide/  (approve/reject)
 * - GET /subcontracting/statements/{id}/adjustments/  (list adjustments)
 * - POST /subcontracting/statements/{id}/adjustments/  (create adjustment)
 * - DELETE /subcontracting/statements/{id}/adjustments/{adj_id}/  (delete adjustment)
 */

/**
 * Fetch all statements with optional filtering
 * @param {Object} filters - Filter parameters
 * @param {number} filters.subcontractor - Filter by subcontractor ID
 * @param {number} filters.year - Filter by year
 * @param {number} filters.month - Filter by month (1-12)
 * @param {string} filters.status - Filter by status (draft, submitted, approved, rejected, paid, cancelled)
 * @param {string} filters.ordering - Ordering field (e.g., '-period_year', '-period_month')
 * @param {number} filters.page - Page number for pagination
 * @param {number} filters.page_size - Page size for pagination
 * @returns {Promise<Object>} Response with statements
 */
export async function fetchStatements(filters = {}) {
    const params = new URLSearchParams();
    
    // Add filters to query parameters
    Object.keys(filters).forEach(key => {
        if (filters[key] !== null && filters[key] !== undefined && filters[key] !== '') {
            params.append(key, filters[key]);
        }
    });

    const url = `${backendBase}/subcontracting/statements/?${params.toString()}`;
    const resp = await authedFetch(url);
    
    if (!resp.ok) {
        const errorData = await resp.json();
        throw new Error(errorData.detail || errorData.message || 'Hakedişler yüklenirken hata oluştu');
    }
    
    const data = await resp.json();
    return data;
}

/**
 * Fetch a single statement by ID
 * @param {number} statementId - Statement ID
 * @returns {Promise<Object>} Statement details
 */
export async function fetchStatement(statementId) {
    const url = `${backendBase}/subcontracting/statements/${statementId}/`;
    const resp = await authedFetch(url);
    
    if (!resp.ok) {
        const errorData = await resp.json();
        throw new Error(errorData.detail || errorData.message || 'Hakediş detayları yüklenirken hata oluştu');
    }
    
    const data = await resp.json();
    return data;
}

/**
 * Generate a new statement
 * @param {Object} generateData - Generation parameters
 * @param {number} generateData.subcontractor - Subcontractor ID
 * @param {number} generateData.year - Year
 * @param {number} generateData.month - Month (1-12)
 * @returns {Promise<Object>} Generated statement
 */
export async function generateStatement(generateData) {
    const url = `${backendBase}/subcontracting/statements/generate/`;
    const resp = await authedFetch(url, {
        method: 'POST',
        body: JSON.stringify(generateData)
    });
    
    if (!resp.ok) {
        const errorData = await resp.json();
        const errorMessage = errorData.detail || errorData.message || Object.values(errorData).flat().join(', ') || 'Hakediş oluşturulurken hata oluştu';
        throw new Error(errorMessage);
    }
    
    const data = await resp.json();
    return data;
}

/**
 * Refresh a statement (regenerate line items)
 * @param {number} statementId - Statement ID
 * @returns {Promise<Object>} Refreshed statement
 */
export async function refreshStatement(statementId) {
    const url = `${backendBase}/subcontracting/statements/${statementId}/refresh/`;
    const resp = await authedFetch(url, {
        method: 'POST'
    });
    
    if (!resp.ok) {
        const errorData = await resp.json();
        throw new Error(errorData.detail || errorData.message || 'Hakediş yenilenirken hata oluştu');
    }
    
    const data = await resp.json();
    return data;
}

/**
 * Submit a statement for approval
 * @param {number} statementId - Statement ID
 * @returns {Promise<Object>} Updated statement
 */
export async function submitStatement(statementId) {
    const url = `${backendBase}/subcontracting/statements/${statementId}/submit/`;
    const resp = await authedFetch(url, {
        method: 'POST'
    });
    
    if (!resp.ok) {
        const errorData = await resp.json();
        throw new Error(errorData.detail || errorData.message || 'Hakediş onaya gönderilirken hata oluştu');
    }
    
    const data = await resp.json();
    return data;
}

/**
 * Approve or reject a statement
 * @param {number} statementId - Statement ID
 * @param {Object} decisionData - Decision data
 * @param {boolean} decisionData.approve - True to approve, false to reject
 * @param {string} decisionData.comment - Comment/reason
 * @returns {Promise<Object>} Updated statement
 */
export async function decideStatement(statementId, decisionData) {
    const url = `${backendBase}/subcontracting/statements/${statementId}/decide/`;
    const resp = await authedFetch(url, {
        method: 'POST',
        body: JSON.stringify(decisionData)
    });
    
    if (!resp.ok) {
        const errorData = await resp.json();
        const errorMessage = errorData.detail || errorData.message || Object.values(errorData).flat().join(', ') || 'Hakediş kararı verilirken hata oluştu';
        throw new Error(errorMessage);
    }
    
    const data = await resp.json();
    return data;
}

/**
 * Mark a statement as paid
 * @param {number} statementId - Statement ID
 * @returns {Promise<Object>} Updated statement
 */
export async function markStatementAsPaid(statementId) {
    const url = `${backendBase}/subcontracting/statements/${statementId}/`;
    const resp = await authedFetch(url, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'paid' })
    });
    
    if (!resp.ok) {
        const errorData = await resp.json();
        throw new Error(errorData.detail || errorData.message || 'Hakediş ödendi olarak işaretlenirken hata oluştu');
    }
    
    const data = await resp.json();
    return data;
}

/**
 * Fetch adjustments for a statement
 * @param {number} statementId - Statement ID
 * @returns {Promise<Array>} Array of adjustments
 */
export async function fetchStatementAdjustments(statementId) {
    const url = `${backendBase}/subcontracting/statements/${statementId}/adjustments/`;
    const resp = await authedFetch(url);
    
    if (!resp.ok) {
        const errorData = await resp.json();
        throw new Error(errorData.detail || errorData.message || 'Düzeltmeler yüklenirken hata oluştu');
    }
    
    const data = await resp.json();
    return data;
}

/**
 * Create an adjustment for a statement
 * @param {number} statementId - Statement ID
 * @param {Object} adjustmentData - Adjustment data
 * @param {string} adjustmentData.adjustment_type - Type: 'Ek Ödeme' or 'Kesinti'
 * @param {number} adjustmentData.amount - Amount (positive number, backend handles sign)
 * @param {string} adjustmentData.reason - Reason for adjustment
 * @param {string} adjustmentData.job_order - Job order number (optional)
 * @returns {Promise<Object>} Created adjustment
 */
export async function createStatementAdjustment(statementId, adjustmentData) {
    const url = `${backendBase}/subcontracting/statements/${statementId}/adjustments/`;
    const resp = await authedFetch(url, {
        method: 'POST',
        body: JSON.stringify(adjustmentData)
    });
    
    if (!resp.ok) {
        const errorData = await resp.json();
        const errorMessage = errorData.detail || errorData.message || Object.values(errorData).flat().join(', ') || 'Düzeltme oluşturulurken hata oluştu';
        throw new Error(errorMessage);
    }
    
    const data = await resp.json();
    return data;
}

/**
 * Delete an adjustment
 * @param {number} statementId - Statement ID
 * @param {number} adjustmentId - Adjustment ID
 * @returns {Promise<Object>} Response indicating success/failure
 */
export async function deleteStatementAdjustment(statementId, adjustmentId) {
    const url = `${backendBase}/subcontracting/statements/${statementId}/adjustments/${adjustmentId}/`;
    const resp = await authedFetch(url, {
        method: 'DELETE'
    });
    
    if (!resp.ok) {
        const errorData = await resp.json();
        throw new Error(errorData.detail || errorData.message || 'Düzeltme silinirken hata oluştu');
    }
    
    // DELETE might not return JSON
    if (resp.status === 204) {
        return { success: true };
    }
    
    return await resp.json();
}

/**
 * Get status display information
 * @param {string} status - Statement status
 * @returns {Object} Status display configuration
 */
export function getStatementStatusInfo(status) {
    const statusMap = {
        'draft': {
            label: 'Taslak',
            class: 'status-grey',
            icon: 'fas fa-file-alt',
            color: 'secondary'
        },
        'submitted': {
            label: 'Onay Bekliyor',
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
        'rejected': {
            label: 'Reddedildi',
            class: 'status-red',
            icon: 'fas fa-times-circle',
            color: 'danger'
        },
        'paid': {
            label: 'Ödendi',
            class: 'status-teal',
            icon: 'fas fa-money-check-alt',
            color: 'info'
        },
        'cancelled': {
            label: 'İptal Edildi',
            class: 'status-grey',
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
