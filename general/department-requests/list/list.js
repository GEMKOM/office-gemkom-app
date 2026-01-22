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
import { UNIT_CHOICES, PREDEFINED_PROCESS_ITEMS } from '../../../apis/constants.js';
import { ModernDropdown } from '../../../components/dropdown/dropdown.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
import { fetchAllUsers } from '../../../apis/users.js';
import { showNotification } from '../../../components/notification/notification.js';

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
let departmentRequestsFilters = null;
// File-to-item mapping state
let fileItemMappings = []; // Array of { file: File, attachTo: ['request' | itemIndex, ...] }

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

    // Initialize filters component
    await initializeFiltersComponent();

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

async function initializeFiltersComponent() {
    // Initialize filters component
    departmentRequestsFilters = new FiltersComponent('filters-placeholder', {
        title: 'Departman Talepleri Filtreleri',
        onApply: (values) => {
            // Apply filters and reload requests
            currentPage = 1;
            loadRequests();
        },
        onClear: () => {
            // Clear filters and reload requests
            currentPage = 1;
            loadRequests();
            showNotification('Filtreler temizlendi', 'info');
        },
        onFilterChange: (filterId, value) => {
            // Optional: Handle individual filter changes
            console.log(`Filter ${filterId} changed to:`, value);
        }
    });

    // Status filter
    departmentRequestsFilters.addDropdownFilter({
        id: 'status-filter',
        label: 'Durum',
        options: [
            { value: 'draft', label: 'Taslak' },
            { value: 'submitted', label: 'Gönderildi' },
            { value: 'approved', label: 'Onaylandı' },
            { value: 'rejected', label: 'Reddedildi' },
            { value: 'cancelled', label: 'İptal Edildi' },
            { value: 'transferred', label: 'Transfer Edildi' }
        ],
        placeholder: 'Durum seçin',
        colSize: 2
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
        // Add empty dropdown if users fail to load
        departmentRequestsFilters.addDropdownFilter({
            id: 'requestor-filter',
            label: 'Talep Eden',
            options: [],
            placeholder: 'Kullanıcı yüklenemedi',
            colSize: 2,
            searchable: true
        });
    }
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
                formatter: (value) => {
                    if (!value) return '-';
                    return `<div style="color: #6c757d; font-weight: 500;">${formatDate(value)}</div>`;
                }
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
                field: 'planning_request_keys',
                label: 'Planlama Talepleri',
                sortable: false,
                formatter: (value, row) => formatRequestKeys(value || row.planning_request_keys, 'planning')
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
        serverSidePagination: true,
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

        // Get filter values and add to filters
        if (departmentRequestsFilters) {
            const filterValues = departmentRequestsFilters.getFilterValues();
            
            if (filterValues['status-filter'] && filterValues['status-filter'] !== '') {
                filters.status = filterValues['status-filter'];
            }
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
    // Clear file mappings
    fileItemMappings = [];
    
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
                value: request?.priority || 'normal',
                required: false,
                icon: 'fas fa-exclamation-triangle',
                colSize: 12,
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
                colSize: 12,
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

    // Add files mapping section (for new requests) or files display section (for editing)
    if (isEditMode && request) {
        createEditModal.addSection({
            id: 'files-display-section',
            title: 'Dosya Ekleri',
            icon: 'fas fa-paperclip',
            iconColor: 'text-info',
            fields: []
        });
    } else {
        // Add files mapping section for new requests
        createEditModal.addSection({
            id: 'files-mapping-section',
            title: 'Dosya Eşleştirme',
            icon: 'fas fa-paperclip',
            iconColor: 'text-info',
            fields: []
        });
    }

    // Set up save callback
    createEditModal.onSaveCallback(async (formData) => {
        await handleSaveRequest(formData);
    });

    // Set up cancel callback
    createEditModal.onCancelCallback(() => {
        currentRequest = null;
        isEditMode = false;
        // Clear file mappings
        fileItemMappings = [];
    });

    // Render the modal first
    createEditModal.render();

    // Rearrange sections into two-column layout after rendering
    setTimeout(() => {
        const form = createEditModal.container.querySelector('#edit-modal-form');
        const basicInfoSection = createEditModal.container.querySelector('[data-section-id="basic-info-section"]');
        const requestDetailsSection = createEditModal.container.querySelector('[data-section-id="request-details-section"]');
        
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
            const itemsSection = createEditModal.container.querySelector('[data-section-id="items-info"]');
            if (itemsSection) {
                form.insertBefore(wrapperRow, itemsSection);
            } else {
                form.insertBefore(wrapperRow, form.firstChild);
            }
        }
        
        // Add items table after rendering
        setupItemsSection(request);
        
        // Setup files display section if editing
        if (isEditMode && request) {
            setupFilesDisplaySection(request);
        } else {
            // Setup files mapping section for new requests
            setupFilesMappingSection();
        }
    }, 100);
}

function setupFilesDisplaySection(request) {
    // Find the files section
    const filesSection = createEditModal.container.querySelector('[data-section-id="files-display-section"]');
    if (!filesSection) return;
    
    // Find the row container (EditModal creates .row.g-2 for fields)
    const fieldsContainer = filesSection.querySelector('.row.g-2');
    if (fieldsContainer) {
        // Clear any existing content and add files container
        fieldsContainer.innerHTML = `
            <div class="col-12">
                <div id="existing-files-container"></div>
            </div>
        `;
    }
    
    // Initialize FileAttachments component
    setTimeout(() => {
        const filesContainer = document.getElementById('existing-files-container');
        if (filesContainer) {
            const fileAttachmentsComponent = new FileAttachments('existing-files-container', {
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
            // Set files data (empty array if no files)
            fileAttachmentsComponent.setFiles(request.files || []);
        }
    }, 100);
}

function setupFilesMappingSection() {
    const filesSection = createEditModal.container.querySelector('[data-section-id="files-mapping-section"]');
    if (!filesSection) return;
    
    const fieldsContainer = filesSection.querySelector('.row.g-2');
    if (!fieldsContainer) return;
    
    // Clear and add files list container
    fieldsContainer.innerHTML = `
        <div class="col-12">
            <div id="files-mapping-list"></div>
        </div>
    `;
    
    // Set up file input change listener
    const fileInput = createEditModal.container.querySelector('input[type="file"]');
    if (fileInput) {
        // Store reference to avoid duplicate listeners
        if (fileInput.dataset.listenerAdded !== 'true') {
            fileInput.dataset.listenerAdded = 'true';
            
            fileInput.addEventListener('change', (e) => {
                // Get existing files from our mappings (preserve existing mappings)
                const existingFiles = fileItemMappings.map(m => m.file);
                
                // Get newly selected files from the input (what user just selected)
                const newFiles = Array.from(e.target.files || []);
                
                // Merge: combine existing files with new files, avoiding duplicates
                const allFiles = [...existingFiles];
                const newMappings = [...fileItemMappings];
                
                newFiles.forEach(newFile => {
                    // Check if file is already in our list (by name, size, and lastModified)
                    const existingIndex = existingFiles.findIndex(existingFile => 
                        existingFile.name === newFile.name && 
                        existingFile.size === newFile.size &&
                        existingFile.lastModified === newFile.lastModified
                    );
                    
                    if (existingIndex === -1) {
                        // This is a new file, add it
                        allFiles.push(newFile);
                        newMappings.push({
                            file: newFile,
                            attachTo: ['request'] // Default to request
                        });
                    }
                });
                
                // Update fileItemMappings with merged mappings
                fileItemMappings = newMappings;
                
                // Update the file input with all files using DataTransfer
                const dt = new DataTransfer();
                allFiles.forEach(file => {
                    dt.items.add(file);
                });
                e.target.files = dt.files;
                
                // Update the mappings list display
                updateFilesMappingList();
            });
        }
    }
    
    // Initial render
    updateFilesMappingList();
}

function updateFilesMappingList() {
    const filesListContainer = document.getElementById('files-mapping-list');
    if (!filesListContainer) return;
    
    const fileInput = createEditModal.container.querySelector('input[type="file"]');
    if (!fileInput) {
        filesListContainer.innerHTML = '<p class="text-muted">Dosya seçimi bulunamadı</p>';
        return;
    }
    
    const uploadedFiles = Array.from(fileInput.files || []);
    
    if (uploadedFiles.length === 0) {
        filesListContainer.innerHTML = '<p class="text-muted">Henüz dosya seçilmedi</p>';
        fileItemMappings = [];
        return;
    }
    
    // Synchronize fileItemMappings with uploadedFiles
    // Use a more robust comparison (by name, size, and lastModified) since file object references might differ
    const newMappings = [];
    uploadedFiles.forEach((file, index) => {
        // Try to find existing mapping for this file by comparing file properties
        const existingMapping = fileItemMappings.find(m => 
            m.file.name === file.name && 
            m.file.size === file.size &&
            m.file.lastModified === file.lastModified
        );
        if (existingMapping) {
            // Update the file reference to match the current one (in case it changed)
            existingMapping.file = file;
            newMappings.push(existingMapping);
        } else {
            // Create new mapping
            newMappings.push({
                file: file,
                attachTo: ['request'] // Default to request
            });
        }
    });
    fileItemMappings = newMappings;
    
    // Get item rows for display
    const itemRows = document.querySelectorAll('.item-row');
    const itemsCount = itemRows.length;
    
    const filesHtml = fileItemMappings.map((mapping, fileIndex) => {
        const file = mapping.file;
        const fileName = file.name;
        const fileSize = (file.size / 1024).toFixed(2) + ' KB';
        
        let targetsHtml = `
            <div class="mb-2">
                <strong>Eşleştir:</strong>
                <div class="form-check mt-2">
                    <input class="form-check-input" type="checkbox" 
                           id="attach-request-${fileIndex}" 
                           data-file-index="${fileIndex}" 
                           data-target="request"
                           ${mapping.attachTo.includes('request') ? 'checked' : ''}>
                    <label class="form-check-label" for="attach-request-${fileIndex}">
                        <i class="fas fa-file-alt me-1"></i>Talep
                    </label>
                </div>
        `;
        
        // Add checkboxes for each item
        for (let i = 0; i < itemsCount; i++) {
            const itemRow = document.querySelector(`.item-row[data-index="${i}"]`);
            if (!itemRow) continue;
            
            const jobNo = itemRow.querySelector('input[name="job_no"]')?.value?.trim() || '';
            const itemDescription = itemRow.querySelector('input[name="item_description"]')?.value?.trim() || '';
            const itemSpecifications = itemRow.querySelector('input[name="item_specifications"]')?.value?.trim() || '';
            const itemName = itemRow.querySelector('input[name="item_name"]')?.value?.trim() || '';
            
            // Build display text with İş No, Ürün Açıklaması, and Özellikler
            const displayParts = [];
            if (jobNo) {
                displayParts.push(`İş No: ${jobNo}`);
            }
            if (itemDescription) {
                displayParts.push(`Açıklama: ${itemDescription}`);
            }
            if (itemSpecifications) {
                displayParts.push(`Özellikler: ${itemSpecifications}`);
            }
            
            // Fallback to item name if nothing else is available
            const displayText = displayParts.length > 0 
                ? displayParts.join(' | ') 
                : (itemName || `Ürün ${i + 1}`);
            
            targetsHtml += `
                <div class="form-check">
                    <input class="form-check-input" type="checkbox" 
                           id="attach-item-${fileIndex}-${i}" 
                           data-file-index="${fileIndex}" 
                           data-target="${i}"
                           ${mapping.attachTo.includes(i) ? 'checked' : ''}>
                    <label class="form-check-label" for="attach-item-${fileIndex}-${i}" style="font-size: 0.9rem;">
                        <i class="fas fa-box me-1"></i>${displayText}
                    </label>
                </div>
            `;
        }
        
        targetsHtml += `
            </div>
        `;
        
        return `
            <div class="card mb-3">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <div>
                            <h6 class="mb-1">
                                <i class="fas fa-file me-2"></i>${fileName}
                            </h6>
                            <small class="text-muted">${fileSize}</small>
                        </div>
                        <button type="button" class="btn btn-sm btn-outline-danger" onclick="removeFileMapping(${fileIndex})">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    ${targetsHtml}
                </div>
            </div>
        `;
    }).join('');
    
    filesListContainer.innerHTML = filesHtml || '<p class="text-muted">Henüz dosya seçilmedi</p>';
    
    // Add event listeners for checkboxes
    filesListContainer.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const fileIndex = parseInt(e.target.dataset.fileIndex);
            const target = e.target.dataset.target;
            const checked = e.target.checked;
            updateFileAttachTo(fileIndex, target, checked);
        });
    });
    
    // Update file list when items change
    const itemInputs = document.querySelectorAll('.item-row input, .item-row select');
    itemInputs.forEach(input => {
        input.addEventListener('input', () => {
            // Debounce the update
            clearTimeout(window.filesMappingUpdateTimeout);
            window.filesMappingUpdateTimeout = setTimeout(() => {
                updateFilesMappingList();
            }, 300);
        });
    });
}

