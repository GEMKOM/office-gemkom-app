import { authedFetch } from '../../authService.js';
import { backendBase } from '../../base.js';

const LINEAR_CUTTING_BASE_URL = `${backendBase}/linear_cutting`;

function toSearchParams(params = undefined) {
    if (!params) return '';
    const searchParams = params instanceof URLSearchParams ? params : new URLSearchParams(params);
    const qs = searchParams.toString();
    return qs ? `?${qs}` : '';
}

/**
 * List sessions (paginated)
 * GET /linear_cutting/sessions/
 * @param {URLSearchParams|Object} [params]
 * @returns {Promise<Object|Array>}
 */
export async function listLinearCuttingSessions(params = undefined) {
    const query = toSearchParams(params);
    const res = await authedFetch(`${LINEAR_CUTTING_BASE_URL}/sessions/${query}`);
    if (!res.ok) {
        throw new Error(`Failed to fetch sessions: ${res.status} ${res.statusText}`);
    }
    return await res.json();
}

/**
 * Get session detail
 * GET /linear_cutting/sessions/{key}/
 * @param {string} sessionKey
 */
export async function getLinearCuttingSession(sessionKey) {
    const res = await authedFetch(`${LINEAR_CUTTING_BASE_URL}/sessions/${encodeURIComponent(sessionKey)}/`);
    if (!res.ok) {
        throw new Error(`Failed to fetch session: ${res.status} ${res.statusText}`);
    }
    return await res.json();
}

/**
 * Create a session
 * POST /linear_cutting/sessions/
 * @param {Object} payload
 */
export async function createLinearCuttingSession(payload) {
    const res = await authedFetch(`${LINEAR_CUTTING_BASE_URL}/sessions/`, {
        method: 'POST',
        body: JSON.stringify(payload ?? {})
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`Failed to create session: ${res.status} ${res.statusText} - ${JSON.stringify(err)}`);
    }
    return await res.json();
}

/**
 * Update session fields
 * PATCH /linear_cutting/sessions/{key}/
 * @param {string} sessionKey
 * @param {Object} patch
 */
export async function patchLinearCuttingSession(sessionKey, patch) {
    const res = await authedFetch(`${LINEAR_CUTTING_BASE_URL}/sessions/${encodeURIComponent(sessionKey)}/`, {
        method: 'PATCH',
        body: JSON.stringify(patch ?? {})
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`Failed to update session: ${res.status} ${res.statusText} - ${JSON.stringify(err)}`);
    }
    return await res.json();
}

/**
 * Run optimizer
 * POST /linear_cutting/sessions/{key}/optimize/
 * @param {string} sessionKey
 * @param {Object} [payload]
 */
export async function optimizeLinearCuttingSession(sessionKey, payload = undefined) {
    const res = await authedFetch(`${LINEAR_CUTTING_BASE_URL}/sessions/${encodeURIComponent(sessionKey)}/optimize/`, {
        method: 'POST',
        body: JSON.stringify(payload ?? {})
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err && err.error) ? err.error : `Optimize failed: ${res.status} ${res.statusText}`);
    }
    return await res.json();
}

/**
 * Confirm (create tasks + planning request)
 * POST /linear_cutting/sessions/{key}/confirm/
 * @param {string} sessionKey
 * @param {Object} [payload]
 */
export async function confirmLinearCuttingSession(sessionKey, payload = undefined) {
    const res = await authedFetch(`${LINEAR_CUTTING_BASE_URL}/sessions/${encodeURIComponent(sessionKey)}/confirm/`, {
        method: 'POST',
        body: JSON.stringify(payload ?? {})
    });
    if (res.status === 409) {
        const err = await res.json().catch(() => ({}));
        const msg = (err && err.error) ? err.error : 'Already confirmed';
        const e = new Error(msg);
        e.status = 409;
        throw e;
    }
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`Confirm failed: ${res.status} ${res.statusText} - ${JSON.stringify(err)}`);
    }
    return await res.json();
}

/**
 * PDF download URL (direct file response)
 * GET /linear_cutting/sessions/{key}/pdf/
 * @param {string} sessionKey
 */
export function getLinearCuttingSessionPdfUrl(sessionKey) {
    return `${LINEAR_CUTTING_BASE_URL}/sessions/${encodeURIComponent(sessionKey)}/pdf/`;
}

/**
 * Download session PDF with auth (Blob)
 * GET /linear_cutting/sessions/{key}/pdf/
 * @param {string} sessionKey
 * @returns {Promise<Blob>}
 */
export async function downloadLinearCuttingSessionPdf(sessionKey) {
    const res = await authedFetch(getLinearCuttingSessionPdfUrl(sessionKey));
    if (!res.ok) {
        throw new Error(`Failed to download PDF: ${res.status} ${res.statusText}`);
    }
    return await res.blob();
}

