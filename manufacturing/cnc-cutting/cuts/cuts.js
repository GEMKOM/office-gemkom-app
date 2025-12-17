import { initNavbar } from '../../../components/navbar.js';
import { fetchMachines } from '../../../apis/machines.js';
import { 
    getCncTasks, 
    getCncTask, 
    createCncTask, 
    updateCncTask, 
    deleteCncTask,
    formatCncTaskForDisplay,
    validateCncTaskData,
    addFilesToCncTask
} from '../../../apis/cnc_cutting/crud.js';
import { 
    createCncPart, 
    updateCncPart, 
    deleteCncPart, 
    getCncPart, 
    getCncParts,
    validateCncPartData,
    bulkCreateCncParts,
    bulkDeleteCncParts
} from '../../../apis/cnc_cutting/parts.js';
import { 
    deleteCncFile, 
    getCncFile, 
    getCncTaskFiles 
} from '../../../apis/cnc_cutting/files.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
import { StatisticsCards } from '../../../components/statistics-cards/statistics-cards.js';
import { DisplayModal } from '../../../components/display-modal/display-modal.js';
import { TableComponent } from '../../../components/table/table.js';
import { EditModal } from '../../../components/edit-modal/edit-modal.js';
import { FileViewer } from '../../../components/file-viewer/file-viewer.js';
import { FileAttachments } from '../../../components/file-attachments/file-attachments.js';
import { parsePartsFromText } from './partsPasteParser.js';
import { markTaskCompleted, unmarkTaskCompleted } from '../../../apis/tasks.js';
import { ConfirmationModal } from '../../../components/confirmation-modal/confirmation-modal.js';
import { getRemnantPlates, getRemnantPlateById } from '../../../apis/cnc_cutting/remnants.js';

// State management
let currentPage = 1;
let currentFilter = 'all';
let currentOrdering = 'key';
let currentSortField = 'key';
let currentSortDirection = 'asc';
let cuts = [];
let machines = [];
let totalCuts = 0;
let isLoading = false;
let cutsStats = null; // Statistics Cards component instance
let cutsFilters = null; // Filters component instance
let cutsTable = null; // Table component instance
let createCutModal = null; // Create modal instance
let detailsModal = null; // Details modal instance
let editCutModal = null; // Edit modal instance
let partsTable = null; // Parts table instance
let filesTable = null; // Files table instance
let currentEditTask = null; // Current task being edited
let currentPageSize = 20; // Current page size for pagination
let statusChangeModal = null; // Status change confirmation modal instance
let selectedRemnantPlate = null; // Selected remnant plate for create cut
let selectRemnantModal = null; // Modal for selecting remnant plate
let remnantFilters = null; // Filters component for remnant selection
let remnantSelectionTable = null; // Table component for remnant selection

// Check URL and start fetching modal data immediately (before page load)
let modalDataPromise = null;
let machinesPromise = null;
let shouldOpenModal = false;
let pendingModalMode = null;
let pendingCutKey = null;

// Check URL parameters immediately when script loads
(function checkUrlEarly() {
    const urlParams = new URLSearchParams(window.location.search);
    const cutParam = urlParams.get('cut');
    const modeParam = urlParams.get('mode');
    
    // Always fetch machines early (needed for modal dropdowns)
    machinesPromise = (async () => {
        try {
            const machinesResponse = await fetchMachines(1, 100, { used_in: 'cutting' });
            machines = machinesResponse.results || machinesResponse || [];
            return machines;
        } catch (error) {
            console.error('Error loading machines:', error);
            machines = [];
            return machines;
        }
    })();
    
    if (cutParam) {
        shouldOpenModal = true;
        pendingCutKey = cutParam;
        pendingModalMode = modeParam === 'edit' ? 'edit' : 'view';
        
        // Start fetching cut data immediately (don't wait for page load)
        modalDataPromise = getCncTask(cutParam).catch(error => {
            console.error('Error fetching cut data for modal:', error);
            shouldOpenModal = false;
            return null;
        });
    }
})();

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    // Start page initialization in parallel with modal opening
    const pageInitPromise = (async () => {
        await initNavbar();
        
        // Only load machines if not already loading/fetched (to avoid duplicate requests)
        if (!machinesPromise) {
            await loadMachines();
        } else {
            // Wait for the early machines fetch to complete
            await machinesPromise;
        }
        
        // Initialize header component
        const header = new HeaderComponent({
            title: 'CNC Kesim Kesimler',
            subtitle: 'CNC kesim görevleri yönetimi ve takibi',
            icon: 'cut',
            showBackButton: 'block',
            showCreateButton: 'block',
            showExportButton: 'none',
            showRefreshButton: 'none',
            createButtonText: 'Yeni Kesim',
            onBackClick: () => window.location.href = '/manufacturing/cnc-cutting/',
            onCreateClick: () => showCreateCutModal()
        });
        
        // Initialize Statistics Cards component
        cutsStats = new StatisticsCards('cuts-statistics', {
            cards: [
                { title: 'Tüm Kesimler', value: '0', icon: 'fas fa-list', color: 'primary', id: 'all-cuts-count' },
                { title: 'Aktif Kesimler', value: '0', icon: 'fas fa-play', color: 'success', id: 'active-cuts-count' },
                { title: 'Tamamlanan', value: '0', icon: 'fas fa-check', color: 'info', id: 'completed-cuts-count' },
                { title: 'Bekleyen', value: '0', icon: 'fas fa-clock', color: 'warning', id: 'pending-cuts-count' }
            ],
            compact: true,
            animation: true
        });
        
        await initializeCuts();
        setupEventListeners();
    })();
    
    // Open modal as soon as DOM is ready and data is fetched (prioritize modal)
    if (shouldOpenModal && modalDataPromise) {
        try {
            // Wait for machines to be loaded (needed for edit modal dropdown)
            if (machinesPromise) {
                await machinesPromise;
            }
            
            // Wait for cut data to be fetched
            const cut = await modalDataPromise;
            
            if (cut) {
                if (pendingModalMode === 'edit') {
                    showEditCutModal(cut);
                } else {
                    await showCutDetails(cut);
                }
            } else {
                showNotification('Kesim bulunamadı', 'error');
                // Clean up URL if cut not found
                const url = new URL(window.location);
                url.searchParams.delete('cut');
                url.searchParams.delete('mode');
                window.history.replaceState({}, '', url);
            }
        } catch (error) {
            console.error('Error opening modal from URL:', error);
            showNotification('Modal açılırken hata oluştu', 'error');
            // Clean up URL on error
            const url = new URL(window.location);
            url.searchParams.delete('cut');
            url.searchParams.delete('mode');
            window.history.replaceState({}, '', url);
        }
    }
    
    // Continue with page initialization (don't block on it)
    await pageInitPromise;
    
    // Setup URL handlers for browser navigation
    setupUrlHandlers();
});

// Listen for file viewer close event
// Note: We don't refresh the table when file preview is closed
window.addEventListener('fileViewerClosed', () => {
    // File viewer closed - no action needed
    // Table should not refresh when preview is closed
});

async function initializeCuts() {
    try {
        initializeFiltersComponent();
        initializeTableComponent();
        
        // Initialize status change confirmation modal
        if (!statusChangeModal) {
            statusChangeModal = new ConfirmationModal('status-change-confirm-modal-container', {
                title: 'Durum Değişikliği Onayı',
                icon: 'fas fa-exchange-alt',
                confirmText: 'Evet, Değiştir',
                cancelText: 'İptal',
                confirmButtonClass: 'btn-primary'
            });
        }
        
        // Set up status toggle listeners once (uses document-level delegation)
        setupStatusToggleListeners();
        
        await loadCuts();
        updateCutCounts();
    } catch (error) {
        console.error('Error initializing cuts:', error);
        showNotification('Kesimler yüklenirken hata oluştu', 'error');
    }
}

async function loadMachines() {
    try {
        const machinesResponse = await fetchMachines(1, 100, { used_in: 'cutting' });
        machines = machinesResponse.results || machinesResponse || [];   
        
    } catch (error) {
        console.error('Error loading machines:', error);
        machines = [];
    }
}

function initializeFiltersComponent() {
    // Initialize filters component
    cutsFilters = new FiltersComponent('filters-placeholder', {
        title: 'Kesim Filtreleri',
        onApply: (values) => {
            // Apply filters and reload cuts
            loadCuts(1);
        },
        onClear: () => {
            // Clear filters and reload cuts
            loadCuts(1);
            showNotification('Filtreler temizlendi', 'info');
        },
        onFilterChange: (filterId, value) => {
            // Optional: Handle individual filter changes
            console.log(`Filter ${filterId} changed to:`, value);
        }
    });

    cutsFilters.addTextFilter({
        id: 'nesting-id-filter',
        label: 'Nesting ID',
        placeholder: 'Nesting ID',
        colSize: 2
    });

    cutsFilters.addTextFilter({
        id: 'thickness-mm-filter',
        label: 'Kalınlık (mm)',
        placeholder: 'örn. 10',
        colSize: 2
    });

    cutsFilters.addTextFilter({
        id: 'material-filter',
        label: 'Malzeme',
        placeholder: 'Malzeme türü',
        colSize: 2
    });

    cutsFilters.addDropdownFilter({
        id: 'machine-name-filter',
        label: 'Makine',
        options: [
            { value: '', label: 'Tüm Makineler' }
        ],
        placeholder: 'Tüm Makineler',
        colSize: 2
    });

    cutsFilters.addDropdownFilter({
        id: 'status-filter',
        label: 'Durum',
        options: [
            { value: '', label: 'Tümü' },
            { value: 'completed', label: 'Tamamlanan' },
            { value: 'pending', label: 'Bekliyor' }
        ],
        placeholder: 'Tümü',
        colSize: 2
    });

    // Update machine filter options if filters component is initialized
    if (cutsFilters) {
        const machineOptions = [
            { value: '', label: 'Tüm Makineler' },
            ...machines.map(machine => ({ value: machine.id.toString(), label: machine.name }))
        ];
        cutsFilters.updateFilterOptions('machine-name-filter', machineOptions);
    }
}

function initializeTableComponent() {
    // Initialize table component
    cutsTable = new TableComponent('cuts-table-container', {
        title: 'Kesim Listesi',
        icon: 'fas fa-table',
        iconColor: 'text-primary',
        columns: [
            {
                field: 'key',
                label: 'Kesim No',
                sortable: true,
                width: '10%',
                formatter: (value, row) => {
                    // If key is empty, use a generated ID or row index
                    const displayKey = value || `CNC-${row.id || 'N/A'}`;
                    return `<span class="cut-key">${displayKey}</span>`;
                }
            },
            {
                field: 'nesting_id',
                label: 'Nesting ID',
                sortable: true,
                width: '10%',
                formatter: (value) => `<strong>${value || '-'}</strong>`
            },
            {
                field: 'material',
                label: 'Malzeme',
                sortable: true,
                width: '10%',
                formatter: (value) => value || '-'
            },
            {
                field: 'dimensions',
                label: 'Boyutlar',
                sortable: true,
                width: '10%',
                formatter: (value) => value || '-'
            },
            {
                field: 'thickness_mm',
                label: 'Kalınlık (mm)',
                sortable: true,
                width: '10%',
                type: 'number',
                formatter: (value) => `<span class="thickness-badge">${value || 0} mm</span>`
            },
            {
                field: 'quantity',
                label: 'Adet',
                sortable: true,
                width: '8%',
                type: 'number',
                formatter: (value) => value ? `${value}` : '-'
            },
            {
                field: 'machine_fk',
                label: 'Makine',
                sortable: true,
                width: '10%',
                formatter: (value, row) => {
                    // Display machine name, not ID
                    return `<span class="machine-name">${row.machine_name || '-'}</span>`;
                }
            },
            {
                field: 'parts_count',
                label: 'Parça Sayısı',
                sortable: true,
                width: '10%',
                formatter: (value, row) => {
                    const partsCount = row.parts_count || 0;
                    return `<span class="parts-count-badge">${partsCount}</span>`;
                }
            },
            {
                field: 'status',
                label: 'Durum',
                sortable: false,
                width: '8%',
                formatter: (value, row) => {
                    // Status based on completion_date - make it clickable to toggle
                    const isCompleted = !!row.completion_date;
                    const statusClass = isCompleted ? 'status-green' : 'status-yellow';
                    const statusText = isCompleted ? 'Tamamlandı' : 'Bekliyor';
                    const taskKey = row.key || row.id;
                    
                    return `<button type="button" class="btn btn-sm status-badge ${statusClass} editable-status" 
                            data-task-key="${taskKey}" 
                            data-is-completed="${isCompleted}"
                            style="border: none; cursor: pointer; padding: 0.25rem 0.5rem; font-size: 0.875rem;"
                            title="Durumu değiştirmek için tıklayın">
                            ${statusText}
                        </button>`;
                }
            },
            {
                field: 'estimated_hours',
                label: 'Tahmini Saat',
                sortable: true,
                width: '8%',
                type: 'number',
                formatter: (value) => value ? `${value} saat` : '-'
            },
            {
                field: 'total_hours_spent',
                label: 'Harcanan Saat',
                sortable: true,
                width: '8%',
                type: 'number',
                formatter: (value) => value ? `${value} saat` : '0 saat'
            }
        ],
        actions: [
            {
                key: 'view',
                label: 'Detaylar',
                icon: 'fas fa-eye',
                class: 'btn-outline-info',
                title: 'Kesim Detayları',
                onClick: (row) => window.showCutDetails(row.key)
            },
            {
                key: 'edit',
                label: 'Düzenle',
                icon: 'fas fa-edit',
                class: 'btn-outline-warning',
                title: 'Düzenle',
                onClick: (row) => editCut(row.key)
            },
            {
                key: 'delete',
                label: 'Sil',
                icon: 'fas fa-trash',
                class: 'btn-outline-danger',
                title: 'Sil',
                onClick: (row) => deleteCut(row.key)
            }
        ],
        data: [],
        loading: true, // Show skeleton loading immediately when page loads
        sortable: true,
        pagination: true,
        itemsPerPage: currentPageSize,
        currentPage: 1,
        totalItems: 0,
        serverSidePagination: true,
        onPageChange: (page) => {
            loadCuts(page);
        },
        onPageSizeChange: (newSize) => {
            // Update local variable to keep in sync
            currentPageSize = newSize;
            // Ensure table component also has the correct value (should already be set, but ensure sync)
            if (cutsTable) {
                cutsTable.options.itemsPerPage = newSize;
            }
            // Reset to page 1 and load with new page size
            currentPage = 1;
            loadCuts(1);
        },
        onSort: (field, direction) => {
            currentSortField = field;
            currentSortDirection = direction;
            loadCuts(1);
        },
        exportable: true,
        refreshable: true,
        onRefresh: () => {
            loadCuts(currentPage);
        },
        striped: false,
        small: false,
        emptyMessage: 'Kesim bulunamadı',
        emptyIcon: 'fas fa-cut',
        rowAttributes: (row) => `data-cut-key="${row.key}" class="data-update"`
    });
}

