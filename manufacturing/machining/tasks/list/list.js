import { initNavbar } from '../../../../components/navbar.js';
import { getParts, updatePart, deletePart, createPart, updatePartOperations, getPartsStats } from '../../../../apis/machining/parts.js';
import { getOperations, markOperationCompleted, unmarkOperationCompleted, createManualTimeEntry } from '../../../../apis/machining/operations.js';
import { fetchMachinesDropdown } from '../../../../apis/machines.js';
import { authFetchUsers } from '../../../../apis/users.js';
import { HeaderComponent } from '../../../../components/header/header.js';
import { FiltersComponent } from '../../../../components/filters/filters.js';
import { StatisticsCards } from '../../../../components/statistics-cards/statistics-cards.js';
import { DisplayModal } from '../../../../components/display-modal/display-modal.js';
import { TableComponent } from '../../../../components/table/table.js';
import { showNotification } from '../../../../components/notification/notification.js';
import { getJobOrderDropdown } from '../../../../apis/projects/jobOrders.js';

// State management
let currentPage = 1;
let currentFilter = 'all';
let currentOrdering = '-created_at';
let currentSortField = 'created_at';
let currentSortDirection = 'desc';
let parts = [];
let totalParts = 0;
let isLoading = false;
let partsStats = null;
let partsFilters = null;
let partsTable = null;
let machines = [];
let users = [];

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    await initNavbar();
    
    // Initialize header component
    const header = new HeaderComponent({
        title: 'Parça Listesi',
        subtitle: 'Parça yönetimi ve takibi',
        icon: 'tasks',
        showBackButton: 'block',
        showCreateButton: 'block',
        showBulkCreateButton: 'none',
        createButtonText: '      Yeni Parça',
        onBackClick: () => window.location.href = '/manufacturing/machining/tasks/',
        onCreateClick: () => showCreatePartModal()
    });
    
    // Initialize Statistics Cards component
    partsStats = new StatisticsCards('parts-statistics', {
        cards: [
            { 
                title: 'Makine Atanmamış', 
                value: '0', 
                icon: 'fas fa-exclamation-triangle', 
                color: 'warning', 
                id: 'unassigned-operations-count',
                onClick: 'handleStatCardClick(0)',
                tooltip: 'Makine atanmamış parçaları göster'
            },
            { 
                title: 'Plana Eklenmemiş', 
                value: '0', 
                icon: 'fas fa-calendar-times', 
                color: 'danger', 
                id: 'unplanned-operations-count',
                onClick: 'handleStatCardClick(1)',
                tooltip: 'Plana eklenmemiş parçaları göster'
            },
            { 
                title: 'Operasyonsuz Parçalar', 
                value: '0', 
                icon: 'fas fa-inbox', 
                color: 'secondary', 
                id: 'parts-without-operations-count',
                onClick: 'handleStatCardClick(2)',
                tooltip: 'Operasyonsuz parçaları göster'
            }
        ],
        compact: true,
        animation: true
    });
    
    setupEventListeners();
    await initializeParts();
});

async function initializeParts() {
    try {
        await loadUsers(); // Load users first for filters
        initializeFiltersComponent();
        const urlFiltersApplied = applyUrlFilters(); // Apply filters from URL parameters
        initializeTableComponent();
        await loadMachines();
        // If URL filters were applied, they will trigger loadParts via onApply callback
        // Otherwise, load parts normally
        if (!urlFiltersApplied) {
            await loadParts();
        }
        await updatePartCounts();
    } catch (error) {
        console.error('Error initializing parts:', error);
        showNotification('Parçalar yüklenirken hata oluştu', 'error');
    }
}

async function loadMachines() {
    try {
        machines = await fetchMachinesDropdown('machining');
        
        // Populate modal machine dropdowns
        populateModalMachineDropdowns();
    } catch (error) {
        console.error('Error loading machines:', error);
        machines = [];
    }
}

async function loadUsers() {
    try {
        const usersResponse = await authFetchUsers(1, 1000, { 
            team: 'manufacturing',
            ordering: 'full_name'
        });
        users = usersResponse.results || [];
        
        // Update created_by filter options if filters component is already initialized
        if (partsFilters && users.length > 0) {
            const userOptions = [
                { value: '', label: 'Tüm Kullanıcılar' },
                ...users.map(user => ({
                    value: user.id.toString(),
                    label: user.full_name ? `${user.full_name} (${user.username})` : user.username
                }))
            ];
            partsFilters.updateFilterOptions('created-by-filter', userOptions);
        }
    } catch (error) {
        console.error('Error loading users:', error);
        users = [];
    }
}

function populateModalMachineDropdowns() {
    const partOperationMachine = document.getElementById('part-operation-machine');
    const addOperationMachine = document.getElementById('add-operation-machine');
    const editOperationMachine = document.getElementById('edit-operation-machine');
    
    const populateDropdown = (dropdown) => {
        if (dropdown) {
            dropdown.innerHTML = '<option value="">Makine seçin...</option>';
            machines.forEach(machine => {
                dropdown.innerHTML += `<option value="${machine.id}">${machine.name}</option>`;
            });
        }
    };
    
    populateDropdown(partOperationMachine);
    populateDropdown(addOperationMachine);
    populateDropdown(editOperationMachine);
}

function initializeFiltersComponent() {
    // Initialize filters component
    partsFilters = new FiltersComponent('filters-placeholder', {
        title: 'Parça Filtreleri',
        onApply: (values) => {
            // Apply filters and reload parts
            loadParts(1);
        },
        onClear: () => {
            // Clear filters and reload parts
            loadParts(1);
            showNotification('Filtreler temizlendi', 'info');
        },
        onFilterChange: (filterId, value) => {
            // Optional: Handle individual filter changes
            console.log(`Filter ${filterId} changed to:`, value);
        }
    });

    // Add text filters
    partsFilters.addTextFilter({
        id: 'key-filter',
        label: 'Parça No',
        placeholder: 'PT-001',
        colSize: 2
    });

    partsFilters.addTextFilter({
        id: 'name-filter',
        label: 'Parça Adı',
        placeholder: 'Parça adı',
        colSize: 2
    });

    partsFilters.addTextFilter({
        id: 'job-no-filter',
        label: 'İş No',
        placeholder: 'İş numarası',
        colSize: 2
    });

    partsFilters.addTextFilter({
        id: 'image-no-filter',
        label: 'Resim No',
        placeholder: 'Resim numarası',
        colSize: 2
    });

    partsFilters.addTextFilter({
        id: 'position-no-filter',
        label: 'Pozisyon No',
        placeholder: 'Pozisyon numarası',
        colSize: 2
    });

    // Add dropdown filters
    partsFilters.addDropdownFilter({
        id: 'status-filter',
        label: 'Durum',
        options: [
            { value: '', label: 'Tümü' },
            { value: 'completed', label: 'Tamamlanan' },
            { value: 'incomplete', label: 'Devam Eden' }
        ],
        placeholder: 'Tümü',
        colSize: 2
    });
    
    // Add created_by filter (users dropdown)
    const userOptions = [
        { value: '', label: 'Tüm Kullanıcılar' },
        ...users.map(user => ({
            value: user.id.toString(),
            label: user.full_name ? `${user.full_name} (${user.username})` : user.username
        }))
    ];
    
    partsFilters.addDropdownFilter({
        id: 'created-by-filter',
        label: 'Oluşturan',
        options: userOptions,
        placeholder: 'Tüm Kullanıcılar',
        colSize: 2
    });
    
    // Add checkbox filters
    partsFilters.addCheckboxFilter({
        id: 'has-operations-filter',
        label: 'Operasyonsuz Parçalar',
        checked: false,
        colSize: 3
    });
    
    partsFilters.addCheckboxFilter({
        id: 'has-unassigned-operations-filter',
        label: 'Makine Atanmamış',
        checked: false,
        colSize: 3
    });
    
    partsFilters.addCheckboxFilter({
        id: 'has-unplanned-operations-filter',
        label: 'Plana Eklenmemiş',
        checked: false,
        colSize: 3
    });
}

