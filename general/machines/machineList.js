import { guardRoute } from '../../authService.js';
import { initNavbar } from '../../components/navbar.js';
import { fetchMachines, fetchMachineTypes, fetchMachineUsedIn, createMachine as apiCreateMachine, updateMachine as apiUpdateMachine, deleteMachine as apiDeleteMachine } from '../../apis/machines.js';
import { fetchUsers } from '../../apis/users.js';
import { authedFetch } from '../../authService.js';
import { backendBase } from '../../base.js';
import { HeaderComponent } from '../../components/header/header.js';
import { FiltersComponent } from '../../components/filters/filters.js';
import { StatisticsCards } from '../../components/statistics-cards/statistics-cards.js';
import { TableComponent } from '../../components/table/table.js';
import { DisplayModal } from '../../components/display-modal/display-modal.js';
import { EditModal } from '../../components/edit-modal/edit-modal.js';
import { initRouteProtection } from '../../apis/routeProtection.js';

// Header component instance
let headerComponent;

// Statistics Cards component instance
let machinesStats = null;

// Filters component instance
let machineFilters = null;

// Table component instance
let machinesTable = null;

// Modal component instances
let createMachineModal = null;
let editMachineModal = null;
let displayMachineModal = null;
let displayUsersModal = null;

// State management
let machines = [];
let machineTypes = [];
let machineUsedInOptions = [];
let users = []; // Store users for assigned_users dropdown
let currentPage = 1;
let isLoading = false;
let totalMachines = 0; // Added for pagination validation
let currentSortField = null;
let currentSortDirection = 'asc';

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
    initHeaderComponent();
    
    // Initialize Statistics Cards component
    machinesStats = new StatisticsCards('machines-statistics', {
        cards: [
            { title: 'Toplam Makine', value: '0', icon: 'fas fa-cogs', color: 'primary', id: 'total-machines' },
            { title: 'Aktif Makine', value: '0', icon: 'fas fa-check-circle', color: 'success', id: 'active-machines' },
            { title: 'Makine Tipi', value: '0', icon: 'fas fa-tags', color: 'info', id: 'machine-types' },
            { title: 'Kullanım Alanı', value: '0', icon: 'fas fa-building', color: 'warning', id: 'usage-areas' }
        ],
        compact: true,
        animation: true
    });
    
    // Initialize modal components
    initializeModalComponents();
    
    await initializeMachineList();
});

// Initialize header component
function initHeaderComponent() {
    headerComponent = new HeaderComponent({
        title: 'Makine Yönetimi',
        subtitle: 'Şirket makinelerinin yönetimi ve bilgi güncelleme',
        icon: 'cogs',
        showBackButton: 'block',
        showCreateButton: 'block',
        showRefreshButton: 'block',
        createButtonText: 'Yeni Makine',
        refreshButtonText: 'Yenile',
        onBackClick: () => window.location.href = '/general/',
        onCreateClick: () => {
            showCreateMachineModal();
        },
        onRefreshClick: async () => {
            // Reset to first page when refreshing
            currentPage = 1;
            await loadMachineData();
        }
    });
}

// Initialize modal components
function initializeModalComponents() {
    // Create Machine Modal
    createMachineModal = new EditModal('create-machine-modal-container', {
        title: 'Yeni Makine Oluştur',
        icon: 'fas fa-plus-circle',
        saveButtonText: 'Makine Oluştur',
        size: 'lg'
    });

    // Edit Machine Modal
    editMachineModal = new EditModal('edit-machine-modal-container', {
        title: 'Makine Düzenle',
        icon: 'fas fa-edit',
        saveButtonText: 'Değişiklikleri Kaydet',
        size: 'lg'
    });

    // Display Machine Modal
    displayMachineModal = new DisplayModal('display-machine-modal-container', {
        title: 'Makine Özellikleri',
        icon: 'fas fa-list',
        showEditButton: true,
        editButtonText: 'Düzenle',
        size: 'lg'
    });

    // Display Users Modal
    displayUsersModal = new DisplayModal('display-users-modal-container', {
        title: 'Atanan Kullanıcılar',
        icon: 'fas fa-users',
        size: 'lg'
    });

    // Set up modal callbacks
    setupModalCallbacks();
}

