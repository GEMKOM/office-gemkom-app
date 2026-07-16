import { authedFetch } from '../authService.js';
import { backendBase } from '../base.js';

/**
 * Flatten a DRF error response body into a human-readable string.
 * Handles the common shapes returned by the backend:
 *   - "some string"
 *   - { error: "..." } / { detail: "..." }
 *   - { detail: "...", errors: [ ... ] }              (custom action responses)
 *   - { field_name: ["msg", "msg", ...] }             (serializer validation errors)
 *   - { field_name: { nested: ["msg"] } }             (nested serializer errors)
 * Field messages are joined with newlines so multi-line validation errors
 * (e.g. planning item availability) are shown in full instead of being dropped.
 */
export function extractErrorMessage(errorData, fallback = 'Sunucu hatası') {
    if (errorData == null) return fallback;
    if (typeof errorData === 'string') return errorData || fallback;

    // Single-message keys take priority when present
    if (typeof errorData.error === 'string' && errorData.error) return errorData.error;

    // { detail, errors: [...] } — custom action error format
    if (errorData.detail && Array.isArray(errorData.errors) && errorData.errors.length) {
        return [errorData.detail, ...errorData.errors].join('\n');
    }
    if (typeof errorData.detail === 'string' && errorData.detail) return errorData.detail;

    // Flatten every field/non-field error value into a flat list of strings
    const parts = [];
    const collect = (val) => {
        if (val == null) return;
        if (typeof val === 'string') { parts.push(val); return; }
        if (Array.isArray(val)) { val.forEach(collect); return; }
        if (typeof val === 'object') { Object.values(val).forEach(collect); return; }
        parts.push(String(val));
    };
    collect(errorData);

    const message = parts.filter(Boolean).join('\n');
    return message || fallback;
}

/** Read a fetch Response's error body and return a readable message. */
async function readErrorMessage(response, fallback) {
    try {
        const errorData = await response.json();
        return extractErrorMessage(errorData, fallback);
    } catch (_) {
        return fallback;
    }
}

// Purchase Request API Functions
export async function createPurchaseRequest(requestData) {
    try {
        const response = await authedFetch(`${backendBase}/procurement/purchase-requests/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData)
        });

        if (!response.ok) {
            throw new Error(await readErrorMessage(response, 'Sunucu hatası'));
        }

        return await response.json();
    } catch (error) {
        console.error('Error creating purchase request:', error);
        throw error;
    }
}

export async function updatePurchaseRequest(requestId, requestData) {
    try {
        const response = await authedFetch(`${backendBase}/procurement/purchase-requests/${requestId}/`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Sunucu hatası');
        }

        return await response.json();
    } catch (error) {
        console.error('Error updating purchase request:', error);
        throw error;
    }
}

export async function submitPurchaseRequest(requestId) {
    try {
        const response = await authedFetch(`${backendBase}/procurement/purchase-requests/${requestId}/submit/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            throw new Error(await readErrorMessage(response, 'Talep gönderilirken hata oluştu'));
        }

        return await response.json();
    } catch (error) {
        console.error('Error submitting purchase request:', error);
        throw error;
    }
}

