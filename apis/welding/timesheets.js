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

function toQuery(filters = {}) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') params.append(key, value);
    });
    const query = params.toString();
    return query ? `?${query}` : '';
}

async function getJson(url, fallback) {
    const resp = await authedFetch(url);
    if (!resp.ok) {
        throw new Error(await readError(resp, fallback));
    }
    return await resp.json();
}

async function postJson(url, payload, fallback, method = 'POST') {
    const resp = await authedFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {}),
    });
    if (!resp.ok) {
        throw new Error(await readError(resp, fallback));
    }
    return await resp.json();
}

export async function fetchTimesheets(filters = {}) {
    return getJson(`${BASE}/${toQuery(filters)}`, 'Formlar yüklenemedi');
}

// ---- scans -------------------------------------------------------------

/**
 * Upload scanner output. One batch per file; every page becomes a scan that
 * is read out-of-band (poll fetchScans until no page is queued/parsing).
 * @param {File[]} files
 */
export async function uploadTimesheetScans(files) {
    const form = new FormData();
    files.forEach((f) => form.append('files', f, f.name));
    const resp = await authedFetch(`${BASE}/scans/upload/`, { method: 'POST', body: form });
    if (!resp.ok) {
        throw new Error(await readError(resp, 'Taramalar yüklenemedi'));
    }
    return await resp.json();
}

export async function fetchScans(filters = {}) {
    return getJson(`${BASE}/scans/${toQuery(filters)}`, 'Taramalar yüklenemedi');
}

export async function fetchScan(id) {
    return getJson(`${BASE}/scans/${id}/`, 'Tarama yüklenemedi');
}

/** @param {{sheet_id?: number|null, blank_day?: boolean, rows?: Array<{key: string, job_no?: string, cells?: boolean[]}>, note?: string}} edits */
export async function updateScan(id, edits) {
    return postJson(`${BASE}/scans/${id}/`, edits, 'Düzenleme kaydedilemedi', 'PATCH');
}

export async function approveScan(id) {
    return postJson(`${BASE}/scans/${id}/approve/`, {}, 'Onaylanamadı');
}

export async function discardScan(id, reason = '') {
    return postJson(`${BASE}/scans/${id}/discard/`, { reason }, 'Silinemedi');
}

export async function reparseScan(id) {
    return postJson(`${BASE}/scans/${id}/reparse/`, {}, 'Yeniden okunamadı');
}

export async function approveCleanScans(payload = {}) {
    return postJson(`${BASE}/scans/approve-clean/`, payload, 'Toplu onay başarısız');
}

export async function fetchScanBatches(filters = {}) {
    return getJson(`${BASE}/batches/${toQuery(filters)}`, 'Yüklemeler alınamadı');
}

export async function fetchMissingTimesheets(dateFrom, dateTo) {
    return getJson(`${BASE}/missing/${toQuery({ date_from: dateFrom, date_to: dateTo })}`, 'Eksik formlar alınamadı');
}
