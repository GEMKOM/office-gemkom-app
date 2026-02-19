import { backendBase } from "../../base.js";
import { authedFetch } from "../../authService.js";

/**
 * Subcontractors API Service
 * Handles all subcontractor-related API requests using authedFetch
 * 
 * Based on Django REST Framework ViewSet endpoints:
 * - GET /subcontracting/subcontractors/            (list)
 * - POST /subcontracting/subcontractors/           (create)
 * - GET /subcontracting/subcontractors/{id}/       (detail)
 * - PATCH /subcontracting/subcontractors/{id}/     (update)
 * - DELETE /subcontracting/subcontractors/{id}/     (delete)
 */

/**
 * Fetch all subcontractors with optional filtering
 * @param {Object} filters - Filter parameters
 * @param {boolean} filters.is_active - Filter by active status
 * @param {string} filters.search - Search in name, short_name, contact_person
 * @param {string} filters.ordering - Ordering field (e.g., 'name', '-created_at')
 * @param {number} filters.page - Page number for pagination
 * @param {number} filters.page_size - Page size for pagination
 * @returns {Promise<Object>} Response with subcontractors
 */
export async function fetchSubcontractors(filters = {}) {
    const params = new URLSearchParams();
    
    // Add filters to query parameters
    Object.keys(filters).forEach(key => {
        if (filters[key] !== null && filters[key] !== undefined && filters[key] !== '') {
            params.append(key, filters[key]);
        }
    });

    const url = `${backendBase}/subcontracting/subcontractors/?${params.toString()}`;
    const resp = await authedFetch(url);
    
    if (!resp.ok) {
        const errorData = await resp.json();
        throw new Error(errorData.detail || errorData.message || 'Taşeronlar yüklenirken hata oluştu');
    }
    
    const data = await resp.json();
    return data;
}

/**
 * Fetch a single subcontractor by ID
 * @param {number} subcontractorId - Subcontractor ID
 * @returns {Promise<Object>} Subcontractor details
 */
export async function fetchSubcontractor(subcontractorId) {
    const url = `${backendBase}/subcontracting/subcontractors/${subcontractorId}/`;
    const resp = await authedFetch(url);
    
    if (!resp.ok) {
        const errorData = await resp.json();
        throw new Error(errorData.detail || errorData.message || 'Taşeron detayları yüklenirken hata oluştu');
    }
    
    const data = await resp.json();
    return data;
}

/**
 * Create a new subcontractor
 * @param {Object} subcontractorData - Subcontractor data
 * @param {string} subcontractorData.name - Company name
 * @param {string} subcontractorData.short_name - Short name
 * @param {string} subcontractorData.contact_person - Contact person name
 * @param {string} subcontractorData.phone - Phone number
 * @param {string} subcontractorData.email - Email address
 * @param {string} subcontractorData.address - Address
 * @param {string} subcontractorData.tax_id - Tax ID
 * @param {string} subcontractorData.tax_office - Tax office
 * @param {string} subcontractorData.bank_info - Bank information
 * @param {string} subcontractorData.agreement_details - Agreement details
 * @param {string} subcontractorData.default_currency - Default currency code
 * @param {boolean} subcontractorData.is_active - Active status
 * @returns {Promise<Object>} Created subcontractor
 */
export async function createSubcontractor(subcontractorData) {
    const url = `${backendBase}/subcontracting/subcontractors/`;
    const resp = await authedFetch(url, {
        method: 'POST',
        body: JSON.stringify(subcontractorData)
    });
    
    if (!resp.ok) {
        const errorData = await resp.json();
        const errorMessage = errorData.detail || errorData.message || Object.values(errorData).flat().join(', ') || 'Taşeron oluşturulurken hata oluştu';
        throw new Error(errorMessage);
    }
    
    const data = await resp.json();
    return data;
}

/**
 * Update an existing subcontractor
 * @param {number} subcontractorId - Subcontractor ID
 * @param {Object} updateData - Data to update
 * @returns {Promise<Object>} Updated subcontractor
 */
export async function updateSubcontractor(subcontractorId, updateData) {
    const url = `${backendBase}/subcontracting/subcontractors/${subcontractorId}/`;
    const resp = await authedFetch(url, {
        method: 'PATCH',
        body: JSON.stringify(updateData)
    });
    
    if (!resp.ok) {
        const errorData = await resp.json();
        const errorMessage = errorData.detail || errorData.message || Object.values(errorData).flat().join(', ') || 'Taşeron güncellenirken hata oluştu';
        throw new Error(errorMessage);
    }
    
    const data = await resp.json();
    return data;
}

/**
 * Delete a subcontractor
 * @param {number} subcontractorId - Subcontractor ID
 * @returns {Promise<Object>} Response indicating success/failure
 */
export async function deleteSubcontractor(subcontractorId) {
    const url = `${backendBase}/subcontracting/subcontractors/${subcontractorId}/`;
    const resp = await authedFetch(url, {
        method: 'DELETE'
    });
    
    if (!resp.ok) {
        const errorData = await resp.json();
        throw new Error(errorData.detail || errorData.message || 'Taşeron silinirken hata oluştu');
    }
    
    // DELETE might not return JSON
    if (resp.status === 204) {
        return { success: true };
    }
    
    return await resp.json();
}
