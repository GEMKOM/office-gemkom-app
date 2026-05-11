import { backendBase } from '../base.js';
import { authedFetch } from '../authService.js';

export const LEAVE_TYPES = [
    { value: 'annual_leave', label: 'Yıllık İzin' },
    { value: 'compensatory_leave', label: 'Mazeret İzni' },
    { value: 'sick_leave', label: 'Hastalık İzni' },
    { value: 'maternity_leave', label: 'Doğum İzni' },
    { value: 'paternity_leave', label: 'Babalık İzni' },
    { value: 'bereavement_leave', label: 'Ölüm İzni' },
    { value: 'marriage_leave', label: 'Evlilik İzni' },
    { value: 'public_duty', label: 'Resmi Görev' },
    { value: 'business_trip', label: 'Görev Seyahati' },
    { value: 'paid_leave', label: 'Ücretli İzin' },
    { value: 'unpaid_leave', label: 'Ücretsiz İzin' }
];

function buildQuery(filters = {}) {
    const params = new URLSearchParams();
    Object.entries(filters || {}).forEach(([key, value]) => {
        if (value === null || value === undefined) return;
        if (Array.isArray(value)) {
            value.forEach(item => {
                if (item !== null && item !== undefined && String(item).trim() !== '') {
                    params.append(key, item);
                }
            });
            return;
        }
        if (String(value).trim() === '') return;
        params.append(key, value);
    });
    const query = params.toString();
    return query ? `?${query}` : '';
}

async function parseJsonOrThrow(response, fallbackMessage) {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        let message = data?.detail || data?.message || data?.error || '';
        if (!message && Array.isArray(data?.non_field_errors) && data.non_field_errors.length) {
            message = data.non_field_errors.join(' ');
        }
        if (!message && data && typeof data === 'object') {
            const firstArray = Object.values(data).find(value => Array.isArray(value) && value.length > 0);
            if (firstArray) {
                message = firstArray.join(' ');
            }
        }
        if (!message) {
            message = fallbackMessage || 'İşlem başarısız.';
        }
        const err = new Error(message);
        err.response = data;
        throw err;
    }
    return data;
}

export async function previewVacationDuration({ start_date, end_date }) {
    const query = buildQuery({ start_date, end_date });
    const response = await authedFetch(`${backendBase}/vacation-requests/preview/${query}`);
    return parseJsonOrThrow(response, 'İzin önizlemesi alınamadı.');
}

export async function createVacationRequest(payload) {
    const response = await authedFetch(`${backendBase}/vacation-requests/requests/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    return parseJsonOrThrow(response, 'İzin talebi oluşturulamadı.');
}

export async function fetchVacationRequests(filters = {}) {
    const query = buildQuery(filters);
    const response = await authedFetch(`${backendBase}/vacation-requests/requests/${query}`);
    return parseJsonOrThrow(response, 'İzin talepleri yüklenemedi.');
}

export async function fetchVacationRequest(requestId) {
    const response = await authedFetch(`${backendBase}/vacation-requests/requests/${requestId}/`);
    return parseJsonOrThrow(response, 'İzin talebi detayı yüklenemedi.');
}

export async function cancelVacationRequest(requestId) {
    const response = await authedFetch(`${backendBase}/vacation-requests/requests/${requestId}/cancel/`, {
        method: 'POST'
    });
    return parseJsonOrThrow(response, 'İzin talebi iptal edilemedi.');
}

export async function fetchPendingVacationApprovalRequests(filters = {}) {
    const query = buildQuery(filters);
    const response = await authedFetch(`${backendBase}/vacation-requests/requests/pending_approval/${query}`);
    return parseJsonOrThrow(response, 'Bekleyen izin talepleri yüklenemedi.');
}

export async function approveVacationRequest(requestId, comment = '') {
    const response = await authedFetch(`${backendBase}/vacation-requests/requests/${requestId}/approve/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment })
    });
    return parseJsonOrThrow(response, 'Onaylama işlemi başarısız.');
}

export async function rejectVacationRequest(requestId, comment = '') {
    const response = await authedFetch(`${backendBase}/vacation-requests/requests/${requestId}/reject/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment })
    });
    return parseJsonOrThrow(response, 'Reddetme işlemi başarısız.');
}

export async function fetchVacationDecisionsByMe(filters = {}) {
    const query = buildQuery(filters);
    const response = await authedFetch(`${backendBase}/vacation-requests/requests/decision_by_me/${query}`);
    return parseJsonOrThrow(response, 'Kararlar yüklenemedi.');
}

export async function fetchVacationBalances(filters = {}) {
    const query = buildQuery(filters);
    const response = await authedFetch(`${backendBase}/vacation-requests/balances/${query}`);
    return parseJsonOrThrow(response, 'İzin bakiyeleri yüklenemedi.');
}

export async function patchVacationBalance(balanceId, payload) {
    const response = await authedFetch(`${backendBase}/vacation-requests/balances/${balanceId}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    return parseJsonOrThrow(response, 'İzin bakiyesi güncellenemedi.');
}

export async function fetchUserLeaveSetup(userId) {
    const response = await authedFetch(`${backendBase}/vacation-requests/users/${userId}/leave-setup/`);
    return parseJsonOrThrow(response, 'İzin tanımı yüklenemedi.');
}

export async function patchUserLeaveSetup(userId, payload) {
    const response = await authedFetch(`${backendBase}/vacation-requests/users/${userId}/leave-setup/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    return parseJsonOrThrow(response, 'İzin tanımı güncellenemedi.');
}
