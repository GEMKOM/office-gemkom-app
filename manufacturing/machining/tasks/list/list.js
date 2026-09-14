import { initNavbar } from '../../../../components/navbar.js';
import { getParts, getPart, updatePart, deletePart, createPart, updatePartOperations, getPartsStats, uploadPartFiles, deletePartFile, convertPartsToDepartmentRequest, getPartCost } from '../../../../apis/machining/parts.js';
import { createJobAllocationsEditor, formatSharePercent } from '../../../../components/jobAllocations/jobAllocations.js';
import { hasPerm, isSuperuser } from '../../../../authService.js';
import { getOperations, markOperationCompleted, unmarkOperationCompleted, createManualTimeEntry } from '../../../../apis/machining/operations.js';
import { fetchMachinesDropdown } from '../../../../apis/machines.js';
import { fetchAllUsers } from '../../../../apis/users.js';
import { HeaderComponent } from '../../../../components/header/header.js';
import { FiltersComponent } from '../../../../components/filters/filters.js';
import { StatisticsCards } from '../../../../components/statistics-cards/statistics-cards.js';
import { DisplayModal } from '../../../../components/display-modal/display-modal.js';
import { TableComponent } from '../../../../components/table/table.js';
import { FileAttachments } from '../../../../components/file-attachments/file-attachments.js';
import { FileViewer } from '../../../../components/file-viewer/file-viewer.js';
import { showNotification } from '../../../../components/notification/notification.js';
import { getJobOrderDropdown } from '../../../../apis/projects/jobOrders.js';
import { escapeHtml } from '../../../../utils/text.js';

// Plan dates come from the server-side machine plan (read-only on this page).
function formatIsoDate(isoDate) {
    // "2026-09-30" -> "30.09.2026" (string split; no timezone drift through Date)
    if (!isoDate || typeof isoDate !== 'string') return '';
    const [year, month, day] = isoDate.split('-');
    if (!year || !month || !day) return isoDate;
    return `${day}.${month}.${year}`;
}

