import { authedFetch } from '../../authService.js';
import { backendBase } from '../../base.js';

const BASE = `${backendBase}/sales/offer-templates`;

export async function listOfferTemplates(options = {}) {
    const params = new URLSearchParams();
    if (options.search) params.append('search', options.search);
    if (options.show_inactive) params.append('show_inactive', 'true');
    if (options.ordering) params.append('ordering', options.ordering);

    const qs = params.toString();
    const response = await authedFetch(`${BASE}/${qs ? '?' + qs : ''}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

export async function getOfferTemplate(id) {
    const response = await authedFetch(`${BASE}/${id}/`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

export async function getOfferTemplateNodes(id) {
    const response = await authedFetch(`${BASE}/${id}/nodes/`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

export async function createOfferTemplate(data) {
    const response = await authedFetch(`${BASE}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(JSON.stringify(err));
    }
    return response.json();
}

export async function patchOfferTemplate(id, data) {
    const response = await authedFetch(`${BASE}/${id}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(JSON.stringify(err));
    }
    return response.json();
}

export async function createTemplateNode(templateId, data) {
    const response = await authedFetch(`${BASE}/${templateId}/nodes/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(JSON.stringify(err));
    }
    return response.json();
}

export async function patchTemplateNode(templateId, nodeId, data) {
    const response = await authedFetch(`${BASE}/${templateId}/nodes/${nodeId}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(JSON.stringify(err));
    }
    return response.json();
}

export async function deleteTemplateNode(templateId, nodeId) {
    const response = await authedFetch(`${BASE}/${templateId}/nodes/${nodeId}/`, {
        method: 'DELETE'
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(JSON.stringify(err) || `HTTP ${response.status}`);
    }
}
