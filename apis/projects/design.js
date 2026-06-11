import { authedFetch } from '../../authService.js';
import { backendBase } from '../../base.js';

/**
 * Drawing Releases API Service
 * Handles all technical drawing release and revision related API requests
 * Base URL: /projects/drawing-releases/
 */

/**
 * List all drawing releases for a job order
 * @param {string} jobOrder - Job order number (e.g., "254-01")
 * @returns {Promise<Array>} Array of release objects
 */
export async function listDrawingReleases(jobOrder) {
    try {
        const queryParams = new URLSearchParams();
        queryParams.append('job_order', jobOrder);

        const url = `${backendBase}/projects/drawing-releases/?${queryParams.toString()}`;
        const response = await authedFetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error listing drawing releases for job order ${jobOrder}:`, error);
        throw error;
    }
}

/**
 * Get current active release for a job order
 * @param {string} jobOrder - Job order number (e.g., "254-01")
 * @returns {Promise<Object|null>} Current active release object or null if none exists
 */
export async function getCurrentRelease(jobOrder) {
    try {
        const queryParams = new URLSearchParams();
        queryParams.append('job_order', jobOrder);

        const url = `${backendBase}/projects/drawing-releases/current/?${queryParams.toString()}`;
        const response = await authedFetch(url);
        
        if (!response.ok) {
            if (response.status === 404) {
                return null;
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error fetching current release for job order ${jobOrder}:`, error);
        throw error;
    }
}

/**
 * Get drawing release by ID
 * @param {number} releaseId - Release ID
 * @returns {Promise<Object>} Release detail object
 */
export async function getDrawingRelease(releaseId) {
    try {
        const response = await authedFetch(`${backendBase}/projects/drawing-releases/${releaseId}/`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error fetching drawing release ${releaseId}:`, error);
        throw error;
    }
}

/**
 * Create a new drawing release
 * @param {Object} releaseData - Release data
 * @param {string} releaseData.job_order - Job order number (required, e.g., "254-01")
 * @param {string} releaseData.folder_path - Network folder path (required)
 * @param {string} releaseData.revision_code - Revision code (required, e.g., "A1", "B2")
 * @param {string} releaseData.changelog - Changelog description (required)
 * @param {number} [releaseData.hardcopy_count] - Number of hardcopies (optional)
 * @param {string} [releaseData.topic_content] - Topic content with @mentions for stakeholders (optional)
 * @returns {Promise<Object>} Created release object
 */
export async function createRelease(releaseData) {
    try {
        const response = await authedFetch(`${backendBase}/projects/drawing-releases/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(releaseData)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(JSON.stringify(errorData) || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error creating drawing release:', error);
        throw error;
    }
}

/**
 * Request revision for a released drawing
 * @param {number} releaseId - Release ID
 * @param {Object} requestData - Revision request data
 * @param {string} requestData.reason - Reason for revision request (required, supports @mentions)
 * @returns {Promise<Object>} Response with status, message, and created topic
 */
export async function requestRevision(releaseId, requestData) {
    try {
        const response = await authedFetch(`${backendBase}/projects/drawing-releases/${releaseId}/request_revision/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(JSON.stringify(errorData) || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error requesting revision for release ${releaseId}:`, error);
        throw error;
    }
}

/**
 * Approve a pending revision request
 * @param {number} releaseId - Release ID
 * @param {Object} approvalData - Approval data
 * @param {number} [approvalData.assigned_to] - User ID to assign the revision to (optional, defaults to design task assignee)
 * @returns {Promise<Object>} Response with status, message, and updated release
 */
export async function approveRevision(releaseId, approvalData = {}) {
    try {
        const response = await authedFetch(`${backendBase}/projects/drawing-releases/${releaseId}/approve_revision/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(approvalData)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(JSON.stringify(errorData) || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error approving revision for release ${releaseId}:`, error);
        throw error;
    }
}

/**
 * Reject a pending revision request
 * @param {number} releaseId - Release ID
 * @param {Object} rejectionData - Rejection data
 * @param {string} rejectionData.reason - Reason for rejection (required)
 * @returns {Promise<Object>} Response with status, message, and updated release
 */
export async function rejectRevision(releaseId, rejectionData) {
    try {
        const response = await authedFetch(`${backendBase}/projects/drawing-releases/${releaseId}/reject_revision/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(rejectionData)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(JSON.stringify(errorData) || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error rejecting revision for release ${releaseId}:`, error);
        throw error;
    }
}

/**
 * Self-start revision (designer starts revision without external request)
 * @param {number} releaseId - Release ID
 * @param {string} [reason] - Reason for starting the revision
 * @returns {Promise<Object>} Response with status, message, and updated release
 */
export async function selfStartRevision(releaseId, reason) {
    try {
        const body = {};
        if (reason) {
            body.reason = reason;
        }
        
        const response = await authedFetch(`${backendBase}/projects/drawing-releases/${releaseId}/self_revision/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(JSON.stringify(errorData) || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error self-starting revision for release ${releaseId}:`, error);
        throw error;
    }
}

/**
 * Complete revision and create new release
 * @param {number} releaseId - Release ID (the one in revision)
 * @param {Object} completionData - Completion data (same structure as createRelease)
 * @param {string} completionData.folder_path - Network folder path (required)
 * @param {string} completionData.revision_code - Revision code (required, e.g., "A1", "B2")
 * @param {string} completionData.changelog - Changelog description (required)
 * @param {number} [completionData.hardcopy_count] - Number of hardcopies (optional)
 * @param {string} [completionData.topic_content] - Topic content with @mentions for stakeholders (optional)
 * @returns {Promise<Object>} Response with status, message, and new release object
 */
/**
 * List releases awaiting peer review approval
 * @returns {Promise<Array|Object>} Paginated or array of pending releases
 */
export async function listPendingApprovalReleases() {
    try {
        const url = `${backendBase}/projects/drawing-releases/pending_approvals/`;
        const response = await authedFetch(url);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data.results !== undefined ? data.results : data;
    } catch (error) {
        console.error('Error listing pending approval releases:', error);
        throw error;
    }
}

/**
 * List completed peer-review releases with optional filters and pagination.
 * @param {Object} [filters] - Query filters
 * @param {string} [search] - Search term
 * @param {string} [ordering] - Sort field (default: -review_completed_at)
 * @param {number} [page=1] - Page number
 * @param {number} [pageSize=20] - Page size
 * @returns {Promise<{results: Array, count: number}>}
 */
export async function listCompletedReviewReleases(
    filters = {},
    search = '',
    ordering = '-review_completed_at',
    page = 1,
    pageSize = 20
) {
    try {
        const params = new URLSearchParams();
        params.set('page', String(page));
        params.set('page_size', String(pageSize));
        if (ordering) params.set('ordering', ordering);
        if (search) params.set('search', search);

        Object.entries(filters).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
                params.set(key, String(value));
            }
        });

        const url = `${backendBase}/projects/drawing-releases/completed_reviews/?${params.toString()}`;
        const response = await authedFetch(url);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        if (data.results !== undefined) {
            return { results: data.results, count: data.count };
        }
        return { results: data, count: data.length };
    } catch (error) {
        console.error('Error listing completed review releases:', error);
        throw error;
    }
}

