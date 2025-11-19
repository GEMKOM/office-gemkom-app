import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { TableComponent } from '../../../components/table/table.js';
import { EditModal } from '../../../components/edit-modal/edit-modal.js';
import {
    getDepartmentRequest,
    getApprovedDepartmentRequests,
    getCompletedDepartmentRequests,
    markDepartmentRequestTransferred
} from '../../../apis/planning/departmentRequests.js';
import { createPlanningRequest } from '../../../apis/planning/planningRequests.js';
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
        showCreateButton: 'block',
        createButtonText: 'Yeni Planlama Talebi',
        showExportButton: 'none',
        showRefreshButton: 'none',
        onBackClick: () => window.location.href = '/planning',
        onCreateClick: () => showCreatePlanningRequestModal()
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

// Create planning request modal instance
let createPlanningRequestModal = null;

// Show create planning request modal
function showCreatePlanningRequestModal() {
    if (!createPlanningRequestModal) {
        // Initialize modal if not already created
        createPlanningRequestModal = new EditModal('create-planning-request-modal-container', {
            title: 'Yeni Planlama Talebi Oluştur',
            icon: 'fas fa-plus-circle',
            saveButtonText: 'Oluştur',
            size: 'fullscreen'
        });
    }

    // Clear previous form data
    createPlanningRequestModal.clearAll();
    // Clear file attachments
    fileAttachments = [];
    const priorityOptions = [
        { value: 'low', label: 'Düşük' },
        { value: 'normal', label: 'Normal' },
        { value: 'high', label: 'Yüksek' },
        { value: 'urgent', label: 'Acil' }
    ];

    // Add basic information section
    createPlanningRequestModal.addSection({
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
                required: true,
                icon: 'fas fa-heading',
                colSize: 12,
                help: 'Planlama talebinin başlığı (zorunlu)'
            },
            {
                id: 'description',
                name: 'description',
                label: 'Açıklama',
                type: 'textarea',
                placeholder: 'Planlama talebi açıklamasını girin',
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
        title: 'Talep Detayları',
        icon: 'fas fa-clipboard-list',
        iconColor: 'text-success',
        fields: [
            {
                id: 'priority',
                name: 'priority',
                label: 'Öncelik',
                type: 'dropdown',
                value: 'normal',
                required: false,
                icon: 'fas fa-exclamation-triangle',
                colSize: 6,
                help: 'Talebin öncelik seviyesi',
                options: priorityOptions
            },
            {
                id: 'needed_date',
                name: 'needed_date',
                label: 'İhtiyaç Tarihi',
                type: 'date',
                value: '',
                required: false,
                icon: 'fas fa-calendar-alt',
                colSize: 6,
                help: 'Talebin ihtiyaç duyulduğu tarih (opsiyonel)'
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
                const itemUnit = row.querySelector('input[name="item_unit"]')?.value?.trim() || 'adet';
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

                // Item must have either item_id or item_code
                if (!itemId && !itemCode) {
                    // If no item_id or item_code, we need item_name to create a new item
                    if (!itemName) {
                        showNotification('Ürünler için ürün kodu/ID veya ürün adı gereklidir', 'error');
                        throw new Error('Item code/ID or item name required');
                    }
                }

                // Build item object
                const itemData = {
                    job_no: jobNo,
                    quantity: parseFloat(itemQuantity)
                };

                // Add item identifier (item_id takes precedence over item_code)
                if (itemId) {
                    itemData.item_id = itemId;
                } else if (itemCode) {
                    itemData.item_code = itemCode;
                }

                // Add optional fields
                if (itemName) {
                    itemData.item_name = itemName;
                }
                if (itemUnit) {
                    itemData.item_unit = itemUnit;
                }
                if (itemSpecifications) {
                    itemData.specifications = itemSpecifications;
                }

                items.push(itemData);
            }

            // Prepare files array with attach_to information
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

                files.push({
                    file: attachment.file,
                    description: attachment.description || '',
                    attach_to: attachment.attachTo
                });
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

            // Create the planning request
            const createdRequest = await createPlanningRequest(requestData);

            // Show success notification
            showNotification('Planlama talebi başarıyla oluşturuldu', 'success');

            // Close modal
            createPlanningRequestModal.hide();

            // Optionally redirect to the planning request detail page or refresh
            // For now, just show success message
            console.log('Created planning request:', createdRequest);
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

    // Setup items section with custom HTML after rendering
    setTimeout(() => {
        setupItemsSection();
        setupAttachmentsSection();
    }, 100);

    // Show the modal
    createPlanningRequestModal.show();
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
                <button type="button" class="btn btn-sm btn-outline-danger" id="clear-planning-items-btn">
                    <i class="fas fa-trash-alt me-1"></i>Tümünü Temizle
                </button>
            </div>
        </div>
        <div class="row g-2 mb-2">
            <div class="col-md-2">
                <small class="text-muted fw-bold">
                    <i class="fas fa-barcode me-1"></i>Ürün Kodu/ID
                </small>
            </div>
            <div class="col-md-2">
                <small class="text-muted fw-bold">
                    <i class="fas fa-tag me-1"></i>Ürün Adı
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
            <div class="col-md-4">
                <small class="text-muted fw-bold">
                    <i class="fas fa-align-left me-1"></i>Özellikler/Açıklama
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
                    <input type="text" class="form-control form-control-sm" name="item_code" placeholder="Ürün kodu veya ID">
                </div>
                <div class="col-md-2">
                    <input type="text" class="form-control form-control-sm" name="item_name" placeholder="Ürün adı">
                </div>
                <div class="col-md-1">
                    <input type="text" class="form-control form-control-sm" name="job_no" placeholder="İş no" required>
                </div>
                <div class="col-md-1">
                    <input type="number" class="form-control form-control-sm" name="item_quantity" placeholder="Miktar" step="0.01" min="0.01" value="1" required>
                </div>
                <div class="col-md-1">
                    <input type="text" class="form-control form-control-sm" name="item_unit" placeholder="Birim" value="adet">
                </div>
                <div class="col-md-4">
                    <input type="text" class="form-control form-control-sm" name="item_specifications" placeholder="Özellikler/Açıklama">
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

// File attachments state
let fileAttachments = []; // Array of { file: File, description: string, attachTo: Array }

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
        const fileSize = (attachment.file.size / 1024).toFixed(2) + ' KB';
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
            <div class="card mb-3" data-file-index="${fileIndex}">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <div class="flex-grow-1">
                            <h6 class="mb-1">
                                <i class="fas fa-file me-2"></i>${displayName}
                            </h6>
                            <small class="text-muted">${fileSize} - ${fileName}</small>
                        </div>
                        <button type="button" class="btn btn-sm btn-outline-danger" onclick="removePlanningFile(${fileIndex})">
                            <i class="fas fa-trash"></i>
                        </button>
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
                const fileName = fileAttachments[fileIndex].file.name;
                const displayName = description || fileName;
                titleElement.innerHTML = `<i class="fas fa-file me-2"></i>${displayName}`;
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

// Make functions globally available
window.removePlanningFile = removePlanningFile;
window.updateFileDescription = updateFileDescription;

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

// Make functions globally available for onclick handlers
window.viewDepartmentRequestDetails = viewDepartmentRequestDetails;
window.transferDepartmentRequest = transferDepartmentRequest;

