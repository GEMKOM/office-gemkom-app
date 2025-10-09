import { guardRoute } from '../../../../authService.js';
import { initNavbar } from '../../../../components/navbar.js';
import { fetchMachineFaults, createMaintenanceRequest } from '../../../../apis/maintenance.js';
import { fetchMachines } from '../../../../apis/machines.js';
import { HeaderComponent } from '../../../../components/header/header.js';
import { StatisticsCards } from '../../../../components/statistics-cards/statistics-cards.js';
import { FiltersComponent } from '../../../../components/filters/filters.js';
import { TableComponent } from '../../../../components/table/table.js';
import { EditModal } from '../../../../components/edit-modal/edit-modal.js';

let allFaults = [];
let filteredFaults = [];
let headerComponent, statisticsCards, filtersComponent, tableComponent, createFaultModal;
let currentPage = 1;
let itemsPerPage = 20;
let totalItems = 0;
let currentFilters = {};

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    await initNavbar();
    
    // Initialize components
    initializeComponents();
    
    // Load initial data
    await loadFaultRequests();
});

function initializeComponents() {
    // Initialize Header Component
    headerComponent = new HeaderComponent({
        title: 'Arıza Talepleri',
        subtitle: 'Tüm arıza taleplerini görüntüleyin ve yönetin',
        icon: 'exclamation-triangle',
        showBackButton: 'block',
        showCreateButton: 'block',
        createButtonText: 'Yeni Arıza Talebi',
        backUrl: '/manufacturing/maintenance',
        onCreateClick: () => {
            createFaultModal.show();
        }
    });

    // Initialize Statistics Cards Component
    statisticsCards = new StatisticsCards('statistics-container', {
        cards: [
            {
                title: 'Toplam Arıza',
                value: 0,
                icon: 'exclamation-triangle',
                color: 'primary',
                trend: null
            },
            {
                title: 'Bekleyen',
                value: 0,
                icon: 'clock',
                color: 'warning',
                trend: null
            },
            {
                title: 'İşlemde',
                value: 0,
                icon: 'tools',
                color: 'info',
                trend: null
            },
            {
                title: 'Çözüldü',
                value: 0,
                icon: 'check-circle',
                color: 'success',
                trend: null
            }
        ]
    });

    // Initialize Filters Component
    filtersComponent = new FiltersComponent('filters-container', {
        title: 'Filtreler',
        onApply: applyFilters,
        onClear: clearFilters
    });

    // Add filter fields
    filtersComponent.addSelectFilter({
        id: 'statusFilter',
        label: 'Durum',
        options: [
            { value: '', label: 'Tümü' },
            { value: 'pending', label: 'Bekleyen' },
            { value: 'in_progress', label: 'İşlemde' },
            { value: 'resolved', label: 'Çözüldü' },
            { value: 'closed', label: 'Kapatıldı' }
        ],
        colSize: 3
    });

    filtersComponent.addSelectFilter({
        id: 'priorityFilter',
        label: 'Öncelik',
        options: [
            { value: '', label: 'Tümü' },
            { value: 'low', label: 'Düşük' },
            { value: 'medium', label: 'Orta' },
            { value: 'high', label: 'Yüksek' },
            { value: 'critical', label: 'Kritik' }
        ],
        colSize: 3
    });

    filtersComponent.addSelectFilter({
        id: 'machineFilter',
        label: 'Ekipman',
        options: [{ value: '', label: 'Tümü' }],
        colSize: 3
    });

    filtersComponent.addSelectFilter({
        id: 'dateFilter',
        label: 'Tarih Aralığı',
        options: [
            { value: '', label: 'Tümü' },
            { value: 'today', label: 'Bugün' },
            { value: 'week', label: 'Bu Hafta' },
            { value: 'month', label: 'Bu Ay' },
            { value: 'custom', label: 'Özel' }
        ],
        colSize: 3
    });

    // Initialize Table Component
    tableComponent = new TableComponent('table-container', {
        title: 'Arıza Talepleri',
        columns: [
            { 
                field: 'id', 
                label: 'ID', 
                sortable: true,
                formatter: (value) => `<span style="font-weight: 700; color: #0d6efd; font-family: 'Courier New', monospace; font-size: 1rem; background: rgba(13, 110, 253, 0.1); padding: 0.25rem 0.5rem; border-radius: 4px; border: 1px solid rgba(13, 110, 253, 0.2);">${value || '-'}</span>`
            },
            { 
                field: 'machine_name', 
                label: 'Ekipman', 
                sortable: true,
                formatter: (value, row) => {
                    // If machine_name exists, show it
                    if (value && value.trim() !== '') {
                        return `<span style="font-weight: 500; color: #495057;">${value}</span>`;
                    }
                    
                    // If no machine_name, show asset_name - location
                    if (row.asset_name && row.location) {
                        return `<span style="font-weight: 500; color: #495057;">${row.asset_name} - ${row.location}</span>`;
                    }
                    
                    // If only asset_name exists, show just asset_name
                    if (row.asset_name) {
                        return `<span style="font-weight: 500; color: #495057;">${row.asset_name}</span>`;
                    }
                    
                    // Fallback
                    return `<span style="font-weight: 500; color: #495057;">-</span>`;
                }
            },
            { 
                field: 'description', 
                label: 'Açıklama', 
                sortable: false,
                formatter: (value, row) => {
                    if (!value || value.trim() === '') return '-';
                    const truncated = value.length > 100 ? value.substring(0, 100) + '...' : value;
                    return `
                        <span title="${value.replace(/"/g, '&quot;')}">${truncated}</span>
                        ${value.length > 100 ? '<button class="btn btn-link btn-sm p-0 ms-1" onclick="showFullDescription(' + row.id + ')" title="Tam açıklamayı göster"><i class="fas fa-expand-alt"></i></button>' : ''}
                    `;
                }
            },
            { 
                field: 'priority', 
                label: 'Öncelik', 
                sortable: true,
                formatter: (value, row) => getPriorityBadge(row)
            },
            { 
                field: 'status', 
                label: 'Durum', 
                sortable: true,
                formatter: (value, row) => getStatusBadge(row)
            },
            { 
                field: 'reported_by_username', 
                label: 'Bildiren', 
                sortable: true,
                formatter: (value) => `
                    <div style="font-weight: 500; color: #495057;">
                        <i class="fas fa-user-circle me-2 text-muted"></i>
                        ${value || 'Bilinmiyor'}
                    </div>
                `
            },
            { 
                field: 'reported_at', 
                label: 'Bildirilme Tarihi', 
                sortable: true,
                type: 'date'
            },
            { 
                field: 'resolved_by_username', 
                label: 'Çözen', 
                sortable: true,
                formatter: (value) => value || '-'
            },
            { 
                field: 'resolved_at', 
                label: 'Çözüm Tarihi', 
                sortable: true,
                type: 'date',
                formatter: (value) => value ? null : '-' // Let the table component handle date formatting
            },
            { 
                field: 'resolution_description', 
                label: 'Çözüm Açıklaması', 
                sortable: false,
                formatter: (value, row) => {
                    if (!value || value.trim() === '') return '-';
                    const truncated = value.length > 80 ? value.substring(0, 80) + '...' : value;
                    return `
                        <span title="${value.replace(/"/g, '&quot;')}">${truncated}</span>
                        ${value.length > 80 ? '<button class="btn btn-link btn-sm p-0 ms-1" onclick="showFullResolution(' + row.id + ')" title="Tam çözümü göster"><i class="fas fa-expand-alt"></i></button>' : ''}
                    `;
                }
            }
        ],
        pagination: true,
        serverSidePagination: true,
        itemsPerPage: 20,
        currentPage: 1,
        totalItems: 0,
        refreshable: true,
        exportable: true,
        onRefresh: loadFaultRequests,
        onPageChange: (page) => {
            currentPage = page;
            loadFaultRequests();
        },
        onPageSizeChange: (newPageSize) => {
            itemsPerPage = newPageSize;
            currentPage = 1;
            loadFaultRequests();
        },
        onRowClick: (row) => {
            // Handle row click if needed
        },
        emptyMessage: 'Arıza talebi bulunamadı',
        emptyIcon: 'fas fa-exclamation-triangle',
        skeleton: true,
        loading: true
    });

    // Initialize Create Fault Request Modal
    initializeCreateFaultModal();
}

