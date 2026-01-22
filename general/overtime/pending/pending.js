import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { TableComponent } from '../../../components/table/table.js';
import { 
    fetchOvertimeRequest,
    formatOvertimeDuration,
    getPendingOvertimeApprovalRequests,
    getOvertimeApprovedByMeRequests,
    rejectOvertimeRequest
} from '../../../apis/overtime.js';
import { formatDate, formatDateTime } from '../../../apis/formatters.js';
import {
    initializeModalComponents,
    showOvertimeDetailsModal,
    approveOvertime,
    rejectOvertime,
    setupModalEventListeners,
    setGlobalVariables
} from './modals.js';
import { showNotification } from '../../../components/notification/notification.js';

// State management
let currentPage = 1;
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
                formatter: (value, row) => {
                    const count = value || (row.entries ? row.entries.length : 0);
                    return `
                        <div style="color: #495057; font-weight: 500;">${count} kişi</div>
                    `;
                }
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
                formatter: (value, row) => {
                    const count = value || (row.entries ? row.entries.length : 0);
                    return `
                        <div style="color: #495057; font-weight: 500;">${count} kişi</div>
                    `;
                }
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
    
    // Set global variables for modals
    setGlobalVariables({
        currentRequest,
        requests,
        loadRequests,
        loadApprovedRequests,
        showNotification
    });
    
    initializeModalComponents();
    setupEventListeners();
    setupModalEventListeners();
    
    // Check if there's a request parameter in the URL to open modal (after modal is initialized)
    const urlParams = new URLSearchParams(window.location.search);
    const requestId = urlParams.get('request');
    if (requestId) {
        await openModalFromRequestId(requestId);
    }
});

async function initializeRequests() {
    try {
        // Load pending requests first (needed for modals)
        await loadRequests();
        // Load approved requests in the background without blocking
        loadApprovedRequests().catch(error => {
            console.error('Error loading approved requests:', error);
        });
    } catch (error) {
        console.error('Error loading requests:', error);
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

        
        
        // Update the table component
        pendingTable.updateData(requests, totalRequests, currentPage);
        
    } catch (error) {
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
        
        
        // Update the table component
        approvedTable.updateData(approvedRequests, totalApprovedRequests, approvedCurrentPage);
        
    } catch (error) {
        approvedRequests = [];
        totalApprovedRequests = 0;
        approvedTable.updateData([], 0, 1);
    } finally {
        isApprovedLoading = false;
        approvedTable.setLoading(false);
    }
}


function setupEventListeners() {
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
                    
                    // Close details modal if it's open
                    const detailsModalContainer = document.getElementById('overtime-details-modal-container');
                    if (detailsModalContainer) {
                        const detailsModalElement = detailsModalContainer.querySelector('.modal');
                        if (detailsModalElement) {
                            const detailsModalInstance = bootstrap.Modal.getInstance(detailsModalElement);
                            if (detailsModalInstance) {
                                detailsModalInstance.hide();
                            }
                        }
                    }
                    
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
                    console.error('Error rejecting request:', error);
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
        
        // Update global variables for modals
        setGlobalVariables({
            currentRequest,
            requests,
            loadRequests,
            loadApprovedRequests,
            showNotification
        });
        
        await showOvertimeDetailsModal(currentRequest);
        
        // Update URL to include the request ID
        const url = new URL(window.location);
        url.searchParams.set('request', requestId);
        window.history.pushState({}, '', url);
    } catch (error) {
    }
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
            }
        }
    } catch (error) {
    }
}

function renderStatusBadge(status, statusLabel) {
    // Map status values to badge colors
    let badgeClass = 'status-grey'; // default
    
    switch (status) {
        case 'approved':
            badgeClass = 'status-green';
            break;
        case 'submitted':
            badgeClass = 'status-yellow';
            break;
        case 'cancelled':
            badgeClass = 'status-red';
            break;
        default:
            badgeClass = 'status-grey';
    }
    
    return `
        <span class="status-badge ${badgeClass}">
            ${statusLabel || status || 'Bilinmiyor'}
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

// Show notification function

// Make functions globally available for onclick handlers
window.viewOvertimeDetails = viewOvertimeDetails;
window.approveOvertime = approveOvertime;
window.rejectOvertime = rejectOvertime;
