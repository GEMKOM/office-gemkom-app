import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { TableComponent } from '../../../components/table/table.js';
import { 
    fetchOvertimeRequests,
    fetchOvertimeRequest,
    approveOvertimeRequest,
    rejectOvertimeRequest,
    formatOvertimeDuration,
    getPendingOvertimeApprovalRequests,
    getOvertimeApprovedByMeRequests
} from '../../../generic/overtime.js';
import { formatDate, formatDateTime } from '../../../generic/formatters.js';

// State management
let currentPage = 1;
let currentSortField = 'id';
let currentSortDirection = 'desc';
let requests = [];
let totalRequests = 0;
let isLoading = false;
let currentRequest = null;
let pendingTable = null;

// Approved requests state
let approvedCurrentPage = 1;
let approvedCurrentSortField = 'id';
let approvedCurrentSortDirection = 'desc';
let approvedRequests = [];
let totalApprovedRequests = 0;
let isApprovedLoading = false;
let approvedTable = null;

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    await initNavbar();
    
    // Initialize header component
    const header = new HeaderComponent({
        title: 'Onay Bekleyen Mesai Talepleri',
        subtitle: 'Onayınızı bekleyen mesai taleplerinin yönetimi',
        icon: 'clock',
        showBackButton: 'block',
        showCreateButton: 'none',
        showExportButton: 'none',
        showRefreshButton: 'none',
        onBackClick: () => window.location.href = '/general/overtime'
    });
    
    // Initialize pending requests table component
    pendingTable = new TableComponent('pending-requests-table-container', {
        title: 'Onay Bekleyen Mesai Talepleri',
        icon: 'fas fa-clock',
        iconColor: 'text-warning',
        columns: [
            {
                field: 'id',
                label: 'Talep No',
                sortable: true,
                formatter: (value) => `<span style="font-weight: 700; color: #0d6efd; font-family: 'Courier New', monospace; font-size: 1rem; background: rgba(13, 110, 253, 0.1); padding: 0.25rem 0.5rem; border-radius: 4px; border: 1px solid rgba(13, 110, 253, 0.2);">${value || '-'}</span>`
            },
            {
                field: 'requester_username',
                label: 'Talep Eden',
                sortable: true,
                formatter: (value) => `
                    <div style="font-weight: 500; color: #495057;">
                        <i class="fas fa-user-circle me-2 text-muted"></i>
                        ${value || 'Bilinmiyor'}
                    </div>
                `
            },
            {
                field: 'team_label',
                label: 'Departman',
                sortable: true,
                formatter: (value) => `
                    <div style="color: #495057; font-weight: 500;">${value || '-'}</div>
                `
            },
            {
                field: 'start_at',
                label: 'Başlangıç',
                sortable: true,
                type: 'date'
            },
            {
                field: 'end_at',
                label: 'Bitiş',
                sortable: true,
                type: 'date'
            },
            {
                field: 'duration_hours',
                label: 'Süre',
                sortable: true,
                formatter: (value) => `
                    <div style="color: #495057; font-weight: 500;">${formatOvertimeDuration(value)}</div>
                `
            },
            {
                field: 'total_users',
                label: 'Katılımcı',
                sortable: true,
                formatter: (value) => `
                    <div style="color: #495057; font-weight: 500;">${value || 0} kişi</div>
                `
            },
            {
                field: 'approval',
                label: 'Onay Durumu',
                sortable: false,
                formatter: (value, row) => getApprovalInfo(row)
            },
            {
                field: 'status',
                label: 'Durum',
                sortable: true,
                formatter: (value, row) => renderStatusBadge(value, row.status_label)
            }
        ],
        actions: [
            {
                key: 'view',
                label: 'Detayları Görüntüle',
                icon: 'fas fa-eye',
                class: 'btn-outline-primary',
                onClick: (row) => viewOvertimeDetails(row.id)
            },
            {
                key: 'approve',
                label: 'Onayla',
                icon: 'fas fa-check',
                class: 'btn-outline-success',
                onClick: (row) => approveOvertime(row.id),
                visible: (row) => row.status === 'submitted'
            },
            {
                key: 'reject',
                label: 'Reddet',
                icon: 'fas fa-times',
                class: 'btn-outline-danger',
                onClick: (row) => rejectOvertime(row.id),
                visible: (row) => row.status === 'submitted'
            }
        ],
        pagination: true,
        itemsPerPage: 20,
        refreshable: true,
        onRefresh: loadRequests,
        onSort: (field, direction) => {
            currentSortField = field;
            currentSortDirection = direction;
            currentPage = 1;
            loadRequests();
        },
        onPageChange: (page) => {
            currentPage = page;
            loadRequests();
        },
        emptyMessage: 'Onay bekleyen mesai talebi bulunamadı.',
        emptyIcon: 'fas fa-clock'
    });
    
    // Initialize approved requests table component
    approvedTable = new TableComponent('approved-requests-table-container', {
        title: 'Onayladığım Mesai Talepleri',
        icon: 'fas fa-check-circle',
        iconColor: 'text-success',
        columns: [
            {
                field: 'id',
                label: 'Talep No',
                sortable: true,
                formatter: (value) => `<span style="font-weight: 700; color: #0d6efd; font-family: 'Courier New', monospace; font-size: 1rem; background: rgba(13, 110, 253, 0.1); padding: 0.25rem 0.5rem; border-radius: 4px; border: 1px solid rgba(13, 110, 253, 0.2);">${value || '-'}</span>`
            },
            {
                field: 'requester_username',
                label: 'Talep Eden',
                sortable: true,
                formatter: (value) => `
                    <div style="font-weight: 500; color: #495057;">
                        <i class="fas fa-user-circle me-2 text-muted"></i>
                        ${value || 'Bilinmiyor'}
                    </div>
                `
            },
            {
                field: 'team_label',
                label: 'Departman',
                sortable: true,
                formatter: (value) => `
                    <div style="color: #495057; font-weight: 500;">${value || '-'}</div>
                `
            },
            {
                field: 'start_at',
                label: 'Başlangıç',
                sortable: true,
                type: 'date'
            },
            {
                field: 'end_at',
                label: 'Bitiş',
                sortable: true,
                type: 'date'
            },
            {
                field: 'duration_hours',
                label: 'Süre',
                sortable: true,
                formatter: (value) => `
                    <div style="color: #495057; font-weight: 500;">${formatOvertimeDuration(value)}</div>
                `
            },
            {
                field: 'total_users',
                label: 'Katılımcı',
                sortable: true,
                formatter: (value) => `
                    <div style="color: #495057; font-weight: 500;">${value || 0} kişi</div>
                `
            },
            {
                field: 'approval',
                label: 'Onay Durumu',
                sortable: false,
                formatter: (value, row) => getApprovalInfo(row)
            },
            {
                field: 'status',
                label: 'Durum',
                sortable: true,
                formatter: (value, row) => renderStatusBadge(value, row.status_label)
            },
            {
                field: 'created_at',
                label: 'Oluşturulma',
                sortable: true,
                type: 'date'
            }
        ],
        actions: [
            {
                key: 'view',
                label: 'Detayları Görüntüle',
                icon: 'fas fa-eye',
                class: 'btn-outline-primary',
                onClick: (row) => viewOvertimeDetails(row.id)
            }
        ],
        pagination: true,
        itemsPerPage: 20,
        refreshable: true,
        onRefresh: loadApprovedRequests,
        onSort: (field, direction) => {
            approvedCurrentSortField = field;
            approvedCurrentSortDirection = direction;
            approvedCurrentPage = 1;
            loadApprovedRequests();
        },
        onPageChange: (page) => {
            approvedCurrentPage = page;
            loadApprovedRequests();
        },
        emptyMessage: 'Onayladığınız mesai talebi bulunamadı.',
        emptyIcon: 'fas fa-check-circle'
    });
    
    await initializeRequests();
    setupEventListeners();
});

