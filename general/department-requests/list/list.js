import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { TableComponent } from '../../../components/table/table.js';
import { EditModal } from '../../../components/edit-modal/edit-modal.js';
import { DisplayModal } from '../../../components/display-modal/display-modal.js';
import { ConfirmationModal } from '../../../components/confirmation-modal/confirmation-modal.js';
import { FileAttachments } from '../../../components/file-attachments/file-attachments.js';
import { FileViewer } from '../../../components/file-viewer/file-viewer.js';
import { initRouteProtection } from '../../../apis/routeProtection.js';
import {
    createDepartmentRequest,
    updateDepartmentRequest,
    deleteDepartmentRequest,
    getDepartmentRequests,
    getDepartmentRequest
} from '../../../apis/planning/departmentRequests.js';
import { formatDate } from '../../../apis/formatters.js';

// State management
let currentPage = 1;
let currentSortField = 'id';
let currentSortDirection = 'desc';
let requests = [];
let totalRequests = 0;
let isLoading = false;
let requestsTable = null;
let createEditModal = null;
let detailsModal = null;
let deleteModal = null;
let currentRequest = null;
let isEditMode = false;

// Priority options
const priorityOptions = [
    { value: 'normal', label: 'Normal' },
    { value: 'urgent', label: 'Acil' },
    { value: 'critical', label: 'Kritik' }
];

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    // Initialize route protection
    if (!initRouteProtection()) {
        return;
    }

    await initNavbar();

    // Initialize header component
    const header = new HeaderComponent({
        title: 'Tüm Departman Talepleri',
        subtitle: 'Departman taleplerinin yönetimi ve takibi',
        icon: 'boxes',
        showBackButton: 'block',
        showCreateButton: 'block',
        showExportButton: 'none',
        showRefreshButton: 'block',
        createButtonText: 'Yeni Talep Oluştur',
        refreshButtonText: 'Yenile',
        onBackClick: () => window.location.href = '/general/department-requests',
        onCreateClick: showCreateModal,
        onRefreshClick: () => {
            currentPage = 1;
            loadRequests();
        }
    });

    // Initialize modals
    initializeModals();

    // Initialize table component
    initializeTableComponent();

    // Load initial data
    await loadRequests();
});

function initializeModals() {
    // Initialize create/edit modal
    createEditModal = new EditModal('create-edit-department-request-modal-container', {
        title: 'Yeni Departman Talebi',
        icon: 'fas fa-plus-circle',
        size: 'xl',
        saveButtonText: 'Oluştur'
    });

    // Initialize details modal
    detailsModal = new DisplayModal('department-request-details-modal-container', {
        title: 'Departman Talebi Detayları',
        icon: 'fas fa-boxes',
        size: 'xl',
        showEditButton: false
    });

    // Initialize delete confirmation modal
    deleteModal = new ConfirmationModal('delete-confirmation-modal-container', {
        title: 'Departman Talebini Sil',
        icon: 'fas fa-trash-alt',
        message: 'Bu departman talebini silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.',
        confirmText: 'Evet, Sil',
        cancelText: 'İptal',
        confirmButtonClass: 'btn-danger'
    });

    // Setup delete modal callback
    deleteModal.setOnConfirm(async () => {
        if (currentRequest && currentRequest.id) {
            try {
                await deleteDepartmentRequest(currentRequest.id);
                showNotification('Departman talebi başarıyla silindi', 'success');
                deleteModal.hide();
                await loadRequests();
            } catch (error) {
                console.error('Error deleting request:', error);
                showNotification('Departman talebi silinirken hata oluştu: ' + error.message, 'error');
            }
        }
    });

    // Setup details modal edit button callback
    detailsModal.onEditCallback(() => {
        if (currentRequest) {
            showEditModal(currentRequest);
        }
    });
}

