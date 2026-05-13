import { guardRoute, getUser } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { TableComponent } from '../../../components/table/table.js';
import { EditModal } from '../../../components/edit-modal/edit-modal.js';
import { showNotification } from '../../../components/notification/notification.js';
import { initRouteProtection } from '../../../apis/routeProtection.js';
import {
    fetchPolicies,
    fetchPolicy,
    createPolicy,
    patchPolicy,
    deletePolicy,
    createStage,
    patchStage,
    deleteStage,
    fetchApprovalSubjectTypes,
    // Workflow APIs are still imported because the module contains workflow
    // helpers (even though the workflows tab is removed from UI).
    fetchWorkflows,
    fetchWorkflow,
    overrideWorkflowStageApprovers,
    cancelWorkflow
} from '../../../apis/approvals.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SUBJECT_TYPE_LABELS = {
    'vacation_requests.vacationrequest': 'İzin Talebi',
    'overtime.overtimerequest': 'Mesai Talebi',
    'procurement.purchaserequest': 'Satın Alma Talebi',
    'planning.planningrequest': 'Planlama Talebi',
    'subcontracting.subcontractorstatement': 'Taşeron Hakediş',
    'quality_control.ncr': 'UYR',
    'quality_control.qcreview': 'KK İncelemesi'
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let currentUser = null;
let isAdminUser = false;

let policiesTable = null;
let subjectTypesTable = null;
let workflowsTable = null;

let selectedPolicyId = null;
let selectedWorkflowId = null;

let pendingDeleteCallback = null;

let policyEditModal = null;
let cachedApprovalSubjectTypes = null; // [{value,label}]

let stageEditModal = null;

// Stage modal state
let stageModalMode = null; // 'create' | 'edit'
let stageModalPolicyId = null;
let stageModalStageId = null;

// Override modal state
let overrideWorkflowId = null;
let overrideStageOrder = null;

let subjectTypesTabLoaded = false;

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function listFromResponse(data) {
    if (Array.isArray(data)) return data;
    return Array.isArray(data?.results) ? data.results : [];
}

function fmtDate(val) {
    if (!val) return '-';
    try { return new Date(val).toLocaleString('tr-TR'); } catch { return val; }
}

function fmtDateShort(val) {
    if (!val) return '-';
    try { return new Date(val).toLocaleDateString('tr-TR'); } catch { return val; }
}

function subjectTypeLabel(raw) {
    if (!raw) return '-';
    return SUBJECT_TYPE_LABELS[raw] || raw;
}

async function ensureApprovalSubjectTypesLoaded() {
    if (Array.isArray(cachedApprovalSubjectTypes) && cachedApprovalSubjectTypes.length) return cachedApprovalSubjectTypes;
    try {
        const data = await fetchApprovalSubjectTypes();
        const list = Array.isArray(data) ? data : (Array.isArray(data?.results) ? data.results : []);
        cachedApprovalSubjectTypes = list
            .map(x => ({ value: x?.value, label: x?.label }))
            .filter(x => x.value && x.label);
    } catch {
        cachedApprovalSubjectTypes = [];
    }
    return cachedApprovalSubjectTypes;
}

function statusBadge(wf) {
    if (wf.is_cancelled) return '<span class="status-badge status-grey">İptal</span>';
    if (wf.is_rejected)  return '<span class="status-badge status-red">Reddedildi</span>';
    if (wf.is_complete)  return '<span class="status-badge status-green">Tamamlandı</span>';
    return '<span class="status-badge status-blue">Devam Ediyor</span>';
}

function resolverDesc(stage) {
    const parts = [];
    if (stage.climb_levels != null) parts.push(`${stage.climb_levels} kademe yukarı`);
    if (stage.role_department_code) parts.push(`Departman: ${stage.role_department_code}`);
    const users = Array.isArray(stage.approver_users_detail) ? stage.approver_users_detail : [];
    if (users.length) parts.push(`Sabit: ${users.map(u => u.full_name || u.username).join(', ')}`);
    else if (Array.isArray(stage.approver_users) && stage.approver_users.length) {
        parts.push(`Sabit kullanıcı: ${stage.approver_users.join(', ')}`);
    }
    return parts.length ? parts.join(' + ') : '<span class="text-muted">—</span>';
}

function parseUserIds(raw) {
    if (!raw || !raw.trim()) return [];
    return raw.split(',')
        .map(s => parseInt(s.trim(), 10))
        .filter(n => !isNaN(n));
}

// ---------------------------------------------------------------------------
// Bootstrap modal helpers
// ---------------------------------------------------------------------------

