import { initNavbar } from '../../../components/navbar.js';
import { initRouteProtection } from '../../../apis/routeProtection.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { TableComponent } from '../../../components/table/table.js';
import { DisplayModal } from '../../../components/display-modal/display-modal.js';
import { ConfirmationModal } from '../../../components/confirmation-modal/confirmation-modal.js';
import { EditModal } from '../../../components/edit-modal/edit-modal.js';
import { listDepartmentTasks } from '../../../apis/projects/departmentTasks.js';
import { approveRevision, rejectRevision } from '../../../apis/projects/design.js';
import { showNotification } from '../../../components/notification/notification.js';

// Global variables
let headerComponent;
let revisionRequestsTable;
let detailsModal;
let approveModal;
let rejectModal;
let revisionRequests = [];
let currentRequest = null;
let currentPage = 1;
let currentPageSize = 20;
let totalItems = 0;

document.addEventListener('DOMContentLoaded', async () => {
    if (!initRouteProtection()) {
        return;
    }

    await initNavbar();
    initHeaderComponent();
    initializeModalComponents();
    initializeTable();
    await loadRevisionRequests();
});

// Initialize header component
function initHeaderComponent() {
    headerComponent = new HeaderComponent({
        title: 'Revizyon Talepleri',
        subtitle: 'Bekleyen revizyon taleplerini görüntüleyin, onaylayın veya reddedin',
        icon: 'edit',
        showBackButton: 'block',
        showRefreshButton: 'block',
        backUrl: '/design/',
        onRefreshClick: async () => {
            currentPage = 1;
            await loadRevisionRequests();
        }
    });
}

// Initialize modal components
function initializeModalComponents() {
    // Details modal
    detailsModal = new DisplayModal('revision-request-details-modal-container', {
        title: 'Revizyon Talebi Detayları',
        icon: 'fas fa-file-alt',
        size: 'lg',
        showEditButton: false
    });

    // Approve confirmation modal
    approveModal = new ConfirmationModal('confirmation-modal-container', {
        title: 'Revizyon Talebi Onayı',
        icon: 'fas fa-check-circle',
        confirmText: 'Evet, Onayla',
        cancelText: 'İptal',
        confirmButtonClass: 'btn-success'
    });

    // Reject modal
    rejectModal = new EditModal('reject-modal-container', {
        title: 'Revizyon Talebini Reddet',
        icon: 'fas fa-times-circle',
        size: 'md',
        showEditButton: false,
        saveButtonText: 'Reddet'
    });

    // Setup reject modal save callback
    rejectModal.onSaveCallback(async (formData) => {
        if (!formData.reason || !formData.reason.trim()) {
            showNotification('Reddetme nedeni gereklidir', 'error');
            return;
        }

        if (currentRequest && currentRequest.pending_revision_request && currentRequest.pending_revision_request.release_id) {
            try {
                await rejectRevision(currentRequest.pending_revision_request.release_id, {
                    reason: formData.reason.trim()
                });
                showNotification('Revizyon talebi başarıyla reddedildi', 'success');
                rejectModal.hide();
                detailsModal.hide();
                await loadRevisionRequests();
            } catch (error) {
                console.error('Error rejecting revision:', error);
                showNotification('Revizyon talebi reddedilirken hata oluştu: ' + error.message, 'error');
            }
        }
    });
}