function formatPlanStamp(ms, withYear = false) {
    // epoch ms -> "18.09.2026 08:00" (withYear) or "18.09 08:00"
    if (!ms) return '';
    const date = new Date(ms);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    const dayMonth = `${pad(date.getDate())}.${pad(date.getMonth() + 1)}`;
    const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
    return withYear ? `${dayMonth}.${date.getFullYear()} ${time}` : `${dayMonth} ${time}`;
}

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
let selectedPartsForConvert = [];
let partFileUploadTargetKey = null;
let createAllocationsEditor = null;   // allocation editor inside the create modal
let editAllocationsEditor = null;     // allocation editor inside #partAllocationsModal
let editAllocationsPartKey = null;

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
        users = await fetchAllUsers();
        
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
                cellClass: 'part-alloc-cell',
                formatter: (value, row) => {
                    // value is the display label: "254-01" or "254-01 +2"
                    const label = value || '-';
                    if (!row?.is_multi_job) {
                        return escapeHtml(label);
                    }
                    const tooltip = escapeHtml(allocationTooltip(row));
                    const match = /^(.*?)\s\+(\d+)$/.exec(label);
                    const baseText = match ? match[1] : label;
                    const extraCount = match ? match[2] : Math.max(0, getPartAllocations(row).length - 1);
                    return `${escapeHtml(baseText)} <span class="status-badge status-blue part-multi-job-chip" title="${tooltip}">+${extraCount}</span>`;
                }
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
                cellClass: 'part-alloc-cell',
                formatter: (value, row) => {
                    // value is the total across all job orders
                    const tooltip = row?.is_multi_job ? ` title="${escapeHtml(allocationTooltip(row))}"` : '';
                    return `<span class="quantity-badge"${tooltip}>${value || 0}</span>`;
                }
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
                // type 'date' makes the inline editor a native date picker (shown in the
                // browser's locale, e.g. 20.02.2026) instead of a text box with the raw
                // ISO value; the saved value stays ISO.
                type: 'date',
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
                field: 'files',
                label: 'Dosyalar',
                sortable: false,
                width: '8%',
                formatter: (value, row) => {
                    const count = row.files?.length || 0;
                    if (row.is_locked) {
                        return count > 0
                            ? `<span class="badge bg-secondary" title="Kilitli parça">${count}</span>`
                            : '-';
                    }
                    return `
                        <button type="button" class="btn btn-sm btn-outline-secondary part-file-upload-btn"
                                data-part-key="${row.key}" title="Dosya yükle">
                            <i class="fas fa-paperclip"></i>
                            ${count > 0 ? `<span class="badge bg-primary ms-1">${count}</span>` : ''}
                        </button>
                    `;
                }
            },
            {
                field: 'status',
                label: 'Durum',
                sortable: false,
                width: '12%',
                formatter: (value, row) => {
                    if (row.is_locked) {
                        const drNum = row.department_request_number || '';
                        return `<span class="status-badge status-blue">Departman Talebine Dönüştürüldü${drNum ? ` → ${drNum}` : ''}</span>`;
                    }
                    if (row.completion_date) {
                        return '<span class="status-badge status-green">Tamamlandı</span>';
                    } else if (row.incomplete_operation_count > 0) {
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
                visible: (row) => !row.is_locked,
                onClick: (row) => deletePartConfirm(row.key)
            }
        ],
        selectable: true,
        isRowSelectable: (row) => !row.is_locked,
        isRowEditable: (row) => !row.is_locked,
        onSelectionChange: (selectedRows) => {
            selectedPartsForConvert = selectedRows;
            updateBulkActionBar();
        },
        data: [],
        loading: true,
        sortable: true,
        pagination: true,
        itemsPerPage: 20,
        currentPage: 1,
        totalItems: 0,
        serverSidePagination: true,
        onPageChange: (page) => {
            partsTable?.clearSelection();
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
            currentOrdering = direction === 'asc' ? field : `-${field}`;
            loadParts(1);
        },
        initialSortField: 'created_at',
        initialSortDirection: 'desc',
        exportable: true,
        refreshable: true,
        onRefresh: () => {
            loadParts(currentPage);
        },
        striped: false,
        small: false,
        emptyMessage: 'Parça bulunamadı',
        emptyIcon: 'fas fa-box',
        rowAttributes: (row) => `data-part-key="${row.key}"${row.is_locked ? ' data-locked="1"' : ''} class="data-update"`,
        // Enable cell editing
        // job_no / quantity are not inline-editable any more: a part may be split
        // across several job orders, so those cells open the allocation editor modal.
        editable: true,
        editableColumns: ['name', 'description', 'image_no', 'position_no', 'material', 'weight_kg', 'finish_time'],
        onEdit: async (row, field, newValue, oldValue) => {
            try {
                if (row.is_locked) {
                    showNotification('Bu parça departman talebine dönüştürüldü, düzenlenemez.', 'warning');
                    return false;
                }
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
    
    // Add ordering — default: newest first
    filters.ordering = currentOrdering || '-created_at';
    
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

    document.getElementById('parts-bulk-convert-btn')?.addEventListener('click', () => {
        showConvertToDepartmentRequestModal();
    });

    document.getElementById('convert-dr-submit-btn')?.addEventListener('click', () => {
        submitConvertToDepartmentRequest();
    });

    document.getElementById('save-part-allocations-btn')?.addEventListener('click', () => {
        savePartAllocations();
    });

    const hiddenFileInput = document.getElementById('part-file-upload-input');
    hiddenFileInput?.addEventListener('change', async (e) => {
        const files = e.target.files;
        if (!files?.length || !partFileUploadTargetKey) return;
        try {
            await uploadPartFiles(partFileUploadTargetKey, files);
            showNotification('Dosyalar yüklendi', 'success');
            await loadParts(currentPage);
        } catch (error) {
            console.error('File upload error:', error);
            showNotification(error.message || 'Dosya yüklenirken hata oluştu', 'error');
        } finally {
            e.target.value = '';
            partFileUploadTargetKey = null;
        }
    });

    document.getElementById('parts-table-container')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.part-file-upload-btn');
        if (btn) {
            e.preventDefault();
            e.stopPropagation();
            partFileUploadTargetKey = btn.dataset.partKey;
            hiddenFileInput?.click();
            return;
        }

        // İş No / Adet cells open the job allocation editor
        const allocCell = e.target.closest('.part-alloc-cell');
        if (!allocCell) return;
        const partKey = allocCell.closest('tr[data-part-key]')?.dataset.partKey;
        if (!partKey) return;
        const part = parts.find((p) => p.key === partKey);
        if (!part) return;
        e.preventDefault();
        e.stopPropagation();
        if (part.is_locked) {
            showNotification('Bu parça departman talebine dönüştürüldü, düzenlenemez.', 'warning');
            return;
        }
        showPartAllocationsModal(part);
    });
}

