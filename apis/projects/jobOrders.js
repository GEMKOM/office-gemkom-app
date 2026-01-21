import { authedFetch } from '../../authService.js';
import { backendBase } from '../../base.js';
import { extractResultsFromResponse } from '../paginationHelper.js';

/**
 * Job Order API Service
 * Handles all job order related API requests
 * Base URL: /projects/job-orders/
 */

/**
 * List job orders with optional filters and pagination
 * @param {Object} options - Query parameters
 * @param {string} options.search - Search in job_no, title, description, customer name/code
 * @param {string} options.status - Filter by status: draft, active, on_hold, completed, cancelled
 * @param {string} options.status__in - Filter by multiple statuses: active,draft
 * @param {string} options.priority - Filter by priority: low, normal, high, urgent
 * @param {string} options.priority__in - Filter by multiple priorities
 * @param {number} options.customer - Filter by customer ID
 * @param {string} options.parent - Filter by parent job_no
 * @param {boolean} options.parent__isnull - Filter root jobs (true) or child jobs (false)
 * @param {boolean} options.root_only - Custom filter for root jobs only
 * @param {string} options.ordering - Sort: job_no, title, status, priority, target_completion_date, created_at, -created_at
 * @param {number} options.page - Page number for pagination
 * @returns {Promise<Object>} Paginated response with count, next, previous, and results
 */
export async function listJobOrders(options = {}) {
    try {
        const queryParams = new URLSearchParams();
        
        // Add query parameters if provided
        if (options.search) {
            queryParams.append('search', options.search);
        }
        if (options.status) {
            queryParams.append('status', options.status);
        }
        if (options.status__in) {
            queryParams.append('status__in', options.status__in);
        }
        if (options.priority) {
            queryParams.append('priority', options.priority);
        }
        if (options.priority__in) {
            queryParams.append('priority__in', options.priority__in);
        }
        if (options.customer) {
            queryParams.append('customer', options.customer.toString());
        }
        if (options.parent) {
            queryParams.append('parent', options.parent);
        }
        if (options.parent__isnull !== undefined && options.parent__isnull !== null) {
            queryParams.append('parent__isnull', options.parent__isnull.toString());
        }
        if (options.root_only !== undefined) {
            queryParams.append('root_only', options.root_only.toString());
        }
        if (options.ordering) {
            queryParams.append('ordering', options.ordering);
        }
        if (options.page) {
            queryParams.append('page', options.page.toString());
        }

        const url = `${backendBase}/projects/job-orders/${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
        const response = await authedFetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error listing job orders:', error);
        throw error;
    }
}

/**
 * Get job order detail by job_no
 * @param {string} jobNo - Job order number
 * @returns {Promise<Object>} Job order detail object
 */
export async function getJobOrderByJobNo(jobNo) {
    try {
        const response = await authedFetch(`${backendBase}/projects/job-orders/${jobNo}/`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error fetching job order ${jobNo}:`, error);
        throw error;
    }
}

/**
 * Create a new job order
 * @param {Object} jobOrderData - Job order data
 * @param {string} jobOrderData.job_no - Job order number (required)
 * @param {string} jobOrderData.title - Job order title (required)
 * @param {string} [jobOrderData.description] - Description
 * @param {number} [jobOrderData.customer] - Customer ID (required unless parent is set)
 * @param {string} [jobOrderData.customer_order_no] - Customer order number
 * @param {string} [jobOrderData.priority] - Priority: low, normal, high, urgent
 * @param {string} [jobOrderData.target_completion_date] - Target completion date (YYYY-MM-DD)
 * @param {string} [jobOrderData.estimated_cost] - Estimated cost
 * @param {string} [jobOrderData.cost_currency] - Cost currency: TRY, USD, EUR, GBP
 * @param {string} [jobOrderData.parent] - Parent job_no for child jobs
 * @returns {Promise<Object>} Created job order detail object
 */
export async function createJobOrder(jobOrderData) {
    try {
        const response = await authedFetch(`${backendBase}/projects/job-orders/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(jobOrderData)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(JSON.stringify(errorData) || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error creating job order:', error);
        throw error;
    }
}

/**
 * Update job order (PATCH)
 * @param {string} jobNo - Job order number
 * @param {Object} jobOrderData - Partial job order data
 * @returns {Promise<Object>} Updated job order detail object
 */
export async function updateJobOrder(jobNo, jobOrderData) {
    try {
        const response = await authedFetch(`${backendBase}/projects/job-orders/${jobNo}/`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(jobOrderData)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(JSON.stringify(errorData) || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error updating job order ${jobNo}:`, error);
        throw error;
    }
}