// Set up modal callbacks
function setupModalCallbacks() {
    // Create machine modal callbacks
    createMachineModal.onSaveCallback(async (formData) => {
        await saveMachine(formData);
    });

    // Edit machine modal callbacks
    editMachineModal.onSaveCallback(async (formData) => {
        await updateMachine(formData);
    });

    // Display machine modal callbacks
    displayMachineModal.onEditCallback((data) => {
        displayMachineModal.hide();
        const machineId = window.currentDisplayedMachineId;
        if (machineId) {
            window.editMachine(machineId);
        }
    });
}

// Show create machine modal
function showCreateMachineModal() {
    // Clear and configure the create modal - ensure complete reset
    createMachineModal.clearAll();
    
    // Add basic information section
    createMachineModal.addSection({
        title: 'Temel Bilgiler',
        icon: 'fas fa-info-circle',
        iconColor: 'text-primary'
    });

    // Add fields
    createMachineModal.addField({
        id: 'machine-name',
        name: 'name',
        label: 'Makine Adı',
        type: 'text',
        placeholder: 'Makine adını girin',
        required: true,
        icon: 'fas fa-cogs',
        colSize: 6,
        help: 'Makinenin tanımlayıcı adı'
    });

    createMachineModal.addField({
        id: 'machine-code',
        name: 'code',
        label: 'Makine Kodu',
        type: 'text',
        placeholder: 'Makine kodunu girin',
        icon: 'fas fa-barcode',
        colSize: 6,
        help: 'Opsiyonel, benzersiz makine kodu'
    });

    createMachineModal.addField({
        id: 'machine-type',
        name: 'machine_type',
        label: 'Makine Tipi',
        type: 'select',
        placeholder: 'Makine tipi seçin...',
        required: true,
        icon: 'fas fa-tags',
        colSize: 6,
        help: 'Makinenin kategorisi',
        options: machineTypes.map(type => ({ value: type.value, label: type.label }))
    });

    createMachineModal.addField({
        id: 'machine-assigned-users',
        name: 'assigned_users',
        label: 'Atanan Kullanıcılar',
        type: 'select',
        placeholder: 'Kullanıcı seçin...',
        icon: 'fas fa-users',
        colSize: 6,
        help: 'Bu makineden sorumlu kullanıcılar',
        multiple: true,
        options: users.map(user => ({ 
            value: user.id, 
            label: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username 
        }))
    });

    createMachineModal.addField({
        id: 'machine-used-in',
        name: 'used_in',
        label: 'Kullanım Alanı',
        type: 'select',
        placeholder: 'Kullanım alanı seçin...',
        required: true,
        icon: 'fas fa-building',
        colSize: 6,
        help: 'Makinenin kullanıldığı alan',
        options: machineUsedInOptions.map(option => ({ value: option.value, label: option.label }))
    });

    createMachineModal.addField({
        id: 'machine-status',
        name: 'is_active',
        label: 'Durum',
        type: 'select',
        icon: 'fas fa-info-circle',
        colSize: 6,
        help: 'Makinenin mevcut durumu',
        options: [
            { value: 'true', label: 'Aktif' },
            { value: 'false', label: 'Pasif' }
        ],
        value: 'true'
    });

    // Add properties section
    createMachineModal.addSection({
        title: 'Özellikler',
        icon: 'fas fa-list',
        iconColor: 'text-info'
    });

    createMachineModal.addField({
        id: 'properties',
        name: 'properties',
        label: 'Makine Özellikleri',
        type: 'textarea',
        placeholder: 'Özellikleri JSON formatında girin (örn: {"kapasite": "1000", "güç": "5kW"})',
        icon: 'fas fa-list',
        colSize: 12,
        help: 'Makine özelliklerini JSON formatında girin',
        rows: 4
    });

    // Render and show modal
    createMachineModal.render();
    createMachineModal.show();
}