// Initialize table component
function initializeTable() {
    const columns = [
        {
            field: 'job_order',
            label: 'İş Emri',
            sortable: true,
            width: '10%'
        },
        {
            field: 'customer_name',
            label: 'Müşteri',
            sortable: true,
            width: '12%',
            formatter: (value) => value || '-'
        },
        {
            field: 'title',
            label: 'Görev Başlığı',
            sortable: true,
            width: '18%'
        },
        {
            field: 'drawing_release',
            label: 'Çizim Yayını',
            sortable: false,
            width: '13%',
            formatter: (value, row) => {
                if (row.pending_revision_request && row.pending_revision_request.revision_code) {
                    return `${row.pending_revision_request.revision_code || '-'} (Rev. ${row.pending_revision_request.revision_number || '-'})`;
                }
                return '-';
            }
        },
        {
            field: 'revision_request',
            label: 'Revizyon Nedeni',
            sortable: false,
            width: '23%',
            formatter: (value, row) => {
                if (row.pending_revision_request && row.pending_revision_request.reason) {
                    const reason = row.pending_revision_request.reason;
                    return reason.length > 100 ? reason.substring(0, 100) + '...' : reason;
                }
                return '-';
            }
        },
        {
            field: 'requested_by',
            label: 'Talep Eden',
            sortable: false,
            width: '12%',
            formatter: (value, row) => {
                if (row.pending_revision_request && row.pending_revision_request.requested_by) {
                    return row.pending_revision_request.requested_by;
                }
                return '-';
            }
        },
        {
            field: 'requested_at',
            label: 'Talep Tarihi',
            sortable: true,
            width: '12%',
            formatter: (value, row) => {
                if (row.pending_revision_request && row.pending_revision_request.requested_at) {
                    return formatDateTime(row.pending_revision_request.requested_at);
                }
                return '-';
            }
        }
    ];

    revisionRequestsTable = new TableComponent('revision-requests-table-container', {
        title: 'Bekleyen Revizyon Talepleri',
        columns: columns,
        data: [],
        loading: true,
        skeleton: true,
        skeletonRows: 5,
        pagination: true,
        serverSidePagination: true,
        itemsPerPage: currentPageSize,
        currentPage: currentPage,
        totalItems: totalItems,
        onPageChange: (page) => {
            currentPage = page;
            loadRevisionRequests();
        },
        onPageSizeChange: (newSize) => {
            currentPageSize = newSize;
            currentPage = 1;
            loadRevisionRequests();
        },
        refreshable: true,
        onRefresh: async () => {
            currentPage = 1;
            await loadRevisionRequests();
        },
        actions: [
            {
                key: 'view',
                label: 'Detaylar',
                icon: 'fas fa-eye',
                class: 'btn-outline-info',
                onClick: (row) => showRevisionRequestDetails(row)
            },
            {
                key: 'approve',
                label: 'Onayla',
                icon: 'fas fa-check',
                class: 'btn-outline-success',
                onClick: (row) => showApproveModal(row)
            },
            {
                key: 'reject',
                label: 'Reddet',
                icon: 'fas fa-times',
                class: 'btn-outline-danger',
                onClick: (row) => showRejectModal(row)
            }
        ],
        striped: true,
        bordered: true,
        responsive: true
    });
}

// Load revision requests
async function loadRevisionRequests() {
    try {
        revisionRequestsTable.setLoading(true);

        const response = await listDepartmentTasks({
            has_pending_revision: true,
            department: 'design',
            page: currentPage,
            page_size: currentPageSize,
            ordering: '-revision_request__requested_at'
        });

        revisionRequests = response.results || [];
        totalItems = response.count || 0;

        // Update table
        revisionRequestsTable.updateData(revisionRequests, totalItems);
        revisionRequestsTable.setLoading(false);
    } catch (error) {
        console.error('Error loading revision requests:', error);
        showNotification('Revizyon talepleri yüklenirken hata oluştu: ' + error.message, 'error');
        revisionRequestsTable.setLoading(false);
    }
}