function initializeCreateFaultModal() {
    createFaultModal = new EditModal('create-fault-modal-container', {
        title: 'Yeni Arıza Talebi',
        icon: 'fas fa-exclamation-triangle',
        saveButtonText: 'Gönder',
        size: 'lg'
    });

    // Add form sections and fields
    createFaultModal
        .addSection({
            title: 'Ekipman Seçimi',
            icon: 'fas fa-cog',
            iconColor: 'text-primary',
            fields: [
                {
                    id: 'use_custom_equipment',
                    name: 'use_custom_equipment',
                    label: 'Özel Ekipman Bilgisi Gir',
                    type: 'checkbox',
                    required: false,
                    colSize: 12,
                    helpText: 'Kayıtlı olmayan ekipman için özel bilgi girmek istiyorsanız işaretleyin'
                },
                {
                    id: 'machine',
                    name: 'machine',
                    label: 'Kayıtlı Ekipman',
                    type: 'dropdown',
                    placeholder: 'Ekipman seçin...',
                    required: true,
                    icon: 'fas fa-cog',
                    colSize: 12,
                    searchable: true,
                    options: []
                },
                {
                    id: 'asset_name',
                    name: 'asset_name',
                    label: 'Ekipman Adı',
                    type: 'text',
                    placeholder: 'Ekipman adını girin...',
                    required: false,
                    icon: 'fas fa-tag',
                    colSize: 6,
                    style: 'display: none;'
                },
                {
                    id: 'location',
                    name: 'location',
                    label: 'Konum',
                    type: 'text',
                    placeholder: 'Ekipman konumunu girin...',
                    required: false,
                    icon: 'fas fa-map-marker-alt',
                    colSize: 6,
                    style: 'display: none;'
                }
            ]
        })
        .addSection({
            title: 'Arıza Bilgileri',
            icon: 'fas fa-info-circle',
            iconColor: 'text-primary',
            fields: [
                {
                    id: 'description',
                    name: 'description',
                    label: 'Açıklama',
                    type: 'textarea',
                    placeholder: 'Arıza veya bakım detaylarını açıklayın',
                    required: true,
                    icon: 'fas fa-align-left',
                    colSize: 12,
                    rows: 4
                },
                {
                    id: 'type',
                    name: 'type',
                    label: 'Tür',
                    type: 'dropdown',
                    placeholder: 'Tür seçin...',
                    required: true,
                    icon: 'fas fa-tools',
                    colSize: 6,
                    searchable: false,
                    options: [
                        { value: 'fault', label: 'Arıza' },
                        { value: 'maintenance', label: 'Bakım' }
                    ]
                },
                {
                    id: 'status',
                    name: 'status',
                    label: 'Durum',
                    type: 'dropdown',
                    placeholder: 'Durum seçin...',
                    required: true,
                    icon: 'fas fa-exclamation-triangle',
                    colSize: 6,
                    searchable: false,
                    options: [
                        { value: 'false', label: 'Çalışıyor' },
                        { value: 'true', label: 'Durdu' }
                    ]
                }
            ]
        })
        .render();

    // Set up event handlers
    createFaultModal
        .onSaveCallback(handleCreateFaultSubmit)
        .onCancelCallback(handleCreateFaultCancel);

    // Load machines for dropdown
    loadMachinesForModal();

    // Set up type/status dropdown interaction
    setupTypeStatusInteraction();
    
    // Set up equipment type checkbox interaction
    setupEquipmentTypeInteraction();
}

