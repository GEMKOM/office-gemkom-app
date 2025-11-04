import { initNavbar } from '../../../components/navbar.js';
import { getRemnantPlates, createRemnantPlate, bulkCreateRemnantPlates } from '../../../apis/cnc_cutting/remnants.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
import { StatisticsCards } from '../../../components/statistics-cards/statistics-cards.js';
import { TableComponent } from '../../../components/table/table.js';
import { EditModal } from '../../../components/edit-modal/edit-modal.js';

// State management
let currentPage = 1;
let currentSortField = 'id';
let currentSortDirection = 'asc';
let remnants = [];
let totalRemnants = 0;
let isLoading = false;
let remnantsStats = null; // Statistics Cards component instance
let remnantsFilters = null; // Filters component instance
let remnantsTable = null; // Table component instance
let currentPageSize = 20; // Current page size for pagination
let createRemnantModal = null; // Create remnant modal instance
let bulkCreateRemnantsModal = null; // Bulk create remnants modal instance

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    await initNavbar();
    
    // Initialize header component
    const header = new HeaderComponent({
        title: 'Artık Plakalar',
        subtitle: 'CNC kesim artık plakaları yönetimi ve takibi',
        icon: 'layer-group',
        showBackButton: 'block',
        showCreateButton: 'block',
        showBulkCreateButton: 'block',
        showExportButton: 'none',
        showRefreshButton: 'none',
        createButtonText: 'Plaka Ekle',
        bulkCreateButtonText: 'Toplu Plaka Ekle',
        onBackClick: () => window.location.href = '/manufacturing/cnc-cutting/',
        onCreateClick: () => showCreateRemnantModal(),
        onBulkCreateClick: () => showBulkCreateRemnantsModal()
    });
    
    // Initialize Statistics Cards component
    remnantsStats = new StatisticsCards('remnants-statistics', {
        cards: [
            { title: 'Toplam Plaka', value: '0', icon: 'fas fa-layer-group', color: 'primary', id: 'total-remnants-count' },
            { title: 'Toplam Adet', value: '0', icon: 'fas fa-cubes', color: 'success', id: 'total-quantity-count' },
            { title: 'Atanmış', value: '0', icon: 'fas fa-user-check', color: 'info', id: 'assigned-remnants-count' },
            { title: 'Atanmamış', value: '0', icon: 'fas fa-user-times', color: 'warning', id: 'unassigned-remnants-count' }
        ],
        compact: true,
        animation: true
    });
    
    await initializeRemnants();
    setupEventListeners();
});

async function initializeRemnants() {
    initializeFiltersComponent();
    initializeTableComponent();
    // Set default filter value for assigned filter
    setTimeout(() => {
        if (remnantFilters && remnantFilters.dropdowns) {
            const assignedDropdown = remnantFilters.dropdowns.get('assigned-filter');
            if (assignedDropdown) {
                assignedDropdown.setValue('unassigned');
            }
        }
    }, 200);
    await loadRemnants(1);
}

function initializeFiltersComponent() {
    // Initialize filters component
    remnantsFilters = new FiltersComponent('filters-placeholder', {
        title: 'Plaka Filtreleri',
        onApply: (values) => {
            // Apply filters and reload remnants
            loadRemnants(1);
        },
        onClear: () => {
            // Clear filters and reload remnants
            loadRemnants(1);
            showNotification('Filtreler temizlendi', 'info');
        },
        onFilterChange: (filterId, value) => {
            // Optional: Handle individual filter changes
            console.log(`Filter ${filterId} changed to:`, value);
        }
    });

    remnantsFilters.addTextFilter({
        id: 'thickness-mm-filter',
        label: 'Kalınlık (mm)',
        placeholder: 'örn. 10',
        colSize: 2
    });

    remnantsFilters.addTextFilter({
        id: 'dimensions-filter',
        label: 'Boyutlar',
        placeholder: 'örn. 1200x800',
        colSize: 2
    });

    remnantsFilters.addTextFilter({
        id: 'material-filter',
        label: 'Malzeme',
        placeholder: 'Malzeme türü',
        colSize: 2
    });

    remnantsFilters.addDropdownFilter({
        id: 'assigned-filter',
        label: 'Atama Durumu',
        options: [
            { value: 'unassigned', label: 'Atanmamış' },
            { value: 'assigned', label: 'Atanmış' }
        ],
        placeholder: 'Atanmamış',
        value: 'unassigned', // Set default value
        colSize: 2
    });
}

