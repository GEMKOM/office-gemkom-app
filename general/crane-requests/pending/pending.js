import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { TableComponent } from '../../../components/table/table.js';
import { DisplayModal } from '../../../components/display-modal/display-modal.js';
import { ConfirmationModal } from '../../../components/confirmation-modal/confirmation-modal.js';
import { FileAttachments } from '../../../components/file-attachments/file-attachments.js';
import { FileViewer } from '../../../components/file-viewer/file-viewer.js';
import { initRouteProtection } from '../../../apis/routeProtection.js';
import { showNotification } from '../../../components/notification/notification.js';
import { formatDate, formatDateTime } from '../../../apis/formatters.js';
import {
    getCraneRequest,
    getCraneRequests,
    getPendingApprovalCraneRequests,
    approveCraneRequest,
    rejectCraneRequest,
    getCraneStatusInfo,
    PRICING_OPTION_LABELS
} from '../../../apis/craneRequests.js';

// State management
let requests = [];
let currentRequest = null;
let pendingTable = null;
let approvedTable = null;
let isLoading = false;
let isApprovedLoading = false;
let detailsModal = null;
let approveModal = null;

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }
    if (!initRouteProtection()) {
        return;
    }

    await initNavbar();

    const header = new HeaderComponent({
        title: 'Onay Bekleyen Vinç Talepleri',
        subtitle: 'Onayınızı bekleyen vinç/platform taleplerinin yönetimi',
        icon: 'truck-pickup',
        showBackButton: 'block',
        showCreateButton: 'none',
        showExportButton: 'none',
        showRefreshButton: 'none',
        onBackClick: () => window.location.href = '/general/crane-requests'
    });

    initializeTables();
    initializeModals();
    setupRejectModalListeners();

    await loadRequests();
    loadApprovedRequests().catch(error => console.error('Error loading approved requests:', error));

    // Open details when ?request=<id> present (e.g. from notification link)
    const urlParams = new URLSearchParams(window.location.search);
    const requestId = urlParams.get('request');
    if (requestId) {
        await viewRequestDetails(parseInt(requestId, 10));
    }
});

function formatMoney(value, currency = 'TRY') {
    if (value === null || value === undefined || value === '') return '-';
    const num = parseFloat(value);
    if (Number.isNaN(num)) return '-';
    return `${num.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${currency}`;
}

function renderStatusBadge(status, statusLabel) {
    const info = getCraneStatusInfo(status);
    return `<span class="status-badge ${info.class}">${statusLabel || info.label}</span>`;
}

function renderPriorityBadge(priority) {
    const map = {
        'critical': { class: 'status-red', label: 'Kritik' },
        'urgent': { class: 'status-yellow', label: 'Acil' },
        'normal': { class: 'status-blue', label: 'Normal' }
    };
    const info = map[priority] || { class: 'status-grey', label: priority || 'Normal' };
    return `<span class="status-badge ${info.class}">${info.label}</span>`;
}

function formatDurationSummary(row) {
    if (row.pricing_option === 'daily') {
        return `${PRICING_OPTION_LABELS[row.pricing_option]} × ${row.days || 1}`;
    }
    let label = PRICING_OPTION_LABELS[row.pricing_option] || row.pricing_option_label || '-';
    if (row.needs_rigger) {
        label += ' + Sapancı';
    }
    return label;
}

