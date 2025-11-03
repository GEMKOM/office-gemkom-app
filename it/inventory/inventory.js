import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { fetchMachines, fetchMachineTypes, fetchMachineUsedIn, updateMachine as apiUpdateMachine } from '../../../apis/machines.js';
import { authFetchUsers } from '../../../apis/users.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
import { StatisticsCards } from '../../../components/statistics-cards/statistics-cards.js';
import { TableComponent } from '../../../components/table/table.js';
import { DisplayModal } from '../../../components/display-modal/display-modal.js';
import { EditModal } from '../../../components/edit-modal/edit-modal.js';

// Header component instance
let headerComponent;

// Statistics Cards component instance
let inventoryStats = null;

// Filters component instance
let deviceFilters = null;

// Table component instance
let inventoryTable = null;

// Display Modal instances
let devicePropertiesModal = null;

// Edit Modal instance
let editDeviceModal = null;

// State management
let devices = [];
let machineTypes = [];
let users = [];
let currentPage = 1;
let isLoading = false;
let totalDevices = 0;
let currentSortField = null;
let currentSortDirection = 'asc';

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    await initNavbar();
    // Initialize header component
    initHeaderComponent();
    
    // Initialize Statistics Cards component
    inventoryStats = new StatisticsCards('inventory-statistics', {
        cards: [
            { title: 'Toplam Cihaz', value: '0', icon: 'fas fa-desktop', color: 'primary', id: 'total-devices' },
            { title: 'Aktif Cihaz', value: '0', icon: 'fas fa-check-circle', color: 'success', id: 'active-devices' },
            { title: 'Laptop', value: '0', icon: 'fas fa-laptop', color: 'info', id: 'laptops' },
            { title: 'Masaüstü', value: '0', icon: 'fas fa-desktop', color: 'warning', id: 'desktops' }
        ],
        compact: true,
        animation: true
    });
    
    await initializeInventory();
});

// Initialize header component
function initHeaderComponent() {
    headerComponent = new HeaderComponent({
        title: 'IT Envanter',
        subtitle: 'IT cihazlarının envanter takibi ve yönetimi',
        icon: 'desktop',
        showBackButton: 'block',
        showCreateButton: 'none', // Hide create button for inventory view
        showRefreshButton: 'block',
        refreshButtonText: 'Yenile',
        onBackClick: () => window.location.href = '/it/',
        onRefreshClick: async () => {
            // Reset to first page when refreshing
            currentPage = 1;
            await loadDeviceData();
        }
    });
}

async function initializeInventory() {
    try {
        // Initialize filters component
        initializeFiltersComponent();
        
        // Initialize table component
        initializeTableComponent();
        
        // Initialize display modals
        initializeDisplayModals();
        
        // Edit modal will be initialized dynamically when needed
        
        // Load metadata (types, users) once on full page load
        await loadMetadata();
        
        // Load initial data
        await loadDeviceData();
        
    } catch (error) {
        console.error('Error initializing inventory:', error);
    }
}

