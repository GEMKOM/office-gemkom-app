import { guardRoute } from '../../authService.js';
import { initNavbar } from '../../components/navbar.js';
import { fetchMachines, fetchMachineTypes, fetchMachineUsedIn, createMachine as apiCreateMachine, updateMachine as apiUpdateMachine, deleteMachine as apiDeleteMachine } from '../../generic/machines.js';
import { fetchUsers } from '../../generic/users.js';
import { authedFetch } from '../../authService.js';
import { backendBase } from '../../base.js';
import { HeaderComponent } from '../../components/header/header.js';
import { FiltersComponent } from '../../components/filters/filters.js';
import { StatisticsCards } from '../../components/statistics-cards/statistics-cards.js';
import { TableComponent } from '../../components/table/table.js';

// Header component instance
let headerComponent;

// Statistics Cards component instance
let machinesStats = null;

// Filters component instance
let machineFilters = null;

// Table component instance
let machinesTable = null;

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
            const el = document.getElementById('createMachineModal');
            const modal = bootstrap.Modal.getOrCreateInstance(el);
            modal.show();
        },
        onRefreshClick: async () => {
            // Reset to first page when refreshing
            currentPage = 1;
            await loadMachineData();
        }
    });
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

        // Populate filters and dropdowns
        updateFilterOptions();
        populateMachineTypeDropdowns();
        populateMachineUsedInDropdowns();
        populateAssignedUsersDropdowns();
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
        
        // Populate machine type dropdowns with loaded data
        populateMachineTypeDropdowns();
        
        // Populate used_in dropdowns with loaded data
        populateMachineUsedInDropdowns();
        
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
    // Save machine button
    document.getElementById('save-machine-btn')?.addEventListener('click', () => {
        saveMachine();
    });
    
    // Update machine button
    document.getElementById('update-machine-btn')?.addEventListener('click', () => {
        updateMachine();
    });
    
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

    // Add property row
    document.getElementById('add-property-btn')?.addEventListener('click', () => {
        addPropertyRow('', '', 'create');
    });
    document.getElementById('edit-add-property-btn')?.addEventListener('click', () => {
        addPropertyRow('', '', 'edit');
    });
    
    // Reset properties on modal open
    const createModalEl = document.getElementById('createMachineModal');
    if (createModalEl) {
        createModalEl.addEventListener('shown.bs.modal', () => {
            // If empty, add one starter row
            const list = document.getElementById('properties-list');
            if (list && list.children.length === 0) {
                addPropertyRow('', '', 'create');
            }
        });
        createModalEl.addEventListener('hidden.bs.modal', () => {
            // Clear rows when closed
            const list = document.getElementById('properties-list');
            if (list) list.innerHTML = '';
        });
    }

    const editModalEl = document.getElementById('editMachineModal');
    if (editModalEl) {
        editModalEl.addEventListener('hidden.bs.modal', () => {
            const list = document.getElementById('edit-properties-list');
            if (list) list.innerHTML = '';
        });
    }
}

// Global functions for actions
window.editMachine = function(machineId) {
    // Check if machineId is valid
    if (!machineId) {
        alert('Geçersiz makine ID');
        return;
    }
    
    // Find the machine data
    const machine = machines.find(m => String(m.id) === String(machineId));
    if (!machine) {
        alert('Makine bulunamadı');
        return;
    }
    
    // Store the machine ID for update
    window.editingMachineId = machineId;
    
    // Populate the edit form
    document.getElementById('edit-machine-name').value = machine.name || '';
    document.getElementById('edit-machine-code').value = machine.code || '';
    document.getElementById('edit-machine-type').value = machine.machine_type || machine.type_id || '';
    document.getElementById('edit-machine-used-in').value = machine.used_in || '';
    document.getElementById('edit-machine-status').value = machine.is_active ? 'active' : 'inactive';
    
    // Populate assigned users
    const assignedUsersSelect = document.getElementById('edit-machine-assigned-users');
    if (assignedUsersSelect && machine.assigned_users) {
        // Clear previous selections
        Array.from(assignedUsersSelect.options).forEach(option => option.selected = false);
        // Select assigned users
        machine.assigned_users.forEach(userId => {
            const option = assignedUsersSelect.querySelector(`option[value="${userId}"]`);
            if (option) option.selected = true;
        });
    }
    
    // Populate properties in edit modal
    const editList = document.getElementById('edit-properties-list');
    if (editList) {
        editList.innerHTML = '';
        const props = machine.properties && typeof machine.properties === 'object' ? machine.properties : {};
        const entries = Object.entries(props);
        if (entries.length === 0) {
            addPropertyRow('', '', 'edit');
        } else {
            entries.forEach(([k, v]) => addPropertyRow(k, String(v), 'edit'));
        }
    }
    // Removed Ek Bilgiler fields
    
    // Show the edit modal
    const el = document.getElementById('editMachineModal');
    const modal = bootstrap.Modal.getOrCreateInstance(el);
    modal.show();
};

