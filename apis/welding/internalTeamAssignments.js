import { backendBase } from "../../base.js";
import { authedFetch } from "../../authService.js";

function buildQuery(filters = {}) {
    const params = new URLSearchParams();
    Object.keys(filters).forEach((key) => {
        const value = filters[key];
        if (value !== null && value !== undefined && value !== "") {
            params.append(key, value);
        }
    });
    return params.toString();
}

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

export async function fetchInternalTeamAssignments(filters = {}) {
    const query = buildQuery(filters);
    const url = `${backendBase}/welding/internal-team-assignments/${query ? `?${query}` : ""}`;
    const resp = await authedFetch(url);
    if (!resp.ok) {
        throw new Error(await parseError(resp, "Takım atamaları yüklenirken hata oluştu"));
    }
    return await resp.json();
}

export async function createInternalTeamAssignmentWithSubtask(payload) {
    const url = `${backendBase}/welding/internal-team-assignments/create-with-subtask/`;
    const resp = await authedFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    if (!resp.ok) {
        throw new Error(await parseError(resp, "Takım ataması oluşturulurken hata oluştu"));
    }
    return await resp.json();
}

export async function updateInternalTeamAssignmentWithEndpoint(assignmentId, payload) {
    const url = `${backendBase}/welding/internal-team-assignments/${assignmentId}/update-assignment/`;
    const resp = await authedFetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    if (!resp.ok) {
        throw new Error(await parseError(resp, "Takım ataması güncellenirken hata oluştu"));
    }
    return await resp.json();
}

export async function deleteInternalTeamAssignmentWithSubtask(assignmentId) {
    const url = `${backendBase}/welding/internal-team-assignments/${assignmentId}/delete-with-subtask/`;
    const resp = await authedFetch(url, { method: "DELETE" });
    if (!resp.ok) {
        throw new Error(await parseError(resp, "Takım ataması silinirken hata oluştu"));
    }
    if (resp.status === 204) return { success: true };
    return await resp.json().catch(() => ({ success: true }));
}
