import { backendBase } from "../../base.js";
import { authedFetch } from "../../authService.js";

function buildQuery(filters = {}) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== "") {
            params.append(key, value);
        }
    });
    return params.toString();
}

async function readErrorMessage(resp, fallbackMessage) {
    const payload = await resp.json().catch(() => ({}));
    const details = payload?.detail || payload?.message || payload?.error;
    if (details) return Array.isArray(details) ? details.join(", ") : String(details);
    if (payload && typeof payload === "object") {
        const values = Object.values(payload).flat();
        if (values.length > 0) {
            return values.map(v => String(v)).join(", ");
        }
    }
    return fallbackMessage;
}

export async function fetchTeams(filters = {}) {
    const query = buildQuery(filters);
    const url = `${backendBase}/teams/${query ? `?${query}` : ""}`;
    const resp = await authedFetch(url);
    if (!resp.ok) {
        throw new Error(await readErrorMessage(resp, "Ekipler yüklenirken hata oluştu"));
    }
    return await resp.json();
}

export async function createTeam(teamData) {
    const resp = await authedFetch(`${backendBase}/teams/`, {
        method: "POST",
        body: JSON.stringify(teamData)
    });
    if (!resp.ok) {
        throw new Error(await readErrorMessage(resp, "Ekip oluşturulurken hata oluştu"));
    }
    return await resp.json();
}

export async function updateTeam(teamId, teamData) {
    const resp = await authedFetch(`${backendBase}/teams/${teamId}/`, {
        method: "PATCH",
        body: JSON.stringify(teamData)
    });
    if (!resp.ok) {
        throw new Error(await readErrorMessage(resp, "Ekip güncellenirken hata oluştu"));
    }
    return await resp.json();
}

export async function deleteTeam(teamId) {
    const resp = await authedFetch(`${backendBase}/teams/${teamId}/`, {
        method: "DELETE"
    });
    if (!resp.ok) {
        throw new Error(await readErrorMessage(resp, "Ekip silinirken hata oluştu"));
    }
    if (resp.status === 204) {
        return { success: true };
    }
    return await resp.json().catch(() => ({ success: true }));
}