function initializeTableComponent() {
    inventoryTable = new TableComponent('inventory-table-container', {
        title: 'IT Cihaz Listesi',
        columns: [
            {
                field: 'id',
                label: 'ID',
                sortable: true,
                type: 'number',
                skeletonWidth: 50,
                formatter: (value) => value ?? '-'
            },
            {
                field: 'name',
                label: 'Cihaz Adı',
                sortable: true,
                formatter: (value) => `<strong>${value || '-'}</strong>`
            },
            {
                field: 'code',
                label: 'Kod',
                sortable: true,
                formatter: (value) => value || '-'
            },
            {
                field: 'machine_type_label',
                label: 'Cihaz Tipi',
                sortable: true,
                formatter: (value) => (value || '-')
            },
            {
                field: 'assigned_users',
                label: 'Atanan Kullanıcılar',
                sortable: false,
                formatter: (value, row) => {
                    if (!value || value.length === 0) return '-';
                    
                    // Display users directly in the table
                    const userNames = value.map(user => {
                        const firstName = user.first_name || '';
                        const lastName = user.last_name || '';
                        const fullName = `${firstName} ${lastName}`.trim();
                        return fullName || user.username;
                    });
                    
                    return userNames.join(', ');
                }
            },
            {
                field: 'is_active',
                label: 'Aktif',
                sortable: true,
                type: 'boolean',
                skeletonWidth: 60,
                formatter: (value) => (value ? '<span class="bool-indicator bool-yes">✓</span>' : '<span class="bool-indicator bool-no">✗</span>')
            },
            {
                field: 'is_under_maintenance',
                label: 'Bakımda',
                sortable: true,
                type: 'boolean',
                skeletonWidth: 80,
                formatter: (value) => (value ? '<span class="bool-indicator bool-yes">✓</span>' : '<span class="bool-indicator bool-no">✗</span>')
            },
            {
                field: 'properties',
                label: 'Özellikler',
                sortable: false,
                skeletonWidth: 120,
                formatter: (value, row) => {
                    const count = value && typeof value === 'object' ? Object.keys(value).length : 0;
                    if (count === 0) return 'Yok';
                    const btnId = `props-btn-${row.id}`;
                    return `
                        <button id="${btnId}" class="btn btn-sm btn-outline-info" type="button" onclick="window.showDeviceProperties(${row.id})">
                            <i class="fas fa-list me-1"></i>Özellikler (${count})
                        </button>
                    `;
                }
            }
        ],
        data: [],
        sortable: true,
        pagination: true,
        serverSidePagination: true,
        itemsPerPage: 20,
        refreshable: true,
        exportable: true,
        actions: [
            {
                key: 'edit',
                label: 'Düzenle',
                icon: 'fas fa-edit',
                class: 'btn-outline-primary',
                onClick: (row) => {
                    window.editDevice(row.id);
                }
            }
        ],
        onRefresh: async () => {
            // Reset to first page when refreshing
            currentPage = 1;
            await loadDeviceData();
        },
        onExport: (format) => {
            exportDevices(format);
        },
        onSort: async (field, direction) => {
            // Store current sort state
            currentSortField = field;
            currentSortDirection = direction;
            // Reset to first page when sorting
            currentPage = 1;
            await loadDeviceData();
        },
        onPageChange: async (page) => {
            currentPage = page;
            await loadDeviceData();
        },
        onPageSizeChange: async (newPageSize) => {
            // Update local variable to keep in sync
            itemsPerPage = newPageSize;
            // Ensure table component also has the correct value (should already be set, but ensure sync)
            if (inventoryTable) {
                inventoryTable.options.itemsPerPage = newPageSize;
            }
            // Reset to page 1 and load with new page size
            currentPage = 1;
            await loadDeviceData();
        },
        emptyMessage: 'IT cihazı bulunamadı',
        emptyIcon: 'fas fa-desktop'
    });
}

function initializeFiltersComponent() {
    // Initialize filters component
    deviceFilters = new FiltersComponent('filters-placeholder', {
        title: 'Cihaz Filtreleri',
        onApply: (values) => {
            // Reset to first page when applying filters
            currentPage = 1;
            loadDeviceData();
        },
        onClear: () => {
            // Reset to first page when clearing filters
            currentPage = 1;
            loadDeviceData();
        },
        onFilterChange: (filterId, value) => {
            // Optional: Handle individual filter changes
        }
    });

    // Add text filters
    deviceFilters.addTextFilter({
        id: 'name-filter',
        label: 'Cihaz Adı',
        placeholder: 'Cihaz adı',
        colSize: 3
    });

    deviceFilters.addTextFilter({
        id: 'code-filter',
        label: 'Cihaz Kodu',
        placeholder: 'Cihaz kodu',
        colSize: 3
    });

    // Add dropdown filters
    deviceFilters.addDropdownFilter({
        id: 'type-filter',
        label: 'Cihaz Tipi',
        options: [
            { value: '', label: 'Tüm Tipler' }
        ],
        placeholder: 'Tüm Tipler',
        colSize: 3
    });

    deviceFilters.addDropdownFilter({
        id: 'status-filter',
        label: 'Durum',
        options: [
            { value: '', label: 'Tümü' },
            { value: 'true', label: 'Aktif' },
            { value: 'false', label: 'Pasif' }
        ],
        placeholder: 'Tümü',
        colSize: 3
    });
}

