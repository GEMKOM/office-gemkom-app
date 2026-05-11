import { guardRoute } from '../../authService.js';
import { initNavbar } from '../../components/navbar.js';
import { HeaderComponent } from '../../components/header/header.js';
import { TableComponent } from '../../components/table/table.js';
import { DisplayModal } from '../../components/display-modal/display-modal.js';
import { ConfirmationModal } from '../../components/confirmation-modal/confirmation-modal.js';
import { initRouteProtection } from '../../apis/routeProtection.js';
import { showNotification } from '../../components/notification/notification.js';
import {
    LEAVE_TYPES,
    fetchVacationBalances,
    patchVacationBalance,
    fetchVacationRequest,
    fetchUserLeaveLedger,
    fetchPendingVacationApprovalRequests,
    fetchVacationDecisionsByMe,
    approveVacationRequest,
    rejectVacationRequest
} from '../../apis/vacationRequests.js';

let balancesTable = null;
let pendingTable = null;
let decisionsTable = null;
let detailModal = null;
let approveModal = null;
let leaveLedgerModal = null;
let currentPending = [];
let currentRejectRequestId = null;

const leaveTypeLabelMap = new Map(LEAVE_TYPES.map(item => [item.value, item.label]));

function parseListResponse(response) {
    if (Array.isArray(response)) return { results: response, count: response.length };
    const results = Array.isArray(response?.results) ? response.results : [];
    return { results, count: Number(response?.count ?? results.length) };
}

function statusBadge(status, statusLabel) {
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

function getBalanceFilters() {
    const userIdRaw = document.getElementById('balance-user-id')?.value?.trim() || '';
    const yearRaw = document.getElementById('balance-year-filter')?.value?.trim() || '';
    const filters = {};
    if (userIdRaw) filters.user_id = Number(userIdRaw);
    if (yearRaw) filters.year = Number(yearRaw);
    return filters;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getLeaveLedgerUserIdFromRow(row) {
    const raw = row?.user_id
        ?? row?.user
        ?? row?.user_pk
        ?? row?.user?.id
        ?? row?.employee_id
        ?? row?.employee_user_id
        ?? row?.staff_id;
    const userId = Number(raw);
    return Number.isInteger(userId) && userId > 0 ? userId : null;
}

function setLeaveLedgerLoading(loading) {
    const loadingEl = document.getElementById('leave-ledger-loading');
    const contentEl = document.getElementById('leave-ledger-content');
    if (loadingEl) loadingEl.classList.toggle('d-none', !loading);
    if (contentEl) contentEl.classList.toggle('d-none', loading);
}

function buildLeaveLedgerModalContent() {
    return `
        <div id="leave-ledger-loading" class="text-center py-4 d-none">
            <i class="fas fa-spinner fa-spin me-2"></i>Yükleniyor...
        </div>

        <div id="leave-ledger-content">
            <div class="row g-2 mb-3">
                <div class="col-12 col-md-3"><div class="border rounded p-2"><small class="text-muted d-block">Kullanıcı</small><strong id="leave-ledger-username">-</strong></div></div>
                <div class="col-12 col-md-3"><div class="border rounded p-2"><small class="text-muted d-block">Toplam Gün</small><strong id="leave-ledger-total-days">-</strong></div></div>
                <div class="col-12 col-md-3"><div class="border rounded p-2"><small class="text-muted d-block">Kullanılan</small><strong id="leave-ledger-used-days">-</strong></div></div>
                <div class="col-12 col-md-3"><div class="border rounded p-2"><small class="text-muted d-block">Kalan</small><strong id="leave-ledger-remaining-days">-</strong></div></div>
            </div>

            <div class="table-responsive">
                <table class="table table-sm table-hover">
                    <thead>
                        <tr>
                            <th>Tarih</th>
                            <th>İşlem</th>
                            <th>Delta</th>
                            <th>Bakiye Sonrası</th>
                            <th>Not</th>
                            <th>Oluşturan</th>
                            <th>Talep</th>
                        </tr>
                    </thead>
                    <tbody id="leave-ledger-table-body">
                        <tr>
                            <td colspan="7" class="text-center text-muted py-4">Kayıt bulunamadı.</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function renderLeaveLedgerModal() {
    leaveLedgerModal.clearData();
    leaveLedgerModal.addCustomSection({
        id: 'leave-ledger-content-section',
        customContent: buildLeaveLedgerModalContent()
    });
    leaveLedgerModal.render();
}

function clearLeaveLedgerView() {
    const fields = [
        'leave-ledger-username',
        'leave-ledger-total-days',
        'leave-ledger-used-days',
        'leave-ledger-remaining-days'
    ];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '-';
    });
    const body = document.getElementById('leave-ledger-table-body');
    if (body) {
        body.innerHTML = `
            <tr>
                <td colspan="7" class="text-center text-muted py-4">Kayıt bulunamadı.</td>
            </tr>
        `;
    }
}

function renderLeaveLedger(data) {
    const userEl = document.getElementById('leave-ledger-username');
    const totalEl = document.getElementById('leave-ledger-total-days');
    const usedEl = document.getElementById('leave-ledger-used-days');
    const remainingEl = document.getElementById('leave-ledger-remaining-days');
    const body = document.getElementById('leave-ledger-table-body');

    if (userEl) userEl.textContent = data?.username || '-';
    if (totalEl) totalEl.textContent = data?.current_balance?.total_days || '0';
    if (usedEl) usedEl.textContent = data?.current_balance?.used_days || '0';
    if (remainingEl) remainingEl.textContent = data?.current_balance?.remaining_days || '0';

    const entries = Array.isArray(data?.entries) ? data.entries : [];
    if (!body) return;
    if (!entries.length) {
        body.innerHTML = `
            <tr>
                <td colspan="7" class="text-center text-muted py-4">Hareket bulunamadı.</td>
            </tr>
        `;
        return;
    }

    body.innerHTML = entries.map(entry => {
        const request = entry?.request
            ? `#${entry.request.id || '-'} (${entry.request.start_date || '-'} → ${entry.request.end_date || '-'})`
            : '-';
        return `
            <tr>
                <td>${escapeHtml(entry.date || '-')}</td>
                <td>${escapeHtml(entry.kind_label || entry.kind || '-')}</td>
                <td><strong>${escapeHtml(entry.delta || '-')}</strong></td>
                <td>${escapeHtml(entry.balance_after || '-')}</td>
                <td>${escapeHtml(entry.note || '-')}</td>
                <td>${escapeHtml(entry.created_by || '-')}</td>
                <td>${escapeHtml(request)}</td>
            </tr>
        `;
    }).join('');
}

