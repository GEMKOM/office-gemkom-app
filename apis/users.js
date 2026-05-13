import { backendBase } from "../base.js";
import { extractResultsFromResponse } from "./paginationHelper.js";
import { authedFetch } from "../authService.js";


/**
 * Large user list for dropdowns (paginated on backend).
 * @param {{ is_active?: boolean | string, page_size?: number }} [options]
 */
export async function fetchAllUsers(options = {}) {
    const params = new URLSearchParams();
    params.set('for_dropdown', 'true');
    params.set('page_size', String(options.page_size ?? 10000));
    if (options.is_active !== undefined && options.is_active !== null && options.is_active !== '') {
        params.set('is_active', String(options.is_active));
    }
    const resp = await authedFetch(`${backendBase}/users/?${params.toString()}`);
    if (!resp.ok) return [];
    const data = await resp.json();
    return data.results;
}

export async function fetchUsers(group = null) {
    let url = `${backendBase}/users/`;
    if (group) {
        url += `?group=${group}`;
    }
    const resp = await authedFetch(url);
    if (!resp.ok) return [];
    const data = await resp.json();
    return extractResultsFromResponse(data);
}

export async function authFetchUsers(page = 1, pageSize = 20, filters = {}) {
    // Build query parameters
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('page_size', pageSize.toString());
    
    if (filters.username)       params.append('username', filters.username);
    if (filters.group)          params.append('group', filters.group);
    if (filters.office_access)  params.append('office_access', filters.office_access);
    if (filters.workshop_access) params.append('workshop_access', filters.workshop_access);
    if (filters.occupation)     params.append('occupation', filters.occupation);
    if (filters.is_active)      params.append('is_active', filters.is_active);
    if (filters.position)       params.append('position', String(filters.position));
    if (filters.position_level) params.append('position_level', String(filters.position_level));
    if (filters.department_code) params.append('department_code', String(filters.department_code));
    if (filters.ordering)       params.append('ordering', filters.ordering);
    
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
    // NOTE: "teams" dropdown has been migrated to user groups.
    // GET /users/groups/
    // Response items now include: { name, display_name, portal, member_count, permissions: [] }
    const resp = await authedFetch(`${backendBase}/users/groups/`);
    if (!resp.ok) return [];
    const data = await resp.json();
    // backend returns array (not paginated) for groups in this project
    const groups = Array.isArray(data) ? data : (data.results || data.data || []);
    // Normalize to legacy dropdown consumers that expect {value,label,...}
    return groups.map(g => ({
        ...g,
        value: g.value ?? g.name,
        label: g.label ?? g.display_name ?? g.name
    }));
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
    const isActive = params.is_active ?? params.active;
    const officeAccess = params.office_access;
    const workshopAccess = params.workshop_access;

    const query = new URLSearchParams();
    if (search) query.set('search', search);
    if (group) query.set('group', group);
    if (officeAccess !== undefined && officeAccess !== null && officeAccess !== '') {
        query.set('office_access', String(officeAccess));
    }
    if (workshopAccess !== undefined && workshopAccess !== null && workshopAccess !== '') {
        query.set('workshop_access', String(workshopAccess));
    }
    if (isActive !== undefined && isActive !== null && isActive !== '') {
        query.set('is_active', String(isActive));
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

/**
 * Group permissions
 * GET /users/groups/<group_name>/permissions/
 */
export async function fetchGroupPermissions(groupName) {
    const resp = await authedFetch(`${backendBase}/users/groups/${encodeURIComponent(groupName)}/permissions/`);
    if (!resp.ok) {
        throw new Error('Grup yetkileri alınamadı');
    }
    return await resp.json();
}

/**
 * Fetch groups including permissions in a single request (preferred).
 * GET /users/groups/
 *
 * Expected item shape:
 *  {
 *    name, display_name, portal, member_count,
 *    permissions: ["access_planning", ...]
 *  }
 */
export async function fetchGroupsWithPermissions() {
    const resp = await authedFetch(`${backendBase}/users/groups/`);
    if (!resp.ok) {
        throw new Error('Kullanıcı grupları alınamadı');
    }
    const data = await resp.json();
    // backend returns array (not paginated) for groups in this project
    return Array.isArray(data) ? data : (data.results || data.data || []);
}

/**
 * Permissions -> users listing for admin page.
 * GET /users/permissions/
 *
 * Expected shape:
 * [
 *   {
 *     codename, name,
 *     users: [{id, username, full_name, source, source_detail}],
 *     overrides: [{id, username, full_name, granted}]
 *   }
 * ]
 */
export async function fetchPermissionsUsersList() {
    const resp = await authedFetch(`${backendBase}/users/permissions/`);
    if (!resp.ok) {
        throw new Error('Yetki listesi alınamadı');
    }
    const data = await resp.json();
    return Array.isArray(data) ? data : (data.results || data.data || []);
}

/**
 * Add a permission to a group
 * POST /users/groups/<group_name>/permissions/  body: { codename }
 */
export async function addPermissionToGroup(groupName, codename) {
    const resp = await authedFetch(`${backendBase}/users/groups/${encodeURIComponent(groupName)}/permissions/`, {
        method: 'POST',
        body: JSON.stringify({ codename })
    });
    if (!resp.ok) {
        throw new Error('Gruba yetki eklenemedi');
    }
    return await resp.json();
}

/**
 * Remove a permission from a group
 * DELETE /users/groups/<group_name>/permissions/<codename>/
 */
export async function removePermissionFromGroup(groupName, codename) {
    const resp = await authedFetch(`${backendBase}/users/groups/${encodeURIComponent(groupName)}/permissions/${encodeURIComponent(codename)}/`, {
        method: 'DELETE'
    });
    if (!resp.ok) {
        throw new Error('Gruptan yetki kaldırılamadı');
    }
    return await resp.json();
}

/**
 * Replace a group's permission list in bulk.
 * PUT /users/groups/<group_name>/permissions/  body: ["access_x", ...]
 */
export async function saveGroupPermissionsBulk(groupName, codenames) {
    const resp = await authedFetch(`${backendBase}/users/groups/${encodeURIComponent(groupName)}/permissions/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Array.isArray(codenames) ? codenames : [])
    });
    if (!resp.ok) {
        throw new Error('Grup yetkileri kaydedilemedi');
    }
    // Backend may return updated permissions or a status payload; just pass through.
    return await resp.json().catch(() => ({}));
}