function updateFileAttachTo(fileIndex, target, checked) {
    if (fileIndex < 0 || fileIndex >= fileItemMappings.length) return;
    
    const mapping = fileItemMappings[fileIndex];
    const targetValue = target === 'request' ? 'request' : parseInt(target);
    
    if (checked) {
        if (!mapping.attachTo.includes(targetValue)) {
            mapping.attachTo.push(targetValue);
        }
    } else {
        mapping.attachTo = mapping.attachTo.filter(t => t !== targetValue);
    }
    
    // Validate that at least one target is selected
    if (mapping.attachTo.length === 0) {
        // Re-check the checkbox if no targets remain
        const checkbox = document.querySelector(`input[data-file-index="${fileIndex}"][data-target="${target}"]`);
        if (checkbox) {
            checkbox.checked = true;
            mapping.attachTo.push(targetValue);
        }
    }
}

function removeFileMapping(fileIndex) {
    const fileInput = createEditModal.container.querySelector('input[type="file"]');
    if (!fileInput) return;
    
    // Create a new FileList without the removed file
    const dt = new DataTransfer();
    const files = Array.from(fileInput.files);
    files.forEach((file, index) => {
        if (index !== fileIndex) {
            dt.items.add(file);
        }
    });
    fileInput.files = dt.files;
    
    // Remove from mappings
    fileItemMappings.splice(fileIndex, 1);
    
    // Update the list
    updateFilesMappingList();
}