export async function cancelPurchaseRequest(requestId) {
    try {
        const response = await authedFetch(`${backendBase}/procurement/purchase-requests/${requestId}/cancel/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.log(errorData);
            throw new Error(errorData.error || 'Talep iptal edilirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error canceling purchase request:', error);
        throw error;
    }
}

export async function revisePurchaseRequest(requestId) {
    try {
        const response = await authedFetch(`${backendBase}/procurement/purchase-requests/${requestId}/revise/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Talep revize edilirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error revising purchase request:', error);
        throw error;
    }
}

export async function getPurchaseRequests(filters = {}) {
    try {
        // Build query parameters
        const queryParams = new URLSearchParams();
        
        // Add filters if provided
        Object.entries(filters).forEach(([key, value]) => {
            if (value !== null && value !== undefined && value !== '') {
                queryParams.append(key, value);
            }
        });
        
        const url = `${backendBase}/procurement/purchase-requests/${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
        const response = await authedFetch(url);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Talepler yüklenirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching purchase requests:', error);
        throw error;
    }
}

export async function getPendingApprovalRequests(filters = {}) {
    try {
        // Build query parameters
        const queryParams = new URLSearchParams();
        
        // Add filters if provided
        Object.entries(filters).forEach(([key, value]) => {
            if (value !== null && value !== undefined && value !== '') {
                queryParams.append(key, value);
            }
        });
        
        const url = `${backendBase}/procurement/purchase-requests/pending_approval/${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
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

export async function getApprovedByMeRequests(filters = {}) {
    try {
        // Build query parameters
        const queryParams = new URLSearchParams();
        
        // Add filters if provided
        Object.entries(filters).forEach(([key, value]) => {
            if (value !== null && value !== undefined && value !== '') {
                queryParams.append(key, value);
            }
        });
        
        const url = `${backendBase}/procurement/purchase-requests/approved_by_me/${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
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

export async function getPurchaseRequest(requestId) {
    try {
        const response = await authedFetch(`${backendBase}/procurement/purchase-requests/${requestId}/`);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Talep yüklenirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching purchase request:', error);
        throw error;
    }
}

export async function getPurchaseRequestAllFiles(requestId) {
    try {
        const response = await authedFetch(`${backendBase}/procurement/purchase-requests/${requestId}/all_files/`);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Dosyalar yüklenirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching purchase request all files:', error);
        throw error;
    }
}

export async function savePurchaseRequestDraft(draftData) {
    try {
        const response = await authedFetch(`${backendBase}/procurement/purchase-request-draft/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(draftData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Taslak kaydedilirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error saving purchase request draft:', error);
        throw error;
    }
}

export async function getPurchaseRequestDrafts(filters = {}) {
    try {
        // Build query parameters
        const queryParams = new URLSearchParams();
        
        // Add filters if provided
        Object.entries(filters).forEach(([key, value]) => {
            if (value !== null && value !== undefined && value !== '') {
                queryParams.append(key, value);
            }
        });
        
        const url = `${backendBase}/procurement/purchase-request-draft/${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
        const response = await authedFetch(url);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Taslaklar yüklenirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching purchase request drafts:', error);
        throw error;
    }
}

export async function deletePurchaseRequestDraft(draftId) {
    try {
        const response = await authedFetch(`${backendBase}/procurement/purchase-request-draft/${draftId}/`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Taslak silinirken hata oluştu');
        }

        return true; // Successfully deleted
    } catch (error) {
        console.error('Error deleting purchase request draft:', error);
        throw error;
    }
}

export async function getPurchaseRequestDraft(draftId) {
    try {
        const response = await authedFetch(`${backendBase}/procurement/purchase-request-draft/${draftId}/`);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Taslak yüklenirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching purchase request draft:', error);
        throw error;
    }
}

export async function approvePurchaseRequest(requestId) {
    try {
        const response = await authedFetch(`${backendBase}/procurement/purchase-requests/${requestId}/approve/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Talep onaylanırken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error approving purchase request:', error);
        throw error;
    }
}

export async function rejectPurchaseRequest(requestId, comment = '') {
    try {
        const response = await authedFetch(`${backendBase}/procurement/purchase-requests/${requestId}/reject/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                comment: comment
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Talep reddedilirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error rejecting purchase request:', error);
        throw error;
    }
}

export async function completePurchaseRequest(requestId) {
    try {
        const response = await authedFetch(`${backendBase}/procurement/purchase-requests/${requestId}/complete/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Talep tamamlanırken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error completing purchase request:', error);
        throw error;
    }
}

export async function attachPlanningItemsToPurchaseRequest(requestId, planningRequestItemIds) {
    try {
        const response = await authedFetch(`${backendBase}/procurement/purchase-requests/${requestId}/attach_planning_items/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                planning_request_item_ids: planningRequestItemIds
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            // Create an error object that preserves the full error data structure
            const error = new Error(errorData.detail || errorData.error || 'Planlama talebi öğeleri eklenirken hata oluştu');
            // Attach the full error data for detailed error handling
            error.errorData = errorData;
            error.errors = errorData.errors;
            error.note = errorData.note;
            throw error;
        }

        return await response.json();
    } catch (error) {
        console.error('Error attaching planning items to purchase request:', error);
        throw error;
    }
}

// Supplier API Functions
export async function searchSuppliers(searchTerm) {
    try {
        const response = await authedFetch(`${backendBase}/procurement/suppliers/?name=${encodeURIComponent(searchTerm)}`);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Tedarikçiler aranırken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error searching suppliers:', error);
        throw error;
    }
}

export async function getSuppliers(filters = {}) {
    try {
        // Build query parameters
        const queryParams = new URLSearchParams();
        
        // Set default page size to 1000
        const filtersWithPageSize = { ...filters, page_size: 1000 };
        
        // Add filters if provided
        Object.entries(filtersWithPageSize).forEach(([key, value]) => {
            if (value !== null && value !== undefined && value !== '') {
                queryParams.append(key, value);
            }
        });
        
        const url = `${backendBase}/procurement/suppliers/${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
        const response = await authedFetch(url);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Tedarikçiler yüklenirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching suppliers:', error);
        throw error;
    }
}

export async function getSupplier(supplierId) {
    try {
        const response = await authedFetch(`${backendBase}/procurement/suppliers/${supplierId}/`);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Tedarikçi yüklenirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching supplier:', error);
        throw error;
    }
}

export async function createSupplier(supplierData) {
    try {
        const response = await authedFetch(`${backendBase}/procurement/suppliers/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(supplierData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Tedarikçi oluşturulurken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error creating supplier:', error);
        throw error;
    }
}

export async function updateSupplier(supplierId, supplierData) {
    try {
        const response = await authedFetch(`${backendBase}/procurement/suppliers/${supplierId}/`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(supplierData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Tedarikçi güncellenirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error updating supplier:', error);
        throw error;
    }
}

export async function deleteSupplier(supplierId) {
    try {
        const response = await authedFetch(`${backendBase}/procurement/suppliers/${supplierId}/`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Tedarikçi silinirken hata oluştu');
        }

        return true;
    } catch (error) {
        console.error('Error deleting supplier:', error);
        throw error;
    }
}

export async function toggleSupplierStatus(supplierId) {
    try {
        const response = await authedFetch(`${backendBase}/procurement/suppliers/${supplierId}/toggle_status/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Tedarikçi durumu değiştirilirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error toggling supplier status:', error);
        throw error;
    }
}

// --- Supplier Rating & Blacklist API Functions ---

/**
 * Change a supplier's lifecycle status (approved/watch/blacklisted) with a reason.
 * POST /procurement/suppliers/{id}/set-status/
 */
export async function setSupplierStatus(supplierId, { status, reason = '' }) {
    const response = await authedFetch(`${backendBase}/procurement/suppliers/${supplierId}/set-status/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, reason }),
    });
    if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Tedarikçi durumu güncellenirken hata oluştu'));
    }
    return await response.json();
}

/** GET /procurement/suppliers/{id}/evaluations/ */
export async function getSupplierEvaluations(supplierId) {
    const response = await authedFetch(`${backendBase}/procurement/suppliers/${supplierId}/evaluations/`);
    if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Değerlendirmeler yüklenirken hata oluştu'));
    }
    return await response.json();
}

/** GET /procurement/suppliers/{id}/status-history/ */
export async function getSupplierStatusHistory(supplierId) {
    const response = await authedFetch(`${backendBase}/procurement/suppliers/${supplierId}/status-history/`);
    if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Durum geçmişi yüklenirken hata oluştu'));
    }
    return await response.json();
}

/**
 * Create a supplier evaluation for a completed purchase order.
 * POST /procurement/supplier-evaluations/
 * payload: { purchase_order, quality_score, delivery_score, price_score, service_score, comment }
 */
export async function createSupplierEvaluation(payload) {
    const response = await authedFetch(`${backendBase}/procurement/supplier-evaluations/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Değerlendirme kaydedilirken hata oluştu'));
    }
    return await response.json();
}

/** PUT /procurement/supplier-evaluations/{id}/ */
export async function updateSupplierEvaluation(evaluationId, payload) {
    const response = await authedFetch(`${backendBase}/procurement/supplier-evaluations/${evaluationId}/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Değerlendirme güncellenirken hata oluştu'));
    }
    return await response.json();
}

/** GET /procurement/supplier-evaluations/?supplier=&purchase_order= */
export async function listSupplierEvaluations(filters = {}) {
    const queryParams = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') queryParams.append(k, v);
    });
    const qs = queryParams.toString();
    const response = await authedFetch(`${backendBase}/procurement/supplier-evaluations/${qs ? '?' + qs : ''}`);
    if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Değerlendirmeler yüklenirken hata oluştu'));
    }
    return await response.json();
}

// Item API Functions
export async function searchItems(searchTerm, searchType = 'code') {
    try {
        const response = await authedFetch(`${backendBase}/procurement/items/?${searchType}=${encodeURIComponent(searchTerm)}`);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Malzemeler aranırken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error searching items:', error);
        throw error;
    }
}

/**
 * Search items using DRF standard search param
 * GET /procurement/items/?search=...
 * @param {string} searchTerm
 * @param {Object} [extraParams]
 */
export async function searchItemsBySearch(searchTerm, extraParams = {}) {
    try {
        const queryParams = new URLSearchParams();
        if (searchTerm) {
            queryParams.append('search', searchTerm);
        }
        Object.entries(extraParams || {}).forEach(([k, v]) => {
            if (v !== null && v !== undefined && v !== '') {
                queryParams.append(k, v);
            }
        });
        const url = `${backendBase}/procurement/items/?${queryParams.toString()}`;
        const response = await authedFetch(url);

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || errorData.detail || 'Malzemeler aranırken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error searching items (search=):', error);
        throw error;
    }
}

/**
 * Get single item by id
 * GET /procurement/items/{id}/
 * @param {number|string} itemId
 */
export async function getItem(itemId) {
    try {
        const response = await authedFetch(`${backendBase}/procurement/items/${itemId}/`);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || errorData.detail || 'Malzeme yüklenirken hata oluştu');
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching item:', error);
        throw error;
    }
}

export async function getItems(filters = {}) {
    try {
        // Build query parameters
        const queryParams = new URLSearchParams();
        
        // Add all filter parameters dynamically (handles code, code__exact, code__startswith, name, name__startswith, etc.)
        Object.keys(filters).forEach(key => {
            const value = filters[key];
            // Only add non-empty values
            if (value !== null && value !== undefined && value !== '') {
                queryParams.append(key, value);
            }
        });
        
        const url = `${backendBase}/procurement/items/${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
        const response = await authedFetch(url);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Malzemeler yüklenirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching items:', error);
        throw error;
    }
}

export async function createItem(itemData) {
    try {
        const response = await authedFetch(`${backendBase}/procurement/items/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(itemData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Malzeme oluşturulurken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error creating item:', error);
        throw error;
    }
}

export async function updateItem(itemId, itemData) {
    try {
        const response = await authedFetch(`${backendBase}/procurement/items/${itemId}/`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(itemData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Malzeme güncellenirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error updating item:', error);
        throw error;
    }
}

export async function deleteItem(itemId) {
    try {
        const response = await authedFetch(`${backendBase}/procurement/items/${itemId}/`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Malzeme silinirken hata oluştu');
        }

        return true;
    } catch (error) {
        console.error('Error deleting item:', error);
        throw error;
    }
}

export async function getItemPurchaseRequests(itemId) {
    try {
        const response = await authedFetch(`${backendBase}/procurement/items/${itemId}/purchase-requests/`);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Satın alma talepleri yüklenirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching item purchase requests:', error);
        throw error;
    }
}

export async function getItemPlanningRequests(itemId) {
    try {
        const response = await authedFetch(`${backendBase}/procurement/items/${itemId}/planning-requests/`);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Planlama talepleri yüklenirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching item planning requests:', error);
        throw error;
    }
}

// Item Offer API Functions
export async function toggleItemRecommendation(itemOfferId) {
    try {
        const response = await authedFetch(`${backendBase}/procurement/item-offers/${itemOfferId}/toggle_recommendation/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Öneri durumu değiştirilirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error toggling item recommendation:', error);
        throw error;
    }
}

export async function getItemOffers(purchaseRequestId = null, supplierOfferId = null) {
    try {
        let url = `${backendBase}/procurement/item-offers/`;
        const params = new URLSearchParams();
        
        if (purchaseRequestId) {
            params.append('purchase_request', purchaseRequestId);
        }
        if (supplierOfferId) {
            params.append('supplier_offer', supplierOfferId);
        }
        
        if (params.toString()) {
            url += `?${params.toString()}`;
        }

        const response = await authedFetch(url);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Teklifler yüklenirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching item offers:', error);
        throw error;
    }
}

// Payment Type API Functions
export async function getPaymentTypes() {
    try {
        const response = await authedFetch(`${backendBase}/procurement/payment-types/`);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Ödeme türleri yüklenirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching payment types:', error);
        throw error;
    }
}

// Status Choices API Functions
export async function getStatusChoices() {
    try {
        const response = await authedFetch(`${backendBase}/procurement/status-choices/`);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Durum seçenekleri yüklenirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching status choices:', error);
        throw error;
    }
}

// Payment Terms API Functions
export async function getPaymentTerms(filters = {}) {
    try {
        // Build query parameters
        const queryParams = new URLSearchParams();
        
        // Add filters if provided
        Object.entries(filters).forEach(([key, value]) => {
            if (value !== null && value !== undefined && value !== '') {
                queryParams.append(key, value);
            }
        });
        
        const url = `${backendBase}/procurement/payment-terms/${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
        const response = await authedFetch(url);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Ödeme koşulları yüklenirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching payment terms:', error);
        throw error;
    }
}

export async function getPaymentTerm(paymentTermId) {
    try {
        const response = await authedFetch(`${backendBase}/procurement/payment-terms/${paymentTermId}/`);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Ödeme koşulu yüklenirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching payment term:', error);
        throw error;
    }
}

export async function createPaymentTerm(paymentTermData) {
    try {
        const response = await authedFetch(`${backendBase}/procurement/payment-terms/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(paymentTermData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Ödeme koşulu oluşturulurken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error creating payment term:', error);
        throw error;
    }
}

export async function updatePaymentTerm(paymentTermId, paymentTermData) {
    try {
        const response = await authedFetch(`${backendBase}/procurement/payment-terms/${paymentTermId}/`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(paymentTermData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Ödeme koşulu güncellenirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error updating payment term:', error);
        throw error;
    }
}

export async function deletePaymentTerm(paymentTermId) {
    try {
        const response = await authedFetch(`${backendBase}/procurement/payment-terms/${paymentTermId}/`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Ödeme koşulu silinirken hata oluştu');
        }

        return true; // Successfully deleted
    } catch (error) {
        console.error('Error deleting payment term:', error);
        throw error;
    }
}

export async function togglePaymentTermStatus(paymentTermId) {
    try {
        const response = await authedFetch(`${backendBase}/procurement/payment-terms/${paymentTermId}/toggle_status/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Ödeme koşulu durumu değiştirilirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error toggling payment term status:', error);
        throw error;
    }
}

// Basis Choices API Function
export async function getBasisChoices() {
    try {
        const response = await authedFetch(`${backendBase}/procurement/basis-choices/`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Basis seçenekleri yüklenirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching basis choices:', error);
        throw error;
    }
}

/** @typedef {{ supplier: number, amount: string, note?: string }} DbsPaymentCreatePayload */

/**
 * List DBS payments for a supplier (newest first from API).
 * @param {number|string} supplierId
 * @returns {Promise<Array|{ results: Array }>}
 */
export async function listDbsPayments(supplierId) {
    try {
        const url = `${backendBase}/procurement/dbs-payments/?supplier=${encodeURIComponent(supplierId)}`;
        const response = await authedFetch(url);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || errorData.detail || 'DBS ödemeleri yüklenirken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error listing DBS payments:', error);
        throw error;
    }
}

/**
 * Create a DBS payment.
 * @param {DbsPaymentCreatePayload} payload
 */
export async function createDbsPayment(payload) {
    try {
        const response = await authedFetch(`${backendBase}/procurement/dbs-payments/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || errorData.detail || 'DBS ödemesi oluşturulurken hata oluştu');
        }

        return await response.json();
    } catch (error) {
        console.error('Error creating DBS payment:', error);
        throw error;
    }
}

/**
 * Cancel (delete) a DBS payment; restores used credit on the backend.
 * @param {number|string} paymentId
 */
export async function deleteDbsPayment(paymentId) {
    try {
        const response = await authedFetch(`${backendBase}/procurement/dbs-payments/${paymentId}/`, {
            method: 'DELETE',
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || errorData.detail || 'DBS ödemesi iptal edilirken hata oluştu');
        }

        return true;
    } catch (error) {
        console.error('Error deleting DBS payment:', error);
        throw error;
    }
}