async function loadCuts(page = 1) {
    if (isLoading) return;
    
    isLoading = true;
    
    // Set loading state on table component for all loads
    if (cutsTable) {
        cutsTable.setLoading(true);
    }
    
    try {
        const params = buildCutQuery(page);
        const response = await getCncTasks(params);
        
        if (response && (Array.isArray(response) || (response.results && Array.isArray(response.results)))) {
            // Respect backend filtering/sorting/pagination
            if (Array.isArray(response)) {
                // Fallback: array response
                const itemsPerPage = currentPageSize;
                const startIndex = (page - 1) * itemsPerPage;
                const endIndex = startIndex + itemsPerPage;
                cuts = response.slice(startIndex, endIndex);
                totalCuts = response.length;
                currentPage = page;
            } else {
                cuts = response.results;
                totalCuts = response.count ?? response.results.length;
                currentPage = page;
            }

            if (cutsTable) {
                cutsTable.setLoading(false);
                cutsTable.updateData(cuts, totalCuts, currentPage);
            }

            updateCutCounts();
        } else {
            throw new Error('Failed to load cuts');
        }
    } catch (error) {
        console.error('Error loading cuts:', error);
        showNotification('Kesimler yüklenirken hata oluştu', 'error');
        cuts = [];
        totalCuts = 0;
        
        // Update table component with empty data
        if (cutsTable) {
            cutsTable.setLoading(false);
            cutsTable.updateData([], 0, 1);
        }
    } finally {
        isLoading = false;
    }
}

function buildCutQuery(page = 1) {
    const params = new URLSearchParams();
    
    // Get page size from table component if available, otherwise use local variable
    // This ensures we always use the most up-to-date page size
    const pageSize = cutsTable ? cutsTable.options.itemsPerPage : currentPageSize;
    
    // Add pagination
    params.append('page', String(page));
    params.append('page_size', String(pageSize));
    
    // Add ordering
    const orderingParam = currentSortDirection === 'asc' ? currentSortField : `-${currentSortField}`;
    params.append('ordering', orderingParam);
    
    // Add backend-supported filters
    const filterValues = cutsFilters ? cutsFilters.getFilterValues() : {};
    const key = filterValues['key-filter']?.trim();
    const name = filterValues['name-filter']?.trim();
    const nestingId = filterValues['nesting-id-filter']?.trim();
    const material = filterValues['material-filter']?.trim();
    const machine = filterValues['machine-name-filter']?.toString().trim();
    const status = filterValues['status-filter'] || '';
    const thickness = filterValues['thickness-mm-filter']?.toString().trim();

    if (key) params.append('key', key);
    if (name) params.append('name', name);
    if (nestingId) params.append('nesting_id', nestingId);
    if (material) params.append('material', material);
    if (machine) params.append('machine_fk', machine);
    if (thickness) params.append('thickness_mm', thickness);
    
    // Map status filter to completion_date__isnull parameter
    if (status === 'pending') {
        params.append('completion_date__isnull', 'true');
    } else if (status === 'completed') {
        params.append('completion_date__isnull', 'false');
    }
    
    return params;
}

function updateCutCounts() {
    // Calculate counts based on completion_date
    const allCount = totalCuts;
    const completedCount = cuts.filter(c => c.completion_date).length;
    const pendingCount = cuts.filter(c => !c.completion_date).length;
    const activeCount = 0; // No active status in this implementation
    
    // Update statistics cards using the component
    if (cutsStats) {
        cutsStats.updateValues({
            0: allCount.toString(),
            1: activeCount.toString(),
            2: completedCount.toString(),
            3: pendingCount.toString()
        });
    }
}

// Show status change confirmation modal
function showStatusChangeConfirmation(taskKey, isCompleted, statusButton) {
    // Initialize modal if not already done
    if (!statusChangeModal) {
        statusChangeModal = new ConfirmationModal('status-change-confirm-modal-container', {
            title: 'Durum Değişikliği Onayı',
            icon: 'fas fa-exchange-alt',
            confirmText: 'Evet, Değiştir',
            cancelText: 'İptal',
            confirmButtonClass: 'btn-primary'
        });
    }
    
    // Find the row to get task details
    const row = statusButton.closest('tr');
    let taskName = taskKey;
    if (row) {
        // Try to get task name from the row if available
        const nameCell = row.querySelector('td');
        if (nameCell) {
            const nameText = nameCell.textContent?.trim();
            if (nameText && nameText !== taskKey) {
                taskName = nameText;
            }
        }
    }
    
    // Set modal content
    const currentStatus = isCompleted ? 'Tamamlandı' : 'Bekliyor';
    const newStatus = isCompleted ? 'Bekliyor' : 'Tamamlandı';
    
    // Build details HTML
    const detailsHtml = `
        <strong>Kesim:</strong> ${taskKey}<br>
        <strong>Mevcut Durum:</strong> ${currentStatus}<br>
        <strong>Yeni Durum:</strong> ${newStatus}
    `;
    
    // Store the pending status change info
    window.pendingStatusChange = {
        taskKey: taskKey,
        isCompleted: isCompleted,
        statusButton: statusButton
    };
    
    // Show the modal with options
    statusChangeModal.show({
        message: 'Durumu değiştirmek istediğinize emin misiniz?',
        description: 'Kesim durumu güncellenecektir.',
        details: detailsHtml,
        onConfirm: async () => {
            await handleStatusChangeConfirm(taskKey, isCompleted, statusButton);
        },
        onCancel: () => {
            window.pendingStatusChange = null;
        }
    });
}

// Handle status change confirmation
async function handleStatusChangeConfirm(taskKey, isCompleted, statusButton) {
    try {
        // Call toggleTaskStatus to make the API request
        await toggleTaskStatus(taskKey, isCompleted);
        
        // Clear pending status change
        window.pendingStatusChange = null;
        
        // Hide the modal
        if (statusChangeModal) {
            statusChangeModal.hide();
        }
    } catch (error) {
        console.error('Error handling status change confirmation:', error);
        // Error notification is already shown in toggleTaskStatus
    }
}

// Toggle task completion status
async function toggleTaskStatus(taskKey, isCompleted) {
    try {
        let response;
        if (isCompleted) {
            // Mark as incomplete (unmark completed)
            response = await unmarkTaskCompleted(taskKey, 'cnc_cutting');
        } else {
            // Mark as complete
            response = await markTaskCompleted(taskKey, 'cnc_cutting');
        }
        
        if (response && response.ok) {
            showNotification(isCompleted ? 'Kesim tamamlanmadı olarak işaretlendi' : 'Kesim tamamlandı olarak işaretlendi', 'success');
            // Reload cuts to refresh the table
            await loadCuts(currentPage);
        } else {
            let errorMessage = 'Görev durumu güncellenemedi';
            if (response) {
                try {
                    const errorData = await response.json();
                    errorMessage = errorData.detail || errorData.message || errorMessage;
                } catch (e) {
                    errorMessage = `HTTP ${response.status}: ${response.statusText}`;
                }
            }
            throw new Error(errorMessage);
        }
    } catch (error) {
        console.error('Error toggling task status:', error);
        showNotification(error.message || 'Durum güncellenirken hata oluştu', 'error');
    }
}

// Set up event listeners for status toggle buttons using event delegation
// Use a flag to ensure we only set up once
let statusToggleListenersSetup = false;

function setupStatusToggleListeners() {
    // Only set up once using event delegation on document
    if (statusToggleListenersSetup) {
        return;
    }
    
    // Use document-level event delegation for maximum compatibility
    // This ensures clicks are captured regardless of when the table is rendered
    document.addEventListener('click', async (e) => {
        // Check if click is on a status button
        const statusButton = e.target.closest('.editable-status');
        if (!statusButton) return;
        
        // Make sure it's within our table container
        const tableContainer = document.getElementById('cuts-table-container');
        if (!tableContainer || !tableContainer.contains(statusButton)) {
            return;
        }
        
        e.preventDefault();
        e.stopPropagation();
        
        const taskKey = statusButton.getAttribute('data-task-key');
        const isCompleted = statusButton.getAttribute('data-is-completed') === 'true';
        
        if (!taskKey) {
            console.error('Task key not found on status button');
            return;
        }
        
        // Show status change confirmation modal
        showStatusChangeConfirmation(taskKey, isCompleted, statusButton);
    });
    
    statusToggleListenersSetup = true;
    console.log('Status toggle listeners set up');
}

function setupEventListeners() {
    // Confirm delete button
    document.getElementById('confirm-delete-btn')?.addEventListener('click', async () => {
        const cutKey = window.pendingDeleteCutKey;
        if (!cutKey) return;
        
        const deleteBtn = document.getElementById('confirm-delete-btn');
        const originalText = deleteBtn.innerHTML;
        
        try {
            // Show loading state
            deleteBtn.disabled = true;
            deleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Siliniyor...';
            
            const response = await deleteCncTask(cutKey);
            
            if (response) {
                showNotification('Kesim silindi', 'success');
                // Hide the modal
                bootstrap.Modal.getInstance(document.getElementById('deleteConfirmModal')).hide();
                // Clear the pending delete key
                window.pendingDeleteCutKey = null;
                // Reload cuts
                loadCuts(currentPage);
            } else {
                throw new Error('Failed to delete cut');
            }
        } catch (error) {
            console.error('Error deleting cut:', error);
            showNotification('Kesim silinirken hata oluştu', 'error');
        } finally {
            // Restore button state
            deleteBtn.disabled = false;
            deleteBtn.innerHTML = originalText;
        }
    });
}

function setupUrlHandlers() {
    // Don't check URL on initial load here - it's already handled earlier
    // Only handle browser back/forward navigation
    window.addEventListener('popstate', (event) => {
        checkUrlAndOpenModal();
    });
}

async function checkUrlAndOpenModal() {
    const urlParams = new URLSearchParams(window.location.search);
    const cutParam = urlParams.get('cut');
    const modeParam = urlParams.get('mode');
    
    if (cutParam) {
        try {
            // Fetch cut data from API
            const cut = await getCncTask(cutParam);
            
            if (cut) {
                if (modeParam === 'edit') {
                    // Open edit modal directly (without updating URL again)
                    showEditCutModal(cut);
                } else {
                    // Open details modal directly (without updating URL again)
                    // Use the internal showCutDetails function that takes an object
                    await showCutDetails(cut);
                }
            } else {
                showNotification('Kesim bulunamadı', 'error');
                // Clean up URL if cut not found
                const url = new URL(window.location);
                url.searchParams.delete('cut');
                url.searchParams.delete('mode');
                window.history.replaceState({}, '', url);
            }
        } catch (error) {
            console.error('Error opening modal from URL:', error);
            showNotification('Modal açılırken hata oluştu', 'error');
            // Clean up URL on error
            const url = new URL(window.location);
            url.searchParams.delete('cut');
            url.searchParams.delete('mode');
            window.history.replaceState({}, '', url);
        }
    } else {
        // Close any open modals if no cut parameter
        closeAllModals();
    }
}

function closeAllModals() {
    // Close display modal
    const displayModalContainer = document.getElementById('display-modal-container');
    if (displayModalContainer) {
        const existingModal = displayModalContainer.querySelector('.modal');
        if (existingModal) {
            const modalInstance = bootstrap.Modal.getInstance(existingModal);
            if (modalInstance) {
                modalInstance.hide();
            }
        }
    }
    
    // Close cut details modal
    const cutDetailsModalContainer = document.getElementById('cut-details-modal-container');
    if (cutDetailsModalContainer) {
        const existingModal = cutDetailsModalContainer.querySelector('.modal');
        if (existingModal) {
            const modalInstance = bootstrap.Modal.getInstance(existingModal);
            if (modalInstance) {
                modalInstance.hide();
            }
        }
    }
    
    // Close edit modal
    const editModalContainer = document.getElementById('edit-cut-modal-container');
    if (editModalContainer) {
        const existingModal = editModalContainer.querySelector('.modal');
        if (existingModal) {
            const modalInstance = bootstrap.Modal.getInstance(existingModal);
            if (modalInstance) {
                modalInstance.hide();
            }
        }
    }
}


// Global variable to store the current edit modal instance

// Global functions for table actions
window.showCutDetails = async function(cutKey) {
    try {
        // Update URL to include cut key parameter
        const url = new URL(window.location);
        url.searchParams.set('cut', cutKey);
        // Remove mode parameter if present (to show details, not edit)
        url.searchParams.delete('mode');
        window.history.pushState({ cut: cutKey }, '', url);
        
        // Fetch cut data from API
        const cut = await getCncTask(cutKey);
        
        if (cut) {
            // Use the detailed showCutDetails function (which uses cut-details-modal-container)
            await showCutDetails(cut);
        } else {
            showNotification('Kesim bulunamadı', 'error');
            // Clean up URL if cut not found
            const url = new URL(window.location);
            url.searchParams.delete('cut');
            window.history.pushState({}, '', url);
        }
    } catch (error) {
        console.error('Error showing cut details:', error);
        showNotification('Kesim detayları gösterilirken hata oluştu', 'error');
        // Clean up URL on error
        const url = new URL(window.location);
        url.searchParams.delete('cut');
        window.history.pushState({}, '', url);
    }
};

window.editCut = async function(cutKey) {
    try {
        // Update URL to include cut key and edit mode parameter
        const url = new URL(window.location);
        url.searchParams.set('cut', cutKey);
        url.searchParams.set('mode', 'edit');
        window.history.pushState({ cut: cutKey, mode: 'edit' }, '', url);
        
        const cut = await getCncTask(cutKey);
        
        if (cut) {
            showEditCutModal(cut);
        } else {
            showNotification('Kesim bulunamadı', 'error');
            // Clean up URL if cut not found
            const url = new URL(window.location);
            url.searchParams.delete('cut');
            url.searchParams.delete('mode');
            window.history.pushState({}, '', url);
        }
    } catch (error) {
        console.error('Error editing cut:', error);
        showNotification('Kesim düzenlenirken hata oluştu', 'error');
        // Clean up URL on error
        const url = new URL(window.location);
        url.searchParams.delete('cut');
        url.searchParams.delete('mode');
        window.history.pushState({}, '', url);
    }
};

