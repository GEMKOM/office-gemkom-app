import { authedFetch } from '../authService.js';
import { backendBase } from '../base.js';

/**
 * İSG (İş Sağlığı ve Güvenliği) API Service
 *
 * Reading is open to every signed-in user; creating and administering an issue
 * needs the `create_isg_issues` permission, which `getISGMyPermissions()`
 * reports so the page can hide the buttons it would refuse anyway.
 */

const ISG_BASE = `${backendBase}/isg`;

async function readError(response, fallback) {
    try {
        const data = await response.json();
        return data.message || data.detail || fallback;
    } catch {
        return fallback;
    }
}

// ==================== Issues ====================

/**
 * List İSG issues.
 * @param {Object} filters - status__in, severity__in, category, assigned_to, mine, overdue…
 * @param {string} search - issue number, title, description, location
 * @param {string} ordering - e.g. '-created_at', 'due_date'
 * @param {number} page
 * @param {number} pageSize
 */
export async function listISGIssues(filters = {}, search = '', ordering = '-created_at', page = 1, pageSize = 20) {
    const params = new URLSearchParams();
    params.append('page', String(page));
    params.append('page_size', String(pageSize));
    if (ordering) params.append('ordering', ordering);
    if (search) params.append('search', search);

    Object.keys(filters).forEach(key => {
        const value = filters[key];
        if (value !== null && value !== undefined && value !== '') {
            params.append(key, value);
        }
    });

    const response = await authedFetch(`${ISG_BASE}/issues/?${params.toString()}`);
    if (!response.ok) {
        throw new Error(await readError(response, 'İSG bildirimleri yüklenemedi'));
    }
    const data = await response.json();
    return {
        results: data.results || [],
        count: data.count || 0,
        totalPages: data.total_pages || Math.ceil((data.count || 0) / pageSize)
    };
}

export async function getISGIssue(issueId) {
    const response = await authedFetch(`${ISG_BASE}/issues/${issueId}/`);
    if (!response.ok) {
        throw new Error(await readError(response, 'İSG bildirimi yüklenemedi'));
    }
    return response.json();
}

/** Status/severity counters behind the statistics cards. Accepts the same filters as the list. */
export async function getISGSummary(filters = {}, search = '') {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    Object.keys(filters).forEach(key => {
        const value = filters[key];
        if (value !== null && value !== undefined && value !== '') {
            params.append(key, value);
        }
    });
    const query = params.toString();
    const response = await authedFetch(`${ISG_BASE}/issues/summary/${query ? `?${query}` : ''}`);
    if (!response.ok) {
        throw new Error(await readError(response, 'Özet bilgileri yüklenemedi'));
    }
    return response.json();
}

/** What the signed-in user may do: { can_manage: boolean }. */
export async function getISGMyPermissions() {
    try {
        const response = await authedFetch(`${ISG_BASE}/issues/my-permissions/`);
        if (!response.ok) return { can_manage: false };
        return await response.json();
    } catch {
        return { can_manage: false };
    }
}

export async function createISGIssue(payload) {
    const response = await authedFetch(`${ISG_BASE}/issues/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        throw new Error(await readError(response, 'İSG bildirimi oluşturulamadı'));
    }
    return response.json();
}

export async function updateISGIssue(issueId, updates) {
    const response = await authedFetch(`${ISG_BASE}/issues/${issueId}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
    });
    if (!response.ok) {
        throw new Error(await readError(response, 'İSG bildirimi güncellenemedi'));
    }
    return response.json();
}

export async function deleteISGIssue(issueId) {
    const response = await authedFetch(`${ISG_BASE}/issues/${issueId}/`, { method: 'DELETE' });
    if (!response.ok) {
        throw new Error(await readError(response, 'İSG bildirimi silinemedi'));
    }
}

// ==================== Workflow ====================