// Show edit machine modal
function showEditMachineModal(machineId) {
    const machine = machines.find(m => String(m.id) === String(machineId));
    if (!machine) {
        alert('Makine bulunamadı');
        return;
    }

    // Store the machine ID for update
    window.editingMachineId = machineId;

    // Clear and configure the edit modal - ensure complete reset
    editMachineModal.clearAll();
    
    // Add basic information section
    editMachineModal.addSection({
        title: 'Temel Bilgiler',
        icon: 'fas fa-info-circle',
        iconColor: 'text-primary'
    });

    // Add fields with current values
    editMachineModal.addField({
        id: 'edit-machine-name',
        name: 'name',
        label: 'Makine Adı',
        type: 'text',
        placeholder: 'Makine adını girin',
        required: true,
        icon: 'fas fa-cogs',
        colSize: 6,
        help: 'Makinenin tanımlayıcı adı',
        value: machine.name || ''
    });

    editMachineModal.addField({
        id: 'edit-machine-code',
        name: 'code',
        label: 'Makine Kodu',
        type: 'text',
        placeholder: 'Makine kodunu girin',
        icon: 'fas fa-barcode',
        colSize: 6,
        help: 'Opsiyonel, benzersiz makine kodu',
        value: machine.code || ''
    });

    editMachineModal.addField({
        id: 'edit-machine-type',
        name: 'machine_type',
        label: 'Makine Tipi',
        type: 'select',
        placeholder: 'Makine tipi seçin...',
        required: true,
        icon: 'fas fa-tags',
        colSize: 6,
        help: 'Makinenin kategorisi',
        options: machineTypes.map(type => ({ value: type.value, label: type.label })),
        value: machine.machine_type || machine.type_id || ''
    });

    editMachineModal.addField({
        id: 'edit-machine-assigned-users',
        name: 'assigned_users',
        label: 'Atanan Kullanıcılar',
        type: 'select',
        placeholder: 'Kullanıcı seçin...',
        icon: 'fas fa-users',
        colSize: 6,
        help: 'Bu makineden sorumlu kullanıcılar',
        multiple: true,
        options: users.map(user => ({ 
            value: user.id, 
            label: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username 
        })),
        value: machine.assigned_users ? machine.assigned_users.map(user => 
            typeof user === 'object' ? user.id : user
        ) : []
    });

    editMachineModal.addField({
        id: 'edit-machine-used-in',
        name: 'used_in',
        label: 'Kullanım Alanı',
        type: 'select',
        placeholder: 'Kullanım alanı seçin...',
        required: true,
        icon: 'fas fa-building',
        colSize: 6,
        help: 'Makinenin kullanıldığı alan',
        options: machineUsedInOptions.map(option => ({ value: option.value, label: option.label })),
        value: machine.used_in || ''
    });

    editMachineModal.addField({
        id: 'edit-machine-status',
        name: 'is_active',
        label: 'Durum',
        type: 'select',
        icon: 'fas fa-info-circle',
        colSize: 6,
        help: 'Makinenin mevcut durumu',
        options: [
            { value: 'true', label: 'Aktif' },
            { value: 'false', label: 'Pasif' }
        ],
        value: machine.is_active ? 'true' : 'false'
    });

    // Add properties section
    editMachineModal.addSection({
        title: 'Özellikler',
        icon: 'fas fa-list',
        iconColor: 'text-info'
    });

    const propertiesJson = machine.properties && typeof machine.properties === 'object' 
        ? JSON.stringify(machine.properties, null, 2) 
        : '';

    editMachineModal.addField({
        id: 'edit-properties',
        name: 'properties',
        label: 'Makine Özellikleri',
        type: 'textarea',
        placeholder: 'Özellikleri JSON formatında girin (örn: {"kapasite": "1000", "güç": "5kW"})',
        icon: 'fas fa-list',
        colSize: 12,
        help: 'Makine özelliklerini JSON formatında girin',
        rows: 4,
        value: propertiesJson
    });

    // Render and show modal
    editMachineModal.render();
    editMachineModal.show();
}

