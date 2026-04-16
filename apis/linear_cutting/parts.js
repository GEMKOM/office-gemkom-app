import { authedFetch } from '../../authService.js';
import { backendBase } from '../../base.js';

const LINEAR_CUTTING_BASE_URL = `${backendBase}/linear_cutting`;

/**
 * List parts for a session
 * GET /linear_cutting/parts/?session=LC-0001
 * @param {string} sessionKey
 */
export async function listLinearCuttingParts(sessionKey) {
    const qs = new URLSearchParams({ session: sessionKey }).toString();
    const res = await authedFetch(`${LINEAR_CUTTING_BASE_URL}/parts/?${qs}`);
    if (!res.ok) {
        throw new Error(`Failed to fetch parts: ${res.status} ${res.statusText}`);
    }
    return await res.json();
}

/**
 * Create part
 * POST /linear_cutting/parts/
 * @param {Object} payload
 */
export async function createLinearCuttingPart(payload) {
    const res = await authedFetch(`${LINEAR_CUTTING_BASE_URL}/parts/`, {
        method: 'POST',
        body: JSON.stringify(payload ?? {})
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`Failed to create part: ${res.status} ${res.statusText} - ${JSON.stringify(err)}`);
    }
    return await res.json();
}

/**
 * Bulk create parts (all-or-nothing)
 * POST /linear_cutting/parts/  with JSON array body
 * @param {Array<Object>} payloadArray
 */
export async function createLinearCuttingPartsBulk(payloadArray) {
    const res = await authedFetch(`${LINEAR_CUTTING_BASE_URL}/parts/`, {
        method: 'POST',
        body: JSON.stringify(Array.isArray(payloadArray) ? payloadArray : [])
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`Failed to bulk create parts: ${res.status} ${res.statusText} - ${JSON.stringify(err)}`);
    }
    return await res.json();
}

/**
 * Patch part
 * PATCH /linear_cutting/parts/{id}/
 * @param {number|string} partId
 * @param {Object} patch
 */
export async function patchLinearCuttingPart(partId, patch) {
    const res = await authedFetch(`${LINEAR_CUTTING_BASE_URL}/parts/${encodeURIComponent(partId)}/`, {
        method: 'PATCH',
        body: JSON.stringify(patch ?? {})
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`Failed to update part: ${res.status} ${res.statusText} - ${JSON.stringify(err)}`);
    }
    return await res.json();
}

/**
 * Delete part
 * DELETE /linear_cutting/parts/{id}/
 * @param {number|string} partId
 */
export async function deleteLinearCuttingPart(partId) {
    const res = await authedFetch(`${LINEAR_CUTTING_BASE_URL}/parts/${encodeURIComponent(partId)}/`, {
        method: 'DELETE'
    });
    if (!res.ok) {
        throw new Error(`Failed to delete part: ${res.status} ${res.statusText}`);
    }
    return true;
}

