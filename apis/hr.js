import { backendBase } from "../base.js";
import { extractResultsFromResponse } from "./paginationHelper.js";
import { authedFetch } from "../authService.js";

/**
 * HR API Service
 * Handles all HR-related API requests using authedFetch
 * 
 * Based on Django REST Framework endpoints:
 * - GET /wages/                    (list wage rates)
 * - POST /wages/                   (create wage rate)
 * - GET /wages/{id}/               (get wage rate detail)
 * - PATCH /wages/{id}/             (update wage rate)
 * - DELETE /wages/{id}/            (delete wage rate)
 */

// ===== Wage Rate Functions =====

/**
 * Fetch wage rates with optional filtering
 * @param {Object} filters - Filter parameters
 * @param {string} filters.user - Filter by user (username or ID)
 * @param {boolean} filters.current - Get only current wage rates (true/false)
 * @param {string} filters.ordering - Ordering field (e.g., '-effective_from', 'user__username')
 * @param {number} filters.page - Page number for pagination
 * @param {number} filters.page_size - Page size for pagination
 * @returns {Promise<Object>} Response with wage rates
 */
export async function fetchWageRates(filters = {}) {
    const params = new URLSearchParams();
    
    // Add filters to query parameters
    Object.keys(filters).forEach(key => {
        if (filters[key] !== null && filters[key] !== undefined && filters[key] !== '') {
            params.append(key, filters[key]);
        }
    });

    const url = `${backendBase}/users/wages/?${params.toString()}`;
    const resp = await authedFetch(url);
    
    if (!resp.ok) {
        const errorData = await resp.json();
        throw new Error(errorData.detail || errorData.message || 'Ücret oranları yüklenirken hata oluştu');
    }
    
    const data = await resp.json();
    return data;
}

/**
 * Fetch a single wage rate by ID
 * @param {number} wageRateId - Wage rate ID
 * @returns {Promise<Object>} Wage rate details
 */
export async function fetchWageRate(wageRateId) {
    const url = `${backendBase}/users/wages/${wageRateId}/`;
    const resp = await authedFetch(url);
    
    if (!resp.ok) {
        const errorData = await resp.json();
        throw new Error(errorData.detail || errorData.message || 'Ücret oranı yüklenirken hata oluştu');
    }
    
    const data = await resp.json();
    return data;
}

/**
 * Fetch wage rates by User ID
 * @param {number} userId - User ID
 * @returns {Promise<Object>} Wage rate details
 */
export async function fetchWageRatesForUser(userId) {
    const url = `${backendBase}/users/${userId}/wages/`;
    const resp = await authedFetch(url);
    
    if (!resp.ok) {
        const errorData = await resp.json();
        throw new Error(errorData.detail || errorData.message || 'Ücret oranı yüklenirken hata oluştu');
    }
    
    const data = await resp.json();
    return data;
}

/**
 * Create a new wage rate
 * @param {Object} wageData - Wage rate data
 * @param {number} wageData.user - User ID
 * @param {string} wageData.effective_from - Effective date (YYYY-MM-DD)
 * @param {string} wageData.currency - Currency code (TRY, USD, EUR)
 * @param {number} wageData.base_monthly - Base monthly rate
 * @param {number} wageData.base_hourly - Base hourly rate
 * @param {number} wageData.after_hours_multiplier - After hours multiplier (default: 1.5)
 * @param {number} wageData.sunday_multiplier - Sunday multiplier (default: 2.0)
 * @param {string} wageData.note - Note (optional)
 * @returns {Promise<Object>} Created wage rate
 */
export async function createWageRate(wageData) {
    const url = `${backendBase}/users/wages/`;
    const resp = await authedFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(wageData)
    });
    
    if (!resp.ok) {
        const errorData = await resp.json();
        const errorMessage = errorData.detail || errorData.message || 'Ücret oranı oluşturulurken hata oluştu';
        const error = new Error(Array.isArray(errorMessage) ? errorMessage.join(', ') : errorMessage);
        error.response = errorData;
        throw error;
    }
    
    const data = await resp.json();
    return data;
}

/**
 * Update an existing wage rate
 * @param {number} wageRateId - Wage rate ID
 * @param {Object} updateData - Data to update
 * @returns {Promise<Object>} Updated wage rate
 */
export async function updateWageRate(wageRateId, updateData) {
    const url = `${backendBase}/users/wages/${wageRateId}/`;
    const resp = await authedFetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
    });
    
    if (!resp.ok) {
        const errorData = await resp.json();
        const errorMessage = errorData.detail || errorData.message || 'Ücret oranı güncellenirken hata oluştu';
        const error = new Error(Array.isArray(errorMessage) ? errorMessage.join(', ') : errorMessage);
        error.response = errorData;
        throw error;
    }
    
    const data = await resp.json();
    return data;
}

/**
 * Delete a wage rate
 * @param {number} wageRateId - Wage rate ID
 * @returns {Promise<Object>} Response indicating success/failure
 */