// ---------------------------------------------------------------------------
// Job allocations (a part split across several job orders)
// ---------------------------------------------------------------------------

/**
 * Allocation rows of a part: `[{job_no, quantity, share}]`, primary first.
 * Falls back to the legacy single job_no / quantity when the payload has no rows.
 */
function getPartAllocations(part) {
    if (Array.isArray(part?.job_allocations) && part.job_allocations.length > 0) {
        return part.job_allocations;
    }
    if (part?.job_no) {
        return [{ job_no: part.job_no, quantity: part.quantity ?? null, share: 1 }];
    }
    return [];
}

function allocationTooltip(part) {
    return getPartAllocations(part)
        .map((a) => `${a.job_no} × ${a.quantity ?? '-'}`)
        .join('\n');
}

function allocationTableHtml(allocations) {
    if (!allocations.length) {
        return '<p class="text-muted small mb-0">İş emri atanmamış</p>';
    }
    const total = allocations.reduce((sum, a) => sum + (parseInt(a.quantity, 10) || 0), 0);
    const rows = allocations.map((a) => {
        const qty = parseInt(a.quantity, 10);
        const share = a.share !== undefined && a.share !== null
            ? Number(a.share)
            : (total > 0 && qty > 0 ? qty / total : null);
        return `
            <tr>
                <td>${escapeHtml(a.job_no || '-')}</td>
                <td class="text-end">${Number.isFinite(qty) ? qty : '-'}</td>
                <td class="text-end">${share !== null ? formatSharePercent(share) : '-'}</td>
            </tr>`;
    }).join('');
    return `
        <table class="table table-sm table-bordered part-allocation-table mb-0">
            <thead class="table-light">
                <tr><th>İş Emri</th><th class="text-end">Adet</th><th class="text-end">Pay %</th></tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
                <tr><th>Toplam</th><th class="text-end">${total}</th><th class="text-end">${total > 0 ? '%100' : '-'}</th></tr>
            </tfoot>
        </table>`;
}

/** Pull the first backend message out of an "... - {json}" API error. */
function extractApiErrorMessage(error, fallback) {
    const text = error?.message || '';
    const start = text.indexOf('{');
    if (start !== -1) {
        try {
            const data = JSON.parse(text.slice(start));
            const first = Object.values(data)[0];
            const message = Array.isArray(first) ? first[0] : first;
            if (typeof message === 'string' && message) return message;
        } catch (_) {
            // not JSON — fall through
        }
    }
    return fallback;
}

function showPartAllocationsModal(part) {
    const modalElement = document.getElementById('partAllocationsModal');
    if (!modalElement) return;

    editAllocationsPartKey = part.key;
    const partLabel = document.getElementById('part-allocations-modal-part');
    if (partLabel) {
        partLabel.textContent = `${part.key}${part.name ? ` - ${part.name}` : ''}`;
    }

    const initial = getPartAllocations(part).map((a) => ({ job_no: a.job_no, quantity: a.quantity }));
    if (!editAllocationsEditor) {
        editAllocationsEditor = createJobAllocationsEditor('part-allocations-editor', { initial });
    } else {
        editAllocationsEditor.setValue(initial);
    }

    bootstrap.Modal.getOrCreateInstance(modalElement).show();
}

async function savePartAllocations() {
    if (!editAllocationsEditor || !editAllocationsPartKey) return;

    const validationError = editAllocationsEditor.getError();
    if (validationError) {
        editAllocationsEditor.showError(validationError);
        return;
    }

    const saveBtn = document.getElementById('save-part-allocations-btn');
    if (saveBtn) saveBtn.disabled = true;

    try {
        const updatedPart = await updatePart(editAllocationsPartKey, {
            job_allocations: editAllocationsEditor.getValue()
        });
        applyPartUpdate(editAllocationsPartKey, updatedPart);
        bootstrap.Modal.getInstance(document.getElementById('partAllocationsModal'))?.hide();
        showNotification('İş emri dağılımı güncellendi', 'success');
    } catch (error) {
        console.error('Error updating part allocations:', error);
        const message = extractApiErrorMessage(error, 'İş emri dağılımı güncellenirken hata oluştu');
        editAllocationsEditor.showError(message);
        showNotification(message, 'error');
    } finally {
        if (saveBtn) saveBtn.disabled = false;
    }
}