// Apply filters from URL parameters
function applyUrlFilters() {
    if (!partsFilters) return false;
    
    try {
        const urlParams = new URLSearchParams(window.location.search);
        
        // Map URL parameter names to filter IDs
        const paramToFilterMap = {
            'key': 'key-filter',
            'name': 'name-filter',
            'job_no': 'job-no-filter',
            'job-no': 'job-no-filter', // Support both formats
            'image_no': 'image-no-filter',
            'image-no': 'image-no-filter',
            'position_no': 'position-no-filter',
            'position-no': 'position-no-filter',
            'status': 'status-filter',
            'created_by': 'created-by-filter',
            'created-by': 'created-by-filter',
            'has_operations': 'has-operations-filter',
            'has-operations': 'has-operations-filter',
            'has_unassigned_operations': 'has-unassigned-operations-filter',
            'has-unassigned-operations': 'has-unassigned-operations-filter',
            'has_unplanned_operations': 'has-unplanned-operations-filter',
            'has-unplanned-operations': 'has-unplanned-operations-filter'
        };
        
        // Build filter values object
        const filterValues = {};
        let hasFilters = false;
        
        for (const [paramName, paramValue] of urlParams.entries()) {
            const filterId = paramToFilterMap[paramName];
            if (filterId) {
                hasFilters = true;
                // Handle checkbox filters (boolean values)
                if (filterId.includes('has-')) {
                    filterValues[filterId] = paramValue === 'true' || paramValue === '1';
                } else {
                    // Handle text and dropdown filters
                    filterValues[filterId] = paramValue;
                }
            }
        }
        
        // Apply filters if any were found
        if (hasFilters && Object.keys(filterValues).length > 0) {
            partsFilters.setFilterValues(filterValues);
            // Trigger apply to load parts with filters
            setTimeout(() => {
                if (partsFilters) {
                    partsFilters.applyFilters();
                }
            }, 100);
            // Return true to indicate filters were applied from URL
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error applying URL filters:', error);
        return false;
    }
}

function initializeTableComponent() {
    // Initialize table component
    partsTable = new TableComponent('parts-table-container', {
        title: 'Parça Listesi',
        icon: 'fas fa-table',
        iconColor: 'text-primary',
        columns: [
            {
                field: 'key',
                label: 'Parça No',
                sortable: true,
                width: '10%',
                formatter: (value, row) => {
                    const partKey = value || '-';
                    const taskKey = row?.task_key ? ` (${row.task_key})` : '';
                    return `<span class="part-key">${partKey}${taskKey}</span>`;
                }
            },
            {
                field: 'name',
                label: 'Ad',
                sortable: true,
                width: '15%',
                formatter: (value) => `<strong>${value || '-'}</strong>`
            },
            {
                field: 'description',
                label: 'Açıklama',
                sortable: false,
                width: '15%',
                formatter: (value) => value || '-'
            },
            {
                field: 'job_no',
                label: 'İş No',
                sortable: true,
                width: '10%',
                formatter: (value) => value || '-'
            },
            {
                field: 'image_no',
                label: 'Resim No',
                sortable: false,
                width: '10%',
                formatter: (value) => value || '-'
            },
            {
                field: 'position_no',
                label: 'Poz No',
                sortable: false,
                width: '10%',
                formatter: (value) => value || '-'
            },
            {
                field: 'quantity',
                label: 'Adet',
                sortable: false,
                width: '8%',
                type: 'number',
                formatter: (value) => `<span class="quantity-badge">${value || 0}</span>`
            },
            {
                field: 'material',
                label: 'Malzeme',
                sortable: false,
                width: '9%',
                formatter: (value) => value || '-'
            },
            {
                field: 'weight_kg',
                label: 'Ağırlık (kg)',
                sortable: false,
                width: '8%',
                type: 'number',
                formatter: (value) => value ? `${parseFloat(value).toFixed(3)} kg` : '-'
            },
            {
                field: 'operation_count',
                label: 'Operasyon Sayısı',
                sortable: false,
                width: '8%',
                editable: false,
                formatter: (value) => `<span class="operation-count-badge">${value || 0}</span>`
            },
            {
                field: 'incomplete_operation_count',
                label: 'Tamamlanmamış',
                sortable: false,
                width: '8%',
                editable: false,
                formatter: (value) => {
                    const count = value || 0;
                    const badgeClass = count > 0 ? 'incomplete-count-badge' : 'complete-count-badge';
                    return `<span class="${badgeClass}">${count}</span>`;
                }
            },
            {
                field: 'finish_time',
                label: 'Bitiş Tarihi',
                sortable: true,
                width: '10%',
                formatter: (value) => {
                    if (value) {
                        return new Date(value).toLocaleDateString('tr-TR');
                    }
                    return '-';
                }
            },
            {
                field: 'status',
                label: 'Durum',
                sortable: false,
                width: '10%',
                formatter: (value, row) => {
                    if (row.completion_date) {
                        return '<span class="status-badge status-green">Tamamlandı</span>';
                    } else if (row.has_incomplete_operations) {
                        return '<span class="status-badge status-yellow">Devam Ediyor</span>';
                    } else {
                        return '<span class="status-badge status-grey">Bekliyor</span>';
                    }
                }
            }
        ],
        actions: [
            {
                key: 'view',
                label: 'Parça Detayları',
                icon: 'fas fa-edit',
                class: 'btn-outline-info',
                title: 'Parça Detayları',
                onClick: (row) => showPartDetails(row.key)
            },
            {
                key: 'delete',
                label: 'Sil',
                icon: 'fas fa-trash',
                class: 'btn-outline-danger',
                title: 'Sil',
                onClick: (row) => deletePartConfirm(row.key)
            }
        ],
        data: [],
        loading: true,
        sortable: true,
        pagination: true,
        itemsPerPage: 20,
        currentPage: 1,
        totalItems: 0,
        serverSidePagination: true,
        onPageChange: (page) => {
            loadParts(page);
        },
        onPageSizeChange: (newSize) => {
            if (partsTable) {
                partsTable.options.itemsPerPage = newSize;
            }
            currentPage = 1;
            loadParts(1);
        },
        onSort: (field, direction) => {
            currentSortField = field;
            currentSortDirection = direction;
            loadParts(1);
        },
        exportable: true,
        refreshable: true,
        onRefresh: () => {
            loadParts(currentPage);
        },
        striped: false,
        small: false,
        emptyMessage: 'Parça bulunamadı',
        emptyIcon: 'fas fa-box',
        rowAttributes: (row) => `data-part-key="${row.key}" class="data-update"`,
        // Enable cell editing
        editable: true,
        editableColumns: ['name', 'description', 'job_no', 'image_no', 'position_no', 'quantity', 'material', 'weight_kg', 'finish_time'],
        onEdit: async (row, field, newValue, oldValue) => {
            try {
                // Check if value actually changed
                let normalizedOld = oldValue;
                let normalizedNew = newValue;
                
                // For numeric fields, convert to numbers for comparison
                if (field === 'quantity') {
                    normalizedOld = parseFloat(oldValue) || 0;
                    normalizedNew = parseFloat(newValue) || 0;
                } else if (field === 'weight_kg') {
                    normalizedOld = oldValue ? parseFloat(oldValue) : null;
                    normalizedNew = newValue ? parseFloat(newValue) : null;
                }
                
                // For date fields, normalize
                if (field === 'finish_time') {
                    normalizedOld = oldValue ? new Date(oldValue).toISOString().split('T')[0] : '';
                    normalizedNew = newValue ? new Date(newValue).toISOString().split('T')[0] : '';
                }
                
                if (normalizedOld === normalizedNew) {
                    return true;
                }
                
                // Prepare update data
                const updateData = {};
                // For weight_kg, convert to number
                if (field === 'weight_kg') {
                    updateData[field] = newValue ? parseFloat(newValue) : null;
                } else {
                    updateData[field] = newValue;
                }
                
                // Call the updatePart API
                const updatedPart = await updatePart(row.key, updateData);
                
                if (updatedPart) {
                    // Update local part data
                    row[field] = newValue;
                    
                    // Refresh the table to show updated data
                    if (partsTable) {
                        partsTable.updateData(parts, totalParts, currentPage);
                    }
                    
                    showNotification('Parça başarıyla güncellendi', 'success');
                    return true;
                } else {
                    throw new Error('Failed to update part');
                }
            } catch (error) {
                console.error('Error updating part:', error);
                showNotification('Parça güncellenirken hata oluştu', 'error');
                return false;
            }
        }
    });
}

async function loadParts(page = 1) {
    if (isLoading) return;
    
    isLoading = true;
    
    // Set loading state on table component
    if (partsTable) {
        partsTable.setLoading(true);
    }
    
    try {
        const queryParams = buildPartQuery(page);
        const response = await getParts(queryParams);
        
        if (Array.isArray(response)) {
            parts = response;
            totalParts = response.length;
        } else if (response.results) {
            parts = response.results;
            totalParts = response.count || 0;
        } else {
            parts = [];
            totalParts = 0;
        }
        
        currentPage = page;
        
        // Update table component with new data
        if (partsTable) {
            partsTable.setLoading(false);
            partsTable.updateData(parts, totalParts, currentPage);
        }
        
        await updatePartCounts();
    } catch (error) {
        console.error('Error loading parts:', error);
        showNotification('Parçalar yüklenirken hata oluştu', 'error');
        parts = [];
        totalParts = 0;
        
        // Update table component with empty data
        if (partsTable) {
            partsTable.setLoading(false);
            partsTable.updateData([], 0, 1);
        }
    } finally {
        isLoading = false;
    }
}

function buildPartQuery(page = 1) {
    const filters = {};
    
    // Get filter values from the filters component
    const filterValues = partsFilters ? partsFilters.getFilterValues() : {};
    
    // Add filters
    const keyFilter = filterValues['key-filter']?.trim();
    const nameFilter = filterValues['name-filter']?.trim();
    // Get job_no from dropdown filter
    const jobNoDropdown = partsFilters.dropdowns?.get('job-no-filter');
    const jobNoFilter = jobNoDropdown?.getValue() || filterValues['job-no-filter']?.trim();
    const imageNoFilter = filterValues['image-no-filter']?.trim();
    const positionNoFilter = filterValues['position-no-filter']?.trim();
    const statusFilter = filterValues['status-filter'] || '';
    const createdByFilter = filterValues['created-by-filter'] || '';
    
    // Checkbox filters
    const hasOperationsFilter = filterValues['has-operations-filter'] || false;
    const hasUnassignedOperationsFilter = filterValues['has-unassigned-operations-filter'] || false;
    const hasUnplannedOperationsFilter = filterValues['has-unplanned-operations-filter'] || false;
    
    if (keyFilter) {
        let key = keyFilter;
        if (/^\d+$/.test(key)) {
            key = 'PT-' + key;
        }
        filters.key = key;
    }
    
    if (nameFilter) filters.name = nameFilter;
    if (jobNoFilter) filters.job_no = jobNoFilter;
    if (imageNoFilter) filters.image_no = imageNoFilter;
    if (positionNoFilter) filters.position_no = positionNoFilter;
    
    // Add created_by filter
    if (createdByFilter) {
        filters.created_by = createdByFilter;
    }
    
    // Add status filter
    if (statusFilter === 'completed') {
        filters.completion_date__isnull = 'false';
    } else if (statusFilter === 'incomplete') {
        filters.completion_date__isnull = 'true';
    }
    
    // Add checkbox filters
    if (hasOperationsFilter) {
        filters.has_operations = 'false';
    }
    
    if (hasUnassignedOperationsFilter) {
        filters.has_unassigned_operations = 'true';
    }
    
    if (hasUnplannedOperationsFilter) {
        filters.has_unplanned_operations = 'true';
    }
    
    // Add pagination
    filters.page = page;
    const pageSize = partsTable ? partsTable.options.itemsPerPage : 20;
    filters.page_size = pageSize;
    
    // Add ordering
    const orderingParam = currentSortDirection === 'asc' ? currentSortField : `-${currentSortField}`;
    filters.ordering = orderingParam;
    
    return filters;
}

async function updatePartCounts() {
    try {
        const stats = await getPartsStats();
        
        // Update statistics cards using the component
        if (partsStats) {
            partsStats.updateValues({
                0: (stats.parts_with_unassigned_operations || 0).toString(),
                1: (stats.parts_with_unplanned_operations || 0).toString(),
                2: (stats.parts_without_operations || 0).toString()
            });
            
            // Add blinking animation to cards with values > 0
            // Use requestAnimationFrame to ensure DOM is updated after render()
            requestAnimationFrame(() => {
                const unassignedCount = stats.parts_with_unassigned_operations || 0;
                const unplannedCount = stats.parts_with_unplanned_operations || 0;
                const withoutOpsCount = stats.parts_without_operations || 0;
                
                // Get card elements by their IDs
                const unassignedCard = document.getElementById('unassigned-operations-count');
                const unplannedCard = document.getElementById('unplanned-operations-count');
                const withoutOpsCard = document.getElementById('parts-without-operations-count');
                
                // Add/remove blinking classes and make clickable based on values
                if (unassignedCard) {
                    if (unassignedCount > 0) {
                        unassignedCard.classList.add('blink-warning', 'clickable');
                        unassignedCard.style.cursor = 'pointer';
                    } else {
                        unassignedCard.classList.remove('blink-warning', 'clickable');
                        unassignedCard.style.cursor = 'default';
                    }
                }
                
                if (unplannedCard) {
                    if (unplannedCount > 0) {
                        unplannedCard.classList.add('blink-danger', 'clickable');
                        unplannedCard.style.cursor = 'pointer';
                    } else {
                        unplannedCard.classList.remove('blink-danger', 'clickable');
                        unplannedCard.style.cursor = 'default';
                    }
                }
                
                if (withoutOpsCard) {
                    if (withoutOpsCount > 0) {
                        withoutOpsCard.classList.add('blink-secondary', 'clickable');
                        withoutOpsCard.style.cursor = 'pointer';
                    } else {
                        withoutOpsCard.classList.remove('blink-secondary', 'clickable');
                        withoutOpsCard.style.cursor = 'default';
                    }
                }
            });
        }
    } catch (error) {
        console.error('Error updating part counts:', error);
        // Set all values to 0 on error
        if (partsStats) {
            partsStats.updateValues({
                0: '0',
                1: '0',
                2: '0'
            });
            
            // Remove blinking classes on error
            requestAnimationFrame(() => {
                const unassignedCard = document.getElementById('unassigned-operations-count');
                const unplannedCard = document.getElementById('unplanned-operations-count');
                const withoutOpsCard = document.getElementById('parts-without-operations-count');
                
                if (unassignedCard) {
                    unassignedCard.classList.remove('blink-warning', 'clickable');
                    unassignedCard.style.cursor = 'default';
                }
                if (unplannedCard) {
                    unplannedCard.classList.remove('blink-danger', 'clickable');
                    unplannedCard.style.cursor = 'default';
                }
                if (withoutOpsCard) {
                    withoutOpsCard.classList.remove('blink-secondary', 'clickable');
                    withoutOpsCard.style.cursor = 'default';
                }
            });
        }
    }
}

// Handle stat card clicks to apply appropriate filters
// Make it globally accessible for inline onclick handlers
window.handleStatCardClick = function(cardIndex) {
    if (!partsFilters) return;
    
    // Get current stats to check if card has value > 0
    const unassignedCard = document.getElementById('unassigned-operations-count');
    const unplannedCard = document.getElementById('unplanned-operations-count');
    const withoutOpsCard = document.getElementById('parts-without-operations-count');
    
    let shouldApply = false;
    let filterId = '';
    
    switch (cardIndex) {
        case 0: // Makine Atanmamış
            if (unassignedCard && unassignedCard.classList.contains('blink-warning')) {
                filterId = 'has-unassigned-operations-filter';
                shouldApply = true;
            }
            break;
        case 1: // Plana Eklenmemiş
            if (unplannedCard && unplannedCard.classList.contains('blink-danger')) {
                filterId = 'has-unplanned-operations-filter';
                shouldApply = true;
            }
            break;
        case 2: // Operasyonsuz Parçalar
            if (withoutOpsCard && withoutOpsCard.classList.contains('blink-secondary')) {
                filterId = 'has-operations-filter';
                shouldApply = true;
            }
            break;
    }
    
    if (shouldApply && filterId) {
        // Set the checkbox filter
        const checkbox = document.getElementById(filterId);
        if (checkbox) {
            checkbox.checked = true;
            
            // Apply filters
            partsFilters.applyFilters();
            
            // Show notification
            const cardTitles = ['Makine Atanmamış', 'Plana Eklenmemiş', 'Operasyonsuz Parçalar'];
            showNotification(`${cardTitles[cardIndex]} filtresi uygulandı`, 'info');
        }
    }
};

function setupEventListeners() {
    // Save part button
    document.getElementById('save-part-btn')?.addEventListener('click', () => {
        savePart();
    });
    
    // Add operation button
    document.getElementById('add-operation-btn')?.addEventListener('click', () => {
        addOperationRow();
    });
    
    
    // Confirm delete button
    document.getElementById('confirm-delete-btn')?.addEventListener('click', async () => {
        const partKey = window.pendingDeletePartKey;
        if (!partKey) return;
        
        try {
            const success = await deletePart(partKey);
            
            if (success) {
                showNotification('Parça silindi', 'success');
                // Hide the modal
                const modalElement = document.getElementById('deleteConfirmModal');
                if (modalElement) {
                    const modalInstance = bootstrap.Modal.getInstance(modalElement);
                    if (modalInstance) {
                        modalInstance.hide();
                    }
                }
                // Clear the pending delete key
                window.pendingDeletePartKey = null;
                // Reload parts
                loadParts(currentPage);
            } else {
                throw new Error('Failed to delete part');
            }
        } catch (error) {
            console.error('Error deleting part:', error);
            showNotification('Parça silinirken hata oluştu', 'error');
        }
    });
    
    // Save manual time entry button
    document.getElementById('save-manual-time-btn')?.addEventListener('click', () => {
        saveManualTimeEntry();
    });
}

function showCreatePartModal() {
    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('createPartModal'));
    modal.show();
    
    // Reset form
    const form = document.getElementById('create-part-form');
    if (form) {
        form.reset();
        // Clear operations table
        const operationsBody = document.getElementById('operations-table-body');
        if (operationsBody) {
            operationsBody.innerHTML = '';
        }
        // Add first operation row
        addOperationRow();
    }
}