function initializeTableComponent() {
    requestsTable = new TableComponent('department-requests-table-container', {
        title: 'Departman Talepleri',
        icon: 'fas fa-boxes',
        iconColor: 'text-primary',
        columns: [
            {
                field: 'id',
                label: 'Talep No',
                sortable: true,
                formatter: (value) => `<span style="font-weight: 700; color: #0d6efd; font-family: 'Courier New', monospace; font-size: 1rem; background: rgba(13, 110, 253, 0.1); padding: 0.25rem 0.5rem; border-radius: 4px; border: 1px solid rgba(13, 110, 253, 0.2);">${value || '-'}</span>`
            },
            {
                field: 'title',
                label: 'Başlık',
                sortable: true,
                formatter: (value) => `<div style="font-weight: 500; color: #212529;">${value || '-'}</div>`
            },
            {
                field: 'department',
                label: 'Departman',
                sortable: true,
                formatter: (value, row) => {
                    const departmentLabel = row.department_label || formatDepartmentName(value) || '-';
                    return `<div style="color: #495057; font-weight: 500;">${departmentLabel}</div>`;
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
                formatter: (value) => `<div style="color: #495057; font-weight: 500;">${value || 0} ürün</div>`
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
                onClick: (row) => viewRequestDetails(row.id)
            },
            {
                key: 'edit',
                label: 'Düzenle',
                icon: 'fas fa-edit',
                class: 'btn-outline-warning',
                onClick: (row) => showEditModal(row),
                visible: (row) => row.status === 'draft' || row.status === 'submitted'
            },
            {
                key: 'delete',
                label: 'Sil',
                icon: 'fas fa-trash',
                class: 'btn-outline-danger',
                onClick: (row) => showDeleteConfirmation(row),
                visible: (row) => row.status === 'draft' || row.status === 'cancelled'
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
        emptyMessage: 'Departman talebi bulunamadı.',
        emptyIcon: 'fas fa-boxes'
    });
}

async function loadRequests() {
    if (isLoading) return;

    try {
        isLoading = true;
        requestsTable.setLoading(true);

        const filters = {
            page: currentPage,
            page_size: 20,
            ordering: currentSortDirection === 'asc' ? currentSortField : `-${currentSortField}`
        };

        const response = await getDepartmentRequests(filters);

        // Handle paginated response
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

        // Add items_count to each request
        requests = requests.map(request => ({
            ...request,
            items_count: request.items ? request.items.length : 0
        }));

        // Update the table component
        requestsTable.updateData(requests, totalRequests, currentPage);

    } catch (error) {
        console.error('Error loading requests:', error);
        requests = [];
        totalRequests = 0;
        requestsTable.updateData([], 0, 1);
        showNotification('Talepler yüklenirken hata oluştu: ' + error.message, 'error');
    } finally {
        isLoading = false;
        requestsTable.setLoading(false);
    }
}

function showCreateModal() {
    isEditMode = false;
    currentRequest = null;
    
    // Clear and setup the modal
    createEditModal.clearAll();
    createEditModal.setTitle('Yeni Departman Talebi');
    createEditModal.setSaveButtonText('Oluştur');
    
    setupCreateEditForm();
    createEditModal.render();
    createEditModal.show();
}

function showEditModal(request) {
    isEditMode = true;
    currentRequest = request;
    
    // Clear and setup the modal
    createEditModal.clearAll();
    createEditModal.setTitle('Departman Talebini Düzenle');
    createEditModal.setSaveButtonText('Kaydet');
    
    setupCreateEditForm(request);
    createEditModal.render();
    createEditModal.show();
}

function setupCreateEditForm(request = null) {
    // Add basic information section
    createEditModal.addSection({
        title: 'Temel Bilgiler',
        icon: 'fas fa-info-circle',
        iconColor: 'text-primary',
        fields: [
            {
                id: 'title',
                name: 'title',
                label: 'Başlık',
                type: 'text',
                value: request?.title || '',
                required: true,
                icon: 'fas fa-heading',
                colSize: 12,
                helpText: 'Departman talebinin başlığı'
            },
            {
                id: 'description',
                name: 'description',
                label: 'Açıklama',
                type: 'textarea',
                value: request?.description || '',
                required: false,
                icon: 'fas fa-align-left',
                colSize: 12,
                helpText: 'Departman talebi hakkında detaylı açıklama (opsiyonel)',
                rows: 4
            }
        ]
    });

    // Add request details section
    createEditModal.addSection({
        title: 'Talep Detayları',
        icon: 'fas fa-clipboard-list',
        iconColor: 'text-success',
        fields: [
            {
                id: 'priority',
                name: 'priority',
                label: 'Öncelik',
                type: 'dropdown',
                value: request?.priority || 'normal',
                required: false,
                icon: 'fas fa-exclamation-triangle',
                colSize: 6,
                helpText: 'Talebin öncelik seviyesi',
                options: priorityOptions
            },
            {
                id: 'needed_date',
                name: 'needed_date',
                label: 'İhtiyaç Tarihi',
                type: 'date',
                value: request?.needed_date ? formatDateForInput(request.needed_date) : '',
                required: false,
                icon: 'fas fa-calendar-alt',
                colSize: 6,
                helpText: 'Talebin ihtiyaç duyulduğu tarih (opsiyonel)'
            },
            {
                id: 'files',
                name: 'files',
                label: 'Dosyalar',
                type: 'file',
                required: false,
                accept: '*/*',
                multiple: true,
                icon: 'fas fa-paperclip',
                colSize: 12,
                helpText: 'Ek dosyalar (opsiyonel) - Birden fazla dosya seçebilirsiniz'
            }
        ]
    });

    // Add items section
    createEditModal.addSection({
        id: 'items-info',
        title: 'Ürün Bilgileri',
        icon: 'fas fa-boxes',
        iconColor: 'text-success',
        fields: []
    });

    // Set up save callback
    createEditModal.onSaveCallback(async (formData) => {
        await handleSaveRequest(formData);
    });

    // Set up cancel callback
    createEditModal.onCancelCallback(() => {
        currentRequest = null;
        isEditMode = false;
    });

    // Render the modal first
    createEditModal.render();

    // Add items table after rendering
    setTimeout(() => {
        setupItemsSection(request);
    }, 100);
}

function setupItemsSection(request = null) {
    const itemsSection = createEditModal.container.querySelector('[data-section-id="items-info"]');
    if (!itemsSection) return;

    const fieldsContainer = itemsSection.querySelector('.row.g-2');
    if (!fieldsContainer) return;

    const itemsHtml = `
        <div class="d-flex justify-content-between align-items-center mb-2">
            <h6 class="mb-0">Ürün Listesi</h6>
            <div class="d-flex gap-2">
                <button type="button" class="btn btn-sm btn-outline-primary" id="add-item-btn">
                    <i class="fas fa-plus me-1"></i>Ürün Ekle
                </button>
                <button type="button" class="btn btn-sm btn-outline-danger" id="clear-items-btn">
                    <i class="fas fa-trash-alt me-1"></i>Tümünü Temizle
                </button>
            </div>
        </div>
        <div class="row g-2 mb-2">
            <div class="col-md-2">
                <small class="text-muted fw-bold">
                    <i class="fas fa-barcode me-1"></i>Ürün Kodu
                </small>
            </div>
            <div class="col-md-2">
                <small class="text-muted fw-bold">
                    <i class="fas fa-tag me-1"></i>Ürün Adı
                </small>
            </div>
            <div class="col-md-2">
                <small class="text-muted fw-bold">
                    <i class="fas fa-list-ol me-1"></i>Miktar
                </small>
            </div>
            <div class="col-md-2">
                <small class="text-muted fw-bold">
                    <i class="fas fa-ruler me-1"></i>Birim
                </small>
            </div>  
            <div class="col-md-3">
                <small class="text-muted fw-bold">
                    <i class="fas fa-align-left me-1"></i>Açıklama
                </small>
            </div>
            <div class="col-md-1">
                <small class="text-muted fw-bold">İşlem</small>
            </div>
        </div>
        <div id="items-container">
            <!-- Items will be added here -->
        </div>
    `;

    fieldsContainer.insertAdjacentHTML('beforeend', itemsHtml);

    // Add event listener for add item button
    const addItemBtn = createEditModal.container.querySelector('#add-item-btn');
    if (addItemBtn) {
        addItemBtn.addEventListener('click', addItem);
    }

    // Clear all items
    const clearItemsBtn = createEditModal.container.querySelector('#clear-items-btn');
    if (clearItemsBtn) {
        clearItemsBtn.addEventListener('click', () => {
            const container = document.getElementById('items-container');
            if (!container) return;
            container.innerHTML = '';
            showNotification('Tüm ürünler temizlendi', 'info');
        });
    }

    // Load existing items if editing
    if (request && request.items && request.items.length > 0) {
        request.items.forEach(item => {
            addItem();
            const lastRow = document.getElementById('items-container')?.lastElementChild;
            if (lastRow) {
                const codeInput = lastRow.querySelector('input[name="item_code"]');
                const nameInput = lastRow.querySelector('input[name="item_name"]');
                const unitInput = lastRow.querySelector('input[name="item_unit"]');
                const quantityInput = lastRow.querySelector('input[name="item_quantity"]');
                const descInput = lastRow.querySelector('input[name="item_description"]');
                
                if (codeInput) codeInput.value = item.item_code || '';
                if (nameInput) nameInput.value = item.item_name || '';
                if (unitInput) unitInput.value = item.item_unit || '';
                if (quantityInput) quantityInput.value = item.quantity || '1';
                if (descInput) descInput.value = item.description || '';
            }
        });
    }
}

function addItem() {
    const container = document.getElementById('items-container');
    if (!container) {
        return;
    }
    const itemIndex = container.children.length;
    
    const itemHtml = `
        <div class="item-row mb-3" data-index="${itemIndex}">
            <div class="row g-2">
                <div class="col-md-2">
                    <input type="text" class="form-control form-control-sm" name="item_code" placeholder="Ürün kodu">
                </div>
                <div class="col-md-2">
                    <input type="text" class="form-control form-control-sm" name="item_name" placeholder="Ürün adı" required>
                </div>
                <div class="col-md-2">
                    <input type="number" class="form-control form-control-sm" name="item_quantity" placeholder="Miktar" step="1" min="1" value="1">
                </div>
                <div class="col-md-2">
                    <input type="text" class="form-control form-control-sm" name="item_unit" placeholder="Birim">
                </div>
                <div class="col-md-3">
                    <input type="text" class="form-control form-control-sm" name="item_description" placeholder="Açıklama">
                </div>
                <div class="col-md-1">
                    <button type="button" class="btn btn-outline-danger btn-sm w-100" onclick="removeItem(${itemIndex})" title="Ürünü Kaldır">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
    
    container.insertAdjacentHTML('beforeend', itemHtml);
}

function removeItem(index) {
    const itemRow = document.querySelector(`.item-row[data-index="${index}"]`);
    if (itemRow) {
        itemRow.remove();
    }
}

// Make removeItem globally available
window.removeItem = removeItem;

async function handleSaveRequest(formData) {
    try {
        // Get file input
        const fileInput = createEditModal.container.querySelector('input[type="file"]');
        const uploadedFiles = fileInput ? Array.from(fileInput.files) : [];

        // Collect items data from dynamic rows
        const itemRows = document.querySelectorAll('.item-row');
        const items = [];
        for (const row of itemRows) {
            const itemCode = row.querySelector('input[name="item_code"]')?.value?.trim();
            const itemName = row.querySelector('input[name="item_name"]')?.value?.trim();
            const itemUnit = row.querySelector('input[name="item_unit"]')?.value?.trim();
            const itemQuantity = row.querySelector('input[name="item_quantity"]')?.value?.trim();
            const itemDescription = row.querySelector('input[name="item_description"]')?.value?.trim();
            
            // Only add item if at least name is provided
            if (itemName) {
                items.push({
                    item_code: itemCode || null,
                    item_name: itemName,
                    item_unit: itemUnit || null,
                    quantity: itemQuantity ? parseInt(itemQuantity, 10) : 1,
                    description: itemDescription || null
                });
            }
        }

        // Validate that items exist for creation
        if (!isEditMode && items.length === 0) {
            showNotification('En az bir ürün eklemelisiniz', 'error');
            throw new Error('Items required');
        }

        // Prepare request data
        const requestData = {
            title: formData.title,
            description: formData.description || null,
            priority: formData.priority || 'normal',
            needed_date: formData.needed_date || null,
            files: uploadedFiles,
            items: items
        };

        let result;
        if (isEditMode && currentRequest && currentRequest.id) {
            // Update existing request (without files and items for now, as updateDepartmentRequest uses JSON)
            const updateData = {
                title: requestData.title,
                description: requestData.description,
                priority: requestData.priority,
                needed_date: requestData.needed_date
            };
            result = await updateDepartmentRequest(currentRequest.id, updateData);
            showNotification('Departman talebi başarıyla güncellendi', 'success');
        } else {
            // Create new request
            result = await createDepartmentRequest(requestData);
            showNotification('Departman talebi başarıyla oluşturuldu', 'success');
        }

        // Close modal and refresh table
        createEditModal.hide();
        await loadRequests();

    } catch (error) {
        console.error('Error saving request:', error);
        if (error.message !== 'Items required') {
            showNotification('Talep kaydedilirken hata oluştu: ' + error.message, 'error');
        }
        throw error; // Re-throw to prevent modal from closing
    }
}

async function viewRequestDetails(requestId) {
    try {
        currentRequest = await getDepartmentRequest(requestId);
        showRequestDetailsModal(currentRequest);
    } catch (error) {
        console.error('Error viewing request details:', error);
        showNotification('Talep detayları yüklenirken hata oluştu: ' + error.message, 'error');
    }
}

function showRequestDetailsModal(request) {
    if (!detailsModal) return;

    detailsModal.clearData();

    // Add compact basic information section
    detailsModal.addSection({
        title: 'Genel Bilgiler',
        icon: 'fas fa-info-circle',
        iconColor: 'text-primary'
    });

    // Use horizontal layout for compact display
    detailsModal.addField({ 
        label: 'Talep No', 
        value: request.request_number || request.id || '-', 
        colSize: 3,
        layout: 'horizontal'
    });
    detailsModal.addField({ 
        label: 'Durum', 
        value: request.status_label || formatStatus(request.status), 
        colSize: 3,
        layout: 'horizontal'
    });
    detailsModal.addField({ 
        label: 'Öncelik', 
        value: formatPriority(request.priority), 
        colSize: 3,
        layout: 'horizontal'
    });
    detailsModal.addField({ 
        label: 'Departman', 
        value: request.department_label || formatDepartmentName(request.department) || '-', 
        colSize: 3,
        layout: 'horizontal'
    });
    detailsModal.addField({ 
        label: 'Talep Eden', 
        value: request.requestor_full_name || request.requestor_username || '-', 
        colSize: 3,
        layout: 'horizontal'
    });
    detailsModal.addField({ 
        label: 'İhtiyaç Tarihi', 
        value: request.needed_date ? formatDate(request.needed_date) : '-', 
        colSize: 3,
        layout: 'horizontal'
    });
    detailsModal.addField({ 
        label: 'Oluşturulma', 
        value: request.created_at ? formatDate(request.created_at) : '-', 
        colSize: 3,
        layout: 'horizontal'
    });
    detailsModal.addField({ 
        label: 'Gönderilme', 
        value: request.submitted_at ? formatDate(request.submitted_at) : '-', 
        colSize: 3,
        layout: 'horizontal'
    });
    
    // Add description separately if it exists
    if (request.description) {
        detailsModal.addField({ 
            label: 'Açıklama', 
            value: request.description, 
            colSize: 12 
        });
    }

    // Add items section if items exist - using TableComponent
    if (request.items && request.items.length > 0) {
        detailsModal.addCustomSection({
            id: 'items-section',
            title: null, // No section title, TableComponent will have its own
            customContent: `
                <div class="row g-2">
                    <div class="col-12">
                        <div id="items-table-container"></div>
                    </div>
                </div>
            `
        });
    }

    // Add files section if files exist - using FileAttachments component
    if (request.files && request.files.length > 0) {
        detailsModal.addCustomSection({
            id: 'files-section',
            title: 'Ekler',
            icon: 'fas fa-paperclip',
            iconColor: 'text-info',
            customContent: `
                <div class="row g-2">
                    <div class="col-12">
                        <div id="files-container"></div>
                    </div>
                </div>
            `
        });
    }

    // Render the modal with all sections
    detailsModal.render();

    // Initialize components after modal is rendered
    setTimeout(() => {
        // Initialize items table if items exist
        if (request.items && request.items.length > 0) {
            const itemsTableContainer = document.getElementById('items-table-container');
            if (itemsTableContainer) {
                // Initialize TableComponent for items
                const itemsTable = new TableComponent('items-table-container', {
                    title: 'Ürünler',
                    icon: 'fas fa-boxes',
                    columns: [
                        {
                            field: 'item_code',
                            label: 'Ürün Kodu',
                            sortable: true,
                            formatter: (value) => `<strong>${value || '-'}</strong>`
                        },
                        {
                            field: 'item_name',
                            label: 'Ürün Adı',
                            sortable: true,
                            formatter: (value) => value || '-'
                        },
                        {
                            field: 'quantity',
                            label: 'Miktar',
                            sortable: true,
                            formatter: (value) => value || '-'
                        },
                        {
                            field: 'item_unit',
                            label: 'Birim',
                            sortable: true,
                            formatter: (value) => value || '-'
                        },
                        {
                            field: 'description',
                            label: 'Açıklama',
                            sortable: false,
                            formatter: (value) => value || '-'
                        }
                    ],
                    data: request.items,
                    sortable: true,
                    pagination: false,
                    exportable: false,
                    refreshable: false,
                    striped: true,
                    small: true,
                    emptyMessage: 'Ürün bulunamadı',
                    emptyIcon: 'fas fa-boxes'
                });
            }
        }

        // Initialize files component if files exist
        if (request.files && request.files.length > 0) {
            const filesContainer = document.getElementById('files-container');
            if (filesContainer) {
                // Initialize FileAttachments component
                const fileAttachments = new FileAttachments('files-container', {
                    title: 'Ekler',
                    titleIcon: 'fas fa-paperclip',
                    titleIconColor: 'text-info',
                    layout: 'grid',
                    showTitle: false, // Title is already in section
                    onFileClick: (file) => {
                        const fileName = file.file_name ? file.file_name.split('/').pop() : 'Dosya';
                        const fileExtension = fileName.split('.').pop().toLowerCase();
                        const viewer = new FileViewer();
                        viewer.setDownloadCallback(async () => {
                            await viewer.downloadFile(file.file_url, fileName);
                        });
                        viewer.openFile(file.file_url, fileName, fileExtension);
                    },
                    onDownloadClick: (fileUrl, fileName) => {
                        // Force download by creating a blob and downloading it
                        fetch(fileUrl)
                            .then(response => response.blob())
                            .then(blob => {
                                const url = window.URL.createObjectURL(blob);
                                const link = document.createElement('a');
                                link.href = url;
                                link.download = fileName;
                                link.style.display = 'none';
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                                window.URL.revokeObjectURL(url);
                            })
                            .catch(error => {
                                console.error('Download failed:', error);
                                // Fallback to direct link
                                const link = document.createElement('a');
                                link.href = fileUrl;
                                link.download = fileName;
                                link.target = '_blank';
                                link.click();
                            });
                    }
                });

                // Set files data
                fileAttachments.setFiles(request.files);
            }
        }
    }, 100);

    detailsModal.show();
}

function showDeleteConfirmation(request) {
    currentRequest = request;
    deleteModal.show();
}

function renderStatusBadge(status, statusLabel) {
    let badgeClass = 'status-grey';
    
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
        case 'draft':
            badgeClass = 'status-grey';
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
            badgeClass = 'status-red';
            label = 'Kritik';
            break;
        case 'urgent':
            badgeClass = 'status-yellow';
            label = 'Acil';
            break;
        case 'normal':
            badgeClass = 'status-blue';
            label = 'Normal';
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

function formatPriority(priority) {
    const priorityMap = {
        'normal': 'Normal',
        'urgent': 'Acil',
        'critical': 'Kritik'
    };
    return priorityMap[priority] || priority || '-';
}

function formatStatus(status) {
    const statusMap = {
        'draft': 'Taslak',
        'submitted': 'Gönderildi',
        'approved': 'Onaylandı',
        'rejected': 'Reddedildi',
        'cancelled': 'İptal Edildi',
        'transferred': 'Transfer Edildi'
    };
    return statusMap[status] || status || '-';
}

function formatDateForInput(dateString) {
    if (!dateString) return '';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return '';
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    } catch (error) {
        console.error('Error formatting date for input:', error);
        return '';
    }
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

// Make functions globally available
window.viewRequestDetails = viewRequestDetails;
window.showCreateModal = showCreateModal;
window.showEditModal = showEditModal;