function initializeDisplayModals() {
    // Device properties modal will be created dynamically when needed
    // No need to initialize it here since we destroy and recreate it each time
}

// Note: Edit modal event listeners are handled by the EditModal component

// Load device metadata that rarely changes (types and users) only on full page load
async function loadMetadata() {
    try {
        const [typesResponse, usersResponse] = await Promise.all([
            fetchMachineTypes(),
            authFetchUsers(1, 1000, {is_active: true})
        ]);

        machineTypes = typesResponse.results || typesResponse || [];
        users = usersResponse.results || usersResponse || [];

        // Populate filters and dropdowns
        updateFilterOptions();
    } catch (error) {
        console.error('Error loading metadata:', error);
    }
}

// Validate and adjust current page if needed
function validateCurrentPage() {
    if (inventoryTable && totalDevices > 0) {
        const totalPages = Math.ceil(totalDevices / inventoryTable.options.itemsPerPage);
        if (currentPage > totalPages) {
            currentPage = Math.max(1, totalPages);
        }
    }
}

async function loadDeviceData() {
    try {
        if (isLoading) return;
        
        isLoading = true;
        if (inventoryTable) {
            inventoryTable.setLoading(true);
        }

        // Collect filter values
        const filters = collectFilterValues();
        
        // Always filter for IT devices
        filters.used_in = 'it';

        // Build ordering parameter
        let ordering = null;
        if (currentSortField) {
            ordering = currentSortDirection === 'desc' ? `-${currentSortField}` : currentSortField;
        }

        // Load devices with current page and page size
        const pageSize = inventoryTable ? inventoryTable.options.itemsPerPage : 20;
        const devicesResponse = await fetchMachines(currentPage, pageSize, filters, ordering);
        
        // Extract devices and total count from response
        devices = devicesResponse.results || devicesResponse || [];
        totalDevices = devicesResponse.count || devicesResponse.total || devices.length;
        
        // Update table data with pagination info
        if (inventoryTable) {
            inventoryTable.updateData(devices, totalDevices, currentPage);
        }
        
        // Update filter options
        updateFilterOptions();
        
        // Update statistics
        updateDeviceCounts();
        
    } catch (error) {
        console.error('Error loading device data:', error);
        devices = [];
        totalDevices = 0;
        if (inventoryTable) {
            inventoryTable.updateData([], 0, currentPage);
        }
    } finally {
        isLoading = false;
        if (inventoryTable) {
            inventoryTable.setLoading(false);
        }
    }
}

function updateFilterOptions() {
    if (!deviceFilters) return;
    
    // Update device type filter options
    const typeOptions = [
        { value: '', label: 'Tüm Tipler' },
        ...machineTypes.map(type => ({ value: type.value, label: type.label }))
    ];
    deviceFilters.updateFilterOptions('type-filter', typeOptions);
}

function updateDeviceCounts() {
    try {
        // Use total count from API for total devices, but calculate others from current page data
        const totalCount = totalDevices;
        const activeCount = devices.filter(d => d.is_active === true).length;
        const laptopsCount = devices.filter(d => d.machine_type === 'Laptop').length;
        const desktopsCount = devices.filter(d => d.machine_type === 'Desktop' || d.machine_type === 'Bilgisayar').length;
        
        // Update statistics cards
        if (inventoryStats) {
            inventoryStats.updateValues({
                0: totalCount.toString(),
                1: activeCount.toString(),
                2: laptopsCount.toString(),
                3: desktopsCount.toString()
            });
        }
    } catch (error) {
        console.error('Error updating device counts:', error);
    }
}

