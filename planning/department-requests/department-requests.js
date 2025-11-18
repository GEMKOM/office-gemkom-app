import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { TableComponent } from '../../../components/table/table.js';
import {
    getDepartmentRequest,
    getApprovedDepartmentRequests,
    getCompletedDepartmentRequests,
    markDepartmentRequestTransferred
} from '../../../apis/planning/departmentRequests.js';
import { formatDate, formatDateTime } from '../../../apis/formatters.js';
import {
    initializeModalComponents,
    showDepartmentRequestDetailsModal,
    transferDepartmentRequest,
    setupModalEventListeners,
    setGlobalVariables
} from './modals.js';

// State management
let currentPage = 1;
let currentSortField = 'id';
let currentSortDirection = 'desc';
let requests = [];
let totalRequests = 0;
let isLoading = false;
let currentRequest = null;
let approvedTable = null;

// Completed/Transferred requests state
let completedCurrentPage = 1;
let completedCurrentSortField = 'id';
let completedCurrentSortDirection = 'desc';
let completedRequests = [];
let totalCompletedRequests = 0;
let isCompletedLoading = false;
let completedTable = null;

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    await initNavbar();

    // Initialize header component
    const header = new HeaderComponent({
        title: 'Onaylanan Departman Talepleri',
        subtitle: 'Onaylanan departman taleplerinin listesi ve transfer işlemleri',
        icon: 'boxes',
        showBackButton: 'block',
        showCreateButton: 'none',
        showExportButton: 'none',
        showRefreshButton: 'none',
        onBackClick: () => window.location.href = '/planning'
    });

    // Initialize approved requests table component
    approvedTable = new TableComponent('approved-requests-table-container', {
        title: 'Onaylanan Departman Talepleri',
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
                label: 'Talep Tarihi',
                sortable: true,
                type: 'date'
            },
            {
                field: 'items',
                label: 'Ürün Sayısı',
                sortable: false,
                formatter: (value, row) => {
                    const itemsCount = row.items_count || (Array.isArray(value) ? value.length : 0);
                    return `
                        <div style="color: #495057; font-weight: 500;">${itemsCount} ürün</div>
                    `;
                }
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
            },
            {
                key: 'transfer',
                label: 'Transfer Et',
                icon: 'fas fa-exchange-alt',
                class: 'btn-outline-info',
                onClick: (row) => transferDepartmentRequest(row.id),
                visible: (row) => row.status === 'approved'
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
        emptyMessage: 'Onaylanan departman talebi bulunamadı.',
        emptyIcon: 'fas fa-check-circle'
    });

    // Initialize completed/transferred requests table component
    completedTable = new TableComponent('completed-requests-table-container', {
        title: 'Transfer Edilen Departman Talepleri',
        icon: 'fas fa-exchange-alt',
        iconColor: 'text-info',
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
                label: 'Talep Tarihi',
                sortable: true,
                type: 'date'
            },
            {
                field: 'items',
                label: 'Ürün Sayısı',
                sortable: false,
                formatter: (value, row) => {
                    const itemsCount = row.items_count || (Array.isArray(value) ? value.length : 0);
                    return `
                        <div style="color: #495057; font-weight: 500;">${itemsCount} ürün</div>
                    `;
                }
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
        onRefresh: loadCompletedRequests,
        onSort: (field, direction) => {
            completedCurrentSortField = field;
            completedCurrentSortDirection = direction;
            completedCurrentPage = 1;
            loadCompletedRequests();
        },
        onPageChange: (page) => {
            completedCurrentPage = page;
            loadCompletedRequests();
        },
        emptyMessage: 'Transfer edilen departman talebi bulunamadı.',
        emptyIcon: 'fas fa-exchange-alt'
    });

    await initializeRequests();

    // Set global variables for modals
    setGlobalVariables({
        currentRequest,
        requests,
        loadRequests,
        loadCompletedRequests,
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
        // Load approved requests first (needed for modals)
        await loadRequests();
        // Load completed requests in the background without blocking
        loadCompletedRequests().catch(error => {
            console.error('Error loading completed requests:', error);
        });
    } catch (error) {
        console.error('Error loading requests:', error);
    }
}

async function loadRequests() {
    if (isLoading) return;

    try {
        isLoading = true;
        approvedTable.setLoading(true);

        // Use the approved requests API endpoint
        const response = await getApprovedDepartmentRequests();

        // Handle response - this endpoint returns paginated data
        if (response && response.results) {
            requests = response.results;
            totalRequests = response.count || response.results.length;
        } else if (Array.isArray(response)) {
            requests = response;
            totalRequests = response.length;
        } else {
            requests = [];
            totalRequests = 0;
        }

        // Update the table component
        approvedTable.updateData(requests, totalRequests, currentPage);

    } catch (error) {
        console.error('Error loading approved requests:', error);
        requests = [];
        totalRequests = 0;
        approvedTable.updateData([], 0, 1);
    } finally {
        isLoading = false;
        approvedTable.setLoading(false);
    }
}

async function loadCompletedRequests() {
    if (isCompletedLoading) return;

    try {
        isCompletedLoading = true;
        completedTable.setLoading(true);

        // Use the completed requests API endpoint
        const response = await getCompletedDepartmentRequests();

        // Handle response - this endpoint returns paginated data
        if (response && response.results) {
            completedRequests = response.results;
            totalCompletedRequests = response.count || response.results.length;
        } else if (Array.isArray(response)) {
            completedRequests = response;
            totalCompletedRequests = response.length;
        } else {
            completedRequests = [];
            totalCompletedRequests = 0;
        }

        // Update the table component
        completedTable.updateData(completedRequests, totalCompletedRequests, completedCurrentPage);

    } catch (error) {
        console.error('Error loading completed requests:', error);
        completedRequests = [];
        totalCompletedRequests = 0;
        completedTable.updateData([], 0, 1);
    } finally {
        isCompletedLoading = false;
        completedTable.setLoading(false);
    }
}

function setupEventListeners() {
    // Event listeners can be added here if needed
}

async function viewDepartmentRequestDetails(requestId) {
    try {
        currentRequest = await getDepartmentRequest(requestId);

        // Update global variables for modals
        setGlobalVariables({
            currentRequest,
            requests,
            loadRequests,
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
        case 'critical':
        case 'urgent':
            badgeClass = 'status-red';
            label = priority === 'critical' ? 'Kritik' : 'Acil';
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
window.transferDepartmentRequest = transferDepartmentRequest;

