import { DisplayModal } from '../../../components/display-modal/display-modal.js';
import { ConfirmationModal } from '../../../components/confirmation-modal/confirmation-modal.js';
import {
    approveDepartmentRequest as approveDepartmentRequestAPI
} from '../../../apis/planning/departmentRequests.js';
import { formatDate, formatDateTime } from '../../../apis/formatters.js';

// Modal instances
let departmentRequestDetailsModal = null;
let approveDepartmentRequestModal = null;

// Global variables that will be set by the main file
let currentRequest = null;
let requests = [];
let loadRequests = null;
let loadApprovedRequests = null;
let showNotification = null;

// Initialize modal components
function initializeModalComponents() {
    // Initialize department request details modal
    departmentRequestDetailsModal = new DisplayModal('department-request-details-modal-container', {
        title: 'Departman Talebi Detayları',
        icon: 'fas fa-boxes',
        size: 'xl',
        showEditButton: false
    });

    // Initialize approve department request modal using ConfirmationModal
    approveDepartmentRequestModal = new ConfirmationModal('approve-department-request-modal-container', {
        title: 'Departman Talebi Onayı',
        icon: 'fas fa-check-circle',
        confirmText: 'Evet, Onayla',
        cancelText: 'İptal',
        confirmButtonClass: 'btn-success'
    });

    // Setup modal callbacks
    departmentRequestDetailsModal.onCloseCallback(() => {
        // Remove the request parameter from URL when modal is closed
        const url = new URL(window.location);
        url.searchParams.delete('request');
        window.history.pushState({}, '', url);
    });

    // Setup approve modal cancel callback
    approveDepartmentRequestModal.setOnCancel(() => {
        currentRequest = null;
        window.currentApproveRequestId = null;

        // Re-enable approve button in details modal if it was disabled
        const approveBtn = document.getElementById('approve-department-request-btn');
        if (approveBtn && approveBtn.disabled) {
            approveBtn.disabled = false;
            approveBtn.innerHTML = '<i class="fas fa-check me-1"></i>Onayla';
        }

        // Reset confirmation modal button state
        const confirmBtn = approveDepartmentRequestModal.modal.querySelector('#confirm-action-btn');
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = '<i class="fas fa-check me-2"></i>Evet, Onayla';
        }
    });
}