window.deleteCut = function(cutKey) {
    // Set the pending delete key
    window.pendingDeleteCutKey = cutKey;
    
    // Find the cut name for display
    const cut = cuts.find(c => c.key === cutKey);
    const cutName = cut ? cut.name : cutKey;
    
    // Update the delete confirmation modal
    document.getElementById('delete-cut-name').textContent = cutName;
    
    // Show the delete confirmation modal
    const deleteModal = new bootstrap.Modal(document.getElementById('deleteConfirmModal'));
    deleteModal.show();
};

function showCutDetailsModal(cut) {
    // Create display modal instance
    const displayModal = new DisplayModal('display-modal-container', {
        title: `Kesim Detayları - ${cut.key}`,
        icon: 'fas fa-cut text-primary',
        size: 'lg',
        showEditButton: false
    });
    
    // Add cut information section
    displayModal.addSection({
        title: 'Kesim Bilgileri',
        icon: 'fas fa-info-circle',
        iconColor: 'text-primary',
        fields: [
            {
                id: 'cut-key',
                label: 'Kesim No',
                value: cut.key,
                type: 'text',
                colSize: 4,
                copyable: true
            },
            {
                id: 'cut-name',
                label: 'Kesim Adı',
                value: cut.name,
                type: 'text',
                colSize: 4
            },
            {
                id: 'nesting-id',
                label: 'Nesting ID',
                value: cut.nesting_id,
                type: 'text',
                colSize: 4
            },
            {
                id: 'material',
                label: 'Malzeme',
                value: cut.material,
                type: 'text',
                colSize: 4
            },
            {
                id: 'dimensions',
                label: 'Boyutlar',
                value: cut.dimensions,
                type: 'text',
                colSize: 4
            },
            {
                id: 'thickness',
                label: 'Kalınlık (mm)',
                value: cut.thickness_mm,
                type: 'number',
                colSize: 4
            },
            {
                id: 'quantity',
                label: 'Adet',
                value: cut.quantity || '-',
                type: 'text',
                colSize: 4
            }
        ]
    });
    
    // Add nesting file section if available
    if (cut.nesting_file_url) {
        displayModal.addSection({
            title: 'Nesting Dosyası',
            icon: 'fas fa-file',
            iconColor: 'text-success',
            fields: [
                {
                    id: 'nesting-file',
                    label: 'Dosya',
                    value: cut.nesting_file_url,
                    type: 'link',
                    colSize: 12,
                    linkText: 'Dosyayı İndir',
                    linkTarget: '_blank'
                }
            ]
        });
    }
    
    // Add parts section if available
    if (cut.parts && cut.parts.length > 0) {
        const partsHtml = `
            <div class="table-responsive">
                <table class="table table-sm table-bordered">
                    <thead class="table-light">
                        <tr>
                            <th>İş No</th>
                            <th>Resim No</th>
                            <th>Pozisyon No</th>
                            <th>Ağırlık (kg)</th>
                            <th>Adet</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${cut.parts.map(part => `
                            <tr>
                                <td>${part.job_no || '-'}</td>
                                <td>${part.image_no || '-'}</td>
                                <td>${part.position_no || '-'}</td>
                                <td>${part.weight_kg || '-'}</td>
                                <td>${part.quantity != null ? part.quantity : '-'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
        
        displayModal.addCustomSection({
            title: 'Parça Bilgileri',
            icon: 'fas fa-puzzle-piece',
            iconColor: 'text-info',
            customContent: partsHtml
        });
    }
    
    // Render and show modal
    displayModal.render().show();
    
    // Add event listener to clean up URL when modal is closed
    const modalElement = displayModal.container.querySelector('.modal');
    if (modalElement) {
        modalElement.addEventListener('hidden.bs.modal', () => {
            // Remove cut parameter from URL when modal is closed
            const url = new URL(window.location);
            if (url.searchParams.has('cut')) {
                url.searchParams.delete('cut');
                window.history.pushState({}, '', url);
            }
        });
    }
}

function showCreateCutModal() {
    // Create Edit Modal instance for creating new cut
    createCutModal = new EditModal('create-cut-modal-container', {
        title: 'Yeni Kesim Oluştur',
        icon: 'fas fa-plus-circle',
        saveButtonText: 'Kesim Oluştur',
        size: 'lg'
    });
    
    // Set up the create cut form
    setupCreateCutForm(createCutModal);
    
    // Show the modal
    createCutModal.show();
}

function setupCreateCutForm(createCutModal) {
    // Reset selected remnant plate
    selectedRemnantPlate = null;
    
    // Add remnant plate selection section at the top
    createCutModal.addSection({
        id: 'remnant-selection',
        title: 'Fire Plaka Seçimi',
        icon: 'fas fa-layer-group',
        iconColor: 'text-info',
        fields: []
    });
    
    // Add basic information section
    createCutModal.addSection({
        id: 'basic-info',
        title: 'Temel Bilgiler',
        icon: 'fas fa-info-circle',
        iconColor: 'text-primary',
        fields: [
            {
                id: 'cut-name',
                name: 'cut-name',
                label: 'Kesim Adı',
                type: 'text',
                required: true,
                placeholder: 'Kesim adını girin',
                colSize: 6,
                helpText: 'Kesimi tanımlayan açıklayıcı isim'
            },
            {
                id: 'cut-nesting-id',
                name: 'cut-nesting-id',
                label: 'Nesting ID',
                type: 'text',
                required: true,
                placeholder: 'Nesting ID girin',
                colSize: 6,
                helpText: 'Nesting dosyası ID\'si'
            },
            {
                id: 'cut-material',
                name: 'cut-material',
                label: 'Malzeme',
                type: 'text',
                required: true,
                placeholder: 'Malzeme türü',
                colSize: 6,
                helpText: 'Kesilecek malzeme türü'
            },
            {
                id: 'cut-dimensions',
                name: 'cut-dimensions',
                label: 'Boyutlar',
                type: 'text',
                required: true,
                placeholder: '100x50x10',
                colSize: 6,
                helpText: 'Malzeme boyutları (örn: 100x50x10)'
            },
            {
                id: 'cut-thickness',
                name: 'cut-thickness',
                label: 'Kalınlık (mm)',
                type: 'number',
                required: true,
                placeholder: '10.0',
                step: '0.1',
                min: '0.1',
                colSize: 6,
                helpText: 'Malzeme kalınlığı milimetre cinsinden'
            },
            {
                id: 'cut-machine-fk',
                name: 'cut-machine-fk',
                label: 'Makine',
                type: 'dropdown',
                required: false,
                placeholder: 'Makine seçin...',
                options: [
                    { value: '', label: 'Makine seçin...' },
                    ...machines.map(machine => ({ 
                        value: machine.id.toString(), 
                        label: machine.name 
                    }))
                ],
                colSize: 6,
                helpText: 'Kesim makinesi seçin'
            },
            {
                id: 'cut-estimated-hours',
                name: 'cut-estimated-hours',
                label: 'Tahmini Süre (Saat)',
                type: 'number',
                required: false,
                placeholder: '0.0',
                step: '0.1',
                min: '0',
                colSize: 6,
                helpText: 'Kesim işleminin tahmini süresi saat cinsinden'
            },
            {
                id: 'cut-quantity',
                name: 'cut-quantity',
                label: 'Adet',
                type: 'number',
                required: false,
                placeholder: '1',
                step: '1',
                min: '1',
                colSize: 6,
                helpText: 'Kesim adedi'
            },
            {
                id: 'cut-files',
                label: 'Dosyalar',
                type: 'file',
                required: false,
                accept: '*/*',
                multiple: true,
                colSize: 6,
                helpText: 'Nesting ve diğer dosyalar (opsiyonel) - Birden fazla dosya seçebilirsiniz'
            }
        ]
    });
    
    // Add file selection feedback
    setTimeout(() => {
        const fileInput = createCutModal.container.querySelector('input[type="file"]');
        if (fileInput) {
            console.log('File input multiple attribute:', fileInput.multiple);
            
            fileInput.addEventListener('change', function() {
                const fileCount = this.files.length;
                console.log('Files selected:', fileCount, Array.from(this.files).map(f => f.name));
                
                const helpText = createCutModal.container.querySelector(`label[for="${fileInput.id}"] + .form-text`);
                if (helpText) {
                    if (fileCount > 0) {
                        helpText.textContent = `${fileCount} dosya seçildi - ${Array.from(this.files).map(f => f.name).join(', ')}`;
                        helpText.className = 'form-text text-success';
                    } else {
                        helpText.textContent = 'Nesting ve diğer dosyalar (opsiyonel) - Birden fazla dosya seçebilirsiniz';
                        helpText.className = 'form-text text-muted';
                    }
                }
            });
        }
    }, 100);

    // Add parts information section
    createCutModal.addSection({
        id: 'parts-info',
        title: 'Parça Bilgileri *',
        icon: 'fas fa-puzzle-piece',
        iconColor: 'text-success',
        fields: []
    });
    
    // Set up save callback
    createCutModal.onSaveCallback(async (formData) => {
        await handleCreateCutSave(formData);
    });
    
    // Set up cancel callback
    createCutModal.onCancelCallback(() => {
        // Reset form if needed
        console.log('Create cut cancelled');
    });
    
    // Render the modal
    createCutModal.render();
    
    // Add remnant plate selection button
    setTimeout(() => {
        const remnantSection = createCutModal.container.querySelector('[data-section-id="remnant-selection"]');
        if (remnantSection) {
            const fieldsContainer = remnantSection.querySelector('.row.g-2');
            if (fieldsContainer) {
                const remnantHtml = `
                    <div class="col-12">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <button type="button" class="btn btn-outline-info" id="select-remnant-btn">
                                    <i class="fas fa-layer-group me-2"></i>Fire Plaka Seç
                                </button>
                            </div>
                            <div id="selected-remnant-display" style="display: none;">
                                <span class="badge bg-success" id="selected-remnant-badge" style="cursor: pointer;">
                                    <i class="fas fa-check me-1"></i>
                                    Seçili: <span id="selected-remnant-info">-</span>
                                </span>
                                <button type="button" class="btn btn-sm btn-outline-danger ms-2" id="clear-remnant-btn">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                `;
                fieldsContainer.innerHTML = remnantHtml;
                
                // Add event listener for select button
                const selectBtn = createCutModal.container.querySelector('#select-remnant-btn');
                if (selectBtn) {
                    selectBtn.addEventListener('click', () => {
                        showSelectRemnantModal();
                    });
                }
                
                // Add event listener for clear button
                const clearBtn = createCutModal.container.querySelector('#clear-remnant-btn');
                if (clearBtn) {
                    clearBtn.addEventListener('click', () => {
                        selectedRemnantPlate = null;
                        updateSelectedRemnantDisplay();
                    });
                }
                
                updateSelectedRemnantDisplay();
            }
        }
    }, 100);
    
    // Add parts table inside the Parça Bilgileri section
    const partsHtml = `
        <div class="d-flex justify-content-between align-items-center mb-2">
            <div>
                <h6 class="mb-0">Parça Listesi</h6>
                <small class="text-danger"><i class="fas fa-exclamation-circle me-1"></i>En az bir parça eklemelisiniz</small>
            </div>
			<div class="d-flex gap-2">
				<button type="button" class="btn btn-sm btn-outline-primary" id="add-part-btn">
					<i class="fas fa-plus me-1"></i>Parça Ekle
				</button>
				<button type="button" class="btn btn-sm btn-outline-danger" id="clear-parts-btn">
					<i class="fas fa-trash-alt me-1"></i>Tümünü Temizle
				</button>
			</div>
        </div>
		<div class="mb-2">
			<label class="form-label small text-muted fw-bold mb-1">
				<i class="fas fa-paste me-1"></i>Toplu Yapıştır (Excel kopyasını buraya yapıştırın)
			</label>
			<textarea id="bulk-paste-input" class="form-control form-control-sm" rows="4" placeholder="Excel'den kopyaladığınız verileri buraya yapıştırın"></textarea>
			<div class="d-flex gap-2 mt-2">
				<button type="button" class="btn btn-sm btn-outline-success" id="parse-paste-btn">
					<i class="fas fa-magic me-1"></i>Yapıştırılanı Ayrıştır ve Ekle
				</button>
				<small class="text-muted">İlk satır: İş No  Resim No  Pozisyon No. Sonraki satırlar: genişlik (mm), yükseklik (mm), alan (m²), ağırlık (kg), malzeme, kalınlık (mm), proje, talep eden, not.</small>
			</div>
		</div>
        <div class="row g-2 mb-2">
            <div class="col-md-2">
                <small class="text-muted fw-bold">
                    <i class="fas fa-hashtag me-1"></i>İş No
                </small>
            </div>
            <div class="col-md-2">
                <small class="text-muted fw-bold">
                    <i class="fas fa-image me-1"></i>Resim No
                </small>
            </div>
            <div class="col-md-2">
                <small class="text-muted fw-bold">
                    <i class="fas fa-map-marker-alt me-1"></i>Pozisyon No
                </small>
            </div>
            <div class="col-md-2">
                <small class="text-muted fw-bold">
                    <i class="fas fa-weight me-1"></i>Ağırlık (kg)
                </small>
            </div>
            <div class="col-md-2">
                <small class="text-muted fw-bold">
                    <i class="fas fa-list-ol me-1"></i>Adet
                </small>
            </div>
            <div class="col-md-2">
                <small class="text-muted fw-bold">İşlem</small>
            </div>
        </div>
        <div id="parts-container">
            <!-- Parts will be added here -->
        </div>
    `;
    
    // Find the Parça Bilgileri section and add the parts table inside it
    const partsSection = createCutModal.container.querySelector('[data-section-id="parts-info"]');
    if (partsSection) {
        const fieldsContainer = partsSection.querySelector('.row.g-2');
        if (fieldsContainer) {
            fieldsContainer.insertAdjacentHTML('beforeend', partsHtml);
        }
    }
    
    // Add event listener for add part button
    const addPartBtn = createCutModal.container.querySelector('#add-part-btn');
    if (addPartBtn) {
        addPartBtn.addEventListener('click', addPart);
    }

	// Clear all parts
	const clearPartsBtn = createCutModal.container.querySelector('#clear-parts-btn');
	if (clearPartsBtn) {
		clearPartsBtn.addEventListener('click', () => {
			const container = document.getElementById('parts-container');
			if (!container) return;
			container.innerHTML = '';
			showNotification('Tüm parçalar temizlendi', 'info');
		});
	}

	// Bulk paste handling
	const parsePasteBtn = createCutModal.container.querySelector('#parse-paste-btn');
	const bulkPasteInput = createCutModal.container.querySelector('#bulk-paste-input');
	if (parsePasteBtn && bulkPasteInput) {
		parsePasteBtn.addEventListener('click', () => {
			const text = bulkPasteInput.value;
			const parsed = parsePartsFromText(text);
			if (!parsed || parsed.length === 0) {
				showNotification('Yapıştırılan veriler ayrıştırılamadı', 'warning');
				return;
			}
			populatePartsFromParsed(parsed);
			showNotification(`${parsed.length} parça eklendi`, 'success');
		});
	}
    
	// Start with no default part rows; user can add or paste
}

async function handleCreateCutSave(formData) {
    // Get machine_fk value manually if not in formData
    const dropdown = createCutModal.dropdowns?.get('cut-machine-fk');
    
    // Get the actual file objects from the file input
    const fileInput = createCutModal.container.querySelector('input[type="file"]');
    const uploadedFiles = fileInput ? Array.from(fileInput.files) : [];
    
    // Log file information for debugging
    if (uploadedFiles.length > 0) {
        console.log(`Selected ${uploadedFiles.length} files:`, uploadedFiles.map(f => f.name));
    }
    
    // Get machine_fk value manually if not in formData
    let machineFkValue = formData['cut-machine-fk'];
    if (!machineFkValue && dropdown) {
        machineFkValue = dropdown.getValue();
    }
    
    const cutData = {
        name: formData['cut-name'],
        nesting_id: formData['cut-nesting-id'],
        material: formData['cut-material'],
        dimensions: formData['cut-dimensions'],
        thickness_mm: parseFloat(formData['cut-thickness']) || 0,
        machine_fk: machineFkValue ? parseInt(machineFkValue) : null,
        estimated_hours: formData['cut-estimated-hours'] ? parseFloat(formData['cut-estimated-hours']) : null,
        quantity: formData['cut-quantity'] ? parseInt(formData['cut-quantity']) : null,
        files: uploadedFiles,
        parts_data: [],
        selected_plate: selectedRemnantPlate ? selectedRemnantPlate.id : null
    };
    
    
    // Collect parts data from dynamic rows
    const partRows = document.querySelectorAll('.part-row');
    for (const row of partRows) {
        const jobNo = row.querySelector('input[name="job_no"]')?.value?.trim();
        const imageNo = row.querySelector('input[name="image_no"]')?.value?.trim();
        const positionNo = row.querySelector('input[name="position_no"]')?.value?.trim();
        const weight = row.querySelector('input[name="weight"]')?.value?.trim();
        const quantity = row.querySelector('input[name="quantity"]')?.value?.trim();
        
        // Only add part if at least one field has data
        if (jobNo || imageNo || positionNo || weight || quantity) {
            cutData.parts_data.push({
                job_no: jobNo || '',
                image_no: imageNo || '',
                position_no: positionNo || '',
                weight_kg: parseFloat(weight) || 0,
                quantity: quantity ? parseInt(quantity, 10) : null
            });
        }
    }
    
    // Validate that at least one part is added
    if (!cutData.parts_data || cutData.parts_data.length === 0) {
        showNotification('En az bir parça eklemelisiniz', 'error');
        return;
    }
    
    // Validate data
    const validation = validateCncTaskData(cutData);
    if (!validation.isValid) {
        showNotification('Lütfen gerekli alanları doldurun: ' + validation.errors.join(', '), 'error');
        return;
    }
    
    try {
        const response = await createCncTask(cutData);
        
        if (response) {
            showNotification('Kesim başarıyla oluşturuldu', 'success');
            
            // Close the modal
            const modalInstance = bootstrap.Modal.getOrCreateInstance(document.querySelector('#create-cut-modal-container .modal'));
            if (modalInstance) {
                modalInstance.hide();
            }
            
            // Reload cuts list
            loadCuts(currentPage);
        } else {
            throw new Error('Failed to create cut');
        }
    } catch (error) {
        console.error('Error creating cut:', error);
        showNotification('Kesim oluşturulurken hata oluştu', 'error');
    }
}

function showEditCutModal(cut) {
    // Create Edit Modal instance for editing existing cut
    editCutModal = new EditModal('edit-cut-modal-container', {
        title: 'Kesim Düzenle',
        icon: 'fas fa-edit',
        saveButtonText: 'Değişiklikleri Kaydet',
        size: 'lg'
    });
    
    // Set up the edit cut form
    setupEditCutForm(editCutModal, cut);
    
    // Show the modal
    editCutModal.show();
    
    // Add event listener to clean up URL when modal is closed
    const modalElement = editCutModal.container.querySelector('.modal');
    if (modalElement) {
        modalElement.addEventListener('hidden.bs.modal', () => {
            // Remove cut and mode parameters from URL when modal is closed
            const url = new URL(window.location);
            if (url.searchParams.has('cut') || url.searchParams.has('mode')) {
                url.searchParams.delete('cut');
                url.searchParams.delete('mode');
                window.history.pushState({}, '', url);
            }
        });
    }
}

async function setupEditCutForm(editCutModal, cut) {
    // Store current task for parts and files operations
    currentEditTask = cut;
    
    // Load existing selected remnant plate if it exists
    // Handle both object and ID cases
    if (cut.selected_plate) {
        if (typeof cut.selected_plate === 'object' && cut.selected_plate.id) {
            selectedRemnantPlate = cut.selected_plate;
        } else if (typeof cut.selected_plate === 'number' || typeof cut.selected_plate === 'string') {
            // If it's just an ID, create a minimal object with just the ID
            // Full details will be available if user clicks to change the remnant
            selectedRemnantPlate = { id: cut.selected_plate, dimensions: '-', material: '-' };
        }
    } else if (cut.remnant_plate) {
        // Fallback to remnant_plate field
        if (typeof cut.remnant_plate === 'object' && cut.remnant_plate.id) {
            selectedRemnantPlate = cut.remnant_plate;
        } else {
            selectedRemnantPlate = { id: cut.remnant_plate, dimensions: '-', material: '-' };
        }
    } else {
        selectedRemnantPlate = null;
    }
    
    // Add remnant plate selection section at the top
    editCutModal.addSection({
        id: 'remnant-selection',
        title: 'Fire Plaka Seçimi',
        icon: 'fas fa-layer-group',
        iconColor: 'text-info',
        fields: []
    });
    
    // Add basic information section
    editCutModal.addSection({
        id: 'basic-info',
        title: 'Temel Bilgiler',
        icon: 'fas fa-info-circle',
        iconColor: 'text-primary',
        fields: [
            {
                id: 'cut-name',
                name: 'cut-name',
                label: 'Kesim Adı',
                type: 'text',
                required: true,
                placeholder: 'Kesim adını girin',
                value: cut.name || '',
                colSize: 6,
                helpText: 'Kesimi tanımlayan açıklayıcı isim'
            },
            {
                id: 'cut-nesting-id',
                name: 'cut-nesting-id',
                label: 'Nesting ID',
                type: 'text',
                required: true,
                placeholder: 'Nesting ID girin',
                value: cut.nesting_id || '',
                colSize: 6,
                helpText: 'Nesting dosyası ID\'si'
            },
            {
                id: 'cut-material',
                name: 'cut-material',
                label: 'Malzeme',
                type: 'text',
                required: true,
                placeholder: 'Malzeme türü',
                value: cut.material || '',
                colSize: 6,
                helpText: 'Kesilecek malzeme türü'
            },
            {
                id: 'cut-dimensions',
                name: 'cut-dimensions',
                label: 'Boyutlar',
                type: 'text',
                required: true,
                placeholder: '100x50x10',
                value: cut.dimensions || '',
                colSize: 6,
                helpText: 'Malzeme boyutları (örn: 100x50x10)'
            },
            {
                id: 'cut-thickness',
                name: 'cut-thickness',
                label: 'Kalınlık (mm)',
                type: 'number',
                required: true,
                placeholder: '10.0',
                step: '0.1',
                min: '0.1',
                value: cut.thickness_mm || '',
                colSize: 6,
                helpText: 'Malzeme kalınlığı milimetre cinsinden'
            },
            {
                id: 'cut-machine-fk',
                name: 'cut-machine-fk',
                label: 'Makine',
                type: 'dropdown',
                required: false,
                placeholder: 'Makine seçin...',
                value: (cut.machine_fk !== null && cut.machine_fk !== undefined && cut.machine_fk !== '') ? cut.machine_fk.toString() : '',
                options: [
                    { value: '', label: 'Makine seçin...' },
                    ...machines.map(machine => ({ 
                        value: machine.id.toString(), 
                        label: machine.name 
                    }))
                ],
                colSize: 6,
                helpText: 'Kesim makinesi seçin'
            },
            {
                id: 'cut-estimated-hours',
                name: 'cut-estimated-hours',
                label: 'Tahmini Süre (Saat)',
                type: 'number',
                required: false,
                placeholder: '0.0',
                step: '0.1',
                min: '0',
                value: cut.estimated_hours || '',
                colSize: 6,
                helpText: 'Kesim işleminin tahmini süresi saat cinsinden'
            },
            {
                id: 'cut-quantity',
                name: 'cut-quantity',
                label: 'Adet',
                type: 'number',
                required: false,
                placeholder: '1',
                step: '1',
                min: '1',
                value: cut.quantity || '',
                colSize: 6,
                helpText: 'Kesim adedi'
            }
        ]
    });
    
    // Add parts management section
    editCutModal.addSection({
        id: 'parts-section',
        fields: []
    });
    
    // Add files management section
    editCutModal.addSection({
        id: 'files-section',
        fields: []
    });
    
    // Set up save callback
    editCutModal.onSaveCallback(async (formData) => {
        await handleEditCutSave(formData, cut.key);
    });
    
    // Set up cancel callback
    editCutModal.onCancelCallback(() => {
        console.log('Edit cut cancelled');
    });
    
    // Render the modal
    editCutModal.render();
    
    // Add remnant plate selection button
    setTimeout(() => {
        const remnantSection = editCutModal.container.querySelector('[data-section-id="remnant-selection"]');
        if (remnantSection) {
            const fieldsContainer = remnantSection.querySelector('.row.g-2');
            if (fieldsContainer) {
                const remnantHtml = `
                    <div class="col-12">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <button type="button" class="btn btn-outline-info" id="select-remnant-btn-edit">
                                    <i class="fas fa-layer-group me-2"></i>Fire Plaka Seç
                                </button>
                            </div>
                            <div id="selected-remnant-display-edit" style="display: none;">
                                <span class="badge bg-success" id="selected-remnant-badge-edit" style="cursor: pointer;">
                                    <i class="fas fa-check me-1"></i>
                                    Seçili: <span id="selected-remnant-info-edit">-</span>
                                </span>
                                <button type="button" class="btn btn-sm btn-outline-danger ms-2" id="clear-remnant-btn-edit">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                `;
                fieldsContainer.innerHTML = remnantHtml;
                
                // Add event listener for select button
                const selectBtn = editCutModal.container.querySelector('#select-remnant-btn-edit');
                if (selectBtn) {
                    selectBtn.addEventListener('click', () => {
                        showSelectRemnantModal();
                    });
                }
                
                // Add event listener for clear button
                const clearBtn = editCutModal.container.querySelector('#clear-remnant-btn-edit');
                if (clearBtn) {
                    clearBtn.addEventListener('click', () => {
                        selectedRemnantPlate = null;
                        updateSelectedRemnantDisplayEdit();
                    });
                }
                
                updateSelectedRemnantDisplayEdit();
            }
        }
        
        addTableContainers();
        
        // Initialize tables after containers are added
        initializePartsTable(cut);
        initializeFilesTable(cut);
    }, 100);
}

function addTableContainers() {
    // Add parts table section with paste functionality
    const partsSectionHtml = `
        <div class="mb-3">
            <div class="d-flex justify-content-between align-items-center mb-2">
                <h6 class="mb-0">Parça Yönetimi</h6>
                <button type="button" class="btn btn-sm btn-outline-info" id="toggle-paste-section-edit">
                    <i class="fas fa-paste me-1"></i>Toplu Yapıştır
                </button>
            </div>
            <div class="mb-2" id="paste-section-edit" style="display: none;">
                <label class="form-label small text-muted fw-bold mb-1">
                    <i class="fas fa-paste me-1"></i>Toplu Yapıştır (Excel kopyasını buraya yapıştırın - Tüm mevcut parçaları değiştirir)
                </label>
                <textarea id="bulk-paste-input-edit" class="form-control form-control-sm" rows="4" placeholder="Excel'den kopyaladığınız verileri buraya yapıştırın"></textarea>
                <div class="d-flex gap-2 mt-2 align-items-center">
                    <button type="button" class="btn btn-sm btn-outline-info" id="preview-paste-btn-edit" onclick="event.preventDefault(); event.stopPropagation(); return false;">
                        <i class="fas fa-eye me-1"></i>Önizle
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-success" id="parse-paste-btn-edit" onclick="event.preventDefault(); event.stopPropagation(); return false;" style="display: none;">
                        <i class="fas fa-magic me-1"></i>Onayla ve Değiştir
                    </button>
                    <small class="text-muted">İlk satır: İş No  Resim No  Pozisyon No. Sonraki satırlar: genişlik (mm), yükseklik (mm), alan (m²), ağırlık (kg), malzeme, kalınlık (mm), proje, talep eden, not.</small>
                </div>
                <div id="paste-preview-edit" class="mt-3" style="display: none;">
                    <div class="card border-info">
                        <div class="card-header bg-info text-white">
                            <h6 class="mb-0"><i class="fas fa-eye me-2"></i>Önizleme - <span id="preview-count-edit">0</span> parça bulundu</h6>
                        </div>
                        <div class="card-body p-0">
                            <div class="table-responsive" style="max-height: 300px; overflow-y: auto;">
                                <table class="table table-sm table-striped table-hover mb-0">
                                    <thead class="table-light sticky-top">
                                        <tr>
                                            <th>İş No</th>
                                            <th>Resim No</th>
                                            <th>Pozisyon No</th>
                                            <th>Ağırlık (kg)</th>
                                            <th>Adet</th>
                                        </tr>
                                    </thead>
                                    <tbody id="preview-table-body-edit">
                                        <!-- Preview rows will be inserted here -->
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div class="mt-3">
            <div id="parts-table-container"></div>
        </div>
    `;
    
    // Add files table section
    const filesSectionHtml = `
        <div class="mt-3">
            <div id="files-table-container"></div>
        </div>
    `;
    
    // Find the parts section and add table container
    const partsSection = editCutModal.container.querySelector('[data-section-id="parts-section"]');
    if (partsSection) {
        const sectionBody = partsSection.querySelector('.row.g-2');
        if (sectionBody) {
            sectionBody.insertAdjacentHTML('beforeend', partsSectionHtml);
        }
    }
    
    // Find the files section and add table container
    const filesSection = editCutModal.container.querySelector('[data-section-id="files-section"]');
    if (filesSection) {
        const sectionBody = filesSection.querySelector('.row.g-2');
        if (sectionBody) {
            sectionBody.insertAdjacentHTML('beforeend', filesSectionHtml);
        }
    }
}

async function initializePartsTable(cut) {
    const parts = cut.parts || [];
    
    partsTable = new TableComponent('parts-table-container', {
        title: 'Parçalar',
        icon: 'fas fa-puzzle-piece',
        iconColor: 'text-success',
        refreshable: false,
        columns: [
            {
                field: 'job_no',
                label: 'İş No',
                sortable: true,
                width: '18%',
                formatter: (value) => value || '-'
            },
            {
                field: 'image_no',
                label: 'Resim No',
                sortable: true,
                width: '18%',
                formatter: (value) => value || '-'
            },
            {
                field: 'position_no',
                label: 'Pozisyon No',
                sortable: true,
                width: '18%',
                formatter: (value) => value || '-'
            },
            {
                field: 'weight_kg',
                label: 'Ağırlık (kg)',
                sortable: true,
                width: '14%',
                formatter: (value) => value ? `${value} kg` : '-'
            },
            {
                field: 'quantity',
                label: 'Adet',
                sortable: true,
                width: '14%',
                formatter: (value) => value != null ? value : '-'
            },
            {
                field: 'actions',
                label: 'İşlemler',
                sortable: false,
                width: '18%',
                formatter: (value, row) => {
                    return `
                        <div class="btn-group" role="group">
                            <button type="button" class="btn btn-sm btn-outline-primary" onclick="editPart(${row.id})" title="Düzenle">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button type="button" class="btn btn-sm btn-outline-danger" onclick="deletePart(${JSON.stringify(row).replace(/"/g, '&quot;')})" title="Sil">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    `;
                }
            }
        ],
        data: parts,
        sortable: true,
        pagination: false,
        exportable: false,
        refreshable: false,
        striped: true,
        small: true,
        emptyMessage: 'Parça bulunamadı',
        emptyIcon: 'fas fa-puzzle-piece'
    });
    
    // Add the add button to the table header after rendering
    setTimeout(() => {
        const cardActions = document.querySelector('#parts-table-container .card-actions');
        if (cardActions) {
            const addButton = document.createElement('button');
            addButton.type = 'button';
            addButton.className = 'btn btn-sm btn-success';
            addButton.innerHTML = '<i class="fas fa-plus me-1"></i>Parça Ekle';
            addButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                showAddPartModal();
            });
            cardActions.appendChild(addButton);
        }
        
        // Add toggle button for paste section
        const togglePasteBtn = editCutModal.container.querySelector('#toggle-paste-section-edit');
        const pasteSection = editCutModal.container.querySelector('#paste-section-edit');
        if (togglePasteBtn && pasteSection) {
            togglePasteBtn.addEventListener('click', () => {
                const isHidden = pasteSection.style.display === 'none';
                pasteSection.style.display = isHidden ? 'block' : 'none';
                togglePasteBtn.innerHTML = isHidden 
                    ? '<i class="fas fa-chevron-up me-1"></i>Gizle'
                    : '<i class="fas fa-paste me-1"></i>Toplu Yapıştır';
            });
        }
        
        // Add event listener for preview button
        const previewPasteBtn = editCutModal.container.querySelector('#preview-paste-btn-edit');
        const parsePasteBtn = editCutModal.container.querySelector('#parse-paste-btn-edit');
        const bulkPasteInput = editCutModal.container.querySelector('#bulk-paste-input-edit');
        const previewSection = editCutModal.container.querySelector('#paste-preview-edit');
        const previewTableBody = editCutModal.container.querySelector('#preview-table-body-edit');
        const previewCount = editCutModal.container.querySelector('#preview-count-edit');
        
        let currentParsedParts = null; // Store parsed parts for confirmation
        
        if (previewPasteBtn && bulkPasteInput && previewSection && previewTableBody) {
            previewPasteBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const text = bulkPasteInput.value;
                if (!text || text.trim() === '') {
                    showNotification('Lütfen yapıştırılacak veri girin', 'warning');
                    return;
                }
                
                const parsed = parsePartsFromText(text);
                if (!parsed || parsed.length === 0) {
                    showNotification('Yapıştırılan veriler ayrıştırılamadı', 'warning');
                    previewSection.style.display = 'none';
                    parsePasteBtn.style.display = 'none';
                    currentParsedParts = null;
                    return;
                }
                
                // Store parsed parts
                currentParsedParts = parsed;
                
                // Show preview
                previewTableBody.innerHTML = '';
                parsed.forEach((part, index) => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${part.job_no || '-'}</td>
                        <td>${part.image_no || '-'}</td>
                        <td>${part.position_no || '-'}</td>
                        <td>${part.weight_kg != null ? part.weight_kg : '-'}</td>
                        <td>${part.quantity != null ? part.quantity : '-'}</td>
                    `;
                    previewTableBody.appendChild(row);
                });
                
                if (previewCount) {
                    previewCount.textContent = parsed.length;
                }
                
                previewSection.style.display = 'block';
                parsePasteBtn.style.display = 'inline-block';
            });
        }
        
        // Add event listener for bulk paste in edit modal
        if (parsePasteBtn && bulkPasteInput) {
            parsePasteBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                // Use the previewed parts if available, otherwise parse again
                let parsed = currentParsedParts;
                if (!parsed || parsed.length === 0) {
                    const text = bulkPasteInput.value;
                    if (!text || text.trim() === '') {
                        showNotification('Lütfen önce önizleme yapın', 'warning');
                        return;
                    }
                    parsed = parsePartsFromText(text);
                    if (!parsed || parsed.length === 0) {
                        showNotification('Yapıştırılan veriler ayrıştırılamadı', 'warning');
                        return;
                    }
                }
                
                // Save current scroll position of the edit modal and lock it
                const editModalBody = editCutModal.container.querySelector('.modal-body');
                const editModalDialog = editCutModal.container.querySelector('.modal-dialog');
                const editModalElement = editCutModal.container.querySelector('.modal');
                const scrollPosition = editModalBody ? editModalBody.scrollTop : 0;
                
                // Also check if modal-dialog or modal itself is scrollable
                const dialogScrollPosition = editModalDialog ? editModalDialog.scrollTop : 0;
                const modalScrollPosition = editModalElement ? editModalElement.scrollTop : 0;
                
                // Lock scroll position by intercepting scrollTop property
                let scrollLocked = true;
                let scrollTopDescriptor = null;
                let originalScrollTop = null;
                
                if (editModalBody) {
                    // Save original scrollTop descriptor
                    scrollTopDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop') || 
                                         Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTop');
                    
                    // Intercept scrollTop setter
                    Object.defineProperty(editModalBody, 'scrollTop', {
                        get: function() {
                            return scrollLocked ? scrollPosition : (scrollTopDescriptor ? scrollTopDescriptor.get.call(this) : this._scrollTop || 0);
                        },
                        set: function(value) {
                            if (scrollLocked) {
                                // Ignore scrollTop changes while locked
                                if (scrollTopDescriptor && scrollTopDescriptor.set) {
                                    scrollTopDescriptor.set.call(this, scrollPosition);
                                } else {
                                    this._scrollTop = scrollPosition;
                                }
                            } else {
                                // Allow normal scrollTop changes when unlocked
                                if (scrollTopDescriptor && scrollTopDescriptor.set) {
                                    scrollTopDescriptor.set.call(this, value);
                                } else {
                                    this._scrollTop = value;
                                }
                            }
                        },
                        configurable: true
                    });
                    
                    // Also prevent scroll events
                    const preventScroll = (e) => {
                        if (scrollLocked) {
                            e.preventDefault();
                            e.stopPropagation();
                            if (scrollTopDescriptor && scrollTopDescriptor.set) {
                                scrollTopDescriptor.set.call(editModalBody, scrollPosition);
                            }
                            return false;
                        }
                    };
                    
                    editModalBody.addEventListener('scroll', preventScroll, { passive: false, capture: true });
                    
                    // Store the preventScroll function for cleanup
                    editModalBody._preventScroll = preventScroll;
                    
                    // Also prevent scroll on modal-dialog and modal if they exist
                    if (editModalDialog) {
                        const preventDialogScroll = (e) => {
                            if (scrollLocked) {
                                e.preventDefault();
                                e.stopPropagation();
                                editModalDialog.scrollTop = dialogScrollPosition;
                                return false;
                            }
                        };
                        editModalDialog.addEventListener('scroll', preventDialogScroll, { passive: false, capture: true });
                        editModalDialog._preventScroll = preventDialogScroll;
                    }
                    
                    if (editModalElement) {
                        const preventModalScroll = (e) => {
                            if (scrollLocked) {
                                e.preventDefault();
                                e.stopPropagation();
                                editModalElement.scrollTop = modalScrollPosition;
                                return false;
                            }
                        };
                        editModalElement.addEventListener('scroll', preventModalScroll, { passive: false, capture: true });
                        editModalElement._preventScroll = preventModalScroll;
                    }
                }
                
                // Continuous scroll monitoring as fallback
                let scrollMonitorInterval = null;
                if (editModalBody) {
                    scrollMonitorInterval = setInterval(() => {
                        if (scrollLocked) {
                            if (editModalBody && editModalBody.scrollTop !== scrollPosition) {
                                editModalBody.scrollTop = scrollPosition;
                            }
                            if (editModalDialog && editModalDialog.scrollTop !== dialogScrollPosition) {
                                editModalDialog.scrollTop = dialogScrollPosition;
                            }
                            if (editModalElement && editModalElement.scrollTop !== modalScrollPosition) {
                                editModalElement.scrollTop = modalScrollPosition;
                            }
                        }
                    }, 10); // Check every 10ms
                }
                
                // Confirm replacement using ConfirmationModal
                let partsReplaceModal = new ConfirmationModal('parts-replace-confirm-modal-container', {
                    title: 'Parçaları Değiştir',
                    icon: 'fas fa-exchange-alt',
                    message: 'Tüm mevcut parçalar silinecek ve yeni parçalar eklenecek',
                    description: `${parsed.length} yeni parça eklenecek. Bu işlem geri alınamaz.`,
                    confirmText: 'Evet, Değiştir',
                    cancelText: 'İptal',
                    confirmButtonClass: 'btn-warning'
                });
                
                // Unlock scroll when confirmation modal is hidden
                const unlockScroll = () => {
                    // Clear the monitoring interval
                    if (scrollMonitorInterval) {
                        clearInterval(scrollMonitorInterval);
                        scrollMonitorInterval = null;
                    }
                    scrollLocked = false;
                    if (editModalBody) {
                        // Restore original scrollTop property
                        if (scrollTopDescriptor) {
                            Object.defineProperty(editModalBody, 'scrollTop', scrollTopDescriptor);
                        } else {
                            delete editModalBody.scrollTop;
                        }
                        
                        // Remove scroll event listener
                        if (editModalBody._preventScroll) {
                            editModalBody.removeEventListener('scroll', editModalBody._preventScroll, { capture: true });
                            delete editModalBody._preventScroll;
                        }
                        
                        // Restore scroll position
                        editModalBody.scrollTop = scrollPosition;
                        
                        // Clean up dialog and modal scroll listeners
                        if (editModalDialog && editModalDialog._preventScroll) {
                            editModalDialog.removeEventListener('scroll', editModalDialog._preventScroll, { capture: true });
                            delete editModalDialog._preventScroll;
                            editModalDialog.scrollTop = dialogScrollPosition;
                        }
                        
                        if (editModalElement && editModalElement._preventScroll) {
                            editModalElement.removeEventListener('scroll', editModalElement._preventScroll, { capture: true });
                            delete editModalElement._preventScroll;
                            editModalElement.scrollTop = modalScrollPosition;
                        }
                    }
                };
                
                // Listen for confirmation modal close events
                const confirmationModalElement = partsReplaceModal.modal;
                if (confirmationModalElement) {
                    confirmationModalElement.addEventListener('hidden.bs.modal', unlockScroll, { once: true });
                }
                
                partsReplaceModal.show({
                    onConfirm: async () => {
                        try {
                            // Show loading
                            parsePasteBtn.disabled = true;
                            parsePasteBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>İşleniyor...';
                            
                            // Get all existing parts for this task
                            const taskKey = currentEditTask ? currentEditTask.key : null;
                            if (!taskKey) {
                                showNotification('Görev bilgisi bulunamadı', 'error');
                                parsePasteBtn.disabled = false;
                                parsePasteBtn.innerHTML = '<i class="fas fa-magic me-1"></i>Yapıştırılanı Ayrıştır ve Ekle';
                                return;
                            }
                            
                            const existingParts = await getCncParts({ cnc_task: taskKey });
                            const partsArray = Array.isArray(existingParts) ? existingParts : (existingParts.results || []);
                            
                            // Bulk delete all existing parts
                            if (partsArray.length > 0) {
                                const partIds = partsArray.map(part => part.id);
                                try {
                                    await bulkDeleteCncParts(partIds);
                                } catch (error) {
                                    console.error('Error bulk deleting parts:', error);
                                    // Fallback to individual deletion if bulk delete fails
                                    for (const part of partsArray) {
                                        try {
                                            await deleteCncPart(part.id);
                                        } catch (deleteError) {
                                            console.error(`Error deleting part ${part.id}:`, deleteError);
                                        }
                                    }
                                }
                            }
                            
                            // Prepare parts data for bulk create
                            const partsData = parsed.map(p => ({
                                cnc_task: taskKey,
                                job_no: p.job_no || '',
                                image_no: p.image_no || '',
                                position_no: p.position_no || '',
                                weight_kg: p.weight_kg || null,
                                quantity: p.quantity || null
                            }));
                            
                            // Bulk create new parts
                            let successCount = 0;
                            let errorCount = 0;
                            try {
                                const createdParts = await bulkCreateCncParts(partsData);
                                // Handle both array and object response
                                if (Array.isArray(createdParts)) {
                                    successCount = createdParts.length;
                                } else if (createdParts.results && Array.isArray(createdParts.results)) {
                                    successCount = createdParts.results.length;
                                } else {
                                    successCount = partsData.length;
                                }
                            } catch (error) {
                                console.error('Error bulk creating parts:', error);
                                errorCount = partsData.length;
                            }
                            
                            // Clear the textarea
                            bulkPasteInput.value = '';
                            
                            // Refresh the parts table
                            const updatedTask = await getCncTask(taskKey);
                            await initializePartsTable(updatedTask);
                            
                            // Show success message
                            if (errorCount === 0) {
                                showNotification(`${successCount} parça başarıyla değiştirildi`, 'success');
                            } else {
                                showNotification(`${successCount} parça eklendi, ${errorCount} parça eklenirken hata oluştu`, 'warning');
                            }
                        } catch (error) {
                            console.error('Error replacing parts:', error);
                            showNotification('Parçalar değiştirilirken hata oluştu', 'error');
                        } finally {
                            parsePasteBtn.disabled = false;
                            parsePasteBtn.innerHTML = '<i class="fas fa-magic me-1"></i>Yapıştırılanı Ayrıştır ve Ekle';
                            // Unlock scroll after operation completes
                            unlockScroll();
                        }
                    },
                    onCancel: () => {
                        // User cancelled, unlock scroll
                        unlockScroll();
                    }
                });
            });
        }
    }, 100);
}

async function initializeFilesTable(cut) {
    const files = cut.files || [];
    
    filesTable = new TableComponent('files-table-container', {
        title: 'Dosyalar',
        icon: 'fas fa-file',
        iconColor: 'text-info',
        columns: [
            {
                field: 'file_name',
                label: 'Dosya Adı',
                sortable: true,
                width: '50%',
                formatter: (value) => {
                    // Extract filename from path
                    const filename = value.split('/').pop();
                    return filename || value;
                }
            },
            {
                field: 'uploaded_at',
                label: 'Yüklenme Tarihi',
                sortable: true,
                width: '25%',
                formatter: (value) => {
                    if (!value) return '-';
                    const date = new Date(value);
                    return date.toLocaleDateString('tr-TR') + ' ' + date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
                }
            },
            {
                field: 'uploaded_by_username',
                label: 'Yükleyen',
                sortable: true,
                width: '15%'
            },
            {
                field: 'actions',
                label: 'İşlemler',
                sortable: false,
                width: '10%',
                formatter: (value, row) => {
                    return `
                        <div class="btn-group" role="group">
                            <button type="button" class="btn btn-sm btn-outline-danger" onclick="deleteFile(${JSON.stringify(row).replace(/"/g, '&quot;')}); return false;" title="Sil">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    `;
                }
            }
        ],
        data: files,
        sortable: true,
        pagination: false,
        exportable: false,
        refreshable: false,
        striped: true,
        small: true,
        emptyMessage: 'Dosya bulunamadı',
        emptyIcon: 'fas fa-file'
    });
    
    // Add the add button to the table header after rendering
    setTimeout(() => {
        const cardActions = document.querySelector('#files-table-container .card-actions');
        if (cardActions) {
            const addButton = document.createElement('button');
            addButton.type = 'button';
            addButton.className = 'btn btn-sm btn-info';
            addButton.innerHTML = '<i class="fas fa-plus me-1"></i>Dosya Ekle';
            addButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                showAddFileModal();
            });
            cardActions.appendChild(addButton);
        }
    }, 100);
}