function addOperationRow() {
    const operationsBody = document.getElementById('operations-table-body');
    if (!operationsBody) return;
    
    const rowCount = operationsBody.children.length;
    const newRow = document.createElement('tr');
    newRow.innerHTML = `
        <td>
            <input type="number" class="form-control form-control-sm" name="operation-order" value="${rowCount + 1}" min="1" required>
        </td>
        <td>
            <input type="text" class="form-control form-control-sm" name="operation-name" placeholder="Operasyon adı" required>
        </td>
        <td>
            <textarea class="form-control form-control-sm" name="operation-description" rows="1" placeholder="Açıklama"></textarea>
        </td>
        <td>
            <select class="form-control form-control-sm" name="operation-machine" required>
                <option value="">Makine seçin...</option>
                ${machines.map(m => `<option value="${m.id}">${m.name}</option>`).join('')}
            </select>
        </td>
        <td>
            <input type="number" class="form-control form-control-sm" name="operation-estimated-hours" step="0.01" min="0" placeholder="0.00">
        </td>
        <td>
            <div class="form-check">
                <input class="form-check-input" type="checkbox" name="operation-interchangeable" value="true">
            </div>
        </td>
        <td>
            <button type="button" class="btn btn-sm btn-outline-danger remove-operation-btn" title="Kaldır">
                <i class="fas fa-trash"></i>
            </button>
        </td>
    `;
    
    operationsBody.appendChild(newRow);
    
    // Add event listener for remove button
    newRow.querySelector('.remove-operation-btn')?.addEventListener('click', () => {
        newRow.remove();
        updateOperationOrders();
    });
}