/**
 * Start job order (draft → active)
 * @param {string} jobNo - Job order number
 * @returns {Promise<Object>} Response with status, message, and job_order
 */
export async function startJobOrder(jobNo) {
    try {
        const response = await authedFetch(`${backendBase}/projects/job-orders/${jobNo}/start/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(JSON.stringify(errorData) || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error starting job order ${jobNo}:`, error);
        throw error;
    }
}

/**
 * Complete job order
 * @param {string} jobNo - Job order number
 * @returns {Promise<Object>} Response with status, message, and job_order
 */
export async function completeJobOrder(jobNo) {
    try {
        const response = await authedFetch(`${backendBase}/projects/job-orders/${jobNo}/complete/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(JSON.stringify(errorData) || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error completing job order ${jobNo}:`, error);
        throw error;
    }
}

/**
 * Put job order on hold
 * @param {string} jobNo - Job order number
 * @param {Object} [options] - Optional parameters
 * @param {string} [options.reason] - Reason for putting on hold
 * @returns {Promise<Object>} Response with status, message, and job_order
 */
export async function holdJobOrder(jobNo, options = {}) {
    try {
        const response = await authedFetch(`${backendBase}/projects/job-orders/${jobNo}/hold/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(options)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(JSON.stringify(errorData) || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error putting job order ${jobNo} on hold:`, error);
        throw error;
    }
}

/**
 * Resume job order from hold
 * @param {string} jobNo - Job order number
 * @returns {Promise<Object>} Response with status, message, and job_order
 */
export async function resumeJobOrder(jobNo) {
    try {
        const response = await authedFetch(`${backendBase}/projects/job-orders/${jobNo}/resume/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(JSON.stringify(errorData) || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error resuming job order ${jobNo}:`, error);
        throw error;
    }
}

/**
 * Cancel job order
 * @param {string} jobNo - Job order number
 * @returns {Promise<Object>} Response with status, message, and job_order
 */
export async function cancelJobOrder(jobNo) {
    try {
        const response = await authedFetch(`${backendBase}/projects/job-orders/${jobNo}/cancel/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(JSON.stringify(errorData) || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error cancelling job order ${jobNo}:`, error);
        throw error;
    }
}

/**
 * Get job order hierarchy (full tree from root)
 * @param {string} jobNo - Job order number
 * @returns {Promise<Object>} Hierarchy tree with children
 */