// Show revision request details
async function showRevisionRequestDetails(request) {
    if (!detailsModal) return;

    currentRequest = request;
    detailsModal.clearAll();

    // Add general information section
    detailsModal.addSection({
        title: 'Genel Bilgiler',
        icon: 'fas fa-info-circle',
        iconColor: 'text-primary'
    });

    const generalInfoHtml = `
        <div class="row g-2">
            <div class="col-md-6">
                <div class="field-display mb-2 d-flex align-items-center">
                    <label class="field-label me-2 mb-0 flex-shrink-0">
                        <i class="fas fa-hashtag me-1"></i>Görev ID:
                    </label>
                    <div class="field-value">#${request.id || '-'}</div>
                </div>
            </div>
            <div class="col-md-6">
                <div class="field-display mb-2 d-flex align-items-center">
                    <label class="field-label me-2 mb-0 flex-shrink-0">
                        <i class="fas fa-briefcase me-1"></i>İş Emri:
                    </label>
                    <div class="field-value">${request.job_order || '-'}</div>
                </div>
            </div>
            <div class="col-md-6">
                <div class="field-display mb-2 d-flex align-items-center">
                    <label class="field-label me-2 mb-0 flex-shrink-0">
                        <i class="fas fa-building me-1"></i>Müşteri:
                    </label>
                    <div class="field-value">${request.customer_name || '-'}</div>
                </div>
            </div>
            <div class="col-md-12">
                <div class="field-display mb-2 d-flex align-items-start">
                    <label class="field-label me-2 mb-0 flex-shrink-0">
                        <i class="fas fa-heading me-1"></i>Görev Başlığı:
                    </label>
                    <div class="field-value">${request.title || '-'}</div>
                </div>
            </div>
            ${request.description ? `
            <div class="col-md-12">
                <div class="field-display mb-2 d-flex align-items-start">
                    <label class="field-label me-2 mb-0 flex-shrink-0">
                        <i class="fas fa-align-left me-1"></i>Açıklama:
                    </label>
                    <div class="field-value">${request.description || '-'}</div>
                </div>
            </div>
            ` : ''}
        </div>
    `;

    detailsModal.addCustomContent(generalInfoHtml);

    // Add drawing release section
    if (request.pending_revision_request) {
        detailsModal.addSection({
            title: 'Çizim Yayını Bilgileri',
            icon: 'fas fa-file-alt',
            iconColor: 'text-info'
        });

        const releaseInfoHtml = `
            <div class="row g-2">
                <div class="col-md-6">
                    <div class="field-display mb-2 d-flex align-items-center">
                        <label class="field-label me-2 mb-0 flex-shrink-0">
                            <i class="fas fa-code me-1"></i>Revizyon Kodu:
                        </label>
                        <div class="field-value">${request.pending_revision_request.revision_code || '-'}</div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="field-display mb-2 d-flex align-items-center">
                        <label class="field-label me-2 mb-0 flex-shrink-0">
                            <i class="fas fa-sort-numeric-down me-1"></i>Revizyon Numarası:
                        </label>
                        <div class="field-value">${request.pending_revision_request.revision_number || '-'}</div>
                    </div>
                </div>
            </div>
        `;

        detailsModal.addCustomContent(releaseInfoHtml);
    }

    // Add revision request section
    if (request.pending_revision_request) {
        detailsModal.addSection({
            title: 'Revizyon Talebi Bilgileri',
            icon: 'fas fa-edit',
            iconColor: 'text-warning'
        });

        const revisionRequestHtml = `
            <div class="row g-2">
                <div class="col-md-6">
                    <div class="field-display mb-2 d-flex align-items-center">
                        <label class="field-label me-2 mb-0 flex-shrink-0">
                            <i class="fas fa-user me-1"></i>Talep Eden:
                        </label>
                        <div class="field-value">${request.pending_revision_request.requested_by || '-'}</div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="field-display mb-2 d-flex align-items-center">
                        <label class="field-label me-2 mb-0 flex-shrink-0">
                            <i class="fas fa-calendar me-1"></i>Talep Tarihi:
                        </label>
                        <div class="field-value">${formatDateTime(request.pending_revision_request.requested_at)}</div>
                    </div>
                </div>
                <div class="col-md-12">
                    <div class="field-display mb-2 d-flex align-items-start">
                        <label class="field-label me-2 mb-0 flex-shrink-0">
                            <i class="fas fa-comment me-1"></i>Revizyon Nedeni:
                        </label>
                        <div class="field-value">
                            <pre style="white-space: pre-wrap; word-wrap: break-word; margin: 0; font-size: 0.9em;">${request.pending_revision_request.reason || '-'}</pre>
                        </div>
                    </div>
                </div>
            </div>
        `;

        detailsModal.addCustomContent(revisionRequestHtml);
    }

    // Add action buttons to modal footer
    const modalFooter = detailsModal.container.querySelector('.modal-footer');
    if (modalFooter) {
        modalFooter.innerHTML = `
            <div class="d-flex justify-content-end gap-2">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                    <i class="fas fa-times me-1"></i>Kapat
                </button>
                <button type="button" class="btn btn-danger" id="reject-from-details-btn" style="min-width: 120px;">
                    <i class="fas fa-times me-1"></i>Reddet
                </button>
                <button type="button" class="btn btn-success" id="approve-from-details-btn" style="min-width: 120px;">
                    <i class="fas fa-check me-1"></i>Onayla
                </button>
            </div>
        `;

        // Add event listeners
        const approveBtn = modalFooter.querySelector('#approve-from-details-btn');
        const rejectBtn = modalFooter.querySelector('#reject-from-details-btn');

        if (approveBtn) {
            approveBtn.addEventListener('click', () => {
                if (currentRequest) {
                    showApproveModal(currentRequest);
                }
            });
        }

        if (rejectBtn) {
            rejectBtn.addEventListener('click', () => {
                if (currentRequest) {
                    showRejectModal(currentRequest);
                }
            });
        }
    }

    detailsModal.render();
    detailsModal.show();
}

