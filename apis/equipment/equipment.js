import { authedFetch } from '../../authService.js';
import { backendBase } from '../../base.js';

const EQUIPMENT_BASE_URL = `${backendBase}/equipment`;

function toSearchParams(params = undefined) {
    if (!params) return '';
    const searchParams = params instanceof URLSearchParams ? params : new URLSearchParams(params);
    const qs = searchParams.toString();
    return qs ? `?${qs}` : '';
}

async function safeParseJson(res) {
    try {
        return await res.json();
    } catch (_) {
        return null;
    }
}

/**
 * List all equipment items / create item (admin)
 * GET  /equipment/items/
 * POST /equipment/items/
 * @param {URLSearchParams|Object} [params] - for GET filters (e.g. { asset_type: 'instrument', is_active: 'true' })
 * @param {Object} [payload] - for POST body
 */
export async function listEquipmentItems(params = undefined) {
    const query = toSearchParams(params);
    const res = await authedFetch(`${EQUIPMENT_BASE_URL}/items/${query}`);
    if (!res.ok) {
        const err = await safeParseJson(res);
        throw new Error(`Failed to list equipment items: ${res.status} ${res.statusText}${err ? ` - ${JSON.stringify(err)}` : ''}`);
    }
    return await res.json();
}

export async function createEquipmentItem(payload) {
    const res = await authedFetch(`${EQUIPMENT_BASE_URL}/items/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload ?? {})
    });
    if (!res.ok) {
        const err = await safeParseJson(res);
        throw new Error(`Failed to create equipment item: ${res.status} ${res.statusText}${err ? ` - ${JSON.stringify(err)}` : ''}`);
    }
    return await res.json();
}

/**
 * Item detail / update (admin)
 * GET   /equipment/items/{id}/
 * PUT   /equipment/items/{id}/
 * PATCH /equipment/items/{id}/
 */
export async function getEquipmentItem(id) {
    const res = await authedFetch(`${EQUIPMENT_BASE_URL}/items/${encodeURIComponent(id)}/`);
    if (!res.ok) {
        const err = await safeParseJson(res);
        throw new Error(`Failed to fetch equipment item: ${res.status} ${res.statusText}${err ? ` - ${JSON.stringify(err)}` : ''}`);
    }
    return await res.json();
}

export async function putEquipmentItem(id, payload) {
    const res = await authedFetch(`${EQUIPMENT_BASE_URL}/items/${encodeURIComponent(id)}/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload ?? {})
    });
    if (!res.ok) {
        const err = await safeParseJson(res);
        throw new Error(`Failed to update equipment item (PUT): ${res.status} ${res.statusText}${err ? ` - ${JSON.stringify(err)}` : ''}`);
    }
    return await res.json();
}

export async function patchEquipmentItem(id, payload) {
    const res = await authedFetch(`${EQUIPMENT_BASE_URL}/items/${encodeURIComponent(id)}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload ?? {})
    });
    if (!res.ok) {
        const err = await safeParseJson(res);
        throw new Error(`Failed to update equipment item (PATCH): ${res.status} ${res.statusText}${err ? ` - ${JSON.stringify(err)}` : ''}`);
    }
    return await res.json();
}

/**
 * Soft delete — sets is_active=false (admin)
 * DELETE /equipment/items/{id}/
 */
export async function deleteEquipmentItem(id) {
    const res = await authedFetch(`${EQUIPMENT_BASE_URL}/items/${encodeURIComponent(id)}/`, {
        method: 'DELETE'
    });
    if (!res.ok) {
        const err = await safeParseJson(res);
        throw new Error(`Failed to delete equipment item: ${res.status} ${res.statusText}${err ? ` - ${JSON.stringify(err)}` : ''}`);
    }
    // Some DELETE endpoints return a body, some don't.
    return (await safeParseJson(res)) ?? { ok: true };
}

/**
 * All checkouts for an item
 * GET /equipment/items/{id}/checkouts/
 */
export async function listEquipmentItemCheckouts(itemId, params = undefined) {
    const query = toSearchParams(params);
    const res = await authedFetch(`${EQUIPMENT_BASE_URL}/items/${encodeURIComponent(itemId)}/checkouts/${query}`);
    if (!res.ok) {
        const err = await safeParseJson(res);
        throw new Error(`Failed to list item checkouts: ${res.status} ${res.statusText}${err ? ` - ${JSON.stringify(err)}` : ''}`);
    }
    return await res.json();
}

/**
 * Check out equipment (validates available quantity)
 * POST /equipment/checkouts/
 */
export async function createEquipmentCheckout(payload) {
    const res = await authedFetch(`${EQUIPMENT_BASE_URL}/checkouts/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload ?? {})
    });
    if (!res.ok) {
        const err = await safeParseJson(res);
        throw new Error(`Failed to create checkout: ${res.status} ${res.statusText}${err ? ` - ${JSON.stringify(err)}` : ''}`);
    }
    return await res.json();
}

/**
 * List checkouts with filters
 * GET /equipment/checkouts/?is_returned=false
 */
export async function listEquipmentCheckouts(params = undefined) {
    const query = toSearchParams(params);
    const res = await authedFetch(`${EQUIPMENT_BASE_URL}/checkouts/${query}`);
    if (!res.ok) {
        const err = await safeParseJson(res);
        throw new Error(`Failed to list checkouts: ${res.status} ${res.statusText}${err ? ` - ${JSON.stringify(err)}` : ''}`);
    }
    return await res.json();
}

/**
 * Current user's open checkouts
 * GET /equipment/checkouts/my/
 */
export async function listMyOpenEquipmentCheckouts(params = undefined) {
    const query = toSearchParams(params);
    const res = await authedFetch(`${EQUIPMENT_BASE_URL}/checkouts/my/${query}`);
    if (!res.ok) {
        const err = await safeParseJson(res);
        throw new Error(`Failed to list my checkouts: ${res.status} ${res.statusText}${err ? ` - ${JSON.stringify(err)}` : ''}`);
    }
    return await res.json();
}

/**
 * Return equipment
 * POST /equipment/checkouts/{id}/return/
 */
export async function returnEquipmentCheckout(checkoutId, payload = undefined) {
    const res = await authedFetch(`${EQUIPMENT_BASE_URL}/checkouts/${encodeURIComponent(checkoutId)}/return/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload ?? {})
    });
    if (!res.ok) {
        const err = await safeParseJson(res);
        throw new Error(`Failed to return checkout: ${res.status} ${res.statusText}${err ? ` - ${JSON.stringify(err)}` : ''}`);
    }
    return await res.json();
}

