import { DisplayModal } from '../../../components/display-modal/display-modal.js';
import { ConfirmationModal } from '../../../components/confirmation-modal/confirmation-modal.js';
import { FileAttachments } from '../../../components/file-attachments/file-attachments.js';
import { FileViewer } from '../../../components/file-viewer/file-viewer.js';
import {
    markDepartmentRequestTransferred as markTransferredAPI
} from '../../../apis/planning/departmentRequests.js';
import { formatDate, formatDateTime } from '../../../apis/formatters.js';

// Modal instances
let departmentRequestDetailsModal = null;
let transferDepartmentRequestModal = null;

// Global variables that will be set by the main file
let currentRequest = null;
let requests = [];
let loadRequests = null;
let loadCompletedRequests = null;
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

    // Initialize transfer department request modal using ConfirmationModal
    transferDepartmentRequestModal = new ConfirmationModal('transfer-department-request-modal-container', {
        title: 'Departman Talebi Transfer',
        icon: 'fas fa-exchange-alt',
        confirmText: 'Evet, Transfer Et',
        cancelText: 'İptal',
        confirmButtonClass: 'btn-info'
    });

    // Setup modal callbacks
    departmentRequestDetailsModal.onCloseCallback(() => {
        // Remove the request parameter from URL when modal is closed
        const url = new URL(window.location);
        url.searchParams.delete('request');
        window.history.pushState({}, '', url);
    });

    // Setup transfer modal cancel callback
    transferDepartmentRequestModal.setOnCancel(() => {
        currentRequest = null;
        window.currentTransferRequestId = null;

        // Re-enable transfer button in details modal if it was disabled
        const transferBtn = document.getElementById('transfer-department-request-btn');
        if (transferBtn && transferBtn.disabled) {
            transferBtn.disabled = false;
            transferBtn.innerHTML = '<i class="fas fa-exchange-alt me-1"></i>Transfer Et';
        }

        // Reset confirmation modal button state
        const confirmBtn = transferDepartmentRequestModal.modal.querySelector('#confirm-action-btn');
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = '<i class="fas fa-exchange-alt me-2"></i>Evet, Transfer Et';
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
                    ${requestToShow.request_number ? `
                    <div class="col-12">
                        <div class="field-display mb-2 d-flex align-items-center">
                            <label class="field-label me-2 mb-0 flex-shrink-0">
                                <i class="fas fa-barcode me-1"></i>Talep Numarası:
                            </label>
                            <div class="field-value">${requestToShow.request_number}</div>
                        </div>
                    </div>
                    ` : ''}
                    <div class="col-12">
                        <div class="field-display mb-2 d-flex align-items-center">
                            <label class="field-label me-2 mb-0 flex-shrink-0">
                                <i class="fas fa-user me-1"></i>Talep Eden:
                            </label>
                            <div class="field-value">${requestToShow.requestor_full_name || requestToShow.requestor_username || 'Bilinmiyor'}</div>
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
                    ${requestToShow.submitted_at ? `
                    <div class="col-12">
                        <div class="field-display mb-2 d-flex align-items-center">
                            <label class="field-label me-2 mb-0 flex-shrink-0">
                                <i class="fas fa-paper-plane me-1"></i>Gönderilme:
                            </label>
                            <div class="field-value">${formatDateTime(requestToShow.submitted_at)}</div>
                        </div>
                    </div>
                    ` : ''}
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
                                <i class="fas fa-calendar me-1"></i>İhtiyaç Tarihi:
                            </label>
                            <div class="field-value">${requestToShow.needed_date ? formatDate(requestToShow.needed_date) : '-'}</div>
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
                item_code: item.item_code || '-',
                item_name: item.item_name || item.name || item.product_name || '-',
                job_no: item.job_no || '-',
                quantity: item.quantity || 0,
                unit: item.item_unit || item.unit || 'adet',
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
                                    <th>Ürün Kodu</th>
                                    <th>Ürün Adı</th>
                                    <th>İş No</th>
                                    <th>Miktar</th>
                                    <th>Birim</th>
                                    <th>Açıklama</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${itemsData.map(item => `
                                    <tr>
                                        <td>${item.id}</td>
                                        <td><strong>${item.item_code}</strong></td>
                                        <td>${item.item_name}</td>
                                        <td>${item.job_no}</td>
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

        // Add files section if files exist
        if (requestToShow.files && requestToShow.files.length > 0) {
            departmentRequestDetailsModal.addSection({
                title: 'Dosya Ekleri',
                icon: 'fas fa-paperclip',
                iconColor: 'text-info'
            });

            const filesHtml = `
                <div id="department-request-files-container" class="mt-3"></div>
            `;

            departmentRequestDetailsModal.addCustomContent(filesHtml);
        }

        // Render the modal
        departmentRequestDetailsModal.render();

        // Add custom footer with appropriate buttons based on status
        const modalFooter = departmentRequestDetailsModal.container.querySelector('.modal-footer');
        if (modalFooter) {
            if (requestToShow.status === 'approved') {
                // Show transfer button for approved requests
                modalFooter.innerHTML = `
                    <div class="d-flex justify-content-end gap-2">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                            <i class="fas fa-times me-1"></i>Kapat
                        </button>
                        <button type="button" class="btn btn-info" id="transfer-department-request-btn" style="min-width: 120px;">
                            <i class="fas fa-exchange-alt me-1"></i>Transfer Et
                        </button>
                    </div>
                `;
            } else {
                // Show only close button for other statuses
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

        // Initialize files component after modal is rendered
        if (requestToShow.files && requestToShow.files.length > 0) {
            setTimeout(() => {
                const filesContainer = document.getElementById('department-request-files-container');
                if (filesContainer) {
                    const fileAttachments = new FileAttachments('department-request-files-container', {
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
                    fileAttachments.setFiles(requestToShow.files);
                }
            }, 100);
        }
    }
}

// Show transfer department request modal
function showTransferDepartmentRequestModal(requestId) {
    if (!transferDepartmentRequestModal) {
        console.error('showTransferDepartmentRequestModal: transferDepartmentRequestModal is not initialized');
        return;
    }

    // Find the request
    const request = requests.find(r => r.id === parseInt(requestId));
    if (!request) {
        console.error('showTransferDepartmentRequestModal: Request not found with id:', requestId);
        return;
    }

    // Store the requestId for the confirm button
    window.currentTransferRequestId = requestId;

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
        <div class="row g-2 mt-3">
            <div class="col-12">
                <div class="form-check">
                    <input class="form-check-input" type="checkbox" id="transfer-check-inventory" name="check_inventory">
                    <label class="form-check-label" for="transfer-check-inventory">
                        <i class="fas fa-warehouse me-2"></i>Envanter Kontrolü
                    </label>
                    <small class="form-text text-muted d-block ms-4 mt-1">Talebi envanter kontrolü için gönder</small>
                </div>
            </div>
        </div>
    `;

    // Show confirmation modal
    transferDepartmentRequestModal.show({
        title: 'Departman Talebi Transfer',
        message: 'Bu departman talebini transfer etmek istediğinizden emin misiniz?',
        description: '',
        details: detailsHtml,
        confirmText: 'Evet, Transfer Et',
        onConfirm: async () => {
            await confirmTransferDepartmentRequest(requestId);
        }
    });

    // Reset button state when modal is shown (in case it was disabled from previous transfer)
    setTimeout(() => {
        const confirmBtn = transferDepartmentRequestModal.modal.querySelector('#confirm-action-btn');
        if (confirmBtn) {
            confirmBtn.disabled = false;
        }
    }, 100);
}

// Confirm transfer department request
async function confirmTransferDepartmentRequest(requestId) {
    // Get the button and disable it
    const confirmTransferBtn = transferDepartmentRequestModal.modal.querySelector('#confirm-action-btn');
    const originalContent = confirmTransferBtn ? confirmTransferBtn.innerHTML : '';

    if (confirmTransferBtn) {
        confirmTransferBtn.disabled = true;
        confirmTransferBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Transfer ediliyor...';
    }

    try {
        // Get check_inventory value from checkbox
        const checkInventoryCheckbox = transferDepartmentRequestModal.modal.querySelector('#transfer-check-inventory');
        const checkInventory = checkInventoryCheckbox ? checkInventoryCheckbox.checked : false;
        
        await markTransferredAPI(requestId, { check_inventory: checkInventory });
        showNotification('Departman talebi başarıyla transfer edildi', 'success');

        // Clear stored request ID
        window.currentTransferRequestId = null;

        // Close the details modal if it's open
        if (departmentRequestDetailsModal) {
            departmentRequestDetailsModal.hide();
        }

        // Note: The confirmation modal will be closed automatically by handleConfirm after this promise resolves

        await loadRequests();
        if (loadCompletedRequests) {
            await loadCompletedRequests();
        }

        // Reset button state after modal is hidden (for next time)
        setTimeout(() => {
            const confirmBtn = transferDepartmentRequestModal.modal.querySelector('#confirm-action-btn');
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = '<i class="fas fa-exchange-alt me-2"></i>Evet, Transfer Et';
            }
        }, 300);
    } catch (error) {
        showNotification('Departman talebi transfer edilirken hata oluştu: ' + error.message, 'error');

        // Re-enable button on error (modal stays open so user can try again or cancel)
        if (confirmTransferBtn) {
            confirmTransferBtn.disabled = false;
            confirmTransferBtn.innerHTML = originalContent;
        }

        // Re-throw error so handleConfirm knows not to close the modal
        throw error;
    }
}

// Transfer department request function - removed from here
// The actual implementation is in department-requests.js

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
        // Transfer button (from details modal)
        const transferBtn = e.target.closest('#transfer-department-request-btn');
        if (transferBtn && !transferBtn.disabled) {
            if (currentRequest) {
                // Disable button and show loading state
                transferBtn.disabled = true;
                const originalContent = transferBtn.innerHTML;
                transferBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Yükleniyor...';

                try {
                    // Call the global transfer function from department-requests.js
                    if (window.transferDepartmentRequest) {
                        await window.transferDepartmentRequest(currentRequest.id);
                    }
                    // After modal opens, re-enable button
                    transferBtn.disabled = false;
                    transferBtn.innerHTML = originalContent;
                } catch (error) {
                    // Re-enable button on error
                    transferBtn.disabled = false;
                    transferBtn.innerHTML = originalContent;
                    showNotification('Transfer modalı açılırken hata oluştu: ' + error.message, 'error');
                }
            }
        }

        // Note: Confirm buttons are now handled by ConfirmationModal's onConfirm callbacks
    });
}

// Set global variables (called from main file)
function setGlobalVariables(globals) {
    currentRequest = globals.currentRequest;
    requests = globals.requests;
    loadRequests = globals.loadRequests;
    loadCompletedRequests = globals.loadCompletedRequests;
    showNotification = globals.showNotification;
}

// Export functions
export {
    initializeModalComponents,
    showDepartmentRequestDetailsModal,
    showTransferDepartmentRequestModal,
    confirmTransferDepartmentRequest,
    setupModalEventListeners,
    setGlobalVariables
};

// Export modal instances for external access
export function getDepartmentRequestDetailsModal() {
    return departmentRequestDetailsModal;
}