// Make functions globally available
window.removeFileMapping = removeFileMapping;

function setupItemsSection(request = null) {
    const itemsSection = createEditModal.container.querySelector('[data-section-id="items-info"]');
    if (!itemsSection) return;

    const fieldsContainer = itemsSection.querySelector('.row.g-2');
    if (!fieldsContainer) return;

    const itemsHtml = `
        <div class="d-flex justify-content-between align-items-center mb-2">
            <h6 class="mb-0">Ürün Listesi</h6>
            <div class="d-flex gap-2 align-items-center">
                <div id="predefined-items-dropdown-container" style="width: 200px;"></div>
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
                    <i class="fas fa-align-left me-1"></i>Ürün Açıklaması
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
        <div id="items-container">
            <!-- Items will be added here -->
        </div>
    `;

    fieldsContainer.insertAdjacentHTML('beforeend', itemsHtml);

    // Initialize predefined items dropdown using ModernDropdown
    const predefinedItemsContainer = createEditModal.container.querySelector('#predefined-items-dropdown-container');
    if (predefinedItemsContainer) {
        setTimeout(() => {
            const predefinedDropdown = new ModernDropdown(predefinedItemsContainer, {
                placeholder: 'Hazır Ürün Ekle',
                searchable: true,
                multiple: false,
                maxHeight: 300,
                width: '200px'
            });

            // Convert predefined items to dropdown format
            const dropdownItems = PREDEFINED_PROCESS_ITEMS.map(item => ({
                value: `${item.code}|${item.name}|${item.unit}`,
                text: item.name
            }));

            predefinedDropdown.setItems(dropdownItems);

            // Handle selection
            predefinedItemsContainer.addEventListener('dropdown:select', (e) => {
                const selectedValue = e.detail.value;
                if (selectedValue) {
                    const [code, name, unit] = selectedValue.split('|');
                    
                    // Add a new item row
                    addItem();
                    
                    // Get the last added item row
                    const container = document.getElementById('items-container');
                    if (container) {
                        const lastRow = container.lastElementChild;
                        if (lastRow) {
                            // Fill in the fields
                            const codeInput = lastRow.querySelector('input[name="item_code"]');
                            const nameInput = lastRow.querySelector('input[name="item_name"]');
                            const unitSelect = lastRow.querySelector('select[name="item_unit"]');
                            
                            if (codeInput) codeInput.value = code;
                            if (nameInput) nameInput.value = name;
                            if (unitSelect) unitSelect.value = unit;
                        }
                    }
                    
                    // Reset dropdown selection
                    predefinedDropdown.setValue(null);
                }
            });
        }, 150);
    }

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
            // Clear item references from file mappings
            if (!isEditMode) {
                fileItemMappings.forEach(mapping => {
                    mapping.attachTo = mapping.attachTo.filter(t => t === 'request');
                });
                setTimeout(() => {
                    updateFilesMappingList();
                }, 100);
            }
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
                const jobNoInput = lastRow.querySelector('input[name="job_no"]');
                const unitSelect = lastRow.querySelector('select[name="item_unit"]');
                const quantityInput = lastRow.querySelector('input[name="item_quantity"]');
                const descInput = lastRow.querySelector('input[name="item_description"]');
                const specsInput = lastRow.querySelector('input[name="item_specifications"]');
                
                if (codeInput) codeInput.value = item.item_code || '';
                if (nameInput) nameInput.value = item.item_name || item.name || '';
                if (jobNoInput) jobNoInput.value = item.job_no || '';
                if (unitSelect) unitSelect.value = item.item_unit || item.unit || '';
                if (quantityInput) quantityInput.value = item.quantity || '1';
                if (descInput) descInput.value = item.item_description || item.description || '';
                if (specsInput) specsInput.value = item.item_specifications || item.specifications || '';
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
                <div class="col-md-1">
                    <input type="text" class="form-control form-control-sm" name="job_no" placeholder="İş no">
                </div>
                <div class="col-md-1">
                    <input type="number" class="form-control form-control-sm" name="item_quantity" placeholder="Miktar" step="1" min="1" value="1">
                </div>
                <div class="col-md-1">
                    <select class="form-control form-control-sm" name="item_unit">
                        <option value="">Birim Seçin</option>
                        ${UNIT_CHOICES.map(unit => `<option value="${unit.value}">${unit.label}</option>`).join('')}
                    </select>
                </div>
                <div class="col-md-2">
                    <input type="text" class="form-control form-control-sm" name="item_description" placeholder="Ürün açıklaması">
                </div>
                <div class="col-md-2">
                    <input type="text" class="form-control form-control-sm" name="item_specifications" placeholder="Özellikler">
                </div>
                <div class="col-md-1">
                    <div class="btn-group w-100" role="group">
                        <button type="button" class="btn btn-outline-info btn-sm" onclick="duplicateItem(${itemIndex})" title="Ürünü Kopyala">
                            <i class="fas fa-copy"></i>
                        </button>
                        <button type="button" class="btn btn-outline-danger btn-sm" onclick="removeItem(${itemIndex})" title="Ürünü Kaldır">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    container.insertAdjacentHTML('beforeend', itemHtml);
    
    // Update file mapping list if it exists
    if (!isEditMode) {
        setTimeout(() => {
            updateFilesMappingList();
        }, 100);
    }
}

