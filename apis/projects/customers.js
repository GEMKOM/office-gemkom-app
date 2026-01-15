import { authedFetch } from '../../authService.js';
import { backendBase } from '../../base.js';
import { extractResultsFromResponse } from '../paginationHelper.js';

/**
 * Customer API Service
 * Handles all customer related API requests
 * Base URL: /projects/customers/
 */

/**
 * List customers with optional filters and pagination
 * @param {Object} options - Query parameters
 * @param {string} options.search - Search in code, name, short_name, contact_person, email
 * @param {boolean} options.is_active - Filter by active status (true/false)
 * @param {string} options.default_currency - Filter by currency (TRY, USD, EUR, GBP)
 * @param {boolean} options.show_inactive - Include inactive customers (default: false)
 * @param {string} options.ordering - Sort by field: code, name, created_at, updated_at, -name for desc
 * @param {number} options.page - Page number for pagination
 * @returns {Promise<Object>} Paginated response with count, next, previous, and results
 */
export async function listCustomers(options = {}) {
    try {
        const queryParams = new URLSearchParams();
        
        // Add query parameters if provided
        if (options.search) {
            queryParams.append('search', options.search);
        }
        if (options.is_active !== undefined && options.is_active !== null) {
            queryParams.append('is_active', options.is_active.toString());
        }
        if (options.default_currency) {
            queryParams.append('default_currency', options.default_currency);
        }
        if (options.show_inactive !== undefined) {
            queryParams.append('show_inactive', options.show_inactive.toString());
        }
        if (options.ordering) {
            queryParams.append('ordering', options.ordering);
        }
        if (options.page) {
            queryParams.append('page', options.page.toString());
        }

        const url = `${backendBase}/projects/customers/${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
        const response = await authedFetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error listing customers:', error);
        throw error;
    }
}

/**
 * Get customer detail by ID
 * @param {string|number} customerId - Customer ID
 * @returns {Promise<Object>} Customer detail object
 */
export async function getCustomerById(customerId) {
    try {
        const response = await authedFetch(`${backendBase}/projects/customers/${customerId}/`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error fetching customer ${customerId}:`, error);
        throw error;
    }
}

/**
 * Create a new customer
 * @param {Object} customerData - Customer data
 * @param {string} customerData.code - Unique customer code (required)
 * @param {string} customerData.name - Full company name (required)
 * @param {string} [customerData.short_name] - Short display name
 * @param {string} [customerData.contact_person] - Primary contact name
 * @param {string} [customerData.phone] - Phone number
 * @param {string} [customerData.email] - Email (validated)
 * @param {string} [customerData.address] - Full address
 * @param {string} [customerData.tax_id] - Tax identification number
 * @param {string} [customerData.tax_office] - Tax office name
 * @param {string} [customerData.default_currency] - One of: TRY, USD, EUR, GBP (default: "TRY")
 * @param {boolean} [customerData.is_active] - Active status (default: true)
 * @param {string} [customerData.notes] - Internal notes
 * @returns {Promise<Object>} Created customer detail object
 */
export async function createCustomer(customerData) {
    try {
        const response = await authedFetch(`${backendBase}/projects/customers/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(customerData)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(JSON.stringify(errorData) || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error creating customer:', error);
        throw error;
    }
}

/**
 * Update customer (full update - PUT)
 * @param {string|number} customerId - Customer ID
 * @param {Object} customerData - Complete customer data
 * @returns {Promise<Object>} Updated customer detail object
 */
export async function updateCustomer(customerId, customerData) {
    try {
        const response = await authedFetch(`${backendBase}/projects/customers/${customerId}/`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(customerData)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(JSON.stringify(errorData) || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error updating customer ${customerId}:`, error);
        throw error;
    }
}

/**
 * Partially update customer (PATCH)
 * @param {string|number} customerId - Customer ID
 * @param {Object} customerData - Partial customer data
 * @returns {Promise<Object>} Updated customer detail object
 */
export async function patchCustomer(customerId, customerData) {
    try {
        const response = await authedFetch(`${backendBase}/projects/customers/${customerId}/`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(customerData)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(JSON.stringify(errorData) || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error patching customer ${customerId}:`, error);
        throw error;
    }
}

/**
 * Delete customer by ID
 * @param {string|number} customerId - Customer ID
 * @returns {Promise<void>} Resolves if deletion successful
 */
export async function deleteCustomer(customerId) {
    try {
        const response = await authedFetch(`${backendBase}/projects/customers/${customerId}/`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            let detail = '';
            try {
                const err = await response.json();
                detail = err?.detail || '';
            } catch (_) {}
            throw new Error(detail || `HTTP error! status: ${response.status}`);
        }
        return;
    } catch (error) {
        console.error(`Error deleting customer ${customerId}:`, error);
        throw error;
    }
}

/**
 * Search customers by search term
 * @param {string} searchTerm - Search term for code, name, short_name, contact_person, email
 * @param {Object} additionalOptions - Additional query parameters
 * @returns {Promise<Object>} Paginated response with matching customers
 */
export async function searchCustomers(searchTerm, additionalOptions = {}) {
    return listCustomers({ ...additionalOptions, search: searchTerm });
}

/**
 * Get active customers only
 * @param {Object} additionalOptions - Additional query parameters
 * @returns {Promise<Object>} Paginated response with active customers
 */
export async function getActiveCustomers(additionalOptions = {}) {
    return listCustomers({ ...additionalOptions, is_active: true });
}

/**
 * Get customers by currency
 * @param {string} currency - Currency code (TRY, USD, EUR, GBP)
 * @param {Object} additionalOptions - Additional query parameters
 * @returns {Promise<Object>} Paginated response with customers filtered by currency
 */
export async function getCustomersByCurrency(currency, additionalOptions = {}) {
    return listCustomers({ ...additionalOptions, default_currency: currency });
}

/**
 * Get all customers including inactive ones
 * @param {Object} additionalOptions - Additional query parameters
 * @returns {Promise<Object>} Paginated response with all customers
 */
export async function getAllCustomers(additionalOptions = {}) {
    return listCustomers({ ...additionalOptions, show_inactive: true });
}

/**
 * Currency options for customer forms
 */
export const CURRENCY_OPTIONS = [
    { value: 'TRY', label: 'Türk Lirası' },
    { value: 'USD', label: 'Amerikan Doları' },
    { value: 'EUR', label: 'Euro' },
    { value: 'GBP', label: 'İngiliz Sterlini' },
];
