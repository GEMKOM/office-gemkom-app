import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { TableComponent } from '../../../components/table/table.js';
import { EditModal } from '../../../components/edit-modal/edit-modal.js';
import { DisplayModal } from '../../../components/display-modal/display-modal.js';
import { ConfirmationModal } from '../../../components/confirmation-modal/confirmation-modal.js';
import { FileAttachments } from '../../../components/file-attachments/file-attachments.js';
import { FileViewer } from '../../../components/file-viewer/file-viewer.js';
import {
    getDepartmentRequest,
    getApprovedDepartmentRequests,
    getCompletedDepartmentRequests,
    markDepartmentRequestTransferred
} from '../../../apis/planning/departmentRequests.js';
import { createPlanningRequest, getPlanningRequests, getPlanningRequest } from '../../../apis/planning/planningRequests.js';
import { formatDate, formatDateTime } from '../../../apis/formatters.js';
import { UNIT_CHOICES, ITEM_CODE_NAMES } from '../../../apis/constants.js';
import {
    initializeModalComponents,
    showDepartmentRequestDetailsModal,
    setupModalEventListeners,
    setGlobalVariables,
    getDepartmentRequestDetailsModal
} from './modals.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
import { fetchAllUsers } from '../../../apis/users.js';

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
let departmentRequestsFilters = null;
let planningRequestsFilters = null;

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    await initNavbar();

    // Initialize header component
    const header = new HeaderComponent({
        title: 'Aktarılacak Departman Talepleri',
        subtitle: 'Aktarılacak departman talepleri ve planlama talepleri listesi',
        icon: 'boxes',
        showBackButton: 'block',
        showCreateButton: 'block',
        createButtonText: 'Yeni Planlama Talebi',
        showExportButton: 'none',
        showRefreshButton: 'none',
        onBackClick: () => window.location.href = '/planning',
        onCreateClick: () => showCreatePlanningRequestModal()
    });

    // Initialize approved requests table component
    approvedTable = new TableComponent('approved-requests-table-container', {
        title: 'Aktarılacak Departman Talepleri',
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
        emptyMessage: 'Aktarılacak departman talebi bulunamadı.',
        emptyIcon: 'fas fa-check-circle'
    });

    // Initialize planning requests table component
    completedTable = new TableComponent('completed-requests-table-container', {
        title: 'Planlama Talepleri',
        icon: 'fas fa-clipboard-list',
        iconColor: 'text-primary',
        columns: [
            {
                field: 'id',
                label: 'Talep No',
                sortable: true,
                formatter: (value) => `<span style="font-weight: 700; color: #0d6efd; font-family: 'Courier New', monospace; font-size: 1rem; background: rgba(13, 110, 253, 0.1); padding: 0.25rem 0.5rem; border-radius: 4px; border: 1px solid rgba(13, 110, 253, 0.2);">${value || '-'}</span>`
            },
            {
                field: 'request_number',
                label: 'Talep Numarası',
                sortable: true,
                formatter: (value) => value ? `<span style="font-weight: 600; color: #495057;">${value}</span>` : '-'
            },
            {
                field: 'title',
                label: 'Başlık',
                sortable: true,
                formatter: (value) => `<div style="font-weight: 500; color: #212529;">${value || '-'}</div>`
            },
            {
                field: 'created_by_username',
                label: 'Oluşturan',
                sortable: true,
                formatter: (value) => `
                    <div style="font-weight: 500; color: #495057;">
                        <i class="fas fa-user-circle me-2 text-muted"></i>
                        ${value || 'Bilinmiyor'}
                    </div>
                `
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
                formatter: (value, row) => renderPlanningRequestStatusBadge(value, row.status_label)
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
                onClick: (row) => viewPlanningRequestDetails(row.id)
            }
        ],
        pagination: true,
        itemsPerPage: 20,
        refreshable: true,
        onRefresh: loadPlanningRequests,
        onSort: (field, direction) => {
            completedCurrentSortField = field;
            completedCurrentSortDirection = direction;
            completedCurrentPage = 1;
            loadPlanningRequests();
        },
        onPageChange: (page) => {
            completedCurrentPage = page;
            loadPlanningRequests();
        },
        emptyMessage: 'Planlama talebi bulunamadı.',
        emptyIcon: 'fas fa-clipboard-list'
    });

    // Initialize filters for both tables
    await initializeFiltersComponents();

    await initializeRequests();

    // Set global variables for modals
    setGlobalVariables({
        currentRequest,
        requests,
        loadRequests,
        loadCompletedRequests: loadPlanningRequests,
        showNotification
    });

    initializeModalComponents();
    setupEventListeners();
    setupModalEventListeners();
    setupExcelImportListeners();

    // Check if there's a request parameter in the URL to open modal (after modal is initialized)
    const urlParams = new URLSearchParams(window.location.search);
    const requestId = urlParams.get('request');
    if (requestId) {
        await openModalFromRequestId(requestId);
    }
});

async function initializeFiltersComponents() {
    // Initialize filters for department requests (approved requests table)
    departmentRequestsFilters = new FiltersComponent('department-requests-filters-placeholder', {
        title: 'Departman Talepleri Filtreleri',
        onApply: (values) => {
            currentPage = 1;
            loadRequests();
        },
        onClear: () => {
            currentPage = 1;
            loadRequests();
            showNotification('Filtreler temizlendi', 'info');
        }
    });

    // Department filter
    departmentRequestsFilters.addDropdownFilter({
        id: 'department-filter',
        label: 'Departman',
        options: [
            { value: 'maintenance', label: 'Bakım' },
            { value: 'manufacturing', label: 'İmalat' },
            { value: 'procurement', label: 'Satın Alma' },
            { value: 'finance', label: 'Finans' },
            { value: 'it', label: 'Bilgi İşlem' },
            { value: 'human_resources', label: 'İnsan Kaynakları' },
            { value: 'management', label: 'Yönetim' },
            { value: 'planning', label: 'Planlama' }
        ],
        placeholder: 'Departman seçin',
        colSize: 2
    });

    // Priority filter
    departmentRequestsFilters.addDropdownFilter({
        id: 'priority-filter',
        label: 'Öncelik',
        options: [
            { value: 'normal', label: 'Normal' },
            { value: 'urgent', label: 'Acil' },
            { value: 'critical', label: 'Kritik' }
        ],
        placeholder: 'Öncelik seçin',
        colSize: 2
    });

    // Requestor filter - load users and create dropdown
    try {
        const users = await fetchAllUsers();
        const userOptions = users.map(user => ({
            value: user.id ? user.id.toString() : user.username,
            label: user.full_name ? `${user.full_name} (${user.username})` : 
                   (user.first_name && user.last_name) ? `${user.first_name} ${user.last_name} (${user.username})` :
                   user.username
        }));

        departmentRequestsFilters.addDropdownFilter({
            id: 'requestor-filter',
            label: 'Talep Eden',
            options: userOptions,
            placeholder: 'Kullanıcı seçin',
            colSize: 2,
            searchable: true
        });
    } catch (error) {
        console.error('Error loading users for filter:', error);
        departmentRequestsFilters.addDropdownFilter({
            id: 'requestor-filter',
            label: 'Talep Eden',
            options: [],
            placeholder: 'Kullanıcı yüklenemedi',
            colSize: 2,
            searchable: true
        });
    }

    // Initialize filters for planning requests (completed requests table)
    planningRequestsFilters = new FiltersComponent('planning-requests-filters-placeholder', {
        title: 'Planlama Talepleri Filtreleri',
        onApply: (values) => {
            completedCurrentPage = 1;
            loadPlanningRequests();
        },
        onClear: () => {
            completedCurrentPage = 1;
            loadPlanningRequests();
            showNotification('Filtreler temizlendi', 'info');
        }
    });

    // Status filter for planning requests
    planningRequestsFilters.addDropdownFilter({
        id: 'status-filter',
        label: 'Durum',
        options: [
            { value: 'draft', label: 'Taslak' },
            { value: 'ready', label: 'Satın Almaya Hazır' },
            { value: 'converted', label: 'Onaya Gönderildi' },
            { value: 'cancelled', label: 'İptal Edildi' }
        ],
        placeholder: 'Durum seçin',
        colSize: 2
    });

    // Priority filter for planning requests
    planningRequestsFilters.addDropdownFilter({
        id: 'planning-priority-filter',
        label: 'Öncelik',
        options: [
            { value: 'normal', label: 'Normal' },
            { value: 'urgent', label: 'Acil' },
            { value: 'critical', label: 'Kritik' }
        ],
        placeholder: 'Öncelik seçin',
        colSize: 2
    });

    // Created by filter for planning requests
    try {
        const users = await fetchAllUsers();
        const userOptions = users.map(user => ({
            value: user.id ? user.id.toString() : user.username,
            label: user.full_name ? `${user.full_name} (${user.username})` : 
                   (user.first_name && user.last_name) ? `${user.first_name} ${user.last_name} (${user.username})` :
                   user.username
        }));

        planningRequestsFilters.addDropdownFilter({
            id: 'created-by-filter',
            label: 'Oluşturan',
            options: userOptions,
            placeholder: 'Kullanıcı seçin',
            colSize: 2,
            searchable: true
        });
    } catch (error) {
        console.error('Error loading users for filter:', error);
        planningRequestsFilters.addDropdownFilter({
            id: 'created-by-filter',
            label: 'Oluşturan',
            options: [],
            placeholder: 'Kullanıcı yüklenemedi',
            colSize: 2,
            searchable: true
        });
    }

    // Department request filter for planning requests (text input for ID)
    planningRequestsFilters.addTextFilter({
        id: 'department-request-filter',
        label: 'Departman Talebi No',
        placeholder: 'Departman talebi numarası',
        type: 'number',
        colSize: 2
    });
}