async function loadLeaveLedger(userId) {
    if (!Number.isInteger(userId) || userId <= 0) {
        showNotification('Kullanıcı ID bulunamadı.', 'warning');
        return;
    }

    setLeaveLedgerLoading(true);
    try {
        const data = await fetchUserLeaveLedger(userId);
        renderLeaveLedger(data);
    } catch (error) {
        clearLeaveLedgerView();
        showNotification(error?.message || 'İzin hareketleri yüklenemedi.', 'error');
    } finally {
        setLeaveLedgerLoading(false);
    }
}

function showLeaveLedgerModalForRow(row) {
    const userIdFromFilter = Number(document.getElementById('balance-user-id')?.value || '');
    const userId = getLeaveLedgerUserIdFromRow(row)
        || (Number.isInteger(userIdFromFilter) && userIdFromFilter > 0 ? userIdFromFilter : null);
    if (!userId) {
        showNotification('Kullanıcı ID bulunamadı. Lütfen üstteki filtreye kullanıcı ID girip tekrar deneyin.', 'warning');
        return;
    }
    renderLeaveLedgerModal();
    clearLeaveLedgerView();
    leaveLedgerModal.show();
    loadLeaveLedger(userId);
}

async function loadBalances() {
    balancesTable?.setLoading(true);
    try {
        const response = await fetchVacationBalances(getBalanceFilters());
        const parsed = parseListResponse(response);
        balancesTable?.updateData(parsed.results, parsed.count, 1);
    } catch (error) {
        showNotification(error?.message || 'İzin bakiyeleri yüklenemedi.', 'error');
        balancesTable?.updateData([], 0, 1);
    } finally {
        balancesTable?.setLoading(false);
    }
}

async function loadPendingApprovals() {
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
        decisionsTable?.updateData(parsed.results, parsed.count, 1);
    } catch (error) {
        showNotification(error?.message || 'Karar geçmişi yüklenemedi.', 'error');
        decisionsTable?.updateData([], 0, 1);
    } finally {
        decisionsTable?.setLoading(false);
    }
}