// Parts table action functions
async function editPart(partId) {
    try {
        // Get the part data
        const part = await getCncPart(partId);
        
        // Create a simple edit modal for the part
        const editPartModal = new EditModal('edit-part-modal-container', {
            title: 'Parça Düzenle',
            icon: 'fas fa-edit',
            saveButtonText: 'Değişiklikleri Kaydet',
            size: 'md'
        });
        
        editPartModal.addSection({
            id: 'part-edit',
            title: 'Parça Bilgileri',
            icon: 'fas fa-puzzle-piece',
            iconColor: 'text-success',
            fields: [
                {
                    id: 'part-job-no',
                    label: 'İş No',
                    type: 'text',
                    required: true,
                    value: part.job_no || '',
                    colSize: 6
                },
                {
                    id: 'part-image-no',
                    label: 'Resim No',
                    type: 'text',
                    required: false,
                    value: part.image_no || '',
                    colSize: 6
                },
                {
                    id: 'part-position-no',
                    label: 'Pozisyon No',
                    type: 'text',
                    required: false,
                    value: part.position_no || '',
                    colSize: 6
                },
                {
                    id: 'part-weight',
                    label: 'Ağırlık (kg)',
                    type: 'number',
                    required: false,
                    step: '0.001',
                    min: '0',
                    value: part.weight_kg || '',
                    colSize: 6
                },
                {
                    id: 'part-quantity',
                    label: 'Adet',
                    type: 'number',
                    required: false,
                    step: '1',
                    min: '0',
                    value: part.quantity != null ? part.quantity : '',
                    colSize: 6
                }
            ]
        });
        
        editPartModal.onSaveCallback(async (formData) => {
            const updateData = {
                job_no: formData['part-job-no'],
                image_no: formData['part-image-no'],
                position_no: formData['part-position-no'],
                weight_kg: formData['part-weight'],
                quantity: formData['part-quantity'] ? parseInt(formData['part-quantity'], 10) : null
            };
            
            try {
                await updateCncPart(partId, updateData);
                showNotification('Parça başarıyla güncellendi', 'success');
                
                // Close modal
                const modalInstance = bootstrap.Modal.getOrCreateInstance(document.querySelector('#edit-part-modal-container .modal'));
                if (modalInstance) {
                    modalInstance.hide();
                }
                
                // Refresh the parts table
                await refreshPartsTable();
            } catch (error) {
                console.error('Error updating part:', error);
                showNotification('Parça güncellenirken hata oluştu', 'error');
            }
        });
        
        editPartModal.render();
        editPartModal.show();
        
    } catch (error) {
        console.error('Error editing part:', error);
        showNotification('Parça bilgileri alınırken hata oluştu', 'error');
    }
}