function bsModal(id) {
    const el = document.getElementById(id);
    if (!el) return null;
    return bootstrap.Modal.getOrCreateInstance(el);
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) return;
    if (!initRouteProtection()) return;
    await initNavbar();

    currentUser = await getUser();
    isAdminUser = currentUser && (currentUser.is_superuser || currentUser.is_admin);

    new HeaderComponent({
        title: 'Onay Yönetimi',
        subtitle: 'Onay politikalarını ve canlı iş akışlarını yönetin',
        icon: 'check-double',
        showBackButton: 'block',
        backUrl: '/it/',
        showCreateButton: 'none',
        showRefreshButton: 'block',
        onRefreshClick: async () => { await refreshActiveTab(); }
    });

    initPoliciesTable();
    initSubjectTypesTable();
    await loadPolicies();

    document.getElementById('tab-subject-types-tab')?.addEventListener('shown.bs.tab', async () => {
        if (!subjectTypesTabLoaded) {
            await loadSubjectTypes();
            subjectTypesTabLoaded = true;
        }
    });

    // Stage modal now uses EditModal component
    attachOverrideModalHandlers();
    attachDeleteModalHandlers();
});

async function refreshActiveTab() {
    const active = document.querySelector('#approvals-tabs .nav-link.active');
    const target = active?.getAttribute('data-bs-target');
    if (target === '#tab-subject-types') {
        await loadSubjectTypes();
        return;
    }
    await loadPolicies();
    if (selectedPolicyId) await renderPolicyPanel(selectedPolicyId);
}

// ---------------------------------------------------------------------------
// POLICIES TAB
// ---------------------------------------------------------------------------

function initPoliciesTable() {
    policiesTable = new TableComponent('policies-table-container', {
        title: 'Onay Politikaları',
        icon: 'fas fa-layer-group',
        iconColor: 'text-primary',
        columns: [
            {
                field: 'name',
                label: 'Ad',
                sortable: true,
                formatter: (v, row) => `
                    <div class="fw-semibold">${escapeHtml(v)}</div>
                    ${row.subject_type === 'purchase_request' && (row.min_amount_eur != null || row.max_amount_eur != null)
                        ? `<div class="text-muted small">
                               ${row.min_amount_eur != null ? `≥ €${row.min_amount_eur}` : ''}
                               ${row.max_amount_eur != null ? ` – ≤ €${row.max_amount_eur}` : ''}
                           </div>`
                        : ''
                    }`
            },
            {
                field: 'subject_type',
                label: 'Konu',
                sortable: true,
                formatter: v => escapeHtml(subjectTypeLabel(v))
            },
            {
                field: 'is_active',
                label: 'Durum',
                width: '90px',
                sortable: true,
                formatter: v => v
                    ? '<span class="status-badge status-green">Aktif</span>'
                    : '<span class="status-badge status-grey">Pasif</span>'
            },
            {
                field: 'selection_priority',
                label: 'Öncelik',
                width: '80px',
                sortable: true,
                type: 'number',
                formatter: v => `<span class="badge bg-secondary">${v ?? '-'}</span>`
            },
            {
                field: 'stage_count',
                label: 'Aşama',
                width: '70px',
                sortable: true,
                type: 'number',
                formatter: v => `<span class="badge bg-info text-dark">${v}</span>`
            },
            {
                field: 'live_workflow_count',
                label: 'Canlı',
                width: '70px',
                sortable: true,
                type: 'number',
                formatter: v => `<span class="badge bg-primary">${Number(v || 0)}</span>`
            },
            {
                field: 'total_workflow_count',
                label: 'Toplam',
                width: '80px',
                sortable: true,
                type: 'number',
                formatter: v => `<span class="badge bg-secondary">${Number(v || 0)}</span>`
            },
            {
                field: 'climb_levels',
                label: 'Kademe',
                width: '80px',
                sortable: true,
                type: 'number',
                formatter: v => (v == null ? '<span class="text-muted">—</span>' : `<span class="badge bg-light text-dark border">${escapeHtml(v)}</span>`)
            }
        ],
        actions: [
            {
                key: 'edit',
                label: 'Düzenle',
                icon: 'fas fa-edit',
                class: 'btn-outline-primary',
                onClick: row => openPolicyModal('edit', row)
            },
            {
                key: 'delete',
                label: 'Sil',
                icon: 'fas fa-trash',
                class: 'btn-outline-danger',
                onClick: row => confirmDeletePolicy(row.id, row.name)
            }
        ],
        headerActions: [
            {
                label: 'Yeni Politika',
                icon: 'fas fa-plus',
                class: 'btn-primary btn-sm',
                onClick: () => openPolicyModal('create')
            }
        ],
        pagination: false,
        loading: true,
        emptyMessage: 'Politika bulunamadı.',
        emptyIcon: 'fas fa-layer-group',
        onRowClick: row => {
            selectedPolicyId = row.id;
            renderPolicyPanel(row.id);
        }
    });
}