// Show machine properties modal
function showMachinePropertiesModal(machineId) {
    const machine = machines.find(m => String(m.id) === String(machineId));
    if (!machine) {
        alert('Makine bulunamadı');
        return;
    }

    // Store the machine ID for edit functionality
    window.currentDisplayedMachineId = machineId;

    // Clear and configure the display modal - ensure complete reset
    displayMachineModal.clearData();
    
    // Add basic information section
    displayMachineModal.addSection({
        title: 'Temel Bilgiler',
        icon: 'fas fa-info-circle',
        iconColor: 'text-primary'
    });

    // Add fields
    displayMachineModal.addField({
        id: 'display-name',
        name: 'name',
        label: 'Makine Adı',
        type: 'text',
        value: machine.name || '-',
        icon: 'fas fa-cogs',
        colSize: 6
    });

    displayMachineModal.addField({
        id: 'display-code',
        name: 'code',
        label: 'Makine Kodu',
        type: 'text',
        value: machine.code || '-',
        icon: 'fas fa-barcode',
        colSize: 6
    });

    displayMachineModal.addField({
        id: 'display-type',
        name: 'machine_type',
        label: 'Makine Tipi',
        type: 'text',
        value: machine.machine_type_label || '-',
        icon: 'fas fa-tags',
        colSize: 6
    });

    displayMachineModal.addField({
        id: 'display-used-in',
        name: 'used_in',
        label: 'Kullanım Alanı',
        type: 'text',
        value: machine.used_in_label || '-',
        icon: 'fas fa-building',
        colSize: 6
    });

    displayMachineModal.addField({
        id: 'display-status',
        name: 'is_active',
        label: 'Durum',
        type: 'boolean',
        value: machine.is_active,
        icon: 'fas fa-info-circle',
        colSize: 6
    });

    displayMachineModal.addField({
        id: 'display-maintenance',
        name: 'is_under_maintenance',
        label: 'Bakımda',
        type: 'boolean',
        value: machine.is_under_maintenance,
        icon: 'fas fa-wrench',
        colSize: 6
    });

    // Add properties section if they exist
    const props = machine.properties && typeof machine.properties === 'object' ? machine.properties : {};
    const propEntries = Object.entries(props);
    
    if (propEntries.length > 0) {
        displayMachineModal.addSection({
            title: 'Özellikler',
            icon: 'fas fa-list',
            iconColor: 'text-info'
        });

        propEntries.forEach(([key, value]) => {
            displayMachineModal.addField({
                id: `prop-${key}`,
                name: key,
                label: key,
                type: 'text',
                value: value,
                icon: 'fas fa-tag',
                colSize: 6
            });
        });
    }

    // Render and show modal
    displayMachineModal.render();
    displayMachineModal.show();
}

// Show assigned users modal
function showAssignedUsersModal(machineId) {
    const machine = machines.find(m => String(m.id) === String(machineId));
    if (!machine) {
        alert('Makine bulunamadı');
        return;
    }

    // Clear and configure the display modal - ensure complete reset
    displayUsersModal.clearData();
    
    // Add assigned users section
    displayUsersModal.addSection({
        title: 'Atanan Kullanıcılar',
        icon: 'fas fa-users',
        iconColor: 'text-primary'
    });

    const assignedUsers = machine.assigned_users || [];
    
    if (assignedUsers.length === 0) {
        displayUsersModal.addField({
            id: 'no-users',
            name: 'message',
            label: 'Bilgi',
            type: 'text',
            value: 'Atanmış kullanıcı bulunamadı',
            icon: 'fas fa-info-circle',
            colSize: 12
        });
    } else {
        assignedUsers.forEach((user, index) => {
            // Check if user is an object (new format) or just an ID (old format)
            let userName;
            let userId;
            
            if (typeof user === 'object' && user !== null) {
                // New format: user object with id, username, first_name, last_name
                userId = user.id;
                userName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;
            } else {
                // Old format: just user ID
                userId = user;
                const userObj = users.find(u => u.id === userId);
                userName = userObj ? `${userObj.first_name || ''} ${userObj.last_name || ''}`.trim() || userObj.username : `Kullanıcı ID: ${userId}`;
            }
            
            displayUsersModal.addField({
                id: `user-${userId}`,
                name: `user_${userId}`,
                label: `Kullanıcı ${index + 1}`,
                type: 'text',
                value: userName,
                icon: 'fas fa-user',
                colSize: 6
            });
        });
    }

    // Render and show modal
    displayUsersModal.render();
    displayUsersModal.show();
}

async function initializeMachineList() {
    try {
        // Initialize filters component
        initializeFiltersComponent();
        
        // Initialize table component
        initializeTableComponent();
        
        // Load metadata (types, used_in) once on full page load
        await loadMetadata();
        
        // Load initial data
        await loadMachineData();
        
        // Add event listeners
        setupEventListeners();
        
    } catch (error) {
        // Error initializing machine list
    }
}

