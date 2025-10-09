import { DisplayModal } from '../../../components/display-modal/display-modal.js';
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

    // Initialize approve overtime modal
    approveOvertimeModal = new DisplayModal('approve-overtime-modal-container', {
        title: 'Mesai Talebi Onayı',
        icon: 'fas fa-check-circle',
        size: 'md',
        showEditButton: false
    });

    // Initialize reject overtime modal
    rejectOvertimeModal = new DisplayModal('reject-overtime-modal-container', {
        title: 'Mesai Talebi Reddi',
        icon: 'fas fa-times-circle',
        size: 'md',
        showEditButton: false
    });

    // Setup modal callbacks
    overtimeDetailsModal.onCloseCallback(() => {
        // Remove the request parameter from URL when modal is closed
        const url = new URL(window.location);
        url.searchParams.delete('request');
        window.history.pushState({}, '', url);
    });
    
    approveOvertimeModal.onCloseCallback(() => {
        currentRequest = null;
    });
    
    rejectOvertimeModal.onCloseCallback(() => {
        currentRequest = null;
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
        
        // Add custom footer with approve/reject buttons if status is submitted
        if (requestToShow.status === 'submitted') {
            const modalFooter = overtimeDetailsModal.container.querySelector('.modal-footer');
            if (modalFooter) {
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
            }
        }
        
        // Show the modal
        overtimeDetailsModal.show();
    }
}

// Show approve overtime modal
function showApproveOvertimeModal(requestId) {
    if (!approveOvertimeModal) return;
    
    // Find the request
    const request = requests.find(r => r.id === parseInt(requestId));
    if (!request) return;
    
    approveOvertimeModal.clearData();
    
    // Add section for approval confirmation
    approveOvertimeModal.addSection({
        title: 'Onay Onayı',
        icon: 'fas fa-check-circle',
        iconColor: 'text-success'
    });
    
    // Add request details
    approveOvertimeModal.addField({
        id: 'approve-request-id',
        name: 'request_id',
        label: 'Talep No',
        type: 'text',
        value: `#${request.id}`,
        icon: 'fas fa-hashtag',
        colSize: 6
    });
    
    approveOvertimeModal.addField({
        id: 'approve-requester',
        name: 'requester',
        label: 'Talep Eden',
        type: 'text',
        value: request.requester_username,
        icon: 'fas fa-user',
        colSize: 6
    });
    
    approveOvertimeModal.addField({
        id: 'approve-duration',
        name: 'duration',
        label: 'Mesai Süresi',
        type: 'text',
        value: formatOvertimeDuration(parseFloat(request.duration_hours)),
        icon: 'fas fa-clock',
        colSize: 6
    });
    
    approveOvertimeModal.addField({
        id: 'approve-date',
        name: 'date',
        label: 'Tarih',
        type: 'text',
        value: `${formatDate(request.start_at)} - ${formatDate(request.end_at)}`,
        icon: 'fas fa-calendar',
        colSize: 6
    });
    
    approveOvertimeModal.addField({
        id: 'approve-warning',
        name: 'warning',
        label: 'Uyarı',
        type: 'text',
        value: 'Bu mesai talebini onaylamak istediğinizden emin misiniz?',
        icon: 'fas fa-exclamation-triangle',
        colSize: 12
    });
    
    approveOvertimeModal.render();
    
    // Add custom footer with approve button
    const modalFooter = approveOvertimeModal.container.querySelector('.modal-footer');
    if (modalFooter) {
        modalFooter.innerHTML = `
            <div class="d-flex justify-content-end gap-2">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                    <i class="fas fa-times me-1"></i>İptal
                </button>
                <button type="button" class="btn btn-success" id="confirm-approve-overtime-btn" style="min-width: 120px;">
                    <i class="fas fa-check me-1"></i>Evet, Onayla
                </button>
            </div>
        `;
    }
    
    approveOvertimeModal.show();
}