async function exportDevices(format) {
    try {
        // Show loading message
        const exportBtn = document.querySelector('#inventory-table-container-export');
        if (exportBtn) {
            exportBtn.disabled = true;
            exportBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Dışa Aktarılıyor...';
        }
        
        // Collect filter values
        const filters = collectFilterValues();
        
        // Always filter for IT devices
        filters.used_in = 'it';
        
        // Build ordering parameter for export
        let ordering = null;
        if (currentSortField) {
            ordering = currentSortDirection === 'desc' ? `-${currentSortField}` : currentSortField;
        }
        
        // Fetch all devices for export (use a large page size)
        const devicesResponse = await fetchMachines(1, 10000, filters, ordering);
        const allDevices = devicesResponse.results || devicesResponse || [];
        
        if (allDevices.length === 0) {
            alert('Dışa aktarılacak cihaz bulunamadı');
            return;
        }
        
        // Prepare data for export (match visible columns)
        const headers = [
            'ID',
            'Cihaz Adı',
            'Cihaz Kodu',
            'Cihaz Tipi',
            'Aktif',
            'Bakımda',
            'Özellik Sayısı'
        ];
        
        const exportData = [
            headers,
            ...allDevices.map(device => [
                device.id ?? '',
                device.name || '',
                device.code || '',
                device.machine_type_label || '',
                device.is_active ? 'Evet' : 'Hayır',
                device.is_under_maintenance ? 'Evet' : 'Hayır',
                device.properties && typeof device.properties === 'object' ? Object.keys(device.properties).length : 0
            ])
        ];
        
        // Export based on format
        if (format === 'csv') {
            exportToCSV(exportData, 'it_envanter');
        } else if (format === 'excel') {
            exportToExcel(exportData, 'it_envanter');
        }
        
    } catch (error) {
        console.error('Export error:', error);
        alert('Dışa aktarma sırasında hata oluştu');
    } finally {
        // Reset export button
        const exportBtn = document.querySelector('#inventory-table-container-export');
        if (exportBtn) {
            exportBtn.disabled = false;
            exportBtn.innerHTML = '<i class="fas fa-download me-1"></i>Dışa Aktar';
        }
    }
}

function exportToCSV(data, filename) {
    const csvContent = data.map(row => 
        row.map(cell => `"${cell}"`).join(',')
    ).join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
}

function exportToExcel(data, filename) {
    // For Excel export, you would need a library like SheetJS
    // For now, we'll just show a message
    alert('Excel export özelliği yakında eklenecek');
}

// Global functions for actions
window.showDeviceProperties = function(deviceId) {
    const device = devices.find(d => String(d.id) === String(deviceId));
    if (!device) return;
    
    const props = device.properties && typeof device.properties === 'object' ? device.properties : {};
    const entries = Object.entries(props);
    
    // Destroy and recreate the modal to ensure clean state
    if (devicePropertiesModal) {
        devicePropertiesModal.destroy();
    }
    
    // Create a new modal instance
    devicePropertiesModal = new DisplayModal('device-properties-modal-container', {
        title: `Cihaz Özellikleri - ${device.name || 'Bilinmeyen Cihaz'}`,
        icon: 'fas fa-list',
        size: 'lg',
        showEditButton: false
    });
    
    if (entries.length === 0) {
        // Add a section with no properties message
        devicePropertiesModal.addCustomSection({
            title: 'Özellikler',
            icon: 'fas fa-list',
            iconColor: 'text-info',
            customContent: '<div class="text-muted text-center py-3">Bu cihaz için tanımlanmış özellik bulunamadı.</div>'
        });
    } else {
        // Add device properties section
        devicePropertiesModal.addSection({
            title: 'Cihaz Özellikleri',
            icon: 'fas fa-list',
            iconColor: 'text-info'
        });
        
        // Add each property as a field
        entries.forEach(([key, value]) => {
            devicePropertiesModal.addField({
                id: key,
                label: key,
                value: value,
                type: typeof value === 'boolean' ? 'boolean' : 'text',
                colSize: 6,
                copyable: true
            });
        });
    }
    
    // Render and show modal
    devicePropertiesModal.render().show();
};


// Collect current filter values
function collectFilterValues() {
    if (!deviceFilters) return {};
    
    const filterValues = deviceFilters.getFilterValues();
    const filters = {};
    
    // Map filter IDs to backend field names
    if (filterValues['name-filter']) {
        filters.name = filterValues['name-filter'];
    }
    
    if (filterValues['code-filter']) {
        filters.code = filterValues['code-filter'];
    }
    
    if (filterValues['type-filter']) {
        filters.machine_type = filterValues['type-filter'];
    }
    
    if (filterValues['status-filter']) {
        filters.is_active = filterValues['status-filter'];
    }
    
    return filters;
}

