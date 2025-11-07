import { DisplayModal } from '../../../components/display-modal/display-modal.js';
import { ConfirmationModal } from '../../../components/confirmation-modal/confirmation-modal.js';
import { 
    approveOvertimeRequest,
    rejectOvertimeRequest,
    formatOvertimeDuration
} from '../../../apis/overtime.js';
import { formatDate, formatDateTime } from '../../../apis/formatters.js';

// Modal instances
let overtimeDetailsModal = null;
let approveOvertimeModal = null;
let rejectOvertimeModal = null;

// Global variables that will be set by the main file
let currentRequest = null;
let requests = [];
let loadRequests = null;
let loadApprovedRequests = null;
let showNotification = null;

// Initialize modal components
function initializeModalComponents() {
    // Initialize overtime details modal
    overtimeDetailsModal = new DisplayModal('overtime-details-modal-container', {
        title: 'Mesai Talebi Detayları',
        icon: 'fas fa-clock',
        size: 'xl',
        showEditButton: false
    });

    // Initialize approve overtime modal using ConfirmationModal
    approveOvertimeModal = new ConfirmationModal('approve-overtime-modal-container', {
        title: 'Mesai Talebi Onayı',
        icon: 'fas fa-check-circle',
        confirmText: 'Evet, Onayla',
        cancelText: 'İptal',
        confirmButtonClass: 'btn-success'
    });

    // Initialize reject overtime modal using ConfirmationModal
    rejectOvertimeModal = new ConfirmationModal('reject-overtime-modal-container', {
        title: 'Mesai Talebi Reddi',
        icon: 'fas fa-times-circle',
        confirmText: 'Evet, Reddet',
        cancelText: 'İptal',
        confirmButtonClass: 'btn-danger'
    });

    // Setup modal callbacks
    overtimeDetailsModal.onCloseCallback(() => {
        // Remove the request parameter from URL when modal is closed
        const url = new URL(window.location);
        url.searchParams.delete('request');
        window.history.pushState({}, '', url);
    });
    
    // Setup approve modal cancel callback
    approveOvertimeModal.setOnCancel(() => {
        currentRequest = null;
        window.currentApproveRequestId = null;
        
        // Re-enable approve button in details modal if it was disabled
        const approveBtn = document.getElementById('approve-overtime-btn');
        if (approveBtn && approveBtn.disabled) {
            approveBtn.disabled = false;
            approveBtn.innerHTML = '<i class="fas fa-check me-1"></i>Onayla';
        }
        
        // Reset confirmation modal button state
        const confirmBtn = approveOvertimeModal.modal.querySelector('#confirm-action-btn');
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = '<i class="fas fa-check me-2"></i>Evet, Onayla';
        }
    });
    
    // Setup reject modal cancel callback
    rejectOvertimeModal.setOnCancel(() => {
        currentRequest = null;
        window.currentRejectRequestId = null;
    });
}