/**
 * Approve a pending drawing release
 * @param {number} releaseId - Release ID
 * @param {Object} [approvalData] - Optional approval data
 * @param {string} [approvalData.comment] - Optional comment
 * @returns {Promise<Object>} Response with updated release
 */
export async function approveRelease(releaseId, approvalData = {}) {
    try {
        const response = await authedFetch(`${backendBase}/projects/drawing-releases/${releaseId}/approve/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(approvalData),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(JSON.stringify(errorData) || `HTTP error! status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error(`Error approving release ${releaseId}:`, error);
        throw error;
    }
}

/**
 * Reject a pending drawing release
 * @param {number} releaseId - Release ID
 * @param {Object} rejectionData - Rejection data
 * @param {string} rejectionData.reason - Reason for rejection (required)
 * @returns {Promise<Object>} Response with updated release
 */
export async function rejectRelease(releaseId, rejectionData) {
    try {
        const response = await authedFetch(`${backendBase}/projects/drawing-releases/${releaseId}/reject/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(rejectionData),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(JSON.stringify(errorData) || `HTTP error! status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error(`Error rejecting release ${releaseId}:`, error);
        throw error;
    }
}

/**
 * Resubmit a rejected drawing release for approval
 * @param {number} releaseId - Release ID
 * @param {Object} resubmitData - Updated release fields
 * @returns {Promise<Object>} Response with updated release
 */
export async function resubmitRelease(releaseId, resubmitData) {
    try {
        const response = await authedFetch(`${backendBase}/projects/drawing-releases/${releaseId}/resubmit/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(resubmitData),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(JSON.stringify(errorData) || `HTTP error! status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error(`Error resubmitting release ${releaseId}:`, error);
        throw error;
    }
}

export async function completeRevision(releaseId, completionData) {
    try {
        const response = await authedFetch(`${backendBase}/projects/drawing-releases/${releaseId}/complete_revision/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(completionData)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(JSON.stringify(errorData) || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error completing revision for release ${releaseId}:`, error);
        throw error;
    }
}