async function loadMachinesForModal() {
    try {
        const response = await fetchMachines(1, 1000, {"compact": true});
        const machines = response.results || response;
        
        const machineOptions = machines.map(machine => ({
            value: machine.id.toString(),
            text: machine.name
        }));
        
        // Wait a bit for dropdowns to be fully initialized
        setTimeout(() => {
            const machineDropdown = createFaultModal.dropdowns.get('machine');
            if (machineDropdown) {
                machineDropdown.setItems(machineOptions);
            }
        }, 300);
    } catch (error) {
        console.error('Error loading machines for modal:', error);
        showAlert('Ekipman listesi yüklenirken hata oluştu', 'danger');
    }
}

async function handleCreateFaultSubmit(formData) {
    try {
        // Validate required fields
        if (!formData.description || formData.description.trim() === '') {
            showAlert('Açıklama zorunludur', 'warning');
            return;
        }
        
        if (!formData.type) {
            showAlert('Tür seçimi zorunludur', 'warning');
            return;
        }
        
        if (!formData.status) {
            showAlert('Durum seçimi zorunludur', 'warning');
            return;
        }

        // Validate equipment selection
        const useCustomEquipment = formData.use_custom_equipment === 'on' || formData.use_custom_equipment === true;
        
        if (!useCustomEquipment) {
            // Default behavior: machine selection is required
            if (!formData.machine) {
                showAlert('Kayıtlı ekipman seçimi zorunludur', 'warning');
                return;
            }
        } else {
            // Custom equipment is checked: custom fields are required
            if (!formData.asset_name || formData.asset_name.trim() === '') {
                showAlert('Ekipman adı zorunludur', 'warning');
                return;
            }
            if (!formData.location || formData.location.trim() === '') {
                showAlert('Konum bilgisi zorunludur', 'warning');
                return;
            }
        }

        // Prepare submission data
        const submitData = {
            description: formData.description.trim(),
            is_maintenance: formData.type === 'maintenance',
            is_breaking: formData.status === 'true'
        };

        // Add equipment data based on selection
        if (useCustomEquipment) {
            // Use custom equipment data
            submitData.asset_name = formData.asset_name.trim();
            submitData.location = formData.location.trim();
        } else {
            // Use registered machine
            submitData.machine = parseInt(formData.machine);
        }

        // Submit the fault request
        await createMaintenanceRequest(submitData);
        
        // Show success message
        showAlert('Arıza talebi başarıyla oluşturuldu!', 'success');
        
        // Hide modal
        createFaultModal.hide();
        
        // Reset field visibility to default state
        setTimeout(() => {
            toggleCustomEquipmentFields(false);
        }, 100);
        
        // Reload the fault requests list
        await loadFaultRequests();
        
    } catch (error) {
        console.error('Error creating fault request:', error);
        showAlert('Arıza talebi oluşturulurken hata oluştu: ' + error.message, 'danger');
    }
}