function initializeTableComponent() {
    // Initialize table component
    remnantsTable = new TableComponent('remnants-table-container', {
        title: 'Artık Plakalar Listesi',
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
            },
            {
                field: 'task',
                label: 'Görev',
                sortable: false,
                width: '20%',
                formatter: (value, row) => {
                    // Try multiple possible field names for task
                    const task = value || row.task_key || row.cnc_task || row.related_task || row.task_id || '-';
                    return task;
                }
            }
        ],
        actions: [],
        data: [],
        loading: true, // Show skeleton loading immediately when page loads
        sortable: true,
        pagination: true,
        itemsPerPage: currentPageSize,
        currentPage: 1,
        totalItems: 0,
        serverSidePagination: true,
        onPageChange: (page) => {
            loadRemnants(page);
        },
        onPageSizeChange: (newSize) => {
            // Update local variable to keep in sync
            currentPageSize = newSize;
            // Ensure table component also has the correct value
            if (remnantsTable) {
                remnantsTable.options.itemsPerPage = newSize;
            }
            // Reset to page 1 and load with new page size
            currentPage = 1;
            loadRemnants(1);
        },
        onSort: (field, direction) => {
            currentSortField = field;
            currentSortDirection = direction;
            loadRemnants(1);
        },
        exportable: true,
        refreshable: true,
        onRefresh: () => {
            loadRemnants(currentPage);
        },
        striped: false,
        small: false,
        emptyMessage: 'Artık plaka bulunamadı',
        emptyIcon: 'fas fa-layer-group'
    });
}

async function loadRemnants(page = 1) {
    if (isLoading) return;
    
    isLoading = true;
    
    // Set loading state on table component for all loads
    if (remnantsTable) {
        remnantsTable.setLoading(true);
    }
    
    try {
        const params = buildRemnantQuery(page);
        const response = await getRemnantPlates(params);
        
        if (response && (Array.isArray(response) || (response.results && Array.isArray(response.results)))) {
            // Respect backend filtering/sorting/pagination
            if (Array.isArray(response)) {
                // Fallback: array response
                const itemsPerPage = currentPageSize;
                const startIndex = (page - 1) * itemsPerPage;
                const endIndex = startIndex + itemsPerPage;
                remnants = response.slice(startIndex, endIndex);
                totalRemnants = response.length;
                currentPage = page;
            } else {
                remnants = response.results;
                totalRemnants = response.count ?? response.results.length;
                currentPage = page;
            }

            if (remnantsTable) {
                remnantsTable.setLoading(false);
                remnantsTable.updateData(remnants, totalRemnants, currentPage);
            }

            updateRemnantCounts();
        } else {
            throw new Error('Failed to load remnants');
        }
    } catch (error) {
        console.error('Error loading remnants:', error);
        showNotification('Artık plakalar yüklenirken hata oluştu', 'error');
        remnants = [];
        totalRemnants = 0;
        
        // Update table component with empty data
        if (remnantsTable) {
            remnantsTable.setLoading(false);
            remnantsTable.updateData([], 0, 1);
        }
    } finally {
        isLoading = false;
    }
}

