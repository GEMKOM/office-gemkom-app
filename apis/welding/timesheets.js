import { backendBase } from "../../base.js";
import { authedFetch } from "../../authService.js";

/**
 * Daily welding timesheets (Kaynak Günlük Puantaj), office side.
 *
 * - GET   /welding/timesheets/daily-status/?date=            every rostered welder's state for a day, with rows
 * - GET   /welding/timesheets/submissions/                    filters: status, date, date_from, date_to, employee
 * - GET   /welding/timesheets/submissions/{id}/               reviewable rows, flags, note
 * - PATCH /welding/timesheets/submissions/{id}/               {blank_day?, rows:[{key, job_no?, cells?}], note?}
 * - POST  /welding/timesheets/submissions/{id}/approve/       -> welding time entries
 * - POST  /welding/timesheets/submissions/{id}/send-back/     {reason}
 * - POST  /welding/timesheets/submissions/approve-clean/      {date?, submission_ids?}
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

async function sendJson(url, payload, fallback, method = 'POST') {
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

export async function fetchDailyStatus(date) {
    return getJson(`${BASE}/daily-status/${toQuery({ date })}`, 'Günlük durum alınamadı');
}

export async function fetchSubmissions(filters = {}) {
    return getJson(`${BASE}/submissions/${toQuery(filters)}`, 'Girişler alınamadı');
}

export async function fetchSubmission(id) {
    return getJson(`${BASE}/submissions/${id}/`, 'Giriş alınamadı');
}

/** @param {{blank_day?: boolean, rows?: Array<{key: string, job_no?: string, cells?: boolean[]}>, note?: string}} edits */
export async function updateSubmission(id, edits) {
    return sendJson(`${BASE}/submissions/${id}/`, edits, 'Düzenleme kaydedilemedi', 'PATCH');
}

export async function approveSubmission(id) {
    return sendJson(`${BASE}/submissions/${id}/approve/`, {}, 'Onaylanamadı');
}

export async function sendBackSubmission(id, reason = '') {
    return sendJson(`${BASE}/submissions/${id}/send-back/`, { reason }, 'Geri gönderilemedi');
}

export async function approveCleanSubmissions(payload = {}) {
    return sendJson(`${BASE}/submissions/approve-clean/`, payload, 'Toplu onay başarısız');
}
