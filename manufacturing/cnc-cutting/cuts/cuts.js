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
    validateCncPartData 
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

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    await initNavbar();
    
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
    setupUrlHandlers();
});

// Listen for file viewer close event to re-initialize page
window.addEventListener('fileViewerClosed', () => {
    // Re-initialize everything after file viewer closes
    setTimeout(() => {
        initializeCuts();
        setupEventListeners();
        setupUrlHandlers();
        
        // Re-initialize header component
        const header = new HeaderComponent({
            title: 'CNC Kesim Kesimler',
            subtitle: 'CNC kesim görevleri yönetimi ve takibi',
            icon: 'cut',
            showBackButton: 'block',
            showCreateButton: 'block',
            showBulkCreateButton: 'none',
            showExportButton: 'none',
            showRefreshButton: 'none',
            createButtonText: 'Yeni Kesim',
            onBackClick: () => window.location.href = '/manufacturing/cnc-cutting/',
            onCreateClick: () => showCreateCutModal(),
            buttons: [
                {
                    text: 'Yeni Kesim',
                    icon: 'fas fa-plus',
                    class: 'btn-primary',
                    onClick: () => showCreateCutModal()
                }
            ],
            compact: true,
            animation: true
        });
    }, 100);
});

async function initializeCuts() {
    try {
        initializeFiltersComponent();
        initializeTableComponent();
        await loadMachines();
        
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
        
        // Update machine filter options if filters component is initialized
        if (cutsFilters) {
            const machineOptions = [
                { value: '', label: 'Tüm Makineler' },
                ...machines.map(machine => ({ value: machine.id.toString(), label: machine.name }))
            ];
            cutsFilters.updateFilterOptions('machine-name-filter', machineOptions);
        }
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

    // Add text filters
    cutsFilters.addTextFilter({
        id: 'key-filter',
        label: 'Kesim No',
        placeholder: 'CNC-001',
        colSize: 2
    });

    cutsFilters.addTextFilter({
        id: 'name-filter',
        label: 'Kesim Adı',
        placeholder: 'Kesim adı',
        colSize: 2
    });

    cutsFilters.addTextFilter({
        id: 'nesting-id-filter',
        label: 'Nesting ID',
        placeholder: 'Nesting ID',
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
                field: 'name',
                label: 'Ad',
                sortable: true,
                width: '15%',
                formatter: (value, row) => {
                    const description = row.description ? `<br><small class="text-muted">${row.description}</small>` : '';
                    return `<div class="cut-name"><strong>${value || '-'}</strong>${description}</div>`;
                }
            },
            {
                field: 'nesting_id',
                label: 'Nesting ID',
                sortable: true,
                width: '10%',
                formatter: (value) => value || '-'
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
                field: 'nesting_file_url',
                label: 'Nesting Dosyası',
                sortable: false,
                width: '10%',
                formatter: (value, row) => {
                    if (value) {
                        return `<a href="${value}" target="_blank" class="btn btn-sm btn-outline-primary">
                            <i class="fas fa-download"></i> İndir
                        </a>`;
                    }
                    return '-';
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
                    // Status based on completion_date
                    if (row.completion_date) {
                        return '<span class="status-badge status-green">Tamamlandı</span>';
                    } else {
                        return '<span class="status-badge status-yellow">Bekliyor</span>';
                    }
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
                onClick: (row) => showCutDetails(row)
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
        itemsPerPage: 20,
        currentPage: 1,
        totalItems: 0,
        serverSidePagination: true,
        onPageChange: (page) => {
            loadCuts(page);
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

// Handle URL parameters for filtering
function handleUrlParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const filterParam = urlParams.get('filter');
    const cutParam = urlParams.get('cut');
    
    // Handle cut parameter to open modal
    if (cutParam) {
        // Open the cut details modal with the specified cut key
        showCutDetails(cutParam);
        return true; // Indicate that a parameter was handled
    }
    
    if (filterParam && cutsFilters) {
        // Set the key filter with the provided value
        cutsFilters.setFilterValues({ 'key-filter': filterParam });
        
        // Show a notification that the page is filtered
        showNotification(`"${filterParam}" için filtrelenmiş sonuçlar gösteriliyor`, 'info');
        
        // Automatically apply the filter
        return true; // Indicate that a filter was applied
    }
    
    return false; // No parameter was applied
}

async function loadCuts(page = 1) {
    if (isLoading) return;
    
    isLoading = true;
    
    // Set loading state on table component for all loads
    if (cutsTable) {
        cutsTable.setLoading(true);
    }
    
    try {
        const queryParams = buildCutQuery(page);
        const response = await getCncTasks();
        
        if (response && (Array.isArray(response) || (response.results && Array.isArray(response.results)))) {
            // Handle both direct array response and paginated response
            let allCuts = Array.isArray(response) ? response : response.results;
            
            // Apply client-side filtering since the API doesn't support query parameters yet
            let filteredCuts = allCuts;
            
            // Get filter values from the filters component
            const filterValues = cutsFilters ? cutsFilters.getFilterValues() : {};
            
            // Apply filters
            const keyFilter = filterValues['key-filter']?.trim();
            const nameFilter = filterValues['name-filter']?.trim();
            const nestingIdFilter = filterValues['nesting-id-filter']?.trim();
            const materialFilter = filterValues['material-filter']?.trim();
            const machineNameFilter = filterValues['machine-name-filter']?.trim();
            const statusFilter = filterValues['status-filter'] || '';
            
            if (keyFilter) {
                filteredCuts = filteredCuts.filter(cut => 
                    cut.key && cut.key.toLowerCase().includes(keyFilter.toLowerCase())
                );
            }
            
            if (nameFilter) {
                filteredCuts = filteredCuts.filter(cut => 
                    cut.name && cut.name.toLowerCase().includes(nameFilter.toLowerCase())
                );
            }
            
            if (nestingIdFilter) {
                filteredCuts = filteredCuts.filter(cut => 
                    cut.nesting_id && cut.nesting_id.toLowerCase().includes(nestingIdFilter.toLowerCase())
                );
            }
            
            if (materialFilter) {
                filteredCuts = filteredCuts.filter(cut => 
                    cut.material && cut.material.toLowerCase().includes(materialFilter.toLowerCase())
                );
            }
            
            if (machineNameFilter) {
                filteredCuts = filteredCuts.filter(cut => 
                    cut.machine_fk && cut.machine_fk.toString() === machineNameFilter
                );
            }
            
            if (statusFilter) {
                if (statusFilter === 'completed') {
                    filteredCuts = filteredCuts.filter(cut => cut.completion_date);
                } else if (statusFilter === 'pending') {
                    filteredCuts = filteredCuts.filter(cut => !cut.completion_date);
                }
            }
            
            // Apply sorting
            if (currentSortField) {
                filteredCuts.sort((a, b) => {
                    let aVal = a[currentSortField];
                    let bVal = b[currentSortField];
                    
                    // Handle null/undefined values
                    if (aVal == null) aVal = '';
                    if (bVal == null) bVal = '';
                    
                    // Convert to string for comparison
                    aVal = aVal.toString().toLowerCase();
                    bVal = bVal.toString().toLowerCase();
                    
                    if (currentSortDirection === 'asc') {
                        return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
                    } else {
                        return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
                    }
                });
            }
            
            // Apply pagination
            const itemsPerPage = 20;
            const startIndex = (page - 1) * itemsPerPage;
            const endIndex = startIndex + itemsPerPage;
            const paginatedCuts = filteredCuts.slice(startIndex, endIndex);
            
            cuts = paginatedCuts;
            totalCuts = filteredCuts.length;
            currentPage = page;
            
            // Update total count from API response if available
            if (response.count !== undefined) {
                totalCuts = response.count;
            }
            
            // Update table component with new data
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
    
    // Add pagination
    params.append('page', page);
    params.append('page_size', '20');
    
    // Add ordering
    const orderingParam = currentSortDirection === 'asc' ? currentSortField : `-${currentSortField}`;
    params.append('ordering', orderingParam);
    
    return `?${params.toString()}`;
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
    // Handle browser back/forward navigation
    window.addEventListener('popstate', (event) => {
        const urlParams = new URLSearchParams(window.location.search);
        const cutParam = urlParams.get('cut');
        
        if (cutParam) {
            // Open modal if cut parameter is present
            showCutDetails(cutParam);
        } else {
            // Close any open modals if no cut parameter
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
        }
    });
}


// Global variable to store the current edit modal instance

// Global functions for table actions
window.showCutDetails = async function(cutKey) {
    try {
        // Update URL to include cut key parameter
        const url = new URL(window.location);
        url.searchParams.set('cut', cutKey);
        window.history.pushState({ cut: cutKey }, '', url);
        
        // Fetch cut data from API
        const cut = await getCncTask(cutKey);
        
        if (cut) {
            showCutDetailsModal(cut);
        } else {
            showNotification('Kesim bulunamadı', 'error');
        }
    } catch (error) {
        console.error('Error showing cut details:', error);
        showNotification('Kesim detayları gösterilirken hata oluştu', 'error');
    }
};

window.editCut = async function(cutKey) {
    try {
        const cut = await getCncTask(cutKey);
        
        if (cut) {
            showEditCutModal(cut);
        } else {
            showNotification('Kesim bulunamadı', 'error');
        }
    } catch (error) {
        console.error('Error editing cut:', error);
        showNotification('Kesim düzenlenirken hata oluştu', 'error');
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
                        </tr>
                    </thead>
                    <tbody>
                        ${cut.parts.map(part => `
                            <tr>
                                <td>${part.job_no || '-'}</td>
                                <td>${part.image_no || '-'}</td>
                                <td>${part.position_no || '-'}</td>
                                <td>${part.weight_kg || '-'}</td>
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
    // Add basic information section
    createCutModal.addSection({
        id: 'basic-info',
        title: 'Temel Bilgiler',
        icon: 'fas fa-info-circle',
        iconColor: 'text-primary',
        fields: [
            {
                id: 'cut-name',
                label: 'Kesim Adı',
                type: 'text',
                required: true,
                placeholder: 'Kesim adını girin',
                colSize: 6,
                helpText: 'Kesimi tanımlayan açıklayıcı isim'
            },
            {
                id: 'cut-nesting-id',
                label: 'Nesting ID',
                type: 'text',
                required: true,
                placeholder: 'Nesting ID girin',
                colSize: 6,
                helpText: 'Nesting dosyası ID\'si'
            },
            {
                id: 'cut-material',
                label: 'Malzeme',
                type: 'text',
                required: true,
                placeholder: 'Malzeme türü',
                colSize: 6,
                helpText: 'Kesilecek malzeme türü'
            },
            {
                id: 'cut-dimensions',
                label: 'Boyutlar',
                type: 'text',
                required: true,
                placeholder: '100x50x10',
                colSize: 6,
                helpText: 'Malzeme boyutları (örn: 100x50x10)'
            },
            {
                id: 'cut-thickness',
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
        title: 'Parça Bilgileri',
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
    
    // Add parts table inside the Parça Bilgileri section
    const partsHtml = `
        <div class="d-flex justify-content-between align-items-center mb-2">
            <h6 class="mb-0">Parça Listesi</h6>
            <button type="button" class="btn btn-sm btn-outline-primary" id="add-part-btn">
                <i class="fas fa-plus me-1"></i>Parça Ekle
            </button>
        </div>
        <div class="row g-2 mb-2">
            <div class="col-md-3">
                <small class="text-muted fw-bold">
                    <i class="fas fa-hashtag me-1"></i>İş No
                </small>
            </div>
            <div class="col-md-3">
                <small class="text-muted fw-bold">
                    <i class="fas fa-image me-1"></i>Resim No
                </small>
            </div>
            <div class="col-md-3">
                <small class="text-muted fw-bold">
                    <i class="fas fa-map-marker-alt me-1"></i>Pozisyon No
                </small>
            </div>
            <div class="col-md-2">
                <small class="text-muted fw-bold">
                    <i class="fas fa-weight me-1"></i>Ağırlık (kg)
                </small>
            </div>
            <div class="col-md-1">
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
    
    // Add initial part
    setTimeout(() => {
        addPart();
    }, 100);
}

async function handleCreateCutSave(formData) {
    // Get the actual file objects from the file input
    const fileInput = createCutModal.container.querySelector('input[type="file"]');
    const uploadedFiles = fileInput ? Array.from(fileInput.files) : [];
    
    // Log file information for debugging
    if (uploadedFiles.length > 0) {
        console.log(`Selected ${uploadedFiles.length} files:`, uploadedFiles.map(f => f.name));
    }
    
    const cutData = {
        name: formData['cut-name'],
        nesting_id: formData['cut-nesting-id'],
        material: formData['cut-material'],
        dimensions: formData['cut-dimensions'],
        thickness_mm: parseFloat(formData['cut-thickness']) || 0,
        machine_fk: formData['cut-machine-fk'] ? parseInt(formData['cut-machine-fk']) : null,
        files: uploadedFiles,
        parts_data: []
    };
    
    // Collect parts data from dynamic rows
    const partRows = document.querySelectorAll('.part-row');
    for (const row of partRows) {
        const jobNo = row.querySelector('input[name="job_no"]')?.value?.trim();
        const imageNo = row.querySelector('input[name="image_no"]')?.value?.trim();
        const positionNo = row.querySelector('input[name="position_no"]')?.value?.trim();
        const weight = row.querySelector('input[name="weight"]')?.value?.trim();
        
        // Only add part if at least one field has data
        if (jobNo || imageNo || positionNo || weight) {
            cutData.parts_data.push({
                job_no: jobNo || '',
                image_no: imageNo || '',
                position_no: positionNo || '',
                weight_kg: parseFloat(weight) || 0
            });
        }
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
}

async function setupEditCutForm(editCutModal, cut) {
    // Store current task for parts and files operations
    currentEditTask = cut;
    
    // Add basic information section
    editCutModal.addSection({
        id: 'basic-info',
        title: 'Temel Bilgiler',
        icon: 'fas fa-info-circle',
        iconColor: 'text-primary',
        fields: [
            {
                id: 'cut-name',
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
                label: 'Makine',
                type: 'dropdown',
                required: false,
                placeholder: 'Makine seçin...',
                value: cut.machine_fk || '',
                options: [
                    { value: '', label: 'Makine seçin...' },
                    ...machines.map(machine => ({ 
                        value: machine.id.toString(), 
                        label: machine.name 
                    }))
                ],
                colSize: 6,
                helpText: 'Kesim makinesi seçin'
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
    
    // Add a small delay to ensure DOM is ready, then add table containers
    setTimeout(() => {
        addTableContainers();
        
        // Initialize tables after containers are added
        initializePartsTable(cut);
        initializeFilesTable(cut);
    }, 100);
}

function addTableContainers() {
    // Add parts table section
    const partsSectionHtml = `
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
                width: '20%',
                formatter: (value) => value || '-'
            },
            {
                field: 'image_no',
                label: 'Resim No',
                sortable: true,
                width: '20%',
                formatter: (value) => value || '-'
            },
            {
                field: 'position_no',
                label: 'Pozisyon No',
                sortable: true,
                width: '20%',
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
                field: 'actions',
                label: 'İşlemler',
                sortable: false,
                width: '20%',
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
                }
            ]
        });
        
        editPartModal.onSaveCallback(async (formData) => {
            const updateData = {
                job_no: formData['part-job-no'],
                image_no: formData['part-image-no'],
                position_no: formData['part-position-no'],
                weight_kg: formData['part-weight']
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
            }
        ]
    });
    
    addPartModal.onSaveCallback(async (formData) => {
        const partData = {
            cnc_task: currentEditTask.key,
            job_no: formData['part-job-no'],
            image_no: formData['part-image-no'],
            position_no: formData['part-position-no'],
            weight_kg: formData['part-weight']
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
    // Get the actual file objects from the file input
    const fileInput = editCutModal.container.querySelector('input[type="file"]');
    const uploadedFiles = fileInput ? Array.from(fileInput.files) : [];
    
    const cutData = {
        name: formData['cut-name'],
        nesting_id: formData['cut-nesting-id'],
        material: formData['cut-material'],
        dimensions: formData['cut-dimensions'],
        thickness_mm: parseFloat(formData['cut-thickness']) || 0,
        machine_fk: formData['cut-machine-fk'] ? parseInt(formData['cut-machine-fk']) : null
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
                <div class="col-md-3">
                    <input type="text" class="form-control form-control-sm" name="job_no" placeholder="İş numarası">
                </div>
                <div class="col-md-3">
                    <input type="text" class="form-control form-control-sm" name="image_no" placeholder="Resim numarası">
                </div>
                <div class="col-md-3">
                    <input type="text" class="form-control form-control-sm" name="position_no" placeholder="Pozisyon numarası">
                </div>
                <div class="col-md-2">
                    <input type="number" class="form-control form-control-sm" name="weight" step="0.01" min="0" placeholder="0.00">
                </div>
                <div class="col-md-1">
                    <button type="button" class="btn btn-outline-danger btn-sm w-100" onclick="removePart(${partIndex})" title="Parçayı Kaldır">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
    
    container.insertAdjacentHTML('beforeend', partHtml);
}

// Remove part
function removePart(index) {
    const partRow = document.querySelector(`.part-row[data-index="${index}"]`);
    if (partRow) {
        // Don't remove if it's the only part
        const container = document.getElementById('parts-container');
        if (container.children.length > 1) {
            partRow.remove();
        } else {
            showNotification('En az bir parça olmalıdır.', 'error');
        }
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
                width: '25%',
                formatter: (value) => value ? `${value} kg` : '-'
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
