import { authedFetch } from '../../authService.js';
import { backendBase } from '../../base.js';

const BASE = `${backendBase}/sales/offers`;

// ── Status & Enum constants ──────────────────────────────────────────
export const OFFER_STATUS_MAP = {
    draft: 'Taslak',
    consultation: 'Departman Görüşü',
    pricing: 'Fiyatlandırma',
    pending_approval: 'Onay Bekliyor',
    approved: 'Onaylandı',
    submitted_customer: 'Müşteriye Gönderildi',
    won: 'Kazanıldı',
    lost: 'Kaybedildi',
    cancelled: 'İptal'
};

export const OFFER_STATUS_COLORS = {
    draft: 'secondary',
    consultation: 'info',
    pricing: 'warning',
    pending_approval: 'primary',
    approved: 'success',
    submitted_customer: 'dark',
    won: 'success',
    lost: 'danger',
    cancelled: 'danger'
};

export const CURRENCY_OPTIONS = [
    { value: 'TRY', label: 'Türk Lirası (₺)' },
    { value: 'USD', label: 'ABD Doları ($)' },
    { value: 'EUR', label: 'Euro (€)' },
    { value: 'GBP', label: 'İngiliz Sterlini (£)' }
];

export const CURRENCY_SYMBOLS = { TRY: '₺', USD: '$', EUR: '€', GBP: '£' };

export const DEPARTMENT_CHOICES = [
    { value: 'design', label: 'Tasarım' },
    { value: 'planning', label: 'Planlama' },
    { value: 'procurement', label: 'Satın Alma' },
    { value: 'manufacturing', label: 'İmalat' },
    { value: 'painting', label: 'Boyahane' },
    { value: 'logistics', label: 'Lojistik' }
];

export const FILE_TYPE_OPTIONS = [
    { value: 'drawing', label: 'Çizim' },
    { value: 'specification', label: 'Şartname' },
    { value: 'quotation', label: 'Teklif' },
    { value: 'correspondence', label: 'Yazışma' },
    { value: 'photo', label: 'Fotoğraf' },
    { value: 'other', label: 'Diğer' }
];

export const REVISION_TYPE_MAP = {
    initial: 'İlk Teklif',
    sales_revision: 'Satış Revizyonu',
    approver_counter: 'Onayci Karşı Teklif',
    approved: 'Onaylandı'
};

// ── Offer CRUD ───────────────────────────────────────────────────────
export async function listOffers(options = {}) {
    const params = new URLSearchParams();
    if (options.search) params.append('search', options.search);
    if (options.status) params.append('status', options.status);
    if (options.status__in) params.append('status__in', options.status__in);
    if (options.customer) params.append('customer', options.customer);
    if (options.ordering) params.append('ordering', options.ordering);
    if (options.page) params.append('page', options.page);
    if (options.page_size) params.append('page_size', options.page_size);

    const qs = params.toString();
    const response = await authedFetch(`${BASE}/${qs ? '?' + qs : ''}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

export async function getOffer(id) {
    const response = await authedFetch(`${BASE}/${id}/`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

export async function createOffer(data) {
    const response = await authedFetch(`${BASE}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(JSON.stringify(err));
    }
    return response.json();
}

export async function patchOffer(id, data) {
    const response = await authedFetch(`${BASE}/${id}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(JSON.stringify(err));
    }
    return response.json();
}

// ── Offer Items ──────────────────────────────────────────────────────
export async function addOfferItems(offerId, items) {
    const response = await authedFetch(`${BASE}/${offerId}/add-items/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items })
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(JSON.stringify(err));
    }
    return response.json();
}

export async function patchOfferItem(offerId, itemId, data) {
    const response = await authedFetch(`${BASE}/${offerId}/items/${itemId}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(JSON.stringify(err));
    }
    return response.json();
}

export async function deleteOfferItem(offerId, itemId) {
    const response = await authedFetch(`${BASE}/${offerId}/items/${itemId}/`, {
        method: 'DELETE'
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

// ── Offer Files ──────────────────────────────────────────────────────
export async function listOfferFiles(offerId) {
    const response = await authedFetch(`${BASE}/${offerId}/files/`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

export async function uploadOfferFile(offerId, file, fileType, name = '', description = '') {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('file_type', fileType);
    if (name) formData.append('name', name);
    if (description) formData.append('description', description);

    const response = await authedFetch(`${BASE}/${offerId}/files/`, {
        method: 'POST',
        body: formData
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(JSON.stringify(err));
    }
    return response.json();
}

export async function deleteOfferFile(offerId, fileId) {
    const response = await authedFetch(`${BASE}/${offerId}/files/${fileId}/`, {
        method: 'DELETE'
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

// ── Workflow Actions ─────────────────────────────────────────────────
export async function sendConsultations(offerId, departments) {
    const response = await authedFetch(`${BASE}/${offerId}/send-consultations/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ departments })
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || JSON.stringify(err));
    }
    return response.json();
}

export async function getConsultations(offerId) {
    const response = await authedFetch(`${BASE}/${offerId}/consultations/`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

export async function proposePrice(offerId, data) {
    const response = await authedFetch(`${BASE}/${offerId}/propose-price/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || JSON.stringify(err));
    }
    return response.json();
}

export async function getPriceHistory(offerId) {
    const response = await authedFetch(`${BASE}/${offerId}/price-history/`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

export async function submitApproval(offerId, policyId) {
    const response = await authedFetch(`${BASE}/${offerId}/submit-approval/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ policy: policyId })
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || JSON.stringify(err));
    }
    return response.json();
}

export async function getApprovalStatus(offerId) {
    const response = await authedFetch(`${BASE}/${offerId}/approval-status/`);
    if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
}

export async function recordDecision(offerId, data) {
    const response = await authedFetch(`${BASE}/${offerId}/decide/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || JSON.stringify(err));
    }
    return response.json();
}

export async function submitToCustomer(offerId) {
    const response = await authedFetch(`${BASE}/${offerId}/submit-customer/`, {
        method: 'POST'
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || JSON.stringify(err));
    }
    return response.json();
}

export async function markWon(offerId) {
    const response = await authedFetch(`${BASE}/${offerId}/mark-won/`, {
        method: 'POST'
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || JSON.stringify(err));
    }
    return response.json();
}

export async function convertToJobOrder(offerId) {
    const response = await authedFetch(`${BASE}/${offerId}/convert/`, {
        method: 'POST'
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || JSON.stringify(err));
    }
    return response.json();
}

export async function markLost(offerId) {
    const response = await authedFetch(`${BASE}/${offerId}/mark-lost/`, {
        method: 'POST'
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || JSON.stringify(err));
    }
    return response.json();
}

export async function cancelOffer(offerId) {
    const response = await authedFetch(`${BASE}/${offerId}/cancel/`, {
        method: 'POST'
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || JSON.stringify(err));
    }
    return response.json();
}
