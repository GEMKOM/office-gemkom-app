import { authedFetch } from '../authService.js';
import { backendBase } from '../base.js';

// ============================================================
// Vinç / Platform Kiralama Talepleri API
// Backend: /cranes/requests/, /cranes/crane-types/, /cranes/rates/
// ============================================================

async function parseError(response, fallback) {
    const errorData = await response.json().catch(() => ({}));
    // DRF validation errors can be {field: [msgs]} — surface the first message.
    if (errorData.detail || errorData.error) {
        return new Error(errorData.detail || errorData.error);
    }
    const firstKey = Object.keys(errorData)[0];
    if (firstKey) {
        const val = errorData[firstKey];
        const msg = Array.isArray(val) ? val[0] : val;
        if (typeof msg === 'string') {
            return new Error(msg);
        }
    }
    return new Error(fallback);
}

function buildQuery(filters = {}) {
    const queryParams = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') {
            queryParams.append(key, value);
        }
    });
    return queryParams.toString() ? '?' + queryParams.toString() : '';
}

// ---------------- Requests ----------------

export async function getCraneRequests(filters = {}) {
    const response = await authedFetch(`${backendBase}/cranes/requests/${buildQuery(filters)}`);
    if (!response.ok) {
        throw await parseError(response, 'Vinç talepleri yüklenirken hata oluştu');
    }
    return await response.json();
}

export async function getCraneRequest(requestId) {
    const response = await authedFetch(`${backendBase}/cranes/requests/${requestId}/`);
    if (!response.ok) {
        throw await parseError(response, 'Vinç talebi yüklenirken hata oluştu');
    }
    return await response.json();
}

export async function getMyCraneRequests(filters = {}) {
    const response = await authedFetch(`${backendBase}/cranes/requests/my_requests/${buildQuery(filters)}`);
    if (!response.ok) {
        throw await parseError(response, 'Talepleriniz yüklenirken hata oluştu');
    }
    return await response.json();
}

export async function getPendingApprovalCraneRequests(filters = {}) {
    const response = await authedFetch(`${backendBase}/cranes/requests/pending_approval/${buildQuery(filters)}`);
    if (!response.ok) {
        throw await parseError(response, 'Onay bekleyen talepler yüklenirken hata oluştu');
    }
    return await response.json();
}

/**
 * Create a new crane/platform rental request (auto-submits for approval).
 * @param {Object} requestData
 * @param {number} requestData.crane_type - CraneType id (required)
 * @param {string} requestData.pricing_option - 'up_to_3h' | 'up_to_8h' | 'daily' (required)
 * @param {string} requestData.job_no - Job order no (required)
 * @param {number} [requestData.days] - Day count for daily pricing
 * @param {boolean} [requestData.needs_rigger] - Extra rigger (sapancı)
 * @param {string} [requestData.needed_date] - YYYY-MM-DD
 * @param {string} [requestData.needed_time] - HH:MM
 * @param {string} [requestData.location]
 * @param {string} [requestData.description]
 * @param {string} [requestData.priority]
 * @param {Array<File>} [requestData.files]
 */
export async function createCraneRequest(requestData) {
    const formData = new FormData();
    const fields = [
        'crane_type', 'pricing_option', 'job_no', 'days', 'needs_rigger',
        'needed_date', 'needed_time', 'location', 'description', 'priority',
    ];
    fields.forEach((field) => {
        const value = requestData[field];
        if (value !== undefined && value !== null && value !== '') {
            formData.append(field, value);
        }
    });
    if (requestData.files && requestData.files.length > 0) {
        requestData.files.forEach(file => formData.append('files', file));
    }

    const response = await authedFetch(`${backendBase}/cranes/requests/`, {
        method: 'POST',
        body: formData
    });
    if (!response.ok) {
        throw await parseError(response, 'Vinç talebi oluşturulurken hata oluştu');
    }
    return await response.json();
}

export async function approveCraneRequest(requestId, comment = '') {
    const response = await authedFetch(`${backendBase}/cranes/requests/${requestId}/approve/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment })
    });
    if (!response.ok) {
        throw await parseError(response, 'Talep onaylanırken hata oluştu');
    }
    return await response.json();
}

export async function rejectCraneRequest(requestId, comment = '') {
    const response = await authedFetch(`${backendBase}/cranes/requests/${requestId}/reject/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment })
    });
    if (!response.ok) {
        throw await parseError(response, 'Talep reddedilirken hata oluştu');
    }
    return await response.json();
}

export async function cancelCraneRequest(requestId) {
    const response = await authedFetch(`${backendBase}/cranes/requests/${requestId}/cancel/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
    });
    if (!response.ok) {
        throw await parseError(response, 'Talep iptal edilirken hata oluştu');
    }
    return await response.json();
}

/**
 * Record actuals and complete an approved request (coordination team).
 * The actual cost flows into the job cost summary.
 */
export async function completeCraneRequest(requestId, { actual_quantity, actual_cost, actual_cost_currency = 'TRY' }) {
    const response = await authedFetch(`${backendBase}/cranes/requests/${requestId}/complete/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actual_quantity, actual_cost, actual_cost_currency })
    });
    if (!response.ok) {
        throw await parseError(response, 'Talep tamamlanırken hata oluştu');
    }
    return await response.json();
}