async function initializeRequests() {
    try {
        await loadRequests();
        await loadApprovedRequests();
        
        // Check if there's a request parameter in the URL to open modal
        const urlParams = new URLSearchParams(window.location.search);
        const requestId = urlParams.get('request');
        if (requestId) {
            await openModalFromRequestId(requestId);
        }
    } catch (error) {
        console.error('Error initializing requests:', error);
        showNotification('Talepler yüklenirken hata oluştu', 'error');
    }
}


async function loadRequests() {
    if (isLoading) return;
    
    try {
        isLoading = true;
        pendingTable.setLoading(true);
        
        // Use the pending approvals API endpoint
        const response = await getPendingOvertimeApprovalRequests();
        
        requests = response.results || response || [];
        totalRequests = response.count || response.results.length;
        // Handle response - this endpoint returns an array directly

        
        console.log('Processed requests:', requests);
        
        // Update the table component
        pendingTable.updateData(requests, totalRequests, currentPage);
        
    } catch (error) {
        console.error('Error loading requests:', error);
        showNotification('Onay bekleyen mesai talepleri yüklenirken hata oluştu: ' + error.message, 'error');
        requests = [];
        totalRequests = 0;
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
        
        // Use the approved by me API endpoint
        const response = await getOvertimeApprovedByMeRequests();
        
        console.log('Approved Overtime API Response:', response);
        
        // Handle response - this endpoint returns paginated data
        if (response && response.results) {
            approvedRequests = response.results;
            totalApprovedRequests = response.count || response.results.length;
        } else if (Array.isArray(response)) {
            approvedRequests = response;
            totalApprovedRequests = response.length;
        } else {
            approvedRequests = [];
            totalApprovedRequests = 0;
        }
        
        console.log('Processed approved requests:', approvedRequests);
        
        // Update the table component
        approvedTable.updateData(approvedRequests, totalApprovedRequests, approvedCurrentPage);
        
    } catch (error) {
        console.error('Error loading approved requests:', error);
        showNotification('Onayladığınız mesai talepleri yüklenirken hata oluştu: ' + error.message, 'error');
        approvedRequests = [];
        totalApprovedRequests = 0;
        approvedTable.updateData([], 0, 1);
    } finally {
        isApprovedLoading = false;
        approvedTable.setLoading(false);
    }
}

