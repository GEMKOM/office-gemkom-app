import { backendBase } from "../../base.js";
import { authedFetch } from "../../authService.js";

const BASE = `${backendBase}/welding/planning`;

async function parseError(resp, fallbackMessage) {
    const errorData = await resp.json().catch(() => ({}));
    return (
        errorData?.detail ||
        errorData?.message ||
        errorData?.error ||
        Object.values(errorData || {}).flat().join(", ") ||
        fallbackMessage
    );
}

/**
 * Planning board snapshot.
 * {
 *   resources: [{resource_type, id, name, total_kg, blocks: [
 *       {assignment_type, assignment_id, subtask_id, welding_task_id, job_no,
 *        job_order_title, customer_name, allocated_weight_kg, is_billed,
 *        price_tier, notes, subtask: {...}, has_stages,
 *        stages: [{id, title, is_default, weight, status, progress,
 *                  duration_wd, start_date, end_date, note, is_cancelled,
 *                  is_overdue}],
 *        rollup: {progress_pct, window_start, window_end, total_days,
 *                 derived_status, is_overdue}}]}],
 *   welding_tasks: [{welding_task_id, job_no, job_order_title, customer_name,
 *                    total_weight_kg, allocated_total, remaining_weight_kg,
 *                    over_allocated}],
 *   job_info: {job_no: {material_supply, machining[], cutting[], painting}},
 *   holidays: [{date, is_half_day}],
 *   warnings: [{welding_task_id, job_no, allocated_total, total_weight_kg}],
 * }
 */
export async function getWeldingPlanningBoard(includeCompleted = false) {
    const qs = includeCompleted ? "?include_completed=true" : "";
    const resp = await authedFetch(`${BASE}/board/${qs}`);
    if (!resp.ok) {
        throw new Error(await parseError(resp, "Kaynak planlama panosu yüklenirken hata oluştu"));
    }
    return await resp.json();
}

/**
 * One atomic save for the whole board.
 * payload: {
 *   new_blocks: [{resource_type, resource_id, welding_task_id,
 *                 allocated_weight_kg, price_tier?, title?, notes?, stages?}],
 *   blocks: [{assignment_type, assignment_id, allocated_weight_kg?, notes?,
 *             create_default_stages?, subtask_schedule?, stages?: [
 *               {id?, deleted?, title?, weight?, status?, progress?, note?,
 *                duration_wd?, start_date?, end_date?}]}],
 *   deleted_blocks: [{assignment_type, assignment_id}],
 *   painting_tasks: [{task_id, status?, progress?, duration_wd?,
 *                     start_date?, end_date?}],
 * }
 * Returns {saved, board}.
 */
export async function bulkSaveWeldingPlanning(payload) {
    const resp = await authedFetch(`${BASE}/bulk-save/`, {
        method: "POST",
        body: JSON.stringify(payload),
    });
    if (!resp.ok) {
        throw new Error(await parseError(resp, "Plan kaydedilirken hata oluştu"));
    }
    return await resp.json();
}
