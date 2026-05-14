import { backendBase } from '../../base.js';
import { authedFetch } from '../../authService.js';

async function parseJsonOrThrow(response) {
    if (!response.ok) {
        let body = null;
        try {
            body = await response.json();
        } catch {
            // ignore
        }
        const msg = body?.detail || body?.message || `HTTP ${response.status}`;
        const err = new Error(msg);
        err.status = response.status;
        err.body = body;
        throw err;
    }
    const text = await response.text();
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        return { raw: text };
    }
}

function buildQuery(params = {}) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params || {})) {
        if (v === undefined || v === null) continue;
        const s = String(v).trim();
        if (!s) continue;
        qs.set(k, s);
    }
    const out = qs.toString();
    return out ? `?${out}` : '';
}

// ---------------------------------------------------------------------------
// Attendance HR: overrides & records
// ---------------------------------------------------------------------------

export async function fetchPendingAttendanceOverrides() {
    const resp = await authedFetch(`${backendBase}/attendance/hr/pending-overrides/`, {
        method: 'GET'
    });
    return parseJsonOrThrow(resp);
}

export async function approveAttendanceSessionOverride(sessionId, payload = {}) {
    const body = payload && Object.keys(payload).length > 0 ? JSON.stringify(payload) : '{}';
    const resp = await authedFetch(`${backendBase}/attendance/hr/sessions/${sessionId}/approve/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
    });
    return parseJsonOrThrow(resp);
}

export async function rejectAttendanceSessionOverride(sessionId, notes) {
    const payload = notes ? { notes: String(notes) } : {};
    const resp = await authedFetch(`${backendBase}/attendance/hr/sessions/${sessionId}/reject/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    return parseJsonOrThrow(resp);
}

export async function fetchAttendanceHrRecords(filters = {}) {
    const query = buildQuery(filters);
    const resp = await authedFetch(`${backendBase}/attendance/hr/records/${query}`, {
        method: 'GET'
    });
    return parseJsonOrThrow(resp);
}

export async function fetchAttendanceHrSummary(filters = {}) {
    const query = buildQuery(filters);
    const resp = await authedFetch(`${backendBase}/attendance/hr/summary/${query}`, {
        method: 'GET'
    });
    return parseJsonOrThrow(resp);
}

export async function createAttendanceHrRecord(data = {}) {
    const resp = await authedFetch(`${backendBase}/attendance/hr/records/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data || {})
    });
    return parseJsonOrThrow(resp);
}

export async function patchAttendanceHrRecord(recordId, patch = {}) {
    const resp = await authedFetch(`${backendBase}/attendance/hr/records/${recordId}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch || {})
    });
    return parseJsonOrThrow(resp);
}

export async function fetchAttendanceHrRecordSessions(recordId) {
    const resp = await authedFetch(`${backendBase}/attendance/hr/records/${recordId}/sessions/`, {
        method: 'GET'
    });
    return parseJsonOrThrow(resp);
}

export async function createAttendanceHrSession(recordId, data = {}) {
    const resp = await authedFetch(`${backendBase}/attendance/hr/records/${recordId}/sessions/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    return parseJsonOrThrow(resp);
}

export async function patchAttendanceHrSession(sessionId, patch = {}) {
    const resp = await authedFetch(`${backendBase}/attendance/hr/sessions/${sessionId}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch)
    });
    return parseJsonOrThrow(resp);
}

export async function deleteAttendanceHrSession(sessionId) {
    const resp = await authedFetch(`${backendBase}/attendance/hr/sessions/${sessionId}/`, {
        method: 'DELETE'
    });
    if (!resp.ok) {
        let body = null;
        try { body = await resp.json(); } catch {}
        throw new Error(body?.detail || `HTTP ${resp.status}`);
    }
    return { success: true };
}

// ---------------------------------------------------------------------------
// Attendance HR: leave intervals
// ---------------------------------------------------------------------------

export async function fetchAttendanceHrRecordIntervals(recordId) {
    const resp = await authedFetch(`${backendBase}/attendance/hr/records/${recordId}/intervals/`, {
        method: 'GET'
    });
    return parseJsonOrThrow(resp);
}

export async function createAttendanceHrRecordInterval(recordId, data = {}) {
    const resp = await authedFetch(`${backendBase}/attendance/hr/records/${recordId}/intervals/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data || {})
    });
    return parseJsonOrThrow(resp);
}

export async function patchAttendanceHrInterval(intervalId, patch = {}) {
    const resp = await authedFetch(`${backendBase}/attendance/hr/intervals/${intervalId}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch || {})
    });
    return parseJsonOrThrow(resp);
}

export async function deleteAttendanceHrInterval(intervalId) {
    const resp = await authedFetch(`${backendBase}/attendance/hr/intervals/${intervalId}/`, {
        method: 'DELETE'
    });
    if (!resp.ok) {
        let body = null;
        try {
            body = await resp.json();
        } catch {
            // ignore
        }
        const msg = body?.detail || body?.message || `HTTP ${resp.status}`;
        throw new Error(msg);
    }
    return { success: true };
}

// ---------------------------------------------------------------------------
// Attendance HR: shift rules
// ---------------------------------------------------------------------------

export async function fetchShiftRules() {
    const resp = await authedFetch(`${backendBase}/attendance/hr/shift-rules/`, {
        method: 'GET'
    });
    return parseJsonOrThrow(resp);
}

export async function createShiftRule(data) {
    const resp = await authedFetch(`${backendBase}/attendance/hr/shift-rules/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data || {})
    });
    return parseJsonOrThrow(resp);
}

export async function patchShiftRule(id, patch = {}) {
    const resp = await authedFetch(`${backendBase}/attendance/hr/shift-rules/${id}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch || {})
    });
    return parseJsonOrThrow(resp);
}

export async function deleteShiftRule(id) {
    const resp = await authedFetch(`${backendBase}/attendance/hr/shift-rules/${id}/`, {
        method: 'DELETE'
    });
    if (!resp.ok) {
        let body = null;
        try {
            body = await resp.json();
        } catch {
            // ignore
        }
        const msg = body?.detail || body?.message || `HTTP ${resp.status}`;
        throw new Error(msg);
    }
    return { success: true };
}

export async function assignShiftRuleToUser(userId, shiftRuleId) {
    const resp = await authedFetch(`${backendBase}/attendance/hr/shift-rules/assign/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, shift_rule_id: shiftRuleId })
    });
    return parseJsonOrThrow(resp);
}

// ---------------------------------------------------------------------------
// Attendance: monthly summary
// ---------------------------------------------------------------------------

export async function fetchAttendanceMonthlySummary({ user_id, year, month } = {}) {
    const params = new URLSearchParams();
    if (user_id !== undefined && user_id !== null && String(user_id).trim() !== '') {
        params.set('user_id', String(user_id).trim());
    }
    if (year !== undefined && year !== null && String(year).trim() !== '') {
        params.set('year', String(year).trim());
    }
    if (month !== undefined && month !== null && String(month).trim() !== '') {
        params.set('month', String(month).trim());
    }
    const qs = params.toString();
    const resp = await authedFetch(`${backendBase}/attendance/monthly-summary/${qs ? `?${qs}` : ''}`, {
        method: 'GET'
    });
    return parseJsonOrThrow(resp);
}