/** User-level UI flags: { can_complete, can_manage_prices } */
export async function getCraneMyPermissions() {
    const response = await authedFetch(`${backendBase}/cranes/requests/my_permissions/`);
    if (!response.ok) {
        throw await parseError(response, 'Yetkiler yüklenirken hata oluştu');
    }
    return await response.json();
}

// ---------------- Catalog / price list ----------------

export async function getCraneTypes(filters = {}) {
    const response = await authedFetch(`${backendBase}/cranes/crane-types/${buildQuery(filters)}`);
    if (!response.ok) {
        throw await parseError(response, 'Vinç tipleri yüklenirken hata oluştu');
    }
    return await response.json();
}

export async function getCraneRates(filters = {}) {
    const response = await authedFetch(`${backendBase}/cranes/rates/${buildQuery(filters)}`);
    if (!response.ok) {
        throw await parseError(response, 'Fiyatlar yüklenirken hata oluştu');
    }
    return await response.json();
}

/** Create a NEW effective-dated rate row for a crane type (history is immutable). */
export async function createCraneRate(rateData) {
    const response = await authedFetch(`${backendBase}/cranes/rates/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rateData)
    });
    if (!response.ok) {
        throw await parseError(response, 'Fiyat kaydedilirken hata oluştu');
    }
    return await response.json();
}

export async function updateCraneType(craneTypeId, data) {
    const response = await authedFetch(`${backendBase}/cranes/crane-types/${craneTypeId}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!response.ok) {
        throw await parseError(response, 'Vinç tipi güncellenirken hata oluştu');
    }
    return await response.json();
}

export async function createCraneType(data) {
    const response = await authedFetch(`${backendBase}/cranes/crane-types/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!response.ok) {
        throw await parseError(response, 'Vinç tipi oluşturulurken hata oluştu');
    }
    return await response.json();
}

// ---------------- UI helpers ----------------

export function getCraneStatusInfo(status) {
    const statusMap = {
        'submitted': { label: 'Onay Bekliyor', class: 'status-yellow', icon: 'fas fa-clock', color: 'warning' },
        'approved':  { label: 'Onaylandı',     class: 'status-blue',   icon: 'fas fa-check', color: 'primary' },
        'rejected':  { label: 'Reddedildi',    class: 'status-red',    icon: 'fas fa-times', color: 'danger' },
        'cancelled': { label: 'İptal Edildi',  class: 'status-grey',   icon: 'fas fa-ban', color: 'secondary' },
        'completed': { label: 'Tamamlandı',    class: 'status-green',  icon: 'fas fa-flag-checkered', color: 'success' },
    };
    return statusMap[status] || { label: status || '—', class: 'status-grey', icon: 'fas fa-question', color: 'secondary' };
}

export const PRICING_OPTION_LABELS = {
    'up_to_3h': '3 Saate Kadar',
    'up_to_8h': '8 Saate Kadar',
    'daily': 'Günlük',
};

export const CRANE_CATEGORY_LABELS = {
    'basket_crane': 'Sepetli Vinç',
    'truck_crane': 'Kamyon Üstü Vinç',
    'mobile_crane': 'Mobil Vinç',
    'scissor_platform': 'Makaslı Platform',
    'articulated_platform': 'Eklemli Platform',
};

export const PLATFORM_CATEGORIES = ['scissor_platform', 'articulated_platform'];

/**
 * Client-side estimate for live display while filling the form.
 * The server snapshot (computed at create) is authoritative.
 * @returns {{total: number, currency: string, lines: Array<{label: string, amount: number}>}|null}
 */
export function computeCraneEstimate(craneType, pricingOption, days = 1, needsRigger = false) {
    const rate = craneType?.current_rate;
    if (!rate || !pricingOption) return null;

    const lines = [];
    let base = null;
    if (pricingOption === 'up_to_3h' && rate.price_up_to_3h != null) {
        base = parseFloat(rate.price_up_to_3h);
        lines.push({ label: '3 saate kadar', amount: base });
    } else if (pricingOption === 'up_to_8h' && rate.price_up_to_8h != null) {
        base = parseFloat(rate.price_up_to_8h);
        lines.push({ label: '8 saate kadar', amount: base });
    } else if (pricingOption === 'daily' && rate.price_per_day != null) {
        const dayCount = Math.max(parseInt(days, 10) || 1, 1);
        base = parseFloat(rate.price_per_day) * dayCount;
        lines.push({ label: `Günlük × ${dayCount}`, amount: base });
    }
    if (base === null) return null;

    let total = base;
    if (pricingOption === 'daily' && rate.transport_fee != null) {
        const transport = parseFloat(rate.transport_fee);
        total += transport;
        lines.push({ label: 'Nakliye (gidiş-dönüş)', amount: transport });
    }
    if (needsRigger && rate.rigger_fee != null) {
        const rigger = parseFloat(rate.rigger_fee);
        total += rigger;
        lines.push({ label: 'İlave sapancı', amount: rigger });
    }
    return { total, currency: rate.currency || 'TRY', lines };
}