function initializeTableComponent() {
    machinesTable = new TableComponent('machines-table-container', {
        title: 'Makine Listesi',
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
                label: 'Makine Adı',
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
                field: 'used_in_label',
                label: 'Kullanım Alanı',
                sortable: true,
                formatter: (value) => (value || '-')
            },
            {
                field: 'machine_type_label',
                label: 'Makine Tipi',
                sortable: true,
                formatter: (value) => (value || '-')
            },
            {
                field: 'assigned_users',
                label: 'Atanan Kullanıcılar',
                sortable: false,
                formatter: (value, row) => {
                    if (!value || value.length === 0) return '-';
                    const count = value.length;
                    const btnId = `users-btn-${row.id}`;
                    return `
                        <button id="${btnId}" class="btn btn-sm btn-outline-primary" type="button" onclick="window.showAssignedUsers(${row.id})">
                            <i class="fas fa-users me-1"></i>Kullanıcılar (${count})
                        </button>
                    `;
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
                        <button id="${btnId}" class="btn btn-sm btn-outline-info" type="button" onclick="window.showMachineProperties(${row.id})">
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
        onRefresh: async () => {
            // Reset to first page when refreshing
            currentPage = 1;
            await loadMachineData();
        },
        onExport: (format) => {
            exportMachines(format);
        },
        onSort: async (field, direction) => {
            // Store current sort state
            currentSortField = field;
            currentSortDirection = direction;
            // Reset to first page when sorting
            currentPage = 1;
            await loadMachineData();
        },
        onPageChange: async (page) => {
            currentPage = page;
            await loadMachineData();
        },
        actions: [
            {
                key: 'edit',
                label: 'Düzenle',
                icon: 'fas fa-edit',
                class: 'btn-outline-primary',
                onClick: (row) => {
                    window.editMachine(row.id);
                }
            },
            {
                key: 'delete',
                label: 'Sil',
                icon: 'fas fa-trash',
                class: 'btn-outline-danger',
                onClick: (row) => window.deleteMachine(row.id, row.name)
            }
        ],
        emptyMessage: 'Makine bulunamadı',
        emptyIcon: 'fas fa-cogs'
    });
}

function initializeFiltersComponent() {
    // Initialize filters component
    machineFilters = new FiltersComponent('filters-placeholder', {
        title: 'Makine Filtreleri',
        onApply: (values) => {
            // Reset to first page when applying filters
            currentPage = 1;
            loadMachineData();
        },
        onClear: () => {
            // Reset to first page when clearing filters
            currentPage = 1;
            loadMachineData();
        },
        onFilterChange: (filterId, value) => {
            // Optional: Handle individual filter changes
        }
    });

    // Add text filters
    machineFilters.addTextFilter({
        id: 'name-filter',
        label: 'Makine Adı',
        placeholder: 'Makine adı',
        colSize: 3
    });

    machineFilters.addTextFilter({
        id: 'code-filter',
        label: 'Makine Kodu',
        placeholder: 'Makine kodu',
        colSize: 3
    });

    // Add dropdown filters
    machineFilters.addDropdownFilter({
        id: 'type-filter',
        label: 'Makine Tipi',
        options: [
            { value: '', label: 'Tüm Tipler' }
        ],
        placeholder: 'Tüm Tipler',
        colSize: 3
    });

    machineFilters.addDropdownFilter({
        id: 'used-in-filter',
        label: 'Kullanım Alanı',
        options: [
            { value: '', label: 'Tümü' },
            { value: 'machining', label: 'Talaşlı İmalat' },
            { value: 'welding', label: 'Kaynak' },
            { value: 'assembly', label: 'Montaj' },
            { value: 'other', label: 'Diğer' }
        ],
        placeholder: 'Tümü',
        colSize: 3
    });

    machineFilters.addDropdownFilter({
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

// Load machine metadata that rarely changes (types and used_in) only on full page load
async function loadMetadata() {
    try {
        const [typesResponse, usedInResponse, usersResponse] = await Promise.all([
            fetchMachineTypes(),
            fetchMachineUsedIn(),
            fetchUsers()
        ]);

        machineTypes = typesResponse.results || typesResponse || [];
        machineUsedInOptions = usedInResponse.results || usedInResponse || [];
        users = usersResponse || [];

        // Populate filters
        updateFilterOptions();
    } catch (error) {
        // Error loading machine metadata
    }
}

// Validate and adjust current page if needed
function validateCurrentPage() {
    if (machinesTable && totalMachines > 0) {
        const totalPages = Math.ceil(totalMachines / machinesTable.options.itemsPerPage);
        if (currentPage > totalPages) {
            currentPage = Math.max(1, totalPages);
        }
    }
}

async function loadMachineData() {
    try {
        if (isLoading) return;
        
        isLoading = true;
        if (machinesTable) {
            machinesTable.setLoading(true);
        }

        // Collect filter values
        const filters = collectFilterValues();

        // Build ordering parameter
        let ordering = null;
        if (currentSortField) {
            ordering = currentSortDirection === 'desc' ? `-${currentSortField}` : currentSortField;
        }

        // Load machines with current page and page size
        const pageSize = machinesTable ? machinesTable.options.itemsPerPage : 20;
        const machinesResponse = await fetchMachines(currentPage, pageSize, filters, ordering);
        
        // Extract machines and total count from response
        machines = machinesResponse.results || machinesResponse || [];
        totalMachines = machinesResponse.count || machinesResponse.total || machines.length;
        
        // Update table data with pagination info
        if (machinesTable) {
            machinesTable.updateData(machines, totalMachines, currentPage);
        }
        
        // Show message if no results found
        if (machines.length === 0 && totalMachines === 0) {
            // No results found - this will be handled by the table component's empty state
        }
        
        // Update filter options
        updateFilterOptions();
        
        // Update statistics
        updateMachineCounts();
        
    } catch (error) {
        // Error loading machine data
        machines = [];
        totalMachines = 0;
        if (machinesTable) {
            machinesTable.updateData([], 0, currentPage);
        }
    } finally {
        isLoading = false;
        if (machinesTable) {
            machinesTable.setLoading(false);
        }
    }
}

function updateFilterOptions() {
    if (!machineFilters) return;
    
    // Update machine type filter options
    const typeOptions = [
        { value: '', label: 'Tüm Tipler' },
        ...machineTypes.map(type => ({ value: type.value, label: type.label }))
    ];
    machineFilters.updateFilterOptions('type-filter', typeOptions);
    
    // Update used_in filter options
    const usedInOptions = [
        { value: '', label: 'Tüm Alanlar' },
        ...machineUsedInOptions.map(option => ({ value: option.value, label: option.label }))
    ];
    machineFilters.updateFilterOptions('used-in-filter', usedInOptions);
}

function updateMachineCounts() {
    try {
        // Use total count from API for total machines, but calculate others from current page data
        const totalCount = totalMachines;
        const activeCount = machines.filter(m => m.is_active === true).length;
        const typesCount = new Set(machines.map(m => m.type_label).filter(Boolean)).size;
        const usageAreasCount = new Set(machines.map(m => m.used_in).filter(Boolean)).size;
        
        // Update statistics cards
        if (machinesStats) {
            machinesStats.updateValues({
                0: totalCount.toString(),
                1: activeCount.toString(),
                2: typesCount.toString(),
                3: usageAreasCount.toString()
            });
        }
    } catch (error) {
        // Error updating machine counts
    }
}

async function exportMachines(format) {
    try {
        // Show loading message
        const exportBtn = document.querySelector('#machines-table-container-export');
        if (exportBtn) {
            exportBtn.disabled = true;
            exportBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Dışa Aktarılıyor...';
        }
        
        // Collect filter values
        const filters = collectFilterValues();
        
        // Build ordering parameter for export
        let ordering = null;
        if (currentSortField) {
            ordering = currentSortDirection === 'desc' ? `-${currentSortField}` : currentSortField;
        }
        
        // Fetch all machines for export (use a large page size)
        const machinesResponse = await fetchMachines(1, 10000, filters, ordering);
        const allMachines = machinesResponse.results || machinesResponse || [];
        
        if (allMachines.length === 0) {
            alert('Dışa aktarılacak makine bulunamadı');
            return;
        }
        
        // Prepare data for export (match visible columns)
        const headers = [
            'ID',
            'Makine Adı',
            'Makine Tipi',
            'Kullanım Alanı',
            'Aktif',
            'Bakımda',
            'Özellik Sayısı'
        ];
        
        const exportData = [
            headers,
            ...allMachines.map(machine => [
                machine.id ?? '',
                machine.name || '',
                machine.machine_type_label || '',
                machine.used_in_label || '',
                machine.is_active ? 'Evet' : 'Hayır',
                machine.is_under_maintenance ? 'Evet' : 'Hayır',
                machine.properties && typeof machine.properties === 'object' ? Object.keys(machine.properties).length : 0
            ])
        ];
        
        // Export based on format
        if (format === 'csv') {
            exportToCSV(exportData, 'makineler');
        } else if (format === 'excel') {
            exportToExcel(exportData, 'makineler');
        }
        
    } catch (error) {
        // Error exporting machines
        alert('Dışa aktarma sırasında hata oluştu');
        console.error('Export error:', error);
    } finally {
        // Reset export button
        const exportBtn = document.querySelector('#machines-table-container-export');
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

function setupEventListeners() {
    // Confirm delete button
    document.getElementById('confirm-delete-machine-btn')?.addEventListener('click', async () => {
        const machineId = window.pendingDeleteMachineId;
        if (!machineId) return;
        
        try {
            const result = await apiDeleteMachine(machineId);
            
            if (result) {
                alert('Makine silindi');
                // Hide the modal
                bootstrap.Modal.getInstance(document.getElementById('deleteMachineConfirmModal')).hide();
                // Clear the pending delete key
                window.pendingDeleteMachineId = null;
                // Reload machines
                await loadMachineData();
            }
        } catch (error) {
            // Error deleting machine
            alert('Makine silinirken hata oluştu');
        }
    });
}

// Global functions for actions
window.editMachine = function(machineId) {
    showEditMachineModal(machineId);
};

window.deleteMachine = function(machineId, machineName) {
    window.pendingDeleteMachineId = machineId;
    document.getElementById('delete-machine-name').textContent = machineName;
    
    const modal = new bootstrap.Modal(document.getElementById('deleteMachineConfirmModal'));
    modal.show();
};

// Show machine properties in a modal without overcrowding the table
window.showMachineProperties = function(machineId) {
    showMachinePropertiesModal(machineId);
};

window.showAssignedUsers = function(machineId) {
    showAssignedUsersModal(machineId);
};

async function saveMachine(formData) {
    try {
        // Parse properties if provided as JSON string
        let properties = {};
        if (formData.properties && typeof formData.properties === 'string') {
            try {
                properties = JSON.parse(formData.properties);
            } catch (e) {
                alert('Özellikler JSON formatında değil. Lütfen doğru formatta girin.');
                return;
            }
        }

        const machineData = {
            name: formData.name,
            code: formData.code || null,
            machine_type: formData.machine_type,
            used_in: formData.used_in,
            is_active: formData.is_active === 'true',
            assigned_users: Array.isArray(formData.assigned_users) ? formData.assigned_users : [],
            properties: properties
        };
        
        const created = await apiCreateMachine(machineData);
        if (created) {
            alert('Makine başarıyla oluşturuldu');
            
            // Hide modal
            createMachineModal.hide();
            
            // Reload machines
            await loadMachineData();
        }
    } catch (error) {
        // Error creating machine
        alert(error.message || 'Makine oluşturulurken hata oluştu');
    }
}

async function updateMachine(formData) {
    const machineId = window.editingMachineId;
    if (!machineId) {
        alert('Düzenlenecek makine bulunamadı');
        return;
    }
    
    try {
        // Parse properties if provided as JSON string
        let properties = {};
        if (formData.properties && typeof formData.properties === 'string') {
            try {
                properties = JSON.parse(formData.properties);
            } catch (e) {
                alert('Özellikler JSON formatında değil. Lütfen doğru formatta girin.');
                return;
            }
        }

        const machineData = {
            name: formData.name,
            code: formData.code || null,
            machine_type: formData.machine_type,
            used_in: formData.used_in,
            is_active: formData.is_active === 'true',
            assigned_users: Array.isArray(formData.assigned_users) ? formData.assigned_users : [],
            properties: properties
        };
        
        const updated = await apiUpdateMachine(machineId, machineData);
        if (updated) {
            alert('Makine başarıyla güncellendi');
            
            // Hide modal
            editMachineModal.hide();
            
            // Clear the editing machine ID
            window.editingMachineId = null;
            
            // Reload machines
            await loadMachineData();
        }
    } catch (error) {
        // Error updating machine
        alert(error.message || 'Makine güncellenirken hata oluştu');
    }
}


// Helper function for notifications
function showNotification(message, type = 'info') {
    // You can implement your own notification system here
    
    // Simple alert for now
    alert(`${type.toUpperCase()}: ${message}`);
} 


// Collect current filter values
function collectFilterValues() {
    if (!machineFilters) return {};
    
    const filterValues = machineFilters.getFilterValues();
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
    
    if (filterValues['used-in-filter']) {
        filters.used_in = filterValues['used-in-filter'];
    }
    
    if (filterValues['status-filter']) {
        filters.is_active = filterValues['status-filter'];
    }
    
    return filters;
} 