async function loadPolicies() {
    try {
        if (policiesTable) policiesTable.setLoading(true);
        const data = await fetchPolicies();
        const rows = listFromResponse(data).map(p => ({
            id: p.id,
            name: p.name,
            is_active: p.is_active,
            subject_type: p.subject_type,
            selection_priority: p.selection_priority,
            min_amount_eur: p.min_amount_eur ?? null,
            max_amount_eur: p.max_amount_eur ?? null,
            stage_count: Array.isArray(p.stages) ? p.stages.length : 0,
            live_workflow_count: p.live_workflow_count ?? 0,
            total_workflow_count: p.total_workflow_count ?? 0,
            climb_levels: p.climb_levels ?? null,
            raw: p
        }));
        policiesTable.updateData(rows, rows.length, 1);
    } catch (e) {
        showNotification(e.message || 'Politikalar yüklenemedi.', 'error');
        policiesTable.updateData([], 0, 1);
    } finally {
        policiesTable.setLoading(false);
    }
}

async function renderPolicyPanel(policyId) {
    const panel = document.getElementById('policy-detail-panel');
    if (!panel) return;
    panel.innerHTML = `<div class="card shadow-sm h-100"><div class="card-body text-muted text-center py-5">
        <i class="fas fa-spinner fa-spin me-1"></i>Yükleniyor...</div></div>`;
    try {
        const policy = await fetchPolicy(policyId);
        const stages = Array.isArray(policy.stages) ? [...policy.stages].sort((a, b) => a.order - b.order) : [];

        const metaRows = [
            policy.subject_type === 'purchase_request' && policy.min_amount_eur != null
                ? `<div class="small text-muted">Min: €${policy.min_amount_eur}</div>`
                : '',
            policy.subject_type === 'purchase_request' && policy.max_amount_eur != null
                ? `<div class="small text-muted">Maks: €${policy.max_amount_eur}</div>`
                : '',
            policy.is_rolling_mill ? `<div class="small text-muted"><i class="fas fa-industry me-1"></i>Hadde hattı</div>` : '',
        ].filter(Boolean).join('');

        const stagesHtml = stages.length
            ? stages.map(s => renderStageCard(s, policyId)).join('')
            : `<div class="text-muted small py-2">Henüz aşama yok.</div>`;

        panel.innerHTML = `
            <div class="card shadow-sm h-100">
                <div class="card-body d-flex flex-column" style="overflow-y: auto;">
                    <div class="d-flex align-items-start justify-content-between mb-2">
                        <div>
                            <h5 class="mb-1">
                                <i class="fas fa-layer-group me-2 text-primary"></i>${escapeHtml(policy.name)}
                            </h5>
                            <div class="d-flex flex-wrap gap-2 align-items-center mb-1">
                                ${policy.is_active
                                    ? '<span class="status-badge status-green">Aktif</span>'
                                    : '<span class="status-badge status-grey">Pasif</span>'}
                                <span class="badge bg-secondary">Öncelik: ${policy.selection_priority ?? '-'}</span>
                            </div>
                            ${metaRows}
                        </div>
                        <div class="d-flex gap-1">
                            <button class="btn btn-sm btn-outline-primary" onclick="window._editPolicy()">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-danger" onclick="window._deletePolicy()">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>

                    <hr class="my-2">

                    <div class="d-flex align-items-center justify-content-between mb-2">
                        <h6 class="mb-0"><i class="fas fa-list-ol me-1 text-secondary"></i>Aşamalar</h6>
                        <button class="btn btn-sm btn-outline-success" onclick="window._addStage()">
                            <i class="fas fa-plus me-1"></i>Aşama Ekle
                        </button>
                    </div>

                    <div id="stage-list">
                        ${stagesHtml}
                    </div>
                </div>
            </div>
        `;

        window._editPolicy = () => openPolicyModal('edit', policy);
        window._deletePolicy = () => confirmDeletePolicy(policy.id, policy.name);
        window._addStage = () => openStageModal('create', policyId, null);

    } catch (e) {
        panel.innerHTML = `<div class="card shadow-sm h-100"><div class="card-body text-danger py-4">
            <i class="fas fa-exclamation-circle me-1"></i>${escapeHtml(e.message || 'Yüklenemedi.')}</div></div>`;
    }
}

function renderStageCard(stage, policyId) {
    const resolverHtml = resolverDesc(stage);
    const requiredBadge = `<span class="badge bg-primary">${stage.required_approvals} onay gerekli</span>`;

    return `
        <div class="stage-card" data-stage-id="${stage.id}">
            <div class="stage-card__header">
                <span class="stage-order-pill">${stage.order}</span>
                <span class="fw-semibold flex-grow-1">${escapeHtml(stage.name)}</span>
                ${requiredBadge}
                <button class="btn btn-xs btn-outline-primary ms-1" style="padding:0.1rem 0.45rem;font-size:0.75rem;"
                        onclick="window._editStage(${stage.id})">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-xs btn-outline-danger ms-1" style="padding:0.1rem 0.45rem;font-size:0.75rem;"
                        onclick="window._deleteStage(${stage.id}, '${escapeHtml(stage.name)}', ${policyId})">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
            <div class="stage-card__body">
                <div class="small text-muted">${resolverHtml}</div>
            </div>
        </div>
    `;
}