function updateOperationOrders() {
    const operationsBody = document.getElementById('operations-table-body');
    if (!operationsBody) return;
    
    const rows = operationsBody.querySelectorAll('tr');
    rows.forEach((row, index) => {
        const orderInput = row.querySelector('input[name="operation-order"]');
        if (orderInput) {
            orderInput.value = index + 1;
        }
    });
}

async function savePart() {
    const form = document.getElementById('create-part-form');
    if (!form) return;
    
    // Validate form
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    
    // Collect part data
    const partData = {
        name: document.getElementById('part-name')?.value,
        description: document.getElementById('part-description')?.value || null,
        job_no: document.getElementById('part-job-no')?.value || null,
        image_no: document.getElementById('part-image-no')?.value || null,
        position_no: document.getElementById('part-position-no')?.value || null,
        quantity: document.getElementById('part-quantity')?.value ? parseInt(document.getElementById('part-quantity').value) : null,
        material: document.getElementById('part-material')?.value || null,
        dimensions: document.getElementById('part-dimensions')?.value || null,
        weight_kg: document.getElementById('part-weight-kg')?.value ? parseFloat(document.getElementById('part-weight-kg').value) : null,
        finish_time: document.getElementById('part-finish-time')?.value || null,
        operations: []
    };
    
    // Collect operations data
    const operationsBody = document.getElementById('operations-table-body');
    if (operationsBody) {
        const rows = operationsBody.querySelectorAll('tr');
        
        if (rows.length === 0) {
            showNotification('En az bir operasyon eklenmelidir', 'error');
            return;
        }
        
        rows.forEach((row) => {
            const operation = {
                name: row.querySelector('input[name="operation-name"]')?.value,
                description: row.querySelector('textarea[name="operation-description"]')?.value || null,
                order: parseInt(row.querySelector('input[name="operation-order"]')?.value) || 1,
                machine_fk: parseInt(row.querySelector('select[name="operation-machine"]')?.value),
                estimated_hours: row.querySelector('input[name="operation-estimated-hours"]')?.value ? parseFloat(row.querySelector('input[name="operation-estimated-hours"]').value) : null,
                interchangeable: row.querySelector('input[name="operation-interchangeable"]')?.checked || false
            };
            
            if (operation.name && operation.machine_fk) {
                partData.operations.push(operation);
            }
        });
    }
    
    if (partData.operations.length === 0) {
        showNotification('En az bir geçerli operasyon eklenmelidir', 'error');
        return;
    }
    
    try {
        const createdPart = await createPart(partData);
        
        if (createdPart) {
            const partKey = createdPart.key || '-';
            showNotification(`Parça başarıyla oluşturuldu: ${partKey}`, 'success');
            const modalElement = document.getElementById('createPartModal');
            if (modalElement) {
                const modalInstance = bootstrap.Modal.getInstance(modalElement);
                if (modalInstance) {
                    modalInstance.hide();
                }
            }
            form.reset();
            // Clear operations table
            const operationsBody = document.getElementById('operations-table-body');
            if (operationsBody) {
                operationsBody.innerHTML = '';
            }
            loadParts(currentPage);
        } else {
            throw new Error('Failed to create part');
        }
    } catch (error) {
        console.error('Error creating part:', error);
        showNotification('Parça oluşturulurken hata oluştu: ' + (error.message || 'Bilinmeyen hata'), 'error');
    }
}

