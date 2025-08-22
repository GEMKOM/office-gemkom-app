import { authedFetch } from '../authService.js';
import { backendBase } from '../base.js';

/**
 * Purchase Orders API Service
 * Handles all purchase order related API requests
 */

/**
 * Get all purchase orders
 * @param {Object} filters - Optional filters for the request
 * @returns {Promise<Array>} Array of purchase orders
 */
export async function getPurchaseOrders(filters = {}) {
    try {
        const queryParams = new URLSearchParams();
        
        // Add filters to query parameters
        Object.keys(filters).forEach(key => {
            if (filters[key] !== null && filters[key] !== undefined && filters[key] !== '') {
                queryParams.append(key, filters[key]);
            }
        });

        const url = `${backendBase}/procurement/purchase-orders/${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
        
        const response = await authedFetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching purchase orders:', error);
        throw error;
    }
}

/**
 * Get a specific purchase order by ID
 * @param {string|number} orderId - Purchase order ID
 * @returns {Promise<Object>} Purchase order details
 */
export async function getPurchaseOrderById(orderId) {
    try {
        const response = await authedFetch(`${backendBase}/procurement/purchase-orders/${orderId}/`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error fetching purchase order ${orderId}:`, error);
        throw error;
    }
}

/**
 * Update purchase order status
 * @param {string|number} orderId - Purchase order ID
 * @param {Object} updateData - Data to update
 * @returns {Promise<Object>} Updated purchase order
 */
export async function updatePurchaseOrder(orderId, updateData) {
    try {
        const response = await authedFetch(`${backendBase}/procurement/purchase-orders/${orderId}/`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(updateData)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error updating purchase order ${orderId}:`, error);
        throw error;
    }
}

/**
 * Create invoice from purchase order
 * @param {string|number} orderId - Purchase order ID
 * @param {Object} invoiceData - Invoice data
 * @returns {Promise<Object>} Created invoice
 */
export async function createInvoiceFromPO(orderId, invoiceData) {
    try {
        const response = await authedFetch(`${backendBase}/procurement/purchase-orders/${orderId}/create-invoice/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(invoiceData)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error creating invoice for PO ${orderId}:`, error);
        throw error;
    }
}

/**
 * Get purchase orders by status
 * @param {string} status - Status filter (pending, approved, completed, etc.)
 * @returns {Promise<Array>} Array of purchase orders with specified status
 */
export async function getPurchaseOrdersByStatus(status) {
    return getPurchaseOrders({ status });
}

/**
 * Get purchase orders by supplier
 * @param {string|number} supplierId - Supplier ID
 * @returns {Promise<Array>} Array of purchase orders for the supplier
 */
export async function getPurchaseOrdersBySupplier(supplierId) {
    return getPurchaseOrders({ supplier: supplierId });
}

/**
 * Get purchase orders by date range
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Array>} Array of purchase orders in date range
 */
export async function getPurchaseOrdersByDateRange(startDate, endDate) {
    return getPurchaseOrders({ 
        start_date: startDate, 
        end_date: endDate 
    });
}

/**
 * Export purchase orders to different formats
 * @param {Object} filters - Filters for the export
 * @param {string} format - Export format (csv, excel, pdf)
 * @returns {Promise<Blob>} Exported file blob
 */
export async function exportPurchaseOrders(filters = {}, format = 'excel') {
    try {
        const queryParams = new URLSearchParams();
        
        // Add filters to query parameters
        Object.keys(filters).forEach(key => {
            if (filters[key] !== null && filters[key] !== undefined && filters[key] !== '') {
                queryParams.append(key, filters[key]);
            }
        });
        
        queryParams.append('format', format);

        const url = `${backendBase}/procurement/purchase-orders/export/${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
        
        const response = await authedFetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const blob = await response.blob();
        return blob;
    } catch (error) {
        console.error('Error exporting purchase orders:', error);
        throw error;
    }
}

/**
 * Mark a payment schedule as paid
 * @param {string|number} orderId - Purchase order ID
 * @param {string|number} scheduleId - Payment schedule ID
 * @param {boolean} paidWithTax - Whether the payment includes tax
 * @returns {Promise<Object>} Updated purchase order
 */
export async function markSchedulePaid(orderId, scheduleId, paidWithTax) {
    try {
        const response = await authedFetch(`${backendBase}/procurement/purchase-orders/${orderId}/mark_schedule_paid/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                schedule_id: scheduleId,
                paid_with_tax: paidWithTax
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error marking schedule ${scheduleId} as paid for PO ${orderId}:`, error);
        throw error;
    }
}