// ---------------------------------------------------------------------------
// Policy modal
// ---------------------------------------------------------------------------

async function openPolicyModal(mode, policy = null) {
    const isEdit = mode === 'edit';

    if (!policyEditModal) {
        policyEditModal = new EditModal('policy-modal-container', {
            title: 'Politika',
            icon: 'fas fa-layer-group',
            size: 'lg',
            saveButtonText: 'Kaydet'
        });
        policyEditModal.onSaveCallback(async (data) => {
            const name = String(data?.name ?? '').trim();
            if (!name) {
                showNotification('Ad gereklidir.', 'error');
                return;
            }

                const subjectType = String(data?.subject_type ?? '').trim();
            const payload = {
                name,
                subject_type: subjectType || null,
                is_active: data?.is_active !== false,
                selection_priority: Number.parseInt(String(data?.selection_priority ?? ''), 10) || 100
            };

                const isPurchaseRequest = subjectType === 'purchase_request';
                if (isPurchaseRequest) {
                    const minRaw = String(data?.min_amount_eur ?? '').trim();
                    const maxRaw = String(data?.max_amount_eur ?? '').trim();
                    payload.min_amount_eur = minRaw !== '' ? Number(minRaw) : null;
                    payload.max_amount_eur = maxRaw !== '' ? Number(maxRaw) : null;
                } else {
                    // Only purchase_request supports min/max bounds in UI.
                    payload.min_amount_eur = null;
                    payload.max_amount_eur = null;
                }

            try {
                if (policyEditModal._mode === 'edit' && policyEditModal._policyId) {
                    await patchPolicy(policyEditModal._policyId, payload);
                    showNotification('Politika güncellendi.', 'success');
                } else {
                    await createPolicy(payload);
                    showNotification('Politika oluşturuldu.', 'success');
                }
                policyEditModal.hide();
                await loadPolicies();
                if (selectedPolicyId) await renderPolicyPanel(selectedPolicyId);
            } catch (e) {
                showNotification(e.message || 'Kayıt başarısız.', 'error');
                throw e;
            }
        });
    }

    policyEditModal._mode = isEdit ? 'edit' : 'create';
    policyEditModal._policyId = isEdit ? (policy?.id ?? null) : null;

    policyEditModal.clearAll();
    policyEditModal.setTitle(isEdit ? 'Politikayı Düzenle' : 'Yeni Politika');
    policyEditModal.addSection({ title: 'Politika', icon: 'fas fa-layer-group', iconColor: 'text-primary' });

    // Subject types (value+TR label) are served by backend and accessible for any auth user.
    // Load them on demand for the modal.
    const subjectTypes = await ensureApprovalSubjectTypesLoaded();
    const subjectTypeOptions = [
        { value: '', label: 'Seçiniz...' },
        ...subjectTypes.map(st => ({ value: st.value, label: st.label }))
    ];
    policyEditModal.addField({
        id: 'subject_type',
        name: 'subject_type',
        label: 'Konu Türü',
        type: 'dropdown',
        options: subjectTypeOptions,
        value: policy?.subject_type ? String(policy.subject_type) : '',
        searchable: true,
        required: true,
        colSize: 12
    });

    policyEditModal.addField({
        id: 'name',
        name: 'name',
        label: 'Ad',
        type: 'text',
        value: policy?.name || '',
        required: true,
        colSize: 12
    });
    policyEditModal.addField({
        id: 'min_amount_eur',
        name: 'min_amount_eur',
        label: 'Min. Tutar (€)',
        type: 'number',
        value: policy?.min_amount_eur ?? '',
        min: 0,
        step: 0.01,
        colSize: 6
    });
    policyEditModal.addField({
        id: 'max_amount_eur',
        name: 'max_amount_eur',
        label: 'Maks. Tutar (€)',
        type: 'number',
        value: policy?.max_amount_eur ?? '',
        min: 0,
        step: 0.01,
        colSize: 6
    });
    policyEditModal.addField({
        id: 'selection_priority',
        name: 'selection_priority',
        label: 'Seçim Önceliği',
        type: 'number',
        value: policy?.selection_priority ?? 100,
        min: 1,
        help: 'Düşük sayı daha yüksek öncelik demektir (1, 100’den önce gelir).',
        colSize: 6
    });
    policyEditModal.addField({
        id: 'is_active',
        name: 'is_active',
        label: 'Aktif (kullanımda)',
        type: 'checkbox',
        value: policy?.is_active !== false,
        colSize: 12
    });
    policyEditModal.render();

    // Show min/max only for purchase_request.
    setTimeout(() => {
        const container = policyEditModal?.container;
        if (!container) return;

        const getFieldGroup = (fieldId) => container.querySelector(`[data-field-id="${fieldId}"]`);
        const minGroup = getFieldGroup('min_amount_eur');
        const maxGroup = getFieldGroup('max_amount_eur');

        const applyVisibility = () => {
            const st = String(policyEditModal.getFieldValue('subject_type') || '').trim();
            const show = st === 'purchase_request';
            if (minGroup) minGroup.style.display = show ? '' : 'none';
            if (maxGroup) maxGroup.style.display = show ? '' : 'none';
            if (!show) {
                policyEditModal.setFieldValue('min_amount_eur', '');
                policyEditModal.setFieldValue('max_amount_eur', '');
            }
        };

        applyVisibility();
        const stContainer = container.querySelector('#dropdown-subject_type');
        stContainer?.addEventListener('dropdown:select', applyVisibility);
    }, 0);

    policyEditModal.show();
}