export async function getJobOrderHierarchy(jobNo) {
    try {
        const response = await authedFetch(`${backendBase}/projects/job-orders/${jobNo}/hierarchy/`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error fetching job order hierarchy for ${jobNo}:`, error);
        throw error;
    }
}

/**
 * Get status choices
 * @returns {Promise<Array>} Array of status options with value and label
 */
export async function getStatusChoices() {
    try {
        const response = await authedFetch(`${backendBase}/projects/job-orders/status_choices/`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching status choices:', error);
        throw error;
    }
}

/**
 * Get priority choices
 * @returns {Promise<Array>} Array of priority options with value and label
 */
export async function getPriorityChoices() {
    try {
        const response = await authedFetch(`${backendBase}/projects/job-orders/priority_choices/`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching priority choices:', error);
        throw error;
    }
}

/**
 * Helper functions for common use cases
 */

/**
 * Search job orders by search term
 * @param {string} searchTerm - Search term for job_no, title, description, customer name/code
 * @param {Object} additionalOptions - Additional query parameters
 * @returns {Promise<Object>} Paginated response with matching job orders
 */
export async function searchJobOrders(searchTerm, additionalOptions = {}) {
    return listJobOrders({ ...additionalOptions, search: searchTerm });
}

/**
 * Get job orders by status
 * @param {string} status - Status: draft, active, on_hold, completed, cancelled
 * @param {Object} additionalOptions - Additional query parameters
 * @returns {Promise<Object>} Paginated response with job orders filtered by status
 */
export async function getJobOrdersByStatus(status, additionalOptions = {}) {
    return listJobOrders({ ...additionalOptions, status });
}

/**
 * Get job orders by multiple statuses
 * @param {Array<string>} statuses - Array of statuses: ['active', 'draft']
 * @param {Object} additionalOptions - Additional query parameters
 * @returns {Promise<Object>} Paginated response with job orders filtered by statuses
 */
export async function getJobOrdersByStatuses(statuses, additionalOptions = {}) {
    return listJobOrders({ ...additionalOptions, status__in: statuses.join(',') });
}

/**
 * Get job orders by priority
 * @param {string} priority - Priority: low, normal, high, urgent
 * @param {Object} additionalOptions - Additional query parameters
 * @returns {Promise<Object>} Paginated response with job orders filtered by priority
 */
export async function getJobOrdersByPriority(priority, additionalOptions = {}) {
    return listJobOrders({ ...additionalOptions, priority });
}

/**
 * Get job orders by customer
 * @param {number} customerId - Customer ID
 * @param {Object} additionalOptions - Additional query parameters
 * @returns {Promise<Object>} Paginated response with job orders filtered by customer
 */
export async function getJobOrdersByCustomer(customerId, additionalOptions = {}) {
    return listJobOrders({ ...additionalOptions, customer: customerId });
}

/**
 * Get root job orders only
 * @param {Object} additionalOptions - Additional query parameters
 * @returns {Promise<Object>} Paginated response with root job orders
 */
export async function getRootJobOrders(additionalOptions = {}) {
    return listJobOrders({ ...additionalOptions, root_only: true });
}

/**
 * Get child job orders
 * @param {string} parentJobNo - Parent job order number
 * @param {Object} additionalOptions - Additional query parameters
 * @returns {Promise<Object>} Paginated response with child job orders
 */
export async function getChildJobOrders(parentJobNo, additionalOptions = {}) {
    return listJobOrders({ ...additionalOptions, parent: parentJobNo });
}

/**
 * Status options (static fallback if API is unavailable)
 */
export const STATUS_OPTIONS = [
    { value: 'draft', label: 'Taslak' },
    { value: 'active', label: 'Aktif' },
    { value: 'on_hold', label: 'Beklemede' },
    { value: 'completed', label: 'Tamamlandı' },
    { value: 'cancelled', label: 'İptal Edildi' }
];

/**
 * Priority options (static fallback if API is unavailable)
 */
export const PRIORITY_OPTIONS = [
    { value: 'low', label: 'Düşük' },
    { value: 'normal', label: 'Normal' },
    { value: 'high', label: 'Yüksek' },
    { value: 'urgent', label: 'Acil' }
];

/**
 * Apply task template to job order
 * @param {string} jobNo - Job order number
 * @param {Object} options - Options
 * @param {number} options.template_id - Template ID (required)
 * @returns {Promise<Object>} Response with status, message, and created tasks
 */
export async function applyTemplateToJobOrder(jobNo, options) {
    try {
        const response = await authedFetch(`${backendBase}/projects/job-orders/${jobNo}/apply_template/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(options)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(JSON.stringify(errorData) || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error applying template to job order ${jobNo}:`, error);
        throw error;
    }
}

/**
 * Get department tasks for a job order
 * @param {string} jobNo - Job order number
 * @param {Object} additionalOptions - Additional query parameters for filtering tasks
 * @returns {Promise<Object>} Paginated response with department tasks for the job order
 */
export async function getJobOrderDepartmentTasks(jobNo, additionalOptions = {}) {
    try {
        const queryParams = new URLSearchParams();
        queryParams.append('job_order', jobNo);
        
        // Add additional query parameters if provided
        if (additionalOptions.department) {
            queryParams.append('department', additionalOptions.department);
        }
        if (additionalOptions.department__in) {
            queryParams.append('department__in', additionalOptions.department__in);
        }
        if (additionalOptions.status) {
            queryParams.append('status', additionalOptions.status);
        }
        if (additionalOptions.status__in) {
            queryParams.append('status__in', additionalOptions.status__in);
        }
        if (additionalOptions.assigned_to !== undefined && additionalOptions.assigned_to !== null) {
            queryParams.append('assigned_to', additionalOptions.assigned_to.toString());
        }
        if (additionalOptions.parent__isnull !== undefined && additionalOptions.parent__isnull !== null) {
            queryParams.append('parent__isnull', additionalOptions.parent__isnull.toString());
        }
        if (additionalOptions.main_only !== undefined) {
            queryParams.append('main_only', additionalOptions.main_only.toString());
        }
        if (additionalOptions.ordering) {
            queryParams.append('ordering', additionalOptions.ordering);
        }
        if (additionalOptions.page) {
            queryParams.append('page', additionalOptions.page.toString());
        }

        const url = `${backendBase}/projects/job-orders/${jobNo}/department_tasks/${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
        const response = await authedFetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error fetching department tasks for job order ${jobNo}:`, error);
        throw error;
    }
}