// Edit Device Functions
window.editDevice = function(deviceId) {
    // Check if deviceId is valid
    if (!deviceId) {
        alert('Geçersiz cihaz ID');
        return;
    }
    
    // Find the device data
    const device = devices.find(d => String(d.id) === String(deviceId));
    if (!device) {
        alert('Cihaz bulunamadı');
        return;
    }
    
    // Store the device ID for update
    window.editingDeviceId = deviceId;
    
    // Destroy existing modal if it exists
    if (editDeviceModal) {
        editDeviceModal.destroy();
    }
    
    // Create new EditModal instance
    editDeviceModal = new EditModal('edit-device-modal-container', {
        title: 'Cihaz Düzenle',
        icon: 'fas fa-edit',
        size: 'lg',
        saveButtonText: 'Kaydet',
        onSave: updateDevice,
        onCancel: () => {
            // Modal will close automatically
        }
    });
    
    // Add Basic Information Section
    editDeviceModal.addSection({
        id: 'basic-info',
        title: 'Temel Bilgiler',
        icon: 'fas fa-info-circle',
        iconColor: 'text-primary',
        fields: [
            {
                id: 'device-name',
                name: 'name',
                label: 'Cihaz Adı',
                type: 'text',
                value: device.name || '',
                placeholder: 'Cihaz adını girin',
                required: true,
                colSize: 6,
                icon: 'fas fa-laptop'
            },
            {
                id: 'device-code',
                name: 'code',
                label: 'Cihaz Kodu',
                type: 'text',
                value: device.code || '',
                placeholder: 'Cihaz kodunu girin',
                colSize: 6,
                icon: 'fas fa-barcode'
            },
            {
                id: 'device-type',
                name: 'machine_type',
                label: 'Cihaz Tipi',
                type: 'dropdown',
                value: device.machine_type || '',
                placeholder: 'Cihaz tipi seçin...',
                required: true,
                colSize: 6,
                icon: 'fas fa-tags',
                options: machineTypes.map(type => ({
                    value: type.value || type.id,
                    label: type.label || type.name
                }))
            },
            {
                id: 'assigned-users',
                name: 'assigned_users',
                label: 'Atanan Kullanıcılar',
                type: 'dropdown',
                value: device.assigned_users ? device.assigned_users.map(user => user.id) : [],
                placeholder: 'Kullanıcı seçin...',
                multiple: true,
                colSize: 6,
                icon: 'fas fa-users',
                options: users.map(user => ({
                    value: user.id,
                    label: user.first_name && user.last_name 
                        ? `${user.first_name} ${user.last_name}` 
                        : user.username
                }))
            },
            {
                id: 'used-in',
                name: 'used_in',
                label: 'Kullanım Alanı',
                type: 'dropdown',
                value: device.used_in || 'it',
                placeholder: 'Kullanım alanı seçin...',
                required: true,
                colSize: 6,
                icon: 'fas fa-building',
                options: [
                    { value: 'it', label: 'Bilgi İşlem' }
                ]
            },
            {
                id: 'device-status',
                name: 'is_active',
                label: 'Durum',
                type: 'dropdown',
                value: device.is_active ? 'active' : 'inactive',
                placeholder: 'Durum seçin...',
                colSize: 6,
                icon: 'fas fa-info-circle',
                options: [
                    { value: 'active', label: 'Aktif' },
                    { value: 'inactive', label: 'Pasif' }
                ]
            }
        ]
    });
    
    // Render and show modal first
    editDeviceModal.render().show();
    
    // Add dynamic properties section after modal is rendered
    setTimeout(() => {
        addDynamicPropertiesSection(device.properties);
    }, 100);
};