async function postAction(issueId, action, body = {}) {
    const response = await authedFetch(`${ISG_BASE}/issues/${issueId}/${action}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (!response.ok) {
        throw new Error(await readError(response, 'İşlem tamamlanamadı'));
    }
    return response.json();
}

/** Assignee takes the issue on (open → in_progress). */
export const startISGIssue = (issueId) => postAction(issueId, 'start');

/** Assignee reports it fixed; the corrective action is mandatory. */
export const resolveISGIssue = (issueId, correctiveAction) =>
    postAction(issueId, 'resolve', { corrective_action: correctiveAction });

/** İSG officer verifies and closes. */
export const closeISGIssue = (issueId, closingNote = '') =>
    postAction(issueId, 'close', { closing_note: closingNote });

/** İSG officer sends it back to the assignees, optionally with a new deadline. */
export const reopenISGIssue = (issueId, comment = '', dueDate = null) =>
    postAction(issueId, 'reopen', dueDate ? { comment, due_date: dueDate } : { comment });

export const cancelISGIssue = (issueId) => postAction(issueId, 'cancel');

// ==================== Files ====================

export async function listISGIssueFiles(issueId) {
    const response = await authedFetch(`${ISG_BASE}/issues/${issueId}/files/`);
    if (!response.ok) {
        throw new Error(await readError(response, 'Dosyalar yüklenemedi'));
    }
    return response.json();
}

export async function uploadISGIssueFile(issueId, file, fileType = 'other', name = '', description = '') {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('file_type', fileType);
    if (name) formData.append('name', name);
    if (description) formData.append('description', description);

    const response = await authedFetch(`${ISG_BASE}/issues/${issueId}/files/upload/`, {
        method: 'POST',
        body: formData
    });
    if (!response.ok) {
        throw new Error(await readError(response, 'Dosya yüklenemedi'));
    }
    return response.json();
}

export async function deleteISGIssueFile(issueId, fileId) {
    const response = await authedFetch(`${ISG_BASE}/issues/${issueId}/files/${fileId}/`, {
        method: 'DELETE'
    });
    if (!response.ok) {
        throw new Error(await readError(response, 'Dosya silinemedi'));
    }
}

// ==================== Choices (mirror isg/models.py) ====================

export const ISG_CATEGORY_CHOICES = [
    { value: 'ppe',               label: 'Kişisel Koruyucu Donanım' },
    { value: 'housekeeping',      label: 'Düzen ve Temizlik' },
    { value: 'electrical',        label: 'Elektrik Güvenliği' },
    { value: 'working_at_height', label: 'Yüksekte Çalışma' },
    { value: 'fire',              label: 'Yangın Güvenliği' },
    { value: 'machine_safety',    label: 'Makine ve Ekipman Güvenliği' },
    { value: 'chemical',          label: 'Kimyasal ve Tehlikeli Madde' },
    { value: 'lifting',           label: 'Kaldırma ve Taşıma' },
    { value: 'ergonomics',        label: 'Ergonomi' },
    { value: 'environment',       label: 'Çevre' },
    { value: 'training',          label: 'Eğitim ve Talimat' },
    { value: 'near_miss',         label: 'Ramak Kala' },
    { value: 'accident',          label: 'İş Kazası' },
    { value: 'other',             label: 'Diğer' }
];

export const ISG_SEVERITY_CHOICES = [
    { value: 'low',      label: 'Düşük' },
    { value: 'medium',   label: 'Orta' },
    { value: 'high',     label: 'Yüksek' },
    { value: 'critical', label: 'Kritik' }
];

export const ISG_STATUS_CHOICES = [
    { value: 'open',        label: 'Açık' },
    { value: 'in_progress', label: 'Devam Ediyor' },
    { value: 'resolved',    label: 'Giderildi (Onay Bekliyor)' },
    { value: 'closed',      label: 'Kapatıldı' },
    { value: 'cancelled',   label: 'İptal Edildi' }
];

export const ISG_FILE_TYPE_OPTIONS = [
    { value: 'photo',    label: 'Fotoğraf' },
    { value: 'report',   label: 'Rapor' },
    { value: 'document', label: 'Doküman' },
    { value: 'other',    label: 'Diğer' }
];

/**
 * Badge classes come from components/badges/badges.css. Yellow is deliberately
 * unused across the app — high severity and open issues take orange instead.
 */
export const ISG_STATUS_BADGE = {
    open:        { class: 'status-orange', label: 'Açık' },
    in_progress: { class: 'status-blue',   label: 'Devam Ediyor' },
    resolved:    { class: 'status-purple', label: 'Onay Bekliyor' },
    closed:      { class: 'status-green',  label: 'Kapatıldı' },
    cancelled:   { class: 'status-grey',   label: 'İptal Edildi' }
};

export const ISG_SEVERITY_BADGE = {
    low:      { class: 'status-grey',   label: 'Düşük' },
    medium:   { class: 'status-blue',   label: 'Orta' },
    high:     { class: 'status-orange', label: 'Yüksek' },
    critical: { class: 'status-red',    label: 'Kritik' }
};
