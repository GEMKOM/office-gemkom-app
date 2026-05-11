import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { TableComponent } from '../../../components/table/table.js';
import { DisplayModal } from '../../../components/display-modal/display-modal.js';
import { ConfirmationModal } from '../../../components/confirmation-modal/confirmation-modal.js';
import { showNotification } from '../../../components/notification/notification.js';
import {
    LEAVE_TYPES,
    fetchVacationRequest,
    fetchPendingVacationApprovalRequests,
    fetchVacationDecisionsByMe,
    approveVacationRequest,
    rejectVacationRequest
} from '../../../apis/vacationRequests.js';

let pendingTable = null;
let decisionsTable = null;
let detailModal = null;
let approveModal = null;
let currentPending = [];
let currentDecisions = [];
let currentRejectRequestId = null;

const leaveTypeLabelMap = new Map(LEAVE_TYPES.map(item => [item.value, item.label]));

function parseListResponse(response) {
    if (Array.isArray(response)) return { results: response, count: response.length };
    const results = Array.isArray(response?.results) ? response.results : [];
    return { results, count: Number(response?.count ?? results.length) };
}

function getStatusBadge(status, statusLabel) {
    const text = statusLabel || status || '-';
    const cls = status === 'approved'
        ? 'status-green'
        : status === 'submitted'
            ? 'status-yellow'
            : status === 'rejected' || status === 'cancelled'
                ? 'status-red'
                : 'status-grey';
    return `<span class="status-badge ${cls}">${text}</span>`;
}

function renderApprovalSummary(request) {
    const approval = request?.approval;
    if (!approval || request?.status !== 'submitted') return '<span class="text-muted">-</span>';
    const stages = Array.isArray(approval.stage_instances) ? approval.stage_instances : [];
    const currentStage = stages.find(stage => !stage?.is_complete && !stage?.is_rejected);
    if (!currentStage) return '<span class="text-success"><i class="fas fa-check-circle me-1"></i>Tamamlandı</span>';
    const remaining = Math.max(0, Number(currentStage.required_approvals || 0) - Number(currentStage.approved_count || 0));
    return `
        <div style="line-height:1.2;">
            <div class="fw-semibold text-primary">${currentStage.name || 'Onay'}</div>
            <div class="small text-muted">${remaining} onay bekleniyor</div>
        </div>
    `;
}

async function loadPendingRequests() {
    pendingTable?.setLoading(true);
    try {
        const response = await fetchPendingVacationApprovalRequests();
        const parsed = parseListResponse(response);
        currentPending = parsed.results;
        pendingTable?.updateData(parsed.results, parsed.count, 1);
    } catch (error) {
        showNotification(error?.message || 'Bekleyen talepler yüklenemedi.', 'error');
        currentPending = [];
        pendingTable?.updateData([], 0, 1);
    } finally {
        pendingTable?.setLoading(false);
    }
}

async function loadDecisions() {
    decisionsTable?.setLoading(true);
    try {
        const response = await fetchVacationDecisionsByMe();
        const parsed = parseListResponse(response);
        currentDecisions = parsed.results;
        decisionsTable?.updateData(parsed.results, parsed.count, 1);
    } catch (error) {
        showNotification(error?.message || 'Karar geçmişi yüklenemedi.', 'error');
        currentDecisions = [];
        decisionsTable?.updateData([], 0, 1);
    } finally {
        decisionsTable?.setLoading(false);
    }
}

async function showRequestDetail(requestId) {
    try {
        const request = await fetchVacationRequest(requestId);
        detailModal.clearData();
        detailModal.addSection({ title: 'Genel Bilgiler', icon: 'fas fa-info-circle', iconColor: 'text-primary' });
        detailModal.addField({ id: 'd-id', name: 'd-id', label: 'Talep No', type: 'text', value: String(request.id || '-'), colSize: 4 });
        detailModal.addField({
            id: 'd-type',
            name: 'd-type',
            label: 'İzin Türü',
            type: 'text',
            value: request.leave_type_label || leaveTypeLabelMap.get(request.leave_type) || request.leave_type || '-',
            colSize: 4
        });
        detailModal.addField({ id: 'd-status', name: 'd-status', label: 'Durum', type: 'text', value: request.status_label || request.status || '-', colSize: 4 });
        detailModal.addField({ id: 'd-start', name: 'd-start', label: 'Başlangıç', type: 'text', value: request.start_date || '-', colSize: 4 });
        detailModal.addField({ id: 'd-end', name: 'd-end', label: 'Bitiş', type: 'text', value: request.end_date || '-', colSize: 4 });
        detailModal.addField({ id: 'd-duration', name: 'd-duration', label: 'Süre', type: 'text', value: `${request.duration_days || '0'} gün`, colSize: 4 });
        detailModal.addField({ id: 'd-reason', name: 'd-reason', label: 'Gerekçe', type: 'text', value: request.reason || '-', colSize: 12 });
        detailModal.addCustomSection({ title: 'Onay Özeti', customContent: `<div>${renderApprovalSummary(request)}</div>` });
        detailModal.render();
        detailModal.show();
    } catch (error) {
        showNotification(error?.message || 'Talep detayı alınamadı.', 'error');
    }
}

function showApproveModal(requestId) {
    const req = currentPending.find(item => Number(item.id) === Number(requestId));
    if (!req) return;
    approveModal.show({
        message: `#${req.id} numaralı izin talebi onaylansın mı?`,
        details: `
            <div class="small text-muted">
                <div>Talep Eden: ${req.requester_username || '-'}</div>
                <div>Tarih: ${req.start_date || '-'} - ${req.end_date || '-'}</div>
            </div>
        `,
        onConfirm: async () => {
            try {
                await approveVacationRequest(req.id, '');
                showNotification('İzin talebi onaylandı.', 'success');
                await Promise.all([loadPendingRequests(), loadDecisions()]);
            } catch (error) {
                showNotification(error?.message || 'Onaylama başarısız.', 'error');
                throw error;
            }
        }
    });
}

