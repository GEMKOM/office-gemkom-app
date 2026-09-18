/**
 * The plan sheet behind a share token — a customer's temporary link, opened
 * without the app session. Deliberately imports nothing from authService:
 * the public page must never bounce to the login screen.
 *
 * GET /projects/plan-sheet/shared/{token}/  →  { link, sheet }
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