async function deletePart(partData) {
    // partData is now the complete row object
    const partName = partData.job_no ? `İş No: ${partData.job_no}` : `Parça (ID: ${partData.id})`;
    
    // Update the delete confirmation modal content
    document.getElementById('delete-cut-name').textContent = `Parça - ${partName}`;
    
    // Set up the confirm delete button
    const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
    confirmDeleteBtn.onclick = async () => {
        try {
            await deleteCncPart(partData.id);
            showNotification('Parça başarıyla silindi', 'success');
            
            // Close the modal
            const deleteModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('deleteConfirmModal'));
            deleteModal.hide();
            
            // Refresh the parts table
            await refreshPartsTable();
        } catch (error) {
            console.error('Error deleting part:', error);
            showNotification('Parça silinirken hata oluştu', 'error');
        }
    };
    
    // Show the delete confirmation modal
    const deleteModal = new bootstrap.Modal(document.getElementById('deleteConfirmModal'));
    deleteModal.show();
}

// Add new part modal
function showAddPartModal() {
    // Create a simple add modal for the part
    const addPartModal = new EditModal('add-part-modal-container', {
        title: 'Yeni Parça Ekle',
        icon: 'fas fa-plus',
        saveButtonText: 'Parçayı Ekle',
        size: 'md'
    });
    
    addPartModal.addSection({
        id: 'part-add',
        title: 'Parça Bilgileri',
        icon: 'fas fa-puzzle-piece',
        iconColor: 'text-success',
        fields: [
            {
                id: 'part-job-no',
                label: 'İş No',
                type: 'text',
                required: true,
                placeholder: 'İş numarasını girin',
                colSize: 6
            },
            {
                id: 'part-image-no',
                label: 'Resim No',
                type: 'text',
                required: false,
                placeholder: 'Resim numarasını girin',
                colSize: 6
            },
            {
                id: 'part-position-no',
                label: 'Pozisyon No',
                type: 'text',
                required: false,
                placeholder: 'Pozisyon numarasını girin',
                colSize: 6
            },
            {
                id: 'part-weight',
                label: 'Ağırlık (kg)',
                type: 'number',
                required: false,
                step: '0.001',
                min: '0',
                placeholder: '0.000',
                colSize: 6
            },
            {
                id: 'part-quantity',
                label: 'Adet',
                type: 'number',
                required: false,
                step: '1',
                min: '0',
                placeholder: '0',
                colSize: 6
            }
        ]
    });
    
    addPartModal.onSaveCallback(async (formData) => {
        const partData = {
            cnc_task: currentEditTask.key,
            job_no: formData['part-job-no'],
            image_no: formData['part-image-no'],
            position_no: formData['part-position-no'],
            weight_kg: formData['part-weight'],
            quantity: formData['part-quantity'] ? parseInt(formData['part-quantity'], 10) : null
        };
        
        // Validate required fields
        if (!partData.job_no || partData.job_no.trim() === '') {
            showNotification('İş numarası gereklidir', 'error');
            return;
        }
        
        try {
            await createCncPart(partData);
            showNotification('Parça başarıyla eklendi', 'success');
            
            // Close modal
            const modalInstance = bootstrap.Modal.getOrCreateInstance(document.querySelector('#add-part-modal-container .modal'));
            if (modalInstance) {
                modalInstance.hide();
            }
            
            // Refresh the parts table
            await refreshPartsTable();
        } catch (error) {
            console.error('Error creating part:', error);
            showNotification('Parça eklenirken hata oluştu', 'error');
        }
    });
    
    addPartModal.render();
    addPartModal.show();
}

