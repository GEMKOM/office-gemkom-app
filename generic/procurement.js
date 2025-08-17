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

export async function getPurchaseRequests() {
    try {
        const response = await authedFetch(`${backendBase}/procurement/purchase-requests/my_requests/`);
        
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

export async function rejectPurchaseRequest(requestId) {
    try {
        const response = await authedFetch(`${backendBase}/procurement/purchase-requests/${requestId}/reject/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
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

export async function getSuppliers() {
    try {
        const response = await authedFetch(`${backendBase}/procurement/suppliers/`);
        
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

export async function getItems() {
    try {
        const response = await authedFetch(`${backendBase}/procurement/items/`);
        
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