// Show reject overtime modal
function showRejectOvertimeModal(requestId) {
    if (!rejectOvertimeModal) return;
    
    // Find the request
    const request = requests.find(r => r.id === parseInt(requestId));
    if (!request) return;
    
    rejectOvertimeModal.clearData();
    
    // Add section for rejection confirmation
    rejectOvertimeModal.addSection({
        title: 'Reddetme Onayı',
        icon: 'fas fa-times-circle',
        iconColor: 'text-danger'
    });
    
    // Add request details
    rejectOvertimeModal.addField({
        id: 'reject-request-id',
        name: 'request_id',
        label: 'Talep No',
        type: 'text',
        value: `#${request.id}`,
        icon: 'fas fa-hashtag',
        colSize: 6
    });
    
    rejectOvertimeModal.addField({
        id: 'reject-requester',
        name: 'requester',
        label: 'Talep Eden',
        type: 'text',
        value: request.requester_username,
        icon: 'fas fa-user',
        colSize: 6
    });
    
    rejectOvertimeModal.addField({
        id: 'reject-duration',
        name: 'duration',
        label: 'Mesai Süresi',
        type: 'text',
        value: formatOvertimeDuration(parseFloat(request.duration_hours)),
        icon: 'fas fa-clock',
        colSize: 6
    });
    
    rejectOvertimeModal.addField({
        id: 'reject-date',
        name: 'date',
        label: 'Tarih',
        type: 'text',
        value: `${formatDate(request.start_at)} - ${formatDate(request.end_at)}`,
        icon: 'fas fa-calendar',
        colSize: 6
    });
    
    rejectOvertimeModal.addField({
        id: 'reject-warning',
        name: 'warning',
        label: 'Uyarı',
        type: 'text',
        value: 'Bu mesai talebini reddetmek istediğinizden emin misiniz? Bu işlem geri alınamaz.',
        icon: 'fas fa-exclamation-triangle',
        colSize: 12
    });
    
    // Add separate section for rejection reason
    rejectOvertimeModal.addSection({
        title: 'Reddetme Gerekçesi',
        icon: 'fas fa-comment-alt',
        iconColor: 'text-danger'
    });
    
    // Add custom content for rejection reason textarea as mandatory field
    const customContent = `
        <div class="row">
            <div class="col-12">
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
            </div>
        </div>
    `;
    
    rejectOvertimeModal.addCustomContent(customContent);
    
    rejectOvertimeModal.render();
    
    // Add character counter functionality
    setTimeout(() => {
        const textarea = rejectOvertimeModal.container.querySelector('#reject-reason-textarea');
        const counter = rejectOvertimeModal.container.querySelector('#reject-reason-counter');
        
        if (textarea && counter) {
            textarea.addEventListener('input', () => {
                const length = textarea.value.length;
                counter.textContent = length;
            });
        }
    }, 100);
    
    // Add custom footer with reject button
    const modalFooter = rejectOvertimeModal.container.querySelector('.modal-footer');
    if (modalFooter) {
        modalFooter.innerHTML = `
            <div class="d-flex justify-content-end gap-2">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                    <i class="fas fa-times me-1"></i>İptal
                </button>
                <button type="button" class="btn btn-danger" id="confirm-reject-overtime-btn" style="min-width: 120px;">
                    <i class="fas fa-times me-1"></i>Evet, Reddet
                </button>
            </div>
        `;
    }
    
    rejectOvertimeModal.show();
}

// Confirm approve overtime
async function confirmApproveOvertime(requestId) {
    try {
        await approveOvertimeRequest(requestId);
        showNotification('Mesai talebi başarıyla onaylandı', 'success');
        
        // Close the modal
        if (approveOvertimeModal) {
            approveOvertimeModal.hide();
        }
        
        await loadRequests();
        await loadApprovedRequests();
    } catch (error) {
        showNotification('Mesai talebi onaylanırken hata oluştu: ' + error.message, 'error');
    }
}

// Confirm reject overtime
async function confirmRejectOvertime(requestId) {
    try {
        // Get the rejection reason from the textarea
        let rejectionReason = '';
        if (rejectOvertimeModal) {
            const textarea = rejectOvertimeModal.container.querySelector('#reject-reason-textarea');
            if (textarea) {
                rejectionReason = textarea.value.trim();
            }
        }
        
        // Validate that rejection reason is provided
        if (!rejectionReason || rejectionReason.length === 0) {
            showNotification('Reddetme gerekçesi zorunludur. Lütfen bir gerekçe belirtin.', 'error');
            return;
        }
        
        // Validate minimum length
        if (rejectionReason.length < 10) {
            showNotification('Reddetme gerekçesi en az 10 karakter olmalıdır.', 'error');
            return;
        }
        
        await rejectOvertimeRequest(requestId, rejectionReason);
        showNotification('Mesai talebi başarıyla reddedildi', 'success');
        
        // Close the modal
        if (rejectOvertimeModal) {
            rejectOvertimeModal.hide();
        }
        
        await loadRequests();
        await loadApprovedRequests();
    } catch (error) {
        showNotification('Mesai talebi reddedilirken hata oluştu: ' + error.message, 'error');
    }
}

// Approve overtime function
async function approveOvertime(requestId) {
    // Show approve confirmation modal instead of confirm dialog
    showApproveOvertimeModal(requestId);
}

// Reject overtime function
async function rejectOvertime(requestId) {
    // Store the request ID for the modal
    window.currentRejectRequestId = requestId;
    
    // Show the Bootstrap reject modal
    const rejectModal = document.getElementById('rejectOvertimeModal');
    if (rejectModal) {
        const modalInstance = bootstrap.Modal.getOrCreateInstance(rejectModal);
        modalInstance.show();
    }
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
        // Approve button
        if (e.target && e.target.id === 'approve-overtime-btn') {
            if (currentRequest) {
                await approveOvertime(currentRequest.id);
            }
        }
        
        // Confirm approve button
        if (e.target && e.target.id === 'confirm-approve-overtime-btn') {
            if (currentRequest) {
                await confirmApproveOvertime(currentRequest.id);
            }
        }
        
        // Confirm reject button
        if (e.target && e.target.id === 'confirm-reject-overtime-btn') {
            if (currentRequest) {
                await confirmRejectOvertime(currentRequest.id);
            }
        }
        
        // Reject button
        if (e.target && e.target.id === 'reject-overtime-btn') {
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
