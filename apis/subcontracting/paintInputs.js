import { backendBase } from "../../base.js";
import { authedFetch } from "../../authService.js";

function buildQuery(filters = {}) {
    const params = new URLSearchParams();
    Object.keys(filters).forEach((key) => {
        const val = filters[key];
        if (val !== null && val !== undefined && val !== '') {
            params.append(key, val);
        }
    });
    return params.toString();
}

export async function fetchPaintInputs(filters = {}) {
    const query = buildQuery(filters);
    const url = `${backendBase}/subcontracting/paint-inputs/${query ? `?${query}` : ''}`;
    const resp = await authedFetch(url);

    if (!resp.ok) {
        let errorMessage = 'Boya girişi yüklenirken hata oluştu';
        try {
            const errorData = await resp.json();
            errorMessage = errorData.detail || errorData.message || errorMessage;
        } catch (_) {
            // ignore
        }
        throw new Error(errorMessage);
    }

    return await resp.json();
}

export async function createPaintInput(payload) {
    const url = `${backendBase}/subcontracting/paint-inputs/`;
    const resp = await authedFetch(url, {
        method: 'POST',
        body: JSON.stringify(payload)
    });

    if (!resp.ok) {
        const errorData = await resp.json();
        const errorMessage = errorData.detail || errorData.message || Object.values(errorData).flat().join(', ') || 'Boya girişi kaydedilirken hata oluştu';
        throw new Error(errorMessage);
    }

    return await resp.json();
}

export async function patchPaintInput(id, payload) {
    const url = `${backendBase}/subcontracting/paint-inputs/${id}/`;
    const resp = await authedFetch(url, {
        method: 'PATCH',
        body: JSON.stringify(payload)
    });

    if (!resp.ok) {
        const errorData = await resp.json();
        const errorMessage = errorData.detail || errorData.message || Object.values(errorData).flat().join(', ') || 'Boya girişi güncellenirken hata oluştu';
        throw new Error(errorMessage);
    }

    return await resp.json();
}

export async function deletePaintInput(id) {
    const url = `${backendBase}/subcontracting/paint-inputs/${id}/`;
    const resp = await authedFetch(url, { method: 'DELETE' });

    if (!resp.ok) {
        let errorMessage = 'Boya girişi silinirken hata oluştu';
        try {
            const errorData = await resp.json();
            errorMessage = errorData.detail || errorData.message || errorMessage;
        } catch (_) {
            // ignore
        }
        throw new Error(errorMessage);
    }

    if (resp.status === 204) return { success: true };
    return await resp.json();
}