// Show department request details modal
async function showDepartmentRequestDetailsModal(request = null) {
    if (!departmentRequestDetailsModal) return;

    // Use provided request or fall back to global currentRequest
    const requestToShow = request || currentRequest;
    if (!requestToShow) return;

    // Clear previous data
    if (departmentRequestDetailsModal) {
        departmentRequestDetailsModal.clearData();
    }

    // Get rejection comments
    const rejectionComments = getRejectionComments(requestToShow);

    // Add a custom section with two columns layout
    departmentRequestDetailsModal.addSection({
        title: '',
        icon: '',
        iconColor: 'text-primary'
    });

    // Add custom HTML content for two-column layout
    const twoColumnHtml = `
        <div class="row">
            <div class="col-md-6">
                <h6 class="text-primary mb-3">
                    <i class="fas fa-info-circle me-2"></i>Genel Bilgiler
                </h6>
                <div class="row g-2">
                    <div class="col-12">
                        <div class="field-display mb-2 d-flex align-items-center">
                            <label class="field-label me-2 mb-0 flex-shrink-0">
                                <i class="fas fa-hashtag me-1"></i>Talep No:
                            </label>
                            <div class="field-value">#${requestToShow.id}</div>
                        </div>
                    </div>
                    <div class="col-12">
                        <div class="field-display mb-2 d-flex align-items-center">
                            <label class="field-label me-2 mb-0 flex-shrink-0">
                                <i class="fas fa-user me-1"></i>Talep Eden:
                            </label>
                            <div class="field-value">${requestToShow.requestor_username || 'Bilinmiyor'}</div>
                        </div>
                    </div>
                    <div class="col-12">
                        <div class="field-display mb-2 d-flex align-items-center">
                            <label class="field-label me-2 mb-0 flex-shrink-0">
                                <i class="fas fa-building me-1"></i>Departman:
                            </label>
                            <div class="field-value">${requestToShow.department_label || requestToShow.department || '-'}</div>
                        </div>
                    </div>
                    <div class="col-12">
                        <div class="field-display mb-2 d-flex align-items-center">
                            <label class="field-label me-2 mb-0 flex-shrink-0">
                                <i class="fas fa-info me-1"></i>Durum:
                            </label>
                            <div class="field-value">${getStatusBadge(requestToShow.status, requestToShow.status_label)}</div>
                        </div>
                    </div>
                    <div class="col-12">
                        <div class="field-display mb-2 d-flex align-items-center">
                            <label class="field-label me-2 mb-0 flex-shrink-0">
                                <i class="fas fa-calendar-plus me-1"></i>Oluşturulma:
                            </label>
                            <div class="field-value">${formatDateTime(requestToShow.created_at)}</div>
                        </div>
                    </div>
                    <div class="col-12">
                        <div class="field-display mb-2 d-flex align-items-center">
                            <label class="field-label me-2 mb-0 flex-shrink-0">
                                <i class="fas fa-calendar-check me-1"></i>Son Güncelleme:
                            </label>
                            <div class="field-value">${formatDateTime(requestToShow.updated_at)}</div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-md-6">
                <h6 class="text-primary mb-3">
                    <i class="fas fa-clipboard-list me-2"></i>Talep Bilgileri
                </h6>
                <div class="row g-2">
                    ${requestToShow.title ? `
                    <div class="col-12">
                        <div class="field-display mb-2">
                            <label class="field-label mb-1">
                                <i class="fas fa-heading me-1"></i>Başlık:
                            </label>
                            <div class="field-value">${requestToShow.title}</div>
                        </div>
                    </div>
                    ` : ''}
                    <div class="col-12">
                        <div class="field-display mb-2">
                            <label class="field-label mb-1">
                                <i class="fas fa-align-left me-1"></i>Açıklama:
                            </label>
                            <div class="field-value" style="white-space: pre-wrap; word-wrap: break-word;">${requestToShow.description || '-'}</div>
                        </div>
                    </div>
                    <div class="col-12">
                        <div class="field-display mb-2 d-flex align-items-center">
                            <label class="field-label me-2 mb-0 flex-shrink-0">
                                <i class="fas fa-flag me-1"></i>Öncelik:
                            </label>
                            <div class="field-value">${getPriorityBadge(requestToShow.priority)}</div>
                        </div>
                    </div>
                    <div class="col-12">
                        <div class="field-display mb-2 d-flex align-items-center">
                            <label class="field-label me-2 mb-0 flex-shrink-0">
                                <i class="fas fa-calendar me-1"></i>Talep Tarihi:
                            </label>
                            <div class="field-value">${formatDate(requestToShow.needed_date)}</div>
                        </div>
                    </div>
                    <div class="col-12">
                        <div class="field-display mb-2 d-flex align-items-center">
                            <label class="field-label me-2 mb-0 flex-shrink-0">
                                <i class="fas fa-boxes me-1"></i>Ürün Sayısı:
                            </label>
                            <div class="field-value">${requestToShow.items?.length || 0} ürün</div>
                        </div>
                    </div>
                    ${requestToShow.approved_at ? `
                    <div class="col-12">
                        <div class="field-display mb-2 d-flex align-items-center">
                            <label class="field-label me-2 mb-0 flex-shrink-0">
                                <i class="fas fa-check-circle me-1"></i>Onay Tarihi:
                            </label>
                            <div class="field-value">${formatDateTime(requestToShow.approved_at)}</div>
                        </div>
                    </div>
                    ` : ''}
                    ${requestToShow.approved_by_username ? `
                    <div class="col-12">
                        <div class="field-display mb-2 d-flex align-items-center">
                            <label class="field-label me-2 mb-0 flex-shrink-0">
                                <i class="fas fa-user-check me-1"></i>Onaylayan:
                            </label>
                            <div class="field-value">${requestToShow.approved_by_username}</div>
                        </div>
                    </div>
                    ` : ''}
                </div>
            </div>
        </div>
    `;

    if (departmentRequestDetailsModal) {
        departmentRequestDetailsModal.addCustomContent(twoColumnHtml);

        // Add rejection comments section if any
        if (rejectionComments.length > 0) {
            departmentRequestDetailsModal.addSection({
                title: 'Reddetme Gerekçeleri',
                icon: 'fas fa-times-circle',
                iconColor: 'text-danger'
            });

            rejectionComments.forEach((comment, index) => {
                departmentRequestDetailsModal.addField({
                    id: `rejection-${index}`,
                    name: `rejection_${index}`,
                    label: `${comment.approver} - ${comment.stage}`,
                    type: 'text',
                    value: comment.comment,
                    icon: 'fas fa-comment-alt',
                    layout: 'vertical',
                    colSize: 12,
                    helpText: `Tarih: ${comment.date ? formatDateTime(comment.date) : '-'}`
                });
            });
        }

        // Add items section with table
        if (requestToShow.items && requestToShow.items.length > 0) {
            departmentRequestDetailsModal.addSection({
                title: 'Talep Edilen Ürünler',
                icon: 'fas fa-boxes',
                iconColor: 'text-primary'
            });

            // Create items table
            const itemsData = requestToShow.items.map((item, index) => ({
                id: index + 1,
                name: item.name || item.product_name || '-',
                quantity: item.quantity || 0,
                unit: item.unit || 'Adet',
                description: item.description || item.notes || '-'
            }));

            // Add custom HTML content for the table
            const tableHtml = `
                <div id="items-table-container" class="mt-3">
                    <div class="table-responsive">
                        <table class="table table-sm table-striped">
                            <thead class="table-light">
                                <tr>
                                    <th>#</th>
                                    <th>Ad</th>
                                    <th>Miktar</th>
                                    <th>Birim</th>
                                    <th>Açıklama</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${itemsData.map(item => `
                                    <tr>
                                        <td>${item.id}</td>
                                        <td><strong>${item.name}</strong></td>
                                        <td>${item.quantity}</td>
                                        <td>${item.unit}</td>
                                        <td>${item.description}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;

            departmentRequestDetailsModal.addCustomContent(tableHtml);
        }

        // Render the modal
        departmentRequestDetailsModal.render();

        // Add custom footer with appropriate buttons based on status
        const modalFooter = departmentRequestDetailsModal.container.querySelector('.modal-footer');
        if (modalFooter) {
            if (requestToShow.status === 'submitted') {
                // Show approve/reject buttons for submitted requests
                modalFooter.innerHTML = `
                    <div class="d-flex justify-content-end gap-2">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                            <i class="fas fa-times me-1"></i>Kapat
                        </button>
                        <button type="button" class="btn btn-danger" id="reject-department-request-btn" style="min-width: 120px;">
                            <i class="fas fa-times me-1"></i>Reddet
                        </button>
                        <button type="button" class="btn btn-success" id="approve-department-request-btn" style="min-width: 120px;">
                            <i class="fas fa-check me-1"></i>Onayla
                        </button>
                    </div>
                `;
            } else {
                // Show only close button for approved/cancelled/transferred requests
                modalFooter.innerHTML = `
                    <div class="d-flex justify-content-end gap-2">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                            <i class="fas fa-times me-1"></i>Kapat
                        </button>
                    </div>
                `;
            }
        }

        // Show the modal
        departmentRequestDetailsModal.show();
    }
}

