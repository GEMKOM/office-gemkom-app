import { backendBase } from "../../base.js";
import { authedFetch } from "../../authService.js";

/**
 * Welding Time Entries API Service
 * Handles all welding time entry-related API requests using authedFetch
 * 
 * Based on Django REST Framework ViewSet endpoints:
 * - GET /welding/time-entries/            (list)
 * - POST /welding/time-entries/           (create)
 * - GET /welding/time-entries/{id}/       (detail)
 * - PUT/PATCH /welding/time-entries/{id}/ (update)
 * - DELETE /welding/time-entries/{id}/    (delete)
 * - GET /welding/time-entries/job-hours/  (custom action)
 * - POST /welding/time-entries/bulk-create/ (bulk create)
 */

// ===== Time Entries CRUD =====

/**
 * Fetch all welding time entries with optional filtering
 * @param {Object} filters - Filter parameters
 * @param {number} filters.employee - Filter by employee ID
 * @param {string} filters.employee_username - Filter by employee username (partial match)
 * @param {string} filters.job_no - Filter by job number (partial match)
 * @param {string} filters.date - Filter by exact date (YYYY-MM-DD)
 * @param {string} filters.date_after - Filter entries after this date (YYYY-MM-DD)
 * @param {string} filters.date_before - Filter entries before this date (YYYY-MM-DD)
 * @param {number} filters.hours_min - Minimum hours filter
 * @param {number} filters.hours_max - Maximum hours filter
 * @param {string} filters.overtime_type - Filter by overtime type (regular, after_hours, holiday)
 * @param {string} filters.description - Filter by description (partial match)
 * @param {string} filters.ordering - Ordering field (e.g., '-date', 'employee', 'job_no')
 * @param {number} filters.page - Page number for pagination
 * @param {number} filters.page_size - Page size for pagination
 * @returns {Promise<Object>} Response with time entries
 */
export async function fetchWeldingTimeEntries(filters = {}) {
    const params = new URLSearchParams();
    
    // Add filters to query parameters
    Object.keys(filters).forEach(key => {
        if (filters[key] !== null && filters[key] !== undefined && filters[key] !== '') {
            params.append(key, filters[key]);
        }
    });

    const url = `${backendBase}/welding/time-entries/?${params.toString()}`;
    const resp = await authedFetch(url);
    
    if (!resp.ok) {
        const errorData = await resp.json();
        throw new Error(errorData.error || errorData.detail || 'Zaman kayıtları yüklenirken hata oluştu');
    }
    
    const data = await resp.json();
    return data;
}

/**
 * Fetch a single welding time entry by ID
 * @param {number} entryId - Time entry ID
 * @returns {Promise<Object>} Time entry details
 */
export async function fetchWeldingTimeEntry(entryId) {
    const url = `${backendBase}/welding/time-entries/${entryId}/`;
    const resp = await authedFetch(url);
    
    if (!resp.ok) {
        const errorData = await resp.json();
        throw new Error(errorData.error || errorData.detail || 'Zaman kaydı yüklenirken hata oluştu');
    }
    
    const data = await resp.json();
    return data;
}

/**
 * Create a new welding time entry
 * @param {Object} entryData - Time entry data
 * @param {number} entryData.employee - Employee ID
 * @param {string} entryData.job_no - Job number
 * @param {string} entryData.date - Date (YYYY-MM-DD)
 * @param {number} entryData.hours - Hours worked
 * @param {string} entryData.description - Description (optional)
 * @returns {Promise<Object>} Created time entry
 */
export async function createWeldingTimeEntry(entryData) {
    const url = `${backendBase}/welding/time-entries/`;
    const resp = await authedFetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(entryData)
    });
    
    const data = await resp.json();
    
    if (!resp.ok) {
        const errorMessage = data.errors || data.error || data.detail || 'Zaman kaydı oluşturulurken hata oluştu';
        const error = new Error(Array.isArray(errorMessage) ? errorMessage.join(', ') : errorMessage);
        error.response = data;
        throw error;
    }
    
    return data;
}