function showRejectModal(requestId) {
    currentRejectRequestId = requestId;
    const textarea = document.getElementById('reject-comment');
    if (textarea) textarea.value = '';
    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('rejectVacationModal'));
    modal.show();
}

function bindRejectModalHandlers() {
    document.getElementById('confirm-reject-btn')?.addEventListener('click', async () => {
        if (!currentRejectRequestId) return;
        const comment = document.getElementById('reject-comment')?.value?.trim() || '';
        const button = document.getElementById('confirm-reject-btn');
        const original = button?.innerHTML || '';
        try {
            if (button) {
                button.disabled = true;
                button.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Reddediliyor...';
            }
            await rejectVacationRequest(currentRejectRequestId, comment);
            showNotification('İzin talebi reddedildi.', 'success');
            bootstrap.Modal.getOrCreateInstance(document.getElementById('rejectVacationModal')).hide();
            await Promise.all([loadPendingRequests(), loadDecisions()]);
        } catch (error) {
            showNotification(error?.message || 'Reddetme işlemi başarısız.', 'error');
        } finally {
            if (button) {
                button.disabled = false;
                button.innerHTML = original;
            }
            currentRejectRequestId = null;
        }
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) return;
    await initNavbar();

    new HeaderComponent({
        title: 'Bekleyen İzin Onayları',
        subtitle: 'Onayınızda olan izin taleplerini inceleyin ve karar verin',
        icon: 'user-check',
        showBackButton: 'block',
        showCreateButton: 'none',
        onBackClick: () => { window.location.href = '/general/vacation'; }
    });

    detailModal = new DisplayModal('vacation-approval-detail-modal-container', {
        title: 'İzin Talebi Detayı',
        icon: 'fas fa-calendar-alt',
        size: 'xl',
        showEditButton: false
    });
    approveModal = new ConfirmationModal('vacation-approve-modal-container', {
        title: 'İzin Talebi Onayı',
        icon: 'fas fa-check-circle',
        confirmText: 'Evet, Onayla',
        cancelText: 'İptal',
        confirmButtonClass: 'btn-success'
    });

    pendingTable = new TableComponent('pending-table-container', {
        title: 'Onayımı Bekleyen Talepler',
        icon: 'fas fa-clock',
        iconColor: 'text-warning',
        columns: [
            { field: 'id', label: 'Talep No', sortable: true, formatter: v => `<strong>#${v || '-'}</strong>` },
            { field: 'requester_username', label: 'Talep Eden', sortable: true, formatter: v => v || '-' },
            {
                field: 'leave_type',
                label: 'İzin Türü',
                sortable: true,
                formatter: (v, row) => row.leave_type_label || leaveTypeLabelMap.get(v) || v || '-'
            },
            { field: 'start_date', label: 'Başlangıç', sortable: true, type: 'date' },
            { field: 'end_date', label: 'Bitiş', sortable: true, type: 'date' },
            { field: 'duration_days', label: 'İş Günü', sortable: true, formatter: v => String(v || 0) },
            { field: 'approval', label: 'Onay', sortable: false, formatter: (v, row) => renderApprovalSummary(row) },
            { field: 'status', label: 'Durum', sortable: true, formatter: (v, row) => getStatusBadge(v, row.status_label) }
        ],
        actions: [
            { key: 'detail', label: 'Detay', icon: 'fas fa-eye', class: 'btn-outline-primary', onClick: row => showRequestDetail(row.id) },
            { key: 'approve', label: 'Onayla', icon: 'fas fa-check', class: 'btn-outline-success', onClick: row => showApproveModal(row.id), visible: row => row.status === 'submitted' },
            { key: 'reject', label: 'Reddet', icon: 'fas fa-times', class: 'btn-outline-danger', onClick: row => showRejectModal(row.id), visible: row => row.status === 'submitted' }
        ],
        refreshable: true,
        onRefresh: () => loadPendingRequests(),
        pagination: false,
        emptyMessage: 'Bekleyen izin talebi bulunamadı.',
        emptyIcon: 'fas fa-hourglass-end'
    });

    decisionsTable = new TableComponent('decisions-table-container', {
        title: 'Karar Verdiğim Talepler',
        icon: 'fas fa-history',
        iconColor: 'text-info',
        columns: [
            { field: 'id', label: 'Talep No', sortable: true, formatter: v => `<strong>#${v || '-'}</strong>` },
            { field: 'requester_username', label: 'Talep Eden', sortable: true, formatter: v => v || '-' },
            {
                field: 'leave_type',
                label: 'İzin Türü',
                sortable: true,
                formatter: (v, row) => row.leave_type_label || leaveTypeLabelMap.get(v) || v || '-'
            },
            { field: 'start_date', label: 'Başlangıç', sortable: true, type: 'date' },
            { field: 'end_date', label: 'Bitiş', sortable: true, type: 'date' },
            { field: 'status', label: 'Son Durum', sortable: true, formatter: (v, row) => getStatusBadge(v, row.status_label) }
        ],
        actions: [
            { key: 'detail', label: 'Detay', icon: 'fas fa-eye', class: 'btn-outline-primary', onClick: row => showRequestDetail(row.id) }
        ],
        refreshable: true,
        onRefresh: () => loadDecisions(),
        pagination: false,
        emptyMessage: 'Karar geçmişi bulunamadı.',
        emptyIcon: 'fas fa-inbox'
    });

    bindRejectModalHandlers();
    await Promise.all([loadPendingRequests(), loadDecisions()]);
});
