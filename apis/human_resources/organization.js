import { backendBase } from '../../base.js';
import { authedFetch } from '../../authService.js';

function buildQuery(params = {}) {
    const query = new URLSearchParams();
    for (const [key, rawValue] of Object.entries(params || {})) {
        if (rawValue === null || rawValue === undefined) continue;
        if (Array.isArray(rawValue)) {
            rawValue.forEach(item => {
                if (item === null || item === undefined) return;
                const value = String(item).trim();
                if (!value) return;
                query.append(key, value);
            });
            continue;
        }
        const value = String(rawValue).trim();
        if (!value) continue;
        query.set(key, value);
    }
    const qs = query.toString();
    return qs ? `?${qs}` : '';
}

async function parseJsonOrThrow(response, fallbackMessage) {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const message =
            data?.detail ||
            data?.message ||
            data?.error ||
            fallbackMessage ||
            `HTTP ${response.status}`;
        const err = new Error(message);
        err.status = response.status;
        err.response = data;
        throw err;
    }
    return data;
}

// Positions
export async function fetchPositions(filters = {}) {
    const response = await authedFetch(`${backendBase}/organization/positions/${buildQuery(filters)}`);
    return parseJsonOrThrow(response, 'Pozisyonlar yüklenemedi.');
}

export async function fetchPositionTree() {
    const response = await authedFetch(`${backendBase}/organization/positions/tree/`);
    return parseJsonOrThrow(response, 'Organizasyon şeması yüklenemedi.');
}

export async function fetchPositionById(positionId) {
    const response = await authedFetch(`${backendBase}/organization/positions/${positionId}/`);
    return parseJsonOrThrow(response, 'Pozisyon detayı yüklenemedi.');
}

export async function createPosition(payload) {
    const response = await authedFetch(`${backendBase}/organization/positions/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {})
    });
    return parseJsonOrThrow(response, 'Pozisyon oluşturulamadı.');
}

export async function patchPosition(positionId, payload) {
    const response = await authedFetch(`${backendBase}/organization/positions/${positionId}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {})
    });
    return parseJsonOrThrow(response, 'Pozisyon güncellenemedi.');
}

export async function patchPositionPermissions(positionId, codenames = []) {
    const response = await authedFetch(`${backendBase}/organization/positions/${positionId}/permissions/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codenames: Array.isArray(codenames) ? codenames : [] })
    });
    return parseJsonOrThrow(response, 'Pozisyon yetkileri güncellenemedi.');
}

export async function fetchPositionHolders(positionId) {
    const response = await authedFetch(`${backendBase}/organization/positions/${positionId}/holders/`);
    return parseJsonOrThrow(response, 'Pozisyon kullanıcıları yüklenemedi.');
}

// User groups (domain model for team assignment / approval roles)
export async function fetchOrganizationUserGroups(filters = {}) {
    const response = await authedFetch(`${backendBase}/organization/groups/${buildQuery(filters)}`);
    return parseJsonOrThrow(response, 'Kullanıcı grupları yüklenemedi.');
}

// Organization groups (IT / org)
export async function fetchOrganizationGroups() {
    const response = await authedFetch(`${backendBase}/organization/groups/`);
    return parseJsonOrThrow(response, 'Gruplar yüklenemedi.');
}

export async function fetchOrganizationGroupById(groupId) {
    const response = await authedFetch(`${backendBase}/organization/groups/${groupId}/`);
    return parseJsonOrThrow(response, 'Grup detayı yüklenemedi.');
}

export async function createOrganizationGroup(payload) {
    const response = await authedFetch(`${backendBase}/organization/groups/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {})
    });
    return parseJsonOrThrow(response, 'Grup oluşturulamadı.');
}

export async function patchOrganizationGroup(groupId, payload) {
    const response = await authedFetch(`${backendBase}/organization/groups/${groupId}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {})
    });
    return parseJsonOrThrow(response, 'Grup güncellenemedi.');
}

export async function patchOrganizationGroupPositions(groupId, positionIds) {
    const response = await authedFetch(`${backendBase}/organization/groups/${groupId}/positions/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position_ids: Array.isArray(positionIds) ? positionIds : [] })
    });
    return parseJsonOrThrow(response, 'Grup pozisyonları güncellenemedi.');
}

export async function deleteOrganizationGroup(groupId) {
    const response = await authedFetch(`${backendBase}/organization/groups/${groupId}/`, {
        method: 'DELETE'
    });
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const message =
            data?.detail ||
            data?.message ||
            data?.error ||
            'Grup silinemedi.';
        const err = new Error(message);
        err.status = response.status;
        err.response = data;
        throw err;
    }
    if (response.status === 204) return null;
    return response.json().catch(() => null);
}

export async function fetchPermissionsCatalog() {
    const response = await authedFetch(`${backendBase}/users/permissions/`);
    return parseJsonOrThrow(response, 'Yetki listesi yüklenemedi.');
}

// Users ↔ positions
export async function assignUserToPosition(userId, positionId) {
    const response = await authedFetch(`${backendBase}/users/${userId}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: positionId })
    });
    return parseJsonOrThrow(response, 'Kullanıcı pozisyonu güncellenemedi.');
}
