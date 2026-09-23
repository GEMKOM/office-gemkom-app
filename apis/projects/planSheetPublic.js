/**
 * The plan sheet behind a share token — a customer's temporary link, opened
 * without the app session. Deliberately imports nothing from authService:
 * the public page must never bounce to the login screen.
 *
 * GET   /projects/plan-sheet/shared/{token}/  →  { link, sheet }
 * PATCH /projects/plan-sheet/shared/{token}/  { overrides }  →  link
 *       (editable links only: the sales team's adjustments, kept on the link)
 */
import { backendBase } from '../../base.js';

export async function getSharedPlanSheet(token) {
    const response = await fetch(
        `${backendBase}/projects/plan-sheet/shared/${encodeURIComponent(token)}/`,
        { headers: { Accept: 'application/json' } });
    if (response.status === 404) {
        throw new Error('Bu bağlantı bulunamadı ya da süresi dolmuş.');
    }
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
}

export async function saveSharedPlanSheetOverrides(token, overrides) {
    const response = await fetch(
        `${backendBase}/projects/plan-sheet/shared/${encodeURIComponent(token)}/`, {
            method: 'PATCH',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ overrides }),
        });
    if (!response.ok) {
        let message = `HTTP error! status: ${response.status}`;
        try {
            const body = await response.json();
            if (body && body.detail) message = body.detail;
        } catch (error) {
            // not JSON
        }
        throw new Error(message);
    }
    return response.json();
}