function handleCreateFaultCancel() {
    // Clear form when modal is cancelled
    createFaultModal.clearForm();
    
    // Reset field visibility to default state
    setTimeout(() => {
        toggleCustomEquipmentFields(false);
    }, 100);
}

function setupTypeStatusInteraction() {
    // Wait for dropdowns to be initialized
    setTimeout(() => {
        const typeDropdown = createFaultModal.dropdowns.get('type');
        const statusDropdown = createFaultModal.dropdowns.get('status');
        
        if (typeDropdown && statusDropdown) {
            // Listen for type changes
            const typeContainer = document.querySelector('#dropdown-type');
            if (typeContainer) {
                typeContainer.addEventListener('dropdown:select', (e) => {
                    const selectedType = e.detail.value;
                    updateStatusDropdown(selectedType, statusDropdown);
                });
            }
        }
    }, 500);
}

function updateStatusDropdown(selectedType, statusDropdown) {
    if (selectedType === 'maintenance') {
        // If maintenance is selected, machine cannot be breaking
        statusDropdown.setItems([
            { value: 'false', label: 'Çalışıyor' }
        ]);
        statusDropdown.setValue('false');
    } else {
        // If fault is selected, machine can be either working or stopped
        statusDropdown.setItems([
            { value: 'false', label: 'Çalışıyor' },
            { value: 'true', label: 'Durdu' }
        ]);
    }
}