// Add new file modal
function showAddFileModal() {
    // Create a simple add modal for the file
    const addFileModal = new EditModal('add-file-modal-container', {
        title: 'Yeni Dosya Ekle',
        icon: 'fas fa-plus',
        saveButtonText: 'Dosyayı Ekle',
        size: 'md'
    });
    
    addFileModal.addSection({
        id: 'file-add',
        title: 'Dosya Bilgileri',
        icon: 'fas fa-file',
        iconColor: 'text-info',
        fields: [
            {
                id: 'file-upload',
                label: 'Dosya Seç',
                type: 'file',
                required: true,
                accept: '*/*',
                multiple: true,
                colSize: 12,
                helpText: 'Bir veya birden fazla dosya seçebilirsiniz'
            }
        ]
    });
    
    addFileModal.onSaveCallback(async (formData) => {
        // Get the actual file objects from the file input
        const fileInput = addFileModal.container.querySelector('input[type="file"]');
        const uploadedFiles = fileInput ? Array.from(fileInput.files) : [];
        
        if (uploadedFiles.length === 0) {
            showNotification('Lütfen en az bir dosya seçin', 'error');
            return;
        }
        
        try {
            await addFilesToCncTask(currentEditTask.key, uploadedFiles);
            showNotification('Dosya(lar) başarıyla eklendi', 'success');
            
            // Close modal
            const modalInstance = bootstrap.Modal.getOrCreateInstance(document.querySelector('#add-file-modal-container .modal'));
            if (modalInstance) {
                modalInstance.hide();
            }
            
            // Refresh the files table
            await refreshFilesTable();
        } catch (error) {
            console.error('Error adding files:', error);
            showNotification('Dosya(lar) eklenirken hata oluştu', 'error');
        }
    });
    
    addFileModal.render();
    addFileModal.show();
}

// Files table action functions
async function deleteFile(fileData) {
    // fileData is now the complete row object
    const fileName = fileData.file_name ? fileData.file_name.split('/').pop() : `Dosya (ID: ${fileData.id})`;
    
    // Update the delete confirmation modal content
    document.getElementById('delete-cut-name').textContent = `Dosya - ${fileName}`;
    
    // Set up the confirm delete button
    const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
    confirmDeleteBtn.onclick = async () => {
        try {
            await deleteCncFile(fileData.id);
            showNotification('Dosya başarıyla silindi', 'success');
            
            // Close the modal
            const deleteModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('deleteConfirmModal'));
            deleteModal.hide();
            
            // Refresh the files table
            await refreshFilesTable();
        } catch (error) {
            console.error('Error deleting file:', error);
            showNotification('Dosya silinirken hata oluştu', 'error');
        }
    };
    
    // Show the delete confirmation modal
    const deleteModal = new bootstrap.Modal(document.getElementById('deleteConfirmModal'));
    deleteModal.show();
}

function viewFile(fileUrl, fileName) {
    // Use the existing file viewer
    if (window.previewFile) {
        window.previewFile(fileUrl, fileName);
    }
}

