import { backendBase } from "../../base.js";
import { authedFetch } from "../../authService.js";

/**
 * Price Tiers API Service
 * Handles all price tier-related API requests using authedFetch
 * 
 * Based on Django REST Framework ViewSet endpoints:
 * - GET /subcontracting/price-tiers/            (list)
 * - POST /subcontracting/price-tiers/           (create)
 * - GET /subcontracting/price-tiers/{id}/       (detail)
 * - PATCH /subcontracting/price-tiers/{id}/     (update)
 * - DELETE /subcontracting/price-tiers/{id}/     (delete)
 * - GET /subcontracting/price-tiers/{id}/remaining-weight/  (get remaining weight)
 */

/**
 * Fetch all price tiers with optional filtering
 * @param {Object} filters - Filter parameters
 * @param {string} filters.job_order - Filter by job order number
 * @param {string} filters.ordering - Ordering field (e.g., 'name', '-created_at')
 * @param {number} filters.page - Page number for pagination
 * @param {number} filters.page_size - Page size for pagination
 * @returns {Promise<Object>} Response with price tiers
 */
export async function fetchPriceTiers(filters = {}) {
    const params = new URLSearchParams();
    
    // Add filters to query parameters
    Object.keys(filters).forEach(key => {
        if (filters[key] !== null && filters[key] !== undefined && filters[key] !== '') {
            params.append(key, filters[key]);
        }
    });

    const url = `${backendBase}/subcontracting/price-tiers/?${params.toString()}`;
    const resp = await authedFetch(url);
    
    if (!resp.ok) {
        const errorData = await resp.json();
        throw new Error(errorData.detail || errorData.message || 'Fiyat kademeleri yüklenirken hata oluştu');
    }
    
    const data = await resp.json();
    return data;
}

/**
 * Fetch a single price tier by ID
 * @param {number} tierId - Price tier ID
 * @returns {Promise<Object>} Price tier details
 */
export async function fetchPriceTier(tierId) {
    const url = `${backendBase}/subcontracting/price-tiers/${tierId}/`;
    const resp = await authedFetch(url);
    
    if (!resp.ok) {
        const errorData = await resp.json();
        throw new Error(errorData.detail || errorData.message || 'Fiyat kademesi detayları yüklenirken hata oluştu');
    }
    
    const data = await resp.json();
    return data;
}

/**
 * Get remaining weight for a price tier
 * @param {number} tierId - Price tier ID
 * @returns {Promise<Object>} Remaining weight information
 */
export async function getPriceTierRemainingWeight(tierId) {
    const url = `${backendBase}/subcontracting/price-tiers/${tierId}/remaining-weight/`;
    const resp = await authedFetch(url);
    
    if (!resp.ok) {
        const errorData = await resp.json();
        throw new Error(errorData.detail || errorData.message || 'Kalan ağırlık bilgisi yüklenirken hata oluştu');
    }
    
    const data = await resp.json();
    return data;
}

/**
 * Create a new price tier
 * @param {Object} tierData - Price tier data
 * @param {string} tierData.job_order - Job order number
 * @param {string} tierData.name - Tier name
 * @param {number} tierData.price_per_kg - Price per kilogram
 * @param {string} tierData.currency - Currency code
 * @param {number} tierData.allocated_weight_kg - Allocated weight in kg
 * @returns {Promise<Object>} Created price tier
 */
export async function createPriceTier(tierData) {
    const url = `${backendBase}/subcontracting/price-tiers/`;
    const resp = await authedFetch(url, {
        method: 'POST',
        body: JSON.stringify(tierData)
    });
    
    if (!resp.ok) {
        const errorData = await resp.json();
        const errorMessage = errorData.detail || errorData.message || Object.values(errorData).flat().join(', ') || 'Fiyat kademesi oluşturulurken hata oluştu';
        throw new Error(errorMessage);
    }
    
    const data = await resp.json();
    return data;
}

/**
 * Update an existing price tier
 * @param {number} tierId - Price tier ID
 * @param {Object} updateData - Data to update
 * @returns {Promise<Object>} Updated price tier
 */
export async function updatePriceTier(tierId, updateData) {
    const url = `${backendBase}/subcontracting/price-tiers/${tierId}/`;
    const resp = await authedFetch(url, {
        method: 'PATCH',
        body: JSON.stringify(updateData)
    });
    
    if (!resp.ok) {
        const errorData = await resp.json();
        const errorMessage = errorData.detail || errorData.message || Object.values(errorData).flat().join(', ') || 'Fiyat kademesi güncellenirken hata oluştu';
        throw new Error(errorMessage);
    }
    
    const data = await resp.json();
    return data;
}

/**
 * Delete a price tier
 * @param {number} tierId - Price tier ID
 * @returns {Promise<Object>} Response indicating success/failure
 */
export async function deletePriceTier(tierId) {
    const url = `${backendBase}/subcontracting/price-tiers/${tierId}/`;
    const resp = await authedFetch(url, {
        method: 'DELETE'
    });
    
    if (!resp.ok) {
        const errorData = await resp.json();
        throw new Error(errorData.detail || errorData.message || 'Fiyat kademesi silinirken hata oluştu');
    }
    
    // DELETE might not return JSON
    if (resp.status === 204) {
        return { success: true };
    }
    
    return await resp.json();
}
