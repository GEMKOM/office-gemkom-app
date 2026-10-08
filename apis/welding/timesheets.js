import { backendBase } from "../../base.js";
import { authedFetch } from "../../authService.js";

/**
 * Welding paper timesheets (Kaynak Günlük Puantaj Formu)
 *
 * - GET  /welding/timesheets/roster/   welders grouped by team
 * - POST /welding/timesheets/print/    creates the sheets, returns a PDF (one page per employee per day)
 * - GET  /welding/timesheets/          printed sheets (filters: date, date_from, date_to, employee, status)
 */

const BASE = `${backendBase}/welding/timesheets`;

async function readError(resp, fallback) {
    try {
        const data = await resp.json();
        return data.error || data.detail || fallback;
    } catch {
        return fallback;
    }
}

export async function fetchTimesheetRoster() {
    const resp = await authedFetch(`${BASE}/roster/`);
    if (!resp.ok) {
        throw new Error(await readError(resp, 'Çalışan listesi yüklenemedi'));
    }
    return await resp.json();
}

/**
 * @param {Object} payload
 * @param {string} payload.date_from  YYYY-MM-DD
 * @param {string} payload.date_to    YYYY-MM-DD (inclusive)
 * @param {number[]} [payload.employee_ids]  defaults to the whole roster
 * @param {boolean} [payload.include_holidays]  also print Sundays and public holidays
 * @returns {Promise<{blob: Blob, sheetCount: number}>}
 */
export async function downloadTimesheetsPdf(payload) {
    const resp = await authedFetch(`${BASE}/print/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    if (!resp.ok) {
        throw new Error(await readError(resp, 'Formlar oluşturulamadı'));
    }
    const sheetCount = parseInt(resp.headers.get('X-Sheet-Count') || '0', 10);
    return { blob: await resp.blob(), sheetCount };
}

export async function fetchTimesheets(filters = {}) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') params.append(key, value);
    });
    const query = params.toString();
    const resp = await authedFetch(`${BASE}/${query ? `?${query}` : ''}`);
    if (!resp.ok) {
        throw new Error(await readError(resp, 'Formlar yüklenemedi'));
    }
    return await resp.json();
}