// Show approve department request modal
function showApproveDepartmentRequestModal(requestId) {
    if (!approveDepartmentRequestModal) {
        console.error('showApproveDepartmentRequestModal: approveDepartmentRequestModal is not initialized');
        return;
    }

    // Find the request
    const request = requests.find(r => r.id === parseInt(requestId));
    if (!request) {
        console.error('showApproveDepartmentRequestModal: Request not found with id:', requestId);
        return;
    }

    // Store the requestId for the confirm button
    window.currentApproveRequestId = requestId;

    // Build details HTML
    const detailsHtml = `
        <div class="row g-2">
            <div class="col-6">
                <strong>Talep No:</strong> #${request.id}
            </div>
            <div class="col-6">
                <strong>Talep Eden:</strong> ${request.requestor_username || 'Bilinmiyor'}
            </div>
            <div class="col-6">
                <strong>Departman:</strong> ${request.department_label || '-'}
            </div>
            <div class="col-6">
                <strong>Ürün Sayısı:</strong> ${request.items?.length || 0} ürün
            </div>
            <div class="col-6">
                <strong>Öncelik:</strong> ${getPriorityLabel(request.priority)}
            </div>
            <div class="col-6">
                <strong>Talep Tarihi:</strong> ${formatDate(request.needed_date)}
            </div>
        </div>
    `;

    // Show confirmation modal
    approveDepartmentRequestModal.show({
        title: 'Departman Talebi Onayı',
        message: 'Bu departman talebini onaylamak istediğinizden emin misiniz?',
        description: '',
        details: detailsHtml,
        confirmText: 'Evet, Onayla',
        onConfirm: async () => {
            await confirmApproveDepartmentRequest(requestId);
        }
    });

    // Reset button state when modal is shown (in case it was disabled from previous approval)
    setTimeout(() => {
        const confirmBtn = approveDepartmentRequestModal.modal.querySelector('#confirm-action-btn');
        if (confirmBtn) {
            confirmBtn.disabled = false;
        }
    }, 100);
}