const SHARED_COLUMNS = [
    {
        field: 'request_number',
        label: 'Talep No',
        sortable: false,
        formatter: (value) => `<span style="font-weight: 700; color: #0d6efd; font-family: 'Courier New', monospace; font-size: 0.9rem; background: rgba(13, 110, 253, 0.1); padding: 0.25rem 0.5rem; border-radius: 4px; border: 1px solid rgba(13, 110, 253, 0.2);">${value || '-'}</span>`
    },
    {
        field: 'requestor_full_name',
        label: 'Talep Eden',
        sortable: false,
        formatter: (value, row) => `
            <div style="font-weight: 500; color: #495057;">
                <i class="fas fa-user-circle me-2 text-muted"></i>
                ${value || row.requestor_username || 'Bilinmiyor'}
            </div>
        `
    },
    {
        field: 'department',
        label: 'Departman',
        sortable: false,
        formatter: (value) => `<div style="color: #495057; font-weight: 500;">${value || '-'}</div>`
    },
    {
        field: 'crane_type_name',
        label: 'Ekipman',
        sortable: false,
        formatter: (value) => `<div style="font-weight: 500;">${value || '-'}</div>`
    },
    {
        field: 'job_no',
        label: 'İş Emri',
        sortable: false,
        formatter: (value) => `<span style="font-weight: 600; color: #495057;">${value || '-'}</span>`
    },
    {
        field: 'pricing_option',
        label: 'Süre',
        sortable: false,
        formatter: (value, row) => `<div style="color: #495057;">${formatDurationSummary(row)}</div>`
    },
    {
        field: 'needed_date',
        label: 'İhtiyaç Tarihi',
        sortable: true,
        type: 'date'
    },
    {
        field: 'estimated_cost',
        label: 'Tahmini Maliyet',
        sortable: false,
        formatter: (value, row) => `<div style="color: #495057; font-weight: 600;">${formatMoney(value, row.estimated_cost_currency)}</div>`
    },
    {
        field: 'priority',
        label: 'Öncelik',
        sortable: true,
        formatter: (value) => renderPriorityBadge(value)
    },
    {
        field: 'status',
        label: 'Durum',
        sortable: true,
        formatter: (value, row) => renderStatusBadge(value, row.status_label)
    }
];

function initializeTables() {
    pendingTable = new TableComponent('pending-requests-table-container', {
        title: 'Onay Bekleyen Vinç Talepleri',
        icon: 'fas fa-clock',
        iconColor: 'text-warning',
        columns: SHARED_COLUMNS,
        actions: [
            {
                key: 'view',
                label: 'Detayları Görüntüle',
                icon: 'fas fa-eye',
                class: 'btn-outline-primary',
                onClick: (row) => viewRequestDetails(row.id)
            },
            {
                key: 'approve',
                label: 'Onayla',
                icon: 'fas fa-check',
                class: 'btn-outline-success',
                onClick: (row) => showApproveModal(row),
                visible: (row) => row.status === 'submitted'
            },
            {
                key: 'reject',
                label: 'Reddet',
                icon: 'fas fa-times',
                class: 'btn-outline-danger',
                onClick: (row) => showRejectModal(row.id),
                visible: (row) => row.status === 'submitted'
            }
        ],
        pagination: true,
        itemsPerPage: 20,
        refreshable: true,
        onRefresh: loadRequests,
        emptyMessage: 'Onay bekleyen vinç talebi bulunamadı.',
        emptyIcon: 'fas fa-clock'
    });

    approvedTable = new TableComponent('approved-requests-table-container', {
        title: 'Onayladığım Vinç Talepleri',
        icon: 'fas fa-check-circle',
        iconColor: 'text-success',
        columns: [...SHARED_COLUMNS, {
            field: 'created_at',
            label: 'Oluşturulma',
            sortable: true,
            type: 'date'
        }],
        actions: [
            {
                key: 'view',
                label: 'Detayları Görüntüle',
                icon: 'fas fa-eye',
                class: 'btn-outline-primary',
                onClick: (row) => viewRequestDetails(row.id)
            }
        ],
        pagination: true,
        itemsPerPage: 20,
        refreshable: true,
        onRefresh: loadApprovedRequests,
        emptyMessage: 'Onayladığınız vinç talebi bulunamadı.',
        emptyIcon: 'fas fa-check-circle'
    });
}

function initializeModals() {
    detailsModal = new DisplayModal('crane-request-details-modal-container', {
        title: 'Vinç Talebi Detayları',
        icon: 'fas fa-truck-pickup',
        size: 'xl',
        showEditButton: false
    });

    detailsModal.onCloseCallback(() => {
        const url = new URL(window.location);
        url.searchParams.delete('request');
        window.history.pushState({}, '', url);
    });

    approveModal = new ConfirmationModal('approve-crane-request-modal-container', {
        title: 'Vinç Talebi Onayı',
        icon: 'fas fa-check-circle',
        confirmText: 'Evet, Onayla',
        cancelText: 'İptal',
        confirmButtonClass: 'btn-success'
    });
}