async function showPartDetails(partKey) {
    try {
        // Fetch operations for this part
        const operationsResponse = await getOperations({ part_key: partKey });
        const operations = Array.isArray(operationsResponse) ? operationsResponse : (operationsResponse.results || []);
        
        // Get part info from the parts list (we already have it)
        const part = parts.find(p => p.key === partKey);
        
        if (part) {
            showPartDetailsModal(part, operations);
        } else {
            // If part not in list, create minimal part object with just the key
            showPartDetailsModal({ key: partKey, name: partKey }, operations);
        }
    } catch (error) {
        console.error('Error showing part details:', error);
        showNotification('Parça detayları gösterilirken hata oluştu', 'error');
    }
}

function showPartDetailsModal(part, operations = []) {
    // Create display modal instance with fullscreen size
    const displayModal = new DisplayModal('display-modal-container', {
        title: `Operasyonlar - ${part.key} - ${part.name}`,
        icon: 'fas fa-cogs text-primary',
        size: 'xl',
        fullscreen: true,
        showEditButton: false
    });
    
    // Store part data for operations management
    window.currentPartDetails = { part, operations };
    
    // Create operations management section with editable table
    const operationsHtml = `
        <div class="operations-management">
            <div class="mb-3 d-flex justify-content-between align-items-center">
                <button type="button" class="btn btn-sm btn-primary" id="add-operation-row-btn">
                    <i class="fas fa-plus me-1"></i>Satır Ekle
                </button>
                <button type="button" class="btn btn-sm btn-success" id="save-operations-btn">
                    <i class="fas fa-save me-1"></i>Değişiklikleri Kaydet
                </button>
            </div>
            <div class="table-responsive">
                <table class="table table-sm table-bordered">
                    <thead class="table-light">
                        <tr>
                            <th style="width: 12%;">Key</th>
                            <th style="width: 15%;">Operasyon Adı</th>
                            <th style="width: 12%;">Açıklama</th>
                            <th style="width: 10%;">Makine</th>
                            <th style="width: 9%;">Tahmini Saat</th>
                            <th style="width: 9%;">Harcanan Saat</th>
                            <th style="width: 7%;">Değiştirilebilir</th>
                            <th style="width: 7%;">Durum</th>
                            <th style="width: 7%;">İşlem</th>
                        </tr>
                    </thead>
                    <tbody id="operations-detail-table-body">
                        ${operations.length > 0 ? operations.map(op => createOperationRow(op)).join('') : '<tr class="empty-row"><td colspan="9" class="text-center text-muted">Henüz operasyon eklenmemiş</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
    `;
    
    displayModal.addCustomSection({
        title: 'Operasyonlar',
        icon: 'fas fa-cogs',
        iconColor: 'text-primary',
        customContent: operationsHtml
    });
    
    // Render and show modal
    displayModal.render().show();
    
    // Setup event listeners after modal is rendered
    setTimeout(() => {
        setupOperationsDetailEventListeners(part);
        // Ensure machines are loaded for dropdowns
        if (machines.length === 0) {
            loadMachines().then(() => {
                // Re-populate machine dropdowns in existing rows
                populateMachineDropdownsInTable();
                // Explicitly enable machine dropdowns and checkboxes for non-completed operations
                enableEditableFieldsForNonCompletedOperations();
            });
        } else {
            // Populate machine dropdowns in existing rows
            populateMachineDropdownsInTable();
            // Explicitly enable machine dropdowns and checkboxes for non-completed operations
            enableEditableFieldsForNonCompletedOperations();
        }
    }, 100);
}

function populateMachineDropdownsInTable() {
    const tbody = document.getElementById('operations-detail-table-body');
    if (!tbody || machines.length === 0) return;
    
    const machineSelects = tbody.querySelectorAll('.operation-machine');
    machineSelects.forEach(select => {
        const row = select.closest('tr');
        const isCompleted = row && row.querySelector('.status-badge.status-green') !== null;
        
        // Always populate the dropdown with all machines
        const currentValue = select.value;
        select.innerHTML = '<option value="">Makine seçin...</option>';
        machines.forEach(machine => {
            const option = document.createElement('option');
            option.value = machine.id;
            option.textContent = machine.name;
            if (currentValue == machine.id) {
                option.selected = true;
            }
            select.appendChild(option);
        });
        
        // Only disable if operation is actually completed (has completion_date)
        // Operations with hours spent but not completed should still be editable
        if (isCompleted) {
            select.disabled = true;
            select.setAttribute('disabled', 'disabled');
        } else {
            select.disabled = false;
            select.removeAttribute('disabled');
        }
        
        // Also ensure interchangeable checkbox is enabled/disabled correctly
        const interchangeableCheckbox = row.querySelector('.operation-interchangeable');
        if (interchangeableCheckbox) {
            if (isCompleted) {
                interchangeableCheckbox.disabled = true;
                interchangeableCheckbox.setAttribute('disabled', 'disabled');
            } else {
                interchangeableCheckbox.disabled = false;
                interchangeableCheckbox.removeAttribute('disabled');
            }
        }
    });
}

function enableEditableFieldsForNonCompletedOperations() {
    const tbody = document.getElementById('operations-detail-table-body');
    if (!tbody) return;
    
    const rows = tbody.querySelectorAll('tr[data-operation-key]');
    rows.forEach(row => {
        const operationKey = row.getAttribute('data-operation-key');
        // Only process existing operations (not new ones)
        if (operationKey) {
            const isCompleted = row.querySelector('.status-badge.status-green') !== null;
            
            if (!isCompleted) {
                // Enable machine dropdown
                const machineSelect = row.querySelector('.operation-machine');
                if (machineSelect) {
                    machineSelect.disabled = false;
                    machineSelect.removeAttribute('disabled');
                }
                
                // Enable interchangeable checkbox
                const interchangeableCheckbox = row.querySelector('.operation-interchangeable');
                if (interchangeableCheckbox) {
                    interchangeableCheckbox.disabled = false;
                    interchangeableCheckbox.removeAttribute('disabled');
                }
            }
        }
    });
}

