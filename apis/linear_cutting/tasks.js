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
 * List tasks (paginated)
 * GET /linear_cutting/tasks/?session=LC-0001&completed=false
 * @param {URLSearchParams|Object} [params]
 */
export async function listLinearCuttingTasks(params = undefined) {
    const query = toSearchParams(params);
    const res = await authedFetch(`${LINEAR_CUTTING_BASE_URL}/tasks/${query}`);
    if (!res.ok) {
        throw new Error(`Failed to fetch tasks: ${res.status} ${res.statusText}`);
    }
    return await res.json();
}

/**
 * Get task detail
 * GET /linear_cutting/tasks/{key}/
 * @param {string} taskKey
 */
export async function getLinearCuttingTask(taskKey) {
    const res = await authedFetch(`${LINEAR_CUTTING_BASE_URL}/tasks/${encodeURIComponent(taskKey)}/`);
    if (!res.ok) {
        throw new Error(`Failed to fetch task: ${res.status} ${res.statusText}`);
    }
    return await res.json();
}

/**
 * Patch task (editable: machine_fk, estimated_hours, description, in_plan, plan_order, planned_start_ms, planned_end_ms)
 * PATCH /linear_cutting/tasks/{key}/
 * @param {string} taskKey
 * @param {Object} payload
 */
export async function patchLinearCuttingTask(taskKey, payload) {
    const res = await authedFetch(`${LINEAR_CUTTING_BASE_URL}/tasks/${encodeURIComponent(taskKey)}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload ?? {})
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`Failed to patch task: ${res.status} ${res.statusText} - ${JSON.stringify(err)}`);
    }
    return await res.json();
}

/**
 * Mark completed
 * POST /linear_cutting/tasks/mark-completed/
 * @param {string} taskKey
 */
export async function markLinearCuttingTaskCompleted(taskKey) {
    const res = await authedFetch(`${LINEAR_CUTTING_BASE_URL}/tasks/mark-completed/`, {
        method: 'POST',
        body: JSON.stringify({ key: taskKey })
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`Failed to mark completed: ${res.status} ${res.statusText} - ${JSON.stringify(err)}`);
    }
    return await res.json();
}

/**
 * Unmark completed
 * POST /linear_cutting/tasks/unmark-completed/
 * @param {string} taskKey
 */
export async function unmarkLinearCuttingTaskCompleted(taskKey) {
    const res = await authedFetch(`${LINEAR_CUTTING_BASE_URL}/tasks/unmark-completed/`, {
        method: 'POST',
        body: JSON.stringify({ key: taskKey })
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`Failed to unmark completed: ${res.status} ${res.statusText} - ${JSON.stringify(err)}`);
    }
    return await res.json();
}