function setupEventListeners() {
    
    // Modal approve and reject buttons
    const approveBtn = document.getElementById('approve-overtime');
    if (approveBtn) {
        approveBtn.addEventListener('click', () => {
            if (currentRequest) {
                approveOvertime(currentRequest.id);
            }
        });
    }
    
    const rejectBtn = document.getElementById('reject-overtime');
    if (rejectBtn) {
        rejectBtn.addEventListener('click', () => {
            if (currentRequest) {
                rejectOvertime(currentRequest.id);
            }
        });
    }
    
    // Add event listeners for modal close to clean up URL
    const modal = document.getElementById('overtimeDetailsModal');
    if (modal) {
        modal.addEventListener('hidden.bs.modal', () => {
            // Remove the request parameter from URL when modal is closed
            const url = new URL(window.location);
            url.searchParams.delete('request');
            window.history.pushState({}, '', url);
        });
    }
    
    // Rejection modal event listeners
    const rejectModal = document.getElementById('rejectOvertimeModal');
    if (rejectModal) {
        // Character counter for comment textarea
        const commentTextarea = document.getElementById('rejectComment');
        const commentCounter = document.getElementById('commentCounter');
        
        if (commentTextarea && commentCounter) {
            commentTextarea.addEventListener('input', () => {
                const length = commentTextarea.value.length;
                commentCounter.textContent = length;
                
                // Change color based on length
                if (length > 450) {
                    commentCounter.style.color = '#dc3545';
                } else if (length > 400) {
                    commentCounter.style.color = '#fd7e14';
                } else {
                    commentCounter.style.color = '#6c757d';
                }
            });
        }
        
        // Confirm reject button
        const confirmRejectBtn = document.getElementById('confirmRejectOvertime');
        if (confirmRejectBtn) {
            confirmRejectBtn.addEventListener('click', async () => {
                const comment = commentTextarea ? commentTextarea.value.trim() : '';
                const requestId = window.currentRejectRequestId;
                
                if (!requestId) {
                    showNotification('Hata: Talep ID bulunamadı', 'error');
                    return;
                }
                
                try {
                    // Disable button during request
                    confirmRejectBtn.disabled = true;
                    confirmRejectBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Reddediliyor...';
                    
                    await rejectOvertimeRequest(requestId, comment);
                    showNotification('Mesai talebi başarıyla reddedildi', 'success');
                    
                    // Close both modals
                    const rejectModalInstance = bootstrap.Modal.getOrCreateInstance(rejectModal);
                    rejectModalInstance.hide();
                    
                    const detailsModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('overtimeDetailsModal'));
                    detailsModal.hide();
                    
                    // Clear the form
                    if (commentTextarea) {
                        commentTextarea.value = '';
                        commentCounter.textContent = '0';
                        commentCounter.style.color = '#6c757d';
                    }
                    
                    // Reload data
                    await loadRequests();
                    await loadApprovedRequests();
                    
                } catch (error) {
                    console.error('Error rejecting overtime request:', error);
                    showNotification('Mesai talebi reddedilirken hata oluştu: ' + error.message, 'error');
                } finally {
                    // Re-enable button
                    confirmRejectBtn.disabled = false;
                    confirmRejectBtn.innerHTML = '<i class="fas fa-times-circle me-1"></i>Reddet';
                }
            });
        }
        
        // Clear form when modal is hidden
        rejectModal.addEventListener('hidden.bs.modal', () => {
            const commentTextarea = document.getElementById('rejectComment');
            const commentCounter = document.getElementById('commentCounter');
            
            if (commentTextarea) {
                commentTextarea.value = '';
            }
            if (commentCounter) {
                commentCounter.textContent = '0';
                commentCounter.style.color = '#6c757d';
            }
            
            // Clear stored request ID
            window.currentRejectRequestId = null;
        });
    }
}

