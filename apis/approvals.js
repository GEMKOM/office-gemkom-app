import { backendBase } from '../base.js';
import { authedFetch } from '../authService.js';

function buildQuery(params = {}) {
    const query = new URLSearchParams();
    for (const [key, rawValue] of Object.entries(params || {})) {
        if (rawValue === null || rawValue === undefined) continue;
        if (Array.isArray(rawValue)) {
            rawValue.forEach(item => {
                if (item === null || item === undefined) return;
                const value = String(item).trim();
                if (!value) return;
                query.append(key, value);
            });
            continue;
        }
        const value = String(rawValue).trim();
        if (!value) continue;
        query.set(key, value);
    }
    const qs = query.toString();
    return qs ? `?${qs}` : '';
}

async function parseJsonOrThrow(response, fallbackMessage) {
    if (response.status === 204) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const message =
            data?.detail ||
            data?.message ||
            data?.error ||
            fallbackMessage ||
            `HTTP ${response.status}`;
        const err = new Error(message);
        err.status = response.status;
        err.response = data;
        throw err;
    }
    return data;
}

// ─── Policy CRUD ────────────────────────────────────────────────────────────

export async function fetchPolicies() {
    const response = await authedFetch(`${backendBase}/approvals/policies/`);
    return parseJsonOrThrow(response, 'Politikalar yüklenemedi.');
}

export async function fetchPolicy(id) {
    const response = await authedFetch(`${backendBase}/approvals/policies/${id}/`);
    return parseJsonOrThrow(response, 'Politika yüklenemedi.');
}

export async function createPolicy(payload) {
    const response = await authedFetch(`${backendBase}/approvals/policies/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    return parseJsonOrThrow(response, 'Politika oluşturulamadı.');
}

export async function patchPolicy(id, payload) {
    const response = await authedFetch(`${backendBase}/approvals/policies/${id}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    return parseJsonOrThrow(response, 'Politika güncellenemedi.');
}

export async function deletePolicy(id) {
    const response = await authedFetch(`${backendBase}/approvals/policies/${id}/`, {
        method: 'DELETE'
    });
    return parseJsonOrThrow(response, 'Politika silinemedi.');
}

// ─── Stage CRUD ─────────────────────────────────────────────────────────────

export async function fetchStages(policyId) {
    const response = await authedFetch(`${backendBase}/approvals/policies/${policyId}/stages/`);
    return parseJsonOrThrow(response, 'Aşamalar yüklenemedi.');
}

export async function createStage(policyId, payload) {
    const response = await authedFetch(`${backendBase}/approvals/policies/${policyId}/stages/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    return parseJsonOrThrow(response, 'Aşama oluşturulamadı.');
}

export async function patchStage(stageId, payload) {
    const response = await authedFetch(`${backendBase}/approvals/stages/${stageId}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    return parseJsonOrThrow(response, 'Aşama güncellenemedi.');
}

export async function deleteStage(stageId) {
    const response = await authedFetch(`${backendBase}/approvals/stages/${stageId}/`, {
        method: 'DELETE'
    });
    return parseJsonOrThrow(response, 'Aşama silinemedi.');
}

// ─── Workflows ──────────────────────────────────────────────────────────────

export async function fetchWorkflows(filters = {}) {
    const response = await authedFetch(`${backendBase}/approvals/workflows/${buildQuery(filters)}`);
    return parseJsonOrThrow(response, 'İş akışları yüklenemedi.');
}

export async function fetchWorkflow(id) {
    const response = await authedFetch(`${backendBase}/approvals/workflows/${id}/`);
    return parseJsonOrThrow(response, 'İş akışı yüklenemedi.');
}

export async function overrideWorkflowStageApprovers(workflowId, stageOrder, payload) {
    const response = await authedFetch(
        `${backendBase}/approvals/workflows/${workflowId}/stages/${stageOrder}/approvers/`,
        {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }
    );
    return parseJsonOrThrow(response, 'Onaylayıcılar güncellenemedi.');
}

export async function cancelWorkflow(id) {
    const response = await authedFetch(`${backendBase}/approvals/workflows/${id}/cancel/`, {
        method: 'POST'
    });
    return parseJsonOrThrow(response, 'İş akışı iptal edilemedi.');
}

// ─── Inbox ──────────────────────────────────────────────────────────────────

export async function fetchApprovalsInbox() {
    const response = await authedFetch(`${backendBase}/approvals/inbox/`);
    return parseJsonOrThrow(response, 'Onay kutusu yüklenemedi.');
}

// ─── Subject types ───────────────────────────────────────────────────────────

export async function fetchApprovalSubjectTypes() {
    const response = await authedFetch(`${backendBase}/approvals/subject-types/`);
    return parseJsonOrThrow(response, 'Konu türleri yüklenemedi.');
}