function buildRemnantQuery(page = 1) {
    const params = new URLSearchParams();
    
    // Get page size from table component if available, otherwise use local variable
    const pageSize = remnantsTable ? remnantsTable.options.itemsPerPage : currentPageSize;
    
    // Add pagination
    params.append('page', String(page));
    params.append('page_size', String(pageSize));
    
    // Add ordering
    const orderingParam = currentSortDirection === 'asc' ? currentSortField : `-${currentSortField}`;
    params.append('ordering', orderingParam);
    
    // Add backend-supported filters
    const filterValues = remnantsFilters ? remnantsFilters.getFilterValues() : {};
    const thickness = filterValues['thickness-mm-filter']?.toString().trim();
    const dimensions = filterValues['dimensions-filter']?.toString().trim();
    const material = filterValues['material-filter']?.toString().trim();
    // Default to 'unassigned' if filter is not set
    const assigned = filterValues['assigned-filter'] || 'unassigned';

    if (thickness) params.append('thickness_mm', thickness);
    if (dimensions) params.append('dimensions', dimensions);
    if (material) params.append('material', material);
    
    // Map assigned filter to unassigned parameter
    // Default is 'unassigned', so only send query param if 'assigned' is selected
    if (assigned === 'assigned') {
        params.append('unassigned', 'false');
    }
    // If 'unassigned' is selected (default), don't send any query param
    
    return params;
}

function updateRemnantCounts() {
    // Calculate counts
    const totalCount = totalRemnants;
    const totalQuantity = remnants.reduce((sum, r) => sum + (parseInt(r.quantity) || 0), 0);
    const assignedCount = remnants.filter(r => r.assigned_to).length;
    const unassignedCount = remnants.filter(r => !r.assigned_to).length;
    
    // Update statistics cards using the component
    if (remnantsStats) {
        remnantsStats.updateValues({
            0: totalCount.toString(),
            1: totalQuantity.toString(),
            2: assignedCount.toString(),
            3: unassignedCount.toString()
        });
    }
}

function showCreateRemnantModal() {
    // Create Edit Modal instance for creating new remnant
    createRemnantModal = new EditModal('create-remnant-modal-container', {
        title: 'Yeni Artık Plaka Ekle',
        icon: 'fas fa-plus-circle',
        saveButtonText: 'Plaka Oluştur',
        size: 'md'
    });
    
    // Set up the create remnant form
    createRemnantModal.addSection({
        id: 'remnant-info',
        title: 'Plaka Bilgileri',
        icon: 'fas fa-info-circle',
        iconColor: 'text-primary',
        fields: [
            {
                id: 'remnant-thickness',
                name: 'remnant-thickness',
                label: 'Kalınlık (mm)',
                type: 'number',
                required: true,
                placeholder: '10.00',
                step: '0.01',
                min: '0.01',
                colSize: 6,
                helpText: 'Plaka kalınlığı milimetre cinsinden'
            },
            {
                id: 'remnant-dimensions',
                name: 'remnant-dimensions',
                label: 'Boyutlar',
                type: 'text',
                required: true,
                placeholder: '1200x800',
                colSize: 6,
                helpText: 'Plaka boyutları (örn: 1200x800)'
            },
            {
                id: 'remnant-quantity',
                name: 'remnant-quantity',
                label: 'Adet',
                type: 'number',
                required: true,
                placeholder: '1',
                min: '1',
                step: '1',
                colSize: 6,
                helpText: 'Plaka adedi'
            },
            {
                id: 'remnant-material',
                name: 'remnant-material',
                label: 'Malzeme',
                type: 'text',
                required: true,
                placeholder: 'S235JR',
                colSize: 6,
                helpText: 'Malzeme türü'
            }
        ]
    });
    
    // Set up save callback
    createRemnantModal.onSaveCallback(async (formData) => {
        const remnantData = {
            thickness_mm: parseFloat(formData['remnant-thickness']).toFixed(2),
            dimensions: formData['remnant-dimensions'].trim(),
            quantity: parseInt(formData['remnant-quantity']),
            material: formData['remnant-material'].trim()
        };
        
        // Validate required fields
        if (!remnantData.thickness_mm || isNaN(parseFloat(remnantData.thickness_mm))) {
            showNotification('Kalınlık geçerli bir sayı olmalıdır', 'error');
            return;
        }
        
        if (!remnantData.dimensions || remnantData.dimensions.trim() === '') {
            showNotification('Boyutlar gereklidir', 'error');
            return;
        }
        
        if (!remnantData.quantity || isNaN(remnantData.quantity) || remnantData.quantity < 1) {
            showNotification('Adet geçerli bir sayı olmalıdır', 'error');
            return;
        }
        
        if (!remnantData.material || remnantData.material.trim() === '') {
            showNotification('Malzeme gereklidir', 'error');
            return;
        }
        
        try {
            await createRemnantPlate(remnantData);
            showNotification('Artık plaka başarıyla oluşturuldu', 'success');
            
            // Close modal
            const modalElement = document.querySelector('#create-remnant-modal-container .modal');
            if (modalElement) {
                const modalInstance = bootstrap.Modal.getOrCreateInstance(modalElement);
                if (modalInstance) {
                    modalInstance.hide();
                }
            }
            
            // Refresh the remnants table
            await loadRemnants(currentPage);
        } catch (error) {
            console.error('Error creating remnant plate:', error);
            showNotification('Plaka oluşturulurken hata oluştu', 'error');
        }
    });
    
    // Render and show the modal
    createRemnantModal.render();
    createRemnantModal.show();
}