window.deleteMachine = function(machineId, machineName) {
    window.pendingDeleteMachineId = machineId;
    document.getElementById('delete-machine-name').textContent = machineName;
    
    const modal = new bootstrap.Modal(document.getElementById('deleteMachineConfirmModal'));
    modal.show();
};

// Show machine properties in a modal without overcrowding the table
window.showMachineProperties = function(machineId) {
    const machine = machines.find(m => String(m.id) === String(machineId));
    const container = document.getElementById('machine-properties-content');
    if (!container) return;
    
    const props = machine && machine.properties && typeof machine.properties === 'object' ? machine.properties : {};
    const entries = Object.entries(props);
    
    if (entries.length === 0) {
        container.innerHTML = '<div class="text-muted">Özellik bulunamadı.</div>';
    } else {
        // Render as two-column responsive list
        const items = entries.map(([key, val]) => {
            const valueDisplay = typeof val === 'boolean' ? (val ? '<span class="bool-indicator bool-yes">✓</span>' : '<span class="bool-indicator bool-no">✗</span>') : (val ?? '-');
            return `
                <div class="col-md-6 mb-2">
                    <div class="d-flex justify-content-between align-items-center p-2 border rounded">
                        <div class="fw-semibold me-2">${key}</div>
                        <div class="text-end">${valueDisplay}</div>
                    </div>
                </div>
            `;
        }).join('');
        container.innerHTML = `
            <div class="mb-2"><strong>${machine?.name || 'Makine'}</strong> - Özellikler (${entries.length})</div>
            <div class="row g-2">${items}</div>
        `;
    }
    
    const el = document.getElementById('viewMachinePropertiesModal');
    const modal = bootstrap.Modal.getOrCreateInstance(el);
    modal.show();
};

window.showAssignedUsers = function(machineId) {
    const machine = machines.find(m => String(m.id) === String(machineId));
    const container = document.getElementById('assigned-users-content');
    if (!container) return;
    
    const assignedUsers = machine && machine.assigned_users ? machine.assigned_users : [];
    
    if (assignedUsers.length === 0) {
        container.innerHTML = '<div class="text-muted">Atanmış kullanıcı bulunamadı.</div>';
    } else {
        const userItems = assignedUsers.map(userId => {
            const user = users.find(u => u.id === userId);
            const userName = user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username : `Kullanıcı ID: ${userId}`;
            return `
                <div class="col-md-6 mb-2">
                    <div class="d-flex justify-content-between align-items-center p-2 border rounded">
                        <div class="fw-semibold me-2">
                            <i class="fas fa-user me-2"></i>${userName}
                        </div>
                        <div class="text-end text-muted small">ID: ${userId}</div>
                    </div>
                </div>
            `;
        }).join('');
        
        container.innerHTML = `
            <div class="mb-2"><strong>${machine?.name || 'Makine'}</strong> - Atanan Kullanıcılar (${assignedUsers.length})</div>
            <div class="row g-2">${userItems}</div>
        `;
    }
    
    const el = document.getElementById('viewAssignedUsersModal');
    const modal = bootstrap.Modal.getOrCreateInstance(el);
    modal.show();
};