// ---------------------------------------------------------------------------
// Stage modal (EditModal component)
// ---------------------------------------------------------------------------

function ensureStageEditModal() {
    if (stageEditModal) return stageEditModal;

    stageEditModal = new EditModal('stage-modal-container', {
        title: 'Aşama',
        icon: 'fas fa-layer-group',
        size: 'lg',
        saveButtonText: 'Kaydet'
    });

    stageEditModal.onSaveCallback(async (data) => {
        const name = String(data?.name ?? '').trim();
        const order = Number.parseInt(String(data?.order ?? ''), 10);
        if (!name || !Number.isFinite(order)) {
            showNotification('Ad ve sıra gereklidir.', 'error');
            return;
        }

        const resolverType = String(data?.resolver_type ?? 'none').trim();
        const payload = {
            name,
            order,
            required_approvals: Number.parseInt(String(data?.required_approvals ?? ''), 10) || 1,
            approver_users: parseUserIds(String(data?.approver_users ?? '')),
            climb_levels: resolverType === 'climb'
                ? (Number.parseInt(String(data?.climb_levels ?? ''), 10) || 1)
                : null,
            role_department_code: resolverType === 'department'
                ? (String(data?.role_department_code ?? '').trim() || null)
                : null
        };

        try {
            if (stageEditModal._mode === 'create') {
                await createStage(stageEditModal._policyId, payload);
                showNotification('Aşama eklendi.', 'success');
            } else {
                await patchStage(stageEditModal._stageId, payload);
                showNotification('Aşama güncellendi.', 'success');
            }
            stageEditModal.hide();
            await renderPolicyPanel(stageEditModal._policyId);
            await loadPolicies();
        } catch (e) {
            showNotification(e.message || 'Kayıt başarısız.', 'error');
            throw e;
        }
    });

    return stageEditModal;
}

function openStageModal(mode, policyId, stage = null) {
    stageModalMode = mode;
    stageModalPolicyId = policyId;
    stageModalStageId = stage?.id ?? null;

    const modal = ensureStageEditModal();
    modal._mode = mode;
    modal._policyId = policyId;
    modal._stageId = stage?.id ?? null;

    modal.clearAll();
    modal.setTitle(mode === 'create' ? 'Aşama Ekle' : 'Aşamayı Düzenle');
    modal.addSection({ title: 'Aşama', icon: 'fas fa-list-ol', iconColor: 'text-primary' });

    const resolverType =
        stage?.climb_levels != null ? 'climb'
            : (stage?.role_department_code ? 'department' : 'none');

    modal.addField({ id: 'name', name: 'name', label: 'Ad', type: 'text', value: stage?.name ?? '', required: true, colSize: 8 });
    modal.addField({ id: 'order', name: 'order', label: 'Sıra', type: 'number', value: stage?.order ?? '', min: 1, required: true, colSize: 4 });
    modal.addField({ id: 'required_approvals', name: 'required_approvals', label: 'Gerekli Onay Sayısı', type: 'number', value: stage?.required_approvals ?? 1, min: 1, colSize: 6 });

    modal.addField({
        id: 'resolver_type',
        name: 'resolver_type',
        label: 'Onaylayıcı Çözümü',
        type: 'dropdown',
        searchable: false,
        options: [
            { value: 'none', label: 'Sabit kullanıcılar' },
            { value: 'climb', label: 'Kademeye göre (yukarı tırman)' },
            { value: 'department', label: 'Departman rolü' }
        ],
        value: resolverType,
        colSize: 6
    });

    modal.addField({
        id: 'climb_levels',
        name: 'climb_levels',
        label: 'Kaç kademe yukarı?',
        type: 'number',
        value: stage?.climb_levels ?? 1,
        min: 1,
        colSize: 6
    });

    modal.addField({
        id: 'role_department_code',
        name: 'role_department_code',
        label: 'Departman Kodu',
        type: 'text',
        value: stage?.role_department_code ?? '',
        placeholder: 'örn: machining',
        colSize: 12
    });

    modal.addField({
        id: 'approver_users',
        name: 'approver_users',
        label: 'Sabit Onaylayıcı Kullanıcı ID’leri',
        type: 'textarea',
        value: Array.isArray(stage?.approver_users) ? stage.approver_users.join(', ') : '',
        rows: 2,
        placeholder: 'örn: 12, 34, 56',
        help: 'Virgülle ayrılmış kullanıcı ID listesi.',
        colSize: 12
    });

    modal.render();

    // Toggle resolver-dependent fields
    setTimeout(() => {
        const c = modal.container;
        if (!c) return;
        const grp = (id) => c.querySelector(`[data-field-id="${id}"]`);
        const climbGrp = grp('climb_levels');
        const deptGrp = grp('role_department_code');
        const usersGrp = grp('approver_users');

        const setLayout = (rtRaw) => {
            const rt = String(rtRaw || 'none');
            const showClimb = rt === 'climb';
            const showDept = rt === 'department';
            if (climbGrp) climbGrp.style.display = showClimb ? '' : 'none';
            if (deptGrp) deptGrp.style.display = showDept ? '' : 'none';
            if (usersGrp) usersGrp.style.display = (!showClimb && !showDept) ? '' : 'none';
        };

        // Ensure edit modal shows correct layout immediately (even before dropdown initializes).
        setLayout(resolverType);

        const applyFromModalState = () => setLayout(modal.getFieldValue('resolver_type'));

        // Re-apply after dropdown has had time to initialize.
        setTimeout(applyFromModalState, 200);

        c.querySelector('#dropdown-resolver_type')?.addEventListener('dropdown:select', applyFromModalState);
    }, 0);

    modal.show();
}