function showBulkCreateRemnantsModal() {
    // Create Edit Modal instance for bulk creating remnants
    bulkCreateRemnantsModal = new EditModal('bulk-create-remnants-modal-container', {
        title: 'Toplu Artık Plaka Ekle',
        icon: 'fas fa-layer-group',
        saveButtonText: 'Plakaları Oluştur',
        size: 'lg'
    });
    
    // Set up the bulk create remnants form
    bulkCreateRemnantsModal.addSection({
        id: 'bulk-remnants-info',
        title: 'Toplu Plaka Bilgileri',
        icon: 'fas fa-info-circle',
        iconColor: 'text-primary',
        fields: [
            {
                id: 'bulk-remnants-data',
                name: 'bulk-remnants-data',
                label: 'Plaka Verileri',
                type: 'textarea',
                required: true,
                placeholder: 'Her satır bir plaka olacak şekilde verileri girin:\n2,5	290	660	1	BAKIR\n3	1500	660	5	GALVANİZ',
                rows: 10,
                colSize: 12,
                helpText: 'Format: Kalınlık(mm) [TAB] Genişlik(mm) [TAB] Yükseklik(mm) [TAB] Adet [TAB] Malzeme (her satır bir plaka, 5 alan, tab veya virgül ile ayrılmış). Not: Kalınlık için ondalık ayırıcı olarak nokta veya virgül kullanılabilir (örn: 2.5 veya 2,5)'
            }
        ]
    });
    
    // Add preview section as a custom section
    bulkCreateRemnantsModal.addSection({
        id: 'bulk-remnants-preview',
        title: 'Önizleme',
        icon: 'fas fa-eye',
        iconColor: 'text-info',
        fields: []  // Empty fields, we'll add custom HTML
    });
    
    // Render the modal first
    bulkCreateRemnantsModal.render();
    
    // Show the modal first
    bulkCreateRemnantsModal.show();
    
    // Add preview content after the modal is shown
    setTimeout(() => {
        const previewSection = bulkCreateRemnantsModal.container.querySelector('[data-section-id="bulk-remnants-preview"]');
        if (previewSection) {
            const fieldsContainer = previewSection.querySelector('.row.g-2');
            if (fieldsContainer) {
                fieldsContainer.innerHTML = `
                    <div class="col-12">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <span class="badge bg-info" id="bulk-preview-count">0 plaka</span>
                        </div>
                        <div id="bulk-remnants-preview-container" style="max-height: 300px; overflow-y: auto; border: 1px solid #dee2e6; border-radius: 0.375rem; padding: 1rem;">
                            <div class="text-center text-muted py-3">
                                <i class="fas fa-info-circle me-2"></i>
                                Veri giriş yaptığınızda önizleme burada görünecek
                            </div>
                        </div>
                    </div>
                `;
            }
        }
        
        // Add event listener to textarea for real-time preview
        const textarea = bulkCreateRemnantsModal.container.querySelector('#bulk-remnants-data');
        if (textarea) {
            textarea.addEventListener('input', () => {
                updateBulkPreview(textarea.value);
            });
            
            // Also trigger on paste event
            textarea.addEventListener('paste', () => {
                setTimeout(() => {
                    updateBulkPreview(textarea.value);
                }, 10);
            });
        }
    }, 300);
    
    // Set up save callback
    bulkCreateRemnantsModal.onSaveCallback(async (formData) => {
        const bulkData = formData['bulk-remnants-data']?.trim();
        
        if (!bulkData || bulkData === '') {
            showNotification('Plaka verileri gereklidir', 'error');
            return;
        }
        
        // Parse the bulk data using the shared function
        const { valid, invalid } = parseBulkData(bulkData);
        
        // Check for invalid rows
        if (invalid.length > 0) {
            const firstError = invalid[0];
            showNotification(`Satır ${firstError.lineNumber}: ${firstError.error}`, 'error');
            return;
        }
        
        if (valid.length === 0) {
            showNotification('Geçerli plaka verisi bulunamadı', 'error');
            return;
        }
        
        // Convert to API format
        const remnantsData = valid.map(item => ({
            thickness_mm: item.thickness_mm,
            dimensions: item.dimensions,
            quantity: item.quantity,
            material: item.material
        }));
        
        try {
            await bulkCreateRemnantPlates(remnantsData);
            showNotification(`${remnantsData.length} adet artık plaka başarıyla oluşturuldu`, 'success');
            
            // Close modal
            const modalElement = document.querySelector('#bulk-create-remnants-modal-container .modal');
            if (modalElement) {
                const modalInstance = bootstrap.Modal.getOrCreateInstance(modalElement);
                if (modalInstance) {
                    modalInstance.hide();
                }
            }
            
            // Refresh the remnants table
            await loadRemnants(currentPage);
        } catch (error) {
            console.error('Error bulk creating remnant plates:', error);
            showNotification('Plakalar oluşturulurken hata oluştu', 'error');
        }
    });
}