function removeItem(index) {
    const itemRow = document.querySelector(`.item-row[data-index="${index}"]`);
    if (itemRow) {
        itemRow.remove();
        // Update indices after removal
        updateItemIndices();
        
        // Update file mappings - remove references to this item index and adjust indices
        if (!isEditMode) {
            fileItemMappings.forEach(mapping => {
                // Remove the deleted item index
                mapping.attachTo = mapping.attachTo.filter(t => t !== index);
                // Adjust indices greater than the removed index
                mapping.attachTo = mapping.attachTo.map(t => {
                    if (typeof t === 'number' && t > index) {
                        return t - 1;
                    }
                    return t;
                });
            });
            setTimeout(() => {
                updateFilesMappingList();
            }, 100);
        }
    }
}

function duplicateItem(index) {
    const itemRow = document.querySelector(`.item-row[data-index="${index}"]`);
    if (!itemRow) return;

    // Get all values from the current item
    const codeInput = itemRow.querySelector('input[name="item_code"]');
    const nameInput = itemRow.querySelector('input[name="item_name"]');
    const jobNoInput = itemRow.querySelector('input[name="job_no"]');
    const quantityInput = itemRow.querySelector('input[name="item_quantity"]');
    const unitSelect = itemRow.querySelector('select[name="item_unit"]');
    const descInput = itemRow.querySelector('input[name="item_description"]');
    const specsInput = itemRow.querySelector('input[name="item_specifications"]');

    const code = codeInput ? codeInput.value : '';
    const name = nameInput ? nameInput.value : '';
    const jobNo = jobNoInput ? jobNoInput.value : '';
    const quantity = quantityInput ? quantityInput.value : '1';
    const unit = unitSelect ? unitSelect.value : '';
    const description = descInput ? descInput.value : '';
    const specifications = specsInput ? specsInput.value : '';

    // Add a new item
    addItem();

    // Get the container and find the last added row
    const container = document.getElementById('items-container');
    if (container) {
        const lastRow = container.lastElementChild;
        if (lastRow) {
            // Fill in the duplicated values
            const newCodeInput = lastRow.querySelector('input[name="item_code"]');
            const newNameInput = lastRow.querySelector('input[name="item_name"]');
            const newJobNoInput = lastRow.querySelector('input[name="job_no"]');
            const newQuantityInput = lastRow.querySelector('input[name="item_quantity"]');
            const newUnitSelect = lastRow.querySelector('select[name="item_unit"]');
            const newDescInput = lastRow.querySelector('input[name="item_description"]');
            const newSpecsInput = lastRow.querySelector('input[name="item_specifications"]');

            if (newCodeInput) newCodeInput.value = code;
            if (newNameInput) newNameInput.value = name;
            if (newJobNoInput) newJobNoInput.value = jobNo;
            if (newQuantityInput) newQuantityInput.value = quantity;
            if (newUnitSelect) newUnitSelect.value = unit;
            if (newDescInput) newDescInput.value = description;
            if (newSpecsInput) newSpecsInput.value = specifications;
        }
    }
}