function setupEquipmentTypeInteraction() {
    // Wait for the modal to be fully rendered
    setTimeout(() => {
        const customEquipmentCheckbox = document.querySelector('input[name="use_custom_equipment"]');
        
        if (customEquipmentCheckbox) {
            // Remove any existing event listeners to prevent duplicates
            customEquipmentCheckbox.removeEventListener('change', handleCheckboxChange);
            
            // Add event listener
            customEquipmentCheckbox.addEventListener('change', handleCheckboxChange);
            
            // Set initial state based on checkbox current state
            toggleCustomEquipmentFields(customEquipmentCheckbox.checked);
        }
    }, 1000); // Increased timeout to ensure modal is fully rendered
}

function handleCheckboxChange(e) {
    const isChecked = e.target.checked;
    toggleCustomEquipmentFields(isChecked);
}

function toggleCustomEquipmentFields(showCustomFields) {
    const machineField = document.querySelector('[data-field-id="machine"]');
    const assetNameField = document.querySelector('[data-field-id="asset_name"]');
    const locationField = document.querySelector('[data-field-id="location"]');
    
    if (showCustomFields) {
        // Show custom fields, hide machine dropdown
        if (machineField) {
            machineField.style.display = 'none';
            const machineInput = machineField.querySelector('input, select');
            if (machineInput) {
                machineInput.required = false;
                machineInput.value = ''; // Clear the value when hiding
            }
        }
        if (assetNameField) {
            assetNameField.style.display = 'block';
            const assetInput = assetNameField.querySelector('input');
            if (assetInput) assetInput.required = true;
        }
        if (locationField) {
            locationField.style.display = 'block';
            const locationInput = locationField.querySelector('input');
            if (locationInput) locationInput.required = true;
        }
    } else {
        // Hide custom fields, show machine dropdown
        if (machineField) {
            machineField.style.display = 'block';
            const machineInput = machineField.querySelector('input, select');
            if (machineInput) machineInput.required = true;
        }
        if (assetNameField) {
            assetNameField.style.display = 'none';
            const assetInput = assetNameField.querySelector('input');
            if (assetInput) {
                assetInput.required = false;
                assetInput.value = ''; // Clear the value when hiding
            }
        }
        if (locationField) {
            locationField.style.display = 'none';
            const locationInput = locationField.querySelector('input');
            if (locationInput) {
                locationInput.required = false;
                locationInput.value = ''; // Clear the value when hiding
            }
        }
    }
}

async function loadFaultRequests() {
    try {
        tableComponent.setLoading(true);
        
        // Prepare API filters with pagination
        const apiFilters = {
            page: currentPage,
            page_size: itemsPerPage,
            ...currentFilters
        };
        
        // Fetch fault requests from API with pagination
        const response = await fetchMachineFaults(apiFilters);
        
        // Handle paginated response
        if (response.results) {
            allFaults = response.results;
            totalItems = response.count || response.results.length;
        } else if (Array.isArray(response)) {
            allFaults = response;
            totalItems = response.length;
        } else {
            allFaults = [];
            totalItems = 0;
        }
        
        filteredFaults = [...allFaults];
        
        // Update statistics
        updateStatistics();
        
        // Update table data with pagination info
        updateTableData();
        
        // Load machines for filter (only on first load)
        if (currentPage === 1) {
            loadMachinesForFilter();
        }
        
    } catch (error) {
        console.error('Error loading fault requests:', error);
        showAlert('Arıza talepleri yüklenirken hata oluştu.', 'danger');
        allFaults = [];
        totalItems = 0;
        updateTableData();
    } finally {
        tableComponent.setLoading(false);
    }
}