function createOperationRow(operation, isNew = false) {
    const rowId = operation.key || `new-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const isCompleted = operation.completion_date !== null;
    const hoursSpent = parseFloat(operation.total_hours_spent) || 0;
    
    // Determine status based on completion_date and hours_spent (matching original tasks logic)
    let statusHtml = '';
    let isReadOnly = false;
    // Only make read-only if operation is actually completed (has completion_date)
    // Operations with hours spent but not completed should still be editable
    if (isCompleted) {
        statusHtml = '<span class="status-badge status-green">Tamamlandı</span>';
        isReadOnly = true;
    } else if (hoursSpent > 0) {
        statusHtml = '<span class="status-badge status-yellow">Çalışıldı</span>';
        isReadOnly = false; // Explicitly set to false - operations with hours spent are still editable
    } else {
        statusHtml = '<span class="status-badge status-grey">Bekliyor</span>';
        isReadOnly = false;
    }
    
    // Escape HTML for text values to prevent XSS
    const escapeHtml = (text) => {
        if (text === null || text === undefined) return '';
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return String(text).replace(/[&<>"']/g, m => map[m]);
    };
    
    const nameValue = escapeHtml(operation.name || '');
    const descValue = escapeHtml(operation.description || '');
    const orderValue = operation.order || '';
    const estimatedHoursValue = operation.estimated_hours || '';
    const keyValue = escapeHtml(operation.key || '');
    
    // Build machine options HTML
    const machineOptionsHtml = machines.map(m => {
        const selected = operation.machine_fk == m.id ? 'selected' : '';
        return `<option value="${m.id}" ${selected}>${escapeHtml(m.name)}</option>`;
    }).join('');
    
    return `
        <tr data-operation-key="${operation.key || ''}" data-is-new="${isNew}" data-row-id="${rowId}">
            <td>
                <span class="operation-key-display">${keyValue || '-'}</span>
                <input type="hidden" class="operation-order" value="${orderValue}">
            </td>
            <td>
                <input type="text" class="form-control form-control-sm operation-name" value="${nameValue}" ${isReadOnly ? 'readonly' : ''}>
            </td>
            <td>
                <textarea class="form-control form-control-sm operation-description" rows="1" ${isReadOnly ? 'readonly' : ''}>${descValue}</textarea>
            </td>
            <td>
                <select class="form-control form-control-sm operation-machine" ${isReadOnly ? 'disabled' : ''} data-operation-key="${operation.key || ''}">
                    <option value="">Makine seçin...</option>
                    ${machineOptionsHtml}
                </select>
            </td>
            <td>
                <input type="number" class="form-control form-control-sm operation-estimated-hours" value="${estimatedHoursValue}" step="0.01" min="0" ${isReadOnly ? 'readonly' : ''}>
            </td>
            <td class="text-center">
                ${hoursSpent > 0 ? parseFloat(hoursSpent).toFixed(2) + ' saat' : '-'}
            </td>
            <td class="text-center">
                <div class="form-check d-flex justify-content-center">
                    <input class="form-check-input operation-interchangeable" type="checkbox" ${operation.interchangeable ? 'checked' : ''} ${isReadOnly ? '' : ''} id="interchangeable-${rowId}" data-operation-key="${operation.key || ''}">
                </div>
            </td>
            <td class="text-center">
                ${statusHtml}
                ${operation.key ? `
                    <div class="mt-2">
                        ${isCompleted ? `
                            <button type="button" class="btn btn-sm btn-outline-warning toggle-completion-btn" 
                                    data-operation-key="${operation.key}" 
                                    data-action="uncomplete"
                                    title="Tamamlanmamış olarak işaretle">
                                <i class="fas fa-undo me-1"></i>Geri Al
                            </button>
                        ` : `
                            <button type="button" class="btn btn-sm btn-outline-success toggle-completion-btn" 
                                    data-operation-key="${operation.key}" 
                                    data-action="complete"
                                    title="Tamamlandı olarak işaretle">
                                <i class="fas fa-check me-1"></i>Tamamla
                            </button>
                        `}
                    </div>
                ` : ''}
            </td>
            <td class="text-center">
                ${operation.key ? `
                    <button type="button" class="btn btn-sm btn-outline-info manual-time-btn" 
                            data-operation-key="${operation.key}" 
                            data-operation-machine="${operation.machine_fk || ''}"
                            title="Manuel Zaman Girişi">
                        <i class="fas fa-clock me-1"></i>Manuel Zaman
                    </button>
                ` : ''}
                ${!isReadOnly ? `
                    <div class="btn-group mt-1" role="group">
                        <button type="button" class="btn btn-sm btn-outline-secondary move-up-btn" title="Yukarı Taşı">
                            <i class="fas fa-arrow-up"></i>
                        </button>
                        <button type="button" class="btn btn-sm btn-outline-secondary move-down-btn" title="Aşağı Taşı">
                            <i class="fas fa-arrow-down"></i>
                        </button>
                        <button type="button" class="btn btn-sm btn-outline-danger remove-operation-row-btn" title="Kaldır">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                ` : ''}
            </td>
        </tr>
    `;
}

function setupOperationsDetailEventListeners(part) {
    // Add operation row button
    document.getElementById('add-operation-row-btn')?.addEventListener('click', () => {
        addOperationRowToTable();
    });
    
    // Save operations button
    document.getElementById('save-operations-btn')?.addEventListener('click', async () => {
        await saveOperationsChanges(part);
    });
    
    // Remove operation row buttons
    document.querySelectorAll('.remove-operation-row-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const row = e.target.closest('tr');
            if (row) {
                row.remove();
                updateOperationOrdersInTable();
            }
        });
    });
    
    // Move up buttons
    document.querySelectorAll('.move-up-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const row = e.target.closest('tr');
            if (row) {
                moveOperationUp(row);
            }
        });
    });
    
    // Move down buttons
    document.querySelectorAll('.move-down-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const row = e.target.closest('tr');
            if (row) {
                moveOperationDown(row);
            }
        });
    });
    
    // Add event listeners for order changes to re-sort rows
    setupOrderChangeListeners();
    
    // Add event listeners for completion toggle buttons
    document.querySelectorAll('.toggle-completion-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const operationKey = e.target.closest('.toggle-completion-btn').getAttribute('data-operation-key');
            const action = e.target.closest('.toggle-completion-btn').getAttribute('data-action');
            if (operationKey) {
                await toggleOperationCompletion(operationKey, action === 'complete', part);
            }
        });
    });
    
    // Add event listeners for manual time entry buttons
    document.querySelectorAll('.manual-time-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const operationKey = e.target.closest('.manual-time-btn').getAttribute('data-operation-key');
            const machineFk = e.target.closest('.manual-time-btn').getAttribute('data-operation-machine');
            if (operationKey) {
                showManualTimeModal(operationKey, machineFk);
            }
        });
    });
}

function setupOrderChangeListeners() {
    const tbody = document.getElementById('operations-detail-table-body');
    if (!tbody) return;
    
    // Use event delegation for dynamically added rows
    tbody.addEventListener('input', (e) => {
        if (e.target.classList.contains('operation-order')) {
            // Debounce the re-sort to avoid too many operations
            clearTimeout(window.orderChangeTimeout);
            window.orderChangeTimeout = setTimeout(() => {
                sortRowsByOrder();
            }, 300);
        }
    });
}

function moveOperationUp(row) {
    const tbody = row.parentNode;
    if (!tbody) return;
    
    const rows = Array.from(tbody.querySelectorAll('tr:not(.empty-row)'));
    const currentIndex = rows.indexOf(row);
    
    if (currentIndex <= 0) return; // Already at the top
    
    const previousRow = rows[currentIndex - 1];
    const currentOrder = parseInt(row.querySelector('.operation-order')?.value) || 0;
    const previousOrder = parseInt(previousRow.querySelector('.operation-order')?.value) || 0;
    
    // Swap order values
    row.querySelector('.operation-order').value = previousOrder;
    previousRow.querySelector('.operation-order').value = currentOrder;
    
    // Swap rows in DOM
    tbody.insertBefore(row, previousRow);
    
    // Re-setup event listeners for the moved rows
    setupMoveButtonsForRow(row);
    setupMoveButtonsForRow(previousRow);
}

function moveOperationDown(row) {
    const tbody = row.parentNode;
    if (!tbody) return;
    
    const rows = Array.from(tbody.querySelectorAll('tr:not(.empty-row)'));
    const currentIndex = rows.indexOf(row);
    
    if (currentIndex >= rows.length - 1) return; // Already at the bottom
    
    const nextRow = rows[currentIndex + 1];
    const currentOrder = parseInt(row.querySelector('.operation-order')?.value) || 0;
    const nextOrder = parseInt(nextRow.querySelector('.operation-order')?.value) || 0;
    
    // Swap order values
    row.querySelector('.operation-order').value = nextOrder;
    nextRow.querySelector('.operation-order').value = currentOrder;
    
    // Swap rows in DOM - insert current row after next row
    if (nextRow.nextSibling) {
        tbody.insertBefore(row, nextRow.nextSibling);
    } else {
        tbody.appendChild(row);
    }
    
    // Re-setup event listeners for the moved rows
    setupMoveButtonsForRow(row);
    setupMoveButtonsForRow(nextRow);
}

function setupMoveButtonsForRow(row) {
    // Remove existing listeners by cloning the buttons
    const moveUpBtn = row.querySelector('.move-up-btn');
    const moveDownBtn = row.querySelector('.move-down-btn');
    
    if (moveUpBtn) {
        const newMoveUpBtn = moveUpBtn.cloneNode(true);
        moveUpBtn.parentNode.replaceChild(newMoveUpBtn, moveUpBtn);
        newMoveUpBtn.addEventListener('click', (e) => {
            const row = e.target.closest('tr');
            if (row) {
                moveOperationUp(row);
            }
        });
    }
    
    if (moveDownBtn) {
        const newMoveDownBtn = moveDownBtn.cloneNode(true);
        moveDownBtn.parentNode.replaceChild(newMoveDownBtn, moveDownBtn);
        newMoveDownBtn.addEventListener('click', (e) => {
            const row = e.target.closest('tr');
            if (row) {
                moveOperationDown(row);
            }
        });
    }
}

function sortRowsByOrder() {
    const tbody = document.getElementById('operations-detail-table-body');
    if (!tbody) return;
    
    // Get all rows (excluding empty row)
    const rows = Array.from(tbody.querySelectorAll('tr:not(.empty-row)'));
    
    if (rows.length === 0) return;
    
    // Sort rows by order value
    rows.sort((a, b) => {
        const orderA = parseInt(a.querySelector('.operation-order')?.value) || 999999;
        const orderB = parseInt(b.querySelector('.operation-order')?.value) || 999999;
        return orderA - orderB;
    });
    
    // Remove all rows from tbody
    rows.forEach(row => row.remove());
    
    // Re-append rows in sorted order
    rows.forEach(row => tbody.appendChild(row));
}

function addOperationRowToTable() {
    const tbody = document.getElementById('operations-detail-table-body');
    if (!tbody) return;
    
    // Remove empty row if exists
    const emptyRow = tbody.querySelector('.empty-row');
    if (emptyRow) {
        emptyRow.remove();
    }
    
    // Get max order number from all rows (including new ones)
    const allRows = tbody.querySelectorAll('tr');
    let maxOrder = 0;
    allRows.forEach(row => {
        const orderInput = row.querySelector('.operation-order');
        if (orderInput && orderInput.value) {
            const orderValue = parseInt(orderInput.value);
            if (!isNaN(orderValue)) {
                maxOrder = Math.max(maxOrder, orderValue);
            }
        }
    });
    
    // Create new operation object with unique row ID
    const rowId = `new-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newOperation = {
        key: `Yeni-${Date.now()}`,
        order: maxOrder + 1,
        name: '',
        description: '',
        machine_fk: null,
        estimated_hours: null,
        interchangeable: false,
        completion_date: null,  // Explicitly set to null for new operations
        total_hours_spent: 0    // Explicitly set to 0 for new operations
    };
    
    // Create row HTML string
    const rowHtml = createOperationRow(newOperation, true);
    
    // Create a temporary tbody to parse the HTML properly
    const tempTbody = document.createElement('tbody');
    tempTbody.innerHTML = rowHtml;
    const newRow = tempTbody.querySelector('tr');
    
    if (!newRow) {
        console.error('Failed to create operation row');
        return;
    }
    
    // Set the row ID
    newRow.setAttribute('data-row-id', rowId);
    newRow.setAttribute('data-is-new', 'true');
    newRow.setAttribute('data-operation-key', '');
    
    // Append to tbody
    tbody.appendChild(newRow);
    
    // Populate machine dropdown for the new row and ensure all fields are enabled
    const machineSelect = newRow.querySelector('.operation-machine');
    if (machineSelect) {
        // Explicitly enable the select (remove disabled attribute)
        machineSelect.removeAttribute('disabled');
        machineSelect.disabled = false;
        
        if (machines.length > 0) {
            // Clear and populate machine options
            machineSelect.innerHTML = '<option value="">Makine seçin...</option>';
            machines.forEach(machine => {
                const option = document.createElement('option');
                option.value = machine.id;
                option.textContent = machine.name;
                machineSelect.appendChild(option);
            });
        } else {
            // If machines not loaded yet, load them
            loadMachines().then(() => {
                machineSelect.innerHTML = '<option value="">Makine seçin...</option>';
                machines.forEach(machine => {
                    const option = document.createElement('option');
                    option.value = machine.id;
                    option.textContent = machine.name;
                    machineSelect.appendChild(option);
                });
            });
        }
    }
    
    // Explicitly enable all input fields for new rows (remove readonly/disabled attributes)
    const nameInput = newRow.querySelector('.operation-name');
    const descTextarea = newRow.querySelector('.operation-description');
    const hoursInput = newRow.querySelector('.operation-estimated-hours');
    const interchangeableCheckbox = newRow.querySelector('.operation-interchangeable');
    
    if (nameInput) {
        nameInput.removeAttribute('readonly');
        nameInput.readOnly = false;
    }
    if (descTextarea) {
        descTextarea.removeAttribute('readonly');
        descTextarea.readOnly = false;
    }
    if (hoursInput) {
        hoursInput.removeAttribute('readonly');
        hoursInput.readOnly = false;
    }
    if (interchangeableCheckbox) {
        interchangeableCheckbox.removeAttribute('disabled');
        interchangeableCheckbox.disabled = false;
    }
    
    // Ensure status shows "Bekliyor" for new rows
    const statusCell = newRow.querySelector('td:nth-child(8)');
    if (statusCell) {
        statusCell.innerHTML = '<span class="status-badge status-grey">Bekliyor</span>';
    }
    
    // Sort rows after adding new row to maintain order
    sortRowsByOrder();
    
    // Setup event listeners for buttons
    const removeBtn = newRow.querySelector('.remove-operation-row-btn');
    if (removeBtn) {
        removeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const row = e.target.closest('tr');
            if (row) {
                row.remove();
                updateOperationOrdersInTable();
            }
        });
    }
    
    // Setup move up button
    const moveUpBtn = newRow.querySelector('.move-up-btn');
    if (moveUpBtn) {
        moveUpBtn.addEventListener('click', (e) => {
            const row = e.target.closest('tr');
            if (row) {
                moveOperationUp(row);
            }
        });
    }
    
    // Setup move down button
    const moveDownBtn = newRow.querySelector('.move-down-btn');
    if (moveDownBtn) {
        moveDownBtn.addEventListener('click', (e) => {
            const row = e.target.closest('tr');
            if (row) {
                moveOperationDown(row);
            }
        });
    }
    
    updateOperationOrdersInTable();
}

