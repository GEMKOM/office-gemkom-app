import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { TableComponent } from '../../../components/table/table.js';
import {
    getDepartmentRequest,
    getPendingApprovalDepartmentRequests,
    getApprovedDepartmentRequests,
    rejectDepartmentRequest
} from '../../../apis/departmentRequests.js';
import { formatDate, formatDateTime } from '../../../apis/formatters.js';
import {
    initializeModalComponents,
    showDepartmentRequestDetailsModal,
    approveDepartmentRequest,
    rejectDepartmentRequestModal,
    setupModalEventListeners,
    setGlobalVariables
} from './modals.js';

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
        title: 'Onay Bekleyen Departman Talepleri',
        subtitle: 'Onayınızı bekleyen departman taleplerinin yönetimi',
        icon: 'boxes',
        showBackButton: 'block',
        showCreateButton: 'none',
        showExportButton: 'none',
        showRefreshButton: 'none',
        onBackClick: () => window.location.href = '/general/department-requests'
    });

    // Initialize pending requests table component
    pendingTable = new TableComponent('pending-requests-table-container', {
        title: 'Onay Bekleyen Departman Talepleri',
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
                field: 'requestor_username',
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
                field: 'department',
                label: 'Departman',
                sortable: true,
                formatter: (value, row) => {
                    const departmentLabel = row.department_label || formatDepartmentName(value) || '-';
                    return `
                        <div style="color: #495057; font-weight: 500;">${departmentLabel}</div>
                    `;
                }
            },
            {
                field: 'priority',
                label: 'Öncelik',
                sortable: true,
                formatter: (value) => renderPriorityBadge(value)
            },
            {
                field: 'needed_date',
                label: 'İhtiyaç Tarihi',
                sortable: true,
                type: 'date'
            },
            {
                field: 'items_count',
                label: 'Ürün Sayısı',
                sortable: true,
                formatter: (value) => `
                    <div style="color: #495057; font-weight: 500;">${value || 0} ürün</div>
                `
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
                onClick: (row) => viewDepartmentRequestDetails(row.id)
            },
            {
                key: 'approve',
                label: 'Onayla',
                icon: 'fas fa-check',
                class: 'btn-outline-success',
                onClick: (row) => approveDepartmentRequest(row.id),
                visible: (row) => row.status === 'submitted'
            },
            {
                key: 'reject',
                label: 'Reddet',
                icon: 'fas fa-times',
                class: 'btn-outline-danger',
                onClick: (row) => rejectDepartmentRequestModal(row.id),
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
        emptyMessage: 'Onay bekleyen departman talebi bulunamadı.',
        emptyIcon: 'fas fa-clock'
    });

    // Initialize approved requests table component
    approvedTable = new TableComponent('approved-requests-table-container', {
        title: 'Onayladığım Departman Talepleri',
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
                field: 'requestor_username',
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
                field: 'department',
                label: 'Departman',
                sortable: true,
                formatter: (value, row) => {
                    const departmentLabel = row.department_label || formatDepartmentName(value) || '-';
                    return `
                        <div style="color: #495057; font-weight: 500;">${departmentLabel}</div>
                    `;
                }
            },
            {
                field: 'priority',
                label: 'Öncelik',
                sortable: true,
                formatter: (value) => renderPriorityBadge(value)
            },
            {
                field: 'needed_date',
                label: 'İhtiyaç Tarihi',
                sortable: true,
                type: 'date'
            },
            {
                field: 'items_count',
                label: 'Ürün Sayısı',
                sortable: true,
                formatter: (value) => `
                    <div style="color: #495057; font-weight: 500;">${value || 0} ürün</div>
                `
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
                onClick: (row) => viewDepartmentRequestDetails(row.id)
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
        emptyMessage: 'Onayladığınız departman talebi bulunamadı.',
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
        const response = await getPendingApprovalDepartmentRequests();

        requests = response.results || response || [];
        totalRequests = response.count || (Array.isArray(response) ? response.length : 0);

        // Add items_count to each request based on items array
        requests = requests.map(request => ({
            ...request,
            items_count: request.items ? request.items.length : 0
        }));

        // Update the table component
        pendingTable.updateData(requests, totalRequests, currentPage);

    } catch (error) {
        console.error('Error loading pending requests:', error);
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

        // Use the approved requests API endpoint
        const response = await getApprovedDepartmentRequests();

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

        // Add items_count to each request based on items array
        approvedRequests = approvedRequests.map(request => ({
            ...request,
            items_count: request.items ? request.items.length : 0
        }));

        // Update the table component
        approvedTable.updateData(approvedRequests, totalApprovedRequests, approvedCurrentPage);

    } catch (error) {
        console.error('Error loading approved requests:', error);
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
    const rejectModal = document.getElementById('rejectDepartmentRequestModal');
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
        const confirmRejectBtn = document.getElementById('confirmRejectDepartmentRequest');
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

                    await rejectDepartmentRequest(requestId, comment);
                    showNotification('Departman talebi başarıyla reddedildi', 'success');

                    // Close both modals
                    const rejectModalInstance = bootstrap.Modal.getOrCreateInstance(rejectModal);
                    rejectModalInstance.hide();

                    // Close details modal if it's open
                    const detailsModalContainer = document.getElementById('department-request-details-modal-container');
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
                    showNotification('Departman talebi reddedilirken hata oluştu: ' + error.message, 'error');
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

async function viewDepartmentRequestDetails(requestId) {
    try {
        currentRequest = await getDepartmentRequest(requestId);

        // Update global variables for modals
        setGlobalVariables({
            currentRequest,
            requests,
            loadRequests,
            loadApprovedRequests,
            showNotification
        });

        await showDepartmentRequestDetailsModal(currentRequest);

        // Update URL to include the request ID
        const url = new URL(window.location);
        url.searchParams.set('request', requestId);
        window.history.pushState({}, '', url);
    } catch (error) {
        console.error('Error viewing request details:', error);
        showNotification('Talep detayları yüklenirken hata oluştu: ' + error.message, 'error');
    }
}

async function openModalFromRequestId(requestId) {
    try {
        // Find the request with the matching ID in current requests
        const request = requests.find(r => r.id === parseInt(requestId));
        if (request) {
            await viewDepartmentRequestDetails(request.id);
        } else {
            // If not found in current requests, try to fetch it directly
            try {
                await viewDepartmentRequestDetails(parseInt(requestId));
            } catch (error) {
                console.error('Error opening modal from request ID:', error);
            }
        }
    } catch (error) {
        console.error('Error opening modal from request ID:', error);
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
        case 'rejected':
        case 'cancelled':
            badgeClass = 'status-red';
            break;
        case 'transferred':
            badgeClass = 'status-blue';
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

function renderPriorityBadge(priority) {
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

    return `
        <span class="status-badge ${badgeClass}">
            ${label}
        </span>
    `;
}

function formatDepartmentName(department) {
    if (!department) return '-';
    
    const departmentMap = {
        'maintenance': 'Bakım',
        'manufacturing': 'İmalat',
        'procurement': 'Satın Alma',
        'finance': 'Finans',
        'it': 'Bilgi İşlem',
        'human_resources': 'İnsan Kaynakları',
        'management': 'Yönetim',
        'planning': 'Planlama'
    };
    
    return departmentMap[department] || department.charAt(0).toUpperCase() + department.slice(1);
}

function getApprovalInfo(request) {
    if (!request.approvals || request.approvals.length === 0 || request.status !== 'submitted') {
        return '<span style="color: #6c757d;">-</span>';
    }

    // Get the first (latest) approval workflow
    const approval = request.approvals[0];
    const { stage_instances } = approval;

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
function showNotification(message, type = 'info', timeout = 5000) {
    // Remove existing notifications
    const existingNotifications = document.querySelectorAll('.custom-notification');
    existingNotifications.forEach(notification => notification.remove());

    // Create notification element
    const notification = document.createElement('div');
    notification.className = `custom-notification alert alert-${type === 'error' ? 'danger' : type} alert-dismissible fade show position-fixed`;
    notification.style.cssText = `
        top: 20px;
        right: 20px;
        z-index: 9999;
        min-width: 350px;
        backdrop-filter: blur(15px);
        border: 1px solid rgba(255, 255, 255, 0.3);
        border-radius: 15px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        animation: slideInRight 0.5s ease-out;
    `;

    const iconClass = type === 'error' ? 'exclamation-triangle' :
                     type === 'success' ? 'check-circle' :
                     type === 'warning' ? 'exclamation-circle' : 'info-circle';

    notification.innerHTML = `
        <div class="d-flex align-items-center">
            <i class="fas fa-${iconClass} me-3" style="font-size: 1.2rem;"></i>
            <div class="flex-grow-1">
                <strong>${type === 'error' ? 'Hata' : type === 'success' ? 'Başarılı' : type === 'warning' ? 'Uyarı' : 'Bilgi'}</strong>
                <br>
                <span>${message}</span>
            </div>
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;

    // Add to page
    document.body.appendChild(notification);

    // Auto remove after timeout
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.animation = 'slideOutRight 0.3s ease-out';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 300);
        }
    }, timeout);
}

// Make functions globally available for onclick handlers
window.viewDepartmentRequestDetails = viewDepartmentRequestDetails;
window.approveDepartmentRequest = approveDepartmentRequest;
window.rejectDepartmentRequestModal = rejectDepartmentRequestModal;