async function loadRequests() {
    if (isLoading) return;
    try {
        isLoading = true;
        pendingTable.setLoading(true);

        const response = await getPendingApprovalCraneRequests();
        requests = response.results || response || [];
        const total = response.count || (Array.isArray(response) ? response.length : requests.length);

        pendingTable.updateData(requests, total, 1);
    } catch (error) {
        console.error('Error loading pending crane requests:', error);
        pendingTable.updateData([], 0, 1);
    } finally {
        isLoading = false;
        pendingTable.setLoading(false);
    }
}

async function loadApprovedRequests() {
    if (isApprovedLoading) return;
    try {
        isApprovedLoading = true;
        approvedTable.setLoading(true);

        // Requests I approved: filter approved/completed ones where I'm the approver
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const response = await getCraneRequests({ page_size: 100 });
        const rows = (response.results || response || []).filter(r =>
            r.approved_by === user.id && ['approved', 'completed'].includes(r.status)
        );

        approvedTable.updateData(rows, rows.length, 1);
    } catch (error) {
        console.error('Error loading approved crane requests:', error);
        approvedTable.updateData([], 0, 1);
    } finally {
        isApprovedLoading = false;
        approvedTable.setLoading(false);
    }
}

// ============================================================
// Details modal
// ============================================================

async function viewRequestDetails(requestId) {
    try {
        currentRequest = await getCraneRequest(requestId);
        showRequestDetailsModal(currentRequest);

        const url = new URL(window.location);
        url.searchParams.set('request', requestId);
        window.history.pushState({}, '', url);
    } catch (error) {
        console.error('Error viewing request details:', error);
        showNotification('Talep detayları yüklenirken hata oluştu: ' + error.message, 'error');
    }
}

function renderApprovalChain(request) {
    const approval = request.approval;
    if (!approval || !approval.stage_instances || approval.stage_instances.length === 0) {
        return '<div style="color: #6c757d;">Onay akışı bulunamadı.</div>';
    }

    return approval.stage_instances.map(stage => {
        let icon = '<i class="fas fa-hourglass-half text-warning me-2"></i>';
        if (stage.is_rejected) {
            icon = '<i class="fas fa-times-circle text-danger me-2"></i>';
        } else if (stage.is_complete) {
            icon = '<i class="fas fa-check-circle text-success me-2"></i>';
        }

        const approverNames = (stage.approvers || [])
            .map(a => a.full_name || a.username)
            .join(', ');

        const decisions = (stage.decisions || []).map(d => {
            const decisionIcon = d.decision === 'approve'
                ? '<i class="fas fa-check text-success me-1"></i>'
                : '<i class="fas fa-times text-danger me-1"></i>';
            const who = d.approver_detail ? (d.approver_detail.full_name || d.approver_detail.username) : '—';
            const when = d.decided_at ? ` · ${formatDateTime(d.decided_at)}` : '';
            const comment = d.comment ? ` — "${d.comment}"` : '';
            return `<div style="font-size: 0.85rem; color: #6c757d; margin-left: 1.5rem;">${decisionIcon}${who}${when}${comment}</div>`;
        }).join('');

        return `
            <div class="mb-2">
                <div style="font-weight: 600; color: #212529;">${icon}${stage.order}. ${stage.name}
                    <span style="font-weight: 400; color: #6c757d; font-size: 0.85rem;">(${stage.approved_count || 0}/${stage.required_approvals} onay)</span>
                </div>
                ${approverNames ? `<div style="font-size: 0.85rem; color: #6c757d; margin-left: 1.5rem;"><i class="fas fa-users me-1"></i>${approverNames}</div>` : ''}
                ${decisions}
            </div>
        `;
    }).join('');
}