async function viewOvertimeDetails(requestId) {
    try {
        currentRequest = await fetchOvertimeRequest(requestId);
        await showOvertimeDetailsModal();
        
        // Update URL to include the request ID
        const url = new URL(window.location);
        url.searchParams.set('request', requestId);
        window.history.pushState({}, '', url);
    } catch (error) {
        console.error('Error loading overtime details:', error);
        showNotification('Mesai talebi detayları yüklenirken hata oluştu: ' + error.message, 'error');
    }
}

async function showOvertimeDetailsModal() {
    const container = document.getElementById('overtime-details-container');
    
    // Hide approve/reject buttons if request is not in submitted status
    const approveBtn = document.getElementById('approve-overtime');
    const rejectBtn = document.getElementById('reject-overtime');
    
    if (approveBtn && rejectBtn) {
        const shouldShowButtons = currentRequest.status === 'submitted';
        approveBtn.style.display = shouldShowButtons ? 'inline-block' : 'none';
        rejectBtn.style.display = shouldShowButtons ? 'inline-block' : 'none';
    }
    
    // Get rejection comments
    const rejectionComments = getRejectionComments(currentRequest);
    
    container.innerHTML = `
        <div class="row">
            <div class="col-md-6">
                <h6 class="text-primary">Genel Bilgiler</h6>
                <table class="table table-sm">
                    <tr><td><strong class="text-dark">Talep No:</strong></td><td>#${currentRequest.id}</td></tr>
                    <tr><td><strong class="text-dark">Talep Eden:</strong></td><td>${currentRequest.requester_username}</td></tr>
                    <tr><td><strong class="text-dark">Departman:</strong></td><td>${currentRequest.team_label || currentRequest.team || '-'}</td></tr>
                    <tr><td><strong class="text-dark">Durum:</strong></td><td>${getStatusBadge(currentRequest.status, currentRequest.status_label)}</td></tr>
                    <tr><td><strong class="text-dark">Oluşturulma:</strong></td><td>${formatDateTime(currentRequest.created_at)}</td></tr>
                    <tr><td><strong class="text-dark">Son Güncelleme:</strong></td><td>${formatDateTime(currentRequest.updated_at)}</td></tr>
                </table>
            </div>
            <div class="col-md-6">
                <h6 class="text-primary">Mesai Bilgileri</h6>
                <table class="table table-sm">
                    <tr><td><strong class="text-dark">Başlangıç:</strong></td><td>${formatDateTime(currentRequest.start_at)}</td></tr>
                    <tr><td><strong class="text-dark">Bitiş:</strong></td><td>${formatDateTime(currentRequest.end_at)}</td></tr>
                    <tr><td><strong class="text-dark">Süre:</strong></td><td><strong>${formatOvertimeDuration(parseFloat(currentRequest.duration_hours))}</strong></td></tr>
                    <tr><td><strong class="text-dark">Katılımcı Sayısı:</strong></td><td>${currentRequest.entries?.length || 0} kişi</td></tr>
                    <tr><td><strong class="text-dark">Neden:</strong></td><td>${currentRequest.reason || 'Belirtilmemiş'}</td></tr>
                </table>
            </div>
        </div>
        ${rejectionComments.length > 0 ? `
        <div class="row mt-4">
            <div class="col-12">
                <h6 class="text-danger">
                    <i class="fas fa-times-circle me-2"></i>
                    Reddetme Gerekçeleri
                </h6>
                <div class="alert alert-danger">
                    ${rejectionComments.map(comment => `
                        <div class="mb-3 p-3 border border-danger rounded" style="background-color: rgba(220, 53, 69, 0.1);">
                            <div class="d-flex justify-content-between align-items-start mb-2">
                                <div>
                                    <strong class="text-danger">
                                        <i class="fas fa-user-times me-1"></i>
                                        ${comment.approver}
                                    </strong>
                                    <span class="badge bg-danger ms-2">${comment.stage}</span>
                                </div>
                                <small class="text-muted">
                                    <i class="fas fa-clock me-1"></i>
                                    ${comment.date ? formatDateTime(comment.date) : '-'}
                                </small>
                            </div>
                            <div class="text-dark" style="line-height: 1.4;">
                                <i class="fas fa-comment-alt me-1 text-muted"></i>
                                ${comment.comment}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
        ` : ''}
        <div class="row mt-4">
            <div class="col-12">
                <div id="participants-table-container" style="display: none;">
                    <!-- Participants table will be rendered here -->
                </div>
            </div>
        </div>
    `;
    
    // Render participants table if there are entries
    if (currentRequest.entries && currentRequest.entries.length > 0) {
        renderParticipantsTable(currentRequest.entries);
    }

    const modal = new bootstrap.Modal(document.getElementById('overtimeDetailsModal'));
    modal.show();
}

function renderParticipantsTable(entries) {
    const container = document.getElementById('participants-table-container');
    if (!container) return;
    
    container.style.display = 'block';
    
    const tableHtml = `
        <h6 class="text-primary mb-3">Katılımcılar</h6>
        <div class="table-responsive">
            <table class="table table-sm table-striped">
                <thead>
                    <tr>
                        <th>Çalışan</th>
                        <th>İş Emri No</th>
                        <th>Açıklama</th>
                        <th>Onaylanan Saat</th>
                    </tr>
                </thead>
                <tbody>
                    ${entries.map(entry => `
                        <tr>
                            <td>${(entry.user_first_name && entry.user_last_name) ? 
                                `${entry.user_first_name} ${entry.user_last_name}` : 
                                entry.user_username}</td>
                            <td><code>${entry.job_no || '-'}</code></td>
                            <td>${entry.description || '-'}</td>
                            <td>${entry.approved_hours ? formatOvertimeDuration(parseFloat(entry.approved_hours)) : '-'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
    
    container.innerHTML = tableHtml;
}

async function openModalFromRequestId(requestId) {
    try {
        // Find the request with the matching ID in current requests
        const request = requests.find(r => r.id === parseInt(requestId));
        if (request) {
            await viewOvertimeDetails(request.id);
        } else {
            // If not found in current requests, try to fetch it directly
            try {
                await viewOvertimeDetails(parseInt(requestId));
            } catch (error) {
                console.error('Request not found:', error);
                showNotification(`Mesai talebi ${requestId} bulunamadı`, 'error');
            }
        }
    } catch (error) {
        console.error('Error opening modal from request ID:', error);
        showNotification('Mesai talebi detayları açılırken hata oluştu', 'error');
    }
}

// Action functions
async function approveOvertime(requestId) {
    if (!confirm('Bu mesai talebini onaylamak istediğinizden emin misiniz?')) {
        return;
    }

    try {
        await approveOvertimeRequest(requestId);
        showNotification('Mesai talebi başarıyla onaylandı', 'success');
        
        // Close the modal
        const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('overtimeDetailsModal'));
        if (modal) {
            modal.hide();
        }
        
        await loadRequests();
        await loadApprovedRequests();
    } catch (error) {
        console.error('Error approving overtime request:', error);
        showNotification('Mesai talebi onaylanırken hata oluştu: ' + error.message, 'error');
    }
}

async function rejectOvertime(requestId) {
    // Store the request ID for the modal
    window.currentRejectRequestId = requestId;
    
    // Show the rejection modal
    const rejectModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('rejectOvertimeModal'));
    rejectModal.show();
}

// Utility functions
function getStatusBadge(status, statusLabel) {
    const displayText = statusLabel || status;
    
    const statusMap = {
        'submitted': 'status-submitted',
        'approved': 'status-completed',
        'rejected': 'status-cancelled',
        'cancelled': 'status-cancelled'
    };

    const statusClass = statusMap[status] || 'status-submitted';
    return `<span class="status-badge ${statusClass}">${displayText}</span>`;
}


function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `alert alert-${type === 'error' ? 'danger' : type} alert-dismissible fade show position-fixed`;
    notification.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
    notification.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 5000);
}

function renderStatusBadge(status, statusLabel) {
    return `
        <span class="status-badge status-${status}">
            ${statusLabel}
        </span>
    `;
}

function getApprovalInfo(request) {
    if (!request.approval || request.status !== 'submitted') {
        return '<span style="color: #6c757d;">-</span>';
    }

    const { stage_instances } = request.approval;
    
    // Find the current stage (first incomplete stage)
    const currentStage = stage_instances.find(stage => !stage.is_complete && !stage.is_rejected);
    
    if (!currentStage) {
        return '<span style="color: #198754;"><i class="fas fa-check-circle me-1"></i>Tamamlandı</span>';
    }

    const { name, required_approvals, approved_count, approvers } = currentStage;
    const remainingApprovals = required_approvals - approved_count;
    
    if (remainingApprovals <= 0) {
        return `<span style="color: #198754;"><i class="fas fa-check-circle me-1"></i>${name}</span>`;
    }

    // Get the names of remaining approvers
    const remainingApprovers = approvers.slice(approved_count);
    const approverNames = remainingApprovers.map(approver => approver.full_name || approver.username).join(', ');
    
    return `
        <div style="line-height: 1.3; text-align: middle;">
            <div style="font-size: 0.85rem; margin-bottom: 0.25rem; color: #0d6efd; font-weight: 600; text-align: middle;">${name}</div>
            <div style="font-size: 0.75rem; margin-bottom: 0.25rem; color: #6c757d; text-align: middle;">
                <i class="fas fa-users me-1"></i>
                ${remainingApprovals} onay bekleniyor
            </div>
            ${approverNames ? `
                <div style="font-size: 0.7rem; line-height: 1.2; word-wrap: break-word; color: #6c757d; text-align: middle;">
                    <i class="fas fa-user-clock me-1"></i>
                    ${approverNames}
                </div>
            ` : ''}
        </div>
    `;
}

function getRejectionComments(request) {
    if (!request.approval || !request.approval.stage_instances) {
        return [];
    }

    const rejectionComments = [];
    
    request.approval.stage_instances.forEach(stage => {
        if (stage.decisions) {
            stage.decisions.forEach(decision => {
                if (decision.decision === "reject" && decision.comment) {
                    rejectionComments.push({
                        stage: stage.name,
                        approver: decision.approver_detail?.full_name || decision.approver_detail?.username || 'Bilinmeyen',
                        comment: decision.comment,
                        date: decision.decided_at
                    });
                }
            });
        }
    });
    
    return rejectionComments;
}

// Make functions globally available for onclick handlers
window.viewOvertimeDetails = viewOvertimeDetails;
window.approveOvertime = approveOvertime;
window.rejectOvertime = rejectOvertime;