// Show approve confirmation modal
function showApproveModal(request) {
    if (!approveModal) return;

    currentRequest = request;

    const detailsHtml = `
        <div class="row g-2">
            <div class="col-6">
                <strong>İş Emri:</strong> ${request.job_order || '-'}
            </div>
            <div class="col-6">
                <strong>Müşteri:</strong> ${request.customer_name || '-'}
            </div>
            <div class="col-6">
                <strong>Görev:</strong> ${request.title || '-'}
            </div>
            ${request.pending_revision_request ? `
            <div class="col-6">
                <strong>Revizyon:</strong> ${request.pending_revision_request.revision_code || '-'}
            </div>
            ` : ''}
            ${request.pending_revision_request && request.pending_revision_request.requested_by ? `
            <div class="col-6">
                <strong>Talep Eden:</strong> ${request.pending_revision_request.requested_by}
            </div>
            ` : ''}
        </div>
    `;

    approveModal.show({
        title: 'Revizyon Talebi Onayı',
        message: 'Bu revizyon talebini onaylamak istediğinizden emin misiniz?',
        description: '',
        details: detailsHtml,
        confirmText: 'Evet, Onayla',
        onConfirm: async () => {
            await confirmApproveRevision();
        }
    });
}

// Confirm approve revision
async function confirmApproveRevision() {
    const confirmBtn = approveModal.modal.querySelector('#confirm-action-btn');
    const originalContent = confirmBtn ? confirmBtn.innerHTML : '';

    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Onaylanıyor...';
    }

    try {
        if (currentRequest && currentRequest.pending_revision_request && currentRequest.pending_revision_request.release_id) {
            const approvalData = {};
            if (currentRequest.pending_revision_request.topic_id) {
                approvalData.topic_id = currentRequest.pending_revision_request.topic_id;
            }
            await approveRevision(currentRequest.pending_revision_request.release_id, approvalData);
            showNotification('Revizyon talebi başarıyla onaylandı', 'success');
            approveModal.hide();
            detailsModal.hide();
            await loadRevisionRequests();
        } else {
            throw new Error('Revizyon talebi bilgisi bulunamadı');
        }
    } catch (error) {
        console.error('Error approving revision:', error);
        showNotification('Revizyon talebi onaylanırken hata oluştu: ' + error.message, 'error');

        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = originalContent;
        }
    }
}

// Show reject modal
function showRejectModal(request) {
    if (!rejectModal) return;

    currentRequest = request;
    rejectModal.clearAll();

    rejectModal.addSection({
        title: 'Reddetme Nedeni',
        icon: 'fas fa-times-circle',
        iconColor: 'text-danger'
    });

    rejectModal.addField({
        id: 'rejection-reason',
        name: 'reason',
        label: 'Reddetme Nedeni',
        type: 'textarea',
        value: '',
        required: true,
        placeholder: 'Reddetme nedenini açıklayın...',
        icon: 'fas fa-comment',
        colSize: 12,
        helpText: 'Reddetme nedenini detaylı olarak açıklayın'
    });

    rejectModal.render();
    rejectModal.show();
}

// Format date time
function formatDateTime(dateString) {
    if (!dateString) return '-';
    try {
        const date = new Date(dateString);
        return date.toLocaleString('tr-TR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (error) {
        return dateString;
    }
}