/** Merge the allocation fields of a PATCH response into the cached row and re-render. */
function applyPartUpdate(partKey, updatedPart) {
    if (!updatedPart) return;
    const index = parts.findIndex((p) => p.key === partKey);
    if (index === -1) return;
    ['job_no', 'job_no_primary', 'job_allocations', 'is_multi_job', 'quantity'].forEach((field) => {
        if (updatedPart[field] !== undefined) {
            parts[index][field] = updatedPart[field];
        }
    });
    if (partsTable) {
        partsTable.updateData(parts, totalParts, currentPage);
    }
}

function canViewJobCosts() {
    try {
        return isSuperuser() || hasPerm('view_job_costs');
    } catch (_) {
        return false;
    }
}

function renderPartCostCard(cost) {
    const currency = cost.currency || 'EUR';
    const fmtMoney = (v) => `${Number(v || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
    const fmtHours = (v) => Number(v || 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 });
    const rows = (cost.job_allocations || []).map((a) => `
        <tr>
            <td>${escapeHtml(a.job_no || '-')}</td>
            <td class="text-end">${a.quantity ?? '-'}</td>
            <td class="text-end">${formatSharePercent(a.share)}</td>
            <td class="text-end">${fmtHours(a.hours?.total)} s</td>
            <td class="text-end">${fmtMoney(a.total_cost)}</td>
        </tr>`).join('');
    return `
        <div class="part-cost-card">
            <div class="part-cost-summary">
                <div class="part-cost-stat">
                    <div class="part-cost-stat-label">Toplam maliyet</div>
                    <div class="part-cost-stat-value">${fmtMoney(cost.total_cost)}</div>
                </div>
                <div class="part-cost-stat">
                    <div class="part-cost-stat-label">Birim maliyet</div>
                    <div class="part-cost-stat-value">${fmtMoney(cost.unit_cost)}</div>
                </div>
                <div class="part-cost-stat">
                    <div class="part-cost-stat-label">Toplam saat</div>
                    <div class="part-cost-stat-value">${fmtHours(cost.hours?.total)} s</div>
                </div>
                <div class="part-cost-stat">
                    <div class="part-cost-stat-label">Toplam adet</div>
                    <div class="part-cost-stat-value">${cost.total_quantity ?? '-'}</div>
                </div>
            </div>
            <table class="table table-sm table-bordered part-allocation-table mb-0">
                <thead class="table-light">
                    <tr>
                        <th>İş Emri</th>
                        <th class="text-end">Adet</th>
                        <th class="text-end">Pay</th>
                        <th class="text-end">Saat</th>
                        <th class="text-end">Maliyet</th>
                    </tr>
                </thead>
                <tbody>${rows || '<tr><td colspan="5" class="text-center text-muted">Kayıt yok</td></tr>'}</tbody>
            </table>
        </div>`;
}

async function loadPartCostCard(partKey) {
    const container = document.getElementById('part-cost-card-container');
    if (!container) return;
    if (!canViewJobCosts()) {
        container.hidden = true;
        return;
    }
    container.hidden = false;
    container.innerHTML = '<div class="text-muted small"><i class="fas fa-spinner fa-spin me-1"></i>Maliyet yükleniyor...</div>';
    try {
        const cost = await getPartCost(partKey);
        container.innerHTML = renderPartCostCard(cost);
    } catch (error) {
        if (error?.status === 403) {
            // Not allowed to see costs — hide quietly.
            container.hidden = true;
            container.innerHTML = '';
            return;
        }
        console.error('Error loading part cost:', error);
        container.innerHTML = '<div class="text-muted small">Maliyet bilgisi alınamadı</div>';
    }
}

function updateBulkActionBar() {
    const bar = document.getElementById('parts-bulk-actions');
    const btn = document.getElementById('parts-bulk-convert-btn');
    const count = selectedPartsForConvert.length;
    if (!bar || !btn) return;
    if (count > 0) {
        bar.classList.remove('d-none');
        btn.textContent = `Departman Talebine Dönüştür (${count})`;
    } else {
        bar.classList.add('d-none');
    }
}

function buildItemDescription(part) {
    const parts = [part.image_no, part.position_no].filter(Boolean);
    return parts.join(' / ');
}

function showConvertToDepartmentRequestModal() {
    const selected = partsTable?.getSelectedRows() || selectedPartsForConvert;
    if (!selected.length) {
        showNotification('Lütfen en az bir parça seçin', 'warning');
        return;
    }

    const locked = selected.filter((p) => p.is_locked);
    if (locked.length) {
        showNotification('Kilitli parçalar dönüştürme işlemine dahil edilemez', 'warning');
        return;
    }

    const previewBody = document.getElementById('convert-dr-preview-body');
    if (previewBody) {
        previewBody.innerHTML = selected.map((part) => {
            const allocations = getPartAllocations(part);
            // One request line per (part, job order): list the breakdown
            const jobHtml = allocations.length
                ? allocations.map((a) => `<div>${escapeHtml(a.job_no)} <span class="text-muted">× ${a.quantity ?? '-'}</span></div>`).join('')
                : '-';
            return `
            <tr>
                <td>${escapeHtml(part.name || '-')}</td>
                <td>${jobHtml}</td>
                <td>${part.quantity ?? '-'}</td>
                <td>adet</td>
                <td>${escapeHtml(buildItemDescription(part) || '-')}</td>
                <td>${part.files?.length || 0}</td>
            </tr>`;
        }).join('');
    }

    const summaryEl = document.getElementById('convert-dr-allocation-summary');
    if (summaryEl) {
        const totalLines = selected.reduce((n, p) => n + Math.max(1, getPartAllocations(p).length), 0);
        const distinctJobs = new Set(
            selected.flatMap((p) => getPartAllocations(p).map((a) => a.job_no).filter(Boolean))
        ).size;
        summaryEl.textContent = distinctJobs > 0
            ? `${distinctJobs} iş emri için ${totalLines} talep kalemi oluşturulacak`
            : `${totalLines} talep kalemi oluşturulacak`;
    }

    document.getElementById('convert-dr-title').value = 'Parça Talebi';
    document.getElementById('convert-dr-priority').value = 'normal';
    document.getElementById('convert-dr-needed-date').value = '';
    document.getElementById('convert-dr-description').value = '';

    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('convertDepartmentRequestModal'));
    modal.show();
}

async function submitConvertToDepartmentRequest() {
    const selected = partsTable?.getSelectedRows() || selectedPartsForConvert;
    const title = document.getElementById('convert-dr-title')?.value?.trim();
    const priority = document.getElementById('convert-dr-priority')?.value || 'normal';
    const neededDate = document.getElementById('convert-dr-needed-date')?.value || null;
    const description = document.getElementById('convert-dr-description')?.value?.trim() || '';

    if (!title) {
        showNotification('Başlık zorunludur', 'warning');
        return;
    }

    const submitBtn = document.getElementById('convert-dr-submit-btn');
    if (submitBtn) submitBtn.disabled = true;

    try {
        const result = await convertPartsToDepartmentRequest(
            selected.map((p) => p.key),
            { title, priority, needed_date: neededDate, description }
        );

        const link = `/general/department-requests/list?request=${result.id}`;
        showNotification(
            `Departman talebi oluşturuldu: <a href="${link}" class="alert-link">${result.request_number}</a>`,
            'success',
            8000
        );

        bootstrap.Modal.getInstance(document.getElementById('convertDepartmentRequestModal'))?.hide();
        partsTable?.clearSelection();
        selectedPartsForConvert = [];
        updateBulkActionBar();
        await loadParts(currentPage);
    } catch (error) {
        console.error('Convert error:', error);
        showNotification(error.message || 'Dönüştürme başarısız', 'error');
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
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

    // Job allocation editor (one empty row by default, as the old İş No + Adet inputs)
    if (!createAllocationsEditor && document.getElementById('part-job-allocations-editor')) {
        createAllocationsEditor = createJobAllocationsEditor('part-job-allocations-editor', { allowEmpty: true });
    } else if (createAllocationsEditor) {
        createAllocationsEditor.setValue([]);
    }

    // "Malzeme ve Özellikler" starts collapsed on every open; it is optional
    // and only expands when the user asks for it.
    const materialSection = document.getElementById('part-material-section');
    if (materialSection && window.bootstrap?.Collapse) {
        bootstrap.Collapse.getOrCreateInstance(materialSection, { toggle: false }).hide();
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
        image_no: document.getElementById('part-image-no')?.value || null,
        position_no: document.getElementById('part-position-no')?.value || null,
        material: document.getElementById('part-material')?.value || null,
        dimensions: document.getElementById('part-dimensions')?.value || null,
        weight_kg: document.getElementById('part-weight-kg')?.value ? parseFloat(document.getElementById('part-weight-kg').value) : null,
        finish_time: document.getElementById('part-finish-time')?.value || null,
        operations: []
    };

    // Job orders + quantities come from the allocation editor.
    // With at least one job order picked we send job_allocations (and no
    // job_no / quantity); with none picked we keep the legacy shape so a part
    // without a job order stays creatable exactly as before.
    if (createAllocationsEditor && !createAllocationsEditor.isEmpty()) {
        const allocationError = createAllocationsEditor.getError();
        if (allocationError) {
            createAllocationsEditor.showError(allocationError);
            showNotification(allocationError, 'error');
            return;
        }
        partData.job_allocations = createAllocationsEditor.getValue();
    } else {
        const firstRow = createAllocationsEditor?.getRawRows()[0];
        const legacyQuantity = firstRow && Number.isInteger(firstRow.quantity) && firstRow.quantity > 0 ? firstRow.quantity : null;
        partData.job_no = null;
        partData.quantity = legacyQuantity;
    }
    
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
            // Creation always plans: show the first operation's slot when the server
            // returned one (planned_start_ms is null while auto-planning is off).
            const createdOps = Array.isArray(createdPart.operations)
                ? [...createdPart.operations].sort((a, b) => (a.order || 0) - (b.order || 0))
                : [];
            const firstOp = createdOps[0];
            let successMessage = `Parça oluşturuldu: ${partKey}`;
            if (firstOp && firstOp.planned_start_ms) {
                const machineName = firstOp.machine_name || machines.find(m => m.id === firstOp.machine_fk)?.name || '';
                successMessage += ` · Plana eklendi: ${formatPlanStamp(firstOp.planned_start_ms, true)}${machineName ? ` (${machineName})` : ''}`;
            }
            showNotification(successMessage, 'success');
            const modalElement = document.getElementById('createPartModal');
            if (modalElement) {
                const modalInstance = bootstrap.Modal.getInstance(modalElement);
                if (modalInstance) {
                    modalInstance.hide();
                }
            }
            form.reset();
            createAllocationsEditor?.setValue([]);
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

function setupPartDetailFilesSection(part, isLocked) {
    const container = document.getElementById('part-detail-files-container');
    if (!container) return;

    const fileAttachments = new FileAttachments('part-detail-files-container', {
        title: '',
        layout: 'grid',
        showTitle: false,
        showDeleteButton: !isLocked,
        onFileClick: (file) => {
            const fileName = file.file_name ? file.file_name.split('/').pop() : 'Dosya';
            const fileExtension = fileName.split('.').pop().toLowerCase();
            const viewer = new FileViewer();
            viewer.setDownloadCallback(async () => {
                await viewer.downloadFile(file.file_url, fileName);
            });
            viewer.openFile(file.file_url, fileName, fileExtension);
        },
        onDeleteClick: async (file) => {
            if (isLocked) return;
            if (!confirm('Bu dosyayı silmek istediğinize emin misiniz?')) return;
            try {
                await deletePartFile(file.id);
                showNotification('Dosya silindi', 'success');
                await showPartDetails(part.key);
                await loadParts(currentPage);
            } catch (error) {
                showNotification(error.message || 'Dosya silinemedi', 'error');
            }
        },
    });
    fileAttachments.setFiles(part.files || []);

    const fileInput = document.getElementById('part-detail-file-input');
    if (fileInput && !isLocked) {
        fileInput.addEventListener('change', async (e) => {
            const files = e.target.files;
            if (!files?.length) return;
            try {
                await uploadPartFiles(part.key, files);
                showNotification('Dosyalar yüklendi', 'success');
                await showPartDetails(part.key);
                await loadParts(currentPage);
            } catch (error) {
                showNotification(error.message || 'Dosya yüklenirken hata oluştu', 'error');
            } finally {
                e.target.value = '';
            }
        });
    }
}

async function showPartDetails(partKey) {
    try {
        // Fetch operations for this part, plus the part detail for its server-computed
        // plan_summary (the list rows do not carry it; a failed detail fetch is not fatal)
        const [operationsResponse, partDetail] = await Promise.all([
            getOperations({ part_key: partKey }),
            getPart(partKey).catch(() => null)
        ]);
        const operations = Array.isArray(operationsResponse) ? operationsResponse : (operationsResponse.results || []);

        // Get part info from the parts list (we already have it); fall back to a
        // minimal part object with just the key
        const listPart = parts.find(p => p.key === partKey);
        const part = listPart ? { ...listPart } : { key: partKey, name: partKey };
        if (partDetail && partDetail.plan_summary) {
            part.plan_summary = partDetail.plan_summary;
        }

        showPartDetailsModal(part, operations);
    } catch (error) {
        console.error('Error showing part details:', error);
        showNotification('Parça detayları gösterilirken hata oluştu', 'error');
    }
}

function showPartDetailsModal(part, operations = []) {
    const isLocked = Boolean(part.is_locked || part.department_request_id);
    const allocations = getPartAllocations(part);
    const jobNoLabel = part.job_no || (allocations.length ? allocations[0].job_no : '');
    // Create display modal instance with fullscreen size
    const displayModal = new DisplayModal('display-modal-container', {
        title: `Operasyonlar - ${part.key} - ${part.name}${jobNoLabel ? ` · İş No: ${jobNoLabel}` : ''}${isLocked ? ' (Kilitli)' : ''}`,
        icon: 'fas fa-cogs text-primary',
        size: 'xl',
        fullscreen: true,
        showEditButton: false
    });

    // Store part data for operations management
    window.currentPartDetails = { part, operations };

    // Job order allocation breakdown (+ cost card for users who may see job costs)
    const allocationSectionHtml = `
        <div class="row g-3">
            <div class="col-md-5">
                <div class="mb-2">
                    <span class="part-allocation-label">İş No: ${escapeHtml(jobNoLabel || '-')}</span>
                    ${part.is_multi_job ? `<span class="status-badge status-blue part-multi-job-chip" title="${escapeHtml(allocationTooltip(part))}">${allocations.length} iş emri</span>` : ''}
                </div>
                ${allocationTableHtml(allocations)}
            </div>
            <div class="col-md-7">
                <div id="part-cost-card-container" hidden></div>
            </div>
        </div>
    `;
    displayModal.addCustomSection({
        title: 'İş Emri Dağılımı',
        icon: 'fas fa-sitemap',
        iconColor: 'text-primary',
        customContent: allocationSectionHtml
    });
    
    // One-line plan summary (server-computed; from GET /tasks/parts/{key}/)
    const planSummary = part.plan_summary || null;
    let planSummaryHtml = '';
    if (planSummary) {
        const flags = planSummary.flags;
        const hasFlag = (name) => Array.isArray(flags) ? flags.includes(name) : Boolean(flags && flags[name]);
        const dueLabel = formatIsoDate(planSummary.due_date);
        const dueSource = planSummary.due_source === 'part' ? 'parça' : (planSummary.due_source === 'job_order' ? 'iş emri' : '');
        const summaryParts = [
            `<span><strong>Termin:</strong> ${dueLabel ? `${dueLabel}${dueSource ? ` (${dueSource})` : ''}` : '-'}</span>`,
            `<span><strong>Tahmini bitiş:</strong> ${planSummary.projected_finish_ms ? formatPlanStamp(planSummary.projected_finish_ms, true) : '-'}</span>`
        ];
        if (planSummary.projected_late) {
            summaryParts.push('<span class="status-badge status-red" title="Tahmini bitiş termini aşıyor">Geç</span>');
        }
        if (hasFlag('estimate_missing')) {
            summaryParts.push('<small class="text-muted" title="Bir veya daha fazla operasyonda tahmini saat yok">tahmin eksik</small>');
        }
        if (hasFlag('due_missing')) {
            summaryParts.push('<small class="text-muted" title="Parçanın ve bağlı iş emirlerinin termini yok">termin yok</small>');
        }
        planSummaryHtml = `
            <div class="part-plan-summary mb-3 d-flex flex-wrap align-items-center gap-2">
                <i class="fas fa-calendar-alt text-primary"></i>
                ${summaryParts.join('<span class="text-muted">·</span>')}
            </div>
        `;
    }

    // Create operations management section with editable table
    const operationsHtml = `
        <div class="operations-management">
            ${isLocked ? '<div class="alert alert-info py-2 mb-3"><i class="fas fa-lock me-2"></i>Bu parça departman talebine dönüştürüldü; operasyonlar düzenlenemez.</div>' : ''}
            ${planSummaryHtml}
            <div class="mb-3 d-flex justify-content-between align-items-center">
                <button type="button" class="btn btn-sm btn-primary" id="add-operation-row-btn" ${isLocked ? 'disabled' : ''}>
                    <i class="fas fa-plus me-1"></i>Satır Ekle
                </button>
                <button type="button" class="btn btn-sm btn-success" id="save-operations-btn" ${isLocked ? 'disabled' : ''}>
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
                            <th style="width: 10%;">Plan</th>
                            <th style="width: 7%;">Değiştirilebilir</th>
                            <th style="width: 7%;">Durum</th>
                            <th style="width: 7%;">İşlem</th>
                        </tr>
                    </thead>
                    <tbody id="operations-detail-table-body">
                        ${operations.length > 0 ? operations.map(op => createOperationRow(op)).join('') : '<tr class="empty-row"><td colspan="10" class="text-center text-muted">Henüz operasyon eklenmemiş</td></tr>'}
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

    const filesSectionHtml = `
        <div class="row g-2">
            <div class="col-12">
                ${!isLocked ? `
                    <div class="mb-3">
                        <label class="btn btn-sm btn-outline-primary mb-0">
                            <i class="fas fa-upload me-1"></i>Dosya Yükle
                            <input type="file" id="part-detail-file-input" multiple hidden>
                        </label>
                    </div>
                ` : ''}
                <div id="part-detail-files-container"></div>
            </div>
        </div>
    `;

    displayModal.addCustomSection({
        title: 'Dosyalar',
        icon: 'fas fa-paperclip',
        iconColor: 'text-info',
        customContent: filesSectionHtml
    });
    
    // Render and show modal
    displayModal.render().show();
    
    // Setup event listeners after modal is rendered
    setTimeout(() => {
        setupPartDetailFilesSection(part, isLocked);
        setupOperationsDetailEventListeners(part);
        loadPartCostCard(part.key);
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
    const isPartLocked = Boolean(window.currentPartDetails?.part?.is_locked);
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
    } else if (isPartLocked) {
        statusHtml = '<span class="status-badge status-blue">Kilitli</span>';
        isReadOnly = true;
    } else if (hoursSpent > 0) {
        statusHtml = '<span class="status-badge status-yellow">Çalışıldı</span>';
        isReadOnly = false; // Explicitly set to false - operations with hours spent are still editable
    } else {
        statusHtml = '<span class="status-badge status-grey">Bekliyor</span>';
        isReadOnly = false;
    }
    
    // Escape HTML for text values to prevent XSS
    const nameValue = escapeHtml(operation.name || '');
    const descValue = escapeHtml(operation.description || '');
    const orderValue = operation.order || '';
    const estimatedHoursValue = operation.estimated_hours || '';
    const keyValue = escapeHtml(operation.key || '');
    
    // Planned window from the server-side machine plan (read-only here)
    const planStart = formatPlanStamp(operation.planned_start_ms);
    const planEnd = formatPlanStamp(operation.planned_end_ms);
    const planHtml = (planStart || planEnd)
        ? `<small class="text-nowrap">${planStart || '?'} → ${planEnd || '?'}</small>${operation.plan_locked ? ' <i class="fas fa-lock text-secondary ms-1" title="Sıra kilitli"></i>' : ''}`
        : '<span class="text-muted">-</span>';

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
                ${planHtml}
            </td>
            <td class="text-center">
                <div class="form-check d-flex justify-content-center">
                    <input class="form-check-input operation-interchangeable" type="checkbox" ${operation.interchangeable ? 'checked' : ''} ${isReadOnly ? '' : ''} id="interchangeable-${rowId}" data-operation-key="${operation.key || ''}">
                </div>
            </td>
            <td class="text-center">
                ${statusHtml}
                ${operation.key && !isPartLocked ? `
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
                ${operation.key && !isPartLocked ? `
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
        tbody.innerHTML = '<tr class="empty-row"><td colspan="10" class="text-center text-muted">Henüz operasyon eklenmemiş</td></tr>';
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
