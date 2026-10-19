import { authedFetch } from '../authService.js';
import { backendBase } from '../base.js';

// ============================================================
// Tahmin (estimator) API — drawing-based cost and risk reports.
// Backend: /estimator/estimates/, /estimator/weld-schedules/
// Every call needs the `view_estimates` right; a 403 means "no access"
// and the UI hides the feature rather than showing an error.
// ============================================================

const BASE = `${backendBase}/estimator`;

async function request(url, options, fallback) {
    const response = await authedFetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error(data.detail || data.non_field_errors?.[0] || firstFieldError(data) || fallback);
        error.status = response.status;
        error.data = data;
        throw error;
    }
    return data;
}

function firstFieldError(data) {
    if (!data || typeof data !== 'object') return null;
    const key = Object.keys(data)[0];
    if (!key) return null;
    const value = data[key];
    const message = Array.isArray(value) ? value[0] : value;
    return typeof message === 'string' ? message : null;
}

function query(params = {}) {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
        if (v !== null && v !== undefined && v !== '') q.append(k, v);
    });
    const s = q.toString();
    return s ? `?${s}` : '';
}

/** Newest report (any status) of a job order or an offer, in full. 404 when none. */
export function getLatestEstimate({ jobNo, offerId }) {
    return request(`${BASE}/estimates/latest/${query({ job_no: jobNo, offer_id: offerId })}`, undefined, 'Tahmin yüklenemedi');
}

export function getEstimate(id) {
    return request(`${BASE}/estimates/${id}/`, undefined, 'Tahmin yüklenemedi');
}

/** Slim rows, newest first: {count, results}. Filters: job_no, offer_id, status, reviewed, customer, q, limit. */
export function listEstimates(filters = {}) {
    return request(`${BASE}/estimates/${query(filters)}`, undefined, 'Tahminler yüklenemedi');
}

/** Queue a new version. Errors carry `status`: 409 one is already running. */
export function createEstimate({ jobNo, offerId }) {
    const body = jobNo ? { job_no: jobNo } : { offer_id: offerId };
    return request(`${BASE}/estimates/`, { method: 'POST', body: JSON.stringify(body) }, 'Tahmin başlatılamadı');
}

export function reviewEstimate(id, decision, note = '') {
    return request(`${BASE}/estimates/${id}/review/`, { method: 'POST', body: JSON.stringify({ decision, note }) }, 'İnceleme kaydedilemedi');
}

/** The latest weld list of a job order (or of an offer's customer drawings). 404 when none. */
export function getWeldSchedule({ jobNo, offerId }) {
    const url = jobNo
        ? `${BASE}/weld-schedules/${encodeURIComponent(jobNo)}/`
        : `${BASE}/weld-schedules/offer/${offerId}/`;
    return request(url, undefined, 'Kaynak listesi yüklenemedi');
}

export const ESTIMATE_STATUS = {
    queued: { label: 'Sırada', badge: 'status-grey', icon: 'fa-clock' },
    running: { label: 'Çalışıyor', badge: 'status-blue', icon: 'fa-spinner fa-spin' },
    done: { label: 'Hazır', badge: 'status-green', icon: 'fa-check' },
    failed: { label: 'Hata', badge: 'status-red', icon: 'fa-triangle-exclamation' },
};

export const REVIEW_LABELS = {
    '': { label: 'İncelenmedi', badge: 'status-grey' },
    accept: { label: 'Kabul', badge: 'status-green' },
    correct: { label: 'Düzeltme', badge: 'status-orange' },
};