function updateOperationOrdersInTable() {
    const tbody = document.getElementById('operations-detail-table-body');
    if (!tbody) return;
    
    const rows = Array.from(tbody.querySelectorAll('tr:not(.empty-row)'));
    
    // Show empty message if no rows
    if (rows.length === 0) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="9" class="text-center text-muted">Henüz operasyon eklenmemiş</td></tr>';
        return;
    }
    
    // Don't auto-update order numbers - let users set custom order values
    // The table will be sorted by order value automatically
}

async function saveOperationsChanges(part) {
    const tbody = document.getElementById('operations-detail-table-body');
    if (!tbody) return;
    
    const rows = Array.from(tbody.querySelectorAll('tr[data-operation-key]'));
    const operations = [];
    const deleteOperations = [];
    
    // Track which existing operations we've seen
    const existingOperationKeys = new Set();
    let hasValidationError = false;
    
    rows.forEach(row => {
        const operationKey = row.getAttribute('data-operation-key');
        const isNew = row.getAttribute('data-is-new') === 'true';
        const isCompleted = row.querySelector('.status-badge.status-green') !== null;
        
        // If row is marked for deletion (removed from DOM but tracked), skip
        if (!row.parentNode) return;
        
        // Collect operation data
        const order = parseInt(row.querySelector('.operation-order')?.value) || 1;
        const name = row.querySelector('.operation-name')?.value?.trim();
        const description = row.querySelector('.operation-description')?.value?.trim() || null;
        const machineFk = row.querySelector('.operation-machine')?.value ? parseInt(row.querySelector('.operation-machine').value) : null;
        const estimatedHours = row.querySelector('.operation-estimated-hours')?.value ? parseFloat(row.querySelector('.operation-estimated-hours').value) : null;
        const interchangeable = row.querySelector('.operation-interchangeable')?.checked || false;
        
        // Validate required fields
        if (!name) {
            hasValidationError = true;
            return;
        }
        
        if (isNew || !operationKey) {
            // New operation - validate machine is selected
            if (!machineFk) {
                hasValidationError = true;
                return;
            }
            operations.push({
                name,
                description,
                machine_fk: machineFk,
                order,
                interchangeable,
                estimated_hours: estimatedHours
            });
        } else {
            // Existing operation - only update if not completed
            if (!isCompleted) {
                existingOperationKeys.add(operationKey);
                // Validate machine is selected for updates too
                if (!machineFk) {
                    hasValidationError = true;
                    return;
                }
                operations.push({
                    key: operationKey,
                    name,
                    description,
                    machine_fk: machineFk,
                    order,
                    interchangeable,
                    estimated_hours: estimatedHours
                });
            } else {
                // Keep completed operations as-is (don't update them)
                existingOperationKeys.add(operationKey);
            }
        }
    });
    
    if (hasValidationError) {
        showNotification('Lütfen tüm operasyonlar için ad ve makine seçin', 'error');
        return;
    }
    
    // Find operations to delete (operations that existed before but are not in the current list)
    const currentPartDetails = window.currentPartDetails;
    if (currentPartDetails && currentPartDetails.operations) {
        currentPartDetails.operations.forEach(op => {
            if (op.key && !existingOperationKeys.has(op.key) && !op.completion_date) {
                deleteOperations.push(op.key);
            }
        });
    }
    
    try {
        const result = await updatePartOperations(part.key, {
            operations,
            delete_operations: deleteOperations
        });
        
        if (result) {
            showNotification('Operasyonlar başarıyla güncellendi', 'success');
            // Reload operations
            await showPartDetails(part.key);
        } else {
            throw new Error('Failed to update operations');
        }
    } catch (error) {
        console.error('Error saving operations:', error);
        showNotification('Operasyonlar kaydedilirken hata oluştu: ' + (error.message || 'Bilinmeyen hata'), 'error');
    }
}