function showRequestDetailsModal(request) {
    detailsModal.clearData();

    const statusInfo = getCraneStatusInfo(request.status);
    const breakdown = request.estimate_breakdown || {};
    const breakdownRows = ['base', 'transport', 'rigger'].map(key => {
        const entry = breakdown[key];
        if (!entry || entry.amount === undefined) return '';
        return `
            <div class="d-flex justify-content-between" style="font-size: 0.9rem; color: #495057;">
                <span>${entry.label || key}</span>
                <span>${formatMoney(entry.amount, '')}</span>
            </div>
        `;
    }).join('');

    const html = `
        <div class="row">
            <div class="col-md-6">
                <h6 class="text-primary mb-3"><i class="fas fa-info-circle me-2"></i>Genel Bilgiler</h6>
                <div class="row g-2">
                    <div class="col-12"><div class="field-display mb-2 d-flex align-items-center">
                        <label class="field-label me-2 mb-0 flex-shrink-0"><i class="fas fa-hashtag me-1"></i>Talep No:</label>
                        <div class="field-value">${request.request_number}</div>
                    </div></div>
                    <div class="col-12"><div class="field-display mb-2 d-flex align-items-center">
                        <label class="field-label me-2 mb-0 flex-shrink-0"><i class="fas fa-user me-1"></i>Talep Eden:</label>
                        <div class="field-value">${request.requestor_full_name || request.requestor_username || '-'}</div>
                    </div></div>
                    <div class="col-12"><div class="field-display mb-2 d-flex align-items-center">
                        <label class="field-label me-2 mb-0 flex-shrink-0"><i class="fas fa-building me-1"></i>Departman:</label>
                        <div class="field-value">${request.department || '-'}</div>
                    </div></div>
                    <div class="col-12"><div class="field-display mb-2 d-flex align-items-center">
                        <label class="field-label me-2 mb-0 flex-shrink-0"><i class="fas fa-info me-1"></i>Durum:</label>
                        <div class="field-value"><span class="status-badge ${statusInfo.class}">${request.status_label || statusInfo.label}</span></div>
                    </div></div>
                    <div class="col-12"><div class="field-display mb-2 d-flex align-items-center">
                        <label class="field-label me-2 mb-0 flex-shrink-0"><i class="fas fa-flag me-1"></i>Öncelik:</label>
                        <div class="field-value">${renderPriorityBadge(request.priority)}</div>
                    </div></div>
                    <div class="col-12"><div class="field-display mb-2 d-flex align-items-center">
                        <label class="field-label me-2 mb-0 flex-shrink-0"><i class="fas fa-calendar-plus me-1"></i>Oluşturulma:</label>
                        <div class="field-value">${formatDateTime(request.created_at)}</div>
                    </div></div>
                </div>
            </div>
            <div class="col-md-6">
                <h6 class="text-primary mb-3"><i class="fas fa-truck-pickup me-2"></i>Kiralama Bilgileri</h6>
                <div class="row g-2">
                    <div class="col-12"><div class="field-display mb-2 d-flex align-items-center">
                        <label class="field-label me-2 mb-0 flex-shrink-0"><i class="fas fa-truck-pickup me-1"></i>Ekipman:</label>
                        <div class="field-value">${request.crane_type_name || '-'}</div>
                    </div></div>
                    <div class="col-12"><div class="field-display mb-2 d-flex align-items-center">
                        <label class="field-label me-2 mb-0 flex-shrink-0"><i class="fas fa-briefcase me-1"></i>İş Emri:</label>
                        <div class="field-value" style="font-weight: 600;">${request.job_no || '-'}</div>
                    </div></div>
                    <div class="col-12"><div class="field-display mb-2 d-flex align-items-center">
                        <label class="field-label me-2 mb-0 flex-shrink-0"><i class="fas fa-clock me-1"></i>Süre:</label>
                        <div class="field-value">${formatDurationSummary(request)}</div>
                    </div></div>
                    <div class="col-12"><div class="field-display mb-2 d-flex align-items-center">
                        <label class="field-label me-2 mb-0 flex-shrink-0"><i class="fas fa-calendar me-1"></i>İhtiyaç Tarihi:</label>
                        <div class="field-value">${formatDate(request.needed_date)}${request.needed_time ? ' ' + request.needed_time.substring(0, 5) : ''}</div>
                    </div></div>
                    <div class="col-12"><div class="field-display mb-2 d-flex align-items-center">
                        <label class="field-label me-2 mb-0 flex-shrink-0"><i class="fas fa-map-marker-alt me-1"></i>Konum:</label>
                        <div class="field-value">${request.location || '-'}</div>
                    </div></div>
                    <div class="col-12"><div class="field-display mb-2">
                        <label class="field-label mb-1"><i class="fas fa-align-left me-1"></i>Açıklama:</label>
                        <div class="field-value" style="white-space: pre-wrap; word-wrap: break-word;">${request.description || '-'}</div>
                    </div></div>
                </div>
            </div>
        </div>
        <div class="row mt-3">
            <div class="col-md-6">
                <h6 class="text-primary mb-2"><i class="fas fa-calculator me-2"></i>Tahmini Maliyet</h6>
                ${breakdownRows}
                <div class="d-flex justify-content-between mt-2 pt-2" style="border-top: 1px solid #dee2e6; font-weight: 700; color: #0d6efd;">
                    <span>Tahmini Toplam</span><span>${formatMoney(request.estimated_cost, request.estimated_cost_currency)}</span>
                </div>
                <div style="font-size: 0.75rem; color: #6c757d; margin-top: 0.25rem;">KDV hariç, fiyat listesine göre. Ürün kodu: <code>${request.procurement_item_code || '-'}</code></div>
            </div>
        </div>
    `;

    detailsModal.addSection({ title: '', icon: '', iconColor: 'text-primary' });
    detailsModal.addCustomContent(html);

    detailsModal.addSection({ title: 'Onay Akışı', icon: 'fas fa-route', iconColor: 'text-primary' });
    detailsModal.addCustomContent(`<div class="mt-2">${renderApprovalChain(request)}</div>`);

    detailsModal.addSection({ title: 'Dosya Ekleri', icon: 'fas fa-paperclip', iconColor: 'text-info' });
    detailsModal.addCustomContent('<div id="crane-request-files-container" class="mt-3"></div>');

    detailsModal.render();

    // Footer: approve/reject when the request awaits a decision
    const modalFooter = detailsModal.container.querySelector('.modal-footer');
    if (modalFooter) {
        if (request.status === 'submitted') {
            modalFooter.innerHTML = `
                <div class="d-flex justify-content-end gap-2">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal"><i class="fas fa-times me-1"></i>Kapat</button>
                    <button type="button" class="btn btn-danger" id="reject-crane-request-btn" style="min-width: 120px;"><i class="fas fa-times me-1"></i>Reddet</button>
                    <button type="button" class="btn btn-success" id="approve-crane-request-btn" style="min-width: 120px;"><i class="fas fa-check me-1"></i>Onayla</button>
                </div>
            `;
            modalFooter.querySelector('#approve-crane-request-btn')?.addEventListener('click', () => {
                detailsModal.hide();
                showApproveModal(request);
            });
            modalFooter.querySelector('#reject-crane-request-btn')?.addEventListener('click', () => {
                showRejectModal(request.id);
            });
        } else {
            modalFooter.innerHTML = `
                <div class="d-flex justify-content-end gap-2">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal"><i class="fas fa-times me-1"></i>Kapat</button>
                </div>
            `;
        }
    }

    detailsModal.show();

    setTimeout(() => {
        const filesContainer = document.getElementById('crane-request-files-container');
        if (filesContainer) {
            const fileAttachments = new FileAttachments('crane-request-files-container', {
                title: '',
                layout: 'grid',
                showTitle: false,
                onFileClick: (file) => {
                    const fileName = file.file_name ? file.file_name.split('/').pop() : 'Dosya';
                    const fileExtension = fileName.split('.').pop().toLowerCase();
                    const viewer = new FileViewer();
                    viewer.setDownloadCallback(async () => {
                        await viewer.downloadFile(file.file_url, fileName);
                    });
                    viewer.openFile(file.file_url, fileName, fileExtension);
                }
            });
            fileAttachments.setFiles(request.files || []);
        }
    }, 100);
}