function parseBulkData(bulkData) {
    if (!bulkData || bulkData.trim() === '') {
        return { valid: [], invalid: [] };
    }
    
    const lines = bulkData.split('\n').filter(line => line.trim() !== '');
    const valid = [];
    const invalid = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Skip empty lines
        if (line === '') {
            continue;
        }
        
        // Split by tab first (most common), then by comma as fallback
        let parts = line.split('\t').map(p => p.trim());
        if (parts.length < 5) {
            // Try comma separation
            parts = line.split(',').map(p => p.trim());
        }
        
        if (parts.length < 5) {
            // Check if it's the old format (4 fields: thickness, dimensions, quantity, material)
            if (parts.length === 4) {
                // Try old format
                const thicknessStr = parts[0].replace(',', '.');
                const thickness = parseFloat(thicknessStr);
                const dimensions = parts[1];
                const quantity = parseInt(parts[2]);
                const material = parts[3];
                
                let error = null;
                
                if (isNaN(thickness) || thickness <= 0) {
                    error = 'Geçersiz kalınlık değeri';
                } else if (!dimensions || dimensions.trim() === '') {
                    error = 'Boyutlar gereklidir';
                } else if (isNaN(quantity) || quantity < 0) {
                    error = 'Geçersiz adet değeri';
                } else if (!material || material.trim() === '') {
                    error = 'Malzeme gereklidir';
                }
                
                if (error) {
                    invalid.push({
                        lineNumber: i + 1,
                        line: line,
                        error: error
                    });
                } else {
                    valid.push({
                        lineNumber: i + 1,
                        thickness_mm: thickness.toFixed(2),
                        dimensions: dimensions,
                        quantity: quantity,
                        material: material
                    });
                }
                continue;
            }
            
            invalid.push({
                lineNumber: i + 1,
                line: line,
                error: 'Yeterli veri yok (5 alan gerekli: Kalınlık, Genişlik, Yükseklik, Adet, Malzeme)'
            });
            continue;
        }
        
        // New format: thickness, width, height, quantity, material
        const thicknessStr = parts[0].replace(',', '.'); // Handle comma as decimal separator
        const thickness = parseFloat(thicknessStr);
        const width = parts[1];
        const height = parts[2];
        const quantityStr = parts[3];
        const material = parts[4];
        
        let error = null;
        
        // Handle special thickness formats like "20+8" (skip for now, treat as invalid)
        if (thicknessStr.includes('+')) {
            error = 'Bileşik kalınlık formatı desteklenmiyor (örn: 20+8)';
        } else if (isNaN(thickness) || thickness <= 0) {
            error = 'Geçersiz kalınlık değeri';
        } else if (!width || width.trim() === '' || isNaN(parseFloat(width))) {
            error = 'Geçersiz genişlik değeri';
        } else if (!height || height.trim() === '' || isNaN(parseFloat(height))) {
            error = 'Geçersiz yükseklik değeri';
        } else if (!quantityStr || quantityStr.trim() === '' || isNaN(parseInt(quantityStr)) || parseInt(quantityStr) < 0) {
            error = 'Geçersiz adet değeri';
        } else if (!material || material.trim() === '') {
            error = 'Malzeme gereklidir';
        }
        
        if (error) {
            invalid.push({
                lineNumber: i + 1,
                line: line,
                error: error
            });
        } else {
            const quantity = parseInt(quantityStr);
            // Combine width and height into dimensions format
            const dimensions = `${width}x${height}`;
            
            valid.push({
                lineNumber: i + 1,
                thickness_mm: thickness.toFixed(2),
                dimensions: dimensions,
                quantity: quantity,
                material: material
            });
        }
    }
    
    return { valid, invalid };
}

