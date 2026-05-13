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
    fetchVacationApprovalsInbox,
    fetchVacationDecisionsByMe,
    approveVacationRequest,
    rejectVacationRequest,
    approveVacationCancellation,
    rejectVacationCancellation
} from '../../apis/vacationRequests.js';

let balancesTable = null;
let pendingTable = null;
let decisionsTable = null;
let detailModal = null;
let approveModal = null;
let leaveLedgerModal = null;
let currentPending = [];
let currentRejectRequestId = null;
let currentRejectKind = null;

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

function approvalKindBadge(kind) {
    if (kind === 'cancellation_request') {
        return '<span class="status-badge status-red">İptal Talebi</span>';
    }
    return '<span class="status-badge status-yellow">Onay Süreci</span>';
}

function formatDate(value) {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString('tr-TR');
}

function formatDateTime(value) {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString('tr-TR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
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
        const response = await fetchVacationApprovalsInbox();
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

async function showDetail(requestOrId) {
    try {
        const requestId = typeof requestOrId === 'object' ? requestOrId?.id : requestOrId;
        const contextRow = typeof requestOrId === 'object' ? requestOrId : null;
        const request = await fetchVacationRequest(requestId);
        const merged = { ...(contextRow || {}), ...(request || {}) };
        const kind = merged.kind || null;
        const kindText = kind === 'cancellation_request' ? 'İptal Talebi' : 'Onay Süreci';
        const leaveTypeText = merged.leave_type_label || leaveTypeLabelMap.get(merged.leave_type) || merged.leave_type || '-';
        const requesterText = merged.requester_full_name || merged.requester_username || '-';
        const requesterUserName = merged.requester_username || '-';
        const teamText = merged.team_label || merged.team || '-';
        const timeRange = merged.start_time && merged.end_time
            ? `${escapeHtml(merged.start_time)} - ${escapeHtml(merged.end_time)}`
            : '-';
        const reasonText = merged.reason ? escapeHtml(merged.reason) : '<span class="text-muted">Belirtilmemiş</span>';
        const cancellationReasonText = merged.cancellation_reason
            ? escapeHtml(merged.cancellation_reason)
            : '<span class="text-muted">Belirtilmemiş</span>';

        detailModal.clearData();
        detailModal.addCustomSection({
            title: 'Özet',
            customContent: `
                <div class="row g-2">
                    <div class="col-12 col-md-4">
                        <div class="border rounded p-2 h-100">
                            <small class="text-muted d-block">Talep No</small>
                            <strong>#${escapeHtml(merged.id || '-')}</strong>
                        </div>
                    </div>
                    <div class="col-12 col-md-4">
                        <div class="border rounded p-2 h-100">
                            <small class="text-muted d-block">Durum</small>
                            ${statusBadge(merged.status, merged.status_label)}
                        </div>
                    </div>
                    <div class="col-12 col-md-4">
                        <div class="border rounded p-2 h-100">
                            <small class="text-muted d-block">Tip</small>
                            ${approvalKindBadge(kind)}
                            <div class="small text-muted mt-1">${escapeHtml(kindText)}</div>
                        </div>
                    </div>
                </div>
            `
        });
        detailModal.addCustomSection({
            title: 'Talep Bilgisi',
            customContent: `
                <div class="row g-2">
                    <div class="col-12 col-md-6"><div class="border rounded p-2"><small class="text-muted d-block">İzin Türü</small><strong>${escapeHtml(leaveTypeText)}</strong></div></div>
                    <div class="col-12 col-md-3"><div class="border rounded p-2"><small class="text-muted d-block">Süre</small><strong>${escapeHtml(merged.duration_days || '0')} gün</strong></div></div>
                    <div class="col-12 col-md-3"><div class="border rounded p-2"><small class="text-muted d-block">Şirket Tatili</small><strong>${merged.is_company_holiday ? 'Evet' : 'Hayır'}</strong></div></div>
                    <div class="col-12 col-md-4"><div class="border rounded p-2"><small class="text-muted d-block">Başlangıç</small><strong>${escapeHtml(formatDate(merged.start_date))}</strong></div></div>
                    <div class="col-12 col-md-4"><div class="border rounded p-2"><small class="text-muted d-block">Bitiş</small><strong>${escapeHtml(formatDate(merged.end_date))}</strong></div></div>
                    <div class="col-12 col-md-4"><div class="border rounded p-2"><small class="text-muted d-block">Saat Aralığı</small><strong>${timeRange}</strong></div></div>
                </div>
            `
        });
        detailModal.addCustomSection({
            title: 'Çalışan ve Notlar',
            customContent: `
                <div class="row g-2">
                    <div class="col-12 col-md-4"><div class="border rounded p-2"><small class="text-muted d-block">Ad Soyad</small><strong>${escapeHtml(requesterText)}</strong></div></div>
                    <div class="col-12 col-md-4"><div class="border rounded p-2"><small class="text-muted d-block">Kullanıcı Adı</small><strong>${escapeHtml(requesterUserName)}</strong></div></div>
                    <div class="col-12 col-md-4"><div class="border rounded p-2"><small class="text-muted d-block">Takım</small><strong>${escapeHtml(teamText)}</strong></div></div>
                    <div class="col-12 col-md-6"><div class="border rounded p-2"><small class="text-muted d-block">Talep Gerekçesi</small>${reasonText}</div></div>
                    <div class="col-12 col-md-6"><div class="border rounded p-2"><small class="text-muted d-block">İptal Gerekçesi</small>${cancellationReasonText}</div></div>
                    <div class="col-12 col-md-6"><div class="border rounded p-2"><small class="text-muted d-block">Oluşturulma</small><strong>${escapeHtml(formatDateTime(merged.created_at))}</strong></div></div>
                    <div class="col-12 col-md-6"><div class="border rounded p-2"><small class="text-muted d-block">Son Güncelleme</small><strong>${escapeHtml(formatDateTime(merged.updated_at))}</strong></div></div>
                </div>
            `
        });
        detailModal.render();
        detailModal.show();
    } catch (error) {
        showNotification(error?.message || 'Talep detayı yüklenemedi.', 'error');
    }
}

function showApproveModal(requestId) {
    const request = currentPending.find(item => Number(item.id) === Number(requestId));
    if (!request) return;
    const isCancellation = request.kind === 'cancellation_request';
    approveModal.show({
        message: isCancellation
            ? `#${request.id} numaralı izin iptal talebi onaylansın mı?`
            : `#${request.id} numaralı izin talebi onaylansın mı?`,
        details: `
            <div class="small text-muted">
                <div>Tip: ${isCancellation ? 'İptal Talebi' : 'Onay Süreci'}</div>
                <div>Talep Eden: ${request.requester_username || '-'}</div>
                <div>Tarih: ${request.start_date || '-'} - ${request.end_date || '-'}</div>
                ${isCancellation && request.cancellation_reason ? `<div>İptal Gerekçesi: ${request.cancellation_reason}</div>` : ''}
            </div>
        `,
        onConfirm: async () => {
            try {
                if (isCancellation) {
                    await approveVacationCancellation(request.id, '');
                    showNotification('İptal talebi onaylandı.', 'success');
                } else {
                    await approveVacationRequest(request.id, '');
                    showNotification('İzin talebi onaylandı.', 'success');
                }
                await Promise.all([loadPendingApprovals(), loadDecisions(), loadBalances()]);
            } catch (error) {
                showNotification(error?.message || 'Onaylama işlemi başarısız.', 'error');
                throw error;
            }
        }
    });
}

function showRejectModal(requestId) {
    const request = currentPending.find(item => Number(item.id) === Number(requestId));
    if (!request) return;
    currentRejectRequestId = requestId;
    currentRejectKind = request.kind || 'workflow_approval';
    const textarea = document.getElementById('hr-reject-comment');
    if (textarea) textarea.value = '';
    const title = document.getElementById('hrRejectVacationModalLabel');
    if (title) {
        title.innerHTML = currentRejectKind === 'cancellation_request'
            ? '<i class="fas fa-times-circle me-2"></i>İptal Talebini Reddet'
            : '<i class="fas fa-times-circle me-2"></i>İzin Talebini Reddet';
    }
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
            if (currentRejectKind === 'cancellation_request') {
                await rejectVacationCancellation(currentRejectRequestId, comment);
                showNotification('İptal talebi reddedildi.', 'success');
            } else {
                await rejectVacationRequest(currentRejectRequestId, comment);
                showNotification('İzin talebi reddedildi.', 'success');
            }
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
            currentRejectKind = null;
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
        title: 'Onay Kutusu',
        icon: 'fas fa-user-check',
        iconColor: 'text-warning',
        columns: [
            { field: 'id', label: 'Talep No', sortable: true, formatter: v => `<strong>#${v || '-'}</strong>` },
            { field: 'kind', label: 'Tip', sortable: true, formatter: v => approvalKindBadge(v) },
            { field: 'requester_username', label: 'Talep Eden', sortable: true, formatter: v => v || '-' },
            {
                field: 'leave_type',
                label: 'İzin Türü',
                sortable: true,
                formatter: (v, row) => row.leave_type_label || leaveTypeLabelMap.get(v) || v || '-'
            },
            { field: 'start_date', label: 'Başlangıç', sortable: true, type: 'date' },
            { field: 'end_date', label: 'Bitiş', sortable: true, type: 'date' },
            { field: 'duration_days', label: 'Süre', sortable: true, formatter: v => `${v || 0} gün` },
            {
                field: 'cancellation_reason',
                label: 'İptal Gerekçesi',
                sortable: false,
                formatter: (v, row) => row.kind === 'cancellation_request' ? (v || '-') : '-'
            },
            { field: 'status', label: 'Durum', sortable: true, formatter: (v, row) => statusBadge(v, row.status_label) }
        ],
        actions: [
            { key: 'detail', label: 'Detay', icon: 'fas fa-eye', class: 'btn-outline-primary', onClick: row => showDetail(row) },
            {
                key: 'approve-workflow',
                label: 'Onayla',
                icon: 'fas fa-check',
                class: 'btn-outline-success',
                onClick: row => showApproveModal(row.id),
                visible: row => row.kind === 'workflow_approval' && row.status === 'submitted'
            },
            {
                key: 'reject-workflow',
                label: 'Reddet',
                icon: 'fas fa-times',
                class: 'btn-outline-danger',
                onClick: row => showRejectModal(row.id),
                visible: row => row.kind === 'workflow_approval' && row.status === 'submitted'
            },
            {
                key: 'approve-cancellation',
                label: 'İptali Onayla',
                icon: 'fas fa-check-double',
                class: 'btn-outline-success',
                onClick: row => showApproveModal(row.id),
                visible: row => row.kind === 'cancellation_request'
            },
            {
                key: 'reject-cancellation',
                label: 'İptali Reddet',
                icon: 'fas fa-ban',
                class: 'btn-outline-danger',
                onClick: row => showRejectModal(row.id),
                visible: row => row.kind === 'cancellation_request'
            }
        ],
        refreshable: true,
        onRefresh: () => loadPendingApprovals(),
        pagination: false,
        emptyMessage: 'Onay kutusunda kayıt bulunamadı.',
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
            { key: 'detail', label: 'Detay', icon: 'fas fa-eye', class: 'btn-outline-primary', onClick: row => showDetail(row) }
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