// ============================================================
// Approve / reject
// ============================================================

function showApproveModal(requestRow) {
    window.currentApproveRequestId = requestRow.id;

    const detailsHtml = `
        <div class="row g-2">
            <div class="col-6"><strong>Talep No:</strong> ${requestRow.request_number}</div>
            <div class="col-6"><strong>Talep Eden:</strong> ${requestRow.requestor_full_name || requestRow.requestor_username || '-'}</div>
            <div class="col-6"><strong>Ekipman:</strong> ${requestRow.crane_type_name || '-'}</div>
            <div class="col-6"><strong>İş Emri:</strong> ${requestRow.job_no || '-'}</div>
            <div class="col-6"><strong>Süre:</strong> ${formatDurationSummary(requestRow)}</div>
            <div class="col-6"><strong>İhtiyaç Tarihi:</strong> ${formatDate(requestRow.needed_date)}</div>
            <div class="col-12"><strong>Tahmini Maliyet:</strong> <span style="color:#0d6efd; font-weight:700;">${formatMoney(requestRow.estimated_cost, requestRow.estimated_cost_currency)}</span> <span class="text-muted">(KDV hariç)</span></div>
        </div>
    `;

    approveModal.show({
        title: 'Vinç Talebi Onayı',
        message: 'Bu vinç talebini onaylamak istediğinizden emin misiniz?',
        details: detailsHtml,
        confirmText: 'Evet, Onayla',
        onConfirm: async () => {
            try {
                await approveCraneRequest(requestRow.id);
                showNotification('Vinç talebi onaylandı', 'success');
                detailsModal.hide();
                await loadRequests();
                await loadApprovedRequests();
            } catch (error) {
                showNotification('Talep onaylanırken hata oluştu: ' + error.message, 'error');
                throw error;
            }
        }
    });
}