// Stage actions exposed globally (called from dynamic HTML)
window._editStage = async (stageId) => {
    // Find stage in the current policy
    const policy = await fetchPolicy(selectedPolicyId).catch(() => null);
    if (!policy) return;
    const stage = (policy.stages || []).find(s => s.id === stageId);
    if (!stage) return;
    openStageModal('edit', selectedPolicyId, stage);
};

window._deleteStage = (stageId, stageName, policyId) => {
    showConfirmDelete(
        `"${stageName}" aşamasını silmek istediğinize emin misiniz?`,
        async () => {
            try {
                await deleteStage(stageId);
                showNotification('Aşama silindi.', 'success');
                await renderPolicyPanel(policyId);
                await loadPolicies();
            } catch (e) {
                showNotification(e.message || 'Silinemedi.', 'error');
            }
        }
    );
};

// ---------------------------------------------------------------------------
// Delete policy
// ---------------------------------------------------------------------------

function confirmDeletePolicy(policyId, policyName) {
    showConfirmDelete(
        `"${policyName}" politikasını silmek istediğinize emin misiniz? Canlı iş akışı varsa silinmez.`,
        async () => {
            try {
                await deletePolicy(policyId);
                showNotification('Politika silindi.', 'success');
                if (selectedPolicyId === policyId) {
                    selectedPolicyId = null;
                    document.getElementById('policy-detail-panel').innerHTML = '';
                }
                await loadPolicies();
            } catch (e) {
                showNotification(e.message || 'Silinemedi.', 'error');
            }
        }
    );
}

// ---------------------------------------------------------------------------
// Confirm delete helper
// ---------------------------------------------------------------------------

function showConfirmDelete(message, onConfirm) {
    document.getElementById('confirm-delete-message').textContent = message;
    pendingDeleteCallback = onConfirm;
    bsModal('confirm-delete-modal')?.show();
}

function attachDeleteModalHandlers() {
    document.getElementById('confirm-delete-btn')?.addEventListener('click', async () => {
        bsModal('confirm-delete-modal')?.hide();
        if (typeof pendingDeleteCallback === 'function') {
            await pendingDeleteCallback();
            pendingDeleteCallback = null;
        }
    });
}

// ---------------------------------------------------------------------------
// SUBJECT TYPES TAB
// ---------------------------------------------------------------------------

function initSubjectTypesTable() {
    subjectTypesTable = new TableComponent('subject-types-table-container', {
        title: 'Konu Türleri',
        icon: 'fas fa-tags',
        iconColor: 'text-primary',
        columns: [
            { field: 'label', label: 'Ad', sortable: true, formatter: v => `<strong>${escapeHtml(v || '-')}</strong>` },
            { field: 'value', label: 'Kod', sortable: true, formatter: v => `<code>${escapeHtml(v || '-')}</code>` }
        ],
        actions: [],
        pagination: false,
        loading: true,
        emptyMessage: 'Konu türü bulunamadı.',
        emptyIcon: 'fas fa-tags',
        onRowClick: null
    });
}

async function loadSubjectTypes() {
    try {
        if (subjectTypesTable) subjectTypesTable.setLoading(true);
        const data = await fetchApprovalSubjectTypes();
        const rows = listFromResponse(data).map(st => ({
            value: st?.value || '',
            label: st?.label || st?.name || st?.title || st?.value || '-',
            raw: st
        }));
        subjectTypesTable.updateData(rows, rows.length, 1);
    } catch (e) {
        showNotification(e.message || 'Konu türleri yüklenemedi.', 'error');
        subjectTypesTable.updateData([], 0, 1);
    } finally {
        subjectTypesTable.setLoading(false);
    }
}