async function toggleOperationCompletion(operationKey, markAsCompleted, part) {
    try {
        let result;
        if (markAsCompleted) {
            result = await markOperationCompleted(operationKey);
            showNotification('Operasyon tamamlandı olarak işaretlendi', 'success');
        } else {
            result = await unmarkOperationCompleted(operationKey);
            showNotification('Operasyon tamamlanmamış olarak işaretlendi', 'info');
        }
        
        if (result) {
            // Reload operations to reflect the change
            await showPartDetails(part.key);
            // Also reload the parts list to update status
            await loadParts(currentPage);
        }
    } catch (error) {
        console.error('Error toggling operation completion:', error);
        showNotification('Operasyon durumu değiştirilirken hata oluştu: ' + (error.message || 'Bilinmeyen hata'), 'error');
    }
}

window.deletePartConfirm = function(partKey) {
    // Find the part to get its name
    const part = parts.find(p => p.key === partKey);
    
    // Set the pending delete key
    window.pendingDeletePartKey = partKey;
    
    // Update the modal with part name
    const deletePartNameElement = document.getElementById('delete-part-name');
    if (deletePartNameElement && part) {
        deletePartNameElement.textContent = `${part.key} - ${part.name}`;
    }
    
    // Show the delete confirmation modal
    const deleteModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('deleteConfirmModal'));
    deleteModal.show();
};

function showManualTimeModal(operationKey, machineFk = '') {
    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('manualTimeModal'));
    
    // Set operation key
    document.getElementById('manual-time-operation-key').value = operationKey;
    
    // Populate machine dropdown
    const machineSelect = document.getElementById('manual-time-machine');
    machineSelect.innerHTML = '<option value="">Makine seçin...</option>';
    machines.forEach(machine => {
        const option = document.createElement('option');
        option.value = machine.id;
        option.textContent = machine.name;
        if (machineFk && machine.id == machineFk) {
            option.selected = true;
        }
        machineSelect.appendChild(option);
    });
    
    // Reset form
    document.getElementById('manual-time-form').reset();
    document.getElementById('manual-time-operation-key').value = operationKey;
    if (machineFk) {
        machineSelect.value = machineFk;
    }
    
    // Set default times (current time for finish, 1 hour before for start)
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    // Format for datetime-local input (YYYY-MM-DDTHH:mm)
    const formatDateTimeLocal = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    };
    
    document.getElementById('manual-time-start').value = formatDateTimeLocal(oneHourAgo);
    document.getElementById('manual-time-finish').value = formatDateTimeLocal(now);
    
    modal.show();
}

async function saveManualTimeEntry() {
    const form = document.getElementById('manual-time-form');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    
    const operationKey = document.getElementById('manual-time-operation-key').value;
    const machineFk = parseInt(document.getElementById('manual-time-machine').value);
    const startTime = document.getElementById('manual-time-start').value;
    const finishTime = document.getElementById('manual-time-finish').value;
    const comment = document.getElementById('manual-time-comment').value.trim();
    
    // Validate that finish time is after start time
    if (new Date(finishTime) <= new Date(startTime)) {
        showNotification('Bitiş zamanı başlangıç zamanından sonra olmalıdır', 'error');
        return;
    }
    
    // Convert datetime-local to milliseconds timestamp
    const startTimestamp = new Date(startTime).getTime();
    const finishTimestamp = new Date(finishTime).getTime();
    
    const timeData = {
        task_key: operationKey,
        machine_fk: machineFk,
        start_time: startTimestamp,
        finish_time: finishTimestamp
    };
    
    if (comment) {
        timeData.comment = comment;
    }
    
    try {
        const saveBtn = document.getElementById('save-manual-time-btn');
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Kaydediliyor...';
        
        const result = await createManualTimeEntry(timeData);
        
        if (result && result.id) {
            showNotification('Manuel zaman girişi başarıyla oluşturuldu', 'success');
            
            // Close modal
            const modalElement = document.getElementById('manualTimeModal');
            const modalInstance = bootstrap.Modal.getInstance(modalElement);
            if (modalInstance) {
                modalInstance.hide();
            }
            
            // Reload operations to show updated hours
            if (window.currentPartDetails && window.currentPartDetails.part) {
                await showPartDetails(window.currentPartDetails.part.key);
            }
        } else {
            throw new Error('Unexpected response format');
        }
    } catch (error) {
        console.error('Error saving manual time entry:', error);
        
        // Handle specific error responses
        let errorMessage = 'Manuel zaman girişi kaydedilirken hata oluştu';
        if (error.message) {
            if (error.message.includes('overlap') || error.message.includes('overlaps')) {
                errorMessage = 'Bu makine için belirtilen zaman aralığında başka bir zamanlayıcı mevcut. Lütfen farklı bir zaman aralığı seçin.';
            } else if (error.message.includes('not found') || error.message.includes('Operation not found')) {
                errorMessage = 'Operasyon bulunamadı';
            } else if (error.message.includes('Invalid timestamp')) {
                errorMessage = 'Geçersiz zaman formatı';
            } else {
                errorMessage = error.message;
            }
        }
        
        showNotification(errorMessage, 'error');
    } finally {
        const saveBtn = document.getElementById('save-manual-time-btn');
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-save me-1"></i>Kaydet';
    }
}
