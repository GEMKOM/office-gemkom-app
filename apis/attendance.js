import { backendBase } from '../base.js';
import { authedFetch } from '../authService.js';

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
    // Some endpoints might respond with empty body
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

export async function fetchPendingAttendanceOverrides() {
    const resp = await authedFetch(`${backendBase}/attendance/hr/pending-overrides/`, {
        method: 'GET'
    });
    return parseJsonOrThrow(resp);
}

export async function approveAttendanceOverride(recordId) {
    const resp = await authedFetch(`${backendBase}/attendance/hr/records/${recordId}/approve-override/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
    });
    return parseJsonOrThrow(resp);
}

export async function approveAttendanceOverrideWithPayload(recordId, payload) {
    const body = payload && Object.keys(payload).length > 0 ? JSON.stringify(payload) : '{}';
    const resp = await authedFetch(`${backendBase}/attendance/hr/records/${recordId}/approve-override/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
    });
    return parseJsonOrThrow(resp);
}

export async function rejectAttendanceOverride(recordId, notes) {
    const payload = notes ? { notes: String(notes) } : {};
    const resp = await authedFetch(`${backendBase}/attendance/hr/records/${recordId}/reject-override/`, {
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

export async function patchAttendanceHrRecord(recordId, patch = {}) {
    const resp = await authedFetch(`${backendBase}/attendance/hr/records/${recordId}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch || {})
    });
    return parseJsonOrThrow(resp);
}