async function showDetail(requestId) {
    try {
        const request = await fetchVacationRequest(requestId);
        detailModal.clearData();
        detailModal.addSection({ title: 'Talep', icon: 'fas fa-info-circle', iconColor: 'text-primary' });
        detailModal.addField({ id: 'h-id', name: 'h-id', label: 'Talep No', type: 'text', value: String(request.id || '-'), colSize: 4 });
        detailModal.addField({
            id: 'h-type',
            name: 'h-type',
            label: 'İzin Türü',
            type: 'text',
            value: request.leave_type_label || leaveTypeLabelMap.get(request.leave_type) || request.leave_type || '-',
            colSize: 4
        });
        detailModal.addField({ id: 'h-status', name: 'h-status', label: 'Durum', type: 'text', value: request.status_label || request.status || '-', colSize: 4 });
        detailModal.addField({ id: 'h-start', name: 'h-start', label: 'Başlangıç', type: 'text', value: request.start_date || '-', colSize: 6 });
        detailModal.addField({ id: 'h-end', name: 'h-end', label: 'Bitiş', type: 'text', value: request.end_date || '-', colSize: 6 });
        detailModal.addField({ id: 'h-reason', name: 'h-reason', label: 'Gerekçe', type: 'text', value: request.reason || '-', colSize: 12 });
        detailModal.render();
        detailModal.show();
    } catch (error) {
        showNotification(error?.message || 'Talep detayı yüklenemedi.', 'error');
    }
}

function showApproveModal(requestId) {
    const request = currentPending.find(item => Number(item.id) === Number(requestId));
    if (!request) return;
    approveModal.show({
        message: `#${request.id} numaralı izin talebi onaylansın mı?`,
        details: `
            <div class="small text-muted">
                <div>Talep Eden: ${request.requester_username || '-'}</div>
                <div>Tarih: ${request.start_date || '-'} - ${request.end_date || '-'}</div>
            </div>
        `,
        onConfirm: async () => {
            try {
                await approveVacationRequest(request.id, '');
                showNotification('İzin talebi onaylandı.', 'success');
                await Promise.all([loadPendingApprovals(), loadDecisions(), loadBalances()]);
            } catch (error) {
                showNotification(error?.message || 'Onaylama işlemi başarısız.', 'error');
                throw error;
            }
        }
    });
}

function showRejectModal(requestId) {
    currentRejectRequestId = requestId;
    const textarea = document.getElementById('hr-reject-comment');
    if (textarea) textarea.value = '';
    bootstrap.Modal.getOrCreateInstance(document.getElementById('hrRejectVacationModal')).show();
}

