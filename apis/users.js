import { backendBase } from "../base.js";
import { extractResultsFromResponse } from "./paginationHelper.js";
import { authedFetch } from "../authService.js";


export async function fetchAllUsers() {
    const resp = await authedFetch(`${backendBase}/users/?for_dropdown=true&page_size=10000`);
    if (!resp.ok) return [];
    const data = await resp.json();
    return data.results;
}

export async function fetchUsers(team = null) {
    // Adjust endpoint if needed
    let url = `${backendBase}/users/`;
    if (team) {
        url += `?team=${team}`;
    }
    const resp = await fetch(url);
    if (!resp.ok) return [];
    const data = await resp.json();
    return extractResultsFromResponse(data);
}

export async function authFetchUsers(page = 1, pageSize = 20, filters = {}) {
    // Build query parameters
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('page_size', pageSize.toString());
    
    // Add filters if provided
    if (filters.username) {
        params.append('username', filters.username);
    }
    if (filters.team) {
        params.append('team', filters.team);
    }
    if (filters.work_location) {
        params.append('work_location', filters.work_location);
    }
    if (filters.occupation) {
        params.append('occupation', filters.occupation);
    }
    if (filters.is_active) {
        params.append('is_active', filters.is_active);
    }
    
    // Add ordering if provided
    if (filters.ordering) {
        params.append('ordering', filters.ordering);
    }
    
    const url = `${backendBase}/users/?${params.toString()}`;
    const resp = await authedFetch(url);
    if (!resp.ok) return { results: [], count: 0, total_pages: 0 };
    const data = await resp.json();
    
    // Return the full response object for pagination support
    return {
        results: extractResultsFromResponse(data),
        count: data.count || data.total || 0,
        total_pages: data.total_pages || Math.ceil((data.count || data.total || 0) / pageSize)
    };
}

export async function fetchTeams() {
    const resp = await authedFetch(`${backendBase}/users/teams/`);
    if (!resp.ok) return [];
    const data = await resp.json();
    return extractResultsFromResponse(data);
}

export async function fetchOccupations() {
    const resp = await authedFetch(`${backendBase}/users/occupations/`);
    if (!resp.ok) return [];
    const data = await resp.json();
    return extractResultsFromResponse(data);
}

export async function deleteUser(userId) {
    const resp = await authedFetch(`${backendBase}/users/${userId}/`, {
        method: 'DELETE',
    });
    return resp;
}

export async function createUser(userData) {
    const resp = await authedFetch(`${backendBase}/users/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData)
    });
    return resp;
}

export async function updateUser(userId, userData) {
    const resp = await authedFetch(`${backendBase}/users/${userId}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData)
    });
    return resp;
}

export async function forgotPassword(username) {
    const resp = await fetch(`${backendBase}/users/forgot-password/request/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
    });
    return resp;
}

export async function listPasswordResetRequests() {
    const resp = await authedFetch(`${backendBase}/users/forgot-password/list/`);
    if (!resp.ok) return [];
    const data = await resp.json();
    return extractResultsFromResponse(data);
}

export async function adminResetUserPassword(userId) {
    const resp = await authedFetch(`${backendBase}/users/forgot-password/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    });
    return resp;
}

export async function resetPassword(newPassword) {
    const resp = await authedFetch(`${backendBase}/users/reset-password/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ new_password: newPassword })
    });
    return resp;
}

// ---------------------------------------------------------------------------
// Permissions & groups (new permission system)
// ---------------------------------------------------------------------------

/**
 * Fetch current user's flat permissions dictionary.
 * GET /users/me/permissions/
 */
export async function fetchCurrentUserPermissions() {
    const resp = await authedFetch(`${backendBase}/users/me/permissions/`);
    if (!resp.ok) {
        throw new Error('Kullanıcı yetkileri alınamadı');
    }
    return await resp.json();
}

/**
 * Permissions matrix for admin page.
 * GET /users/permissions/matrix/
 */
export async function fetchPermissionsMatrix(params = {}) {
    const search = params.search || '';
    const group = params.group || '';
    const active = params.active;

    const query = new URLSearchParams();
    if (search) query.set('search', search);
    if (group) query.set('group', group);
    if (active !== undefined && active !== null && active !== '') {
        query.set('active', String(active));
    }

    const resp = await authedFetch(`${backendBase}/users/permissions/matrix/${query.toString() ? `?${query.toString()}` : ''}`);
    if (!resp.ok) {
        throw new Error('Yetki matrisi alınamadı');
    }
    return await resp.json();
}

/**
 * Fetch all groups.
 * GET /users/groups/
 */
export async function fetchUserGroups() {
    const resp = await authedFetch(`${backendBase}/users/groups/`);
    if (!resp.ok) {
        throw new Error('Kullanıcı grupları alınamadı');
    }
    return await resp.json();
}

/**
 * Fetch full permission state for a single user.
 * GET /users/{id}/permissions/
 */
export async function fetchUserPermissionsDetail(userId) {
    const resp = await authedFetch(`${backendBase}/users/${userId}/permissions/`);
    if (!resp.ok) {
        throw new Error('Kullanıcı yetki detayları alınamadı');
    }
    return await resp.json();
}

/**
 * Add user to group.
 * POST /users/{id}/groups/{group_name}/
 */
export async function addUserToGroup(userId, groupName) {
    const resp = await authedFetch(`${backendBase}/users/${userId}/groups/${groupName}/`, {
        method: 'POST'
    });
    if (!resp.ok) {
        throw new Error('Kullanıcı gruba eklenemedi');
    }
    return await resp.json();
}

/**
 * Remove user from group.
 * DELETE /users/{id}/groups/{group_name}/
 */
export async function removeUserFromGroup(userId, groupName) {
    const resp = await authedFetch(`${backendBase}/users/${userId}/groups/${groupName}/`, {
        method: 'DELETE'
    });
    if (!resp.ok) {
        throw new Error('Kullanıcı gruptan çıkarılamadı');
    }
    return await resp.json();
}

/**
 * Create or update a per-user permission override.
 * POST /users/{id}/permission-overrides/
 */
export async function saveUserPermissionOverride(userId, { codename, granted, reason }) {
    const resp = await authedFetch(`${backendBase}/users/${userId}/permission-overrides/`, {
        method: 'POST',
        body: JSON.stringify({
            codename,
            granted,
            reason: reason || ''
        })
    });
    if (!resp.ok) {
        throw new Error('Yetki geçersiz kılma kaydedilemedi');
    }
    return await resp.json();
}

/**
 * Delete a per-user permission override.
 * DELETE /users/{id}/permission-overrides/{codename}/
 */
export async function deleteUserPermissionOverride(userId, codename) {
    const resp = await authedFetch(`${backendBase}/users/${userId}/permission-overrides/${codename}/`, {
        method: 'DELETE'
    });
    if (!resp.ok) {
        throw new Error('Yetki geçersiz kılma silinemedi');
    }
    return await resp.json();
}