function downloadFile(fileUrl, fileName) {
    // Create a temporary link to download the file
    const link = document.createElement('a');
    link.href = fileUrl;
    link.download = fileName;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Refresh functions
async function refreshPartsTable() {
    if (!currentEditTask) return;
    
    try {
        // Get updated task data
        const updatedTask = await getCncTask(currentEditTask.key);
        currentEditTask = updatedTask;
        
        // Clear and reinitialize parts table with updated data
        const container = document.getElementById('parts-table-container');
        if (container) {
            await initializePartsTable(updatedTask);
        }
    } catch (error) {
        console.error('Error refreshing parts table:', error);
    }
}

async function refreshFilesTable() {
    if (!currentEditTask) return;
    
    try {
        // Get updated task data
        const updatedTask = await getCncTask(currentEditTask.key);
        currentEditTask = updatedTask;
        
        // Clear and reinitialize files table with updated data
        const container = document.getElementById('files-table-container');
        if (container) {
            await initializeFilesTable(updatedTask);
        }
    } catch (error) {
        console.error('Error refreshing files table:', error);
    }
}

async function handleEditCutSave(formData, cutKey) {
    // Get machine_fk value manually if not in formData
    const dropdown = editCutModal.dropdowns?.get('cut-machine-fk');
    
    // Get the actual file objects from the file input
    const fileInput = editCutModal.container.querySelector('input[type="file"]');
    const uploadedFiles = fileInput ? Array.from(fileInput.files) : [];
    
    // Get machine_fk value manually if not in formData
    let machineFkValue = formData['cut-machine-fk'];
    if (!machineFkValue && dropdown) {
        machineFkValue = dropdown.getValue();
    }
    
    const cutData = {
        name: formData['cut-name'],
        nesting_id: formData['cut-nesting-id'],
        material: formData['cut-material'],
        dimensions: formData['cut-dimensions'],
        thickness_mm: parseFloat(formData['cut-thickness']) || 0,
        machine_fk: machineFkValue ? parseInt(machineFkValue) : null,
        estimated_hours: formData['cut-estimated-hours'] ? parseFloat(formData['cut-estimated-hours']) : null,
        quantity: formData['cut-quantity'] ? parseInt(formData['cut-quantity']) : null,
        selected_plate: selectedRemnantPlate ? selectedRemnantPlate.id : null
    };
    
    
    // Validate data
    const validation = validateCncTaskData(cutData);
    if (!validation.isValid) {
        showNotification('Lütfen gerekli alanları doldurun: ' + validation.errors.join(', '), 'error');
        return;
    }
    
    try {
        // Update the basic cut data first
        const response = await updateCncTask(cutKey, cutData);
        
        if (response) {
            // If there are new files, upload them separately
            if (uploadedFiles.length > 0) {
                try {
                    await addFilesToCncTask(cutKey, uploadedFiles);
                    showNotification('Kesim ve dosyalar başarıyla güncellendi', 'success');
                } catch (fileError) {
                    console.error('Error uploading files:', fileError);
                    showNotification('Kesim güncellendi ancak dosyalar yüklenirken hata oluştu', 'warning');
                }
            } else {
                showNotification('Kesim başarıyla güncellendi', 'success');
            }
            
            // Close the modal
            const modalInstance = bootstrap.Modal.getOrCreateInstance(document.querySelector('#edit-cut-modal-container .modal'));
            if (modalInstance) {
                modalInstance.hide();
            }
            
            // Reload cuts list
            loadCuts(currentPage);
        } else {
            throw new Error('Failed to update cut');
        }
    } catch (error) {
        console.error('Error updating cut:', error);
        showNotification('Kesim güncellenirken hata oluştu', 'error');
    }
}

function showNotification(message, type = 'info') {
    // Remove existing notifications
    document.querySelectorAll('.notification').forEach(n => n.remove());
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification alert alert-${type === 'error' ? 'danger' : type} alert-dismissible fade show`;
    notification.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.animation = 'slideOutRight 0.3s ease-out';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 300);
        }
    }, 5000);
    
    // Return the notification element for manual removal
    return notification;
}

// Add part to form
function addPart() {
    const container = document.getElementById('parts-container');
    if (!container) {
        return;
    }
    const partIndex = container.children.length;
    
    const partHtml = `
        <div class="part-row mb-3" data-index="${partIndex}">
            <div class="row g-2">
                <div class="col-md-2">
                    <input type="text" class="form-control form-control-sm" name="job_no" placeholder="İş numarası">
                </div>
                <div class="col-md-2">
                    <input type="text" class="form-control form-control-sm" name="image_no" placeholder="Resim numarası">
                </div>
                <div class="col-md-2">
                    <input type="text" class="form-control form-control-sm" name="position_no" placeholder="Pozisyon numarası">
                </div>
                <div class="col-md-2">
                    <input type="number" class="form-control form-control-sm" name="weight" step="0.01" min="0" placeholder="0.00">
                </div>
                <div class="col-md-2">
                    <input type="number" class="form-control form-control-sm" name="quantity" step="1" min="0" placeholder="0">
                </div>
                <div class="col-md-2">
                    <button type="button" class="btn btn-outline-danger btn-sm w-100" onclick="removePart(${partIndex})" title="Parçayı Kaldır">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
    
    container.insertAdjacentHTML('beforeend', partHtml);
}

// Populate parts from parsed objects
function populatePartsFromParsed(parsedParts) {
    if (!Array.isArray(parsedParts) || parsedParts.length === 0) return;
    const container = document.getElementById('parts-container');
    if (!container) return;

    for (const p of parsedParts) {
        // Create a new row
        addPart();
        const lastRow = container.lastElementChild;
        if (!lastRow) continue;
        const jobInput = lastRow.querySelector('input[name="job_no"]');
        const imageInput = lastRow.querySelector('input[name="image_no"]');
        const positionInput = lastRow.querySelector('input[name="position_no"]');
        const weightInput = lastRow.querySelector('input[name="weight"]');
        const quantityInput = lastRow.querySelector('input[name="quantity"]');

        if (jobInput) jobInput.value = p.job_no || '';
        if (imageInput) imageInput.value = p.image_no || '';
        if (positionInput) positionInput.value = p.position_no || '';
        if (weightInput && p.weight_kg != null) weightInput.value = String(p.weight_kg);
        if (quantityInput && p.quantity != null) quantityInput.value = String(p.quantity);
    }
}

// Remove part
function removePart(index) {
    const partRow = document.querySelector(`.part-row[data-index="${index}"]`);
    if (partRow) {
        partRow.remove();
    }
}

// Show cut details modal
async function showCutDetails(cutData) {
    try {
        // Fetch complete task data from API
        const taskData = await getCncTask(cutData.key);
        
        // Create Display Modal instance
        detailsModal = new DisplayModal('cut-details-modal-container', {
            title: 'Kesim Detayları',
            icon: 'fas fa-info-circle',
            size: 'xl',
            showEditButton: false
        });
        
        // Clear previous data
        detailsModal.clearData();
        
        // Add basic information section
        detailsModal.addSection({
            title: 'Temel Bilgiler',
            icon: 'fas fa-info-circle',
            iconColor: 'text-primary'
        });
        
        // Add basic fields
        // Basic information - 4 items per row layout
        detailsModal.addField({
            id: 'cut-key',
            name: 'key',
            label: 'Kesim No',
            type: 'text',
            value: taskData.key || '-',
            icon: 'fas fa-hashtag',
            colSize: 3,
            layout: 'horizontal'
        });
        
        detailsModal.addField({
            id: 'cut-name',
            name: 'name',
            label: 'Kesim Adı',
            type: 'text',
            value: taskData.name || '-',
            icon: 'fas fa-tag',
            colSize: 3,
            layout: 'horizontal'
        });
        
        detailsModal.addField({
            id: 'cut-nesting-id',
            name: 'nesting_id',
            label: 'Nesting ID',
            type: 'text',
            value: taskData.nesting_id || '-',
            icon: 'fas fa-hashtag',
            colSize: 3,
            layout: 'horizontal'
        });
        
        detailsModal.addField({
            id: 'cut-material',
            name: 'material',
            label: 'Malzeme',
            type: 'text',
            value: taskData.material || '-',
            icon: 'fas fa-cube',
            colSize: 3,
            layout: 'horizontal'
        });
        
        detailsModal.addField({
            id: 'cut-thickness',
            name: 'thickness_mm',
            label: 'Kalınlık',
            type: 'text',
            value: taskData.thickness_mm ? `${taskData.thickness_mm} mm` : '-',
            icon: 'fas fa-layer-group',
            colSize: 3,
            layout: 'horizontal'
        });
        
        detailsModal.addField({
            id: 'cut-dimensions',
            name: 'dimensions',
            label: 'Boyutlar',
            type: 'text',
            value: taskData.dimensions || '-',
            icon: 'fas fa-ruler',
            colSize: 3,
            layout: 'horizontal'
        });
        
        detailsModal.addField({
            id: 'cut-estimated-hours',
            name: 'estimated_hours',
            label: 'Tahmini Saat',
            type: 'text',
            value: taskData.estimated_hours ? `${taskData.estimated_hours} saat` : '-',
            icon: 'fas fa-clock',
            colSize: 3,
            layout: 'horizontal'
        });
        
        detailsModal.addField({
            id: 'cut-quantity',
            name: 'quantity',
            label: 'Adet',
            type: 'text',
            value: taskData.quantity ? `${taskData.quantity}` : '-',
            icon: 'fas fa-list-ol',
            colSize: 3,
            layout: 'horizontal'
        });
        
        detailsModal.addField({
            id: 'cut-total-hours',
            name: 'total_hours_spent',
            label: 'Harcanan Saat',
            type: 'text',
            value: taskData.total_hours_spent ? `${taskData.total_hours_spent} saat` : '0 saat',
            icon: 'fas fa-hourglass-half',
            colSize: 3,
            layout: 'horizontal'
        });
        
        detailsModal.addField({
            id: 'cut-machine-name',
            name: 'machine_name',
            label: 'Makine',
            type: 'text',
            value: taskData.machine_name || '-',
            icon: 'fas fa-cogs',
            colSize: 3,
            layout: 'horizontal'
        });
        
        // Add files if available
        if (taskData.files && taskData.files.length > 0) {
            console.log('Files found:', taskData.files.length, taskData.files);
            const filesHtml = taskData.files.map((file, index) => {
                const fileName = file.file_name ? file.file_name.split('/').pop() : 'Dosya';
                const fileExtension = fileName.split('.').pop().toLowerCase();
                const isImage = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(fileExtension);
                const isPdf = fileExtension === 'pdf';
                const isVideo = ['mp4', 'avi', 'mov', 'wmv', 'flv'].includes(fileExtension);
                
                let previewIcon = 'fas fa-file';
                let iconColor = 'text-muted';
                if (isImage) {
                    previewIcon = 'fas fa-image';
                    iconColor = 'text-success';
                } else if (isPdf) {
                    previewIcon = 'fas fa-file-pdf';
                    iconColor = 'text-danger';
                } else if (isVideo) {
                    previewIcon = 'fas fa-video';
                    iconColor = 'text-info';
                } else if (['doc', 'docx'].includes(fileExtension)) {
                    previewIcon = 'fas fa-file-word';
                    iconColor = 'text-primary';
                } else if (['xls', 'xlsx'].includes(fileExtension)) {
                    previewIcon = 'fas fa-file-excel';
                    iconColor = 'text-success';
                } else if (['ppt', 'pptx'].includes(fileExtension)) {
                    previewIcon = 'fas fa-file-powerpoint';
                    iconColor = 'text-warning';
                }
                
                // Create thumbnail preview
                let thumbnailContent = '';
                if (isImage) {
                    thumbnailContent = `
                        <div class="file-thumbnail-image" style="background-image: url('${file.file_url}'); background-size: cover; background-position: center; width: 100%; height: 100px; border-radius: 4px; cursor: pointer;" onclick="previewFile('${file.file_url}', '${fileName}', '${fileExtension}')">
                            <div class="file-overlay d-flex align-items-center justify-content-center" style="background: rgba(0,0,0,0.3); width: 100%; height: 100%; border-radius: 4px; opacity: 0; transition: opacity 0.2s;">
                                <i class="fas fa-eye text-white fa-lg"></i>
                            </div>
                        </div>
                    `;
                } else {
                    thumbnailContent = `
                        <div class="file-thumbnail-icon d-flex align-items-center justify-content-center" style="width: 100%; height: 100px; border: 2px dashed #dee2e6; border-radius: 4px; cursor: pointer; background: #f8f9fa;" onclick="previewFile('${file.file_url}', '${fileName}', '${fileExtension}')">
                            <div class="text-center">
                                <i class="${previewIcon} ${iconColor} fa-2x mb-2"></i>
                                <div class="small text-muted">${fileExtension.toUpperCase()}</div>
                            </div>
                        </div>
                    `;
                }
                
                return `
                    <div class="col-md-3 col-sm-4 col-6 mb-3">
                        <div class="file-thumbnail-container">
                            ${thumbnailContent}
                            <div class="file-info mt-2">
                                <div class="file-name small fw-medium text-truncate" title="${fileName}">${fileName}</div>
                                <div class="file-meta small text-muted">
                                    ${file.uploaded_by_username} • ${new Date(file.uploaded_at).toLocaleDateString('tr-TR')}
                                </div>
                                <div class="file-actions mt-1">
                                    <a href="${file.file_url}" target="_blank" class="btn btn-sm btn-outline-secondary" title="İndir">
                                        <i class="fas fa-download"></i>
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
            
        }
        
        // Render the modal first
        detailsModal.render();
        
        // Ensure modal close functionality works
        setTimeout(() => {
            const closeBtn = detailsModal.container.querySelector('.btn-close');
            if (closeBtn) {
                // Remove existing event listeners and add our own
                const newCloseBtn = closeBtn.cloneNode(true);
                closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
                
                newCloseBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    detailsModal.hide();
                });
                
                // Also handle ESC key and backdrop click
                const modalElement = detailsModal.container.querySelector('.modal');
                if (modalElement) {
                    modalElement.addEventListener('click', (e) => {
                        if (e.target === modalElement) {
                            detailsModal.hide();
                        }
                    });
                    
                    document.addEventListener('keydown', (e) => {
                        if (e.key === 'Escape' && modalElement.classList.contains('show')) {
                            detailsModal.hide();
                        }
                    });
                }
            }
        }, 100);
        
        // Add files section after modal is rendered
        if (taskData.files && taskData.files.length > 0) {
            const filesContainerHtml = `
                <div class="mt-4">
                    <div id="task-files-container"></div>
                </div>
            `;
            
            // Find the last section and add files container
            const lastSection = detailsModal.container.querySelector('[data-section-id*="section"]:last-of-type');
            if (lastSection) {
                const sectionBody = lastSection.querySelector('.row.g-2');
                if (sectionBody) {
                    sectionBody.insertAdjacentHTML('beforeend', filesContainerHtml);
                }
            }
            
            // Initialize FileAttachments component
            const fileAttachments = new FileAttachments('task-files-container', {
                title: 'Ekler',
                titleIcon: 'fas fa-paperclip',
                titleIconColor: 'text-muted',
                layout: 'grid',
                onFileClick: (file) => {
                    const fileName = file.file_name ? file.file_name.split('/').pop() : 'Dosya';
                    const fileExtension = fileName.split('.').pop().toLowerCase();
                    previewFile(file.file_url, fileName, fileExtension);
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
            fileAttachments.setFiles(taskData.files);
        }
        
        // Add parts table section
        const partsSectionHtml = `
            <div class="mt-4">
                <div id="parts-details-table-container"></div>
            </div>
        `;
        
        // Find the last section and add parts table
        const lastSection = detailsModal.container.querySelector('[data-section-id*="section"]:last-of-type');
        if (lastSection) {
            const sectionBody = lastSection.querySelector('.row.g-2');
            if (sectionBody) {
                sectionBody.insertAdjacentHTML('beforeend', partsSectionHtml);
            }
        }
        
        // Initialize parts table
        initializePartsDetailsTable(taskData.parts || []);
        
        // Show the modal
        detailsModal.show();
        
        // Add event listener to clean up URL when modal is closed
        const modalElement = detailsModal.container.querySelector('.modal');
        if (modalElement) {
            modalElement.addEventListener('hidden.bs.modal', () => {
                // Remove cut parameter from URL when modal is closed
                const url = new URL(window.location);
                if (url.searchParams.has('cut')) {
                    url.searchParams.delete('cut');
                    window.history.pushState({}, '', url);
                }
            });
        }
        
    } catch (error) {
        console.error('Error showing cut details:', error);
        showNotification('Kesim detayları yüklenirken hata oluştu', 'error');
    }
}

// Initialize parts details table
function initializePartsDetailsTable(parts) {
    const partsTable = new TableComponent('parts-details-table-container', {
        title: 'Parça Listesi',
        icon: 'fas fa-puzzle-piece',
        iconColor: 'text-success',
        columns: [
            {
                field: 'job_no',
                label: 'İş No',
                sortable: true,
                width: '25%',
                formatter: (value) => value || '-'
            },
            {
                field: 'image_no',
                label: 'Resim No',
                sortable: true,
                width: '25%',
                formatter: (value) => value || '-'
            },
            {
                field: 'position_no',
                label: 'Pozisyon No',
                sortable: true,
                width: '25%',
                formatter: (value) => value || '-'
            },
            {
                field: 'weight_kg',
                label: 'Ağırlık (kg)',
                sortable: true,
                width: '20%',
                formatter: (value) => value ? `${value} kg` : '-'
            },
            {
                field: 'quantity',
                label: 'Adet',
                sortable: true,
                width: '20%',
                formatter: (value) => value != null ? value : '-'
            }
        ],
        data: parts,
        sortable: true,
        pagination: false,
        exportable: false,
        refreshable: false,
        striped: true,
        small: true,
        emptyMessage: 'Parça bulunamadı',
        emptyIcon: 'fas fa-puzzle-piece'
    });
}

// Expose functions to global scope for table onclick handlers
window.editPart = editPart;
window.deletePart = deletePart;
window.deleteFile = deleteFile;
window.viewFile = viewFile;
window.downloadFile = downloadFile;
function updateSelectedRemnantDisplay() {
    if (!createCutModal || !createCutModal.container) return;
    
    const display = createCutModal.container.querySelector('#selected-remnant-display');
    const info = createCutModal.container.querySelector('#selected-remnant-info');
    const selectBtn = createCutModal.container.querySelector('#select-remnant-btn');
    const badge = createCutModal.container.querySelector('#selected-remnant-badge');
    
    if (display && info && selectBtn) {
        if (selectedRemnantPlate) {
            display.style.display = 'block';
            info.textContent = `ID: ${selectedRemnantPlate.id}`;
            selectBtn.innerHTML = '<i class="fas fa-layer-group me-2"></i>Fire Plaka Değiştir';
            
            // Add click handler to badge if it exists
            if (badge) {
                badge.onclick = (e) => {
                    e.stopPropagation();
                    if (selectedRemnantPlate && selectedRemnantPlate.id) {
                        showRemnantDetailsModal(selectedRemnantPlate.id);
                    }
                };
            }
        } else {
            display.style.display = 'none';
            selectBtn.innerHTML = '<i class="fas fa-layer-group me-2"></i>Fire Plaka Seç';
        }
    }
}

function updateSelectedRemnantDisplayEdit() {
    if (!editCutModal || !editCutModal.container) return;
    
    const display = editCutModal.container.querySelector('#selected-remnant-display-edit');
    const info = editCutModal.container.querySelector('#selected-remnant-info-edit');
    const selectBtn = editCutModal.container.querySelector('#select-remnant-btn-edit');
    const badge = editCutModal.container.querySelector('#selected-remnant-badge-edit');
    
    if (display && info && selectBtn) {
        if (selectedRemnantPlate) {
            display.style.display = 'block';
            info.textContent = `ID: ${selectedRemnantPlate.id}`;
            selectBtn.innerHTML = '<i class="fas fa-layer-group me-2"></i>Fire Plaka Değiştir';
            
            // Add click handler to badge if it exists
            if (badge) {
                badge.onclick = (e) => {
                    e.stopPropagation();
                    if (selectedRemnantPlate && selectedRemnantPlate.id) {
                        showRemnantDetailsModal(selectedRemnantPlate.id);
                    }
                };
            }
        } else {
            display.style.display = 'none';
            selectBtn.innerHTML = '<i class="fas fa-layer-group me-2"></i>Fire Plaka Seç';
        }
    }
}

async function showRemnantDetailsModal(remnantId) {
    try {
        // Fetch remnant plate data
        const remnantData = await getRemnantPlateById(remnantId);
        
        // Create Display Modal instance
        const remnantDetailsModal = new DisplayModal('remnant-details-modal-container', {
            title: 'Fire Plaka Detayları',
            icon: 'fas fa-layer-group',
            showEditButton: false
        });
        
        // Clear previous data
        remnantDetailsModal.clearData();
        
        // Add basic information section
        remnantDetailsModal.addSection({
            title: 'Temel Bilgiler',
            icon: 'fas fa-info-circle',
            iconColor: 'text-primary'
        });
        
        // Add fields
        remnantDetailsModal.addField({
            id: 'remnant-id',
            name: 'id',
            label: 'ID',
            type: 'text',
            value: remnantData.id || '-',
            icon: 'fas fa-hashtag',
            colSize: 6,
            layout: 'horizontal'
        });
        
        remnantDetailsModal.addField({
            id: 'remnant-thickness',
            name: 'thickness_mm',
            label: 'Kalınlık',
            type: 'text',
            value: remnantData.thickness_mm ? `${remnantData.thickness_mm} mm` : '-',
            icon: 'fas fa-ruler-vertical',
            colSize: 6,
            layout: 'horizontal'
        });
        
        remnantDetailsModal.addField({
            id: 'remnant-dimensions',
            name: 'dimensions',
            label: 'Boyutlar',
            type: 'text',
            value: remnantData.dimensions || '-',
            icon: 'fas fa-ruler-combined',
            colSize: 6,
            layout: 'horizontal'
        });
        
        remnantDetailsModal.addField({
            id: 'remnant-quantity',
            name: 'quantity',
            label: 'Adet',
            type: 'text',
            value: remnantData.quantity ? `${remnantData.quantity}` : '-',
            icon: 'fas fa-list-ol',
            colSize: 6,
            layout: 'horizontal'
        });
        
        remnantDetailsModal.addField({
            id: 'remnant-material',
            name: 'material',
            label: 'Malzeme',
            type: 'text',
            value: remnantData.material || '-',
            icon: 'fas fa-cube',
            colSize: 12,
            layout: 'horizontal'
        });
        
        // Render and show modal
        remnantDetailsModal.render().show();
        
        // Get Bootstrap modal instance and show it
        const modalElement = remnantDetailsModal.container.querySelector('.modal');
        if (modalElement) {
            const modalInstance = bootstrap.Modal.getOrCreateInstance(modalElement);
            modalInstance.show();
        }
    } catch (error) {
        console.error('Error showing remnant details:', error);
        showNotification('Fire plaka detayları yüklenirken hata oluştu', 'error');
    }
}

function showSelectRemnantModal() {
    // Create modal for selecting remnant plate
    selectRemnantModal = new EditModal('select-remnant-modal-container', {
        title: 'Fire Plaka Seç',
        icon: 'fas fa-layer-group',
        saveButtonText: 'Seç',
        size: 'xl',
        showSaveButton: false,
        showCancelButton: true
    });
    
    // Add filters section
    selectRemnantModal.addSection({
        id: 'remnant-filters',
        title: 'Filtreler',
        icon: 'fas fa-filter',
        iconColor: 'text-primary',
        fields: []
    });
    
    // Add table section
    selectRemnantModal.addSection({
        id: 'remnant-table-section',
        title: 'Fire Plakalar',
        icon: 'fas fa-table',
        iconColor: 'text-info',
        fields: []
    });
    
    // Render the modal
    selectRemnantModal.render();
    
    // Initialize filters and table after render
    setTimeout(() => {
        initializeRemnantSelectionFilters();
        initializeRemnantSelectionTable();
    }, 100);
    
    // Show the modal
    selectRemnantModal.show();
}

function initializeRemnantSelectionFilters() {
    const filterSection = selectRemnantModal.container.querySelector('[data-section-id="remnant-filters"]');
    if (!filterSection) return;
    
    const fieldsContainer = filterSection.querySelector('.row.g-2');
    if (!fieldsContainer) return;
    
    // Create filter container
    const filterContainer = document.createElement('div');
    filterContainer.id = 'remnant-selection-filters-container';
    filterContainer.className = 'col-12';
    fieldsContainer.appendChild(filterContainer);
    
    // Initialize FiltersComponent
    remnantFilters = new FiltersComponent('remnant-selection-filters-container', {
        title: 'Plaka Filtreleri',
        onApply: (values) => {
            // Only send request when Apply is clicked
            loadRemnantSelectionTable(1);
        },
        onClear: () => {
            loadRemnantSelectionTable(1);
        },
        onFilterChange: (filterId, value) => {
            // Don't send request on change, only on Apply
        }
    });
    
    remnantFilters.addTextFilter({
        id: 'remnant-thickness-mm-filter',
        label: 'Kalınlık (mm)',
        placeholder: 'örn. 10',
        colSize: 2
    });
    
    remnantFilters.addTextFilter({
        id: 'remnant-dimensions-filter',
        label: 'Boyutlar',
        placeholder: 'örn. 1200x800',
        colSize: 2
    });
    
    remnantFilters.addTextFilter({
        id: 'remnant-material-filter',
        label: 'Malzeme',
        placeholder: 'Malzeme türü',
        colSize: 2
    });
}

function initializeRemnantSelectionTable() {
    const tableSection = selectRemnantModal.container.querySelector('[data-section-id="remnant-table-section"]');
    if (!tableSection) return;
    
    const fieldsContainer = tableSection.querySelector('.row.g-2');
    if (!fieldsContainer) return;
    
    // Create table container
    const tableContainer = document.createElement('div');
    tableContainer.id = 'remnant-selection-table-container';
    tableContainer.className = 'col-12';
    fieldsContainer.appendChild(tableContainer);
    
    // Initialize TableComponent
    remnantSelectionTable = new TableComponent('remnant-selection-table-container', {
        title: 'Fire Plakalar Listesi',
        icon: 'fas fa-table',
        iconColor: 'text-primary',
        columns: [
            {
                field: 'id',
                label: 'ID',
                sortable: true,
                width: '8%',
                formatter: (value) => `<span class="remnant-id">${value || '-'}</span>`
            },
            {
                field: 'thickness_mm',
                label: 'Kalınlık (mm)',
                sortable: true,
                width: '12%',
                type: 'number',
                formatter: (value) => value ? `${value} mm` : '-'
            },
            {
                field: 'dimensions',
                label: 'Boyutlar',
                sortable: true,
                width: '15%',
                formatter: (value) => value || '-'
            },
            {
                field: 'quantity',
                label: 'Adet',
                sortable: true,
                width: '10%',
                type: 'number',
                formatter: (value) => value ? `${value}` : '-'
            },
            {
                field: 'material',
                label: 'Malzeme',
                sortable: true,
                width: '15%',
                formatter: (value) => value || '-'
            }
        ],
        actions: [
            {
                key: 'select',
                label: 'Seç',
                icon: 'fas fa-check',
                class: 'btn-outline-success',
                title: 'Bu plakayı seç',
                onClick: (row) => {
                    selectedRemnantPlate = row;
                    updateSelectedRemnantDisplay();
                    updateSelectedRemnantDisplayEdit();
                    
                    // Close the selection modal
                    const modalElement = document.querySelector('#select-remnant-modal-container .modal');
                    if (modalElement) {
                        const modalInstance = bootstrap.Modal.getOrCreateInstance(modalElement);
                        if (modalInstance) {
                            modalInstance.hide();
                        }
                    }
                    
                    showNotification('Fire plaka seçildi', 'success');
                }
            }
        ],
        data: [],
        loading: false,
        sortable: true,
        pagination: true,
        itemsPerPage: 20,
        currentPage: 1,
        totalItems: 0,
        serverSidePagination: true,
        onPageChange: (page) => {
            loadRemnantSelectionTable(page);
        },
        onSort: (field, direction) => {
            remnantSelectionSortField = field;
            remnantSelectionSortDirection = direction;
            loadRemnantSelectionTable(1);
        },
        striped: false,
        small: false,
        emptyMessage: 'Fire plaka bulunamadı',
        emptyIcon: 'fas fa-layer-group'
    });
    
    // Don't load initial data - wait for filter Apply
}

let remnantSelectionPage = 1;
let remnantSelectionSortField = 'id';
let remnantSelectionSortDirection = 'asc';

async function loadRemnantSelectionTable(page = 1) {
    if (!remnantSelectionTable) return;
    
    remnantSelectionTable.setLoading(true);
    remnantSelectionPage = page;
    
    try {
        const params = buildRemnantSelectionQuery(page);
        const response = await getRemnantPlates(params);
        
        if (response && (Array.isArray(response) || (response.results && Array.isArray(response.results)))) {
            let remnants = [];
            let totalRemnants = 0;
            
            if (Array.isArray(response)) {
                remnants = response;
                totalRemnants = response.length;
            } else {
                remnants = response.results;
                totalRemnants = response.count ?? response.results.length;
            }
            
            remnantSelectionTable.setLoading(false);
            remnantSelectionTable.updateData(remnants, totalRemnants, page);
        } else {
            throw new Error('Failed to load remnants');
        }
    } catch (error) {
        console.error('Error loading remnant selection table:', error);
        showNotification('Fire plakalar yüklenirken hata oluştu', 'error');
        remnantSelectionTable.setLoading(false);
        remnantSelectionTable.updateData([], 0, 1);
    }
}

function buildRemnantSelectionQuery(page = 1) {
    const params = new URLSearchParams();
    
    params.append('page', String(page));
    params.append('page_size', '20');
    
    // Add ordering
    const orderingParam = remnantSelectionSortDirection === 'asc' ? remnantSelectionSortField : `-${remnantSelectionSortField}`;
    params.append('ordering', orderingParam);
    
    // Add filters from FiltersComponent
    if (remnantFilters) {
        const filterValues = remnantFilters.getFilterValues();
        const thickness = filterValues['remnant-thickness-mm-filter']?.toString().trim();
        const dimensions = filterValues['remnant-dimensions-filter']?.toString().trim();
        const material = filterValues['remnant-material-filter']?.toString().trim();
        
        if (thickness) params.append('thickness_mm', thickness);
        if (dimensions) params.append('dimensions', dimensions);
        if (material) params.append('material', material);
    }
    
    return params;
}

window.showAddPartModal = showAddPartModal;
window.showAddFileModal = showAddFileModal;

// File preview function using FileViewer component
window.previewFile = function(fileUrl, fileName, fileExtension) {
    // Create FileViewer instance
    const fileViewer = new FileViewer();
    
    // Set download callback with improved download handling
    fileViewer.setDownloadCallback(async () => {
        await fileViewer.downloadFile(fileUrl, fileName);
    });
    
    // Open file in viewer
    fileViewer.openFile(fileUrl, fileName, fileExtension);
};

// Global functions for onclick handlers
window.removePart = removePart;