function updateItemIndices() {
    const container = document.getElementById('items-container');
    if (!container) return;

    const itemRows = container.querySelectorAll('.item-row');
    itemRows.forEach((row, newIndex) => {
        const oldIndex = parseInt(row.getAttribute('data-index') || newIndex);
        row.setAttribute('data-index', newIndex);
        
        // Update onclick handlers for buttons
        const duplicateBtn = row.querySelector('button[onclick*="duplicateItem"]');
        const removeBtn = row.querySelector('button[onclick*="removeItem"]');
        
        if (duplicateBtn) {
            duplicateBtn.setAttribute('onclick', `duplicateItem(${newIndex})`);
        }
        if (removeBtn) {
            removeBtn.setAttribute('onclick', `removeItem(${newIndex})`);
        }
        
        // Update file mappings if indices changed
        if (!isEditMode && oldIndex !== newIndex) {
            fileItemMappings.forEach(mapping => {
                mapping.attachTo = mapping.attachTo.map(t => {
                    if (typeof t === 'number' && t === oldIndex) {
                        return newIndex;
                    }
                    return t;
                });
            });
        }
    });
    
    // Update file mapping list after indices are updated
    if (!isEditMode) {
        setTimeout(() => {
            updateFilesMappingList();
        }, 100);
    }
}

