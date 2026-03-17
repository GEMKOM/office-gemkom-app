import { backendBase } from '../base.js';
import { authedFetch } from '../authService.js';
import { extractResultsFromResponse } from './paginationHelper.js';

export async function fetchUsersSummary() {
    const resp = await authedFetch(`${backendBase}/users/summary/`);
    if (!resp.ok) return [];
    const data = await resp.json();

    // New API shape: { total, office, workshop }
    if (data && typeof data === 'object' && !Array.isArray(data)) {
        const hasNewShape =
            Object.prototype.hasOwnProperty.call(data, 'total') ||
            Object.prototype.hasOwnProperty.call(data, 'office') ||
            Object.prototype.hasOwnProperty.call(data, 'workshop');
        if (hasNewShape) {
            return data;
        }
    }

    // Legacy shapes: array / paginated results
    return extractResultsFromResponse(data);
}