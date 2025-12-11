import { authedFetch } from '../authService.js';
import { backendBase } from '../base.js';

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
            const errorData = await response.json();
            throw new Error(errorData.error || 'Sunucu hatası');
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
            const errorData = await response.json();
            throw new Error(errorData.error || 'Talep gönderilirken hata oluştu');
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