// ---------------------------------------------------------------------------
// WORKFLOWS TAB
// ---------------------------------------------------------------------------

function initWorkflowsTable() {
    workflowsTable = new TableComponent('workflows-table-container', {
        title: 'Canlı İş Akışları',
        icon: 'fas fa-stream',
        iconColor: 'text-primary',
        columns: [
            {
                field: 'subject_label',
                label: 'Konu',
                sortable: true,
                formatter: (v, row) => `
                    <div class="fw-semibold">${escapeHtml(v)}</div>
                    <div class="text-muted small">#${row.object_id}</div>`
            },
            {
                field: 'policy_name',
                label: 'Politika',
                sortable: true,
                formatter: v => escapeHtml(v || '-')
            },
            {
                field: 'current_stage_order',
                label: 'Aşama',
                width: '70px',
                sortable: true,
                formatter: v => v != null ? `<span class="badge bg-info text-dark">${v}</span>` : '-'
            },
            {
                field: 'status_html',
                label: 'Durum',
                width: '120px',
                sortable: false
            },
            {
                field: 'created_at',
                label: 'Oluşturulma',
                width: '110px',
                sortable: true,
                formatter: v => fmtDateShort(v)
            }
        ],
        actions: [],
        pagination: true,
        itemsPerPage: 20,
        loading: true,
        emptyMessage: 'İş akışı bulunamadı.',
        emptyIcon: 'fas fa-stream',
        onRowClick: row => {
            selectedWorkflowId = row.id;
            renderWorkflowPanel(row.id);
        }
    });
}

async function loadWorkflows() {
    const filters = {};
    const typeEl = document.getElementById('wf-filter-type');
    const dateFrom = document.getElementById('wf-filter-date-from');
    const dateTo = document.getElementById('wf-filter-date-to');
    const complete = document.getElementById('wf-filter-complete');
    const rejected = document.getElementById('wf-filter-rejected');

    if (typeEl?.value) filters.type = typeEl.value;
    if (dateFrom?.value) filters.created_after = dateFrom.value;
    if (dateTo?.value) filters.created_before = dateTo.value;
    if (complete?.checked) filters.is_complete = 'true';
    if (rejected?.checked) filters.is_rejected = 'true';

    try {
        if (workflowsTable) workflowsTable.setLoading(true);
        const data = await fetchWorkflows(filters);
        const rows = listFromResponse(data).map(wf => ({
            id: wf.id,
            subject_label: subjectTypeLabel(wf.subject_type),
            object_id: wf.object_id,
            policy_name: wf.policy_name,
            current_stage_order: wf.current_stage_order,
            status_html: statusBadge(wf),
            created_at: wf.created_at,
            raw: wf
        }));
        workflowsTable.updateData(rows, rows.length, 1);
    } catch (e) {
        showNotification(e.message || 'İş akışları yüklenemedi.', 'error');
        workflowsTable.updateData([], 0, 1);
    } finally {
        if (workflowsTable) workflowsTable.setLoading(false);
    }
}

