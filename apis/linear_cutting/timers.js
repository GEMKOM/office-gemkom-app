import { authedFetch } from '../../authService.js';
import { backendBase } from '../../base.js';

const LINEAR_CUTTING_BASE_URL = `${backendBase}/linear_cutting`;

/**
 * Start timer
 * POST /linear_cutting/timers/start/
 * @param {Object} payload
 */
export async function startLinearCuttingTimer(payload) {
    const res = await authedFetch(`${LINEAR_CUTTING_BASE_URL}/timers/start/`, {
        method: 'POST',
        body: JSON.stringify(payload ?? {})
    });
    if (res.status === 409) {
        const err = await res.json().catch(() => ({}));
        const e = new Error((err && err.error) ? err.error : 'Timer conflict');
        e.status = 409;
        e.data = err;
        throw e;
    }
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`Failed to start timer: ${res.status} ${res.statusText} - ${JSON.stringify(err)}`);
    }
    return await res.json();
}

/**
 * Stop timer
 * POST /linear_cutting/timers/stop/
 * @param {Object} payload
 */
export async function stopLinearCuttingTimer(payload) {
    const res = await authedFetch(`${LINEAR_CUTTING_BASE_URL}/timers/stop/`, {
        method: 'POST',
        body: JSON.stringify(payload ?? {})
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`Failed to stop timer: ${res.status} ${res.statusText} - ${JSON.stringify(err)}`);
    }
    return await res.json();
}

/**
 * Manual time entry
 * POST /linear_cutting/timers/manual/
 * @param {Object} payload
 */
export async function manualLinearCuttingTimer(payload) {
    const res = await authedFetch(`${LINEAR_CUTTING_BASE_URL}/timers/manual/`, {
        method: 'POST',
        body: JSON.stringify(payload ?? {})
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`Failed to create manual timer: ${res.status} ${res.statusText} - ${JSON.stringify(err)}`);
    }
    return await res.json();
}

/**
 * List timers
 * GET /linear_cutting/timers/
 * @param {URLSearchParams|Object} [params]
 */
export async function listLinearCuttingTimers(params = undefined) {
    let query = '';
    if (params) {
        const searchParams = params instanceof URLSearchParams ? params : new URLSearchParams(params);
        const qs = searchParams.toString();
        query = qs ? `?${qs}` : '';
    }
    const res = await authedFetch(`${LINEAR_CUTTING_BASE_URL}/timers/${query}`);
    if (!res.ok) {
        throw new Error(`Failed to fetch timers: ${res.status} ${res.statusText}`);
    }
    return await res.json();
}

/**
 * Get single timer
 * GET /linear_cutting/timers/{id}/
 * @param {number|string} timerId
 */
export async function getLinearCuttingTimer(timerId) {
    const res = await authedFetch(`${LINEAR_CUTTING_BASE_URL}/timers/${encodeURIComponent(timerId)}/`);
    if (!res.ok) {
        throw new Error(`Failed to fetch timer: ${res.status} ${res.statusText}`);
    }
    return await res.json();
}