function showRejectModal(requestId) {
    window.currentRejectRequestId = requestId;
    const rejectModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('rejectCraneRequestModal'));
    rejectModal.show();
}

function setupRejectModalListeners() {
    const rejectModal = document.getElementById('rejectCraneRequestModal');
    if (!rejectModal) return;

    const commentTextarea = document.getElementById('rejectComment');
    const commentCounter = document.getElementById('commentCounter');

    if (commentTextarea && commentCounter) {
        commentTextarea.addEventListener('input', () => {
            const length = commentTextarea.value.length;
            commentCounter.textContent = length;
            if (length > 450) {
                commentCounter.style.color = '#dc3545';
            } else if (length > 400) {
                commentCounter.style.color = '#fd7e14';
            } else {
                commentCounter.style.color = '#6c757d';
            }
        });
    }

    const confirmRejectBtn = document.getElementById('confirmRejectCraneRequest');
    if (confirmRejectBtn) {
        confirmRejectBtn.addEventListener('click', async () => {
            const comment = commentTextarea ? commentTextarea.value.trim() : '';
            const requestId = window.currentRejectRequestId;

            if (!requestId) {
                showNotification('Hata: Talep ID bulunamadı', 'error');
                return;
            }

            try {
                confirmRejectBtn.disabled = true;
                confirmRejectBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Reddediliyor...';

                await rejectCraneRequest(requestId, comment);
                showNotification('Vinç talebi reddedildi', 'success');

                bootstrap.Modal.getOrCreateInstance(rejectModal).hide();
                detailsModal.hide();

                if (commentTextarea) {
                    commentTextarea.value = '';
                    commentCounter.textContent = '0';
                    commentCounter.style.color = '#6c757d';
                }

                await loadRequests();
                await loadApprovedRequests();
            } catch (error) {
                console.error('Error rejecting request:', error);
                showNotification('Talep reddedilirken hata oluştu: ' + error.message, 'error');
            } finally {
                confirmRejectBtn.disabled = false;
                confirmRejectBtn.innerHTML = '<i class="fas fa-times-circle me-1"></i>Reddet';
            }
        });
    }

    rejectModal.addEventListener('hidden.bs.modal', () => {
        if (commentTextarea) commentTextarea.value = '';
        if (commentCounter) {
            commentCounter.textContent = '0';
            commentCounter.style.color = '#6c757d';
        }
        window.currentRejectRequestId = null;
    });
}