/**
 * Update an existing welding time entry
 * @param {number} entryId - Time entry ID
 * @param {Object} updateData - Data to update
 * @param {number} updateData.employee - Employee ID (optional)
 * @param {string} updateData.job_no - Job number (optional)
 * @param {string} updateData.date - Date (optional)
 * @param {number} updateData.hours - Hours worked (optional)
 * @param {string} updateData.description - Description (optional)
 * @param {boolean} usePut - If true, use PUT method; otherwise use PATCH (default: false)
 * @returns {Promise<Object>} Updated time entry
 */
export async function updateWeldingTimeEntry(entryId, updateData, usePut = false) {
    const url = `${backendBase}/welding/time-entries/${entryId}/`;
    const resp = await authedFetch(url, {
        method: usePut ? 'PUT' : 'PATCH',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
    });
    
    const data = await resp.json();
    
    if (!resp.ok) {
        const errorMessage = data.errors || data.error || data.detail || 'Zaman kaydı güncellenirken hata oluştu';
        const error = new Error(Array.isArray(errorMessage) ? errorMessage.join(', ') : errorMessage);
        error.response = data;
        throw error;
    }
    
    return data;
}

/**
 * Delete a welding time entry
 * @param {number} entryId - Time entry ID
 * @returns {Promise<void>}
 */
export async function deleteWeldingTimeEntry(entryId) {
    const url = `${backendBase}/welding/time-entries/${entryId}/`;
    const resp = await authedFetch(url, {
        method: 'DELETE'
    });
    
    if (!resp.ok) {
        const errorData = await resp.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.detail || 'Zaman kaydı silinirken hata oluştu');
    }
    
    // DELETE requests may not have a response body
    if (resp.status === 204 || resp.status === 200) {
        return;
    }
    
    return await resp.json().catch(() => ({}));
}

// ===== Custom Actions =====

/**
 * Get aggregated hours for a specific job number (supports partial matching)
 * @param {Object} params - Query parameters
 * @param {string} params.job_no - Required. Job number to search (supports partial matching)
 * @param {string} params.date_after - Optional. Filter entries after this date (YYYY-MM-DD)
 * @param {string} params.date_before - Optional. Filter entries before this date (YYYY-MM-DD)
 * @returns {Promise<Object>} Job hours aggregation data
 * @returns {string} job_no - The job number searched
 * @returns {number} total_hours - Total hours for the job
 * @returns {number} entry_count - Number of entries
 * @returns {Array} breakdown_by_employee - Breakdown by employee
 * @returns {Array} breakdown_by_date - Breakdown by date
 */
export async function getWeldingJobHours(params) {
    if (!params.job_no) {
        throw new Error('job_no query parameter is required');
    }

    const queryParams = new URLSearchParams();
    queryParams.append('job_no', params.job_no);
    
    if (params.date_after) {
        queryParams.append('date_after', params.date_after);
    }
    if (params.date_before) {
        queryParams.append('date_before', params.date_before);
    }

    const url = `${backendBase}/welding/time-entries/job-hours/?${queryParams.toString()}`;
    const resp = await authedFetch(url);
    
    if (!resp.ok) {
        const errorData = await resp.json();
        throw new Error(errorData.error || errorData.detail || 'İş saatleri yüklenirken hata oluştu');
    }
    
    const data = await resp.json();
    return data;
}

/**
 * Bulk create welding time entries
 * @param {Object} bulkData - Bulk create data
 * @param {Array} bulkData.entries - Array of time entry objects
 * @param {number} bulkData.entries[].employee - Employee ID
 * @param {string} bulkData.entries[].job_no - Job number
 * @param {string} bulkData.entries[].date - Date (YYYY-MM-DD)
 * @param {number} bulkData.entries[].hours - Hours worked
 * @param {string} bulkData.entries[].description - Description (optional)
 * @returns {Promise<Object>} Response with created entries
 * @returns {number} created_count - Number of entries created
 * @returns {Array} entries - Array of created entry objects
 */
export async function bulkCreateWeldingTimeEntries(bulkData) {
    const url = `${backendBase}/welding/time-entries/bulk-create/`;
    const resp = await authedFetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(bulkData)
    });
    
    const data = await resp.json();
    
    if (!resp.ok) {
        const errorMessage = data.errors || data.error || data.detail || 'Toplu zaman kaydı oluşturulurken hata oluştu';
        const error = new Error(Array.isArray(errorMessage) ? errorMessage.join(', ') : errorMessage);
        error.response = data;
        throw error;
    }
    
    return data;
}