// Show overtime details modal
async function showOvertimeDetailsModal(request = null) {
    if (!overtimeDetailsModal) return;
    
    // Use provided request or fall back to global currentRequest
    const requestToShow = request || currentRequest;
    if (!requestToShow) return;
    
    // Clear previous data
    if (overtimeDetailsModal) {
        overtimeDetailsModal.clearData();
    }
    
    // Get rejection comments
    const rejectionComments = getRejectionComments(requestToShow);
    
    // Add a custom section with two columns layout
    overtimeDetailsModal.addSection({
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
                            <div class="field-value">${requestToShow.requester_username}</div>
                        </div>
                    </div>
                    <div class="col-12">
                        <div class="field-display mb-2 d-flex align-items-center">
                            <label class="field-label me-2 mb-0 flex-shrink-0">
                                <i class="fas fa-building me-1"></i>Departman:
                            </label>
                            <div class="field-value">${requestToShow.team_label || requestToShow.team || '-'}</div>
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
                    <i class="fas fa-clock me-2"></i>Mesai Bilgileri
                </h6>
                <div class="row g-2">
                    <div class="col-12">
                        <div class="field-display mb-2 d-flex align-items-center">
                            <label class="field-label me-2 mb-0 flex-shrink-0">
                                <i class="fas fa-play me-1"></i>Başlangıç:
                            </label>
                            <div class="field-value">${formatDateTime(requestToShow.start_at)}</div>
                        </div>
                    </div>
                    <div class="col-12">
                        <div class="field-display mb-2 d-flex align-items-center">
                            <label class="field-label me-2 mb-0 flex-shrink-0">
                                <i class="fas fa-stop me-1"></i>Bitiş:
                            </label>
                            <div class="field-value">${formatDateTime(requestToShow.end_at)}</div>
                        </div>
                    </div>
                    <div class="col-12">
                        <div class="field-display mb-2 d-flex align-items-center">
                            <label class="field-label me-2 mb-0 flex-shrink-0">
                                <i class="fas fa-hourglass-half me-1"></i>Süre:
                            </label>
                            <div class="field-value"><strong>${formatOvertimeDuration(parseFloat(requestToShow.duration_hours))}</strong></div>
                        </div>
                    </div>
                    <div class="col-12">
                        <div class="field-display mb-2 d-flex align-items-center">
                            <label class="field-label me-2 mb-0 flex-shrink-0">
                                <i class="fas fa-users me-1"></i>Katılımcı Sayısı:
                            </label>
                            <div class="field-value">${requestToShow.entries?.length || 0} kişi</div>
                        </div>
                    </div>
                    <div class="col-12">
                        <div class="field-display mb-2 d-flex align-items-center">
                            <label class="field-label me-2 mb-0 flex-shrink-0">
                                <i class="fas fa-question-circle me-1"></i>Neden:
                            </label>
                            <div class="field-value">${requestToShow.reason || 'Belirtilmemiş'}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    if (overtimeDetailsModal) {
        overtimeDetailsModal.addCustomContent(twoColumnHtml);
        
        // Add rejection comments section if any
        if (rejectionComments.length > 0) {
            overtimeDetailsModal.addSection({
                title: 'Reddetme Gerekçeleri',
                icon: 'fas fa-times-circle',
                iconColor: 'text-danger'
            });
            
            rejectionComments.forEach((comment, index) => {
                overtimeDetailsModal.addField({
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
        
        // Add participants section with table component
        if (requestToShow.entries && requestToShow.entries.length > 0) {
            overtimeDetailsModal.addSection({
                title: 'Katılımcılar',
                icon: 'fas fa-users',
                iconColor: 'text-primary'
            });
            
            // Create participants table using TableComponent
            const participantsData = requestToShow.entries.map((entry, index) => ({
                id: index + 1,
                user_name: entry.user_full_name || entry.user_username || entry.username,
                reason: entry.description || 'Belirtilmemiş'
            }));
            
            // Add custom HTML content for the table
            const tableHtml = `
                <div id="participants-table-container" class="mt-3">
                    <div class="table-responsive">
                        <table class="table table-sm table-striped">
                            <thead class="table-light">
                                <tr>
                                    <th>#</th>
                                    <th>Katılımcı</th>
                                    <th>Neden</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${participantsData.map(participant => `
                                    <tr>
                                        <td>${participant.id}</td>
                                        <td><strong>${participant.user_name}</strong></td>
                                        <td>${participant.reason}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
            
            overtimeDetailsModal.addCustomContent(tableHtml);
        }
        
        // Render the modal
        overtimeDetailsModal.render();
        
        // Add custom footer with appropriate buttons based on status
        const modalFooter = overtimeDetailsModal.container.querySelector('.modal-footer');
        if (modalFooter) {
            if (requestToShow.status === 'submitted') {
                // Show approve/reject buttons for submitted requests
                modalFooter.innerHTML = `
                    <div class="d-flex justify-content-end gap-2">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                            <i class="fas fa-times me-1"></i>Kapat
                        </button>
                        <button type="button" class="btn btn-danger" id="reject-overtime-btn" style="min-width: 120px;">
                            <i class="fas fa-times me-1"></i>Reddet
                        </button>
                        <button type="button" class="btn btn-success" id="approve-overtime-btn" style="min-width: 120px;">
                            <i class="fas fa-check me-1"></i>Onayla
                        </button>
                    </div>
                `;
            } else {
                // Show only close button for approved/cancelled requests
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
        overtimeDetailsModal.show();
    }
}

// Show approve overtime modal
function showApproveOvertimeModal(requestId) {
    if (!approveOvertimeModal) {
        console.error('showApproveOvertimeModal: approveOvertimeModal is not initialized');
        return;
    }
    
    // Find the request
    const request = requests.find(r => r.id === parseInt(requestId));
    if (!request) {
        console.error('showApproveOvertimeModal: Request not found with id:', requestId);
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
                <strong>Talep Eden:</strong> ${request.requester_username}
            </div>
            <div class="col-6">
                <strong>Mesai Süresi:</strong> ${formatOvertimeDuration(parseFloat(request.duration_hours))}
            </div>
            <div class="col-6">
                <strong>Tarih:</strong> ${formatDate(request.start_at)} - ${formatDate(request.end_at)}
            </div>
        </div>
    `;
    
    // Show confirmation modal
    approveOvertimeModal.show({
        title: 'Mesai Talebi Onayı',
        message: 'Bu mesai talebini onaylamak istediğinizden emin misiniz?',
        description: '',
        details: detailsHtml,
        confirmText: 'Evet, Onayla',
        onConfirm: async () => {
            await confirmApproveOvertime(requestId);
        }
    });
    
    // Reset button state when modal is shown (in case it was disabled from previous approval)
    setTimeout(() => {
        const confirmBtn = approveOvertimeModal.modal.querySelector('#confirm-action-btn');
        if (confirmBtn) {
            confirmBtn.disabled = false;
        }
    }, 100);
}

// Show reject overtime modal
function showRejectOvertimeModal(requestId) {
    if (!rejectOvertimeModal) return;
    
    // Find the request
    const request = requests.find(r => r.id === parseInt(requestId));
    if (!request) return;
    
    // Store the request ID
    window.currentRejectRequestId = requestId;
    
    // Build details HTML with textarea for rejection reason
    const detailsHtml = `
        <div class="row g-2 mb-3">
            <div class="col-6">
                <strong>Talep No:</strong> #${request.id}
            </div>
            <div class="col-6">
                <strong>Talep Eden:</strong> ${request.requester_username}
            </div>
            <div class="col-6">
                <strong>Mesai Süresi:</strong> ${formatOvertimeDuration(parseFloat(request.duration_hours))}
            </div>
            <div class="col-6">
                <strong>Tarih:</strong> ${formatDate(request.start_at)} - ${formatDate(request.end_at)}
            </div>
        </div>
        <div class="mb-3">
            <label for="reject-reason-textarea" class="form-label">
                <i class="fas fa-comment-alt me-1"></i>
                Reddetme Gerekçesi <span class="text-danger">*</span>
            </label>
            <textarea
                class="form-control"
                id="reject-reason-textarea"
                name="rejectReason"
                rows="4"
                placeholder="Reddetme gerekçenizi buraya yazın..."
                maxlength="500"
                required
            ></textarea>
            <div class="form-text">
                <span id="reject-reason-counter">0</span>/500 karakter
            </div>
        </div>
    `;
    
    // Create onConfirm handler function
    const handleRejectConfirm = async () => {
        // Get rejection reason
        const textarea = rejectOvertimeModal.modal.querySelector('#reject-reason-textarea');
        const rejectionReason = textarea ? textarea.value.trim() : '';
        
        // Validate - if validation fails, prevent modal from closing by reopening it
        if (!rejectionReason || rejectionReason.length === 0) {
            showNotification('Reddetme gerekçesi zorunludur. Lütfen bir gerekçe belirtin.', 'error');
            // Reopen modal after a short delay to prevent it from closing
            setTimeout(() => {
                showRejectOvertimeModal(requestId);
            }, 100);
            return;
        }
        
        if (rejectionReason.length < 10) {
            showNotification('Reddetme gerekçesi en az 10 karakter olmalıdır.', 'error');
            // Reopen modal after a short delay to prevent it from closing
            setTimeout(() => {
                showRejectOvertimeModal(requestId);
            }, 100);
            return;
        }
        
        await confirmRejectOvertime(requestId, rejectionReason);
    };
    
    // Show confirmation modal
    rejectOvertimeModal.show({
        title: 'Mesai Talebi Reddi',
        message: 'Bu mesai talebini reddetmek istediğinizden emin misiniz? Bu işlem geri alınamaz.',
        description: '',
        details: detailsHtml,
        confirmText: 'Evet, Reddet',
        onConfirm: handleRejectConfirm
    });
    
    // Setup character counter after modal is shown
    setTimeout(() => {
        const textarea = rejectOvertimeModal.modal.querySelector('#reject-reason-textarea');
        const counter = rejectOvertimeModal.modal.querySelector('#reject-reason-counter');
        
        if (textarea && counter) {
            textarea.addEventListener('input', () => {
                const length = textarea.value.length;
                counter.textContent = length;
            });
        }
    }, 100);
}

// Confirm approve overtime
async function confirmApproveOvertime(requestId) {
    // Get the button and disable it
    const confirmApproveBtn = approveOvertimeModal.modal.querySelector('#confirm-action-btn');
    const originalContent = confirmApproveBtn ? confirmApproveBtn.innerHTML : '';
    
    if (confirmApproveBtn) {
        confirmApproveBtn.disabled = true;
        confirmApproveBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Onaylanıyor...';
    }
    
    try {
        await approveOvertimeRequest(requestId);
        showNotification('Mesai talebi başarıyla onaylandı', 'success');
        
        // Clear stored request ID
        window.currentApproveRequestId = null;
        
        // Close the details modal if it's open
        if (overtimeDetailsModal) {
            overtimeDetailsModal.hide();
        }
        
        // Note: The confirmation modal will be closed automatically by handleConfirm after this promise resolves
        
        await loadRequests();
        await loadApprovedRequests();
        
        // Reset button state after modal is hidden (for next time)
        setTimeout(() => {
            const confirmBtn = approveOvertimeModal.modal.querySelector('#confirm-action-btn');
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = '<i class="fas fa-check me-2"></i>Evet, Onayla';
            }
        }, 300);
    } catch (error) {
        showNotification('Mesai talebi onaylanırken hata oluştu: ' + error.message, 'error');
        
        // Re-enable button on error (modal stays open so user can try again or cancel)
        if (confirmApproveBtn) {
            confirmApproveBtn.disabled = false;
            confirmApproveBtn.innerHTML = originalContent;
        }
        
        // Re-throw error so handleConfirm knows not to close the modal
        throw error;
    }
}

// Confirm reject overtime
async function confirmRejectOvertime(requestId, rejectionReason) {
    // Get the button and disable it
    const confirmRejectBtn = rejectOvertimeModal.modal.querySelector('#confirm-action-btn');
    const originalContent = confirmRejectBtn ? confirmRejectBtn.innerHTML : '';
    
    if (confirmRejectBtn) {
        confirmRejectBtn.disabled = true;
        confirmRejectBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Reddediliyor...';
    }
    
    try {
        await rejectOvertimeRequest(requestId, rejectionReason);
        showNotification('Mesai talebi başarıyla reddedildi', 'success');
        
        // Close the reject modal
        if (rejectOvertimeModal) {
            rejectOvertimeModal.hide();
        }
        
        // Close the details modal if it's open
        if (overtimeDetailsModal) {
            overtimeDetailsModal.hide();
        }
        
        // Clear stored request ID
        window.currentRejectRequestId = null;
        
        await loadRequests();
        await loadApprovedRequests();
    } catch (error) {
        showNotification('Mesai talebi reddedilirken hata oluştu: ' + error.message, 'error');
        
        // Re-enable button on error
        if (confirmRejectBtn) {
            confirmRejectBtn.disabled = false;
            confirmRejectBtn.innerHTML = originalContent;
        }
    }
}

// Approve overtime function
async function approveOvertime(requestId) {
    // Ensure we have a valid requestId
    if (!requestId) {
        console.error('approveOvertime: requestId is required');
        return;
    }
    
    // Close details modal if it's open to prevent conflicts
    if (overtimeDetailsModal) {
        overtimeDetailsModal.hide();
    }
    
    // Show approve confirmation modal directly (not the details modal)
    showApproveOvertimeModal(requestId);
}

// Reject overtime function
async function rejectOvertime(requestId) {
    // Close details modal if it's open to prevent conflicts
    if (overtimeDetailsModal) {
        overtimeDetailsModal.hide();
    }
    
    // Show reject confirmation modal
    showRejectOvertimeModal(requestId);
}

// Utility functions
function getStatusBadge(status, statusLabel) {
    const displayText = statusLabel || status;
    
    const statusMap = {
        'submitted': 'status-yellow',
        'approved': 'status-green',
        'cancelled': 'status-red'
    };
    
    const statusClass = statusMap[status] || 'status-pending';
    
    return `<span class="badge ${statusClass}">${displayText}</span>`;
}

function getRejectionComments(request) {
    if (!request.approval || !request.approval.stage_instances) {
        return [];
    }
    
    const rejectionComments = [];
    
    request.approval.stage_instances.forEach(stage => {
        if (stage.decisions && stage.decisions.length > 0) {
            stage.decisions.forEach(decision => {
                if (decision.decision === 'cancelled' && decision.comment) {
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
    
    return rejectionComments;
}

// Setup modal event listeners
function setupModalEventListeners() {
    // Use event delegation for dynamic buttons
    document.addEventListener('click', async (e) => {
        // Approve button (from details modal)
        const approveBtn = e.target.closest('#approve-overtime-btn');
        if (approveBtn && !approveBtn.disabled) {
            if (currentRequest) {
                // Disable button and show loading state
                approveBtn.disabled = true;
                const originalContent = approveBtn.innerHTML;
                approveBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Yükleniyor...';
                
                try {
                    // Show approve confirmation modal
                    approveOvertime(currentRequest.id);
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
        const rejectBtn = e.target.closest('#reject-overtime-btn');
        if (rejectBtn) {
            if (currentRequest) {
                await rejectOvertime(currentRequest.id);
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
    showOvertimeDetailsModal,
    showApproveOvertimeModal,
    showRejectOvertimeModal,
    confirmApproveOvertime,
    confirmRejectOvertime,
    approveOvertime,
    rejectOvertime,
    setupModalEventListeners,
    setGlobalVariables
};