function bindRejectModal() {
    document.getElementById('hr-confirm-reject-btn')?.addEventListener('click', async () => {
        if (!currentRejectRequestId) return;
        const comment = document.getElementById('hr-reject-comment')?.value?.trim() || '';
        const button = document.getElementById('hr-confirm-reject-btn');
        const original = button?.innerHTML || '';
        try {
            if (button) {
                button.disabled = true;
                button.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Reddediliyor...';
            }
            await rejectVacationRequest(currentRejectRequestId, comment);
            showNotification('İzin talebi reddedildi.', 'success');
            bootstrap.Modal.getOrCreateInstance(document.getElementById('hrRejectVacationModal')).hide();
            await Promise.all([loadPendingApprovals(), loadDecisions(), loadBalances()]);
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

function bindFilterButtons() {
    document.getElementById('balance-filter-btn')?.addEventListener('click', () => loadBalances());
    document.getElementById('balance-clear-btn')?.addEventListener('click', () => {
        const yearInput = document.getElementById('balance-year-filter');
        const userInput = document.getElementById('balance-user-id');
        if (userInput) userInput.value = '';
        if (yearInput) yearInput.value = String(new Date().getFullYear());
        loadBalances();
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) return;
    if (!initRouteProtection()) return;
    await initNavbar();

    const yearInput = document.getElementById('balance-year-filter');
    if (yearInput) yearInput.value = String(new Date().getFullYear());

    new HeaderComponent({
        title: 'İzin Yönetimi',
        subtitle: 'İzin bakiyelerini düzenleyin ve onay süreçlerini yönetin',
        icon: 'calendar-check',
        showBackButton: 'block',
        showCreateButton: 'none',
        onBackClick: () => { window.location.href = '/human_resources'; }
    });

    detailModal = new DisplayModal('hr-vacation-detail-modal-container', {
        title: 'İzin Talebi Detayı',
        icon: 'fas fa-calendar-alt',
        size: 'xl',
        showEditButton: false
    });
    approveModal = new ConfirmationModal('hr-vacation-approve-modal-container', {
        title: 'İzin Talebi Onayı',
        icon: 'fas fa-check-circle',
        confirmText: 'Evet, Onayla',
        cancelText: 'İptal',
        confirmButtonClass: 'btn-success'
    });
    leaveLedgerModal = new DisplayModal('hr-vacation-ledger-modal-container', {
        title: 'İzin Defteri',
        icon: 'fas fa-book',
        size: 'xl',
        showEditButton: false
    });

    balancesTable = new TableComponent('balances-table-container', {
        title: 'İzin Bakiyeleri',
        icon: 'fas fa-wallet',
        iconColor: 'text-success',
        columns: [
            { field: 'id', label: 'ID', sortable: true, formatter: v => String(v || '-') },
            { field: 'user_full_name', label: 'Çalışan', sortable: true, formatter: v => v || '-' },
            { field: 'year', label: 'Yıl', sortable: true, formatter: v => String(v || '-') },
            {
                field: 'leave_type',
                label: 'İzin Türü',
                sortable: true,
                formatter: (v, row) => row.leave_type_label || leaveTypeLabelMap.get(v) || v || '-'
            },
            { field: 'total_days', label: 'Toplam Gün', sortable: true, type: 'number' },
            { field: 'used_days', label: 'Kullanılan', sortable: true, formatter: v => String(v || '0') },
            { field: 'remaining_days', label: 'Kalan', sortable: true, formatter: v => `<strong>${v || '0'}</strong>` }
        ],
        actions: [
            {
                key: 'leave-ledger',
                label: 'İzin Defteri',
                title: 'İzin Defterini Görüntüle',
                icon: 'fas fa-book',
                class: 'btn-outline-info',
                onClick: row => showLeaveLedgerModalForRow(row)
            }
        ],
        editable: true,
        editableColumns: ['total_days'],
        onEdit: async (row, field, newValue) => {
            const next = Number(newValue);
            if (!Number.isFinite(next) || next < 0) {
                throw new Error('Toplam gün 0 veya daha büyük olmalıdır.');
            }
            const updated = await patchVacationBalance(row.id, { total_days: next.toFixed(1) });
            row.total_days = updated?.total_days ?? next.toFixed(1);
            row.used_days = updated?.used_days ?? row.used_days;
            row.remaining_days = updated?.remaining_days ?? row.remaining_days;
            showNotification('İzin bakiyesi güncellendi.', 'success');
        },
        refreshable: true,
        onRefresh: () => loadBalances(),
        pagination: false,
        emptyMessage: 'İzin bakiyesi bulunamadı.',
        emptyIcon: 'fas fa-inbox'
    });

    pendingTable = new TableComponent('pending-hr-approvals-table-container', {
        title: 'Bekleyen İzin Onayları',
        icon: 'fas fa-user-check',
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
            { field: 'status', label: 'Durum', sortable: true, formatter: (v, row) => statusBadge(v, row.status_label) }
        ],
        actions: [
            { key: 'detail', label: 'Detay', icon: 'fas fa-eye', class: 'btn-outline-primary', onClick: row => showDetail(row.id) },
            { key: 'approve', label: 'Onayla', icon: 'fas fa-check', class: 'btn-outline-success', onClick: row => showApproveModal(row.id), visible: row => row.status === 'submitted' },
            { key: 'reject', label: 'Reddet', icon: 'fas fa-times', class: 'btn-outline-danger', onClick: row => showRejectModal(row.id), visible: row => row.status === 'submitted' }
        ],
        refreshable: true,
        onRefresh: () => loadPendingApprovals(),
        pagination: false,
        emptyMessage: 'Bekleyen onay bulunamadı.',
        emptyIcon: 'fas fa-hourglass-end'
    });

    decisionsTable = new TableComponent('hr-decisions-table-container', {
        title: 'Karar Geçmişim',
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
            { field: 'status', label: 'Son Durum', sortable: true, formatter: (v, row) => statusBadge(v, row.status_label) }
        ],
        actions: [
            { key: 'detail', label: 'Detay', icon: 'fas fa-eye', class: 'btn-outline-primary', onClick: row => showDetail(row.id) }
        ],
        refreshable: true,
        onRefresh: () => loadDecisions(),
        pagination: false,
        emptyMessage: 'Karar geçmişi bulunamadı.',
        emptyIcon: 'fas fa-inbox'
    });

    bindFilterButtons();
    bindRejectModal();
    await Promise.all([loadBalances(), loadPendingApprovals(), loadDecisions()]);
});