async function saveMachine() {
    const form = document.getElementById('create-machine-form');
    
    const statusValue = document.getElementById('machine-status').value;
    const assignedUsersSelect = document.getElementById('machine-assigned-users');
    const assignedUsers = Array.from(assignedUsersSelect.selectedOptions).map(option => parseInt(option.value));
    
    const machineData = {
        name: document.getElementById('machine-name').value,
        code: document.getElementById('machine-code').value || null,
        machine_type: document.getElementById('machine-type').value,
        used_in: document.getElementById('machine-used-in').value,
        is_active: statusValue === 'active',
        assigned_users: assignedUsers,
        // Removed Ek Bilgiler fields
        properties: collectPropertiesFromForm()
    };
    
    try {
        const created = await apiCreateMachine(machineData);
        if (created) {
            alert('Makine başarıyla oluşturuldu');
            
            // Hide modal
            bootstrap.Modal.getInstance(document.getElementById('createMachineModal')).hide();
            
            // Reset form
            form.reset();
            
            // Reload machines
            await loadMachineData();
        }
    } catch (error) {
        // Error creating machine
        alert(error.message || 'Makine oluşturulurken hata oluştu');
    }
}

async function updateMachine() {
    const machineId = window.editingMachineId;
    if (!machineId) {
        alert('Düzenlenecek makine bulunamadı');
        return;
    }
    
    const editStatusValue = document.getElementById('edit-machine-status').value;
    const assignedUsersSelect = document.getElementById('edit-machine-assigned-users');
    const assignedUsers = Array.from(assignedUsersSelect.selectedOptions).map(option => parseInt(option.value));
    
    const machineData = {
        name: document.getElementById('edit-machine-name').value,
        code: document.getElementById('edit-machine-code').value || null,
        machine_type: document.getElementById('edit-machine-type').value,
        used_in: document.getElementById('edit-machine-used-in').value,
        is_active: editStatusValue === 'active',
        assigned_users: assignedUsers,
        // Include edited properties
        properties: collectPropertiesFromForm('edit')
    };
    
    try {
        const updated = await apiUpdateMachine(machineId, machineData);
        if (updated) {
            alert('Makine başarıyla güncellendi');
            
            // Hide modal
            bootstrap.Modal.getInstance(document.getElementById('editMachineModal')).hide();
            
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

function populateMachineTypeDropdowns() {
    // Populate machine type dropdowns with already loaded machineTypes
    const typeSelects = [
        document.getElementById('machine-type'),
        document.getElementById('edit-machine-type')
    ];
    
    typeSelects.forEach(select => {
        if (select) {
            select.innerHTML = '<option value="">Makine tipi seçin...</option>';
            machineTypes.forEach(type => {
                const option = document.createElement('option');
                option.value = type.value;
                option.textContent = type.label;
                select.appendChild(option);
            });
        }
    });
}

function populateMachineUsedInDropdowns() {
    // Populate used_in dropdowns with already loaded machineUsedInOptions
    const usedInSelects = [
        document.getElementById('machine-used-in'),
        document.getElementById('edit-machine-used-in')
    ];
    
    usedInSelects.forEach(select => {
        if (select) {
            select.innerHTML = '<option value="">Kullanım alanı seçin...</option>';
            machineUsedInOptions.forEach(option => {
                const optionElement = document.createElement('option');
                optionElement.value = option.value;
                optionElement.textContent = option.label;
                select.appendChild(optionElement);
            });
        }
    });
}

function populateAssignedUsersDropdowns() {
    // Populate assigned users dropdowns with already loaded users
    const userSelects = [
        document.getElementById('machine-assigned-users'),
        document.getElementById('edit-machine-assigned-users')
    ];
    
    userSelects.forEach(select => {
        if (select) {
            select.innerHTML = ''; // Clear existing options
            users.forEach(user => {
                const option = document.createElement('option');
                option.value = user.id;
                option.textContent = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;
                select.appendChild(option);
            });
        }
    });
}

// Helper function for notifications
function showNotification(message, type = 'info') {
    // You can implement your own notification system here
    
    // Simple alert for now
    alert(`${type.toUpperCase()}: ${message}`);
} 

// Dynamically add/remove/read properties in the create modal
function addPropertyRow(key = '', value = '', target = 'create') {
    const list = document.getElementById(target === 'edit' ? 'edit-properties-list' : 'properties-list');
    if (!list) return;
    
    const row = document.createElement('div');
    row.className = 'col-12';
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
    
    row.querySelector('.remove-prop-btn')?.addEventListener('click', () => {
        row.remove();
    });
}

function collectPropertiesFromForm(target = 'create') {
    const list = document.getElementById(target === 'edit' ? 'edit-properties-list' : 'properties-list');
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