export async function deleteWageRate(wageRateId) {
    const url = `${backendBase}/users/wages/${wageRateId}/`;
    const resp = await authedFetch(url, {
        method: 'DELETE'
    });
    
    if (!resp.ok) {
        const errorData = await resp.json();
        throw new Error(errorData.detail || errorData.message || 'Ücret oranı silinirken hata oluştu');
    }
    
    return { success: true };
}

// ===== Utility Functions =====

/**
 * Get current wage rates for all users
 * @returns {Promise<Array>} Array of current wage rates
 */
export async function fetchCurrentWageRates() {
    return await fetchWageRates({ current: true });
}

/**
 * Get wage rate history for a specific user
 * @param {string|number} userId - User ID or username
 * @returns {Promise<Array>} Array of wage rates for the user
 */
export async function fetchUserWageHistory(userId) {
    return await fetchWageRates({ user: userId, ordering: '-effective_from' });
}

/**
 * Get current wage rate for a specific user
 * @param {string|number} userId - User ID or username
 * @returns {Promise<Object|null>} Current wage rate or null if not found
 */
export async function fetchUserCurrentWage(userId) {
    const response = await fetchWageRates({ user: userId, current: true });
    const results = response.results || response;
    return results.length > 0 ? results[0] : null;
}

/**
 * Validate wage rate data before submission
 * @param {Object} wageData - Wage rate data
 * @returns {Object} Validation result with isValid boolean and errors array
 */
export function validateWageRate(wageData) {
    const errors = [];

    // Check required fields
    if (!wageData.user) {
        errors.push('Kullanıcı seçimi gereklidir');
    }
    if (!wageData.effective_from) {
        errors.push('Geçerlilik tarihi gereklidir');
    }
    if (!wageData.currency) {
        errors.push('Para birimi gereklidir');
    }
    if (!wageData.base_monthly || wageData.base_monthly <= 0) {
        errors.push('Aylık ücret 0\'dan büyük olmalıdır');
    }
    if (!wageData.base_hourly || wageData.base_hourly <= 0) {
        errors.push('Saatlik ücret 0\'dan büyük olmalıdır');
    }

    // Check date logic
    if (wageData.effective_from) {
        const effectiveDate = new Date(wageData.effective_from);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (effectiveDate < today) {
            errors.push('Geçerlilik tarihi bugünden önce olamaz');
        }
    }

    // Check multipliers
    if (wageData.after_hours_multiplier && wageData.after_hours_multiplier <= 0) {
        errors.push('Mesai saati çarpanı 0\'dan büyük olmalıdır');
    }
    if (wageData.sunday_multiplier && wageData.sunday_multiplier <= 0) {
        errors.push('Pazar günü çarpanı 0\'dan büyük olmalıdır');
    }

    return {
        isValid: errors.length === 0,
        errors: errors
    };
}

/**
 * Format currency for display
 * @param {number} amount - Amount to format
 * @param {string} currency - Currency code
 * @returns {string} Formatted currency string
 */
export function formatCurrency(amount, currency = 'TRY') {
    if (!amount || amount <= 0) return '0,00 ₺';
    
    const formatter = new Intl.NumberFormat('tr-TR', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
    
    return formatter.format(amount);
}

/**
 * Get currency display information
 * @param {string} currency - Currency code
 * @returns {Object} Currency display configuration
 */
export function getCurrencyInfo(currency) {
    const currencyMap = {
        'TRY': {
            symbol: '₺',
            name: 'Türk Lirası',
            code: 'TRY'
        },
        'USD': {
            symbol: '$',
            name: 'Amerikan Doları',
            code: 'USD'
        },
        'EUR': {
            symbol: '€',
            name: 'Euro',
            code: 'EUR'
        }
    };

    return currencyMap[currency] || {
        symbol: currency,
        name: currency,
        code: currency
    };
}

/**
 * Calculate effective wage for a specific date
 * @param {Array} wageRates - Array of wage rates
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Object|null} Effective wage rate for the date
 */
export function getEffectiveWageForDate(wageRates, date) {
    const targetDate = new Date(date);
    
    // Filter wage rates that are effective on or before the target date
    const effectiveRates = wageRates.filter(rate => {
        const effectiveDate = new Date(rate.effective_from);
        return effectiveDate <= targetDate;
    });
    
    if (effectiveRates.length === 0) return null;
    
    // Sort by effective_from descending to get the most recent
    effectiveRates.sort((a, b) => new Date(b.effective_from) - new Date(a.effective_from));
    
    return effectiveRates[0];
}

/**
 * Get wage rate status information
 * @param {Object} wageRate - Wage rate object
 * @returns {Object} Status display configuration
 */
export function getWageRateStatusInfo(wageRate) {
    const today = new Date();
    const effectiveDate = new Date(wageRate.effective_from);
    
    if (effectiveDate > today) {
        return {
            label: 'Gelecekte Geçerli',
            class: 'status-future',
            icon: 'fas fa-clock',
            color: 'info'
        };
    } else {
        return {
            label: 'Aktif',
            class: 'status-active',
            icon: 'fas fa-check-circle',
            color: 'success'
        };
    }
}