// Make functions globally available
window.removeItem = removeItem;
window.duplicateItem = duplicateItem;

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
            const jobNo = row.querySelector('input[name="job_no"]')?.value?.trim();
            const itemUnit = row.querySelector('select[name="item_unit"]')?.value?.trim();
            const itemQuantity = row.querySelector('input[name="item_quantity"]')?.value?.trim();
            const itemDescription = row.querySelector('input[name="item_description"]')?.value?.trim();
            const itemSpecifications = row.querySelector('input[name="item_specifications"]')?.value?.trim();
            
            // Only add item if at least name is provided
            if (itemName) {
                items.push({
                    item_code: itemCode || null,
                    item_name: itemName,
                    job_no: jobNo || null,
                    item_unit: itemUnit || null,
                    quantity: itemQuantity ? parseInt(itemQuantity, 10) : 1,
                    item_description: itemDescription || null,
                    item_specifications: itemSpecifications || null
                });
            }
        }

        // Validate that items exist for creation
        if (!isEditMode && items.length === 0) {
            showNotification('En az bir ürün eklemelisiniz', 'error');
            throw new Error('Items required');
        }

        // Build file-to-item mapping
        // Format: { "file_index": [item_index1, item_index2, ...] }
        const fileItemMapping = {};
        if (!isEditMode && uploadedFiles.length > 0 && fileItemMappings.length > 0) {
            fileItemMappings.forEach((mapping, fileIndex) => {
                // Filter out 'request' from attachTo and only include item indices
                const itemIndices = mapping.attachTo.filter(t => typeof t === 'number');
                if (itemIndices.length > 0) {
                    fileItemMapping[fileIndex.toString()] = itemIndices;
                }
            });
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

        // Add file_item_mapping if there are mappings
        if (Object.keys(fileItemMapping).length > 0) {
            requestData.file_item_mapping = fileItemMapping;
        }

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
        // Clear file mappings
        fileItemMappings = [];
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
    
    // Add planning request keys if they exist
    if (request.planning_request_keys && request.planning_request_keys.length > 0) {
        detailsModal.addField({ 
            label: 'Planlama Talepleri', 
            value: formatRequestKeysForDetails(request.planning_request_keys), 
            colSize: 12 
        });
    }
    
    // Add purchase request keys (always show, even if empty)
    detailsModal.addField({ 
        label: 'Satın Alma Talepleri', 
        value: (request.purchase_request_keys && request.purchase_request_keys.length > 0) 
            ? formatRequestKeysForDetails(request.purchase_request_keys) 
            : '-', 
        colSize: 12 
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

    // Add files section (always show, even if no files) - using FileAttachments component
    detailsModal.addCustomSection({
        id: 'files-section',
        title: 'Dosya Ekleri',
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

    // Render the modal with all sections
    detailsModal.render();

    // Initialize components after modal is rendered
    setTimeout(() => {
        // Initialize items table if items exist
        if (request.items && request.items.length > 0) {
            const itemsTableContainer = document.getElementById('items-table-container');
            if (itemsTableContainer) {
                // Initialize TableComponent for items
                // Map items to normalize field names (handle both formats)
                const itemsData = request.items.map(item => ({
                    ...item,
                    // Normalize item code - check both item_code and code
                    item_code: item.item_code || item.code || '-',
                    // Normalize item name - check both name and item_name
                    name: item.name || item.item_name || '-',
                    // Normalize description - check both description and item_description
                    item_description: item.item_description || item.description || '-',
                    // Normalize specifications - check both specifications and item_specifications
                    item_specifications: item.item_specifications || item.specifications || '-',
                    // Normalize unit - check both unit and item_unit
                    unit: item.unit || item.item_unit || '-',
                    // Normalize quantity
                    quantity: item.quantity || 0
                }));

                const itemsTable = new TableComponent('items-table-container', {
                    title: 'Ürünler',
                    icon: 'fas fa-boxes',
                    columns: [
                        {
                            field: 'item_code',
                            label: 'Ürün Kodu',
                            sortable: true,
                            formatter: (value, row) => {
                                // Check both item_code and code fields
                                const code = value || row.code || row.item_code || '-';
                                return code !== '-' ? `<strong>${code}</strong>` : '-';
                            }
                        },
                        {
                            field: 'name',
                            label: 'Ürün Adı',
                            sortable: true,
                            formatter: (value, row) => {
                                // Check both name and item_name fields
                                return value || row.item_name || '-';
                            }
                        },
                        {
                            field: 'quantity',
                            label: 'Miktar',
                            sortable: true,
                            formatter: (value) => value || value === 0 ? value : '-'
                        },
                        {
                            field: 'unit',
                            label: 'Birim',
                            sortable: true,
                            formatter: (value, row) => {
                                // Check both unit and item_unit fields
                                return value || row.item_unit || '-';
                            }
                        },
                        {
                            field: 'item_description',
                            label: 'Ürün Açıklaması',
                            sortable: false,
                            formatter: (value, row) => {
                                // Check both item_description and description fields
                                return value || row.description || row.item_description || '-';
                            }
                        },
                        {
                            field: 'item_specifications',
                            label: 'Özellikler',
                            sortable: false,
                            formatter: (value, row) => {
                                // Check both item_specifications and specifications fields
                                return value || row.specifications || row.item_specifications || '-';
                            }
                        }
                    ],
                    data: itemsData,
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

        // Initialize files component (always initialize, even if no files)
        const filesContainer = document.getElementById('files-container');
        if (filesContainer) {
            // Initialize FileAttachments component
            const fileAttachments = new FileAttachments('files-container', {
                title: '',
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

            // Set files data (empty array if no files)
            fileAttachments.setFiles(request.files || []);
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

function formatRequestKeys(keys, type) {
    if (!keys || !Array.isArray(keys) || keys.length === 0) {
        return '<span style="color: #6c757d;">-</span>';
    }
    
    const badgeClass = type === 'planning' ? 'status-blue' : 'status-green';
    const keysHtml = keys.map(key => 
        `<span class="status-badge ${badgeClass}" style="margin-right: 0.25rem;">${key}</span>`
    ).join('');
    
    return keysHtml;
}

function formatRequestKeysForDetails(keys) {
    if (!keys || !Array.isArray(keys) || keys.length === 0) {
        return '-';
    }
    
    return keys.join(', ');
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


// Make functions globally available
window.viewRequestDetails = viewRequestDetails;
window.showCreateModal = showCreateModal;
window.showEditModal = showEditModal;

