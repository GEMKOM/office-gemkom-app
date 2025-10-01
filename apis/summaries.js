import { backendBase } from '../base.js';
import { authedFetch } from '../authService.js';
import { extractResultsFromResponse } from './paginationHelper.js';

export async function fetchUsersSummary() {
    const resp = await authedFetch(`${backendBase}/users/summary/`);
    if (!resp.ok) return [];
    const data = await resp.json();
    return extractResultsFromResponse(data);
}