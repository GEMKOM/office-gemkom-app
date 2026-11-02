import { backendBase } from "../../base.js";
import { authedFetch } from "../../authService.js";

/**
 * Price Tier Template API
 * Reusable price tier sets for the Ağırlık ve Fiyat Kademeleri modal. Each
 * item carries a share of the job weight (weight_share_pct) instead of kg.
 *
 * - GET    /subcontracting/price-tier-templates/          (list, ?is_active=true|false)
 * - POST   /subcontracting/price-tier-templates/          (create, with items)
 * - PATCH  /subcontracting/price-tier-templates/{id}/     (update; items replace the list)
 * - DELETE /subcontracting/price-tier-templates/{id}/
 *
 * Errors carry the response body as `error.data`.
 */

async function request(url, options = {}) {
    const resp = await authedFetch(url, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    if (resp.status === 204) return null;
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
        const firstError = Object.values(data).flat().find((v) => typeof v === 'string');
        const error = new Error(data.detail || data.message || firstError || `HTTP error! status: ${resp.status}`);
        error.data = data;
        error.status = resp.status;
        throw error;
    }
    return data;
}

export async function listPriceTierTemplates(filters = {}) {
    const params = new URLSearchParams();
    if (filters.is_active !== undefined && filters.is_active !== null) {
        params.append('is_active', String(filters.is_active));
    }
    const data = await request(`${backendBase}/subcontracting/price-tier-templates/?${params.toString()}`);
    return Array.isArray(data) ? data : (data.results || []);
}

export async function createPriceTierTemplate(templateData) {
    return request(`${backendBase}/subcontracting/price-tier-templates/`, {
        method: 'POST',
        body: JSON.stringify(templateData)
    });
}

export async function updatePriceTierTemplate(templateId, templateData) {
    return request(`${backendBase}/subcontracting/price-tier-templates/${templateId}/`, {
        method: 'PATCH',
        body: JSON.stringify(templateData)
    });
}

export async function deletePriceTierTemplate(templateId) {
    return request(`${backendBase}/subcontracting/price-tier-templates/${templateId}/`, {
        method: 'DELETE'
    });
}