async function renderWorkflowPanel(workflowId) {
    const panel = document.getElementById('workflow-detail-panel');
    if (!panel) return;
    panel.innerHTML = `<div class="card shadow-sm h-100"><div class="card-body text-muted text-center py-5">
        <i class="fas fa-spinner fa-spin me-1"></i>Yükleniyor...</div></div>`;

    try {
        const wf = await fetchWorkflow(workflowId);
        const stages = Array.isArray(wf.stage_instances)
            ? [...wf.stage_instances].sort((a, b) => a.order - b.order)
            : [];

        const timelineHtml = stages.map(si => {
            let dotClass = 'pending';
            if (si.is_rejected) dotClass = 'rejected';
            else if (si.is_complete) dotClass = 'complete';
            else if (si.order === wf.current_stage_order) dotClass = 'current';

            const approversHtml = Array.isArray(si.approvers_detail) && si.approvers_detail.length
                ? si.approvers_detail.map(u => `<span class="badge bg-light text-dark border me-1">${escapeHtml(u.full_name || u.username)}</span>`).join('')
                : '<span class="text-muted small">—</span>';

            const decisionsHtml = Array.isArray(si.decisions) && si.decisions.length
                ? si.decisions.map(d => `
                    <div class="decision-row d-flex align-items-center gap-2">
                        <span class="badge ${d.decision === 'approve' ? 'bg-success' : 'bg-danger'}">
                            ${d.decision === 'approve' ? 'Onaylandı' : 'Reddedildi'}
                        </span>
                        <span class="fw-semibold small">${escapeHtml(d.approver_full_name || d.approver_username || '-')}</span>
                        <span class="text-muted small ms-auto">${fmtDate(d.decided_at)}</span>
                        ${d.comment ? `<div class="text-muted small fst-italic mt-1 w-100">${escapeHtml(d.comment)}</div>` : ''}
                    </div>`).join('')
                : '<div class="text-muted small">Karar yok.</div>';

            const isCurrentActive = si.order === wf.current_stage_order && !wf.is_complete && !wf.is_cancelled;

            return `
                <div class="timeline-stage">
                    <div class="timeline-dot ${dotClass}"></div>
                    <div class="card border-0 shadow-sm mb-2 ms-1">
                        <div class="card-body py-2 px-3">
                            <div class="d-flex align-items-center gap-2 mb-1">
                                <span class="stage-order-pill">${si.order}</span>
                                <span class="fw-semibold">${escapeHtml(si.name)}</span>
                                <span class="badge bg-secondary ms-auto">${si.approved_count}/${si.required_approvals}</span>
                                ${isCurrentActive && isAdminUser ? `
                                    <button class="btn btn-xs btn-outline-warning ms-1" style="padding:0.1rem 0.45rem;font-size:0.73rem;"
                                            onclick="window._overrideApprovers(${wf.id}, ${si.order}, ${JSON.stringify(si.approver_user_ids)}, ${si.required_approvals})">
                                        <i class="fas fa-user-edit me-1"></i>Güncelle
                                    </button>` : ''}
                            </div>
                            <div class="mb-1">${approversHtml}</div>
                            <div>${decisionsHtml}</div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        const adminActions = isAdminUser && !wf.is_complete && !wf.is_cancelled ? `
            <button class="btn btn-sm btn-outline-danger" onclick="window._cancelWorkflow(${wf.id})">
                <i class="fas fa-ban me-1"></i>Zorla İptal
            </button>` : '';

        panel.innerHTML = `
            <div class="card shadow-sm h-100">
                <div class="card-body d-flex flex-column" style="overflow-y: auto;">
                    <div class="d-flex align-items-start justify-content-between mb-2">
                        <div>
                            <h6 class="mb-1">
                                <i class="fas fa-stream me-2 text-primary"></i>
                                İş Akışı #${wf.id}
                            </h6>
                            <div class="d-flex flex-wrap gap-2 align-items-center mb-1">
                                ${statusBadge(wf)}
                                <span class="badge bg-secondary">${escapeHtml(wf.policy_name || '-')}</span>
                            </div>
                            <div class="small text-muted">
                                ${subjectTypeLabel(wf.subject_type)} #${wf.object_id}
                                &middot; ${fmtDate(wf.created_at)}
                            </div>
                        </div>
                        <div>${adminActions}</div>
                    </div>

                    <hr class="my-2">

                    <div class="workflow-timeline flex-grow-1">
                        ${timelineHtml || '<div class="text-muted">Aşama yok.</div>'}
                    </div>
                </div>
            </div>
        `;

        window._cancelWorkflow = (wfId) => {
            showConfirmDelete(
                'Bu iş akışını zorla iptal etmek istediğinize emin misiniz?',
                async () => {
                    try {
                        await cancelWorkflow(wfId);
                        showNotification('İş akışı iptal edildi.', 'success');
                        await loadWorkflows();
                        await renderWorkflowPanel(wfId);
                    } catch (e) {
                        showNotification(e.message || 'İptal başarısız.', 'error');
                    }
                }
            );
        };

        window._overrideApprovers = (wfId, stageOrder, currentIds, required) => {
            overrideWorkflowId = wfId;
            overrideStageOrder = stageOrder;
            document.getElementById('override-user-ids').value = (currentIds || []).join(', ');
            document.getElementById('override-required').value = required ?? 1;
            bsModal('override-approvers-modal')?.show();
        };

    } catch (e) {
        panel.innerHTML = `<div class="card shadow-sm h-100"><div class="card-body text-danger py-4">
            <i class="fas fa-exclamation-circle me-1"></i>${escapeHtml(e.message || 'Yüklenemedi.')}</div></div>`;
    }
}

// ---------------------------------------------------------------------------
// Override approvers modal
// ---------------------------------------------------------------------------

function attachOverrideModalHandlers() {
    document.getElementById('override-save-btn')?.addEventListener('click', async () => {
        const ids = parseUserIds(document.getElementById('override-user-ids').value);
        if (!ids.length) { showNotification('En az bir kullanıcı ID\'si giriniz.', 'error'); return; }

        const required = parseInt(document.getElementById('override-required').value, 10) || 1;
        const btn = document.getElementById('override-save-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Güncelleniyor...';

        try {
            await overrideWorkflowStageApprovers(overrideWorkflowId, overrideStageOrder, {
                approver_user_ids: ids,
                required_approvals: required
            });
            showNotification('Onaylayıcılar güncellendi.', 'success');
            bsModal('override-approvers-modal')?.hide();
            await renderWorkflowPanel(overrideWorkflowId);
            await loadWorkflows();
        } catch (e) {
            showNotification(e.message || 'Güncelleme başarısız.', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-user-edit me-1"></i>Güncelle';
        }
    });
}
