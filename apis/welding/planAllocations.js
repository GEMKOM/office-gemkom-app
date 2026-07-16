import { backendBase } from "../../base.js";
import { authedFetch } from "../../authService.js";

const BASE = `${backendBase}/welding/plan-allocations`;

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

// Grouped snapshot for the capacity-planning Gantt.
export async function getWeldingPlanBoard() {
    const resp = await authedFetch(`${BASE}/board/`);
    if (!resp.ok) {
        throw new Error(await parseError(resp, "Kaynak plan panosu yüklenirken hata oluştu"));
    }
    return await resp.json();
}

// items: [{id?, deleted?, department_task, subcontractor|team, allocated_weight_kg, planned_start_date, planned_end_date, notes}]
export async function bulkSaveWeldingPlanAllocations(items) {
    const resp = await authedFetch(`${BASE}/bulk-save/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items })
    });
    if (!resp.ok) {
        throw new Error(await parseError(resp, "Plan kaydedilirken hata oluştu"));
    }
    return await resp.json();
}

// body: {} for team promotion, {price_tier} for subcontractor promotion.
export async function promoteWeldingPlanAllocation(id, body = {}) {
    const resp = await authedFetch(`${BASE}/${id}/promote/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
    if (!resp.ok) {
        throw new Error(await parseError(resp, "Tahsis gerçek atamaya dönüştürülürken hata oluştu"));
    }
    return await resp.json();
}