function updateBulkPreview(bulkData) {
    const previewContainer = document.getElementById('bulk-remnants-preview-container');
    const countBadge = document.getElementById('bulk-preview-count');
    
    if (!previewContainer || !countBadge) return;
    
    const { valid, invalid } = parseBulkData(bulkData);
    const totalCount = valid.length;
    
    // Update count badge
    countBadge.textContent = `${totalCount} plaka`;
    countBadge.className = totalCount > 0 ? 'badge bg-success' : 'badge bg-info';
    
    if (totalCount === 0 && invalid.length === 0) {
        previewContainer.innerHTML = `
            <div class="text-center text-muted py-3">
                <i class="fas fa-info-circle me-2"></i>
                Veri giriş yaptığınızda önizleme burada görünecek
            </div>
        `;
        return;
    }
    
    let html = '';
    
    if (valid.length > 0) {
        html += `
            <div class="table-responsive">
                <table class="table table-sm table-bordered table-hover mb-3">
                    <thead class="table-light">
                        <tr>
                            <th style="width: 5%;">#</th>
                            <th style="width: 15%;">Kalınlık (mm)</th>
                            <th style="width: 20%;">Boyutlar</th>
                            <th style="width: 10%;">Adet</th>
                            <th style="width: 20%;">Malzeme</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        valid.forEach((item, index) => {
            html += `
                <tr>
                    <td>${item.lineNumber}</td>
                    <td>${item.thickness_mm}</td>
                    <td>${item.dimensions}</td>
                    <td>${item.quantity}</td>
                    <td>${item.material}</td>
                </tr>
            `;
        });
        
        html += `
                    </tbody>
                </table>
            </div>
        `;
    }
    
    if (invalid.length > 0) {
        html += `
            <div class="alert alert-warning mb-0">
                <h6 class="alert-heading">
                    <i class="fas fa-exclamation-triangle me-2"></i>
                    Hatalı Satırlar (${invalid.length})
                </h6>
                <ul class="mb-0 small">
        `;
        
        invalid.forEach(item => {
            html += `
                <li>
                    <strong>Satır ${item.lineNumber}:</strong> ${item.error}
                    <br><code class="text-muted">${item.line}</code>
                </li>
            `;
        });
        
        html += `
                </ul>
            </div>
        `;
    }
    
    previewContainer.innerHTML = html;
}

function setupEventListeners() {
    // Add any additional event listeners if needed
}

// Helper function to show notifications (if available in the global scope)
function showNotification(message, type = 'info') {
    if (typeof window.showNotification === 'function') {
        window.showNotification(message, type);
    } else {
        console.log(`[${type.toUpperCase()}] ${message}`);
    }
}