// Confirm approve department request
async function confirmApproveDepartmentRequest(requestId) {
    // Get the button and disable it
    const confirmApproveBtn = approveDepartmentRequestModal.modal.querySelector('#confirm-action-btn');
    const originalContent = confirmApproveBtn ? confirmApproveBtn.innerHTML : '';

    if (confirmApproveBtn) {
        confirmApproveBtn.disabled = true;
        confirmApproveBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Onaylanıyor...';
    }

    try {
        await approveDepartmentRequestAPI(requestId);
        showNotification('Departman talebi başarıyla onaylandı', 'success');

        // Clear stored request ID
        window.currentApproveRequestId = null;

        // Close the details modal if it's open
        if (departmentRequestDetailsModal) {
            departmentRequestDetailsModal.hide();
        }

        // Note: The confirmation modal will be closed automatically by handleConfirm after this promise resolves

        await loadRequests();
        await loadApprovedRequests();

        // Reset button state after modal is hidden (for next time)
        setTimeout(() => {
            const confirmBtn = approveDepartmentRequestModal.modal.querySelector('#confirm-action-btn');
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = '<i class="fas fa-check me-2"></i>Evet, Onayla';
            }
        }, 300);
    } catch (error) {
        showNotification('Departman talebi onaylanırken hata oluştu: ' + error.message, 'error');

        // Re-enable button on error (modal stays open so user can try again or cancel)
        if (confirmApproveBtn) {
            confirmApproveBtn.disabled = false;
            confirmApproveBtn.innerHTML = originalContent;
        }

        // Re-throw error so handleConfirm knows not to close the modal
        throw error;
    }
}

// Approve department request function
async function approveDepartmentRequest(requestId) {
    // Ensure we have a valid requestId
    if (!requestId) {
        console.error('approveDepartmentRequest: requestId is required');
        return;
    }

    // Close details modal if it's open to prevent conflicts
    if (departmentRequestDetailsModal) {
        departmentRequestDetailsModal.hide();
    }

    // Show approve confirmation modal directly (not the details modal)
    showApproveDepartmentRequestModal(requestId);
}

// Reject department request function
async function rejectDepartmentRequestModal(requestId) {
    // Store the request ID for the modal
    window.currentRejectRequestId = requestId;

    // Show the rejection modal
    const rejectModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('rejectDepartmentRequestModal'));
    rejectModal.show();
}

