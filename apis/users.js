import { backendBase } from "../base.js";
import { extractResultsFromResponse } from "./paginationHelper.js";
import { authedFetch } from "../authService.js";

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