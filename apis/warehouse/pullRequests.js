import { authedFetch } from '../../authService.js';
import { backendBase } from '../../base.js';

const WAREHOUSE_BASE_URL = `${backendBase}/warehouse`;

/**
 * Warehouse Material Pull Request API Functions
 * Handles all warehouse material pull request operations
 */

// Flattens DRF error payloads ({detail}, {non_field_errors: [...]},
// {items: [{quantity: [...]}]}, plain field errors) into one message.
async function readErrorMessage(response, fallbackMessage) {
    const payload = await response.json().catch(() => ({}));
    const detail = payload?.detail || payload?.error;
    if (detail) return Array.isArray(detail) ? detail.join(', ') : String(detail);
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        const messages = [];
        Object.entries(payload).forEach(([key, value]) => {
            if (key === 'items' && Array.isArray(value)) {
                value.forEach((rowErrors, index) => {
                    if (!rowErrors || typeof rowErrors !== 'object') return;
                    Object.values(rowErrors).flat().forEach((msg) => {
                        if (typeof msg === 'string') messages.push(`Kalem ${index + 1}: ${msg}`);
                    });
                });
            } else {
                [].concat(value).forEach((msg) => {
                    if (typeof msg === 'string') messages.push(msg);
                });
            }
        });
        if (messages.length > 0) return messages.join(', ');
    }
    return fallbackMessage;
}

/**
 * Get all material pull requests with optional filtering
 * @param {Object} filters - Filter parameters
 * @param {string} filters.status - Filter by status (pending, transferred, cancelled)
 * @param {number} filters.subcontractor - Filter by subcontractor ID
 * @param {number} filters.team - Filter by team ID
 * @param {number} filters.requested_by - Filter by requesting user ID
 * @param {string} filters.job_no - Filter by job no (contains match)
 * @param {string} filters.search - Search in number, destination name, job no, item code/name
 * @param {string} filters.requested_after - Requested after date (YYYY-MM-DD)
 * @param {string} filters.requested_before - Requested before date (YYYY-MM-DD)
 * @param {string} filters.ordering - Ordering field (e.g., '-requested_at', 'number')
 * @param {number} filters.page - Page number for pagination
 * @param {number} filters.page_size - Page size for pagination
 * @returns {Promise<Object>} Paginated response with material pull requests
 */
export async function getMaterialPullRequests(filters = {}) {
    try {
        const queryParams = new URLSearchParams();

        Object.entries(filters).forEach(([key, value]) => {
            if (value !== null && value !== undefined && value !== '') {
                queryParams.append(key, value);
            }
        });

        const url = `${WAREHOUSE_BASE_URL}/pull-requests/${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
        const response = await authedFetch(url);

        if (!response.ok) {
            throw new Error(await readErrorMessage(response, 'Depo çekme talepleri yüklenirken hata oluştu'));
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching material pull requests:', error);
        throw error;
    }
}

/**
 * Get a single material pull request by ID (includes items)
 * @param {number} requestId - Material pull request ID
 * @returns {Promise<Object>} Material pull request details
 */
export async function getMaterialPullRequest(requestId) {
    try {
        const response = await authedFetch(`${WAREHOUSE_BASE_URL}/pull-requests/${requestId}/`);

        if (!response.ok) {
            throw new Error(await readErrorMessage(response, 'Depo çekme talebi yüklenirken hata oluştu'));
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching material pull request:', error);
        throw error;
    }
}

/**
 * Create a material pull request
 * @param {Object} requestData - Material pull request data
 * @param {number} [requestData.subcontractor] - Subcontractor ID (exactly one of subcontractor/team)
 * @param {number} [requestData.team] - Team ID (exactly one of subcontractor/team)
 * @param {string} [requestData.note] - Optional note
 * @param {Array} requestData.items - Items: [{planning_item: <id>, quantity: "5.00"}]
 * @returns {Promise<Object>} Created material pull request
 */
export async function createMaterialPullRequest(requestData) {
    try {
        const response = await authedFetch(`${WAREHOUSE_BASE_URL}/pull-requests/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData)
        });

        if (!response.ok) {
            throw new Error(await readErrorMessage(response, 'Depo çekme talebi oluşturulurken hata oluştu'));
        }

        return await response.json();
    } catch (error) {
        console.error('Error creating material pull request:', error);
        throw error;
    }
}

/**
 * Mark a material pull request as transferred (warehouse staff only)
 * @param {number} requestId - Material pull request ID
 * @returns {Promise<Object>} Updated material pull request
 */
export async function markMaterialPullRequestTransferred(requestId) {
    try {
        const response = await authedFetch(`${WAREHOUSE_BASE_URL}/pull-requests/${requestId}/mark_transferred/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            throw new Error(await readErrorMessage(response, 'Depo çekme talebi teslim edildi olarak işaretlenirken hata oluştu'));
        }

        return await response.json();
    } catch (error) {
        console.error('Error marking material pull request as transferred:', error);
        throw error;
    }
}

/**
 * Cancel a material pull request (requester or staff, pending only)
 * @param {number} requestId - Material pull request ID
 * @returns {Promise<Object>} Updated material pull request
 */
export async function cancelMaterialPullRequest(requestId) {
    try {
        const response = await authedFetch(`${WAREHOUSE_BASE_URL}/pull-requests/${requestId}/cancel/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            throw new Error(await readErrorMessage(response, 'Depo çekme talebi iptal edilirken hata oluştu'));
        }

        return await response.json();
    } catch (error) {
        console.error('Error cancelling material pull request:', error);
        throw error;
    }
}