async function initializeRequests() {
    try {
        // Load approved requests first (needed for modals)
        await loadRequests();
        // Load planning requests in the background without blocking
        loadPlanningRequests().catch(error => {
            console.error('Error loading planning requests:', error);
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

        // Build filters
        const filters = {
            page: currentPage,
            page_size: 20,
            ordering: currentSortDirection === 'asc' ? currentSortField : `-${currentSortField}`
        };

        // Get filter values and add to filters
        if (departmentRequestsFilters) {
            const filterValues = departmentRequestsFilters.getFilterValues();
            
            if (filterValues['department-filter'] && filterValues['department-filter'] !== '') {
                filters.department = filterValues['department-filter'];
            }
            if (filterValues['priority-filter'] && filterValues['priority-filter'] !== '') {
                filters.priority = filterValues['priority-filter'];
            }
            if (filterValues['requestor-filter'] && filterValues['requestor-filter'] !== '') {
                filters.requestor = filterValues['requestor-filter'];
            }
        }

        // Use the approved requests API endpoint
        const response = await getApprovedDepartmentRequests(filters);

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

async function loadPlanningRequests() {
    if (isCompletedLoading) return;

    try {
        isCompletedLoading = true;
        completedTable.setLoading(true);

        // Build filters for planning requests
        const filters = {
            page: completedCurrentPage,
            page_size: 20,
            ordering: completedCurrentSortDirection === 'desc' ? `-${completedCurrentSortField}` : completedCurrentSortField
        };

        // Get filter values and add to filters
        if (planningRequestsFilters) {
            const filterValues = planningRequestsFilters.getFilterValues();
            
            if (filterValues['status-filter'] && filterValues['status-filter'] !== '') {
                filters.status = filterValues['status-filter'];
            }
            if (filterValues['planning-priority-filter'] && filterValues['planning-priority-filter'] !== '') {
                filters.priority = filterValues['planning-priority-filter'];
            }
            if (filterValues['created-by-filter'] && filterValues['created-by-filter'] !== '') {
                filters.created_by = filterValues['created-by-filter'];
            }
            if (filterValues['department-request-filter'] && filterValues['department-request-filter'] !== '') {
                filters.department_request = filterValues['department-request-filter'];
            }
        }

        // Use the planning requests API endpoint
        const response = await getPlanningRequests(filters);

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
        console.error('Error loading planning requests:', error);
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

function renderPlanningRequestStatusBadge(status, statusLabel) {
    // Map planning request status values to badge colors
    let badgeClass = 'status-grey'; // default

    switch (status) {
        case 'draft':
            badgeClass = 'status-grey';
            break;
        case 'ready':
            badgeClass = 'status-green';
            break;
        case 'converted':
            badgeClass = 'status-blue';
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

async function viewPlanningRequestDetails(requestId) {
    try {
        const planningRequest = await getPlanningRequest(requestId);
        await showPlanningRequestDetailsModal(planningRequest);
    } catch (error) {
        console.error('Error viewing planning request details:', error);
        showNotification('Planlama talebi detayları yüklenirken hata oluştu: ' + error.message, 'error');
    }
}

// Show planning request details modal
async function showPlanningRequestDetailsModal(request) {
    if (!request) return;

    // Initialize modal if not already created
    if (!planningRequestDetailsModal) {
        planningRequestDetailsModal = new DisplayModal('planning-request-details-modal-container', {
            title: 'Planlama Talebi Detayları',
            icon: 'fas fa-clipboard-list',
            size: 'xl',
            showEditButton: false
        });
    }

    // Clear previous data
    planningRequestDetailsModal.clearData();

    // Add a custom section with two columns layout
    planningRequestDetailsModal.addSection({
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
                            <div class="field-value">#${request.id}</div>
                        </div>
                    </div>
                    ${request.request_number ? `
                    <div class="col-12">
                        <div class="field-display mb-2 d-flex align-items-center">
                            <label class="field-label me-2 mb-0 flex-shrink-0">
                                <i class="fas fa-barcode me-1"></i>Talep Numarası:
                            </label>
                            <div class="field-value">${request.request_number}</div>
                        </div>
                    </div>
                    ` : ''}
                    <div class="col-12">
                        <div class="field-display mb-2 d-flex align-items-center">
                            <label class="field-label me-2 mb-0 flex-shrink-0">
                                <i class="fas fa-user me-1"></i>Oluşturan:
                            </label>
                            <div class="field-value">${request.created_by_full_name || request.created_by_username || 'Bilinmiyor'}</div>
                        </div>
                    </div>
                    <div class="col-12">
                        <div class="field-display mb-2 d-flex align-items-center">
                            <label class="field-label me-2 mb-0 flex-shrink-0">
                                <i class="fas fa-info me-1"></i>Durum:
                            </label>
                            <div class="field-value">${renderPlanningRequestStatusBadge(request.status, request.status_label)}</div>
                        </div>
                    </div>
                    <div class="col-12">
                        <div class="field-display mb-2 d-flex align-items-center">
                            <label class="field-label me-2 mb-0 flex-shrink-0">
                                <i class="fas fa-calendar-plus me-1"></i>Oluşturulma:
                            </label>
                            <div class="field-value">${formatDateTime(request.created_at)}</div>
                        </div>
                    </div>
                    <div class="col-12">
                        <div class="field-display mb-2 d-flex align-items-center">
                            <label class="field-label me-2 mb-0 flex-shrink-0">
                                <i class="fas fa-calendar-check me-1"></i>Son Güncelleme:
                            </label>
                            <div class="field-value">${formatDateTime(request.updated_at)}</div>
                        </div>
                    </div>
                    ${request.ready_at ? `
                    <div class="col-12">
                        <div class="field-display mb-2 d-flex align-items-center">
                            <label class="field-label me-2 mb-0 flex-shrink-0">
                                <i class="fas fa-check-circle me-1"></i>Hazır Olma Tarihi:
                            </label>
                            <div class="field-value">${formatDateTime(request.ready_at)}</div>
                        </div>
                    </div>
                    ` : ''}
                    ${request.converted_at ? `
                    <div class="col-12">
                        <div class="field-display mb-2 d-flex align-items-center">
                            <label class="field-label me-2 mb-0 flex-shrink-0">
                                <i class="fas fa-exchange-alt me-1"></i>Dönüştürülme Tarihi:
                            </label>
                            <div class="field-value">${formatDateTime(request.converted_at)}</div>
                        </div>
                    </div>
                    ` : ''}
                    ${request.department_request ? `
                    <div class="col-12">
                        <div class="field-display mb-2 d-flex align-items-center">
                            <label class="field-label me-2 mb-0 flex-shrink-0">
                                <i class="fas fa-link me-1"></i>Departman Talebi:
                            </label>
                            <div class="field-value">#${request.department_request}</div>
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
                    ${request.title ? `
                    <div class="col-12">
                        <div class="field-display mb-2">
                            <label class="field-label mb-1">
                                <i class="fas fa-heading me-1"></i>Başlık:
                            </label>
                            <div class="field-value">${request.title}</div>
                        </div>
                    </div>
                    ` : ''}
                    <div class="col-12">
                        <div class="field-display mb-2">
                            <label class="field-label mb-1">
                                <i class="fas fa-align-left me-1"></i>Açıklama:
                            </label>
                            <div class="field-value" style="white-space: pre-wrap; word-wrap: break-word;">${request.description || '-'}</div>
                        </div>
                    </div>
                    <div class="col-12">
                        <div class="field-display mb-2 d-flex align-items-center">
                            <label class="field-label me-2 mb-0 flex-shrink-0">
                                <i class="fas fa-flag me-1"></i>Öncelik:
                            </label>
                            <div class="field-value">${renderPriorityBadge(request.priority)}</div>
                        </div>
                    </div>
                    <div class="col-12">
                        <div class="field-display mb-2 d-flex align-items-center">
                            <label class="field-label me-2 mb-0 flex-shrink-0">
                                <i class="fas fa-calendar me-1"></i>İhtiyaç Tarihi:
                            </label>
                            <div class="field-value">${formatDate(request.needed_date)}</div>
                        </div>
                    </div>
                    <div class="col-12">
                        <div class="field-display mb-2 d-flex align-items-center">
                            <label class="field-label me-2 mb-0 flex-shrink-0">
                                <i class="fas fa-boxes me-1"></i>Ürün Sayısı:
                            </label>
                            <div class="field-value">${request.items?.length || 0} ürün</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    planningRequestDetailsModal.addCustomContent(twoColumnHtml);

    // Add items section with table
    if (request.items && request.items.length > 0) {
        planningRequestDetailsModal.addSection({
            title: 'Talep Edilen Ürünler',
            icon: 'fas fa-boxes',
            iconColor: 'text-primary'
        });

        // Create items table
        const itemsData = request.items.map((item, index) => ({
            id: index + 1,
            code: item.item_code || '-',
            name: item.item_name || '-',
            description: item.item_description || '-',
            job_no: item.job_no || '-',
            quantity: item.quantity || 0,
            unit: item.item_unit || 'adet',
            priority: item.priority || 'normal',
            specifications: item.specifications || '-',
            files_count: item.files?.length || 0
        }));

        // Add custom HTML content for the table
        const tableHtml = `
            <div id="planning-items-table-container" class="mt-3">
                <div class="table-responsive">
                    <table class="table table-sm table-striped">
                        <thead class="table-light">
                            <tr>
                                <th>#</th>
                                <th>Ürün Kodu</th>
                                <th>Ürün Adı</th>
                                <th>Ürün Açıklaması</th>
                                <th>İş No</th>
                                <th>Miktar</th>
                                <th>Birim</th>
                                <th>Öncelik</th>
                                <th>Özellikler</th>
                                <th>Dosyalar</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsData.map(item => `
                                <tr>
                                    <td>${item.id}</td>
                                    <td><strong>${item.code}</strong></td>
                                    <td>${item.name}</td>
                                    <td>${item.description}</td>
                                    <td>${item.job_no}</td>
                                    <td>${item.quantity}</td>
                                    <td>${item.unit}</td>
                                    <td>${renderPriorityBadge(item.priority)}</td>
                                    <td>${item.specifications}</td>
                                    <td>${item.files_count > 0 ? `<span class="badge bg-info">${item.files_count} dosya</span>` : '-'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        planningRequestDetailsModal.addCustomContent(tableHtml);
    }

    // Add request-level files section if files exist
    if (request.files && request.files.length > 0) {
        planningRequestDetailsModal.addSection({
            title: 'Talep Dosyaları',
            icon: 'fas fa-paperclip',
            iconColor: 'text-info'
        });

        const filesContainerHtml = `
            <div class="row g-2">
                <div class="col-12">
                    <div id="planning-request-files-container"></div>
                </div>
            </div>
        `;

        planningRequestDetailsModal.addCustomContent(filesContainerHtml);
    }

    // Add item-level files section if any item has files
    const itemsWithFiles = request.items?.filter(item => item.files && item.files.length > 0) || [];
    if (itemsWithFiles.length > 0) {
        planningRequestDetailsModal.addSection({
            title: 'Ürün Dosyaları',
            icon: 'fas fa-file-alt',
            iconColor: 'text-success'
        });

        let itemFilesHtml = '';
        request.items.forEach((item, itemIndex) => {
            if (item.files && item.files.length > 0) {
                const itemDisplayName = item.item_code || item.item_name || `Ürün ${itemIndex + 1}`;
                itemFilesHtml += `
                    <div class="mb-4">
                        <h6 class="text-muted mb-2">
                            <i class="fas fa-box me-2"></i>${itemDisplayName}
                            ${item.item_name && item.item_code ? ` - ${item.item_name}` : ''}
                        </h6>
                        <div id="planning-item-files-container-${itemIndex}"></div>
                    </div>
                `;
            }
        });

        const itemFilesContainerHtml = `
            <div class="row g-2">
                <div class="col-12">
                    ${itemFilesHtml}
                </div>
            </div>
        `;

        planningRequestDetailsModal.addCustomContent(itemFilesContainerHtml);
    }

    // Render the modal
    planningRequestDetailsModal.render();

    // Add custom footer with export button if items exist
    const modalFooter = planningRequestDetailsModal.container.querySelector('.modal-footer');
    if (modalFooter && request.items && request.items.length > 0) {
        modalFooter.innerHTML = `
            <div class="d-flex justify-content-end gap-2">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                    <i class="fas fa-times me-1"></i>Kapat
                </button>
                <button type="button" class="btn btn-success" id="export-planning-items-btn" style="min-width: 140px;">
                    <i class="fas fa-file-csv me-1"></i>CSV Dışa Aktar
                </button>
            </div>
        `;
        
        // Add event listener for export button
        const exportBtn = modalFooter.querySelector('#export-planning-items-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                exportItemsToCSV(request);
            });
        }
    }

    // Initialize file attachments components after rendering
    setTimeout(() => {
        // Initialize request-level files
        if (request.files && request.files.length > 0) {
            const filesContainer = document.getElementById('planning-request-files-container');
            if (filesContainer) {
                const fileAttachments = new FileAttachments('planning-request-files-container', {
                    title: 'Ekler',
                    titleIcon: 'fas fa-paperclip',
                    titleIconColor: 'text-muted',
                    layout: 'grid',
                    onFileClick: (file) => {
                        const fileName = file.file_name || 'Dosya';
                        const fileExtension = fileName.split('.').pop().toLowerCase();
                        const viewer = new FileViewer();
                        viewer.setDownloadCallback(async () => {
                            await viewer.downloadFile(file.file_url, fileName);
                        });
                        viewer.openFile(file.file_url, fileName, fileExtension);
                    }
                });
                fileAttachments.setFiles(request.files);
            }
        }

        // Initialize item-level files
        if (itemsWithFiles.length > 0) {
            request.items.forEach((item, itemIndex) => {
                if (item.files && item.files.length > 0) {
                    const itemFilesContainer = document.getElementById(`planning-item-files-container-${itemIndex}`);
                    if (itemFilesContainer) {
                        const itemFileAttachments = new FileAttachments(`planning-item-files-container-${itemIndex}`, {
                            title: '',
                            layout: 'grid',
                            onFileClick: (file) => {
                                const fileName = file.file_name || 'Dosya';
                                const fileExtension = fileName.split('.').pop().toLowerCase();
                                const viewer = new FileViewer();
                                viewer.setDownloadCallback(async () => {
                                    await viewer.downloadFile(file.file_url, fileName);
                                });
                                viewer.openFile(file.file_url, fileName, fileExtension);
                            }
                        });
                        itemFileAttachments.setFiles(item.files);
                    }
                }
            });
        }
    }, 100);

    // Show the modal
    planningRequestDetailsModal.show();
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

// Create planning request modal instance
let createPlanningRequestModal = null;
// Planning request details modal instance
let planningRequestDetailsModal = null;
// Export confirmation modal instance
let exportConfirmationModal = null;

// Show create planning request modal
// departmentRequest: Optional department request object to pre-fill the form
function showCreatePlanningRequestModal(departmentRequest = null) {
    if (!createPlanningRequestModal) {
        // Initialize modal if not already created
        createPlanningRequestModal = new EditModal('create-planning-request-modal-container', {
            title: departmentRequest ? 'Planlama Talebi Oluştur (Departman Talebinden)' : 'Yeni Planlama Talebi Oluştur',
            icon: 'fas fa-plus-circle',
            saveButtonText: 'Oluştur',
            size: 'fullscreen'
        });
    }

    // Clear previous form data
    createPlanningRequestModal.clearAll();
    // Clear file attachments
    fileAttachments = [];

    // Update modal title if department request is provided
    if (departmentRequest) {
        createPlanningRequestModal.setTitle('Planlama Talebi Oluştur (Departman Talebinden)');
    } else {
        createPlanningRequestModal.setTitle('Yeni Planlama Talebi Oluştur');
    }
    const priorityOptions = [
        { value: 'low', label: 'Düşük' },
        { value: 'normal', label: 'Normal' },
        { value: 'high', label: 'Yüksek' },
        { value: 'urgent', label: 'Acil' }
    ];

    // Add basic information section
    createPlanningRequestModal.addSection({
        id: 'basic-info-section',
        title: 'Temel Bilgiler',
        icon: 'fas fa-info-circle',
        iconColor: 'text-primary',
        fields: [
            {
                id: 'title',
                name: 'title',
                label: 'Başlık',
                type: 'text',
                placeholder: 'Planlama talebi başlığını girin',
                value: departmentRequest?.title || '',
                required: !departmentRequest, // Not required if from department request
                icon: 'fas fa-heading',
                colSize: 12,
                help: departmentRequest ? 'Planlama talebinin başlığı (departman talebinden alındı)' : 'Planlama talebinin başlığı (zorunlu)'
            },
            {
                id: 'description',
                name: 'description',
                label: 'Açıklama',
                type: 'textarea',
                placeholder: 'Planlama talebi açıklamasını girin',
                value: departmentRequest?.description || '',
                required: false,
                icon: 'fas fa-align-left',
                colSize: 12,
                rows: 4,
                help: 'Planlama talebi hakkında detaylı açıklama (opsiyonel)'
            }
        ]
    });

    // Add request details section
    createPlanningRequestModal.addSection({
        id: 'request-details-section',
        title: 'Talep Detayları',
        icon: 'fas fa-clipboard-list',
        iconColor: 'text-success',
        fields: [
            {
                id: 'priority',
                name: 'priority',
                label: 'Öncelik',
                type: 'dropdown',
                value: departmentRequest?.priority || 'normal',
                required: false,
                icon: 'fas fa-exclamation-triangle',
                colSize: 12,
                help: 'Talebin öncelik seviyesi',
                options: priorityOptions
            },
            {
                id: 'needed_date',
                name: 'needed_date',
                label: 'İhtiyaç Tarihi',
                type: 'date',
                value: departmentRequest?.needed_date || '',
                required: false,
                icon: 'fas fa-calendar-alt',
                colSize: 12,
                help: 'Talebin ihtiyaç duyulduğu tarih (opsiyonel)'
            },
            {
                id: 'check_inventory',
                name: 'check_inventory',
                label: 'Envanter Kontrolü',
                type: 'checkbox',
                value: false,
                required: false,
                icon: 'fas fa-warehouse',
                colSize: 12,
                help: 'Talebi envanter kontrolü için gönder'
            }
        ]
    });

    // Add items section (empty fields, will be populated with custom HTML)
    createPlanningRequestModal.addSection({
        id: 'items-info',
        title: 'Ürün Bilgileri',
        icon: 'fas fa-boxes',
        iconColor: 'text-primary',
        fields: []
    });

    // Add attachments section (empty fields, will be populated with custom HTML)
    createPlanningRequestModal.addSection({
        id: 'attachments-info',
        title: 'Dosya Ekleri',
        icon: 'fas fa-paperclip',
        iconColor: 'text-info',
        fields: []
    });

    // Set up save callback
    createPlanningRequestModal.onSaveCallback(async (formData) => {
        try {
            // Collect items data from dynamic rows
            const itemRows = document.querySelectorAll('.planning-item-row');
            const items = [];
            for (const row of itemRows) {
                const itemCode = row.querySelector('input[name="item_code"]')?.value?.trim();
                const itemId = itemCode && !isNaN(itemCode) ? parseInt(itemCode, 10) : null;
                const itemName = row.querySelector('input[name="item_name"]')?.value?.trim();
                const itemDescription = row.querySelector('input[name="item_description"]')?.value?.trim();
                const itemUnit = row.querySelector('select[name="item_unit"]')?.value?.trim() || 'adet';
                const itemQuantity = row.querySelector('input[name="item_quantity"]')?.value?.trim();
                const jobNo = row.querySelector('input[name="job_no"]')?.value?.trim();
                const itemSpecifications = row.querySelector('input[name="item_specifications"]')?.value?.trim();
                
                // Validate required fields
                if (!jobNo) {
                    showNotification('Tüm ürünler için iş no gereklidir', 'error');
                    throw new Error('Job number required for all items');
                }
                
                if (!itemQuantity || parseFloat(itemQuantity) <= 0) {
                    showNotification('Tüm ürünler için geçerli miktar gereklidir', 'error');
                    throw new Error('Valid quantity required for all items');
                }

                // Item code is required (can be numeric ID or string code)
                if (!itemCode && !itemId) {
                    showNotification('Tüm ürünler için ürün kodu/ID gereklidir', 'error');
                    throw new Error('Item code/ID required for all items');
                }

                // Build item object
                const itemData = {
                    job_no: jobNo,
                    quantity: parseFloat(itemQuantity)
                };

                // Add item identifier (item_id takes precedence over item_code)
                // At this point, we know either itemId or itemCode exists (validated above)
                if (itemId) {
                    itemData.item_id = itemId;
                } else {
                    itemData.item_code = itemCode;
                }

                // Add optional fields
                if (itemName) {
                    itemData.item_name = itemName;
                }
                if (itemDescription) {
                    itemData.item_description = itemDescription;
                }
                if (itemUnit) {
                    itemData.item_unit = itemUnit;
                }
                if (itemSpecifications) {
                    itemData.specifications = itemSpecifications;
                }

                // Add source_item_index if creating from department request
                const departmentRequestId = createPlanningRequestModal.container.querySelector('[data-department-request-id]')?.dataset.departmentRequestId;
                if (departmentRequestId) {
                    // Get the original item index from the row's data attribute
                    const itemRow = row.closest('.planning-item-row');
                    const sourceIndex = itemRow?.dataset.sourceItemIndex;
                    if (sourceIndex !== undefined) {
                        itemData.source_item_index = parseInt(sourceIndex, 10);
                    }
                }

                items.push(itemData);
            }

            // Prepare files array (includes both new uploads and existing file references)
            const files = [];
            
            for (const attachment of fileAttachments) {
                // Validate that at least one target is selected
                if (!attachment.attachTo || attachment.attachTo.length === 0) {
                    showNotification(`"${attachment.file.name}" dosyası için en az bir hedef seçilmelidir (Talep veya ürün)`, 'error');
                    throw new Error('File must have at least one attachment target');
                }

                // Validate item indices are within range
                const itemIndices = attachment.attachTo.filter(t => typeof t === 'number');
                const maxItemIndex = items.length - 1;
                for (const index of itemIndices) {
                    if (index < 0 || index > maxItemIndex) {
                        showNotification(`"${attachment.file.name}" dosyası için geçersiz ürün indeksi`, 'error');
                        throw new Error('Invalid item index in attach_to');
                    }
                }

                // Build file object for API
                const fileObj = {
                    description: attachment.description || '',
                    attach_to: attachment.attachTo
                };

                // For existing files, use source_attachment_id
                // For new files, use file
                if (attachment.isExisting) {
                    fileObj.source_attachment_id = attachment.sourceAttachmentId;
                } else {
                    fileObj.file = attachment.file;
                }

                files.push(fileObj);
            }

            // Prepare request data
            const requestData = {
                title: formData.title,
                description: formData.description || '',
                priority: formData.priority || 'normal',
                needed_date: formData.needed_date || null,
                items: items.length > 0 ? items : undefined,
                files: files.length > 0 ? files : undefined
            };

            // Add check_inventory if checkbox is checked
            if (formData.check_inventory) {
                requestData.check_inventory = true;
            }

            // Add department_request_id if creating from department request
            const departmentRequestId = createPlanningRequestModal.container.querySelector('[data-department-request-id]')?.dataset.departmentRequestId;
            if (departmentRequestId) {
                requestData.department_request_id = parseInt(departmentRequestId, 10);
            }

            // Create the planning request
            const createdRequest = await createPlanningRequest(requestData);

            // Show success notification
            showNotification('Planlama talebi başarıyla oluşturuldu', 'success');

            // Close modal
            createPlanningRequestModal.hide();

            // Refresh both tables
            await loadRequests();
            await loadPlanningRequests();

            // Show export confirmation modal if there are items
            if (createdRequest.items && createdRequest.items.length > 0) {
                showExportConfirmationModal(createdRequest);
            }
        } catch (error) {
            console.error('Error creating planning request:', error);
            if (error.message !== 'Job number required for all items' && 
                error.message !== 'Valid quantity required for all items' &&
                error.message !== 'Item code/ID or item name required') {
                showNotification('Planlama talebi oluşturulurken hata oluştu: ' + error.message, 'error');
            }
            throw error; // Re-throw to prevent modal from closing
        }
    });

    // Set up cancel callback
    createPlanningRequestModal.onCancelCallback(() => {
        // Clear form on cancel
        createPlanningRequestModal.clearAll();
        // Clear file attachments
        fileAttachments = [];
        renderFilesList();
    });

    // Render the modal
    createPlanningRequestModal.render();

    // Rearrange sections into two-column layout after rendering
    setTimeout(() => {
        const form = createPlanningRequestModal.container.querySelector('#edit-modal-form');
        const basicInfoSection = createPlanningRequestModal.container.querySelector('[data-section-id="basic-info-section"]');
        const requestDetailsSection = createPlanningRequestModal.container.querySelector('[data-section-id="request-details-section"]');
        
        if (form && basicInfoSection && requestDetailsSection) {
            // Create a wrapper row for two-column layout
            const wrapperRow = document.createElement('div');
            wrapperRow.className = 'row g-3 mb-3';
            
            // Wrap basic info section in left column
            const leftCol = document.createElement('div');
            leftCol.className = 'col-md-6';
            basicInfoSection.classList.remove('mb-3');
            basicInfoSection.classList.add('mb-0', 'h-100');
            leftCol.appendChild(basicInfoSection);
            
            // Wrap request details section in right column
            const rightCol = document.createElement('div');
            rightCol.className = 'col-md-6';
            requestDetailsSection.classList.remove('mb-3');
            requestDetailsSection.classList.add('mb-0', 'h-100');
            rightCol.appendChild(requestDetailsSection);
            
            // Add columns to wrapper row
            wrapperRow.appendChild(leftCol);
            wrapperRow.appendChild(rightCol);
            
            // Insert wrapper row at the beginning of the form (before items section)
            const itemsSection = createPlanningRequestModal.container.querySelector('[data-section-id="items-info"]');
            if (itemsSection) {
                form.insertBefore(wrapperRow, itemsSection);
            } else {
                form.insertBefore(wrapperRow, form.firstChild);
            }
        }
        
        // Setup items section with custom HTML after rendering
        setupItemsSection();
        setupAttachmentsSection();
        
        // Pre-fill items if department request is provided
        if (departmentRequest) {
            // Store department request ID for later use (always set, even if no files)
            const modalContainer = createPlanningRequestModal.container;
            if (!modalContainer.querySelector('[data-department-request-id]')) {
                const hiddenInput = document.createElement('div');
                hiddenInput.setAttribute('data-department-request-id', departmentRequest.id);
                hiddenInput.style.display = 'none';
                modalContainer.appendChild(hiddenInput);
            }
            
            prefillItemsFromDepartmentRequest(departmentRequest);
            prefillFilesFromDepartmentRequest(departmentRequest);
        }
    }, 100);

    // Show the modal
    createPlanningRequestModal.show();
}

// Helper function to escape HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Pre-fill items from department request
function prefillItemsFromDepartmentRequest(departmentRequest) {
    if (!departmentRequest.items || departmentRequest.items.length === 0) {
        return;
    }

    const container = document.getElementById('planning-items-container');
    if (!container) {
        return;
    }

    // Clear existing items
    container.innerHTML = '';

    // Add each item from department request
    departmentRequest.items.forEach((item, index) => {
        // Convert department request item to planning request item format
        // Try multiple possible field names for each field
        const itemCode = item.item_code || item.code || item.product_code || item.item_id?.toString() || '';
        const itemName = item.name || item.product_name || item.item_name || '';
        const itemDescription = item.item_description || item.description || '';
        const itemUnit = item.unit || item.item_unit || 'adet';
        const quantity = item.quantity || item.qty || 1;
        const jobNo = item.job_no || item.job_number || item.job || '';
        const specifications = item.item_specifications || item.specifications || item.specs || '';

        const itemHtml = `
            <div class="planning-item-row mb-2" data-index="${index}" data-source-item-index="${index}">
                <div class="row g-2">
                    <div class="col-md-2">
                        <input type="text" class="form-control form-control-sm" name="item_code" placeholder="Ürün kodu veya ID" value="${escapeHtml(itemCode)}" required>
                    </div>
                    <div class="col-md-2">
                        <input type="text" class="form-control form-control-sm" name="item_name" placeholder="Ürün adı" value="${escapeHtml(itemName)}">
                    </div>
                    <div class="col-md-2">
                        <input type="text" class="form-control form-control-sm" name="item_description" placeholder="Ürün açıklaması" value="${escapeHtml(itemDescription)}">
                    </div>
                    <div class="col-md-1">
                        <input type="text" class="form-control form-control-sm" name="job_no" placeholder="İş no" value="${escapeHtml(jobNo)}" required>
                    </div>
                    <div class="col-md-1">
                        <input type="number" class="form-control form-control-sm" name="item_quantity" placeholder="Miktar" step="0.01" min="0.01" value="${quantity}" required>
                    </div>
                    <div class="col-md-1">
                        <select class="form-control form-control-sm" name="item_unit">
                            ${UNIT_CHOICES.map(unit => `<option value="${unit.value}" ${unit.value === itemUnit ? 'selected' : ''}>${unit.label}</option>`).join('')}
                        </select>
                    </div>
                    <div class="col-md-2">
                        <input type="text" class="form-control form-control-sm" name="item_specifications" placeholder="Özellikler" value="${escapeHtml(specifications)}">
                    </div>
                    <div class="col-md-1">
                        <button type="button" class="btn btn-outline-danger btn-sm w-100" onclick="removePlanningItem(${index})" title="Ürünü Kaldır">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;

        container.insertAdjacentHTML('beforeend', itemHtml);

        // Add event listener to item specifications field to update file list when description changes
        const itemRow = container.querySelector(`.planning-item-row[data-index="${index}"]`);
        if (itemRow) {
            const specsInput = itemRow.querySelector('input[name="item_specifications"]');
            if (specsInput) {
                specsInput.dataset.hasFileListListener = 'true';
                specsInput.addEventListener('input', () => {
                    renderFilesList(); // Update file list to reflect new item description
                });
            }
        }
    });

    // Update file list to show new items
    renderFilesList();
}

// Pre-fill files from department request
function prefillFilesFromDepartmentRequest(departmentRequest) {
    if (!departmentRequest.files || departmentRequest.files.length === 0) {
        return;
    }

    // Add existing files to fileAttachments array
    departmentRequest.files.forEach(file => {
        // Create a file-like object with the existing file data
        const fileObj = {
            name: file.file_name ? file.file_name.split('/').pop() : 'Dosya',
            size: 0, // We don't have size from API
            type: '', // We don't have type from API
            url: file.file_url,
            id: file.id,
            asset_id: file.asset_id
        };
        
        fileAttachments.push({
            file: fileObj,
            description: file.description || '',
            attachTo: ['request'], // Default to request
            isExisting: true,
            sourceAttachmentId: file.id
        });
    });
    
    // Render the files list to show the existing files
    setTimeout(() => {
        renderFilesList();
    }, 200);
}

// Setup items section with dynamic add/remove functionality
function setupItemsSection() {
    const itemsSection = createPlanningRequestModal.container.querySelector('[data-section-id="items-info"]');
    if (!itemsSection) return;

    const fieldsContainer = itemsSection.querySelector('.row.g-2');
    if (!fieldsContainer) return;

    const itemsHtml = `
        <div class="d-flex justify-content-between align-items-center mb-2">
            <h6 class="mb-0">Ürün Listesi</h6>
            <div class="d-flex gap-2">
                <button type="button" class="btn btn-sm btn-outline-primary" id="add-planning-item-btn">
                    <i class="fas fa-plus me-1"></i>Ürün Ekle
                </button>
                <button type="button" class="btn btn-sm btn-outline-success" id="excel-import-btn">
                    <i class="fas fa-file-excel me-1"></i>Excel'den İçe Aktar
                </button>
                <button type="button" class="btn btn-sm btn-outline-danger" id="clear-planning-items-btn">
                    <i class="fas fa-trash-alt me-1"></i>Tümünü Temizle
                </button>
            </div>
        </div>
        <div class="row g-2 mb-2">
            <div class="col-md-2">
                <small class="text-muted fw-bold">
                    <i class="fas fa-barcode me-1"></i>Ürün Kodu/ID <span class="text-danger">*</span>
                </small>
            </div>
            <div class="col-md-2">
                <small class="text-muted fw-bold">
                    <i class="fas fa-tag me-1"></i>Ürün Adı
                </small>
            </div>
            <div class="col-md-2">
                <small class="text-muted fw-bold">
                    <i class="fas fa-align-left me-1"></i>Ürün Açıklaması
                </small>
            </div>
            <div class="col-md-1">
                <small class="text-muted fw-bold">
                    <i class="fas fa-hashtag me-1"></i>İş No
                </small>
            </div>
            <div class="col-md-1">
                <small class="text-muted fw-bold">
                    <i class="fas fa-list-ol me-1"></i>Miktar
                </small>
            </div>
            <div class="col-md-1">
                <small class="text-muted fw-bold">
                    <i class="fas fa-ruler me-1"></i>Birim
                </small>
            </div>
            <div class="col-md-2">
                <small class="text-muted fw-bold">
                    <i class="fas fa-cog me-1"></i>Özellikler
                </small>
            </div>
            <div class="col-md-1">
                <small class="text-muted fw-bold">İşlem</small>
            </div>
        </div>
        <div id="planning-items-container">
            <!-- Items will be added here -->
        </div>
    `;

    fieldsContainer.insertAdjacentHTML('beforeend', itemsHtml);

    // Add event listener for add item button
    const addItemBtn = createPlanningRequestModal.container.querySelector('#add-planning-item-btn');
    if (addItemBtn) {
        addItemBtn.addEventListener('click', addPlanningItem);
    }

    // Add event listener for Excel import button
    const excelImportBtn = createPlanningRequestModal.container.querySelector('#excel-import-btn');
    if (excelImportBtn) {
        excelImportBtn.addEventListener('click', () => {
            const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('excel-import-modal'));
            modal.show();
        });
    }


    // Clear all items
    const clearItemsBtn = createPlanningRequestModal.container.querySelector('#clear-planning-items-btn');
    if (clearItemsBtn) {
        clearItemsBtn.addEventListener('click', () => {
            const container = document.getElementById('planning-items-container');
            if (!container) return;
            container.innerHTML = '';
            // Remove all item references from file attachments (keep only 'request')
            fileAttachments.forEach(attachment => {
                attachment.attachTo = attachment.attachTo.filter(t => t === 'request');
                // If no targets remain, add 'request' back
                if (attachment.attachTo.length === 0) {
                    attachment.attachTo.push('request');
                }
            });
            renderFilesList();
            showNotification('Tüm ürünler temizlendi', 'info');
        });
    }
}

// Add item to planning request form
function addPlanningItem() {
    const container = document.getElementById('planning-items-container');
    if (!container) {
        return;
    }
    const itemIndex = container.children.length;
    
    const itemHtml = `
        <div class="planning-item-row mb-2" data-index="${itemIndex}">
            <div class="row g-2">
                <div class="col-md-2">
                    <input type="text" class="form-control form-control-sm" name="item_code" placeholder="Ürün kodu veya ID" required>
                </div>
                <div class="col-md-2">
                    <input type="text" class="form-control form-control-sm" name="item_name" placeholder="Ürün adı">
                </div>
                <div class="col-md-2">
                    <input type="text" class="form-control form-control-sm" name="item_description" placeholder="Ürün açıklaması">
                </div>
                <div class="col-md-1">
                    <input type="text" class="form-control form-control-sm" name="job_no" placeholder="İş no" required>
                </div>
                <div class="col-md-1">
                    <input type="number" class="form-control form-control-sm" name="item_quantity" placeholder="Miktar" step="0.01" min="0.01" value="1" required>
                </div>
                <div class="col-md-1">
                    <select class="form-control form-control-sm" name="item_unit">
                        ${UNIT_CHOICES.map(unit => `<option value="${unit.value}" ${unit.value === 'adet' ? 'selected' : ''}>${unit.label}</option>`).join('')}
                    </select>
                </div>
                <div class="col-md-2">
                    <input type="text" class="form-control form-control-sm" name="item_specifications" placeholder="Özellikler">
                </div>
                <div class="col-md-1">
                    <button type="button" class="btn btn-outline-danger btn-sm w-100" onclick="removePlanningItem(${itemIndex})" title="Ürünü Kaldır">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
    
    container.insertAdjacentHTML('beforeend', itemHtml);
    
    // Add event listener to item specifications field to update file list when description changes
    const itemRow = container.querySelector(`.planning-item-row[data-index="${itemIndex}"]`);
    if (itemRow) {
        const specsInput = itemRow.querySelector('input[name="item_specifications"]');
        if (specsInput) {
            specsInput.dataset.hasFileListListener = 'true';
            specsInput.addEventListener('input', () => {
                renderFilesList(); // Update file list to reflect new item description
            });
        }
    }
}

// Remove item from planning request form
function removePlanningItem(index) {
    const itemRow = document.querySelector(`.planning-item-row[data-index="${index}"]`);
    if (itemRow) {
        itemRow.remove();
    }
}

// Make removePlanningItem globally available
window.removePlanningItem = removePlanningItem;

// Helper function to format numbers with comma as decimal separator (Turkish locale)
function formatNumberForExport(value) {
    if (value === null || value === undefined || value === '') {
        return '';
    }
    const numValue = typeof value === 'number' ? value : parseFloat(value);
    if (isNaN(numValue)) {
        return value.toString();
    }
    // Format with comma as decimal separator, always show 2 decimal places
    return numValue.toLocaleString('tr-TR', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
    });
}

// Export items to CSV
function exportItemsToCSV(createdRequest) {
    if (!createdRequest || !createdRequest.items || createdRequest.items.length === 0) {
        showNotification('Dışa aktarılacak ürün bulunamadı', 'error');
        return;
    }

    // Get needed_date from the created request
    const neededDate = createdRequest.needed_date || '';
    
    // Format date from YYYY-MM-DD to DD.MM.YYYY
    let formattedDate = '';
    if (neededDate) {
        const dateParts = neededDate.split('-');
        if (dateParts.length === 3) {
            formattedDate = `${dateParts[2]}.${dateParts[1]}.${dateParts[0]}`;
        }
    }

    // Get request_number from the created request
    const requestNumber = createdRequest.request_number || '';

    // Build CSV content
    const csvLines = [];
    createdRequest.items.forEach(item => {
        const itemCode = item.item_code || '';
        const quantity = formatNumberForExport(item.quantity);
        const itemDescription = item.item_description || '';
        const itemSpecifications = item.specifications || '';
        // Combine item_description and item_specifications with | separator
        const description = [itemDescription, itemSpecifications].filter(Boolean).join('|');
        
        // Determine prefix: G for special item codes, S for others
        const prefix = ITEM_CODE_NAMES.hasOwnProperty(itemCode) ? 'G' : 'S';
        
        // Format: S/G;item_code;quantity;date;description;request_number
        const csvLine = `${prefix};${itemCode};${quantity};${formattedDate};${description};${requestNumber}`;
        csvLines.push(csvLine);
    });

    // Create CSV content (no headers)
    const csvContent = csvLines.join('\n');

    // Create blob and download
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' }); // BOM for Excel UTF-8 support
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `planlama_talebi_urunleri_${requestNumber || new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showNotification('Ürünler CSV olarak dışa aktarıldı', 'success');
}

// File attachments state
// Array of { file: File|Object, description: string, attachTo: Array, isExisting: boolean, sourceAttachmentId: number }
let fileAttachments = [];

// Setup attachments section with file upload and target selection
function setupAttachmentsSection() {
    const attachmentsSection = createPlanningRequestModal.container.querySelector('[data-section-id="attachments-info"]');
    if (!attachmentsSection) return;

    const fieldsContainer = attachmentsSection.querySelector('.row.g-2');
    if (!fieldsContainer) return;

    const attachmentsHtml = `
        <div class="col-12">
            <div class="mb-3">
                <label class="form-label">
                    <i class="fas fa-file me-1"></i>Dosya Seç
                </label>
                <input type="file" class="form-control" id="planning-file-input" multiple accept="*/*">
                <small class="form-text text-muted">Birden fazla dosya seçebilirsiniz</small>
            </div>
            <div id="planning-files-list" class="mt-3">
                <!-- Files will be listed here -->
            </div>
        </div>
    `;

    fieldsContainer.insertAdjacentHTML('beforeend', attachmentsHtml);

    // Add event listener for file input
    const fileInput = createPlanningRequestModal.container.querySelector('#planning-file-input');
    if (fileInput) {
        fileInput.addEventListener('change', handleFileSelection);
    }
}

// Handle file selection
function handleFileSelection(event) {
    const files = Array.from(event.target.files);
    
    files.forEach(file => {
        // Check if file already exists
        const exists = fileAttachments.some(att => att.file.name === file.name && att.file.size === file.size);
        if (!exists) {
            fileAttachments.push({
                file: file,
                description: '',
                attachTo: ['request'] // Default to request
            });
        }
    });
    
    renderFilesList();
    
    // Clear the input so same file can be selected again if needed
    event.target.value = '';
}

// Render files list with attachment targets
function renderFilesList() {
    const filesListContainer = document.getElementById('planning-files-list');
    if (!filesListContainer) return;

    if (fileAttachments.length === 0) {
        filesListContainer.innerHTML = '<p class="text-muted small">Henüz dosya eklenmedi</p>';
        return;
    }

    // Get current items for attachment targets
    const itemRows = document.querySelectorAll('.planning-item-row');
    const itemsCount = itemRows.length;

    const filesHtml = fileAttachments.map((attachment, fileIndex) => {
        const fileName = attachment.file.name;
        const fileSize = attachment.isExisting ? 
            '<span class="badge bg-info">Mevcut Dosya</span>' : 
            (attachment.file.size / 1024).toFixed(2) + ' KB';
        const displayName = attachment.description || fileName;
        
        // Build checkboxes for attachment targets
        let targetsHtml = `
            <div class="mb-2">
                <small class="text-muted d-block mb-2">
                    <i class="fas fa-link me-1"></i>Bu dosyayı ekle:
                </small>
                <div class="d-flex flex-wrap gap-3">
                    <div class="form-check">
                        <input class="form-check-input" type="checkbox" 
                               id="attach-request-${fileIndex}" 
                               data-file-index="${fileIndex}" 
                               data-target="request"
                               ${attachment.attachTo.includes('request') ? 'checked' : ''}>
                        <label class="form-check-label" for="attach-request-${fileIndex}">
                            <i class="fas fa-file-alt me-1"></i>Talep
                        </label>
                    </div>
        `;

        // Add checkboxes for each item
        for (let i = 0; i < itemsCount; i++) {
            const itemSpecifications = document.querySelector(`.planning-item-row[data-index="${i}"] input[name="item_specifications"]`)?.value?.trim() || '';
            const itemCode = document.querySelector(`.planning-item-row[data-index="${i}"] input[name="item_code"]`)?.value?.trim() || '';
            const itemName = document.querySelector(`.planning-item-row[data-index="${i}"] input[name="item_name"]`)?.value?.trim() || '';
            const displayName = itemSpecifications || itemCode || itemName || `Ürün ${i + 1}`;
            
            targetsHtml += `
                    <div class="form-check">
                        <input class="form-check-input" type="checkbox" 
                               id="attach-item-${fileIndex}-${i}" 
                               data-file-index="${fileIndex}" 
                               data-target="${i}"
                               ${attachment.attachTo.includes(i) ? 'checked' : ''}>
                        <label class="form-check-label" for="attach-item-${fileIndex}-${i}">
                            <i class="fas fa-box me-1"></i>${displayName}
                        </label>
                    </div>
            `;
        }

        targetsHtml += `
                </div>
            </div>
        `;

        return `
            <div class="card mb-3 ${attachment.isExisting ? 'border-info' : ''}" data-file-index="${fileIndex}">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <div class="flex-grow-1">
                            <h6 class="mb-1">
                                <i class="fas fa-file me-2"></i>${displayName}
                                ${attachment.isExisting ? '<span class="badge bg-info ms-2">Departman Talebinden</span>' : ''}
                            </h6>
                            <small class="text-muted">${fileSize} - ${fileName}</small>
                        </div>
                        <div class="btn-group">
                            ${attachment.isExisting ? `
                                <button type="button" class="btn btn-sm btn-outline-primary" onclick="viewExistingFile(${fileIndex})">
                                    <i class="fas fa-eye"></i>
                                </button>
                            ` : ''}
                            <button type="button" class="btn btn-sm btn-outline-danger" onclick="removePlanningFile(${fileIndex})">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                    <div class="mb-2">
                        <label class="form-label small">
                            <i class="fas fa-align-left me-1"></i>Açıklama
                        </label>
                        <input type="text" class="form-control form-control-sm" 
                               id="file-desc-${fileIndex}" 
                               placeholder="Dosya açıklaması (opsiyonel)"
                               value="${attachment.description}"
                               oninput="updateFileDescription(${fileIndex}, this.value)">
                    </div>
                    ${targetsHtml}
                </div>
            </div>
        `;
    }).join('');

    filesListContainer.innerHTML = filesHtml;

    // Add event listeners for checkboxes
    filesListContainer.querySelectorAll('input[type="checkbox"][data-file-index]').forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            updateFileAttachTo(parseInt(this.dataset.fileIndex), this.dataset.target, this.checked);
        });
    });
    
    // Add event listeners to all item specification fields to update file list when descriptions change
    document.querySelectorAll('.planning-item-row input[name="item_specifications"]').forEach(specsInput => {
        // Check if listener already added (using data attribute)
        if (!specsInput.dataset.hasFileListListener) {
            specsInput.dataset.hasFileListListener = 'true';
            specsInput.addEventListener('input', () => {
                renderFilesList(); // Update file list to reflect new item description
            });
        }
    });
}

// Update file attachment targets
function updateFileAttachTo(fileIndex, target, checked) {
    if (fileIndex < 0 || fileIndex >= fileAttachments.length) return;

    const attachment = fileAttachments[fileIndex];
    const targetValue = target === 'request' ? 'request' : parseInt(target);

    if (checked) {
        if (!attachment.attachTo.includes(targetValue)) {
            attachment.attachTo.push(targetValue);
        }
    } else {
        attachment.attachTo = attachment.attachTo.filter(t => t !== targetValue);
    }

    // Validate that at least one target is selected
    if (attachment.attachTo.length === 0) {
        // Re-check the checkbox if no targets remain
        const checkbox = document.querySelector(`input[data-file-index="${fileIndex}"][data-target="${target}"]`);
        if (checkbox) {
            checkbox.checked = true;
            attachment.attachTo.push(targetValue);
        }
    }
}

// Update file description
function updateFileDescription(fileIndex, description) {
    if (fileIndex >= 0 && fileIndex < fileAttachments.length) {
        fileAttachments[fileIndex].description = description;
        // Update the display immediately
        const fileCard = document.querySelector(`.card[data-file-index="${fileIndex}"]`);
        if (fileCard) {
            const titleElement = fileCard.querySelector('h6');
            if (titleElement) {
                const attachment = fileAttachments[fileIndex];
                const fileName = attachment.file.name;
                const displayName = description || fileName;
                const badge = attachment.isExisting ? '<span class="badge bg-info ms-2">Departman Talebinden</span>' : '';
                titleElement.innerHTML = `<i class="fas fa-file me-2"></i>${displayName}${badge}`;
            }
        }
    }
}

// Remove file from attachments
function removePlanningFile(fileIndex) {
    if (fileIndex >= 0 && fileIndex < fileAttachments.length) {
        fileAttachments.splice(fileIndex, 1);
        renderFilesList();
    }
}

// View existing file from department request
function viewExistingFile(fileIndex) {
    if (fileIndex >= 0 && fileIndex < fileAttachments.length) {
        const attachment = fileAttachments[fileIndex];
        if (attachment.isExisting && attachment.file.url) {
            const fileName = attachment.file.name;
            const fileExtension = fileName.split('.').pop().toLowerCase();
            const viewer = new FileViewer();
            viewer.setDownloadCallback(async () => {
                await viewer.downloadFile(attachment.file.url, fileName);
            });
            viewer.openFile(attachment.file.url, fileName, fileExtension);
        }
    }
}

// Make functions globally available
window.removePlanningFile = removePlanningFile;
window.updateFileDescription = updateFileDescription;
window.viewExistingFile = viewExistingFile;

// Update files list when items are added/removed
const originalAddPlanningItem = addPlanningItem;
addPlanningItem = function() {
    originalAddPlanningItem();
    renderFilesList(); // Refresh files list to show new item checkboxes
};

const originalRemovePlanningItem = removePlanningItem;
removePlanningItem = function(index) {
    originalRemovePlanningItem(index);
    // Update attachTo arrays to remove references to deleted item and adjust indices
    fileAttachments.forEach(attachment => {
        attachment.attachTo = attachment.attachTo
            .filter(t => {
                // Remove reference to deleted item
                if (typeof t === 'number' && t === index) {
                    return false;
                }
                return true;
            })
            .map(t => {
                // Decrement indices greater than deleted index
                if (typeof t === 'number' && t > index) {
                    return t - 1;
                }
                return t;
            });
    });
    renderFilesList(); // Refresh files list
};
window.removePlanningItem = removePlanningItem;

// Transfer department request function - opens create planning request modal with pre-filled data
async function transferDepartmentRequest(requestId) {
    try {
        // Fetch the department request
        const departmentRequest = await getDepartmentRequest(requestId);
        if (!departmentRequest) {
            showNotification('Departman talebi bulunamadı', 'error');
            return;
        }

        // Close details modal if it's open
        const departmentRequestDetailsModal = getDepartmentRequestDetailsModal();
        if (departmentRequestDetailsModal) {
            departmentRequestDetailsModal.hide();
        }

        // Open create planning request modal with department request data
        showCreatePlanningRequestModal(departmentRequest);
    } catch (error) {
        console.error('Error transferring department request:', error);
        showNotification('Departman talebi yüklenirken hata oluştu: ' + error.message, 'error');
    }
}

// Show export confirmation modal
function showExportConfirmationModal(createdRequest) {
    if (!exportConfirmationModal) {
        exportConfirmationModal = new ConfirmationModal('export-confirmation-modal-container', {
            title: 'CSV Dışa Aktarma',
            icon: 'fas fa-file-csv',
            confirmText: 'Evet, Dışa Aktar',
            cancelText: 'İptal',
            confirmButtonClass: 'btn-success'
        });
    }

    const requestNumber = createdRequest.request_number || '-';
    const itemsCount = createdRequest.items?.length || 0;

    exportConfirmationModal.show({
        title: 'CSV Dışa Aktarma',
        message: 'Ürünleri CSV olarak dışa aktarmak istiyor musunuz?',
        description: `Planlama talebi "${requestNumber}" başarıyla oluşturuldu. ${itemsCount} ürün bulunmaktadır.`,
        details: `
            <div class="row g-2">
                <div class="col-6">
                    <strong>Talep No:</strong> #${createdRequest.id}
                </div>
                <div class="col-6">
                    <strong>Talep Numarası:</strong> ${requestNumber}
                </div>
                <div class="col-6">
                    <strong>Ürün Sayısı:</strong> ${itemsCount} ürün
                </div>
                <div class="col-6">
                    <strong>Başlık:</strong> ${createdRequest.title || '-'}
                </div>
            </div>
        `,
        confirmText: 'Evet, Dışa Aktar',
        onConfirm: () => {
            exportItemsToCSV(createdRequest);
        }
    });
}

// Excel import functionality
let excelImportData = null; // Store parsed Excel data

function setupExcelImportListeners() {
    const previewBtn = document.getElementById('preview-excel-import-btn');
    const clearBtn = document.getElementById('clear-excel-import-btn');
    const importBtn = document.getElementById('import-excel-items-btn');
    const confirmMappingBtn = document.getElementById('confirm-excel-mapping-btn');

    if (previewBtn) {
        previewBtn.addEventListener('click', previewExcelImport);
    }
    if (clearBtn) {
        clearBtn.addEventListener('click', clearExcelImport);
    }
    if (importBtn) {
        importBtn.addEventListener('click', importExcelItems);
    }
    if (confirmMappingBtn) {
        confirmMappingBtn.addEventListener('click', confirmExcelColumnMapping);
    }
}

function previewExcelImport() {
    const fileInput = document.getElementById('excel-file-input');
    const file = fileInput.files[0];
    
    if (!file) {
        showNotification('Lütfen bir dosya seçin', 'warning');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            let jsonData;
            
            if (file.name.toLowerCase().endsWith('.csv')) {
                // Handle CSV files
                const csvText = e.target.result;
                jsonData = parseCSV(csvText);
            } else {
                // Handle Excel files
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            }

            if (jsonData.length < 2) {
                showNotification('Dosya boş veya geçersiz format', 'error');
                return;
            }

            processExcelData(jsonData);
        } catch (error) {
            console.error('Dosya okuma hatası:', error);
            showNotification('Dosya okunamadı. Lütfen geçerli bir Excel veya CSV dosyası seçin', 'error');
        }
    };
    
    if (file.name.toLowerCase().endsWith('.csv')) {
        reader.readAsText(file, 'UTF-8');
    } else {
        reader.readAsArrayBuffer(file);
    }
}

function parseCSV(csvText) {
    const lines = csvText.split('\n');
    const result = [];
    
    lines.forEach(line => {
        if (line.trim()) {
            // Handle both comma and semicolon separators
            const values = line.includes(';') ? line.split(';') : line.split(',');
            result.push(values.map(value => value.trim().replace(/^["']|["']$/g, '')));
        }
    });
    
    return result;
}

function processExcelData(data) {
    const headers = data[0];
    const dataRows = data.slice(1);
    
    // Auto-detect column mappings based on user's requirements
    const columnMapping = detectExcelColumnMapping(headers, dataRows);
    
    // Validate required columns
    const missingColumns = validateRequiredExcelColumns(columnMapping);
    
    if (missingColumns.length > 0) {
        showExcelColumnMappingModal(headers, columnMapping, dataRows);
        return;
    }
    
    // Always show mapping modal for manual verification/adjustment
    showExcelColumnMappingModal(headers, columnMapping, dataRows);
}

function detectExcelColumnMapping(headers, dataRows = []) {
    const mapping = {
        item_code: -1,      // Kodu → ürün kodu
        item_name: -1,      // ismi → ürün adı
        job_no: -1,         // srm.mrk. → iş no
        item_description: -1, // Açıklama 1 → Ürün Açıklaması
        specifications: -1,  // Açıklama 2 → Özellikler
        quantity: -1,      // Miktar → Miktar
        unit: -1            // Birim → Birim
    };

    // Column keywords based on user's requirements (all lowercase, normalized)
    const columnKeywords = {
        item_code: ['kodu', 'kod', 'code', 'urun kodu', 'stok kodu', 'malzeme kodu', 'product code', 'item code'],
        item_name: ['ismi', 'isim', 'name', 'urun adi', 'urun adı', 'malzeme adi', 'malzeme adı', 'product name', 'item name'],
        job_no: ['srm.mrk.', 'srm mrk', 'srm.mrk', 'srm mrk.', 'is no', 'job no', 'job number', 'is kodu', 'work no'],
        item_description: ['aciklama 1', 'aciklama1', 'description 1', 'urun aciklamasi', 'urun açıklaması', 'aciklama', 'description'],
        specifications: ['aciklama 2', 'aciklama2', 'description 2', 'ozellikler', 'specifications', 'specs', 'ozellik'],
        quantity: ['miktar', 'quantity', 'qty', 'adet', 'sayi', 'number', 'amount'],
        unit: ['birim', 'unit', 'olcu', 'measure', 'uom', 'measurement']
    };

    headers.forEach((header, index) => {
        if (!header) return;
        
        // Normalize the header for comparison (case-insensitive, Turkish character handling)
        const headerNormalized = normalizeTurkish(header.toString().trim());
        
        // Try exact matches and partial matches
        for (const [field, keywords] of Object.entries(columnKeywords)) {
            if (mapping[field] === -1) {
                for (const keyword of keywords) {
                    const keywordNormalized = normalizeTurkish(keyword);
                    
                    // Exact match (case-insensitive, Turkish normalized)
                    if (headerNormalized === keywordNormalized) {
                        mapping[field] = index;
                        break;
                    }
                    // Partial match (contains keyword)
                    if (headerNormalized.includes(keywordNormalized) || keywordNormalized.includes(headerNormalized)) {
                        mapping[field] = index;
                        break;
                    }
                }
            }
        }
    });

    return mapping;
}

function validateRequiredExcelColumns(mapping) {
    const required = ['item_code', 'item_name', 'job_no', 'quantity', 'unit'];
    return required.filter(field => mapping[field] === -1);
}

function showExcelColumnMappingModal(headers, detectedMapping, dataRows) {
    const mappingContainer = document.getElementById('excel-column-mapping-container');
    mappingContainer.innerHTML = '';
    
    const requiredFields = [
        { key: 'item_code', label: 'Ürün Kodu (Kodu)', required: true },
        { key: 'item_name', label: 'Ürün Adı (ismi)', required: true },
        { key: 'job_no', label: 'İş No (srm.mrk.)', required: true },
        { key: 'quantity', label: 'Miktar', required: true },
        { key: 'unit', label: 'Birim', required: true },
        { key: 'item_description', label: 'Ürün Açıklaması (Açıklama 1)', required: false },
        { key: 'specifications', label: 'Özellikler (Açıklama 2)', required: false }
    ];

    requiredFields.forEach(field => {
        const fieldDiv = document.createElement('div');
        fieldDiv.className = 'mb-3';
        const isDetected = detectedMapping[field.key] !== -1;
        const detectedText = isDetected ? ` (Otomatik algılandı: "${headers[detectedMapping[field.key]] || 'Bilinmeyen'}")` : '';
        
        fieldDiv.innerHTML = `
            <label class="form-label">
                ${field.label} ${field.required ? '<span class="text-danger">*</span>' : ''}
                ${isDetected ? `<span class="text-success">${detectedText}</span>` : ''}
            </label>
            <select class="form-select excel-column-mapping-select" data-field="${field.key}">
                <option value="">Seçiniz</option>
                ${headers.map((header, index) => 
                    `<option value="${index}" ${detectedMapping[field.key] === index ? 'selected' : ''}>
                        ${header || `Sütun ${index + 1}`}
                    </option>`
                ).join('')}
            </select>
        `;
        mappingContainer.appendChild(fieldDiv);
    });

    // Show mapping modal
    const mappingModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('excel-column-mapping-modal'));
    mappingModal.show();

    // Store data for later processing
    excelImportData = { headers, dataRows };
}

function confirmExcelColumnMapping() {
    const selects = document.querySelectorAll('.excel-column-mapping-select');
    const mapping = {};

    selects.forEach(select => {
        const field = select.dataset.field;
        const value = select.value ? parseInt(select.value) : -1;
        mapping[field] = value;
    });

    // Validate required mappings
    const missingRequired = ['item_code', 'item_name', 'job_no', 'quantity', 'unit'].filter(field => mapping[field] === -1);
    if (missingRequired.length > 0) {
        showNotification('Lütfen gerekli alanları eşleştirin', 'error');
        return;
    }

    // Process data with user mapping
    processExcelDataWithMapping(excelImportData.dataRows, mapping, excelImportData.headers);
    
    // Close mapping modal
    const mappingModal = bootstrap.Modal.getInstance(document.getElementById('excel-column-mapping-modal'));
    if (mappingModal) {
        mappingModal.hide();
    }
}

function processExcelDataWithMapping(dataRows, mapping, headers = []) {
    const processedItems = [];
    const errors = [];
    let skippedRows = 0;

    dataRows.forEach((row, index) => {
        if (!row || row.length === 0) {
            skippedRows++;
            return;
        }

        try {
            const item = {
                item_code: getExcelCellValue(row, mapping.item_code),
                item_name: getExcelCellValue(row, mapping.item_name),
                job_no: getExcelCellValue(row, mapping.job_no),
                quantity: parseExcelQuantity(getExcelCellValue(row, mapping.quantity)),
                unit: getExcelCellValue(row, mapping.unit) || 'adet',
                item_description: getExcelCellValue(row, mapping.item_description) || '',
                specifications: getExcelCellValue(row, mapping.specifications) || ''
            };

            // Validate required fields - skip invalid rows instead of stopping
            let isValid = true;
            if (!item.item_code) {
                errors.push(`Satır ${index + 2}: Ürün kodu eksik - satır atlandı`);
                skippedRows++;
                isValid = false;
            }
            if (!item.item_name) {
                errors.push(`Satır ${index + 2}: Ürün adı eksik - satır atlandı`);
                skippedRows++;
                isValid = false;
            }
            if (!item.job_no) {
                errors.push(`Satır ${index + 2}: İş no eksik - satır atlandı`);
                skippedRows++;
                isValid = false;
            }
            if (item.quantity <= 0) {
                errors.push(`Satır ${index + 2}: Geçersiz miktar değeri - satır atlandı`);
                skippedRows++;
                isValid = false;
            }
            if (!item.unit) {
                errors.push(`Satır ${index + 2}: Birim eksik - satır atlandı`);
                skippedRows++;
                isValid = false;
            }

            // If any validation failed, skip this row
            if (!isValid) {
                return;
            }

            processedItems.push(item);
        } catch (error) {
            errors.push(`Satır ${index + 2}: ${error.message} - satır atlandı`);
            skippedRows++;
        }
    });

    // Show results summary
    if (processedItems.length === 0) {
        showExcelImportErrors(errors);
        return;
    }

    // Show summary of processed data
    if (errors.length > 0 || skippedRows > 0) {
        showExcelImportSummary(processedItems.length, errors.length, skippedRows, errors);
    }

    displayExcelImportPreview(processedItems);
}

function getExcelCellValue(row, columnIndex) {
    if (columnIndex === -1 || columnIndex >= row.length) return '';
    const value = row[columnIndex];
    return value ? value.toString().trim() : '';
}

function parseExcelQuantity(value) {
    if (!value) return 0;
    const parsed = parseFloat(value.toString().replace(',', '.'));
    return isNaN(parsed) ? 0 : parsed;
}

function normalizeTurkish(str) {
    if (!str) return '';
    // First convert to lowercase (this handles most cases)
    let normalized = str.toString().toLowerCase();
    
    // Then handle Turkish-specific character normalization
    // This ensures İ (capital I with dot) becomes 'i', and ı (lowercase i without dot) becomes 'i'
    normalized = normalized
        .replace(/ı/g, 'i')
        .replace(/İ/g, 'i')  // Capital I with dot
        .replace(/ğ/g, 'g')
        .replace(/Ğ/g, 'g')
        .replace(/ü/g, 'u')
        .replace(/Ü/g, 'u')
        .replace(/ş/g, 's')
        .replace(/Ş/g, 's')
        .replace(/ö/g, 'o')
        .replace(/Ö/g, 'o')
        .replace(/ç/g, 'c')
        .replace(/Ç/g, 'c');
    
    // Remove extra spaces
    normalized = normalized.trim().replace(/\s+/g, ' ');
    
    return normalized;
}

function showExcelImportErrors(errors) {
    const errorContainer = document.getElementById('excel-import-errors');
    errorContainer.innerHTML = `
        <div class="alert alert-danger">
            <h6>İçe aktarma hataları:</h6>
            <ul class="mb-0">
                ${errors.map(error => `<li>${error}</li>`).join('')}
            </ul>
        </div>
    `;
    errorContainer.style.display = 'block';
}

function showExcelImportSummary(processedCount, errorCount, skippedCount, errors) {
    const errorContainer = document.getElementById('excel-import-errors');
    let html = `
        <div class="alert alert-info">
            <h6>İçe Aktarma Özeti:</h6>
            <ul class="mb-0">
                <li><strong>Başarıyla işlenen:</strong> ${processedCount} satır</li>
                <li><strong>Atlanan satırlar:</strong> ${skippedCount} satır</li>
                <li><strong>Hatalı satırlar:</strong> ${errorCount} satır</li>
            </ul>
        </div>
    `;
    
    if (errors.length > 0) {
        html += `
            <div class="alert alert-warning">
                <h6>Atlanan Satırlar:</h6>
                <ul class="mb-0">
                    ${errors.map(error => `<li>${error}</li>`).join('')}
                </ul>
            </div>
        `;
    }
    
    errorContainer.innerHTML = html;
    errorContainer.style.display = 'block';
}

function displayExcelImportPreview(processedItems) {
    const previewDiv = document.getElementById('excel-import-preview');
    const tbody = document.getElementById('excel-preview-tbody');
    const importBtn = document.getElementById('import-excel-items-btn');
    const errorContainer = document.getElementById('excel-import-errors');
    
    tbody.innerHTML = '';
    errorContainer.style.display = 'none';
    
    processedItems.forEach((item, index) => {
        const tr = document.createElement('tr');
        tr.setAttribute('data-item-index', index);
        tr.innerHTML = `
            <td>${index + 1}</td>
            <td>${item.item_code}</td>
            <td>${item.item_name}</td>
            <td>${item.item_description || '-'}</td>
            <td>${item.job_no}</td>
            <td>${item.quantity}</td>
            <td>${item.unit}</td>
            <td>${item.specifications || '-'}</td>
            <td><span class="badge bg-success">Geçerli</span></td>
            <td>
                <button class="btn btn-outline-danger btn-sm" onclick="deleteExcelPreviewItem(${index})">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    previewDiv.style.display = 'block';
    importBtn.disabled = false;
    
    // Update the preview title to show count
    const previewTitle = previewDiv.querySelector('h6');
    if (previewTitle) {
        previewTitle.textContent = `Önizleme (${processedItems.length} ürün)`;
    }
    
    // Update import button text to show count
    if (importBtn) {
        importBtn.innerHTML = `<i class="fas fa-upload me-1"></i>${processedItems.length} Ürünü İçe Aktar`;
    }
    
    // Store the processed items for import
    excelImportData.processedItems = processedItems;
}

function deleteExcelPreviewItem(index) {
    if (!excelImportData || !excelImportData.processedItems || 
        index < 0 || index >= excelImportData.processedItems.length) {
        return;
    }
    
    // Remove the item from the parsed data
    excelImportData.processedItems.splice(index, 1);
    
    // Re-render the preview table with updated data
    displayExcelImportPreview(excelImportData.processedItems);
    
    // Update the import button state
    const importBtn = document.getElementById('import-excel-items-btn');
    if (excelImportData.processedItems.length === 0) {
        importBtn.disabled = true;
        importBtn.innerHTML = '<i class="fas fa-upload me-1"></i>Ürünleri İçe Aktar';
    }
    
    showNotification('Satır başarıyla silindi', 'success');
}

function clearExcelImport() {
    document.getElementById('excel-file-input').value = '';
    document.getElementById('excel-import-preview').style.display = 'none';
    document.getElementById('excel-import-errors').style.display = 'none';
    document.getElementById('import-excel-items-btn').disabled = true;
    excelImportData = null;
}

function importExcelItems() {
    if (!excelImportData || !excelImportData.processedItems) return;
    
    const container = document.getElementById('planning-items-container');
    if (!container) return;

    let addedCount = 0;
    
    excelImportData.processedItems.forEach(item => {
        const itemIndex = container.children.length;
        
        const itemHtml = `
            <div class="planning-item-row mb-2" data-index="${itemIndex}">
                <div class="row g-2">
                    <div class="col-md-2">
                        <input type="text" class="form-control form-control-sm" name="item_code" placeholder="Ürün kodu veya ID" value="${escapeHtml(item.item_code)}" required>
                    </div>
                    <div class="col-md-2">
                        <input type="text" class="form-control form-control-sm" name="item_name" placeholder="Ürün adı" value="${escapeHtml(item.item_name)}">
                    </div>
                    <div class="col-md-2">
                        <input type="text" class="form-control form-control-sm" name="item_description" placeholder="Ürün açıklaması" value="${escapeHtml(item.item_description)}">
                    </div>
                    <div class="col-md-1">
                        <input type="text" class="form-control form-control-sm" name="job_no" placeholder="İş no" value="${escapeHtml(item.job_no)}" required>
                    </div>
                    <div class="col-md-1">
                        <input type="number" class="form-control form-control-sm" name="item_quantity" placeholder="Miktar" step="0.01" min="0.01" value="${item.quantity}" required>
                    </div>
                    <div class="col-md-1">
                        <select class="form-control form-control-sm" name="item_unit">
                            ${UNIT_CHOICES.map(unit => `<option value="${unit.value}" ${unit.value === item.unit ? 'selected' : ''}>${unit.label}</option>`).join('')}
                        </select>
                    </div>
                    <div class="col-md-2">
                        <input type="text" class="form-control form-control-sm" name="item_specifications" placeholder="Özellikler" value="${escapeHtml(item.specifications)}">
                    </div>
                    <div class="col-md-1">
                        <button type="button" class="btn btn-outline-danger btn-sm w-100" onclick="removePlanningItem(${itemIndex})" title="Ürünü Kaldır">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        container.insertAdjacentHTML('beforeend', itemHtml);
        
        // Add event listener to item specifications field to update file list when description changes
        const itemRow = container.querySelector(`.planning-item-row[data-index="${itemIndex}"]`);
        if (itemRow) {
            const specsInput = itemRow.querySelector('input[name="item_specifications"]');
            if (specsInput) {
                specsInput.dataset.hasFileListListener = 'true';
                specsInput.addEventListener('input', () => {
                    renderFilesList(); // Update file list to reflect new item description
                });
            }
        }
        
        addedCount++;
    });
    
    // Update file list to show new items
    renderFilesList();
    
    // Close the Excel import modal
    const excelModal = bootstrap.Modal.getInstance(document.getElementById('excel-import-modal'));
    if (excelModal) {
        excelModal.hide();
    }
    
    // Clear import data
    clearExcelImport();
    
    showNotification(`${addedCount} ürün başarıyla içe aktarıldı`, 'success');
}

// Make functions globally available
window.deleteExcelPreviewItem = deleteExcelPreviewItem;

// Make functions globally available for onclick handlers
window.viewDepartmentRequestDetails = viewDepartmentRequestDetails;
window.transferDepartmentRequest = transferDepartmentRequest;

