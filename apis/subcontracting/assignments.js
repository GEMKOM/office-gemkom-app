import { backendBase } from "../../base.js";
import { authedFetch } from "../../authService.js";

/**
 * Subcontracting Assignments API Service
 * Handles all assignment-related API requests using authedFetch
 * 
 * Based on Django REST Framework ViewSet endpoints:
 * - GET /subcontracting/assignments/            (list)
 * - POST /subcontracting/assignments/           (create)
 * - GET /subcontracting/assignments/{id}/       (detail)
 * - PATCH /subcontracting/assignments/{id}/     (update)
 * - DELETE /subcontracting/assignments/{id}/     (delete)
 */

/**
 * Fetch all assignments with optional filtering
 * @param {Object} filters - Filter parameters
 * @param {string} filters.job_no - Filter by job order number
 * @param {number} filters.department_task - Filter by department task ID
 * @param {number} filters.subcontractor - Filter by subcontractor ID
 * @param {string} filters.ordering - Ordering field (e.g., '-created_at')
 * @param {number} filters.page - Page number for pagination
 * @param {number} filters.page_size - Page size for pagination
 * @returns {Promise<Object>} Response with assignments
 */
export async function fetchAssignments(filters = {}) {
    const params = new URLSearchParams();
    
    // Add filters to query parameters
    Object.keys(filters).forEach(key => {
        if (filters[key] !== null && filters[key] !== undefined && filters[key] !== '') {
            params.append(key, filters[key]);
        }
    });

    const url = `${backendBase}/subcontracting/assignments/?${params.toString()}`;
    const resp = await authedFetch(url);
    
    if (!resp.ok) {
        const errorData = await resp.json();
        throw new Error(errorData.detail || errorData.message || 'Taşeron atamaları yüklenirken hata oluştu');
    }
    
    const data = await resp.json();
    return data;
}

/**
 * Fetch a single assignment by ID
 * @param {number} assignmentId - Assignment ID
 * @returns {Promise<Object>} Assignment details
 */
export async function fetchAssignment(assignmentId) {
    const url = `${backendBase}/subcontracting/assignments/${assignmentId}/`;
    const resp = await authedFetch(url);
    
    if (!resp.ok) {
        const errorData = await resp.json();
        throw new Error(errorData.detail || errorData.message || 'Taşeron ataması detayları yüklenirken hata oluştu');
    }
    
    const data = await resp.json();
    return data;
}

/**
 * Create a new assignment
 * @param {Object} assignmentData - Assignment data
 * @param {number} assignmentData.department_task - Department task ID
 * @param {number} assignmentData.subcontractor - Subcontractor ID
 * @param {number} assignmentData.price_tier - Price tier ID
 * @param {number} assignmentData.allocated_weight_kg - Allocated weight in kg
 * @returns {Promise<Object>} Created assignment
 */
export async function createAssignment(assignmentData) {
    const url = `${backendBase}/subcontracting/assignments/`;
    const resp = await authedFetch(url, {
        method: 'POST',
        body: JSON.stringify(assignmentData)
    });
    
    if (!resp.ok) {
        const errorData = await resp.json();
        const errorMessage = errorData.detail || errorData.message || Object.values(errorData).flat().join(', ') || 'Taşeron ataması oluşturulurken hata oluştu';
        throw new Error(errorMessage);
    }
    
    const data = await resp.json();
    return data;
}

/**
 * Update an existing assignment
 * @param {number} assignmentId - Assignment ID
 * @param {Object} updateData - Data to update
 * @returns {Promise<Object>} Updated assignment
 */
export async function updateAssignment(assignmentId, updateData) {
    const url = `${backendBase}/subcontracting/assignments/${assignmentId}/`;
    const resp = await authedFetch(url, {
        method: 'PATCH',
        body: JSON.stringify(updateData)
    });
    
    if (!resp.ok) {
        const errorData = await resp.json();
        const errorMessage = errorData.detail || errorData.message || Object.values(errorData).flat().join(', ') || 'Taşeron ataması güncellenirken hata oluştu';
        throw new Error(errorMessage);
    }
    
    const data = await resp.json();
    return data;
}

/**
 * Delete an assignment
 * @param {number} assignmentId - Assignment ID
 * @returns {Promise<Object>} Response indicating success/failure
 */
export async function deleteAssignment(assignmentId) {
    const url = `${backendBase}/subcontracting/assignments/${assignmentId}/`;
    const resp = await authedFetch(url, {
        method: 'DELETE'
    });
    
    if (!resp.ok) {
        const errorData = await resp.json();
        throw new Error(errorData.detail || errorData.message || 'Taşeron ataması silinirken hata oluştu');
    }
    
    // DELETE might not return JSON
    if (resp.status === 204) {
        return { success: true };
    }
    
    return await resp.json();
}