// Dynamic Properties Management Functions
function addDynamicPropertiesSection(deviceProperties) {
    const modalBody = document.querySelector('#editModal .modal-body');
    if (!modalBody) return;
    
    // Create properties section
    const propertiesSection = document.createElement('div');
    propertiesSection.className = 'form-section compact mb-3';
    propertiesSection.innerHTML = `
        <h6 class="section-subtitle compact text-info">
            <i class="fas fa-list me-2"></i>Özellikler
            <button type="button" class="btn btn-sm btn-outline-success ms-2" id="add-property-btn">
                <i class="fas fa-plus me-1"></i>Özellik Ekle
            </button>
        </h6>
        <div id="edit-properties-list">
            <!-- Property rows will be added here -->
        </div>
    `;
    
    // Add to modal body
    modalBody.appendChild(propertiesSection);
    
    // Add event listener for add button
    const addBtn = document.getElementById('add-property-btn');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            addPropertyRow('', '', 'edit');
        });
    }
    
    // Load existing properties
    const props = deviceProperties && typeof deviceProperties === 'object' ? deviceProperties : {};
    const entries = Object.entries(props);
    
    if (entries.length === 0) {
        // Add one empty row if no properties
        addPropertyRow('', '', 'edit');
    } else {
        // Add existing properties
        entries.forEach(([key, value]) => {
            addPropertyRow(key, String(value), 'edit');
        });
    }
}

function addPropertyRow(key = '', value = '', target = 'edit') {
    const list = document.getElementById('edit-properties-list');
    if (!list) return;
    
    const row = document.createElement('div');
    row.className = 'col-12 mb-2';
    row.innerHTML = `
        <div class="row g-2 align-items-center">
            <div class="col-md-5">
                <input type="text" class="form-control form-control-sm prop-key" placeholder="Özellik adı" value="${key}">
            </div>
            <div class="col-md-5">
                <input type="text" class="form-control form-control-sm prop-value" placeholder="Değer" value="${value}">
            </div>
            <div class="col-md-2 d-grid">
                <button type="button" class="btn btn-sm btn-outline-danger remove-prop-btn">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `;
    list.appendChild(row);
    
    // Add remove event listener
    row.querySelector('.remove-prop-btn')?.addEventListener('click', () => {
        row.remove();
    });
}

function collectPropertiesFromForm(target = 'edit') {
    const list = document.getElementById('edit-properties-list');
    if (!list) return {};
    
    const props = {};
    const rows = list.querySelectorAll('.row');
    rows.forEach(r => {
        const keyInput = r.querySelector('.prop-key');
        const valueInput = r.querySelector('.prop-value');
        const key = keyInput?.value?.trim();
        const value = valueInput?.value?.trim();
        if (key) {
            // Try to coerce booleans and numbers for simple UX
            let parsed = value;
            if (value === 'true') parsed = true;
            else if (value === 'false') parsed = false;
            else if (!isNaN(value) && value !== '') parsed = Number(value);
            props[key] = parsed ?? '';
        }
    });
    return props;
}

// Update device function
async function updateDevice() {
    const deviceId = window.editingDeviceId;
    if (!deviceId || !editDeviceModal) {
        alert('Düzenlenecek cihaz bulunamadı');
        return;
    }
    
    // Get form data from EditModal
    const formData = editDeviceModal.getFormData();
    
    // Handle assigned users (convert from array of IDs to array of user objects)
    const assignedUserIds = formData['assigned_users'] || [];
    const assignedUsers = assignedUserIds.map(userId => parseInt(userId));
    
    // Handle properties (collect from dynamic form)
    const properties = collectPropertiesFromForm('edit');
    
    const deviceData = {
        name: formData['name'],
        code: formData['code'] || null,
        machine_type: formData['machine_type'],
        used_in: formData['used_in'],
        is_active: formData['is_active'] === 'active',
        assigned_users: assignedUsers,
        properties: properties
    };
    
    try {
        const updated = await apiUpdateMachine(deviceId, deviceData);
        if (updated) {
            alert('Cihaz başarıyla güncellendi');
            
            // Hide modal
            editDeviceModal.hide();
            
            // Reload data
            await loadDeviceData();
        } else {
            alert('Cihaz güncellenirken hata oluştu');
        }
    } catch (error) {
        console.error('Error updating device:', error);
        alert('Cihaz güncellenirken hata oluştu: ' + error.message);
    }
}

// Note: Edit modal dropdowns are populated dynamically when creating the modal