// Utility functions
function getStatusBadge(status, statusLabel) {
    const displayText = statusLabel || status;

    const statusMap = {
        'submitted': 'status-yellow',
        'approved': 'status-green',
        'rejected': 'status-red',
        'cancelled': 'status-red',
        'transferred': 'status-blue',
        'draft': 'status-grey'
    };

    const statusClass = statusMap[status] || 'status-grey';

    return `<span class="badge ${statusClass}">${displayText}</span>`;
}

function getPriorityBadge(priority) {
    let badgeClass = 'status-grey';
    let label = 'Normal';

    switch (priority) {
        case 'urgent':
            badgeClass = 'status-red';
            label = 'Acil';
            break;
        case 'high':
            badgeClass = 'status-yellow';
            label = 'Yüksek';
            break;
        case 'normal':
            badgeClass = 'status-blue';
            label = 'Normal';
            break;
        case 'low':
            badgeClass = 'status-grey';
            label = 'Düşük';
            break;
    }

    return `<span class="badge ${badgeClass}">${label}</span>`;
}

function getPriorityLabel(priority) {
    switch (priority) {
        case 'urgent': return 'Acil';
        case 'high': return 'Yüksek';
        case 'normal': return 'Normal';
        case 'low': return 'Düşük';
        default: return 'Normal';
    }
}

function getRejectionComments(request) {
    if (!request.approvals || request.approvals.length === 0) {
        return [];
    }

    const rejectionComments = [];

    // Get the first (latest) approval workflow
    const approval = request.approvals[0];

    if (approval.stage_instances) {
        approval.stage_instances.forEach(stage => {
            if (stage.decisions && stage.decisions.length > 0) {
                stage.decisions.forEach(decision => {
                    if ((decision.decision === 'cancelled' || decision.decision === 'rejected') && decision.comment) {
                        rejectionComments.push({
                            approver: decision.approver_name || decision.approver_username || 'Bilinmeyen',
                            stage: stage.name,
                            comment: decision.comment,
                            date: decision.decision_date
                        });
                    }
                });
            }
        });
    }

    return rejectionComments;
}

// Setup modal event listeners
function setupModalEventListeners() {
    // Use event delegation for dynamic buttons
    document.addEventListener('click', async (e) => {
        // Approve button (from details modal)
        const approveBtn = e.target.closest('#approve-department-request-btn');
        if (approveBtn && !approveBtn.disabled) {
            if (currentRequest) {
                // Disable button and show loading state
                approveBtn.disabled = true;
                const originalContent = approveBtn.innerHTML;
                approveBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Yükleniyor...';

                try {
                    // Show approve confirmation modal
                    approveDepartmentRequest(currentRequest.id);
                    // After modal opens, change button text to indicate waiting for confirmation
                    setTimeout(() => {
                        if (approveBtn && approveBtn.disabled) {
                            approveBtn.innerHTML = '<i class="fas fa-check me-1"></i>Onay Bekleniyor...';
                        }
                    }, 300);
                } catch (error) {
                    // Re-enable button on error
                    approveBtn.disabled = false;
                    approveBtn.innerHTML = originalContent;
                    showNotification('Onay modalı açılırken hata oluştu: ' + error.message, 'error');
                }
            }
        }

        // Note: Confirm buttons are now handled by ConfirmationModal's onConfirm callbacks

        // Reject button (from details modal)
        const rejectBtn = e.target.closest('#reject-department-request-btn');
        if (rejectBtn) {
            if (currentRequest) {
                await rejectDepartmentRequestModal(currentRequest.id);
            }
        }
    });
}

// Set global variables (called from main file)
function setGlobalVariables(globals) {
    currentRequest = globals.currentRequest;
    requests = globals.requests;
    loadRequests = globals.loadRequests;
    loadApprovedRequests = globals.loadApprovedRequests;
    showNotification = globals.showNotification;
}

// Export functions
export {
    initializeModalComponents,
    showDepartmentRequestDetailsModal,
    showApproveDepartmentRequestModal,
    confirmApproveDepartmentRequest,
    approveDepartmentRequest,
    rejectDepartmentRequestModal,
    setupModalEventListeners,
    setGlobalVariables
};
