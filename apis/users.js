import { backendBase } from "../base.js";
import { extractResultsFromResponse } from "./paginationHelper.js";
import { authedFetch } from "../authService.js";

/**
 * Ultra-light, un-paginated user list for dropdowns / pickers / @mentions.
 * Hits the dedicated `/users/dropdown/` endpoint which returns only
 * id/username/first_name/last_name/full_name/is_active — no heavy profile
 * data, keeping payloads small even with thousands of users.
 *
 * Deactivated (pasif) accounts are excluded by default — pickers, filters
 * and @mentions must never offer them. Pass `is_active: 'all'` only when
 * the list is used to resolve names on historical rows (e.g. matching an
 * imported time entry to an employee who has since left), or
 * `is_active: false` for deactivated accounts only.
 * @param {{ is_active?: boolean | 'all' | string, department_code?: string, group?: string }} [options]
 *   department_code: comma-separated position department codes
 *   (e.g. 'manufacturing' or 'design,planning') to scope assignment pickers.
 * @returns {Promise<Array>} plain array of light user objects
 */
export async function fetchUsersDropdown(options = {}) {
    const params = new URLSearchParams();
    if (options.is_active !== undefined && options.is_active !== null && options.is_active !== '') {
        params.set('is_active', String(options.is_active));
    }
    if (options.department_code) {
        params.set('department_code', String(options.department_code));
    }
    if (options.group) {
        params.set('group', String(options.group));
    }
    const query = params.toString();
    const resp = await authedFetch(`${backendBase}/users/dropdown/${query ? `?${query}` : ''}`);
    if (!resp.ok) return [];
    const data = await resp.json();
    // Endpoint returns a plain array; tolerate a paginated envelope just in case.
    return Array.isArray(data) ? data : (data.results || []);
}

/**
 * Backwards-compatible alias for {@link fetchUsersDropdown}. The `page_size`
 * option is now ignored (the dropdown endpoint is un-paginated). Despite the
 * name it returns *active* users unless `is_active: 'all'` is passed.
 * @param {{ is_active?: boolean | 'all' | string, page_size?: number }} [options]
 */
export async function fetchAllUsers(options = {}) {
    return fetchUsersDropdown(options);
}

/**
 * First page of the full `/users/` list. Active accounts only unless
 * `options.is_active` is 'all' / false. Prefer {@link fetchUsersDropdown}
 * for pickers.
 * @param {string|null} group  (legacy; the list endpoint ignores it)
 * @param {{ is_active?: boolean | 'all' | string }} [options]
 */
export async function fetchUsers(group = null, options = {}) {
    const params = new URLSearchParams();
    if (group) params.set('group', group);
    if (options.is_active !== undefined && options.is_active !== null && options.is_active !== '') {
        params.set('is_active', String(options.is_active));
    }
    const query = params.toString();
    const url = `${backendBase}/users/${query ? `?${query}` : ''}`;
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
    const resp = await authedFetch(`${backendBase}/organization/groups/`);
    if (!resp.ok) return [];
    const data = await resp.json();
    const groups = Array.isArray(data) ? data : (data.results || data.data || []);
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
 * Fetch all groups.
 * GET /organization/groups/
 */
export async function fetchUserGroups() {
    const resp = await authedFetch(`${backendBase}/organization/groups/`);
    if (!resp.ok) {
        throw new Error('Kullanıcı grupları alınamadı');
    }
    return await resp.json();
}

/**
 * Members of one group — who a @group mention actually notifies.
 * GET /organization/groups/{id}/members/
 *
 * Open to any authenticated user, unlike the admin-only group detail endpoint,
 * because the group-mention badge in a discussion already names the group.
 */
export async function fetchUserGroupMembers(groupId) {
    const resp = await authedFetch(`${backendBase}/organization/groups/${groupId}/members/`);
    if (!resp.ok) {
        throw new Error('Grup üyeleri alınamadı');
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
    const resp = await authedFetch(`${backendBase}/organization/groups/`);
    if (!resp.ok) {
        throw new Error('Kullanıcı grupları alınamadı');
    }
    const data = await resp.json();
    return Array.isArray(data) ? data : (data.results || data.data || []);
}