function updateStatistics() {
    const total = allFaults.length;
    const pending = allFaults.filter(fault => getStatus(fault) === 'pending').length;
    const inProgress = allFaults.filter(fault => getStatus(fault) === 'in_progress').length;
    const resolved = allFaults.filter(fault => getStatus(fault) === 'resolved' || getStatus(fault) === 'closed').length;
    
    statisticsCards.updateValues({
        0: total,
        1: pending,
        2: inProgress,
        3: resolved
    });
}

function updateTableData() {
    // The table component will now handle formatting through column formatters
    // We just need to pass the raw data
    const tableData = filteredFaults;
    
    // Update table with pagination info
    tableComponent.updateData(tableData, totalItems, currentPage);
}

function getStatus(fault) {
    if (fault.resolved_at) {
        return 'resolved';
    }
    if (fault.is_breaking) {
        return 'in_progress';
    }
    return 'pending';
}

// Removed getPriorityBadge and getStatusBadge functions - now handled by table component formatters

// Action buttons are now handled by the table component's actions configuration

// Removed formatDate function - now handled by table component date formatting

function loadMachinesForFilter() {
    const machines = [...new Set(allFaults.map(fault => fault.machine_name).filter(Boolean))];
    const machineOptions = [{ value: '', label: 'Tümü' }];
    
    machines.forEach(machine => {
        machineOptions.push({ value: machine, label: machine });
    });
    
    filtersComponent.updateFilterOptions('machineFilter', machineOptions);
}

function applyFilters() {
    const filterValues = filtersComponent.getFilterValues();
    
    // Build server-side filters
    currentFilters = {};
    
    // Status filter
    if (filterValues.statusFilter) {
        currentFilters.status = filterValues.statusFilter;
    }
    
    // Priority filter
    if (filterValues.priorityFilter) {
        currentFilters.priority = filterValues.priorityFilter;
    }
    
    // Machine filter
    if (filterValues.machineFilter) {
        currentFilters.machine_name = filterValues.machineFilter;
    }
    
    // Date filter
    if (filterValues.dateFilter) {
        const today = new Date();
        switch (filterValues.dateFilter) {
            case 'today':
                currentFilters.reported_at__date = today.toISOString().split('T')[0];
                break;
            case 'week':
                const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
                currentFilters.reported_at__gte = weekAgo.toISOString().split('T')[0];
                break;
            case 'month':
                const monthAgo = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
                currentFilters.reported_at__gte = monthAgo.toISOString().split('T')[0];
                break;
        }
    }
    
    // Reset to first page when applying filters
    currentPage = 1;
    
    // Reload data with new filters
    loadFaultRequests();
}

function clearFilters() {
    filtersComponent.clearFilters();
    currentFilters = {};
    currentPage = 1;
    loadFaultRequests();
}




function showAlert(message, type = 'info') {
    // Create and show alert
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
    alertDiv.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(alertDiv);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.remove();
        }
    }, 5000);
}

// Badge utility functions (similar to pending requests)
function getStatusBadge(fault) {
    if (fault.resolved_at) {
        return '<span class="status-badge status-green">Çözüldü</span>';
    }
    if (fault.is_breaking) {
        return '<span class="status-badge status-red">Makine Duruşta</span>';
    }
    return '<span class="status-badge status-yellow">Bekleyen</span>';
}

function getPriorityBadge(fault) {
    if (fault.is_breaking) {
        return '<span class="status-badge status-red">Kritik</span>';
    }
    if (fault.is_maintenance) {
        return '<span class="status-badge status-yellow">Orta</span>';
    }
    return '<span class="status-badge status-grey">Düşük</span>';
}

// Functions for showing full descriptions and resolutions
function showFullDescription(faultId) {
    const fault = allFaults.find(f => f.id === faultId);
    if (fault && fault.description) {
        showAlert(fault.description, 'info');
    }
}

function showFullResolution(faultId) {
    const fault = allFaults.find(f => f.id === faultId);
    if (fault && fault.resolution_description) {
        showAlert(fault.resolution_description, 'info');
    }
}

// Make functions globally available for onclick handlers
window.showFullDescription = showFullDescription;
window.showFullResolution = showFullResolution;
