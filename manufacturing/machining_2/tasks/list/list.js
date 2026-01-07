import { initNavbar } from '../../../../components/navbar.js';
import { getParts, updatePart, deletePart, createPart, updatePartOperations } from '../../../../apis/machining/parts.js';
import { getOperations } from '../../../../apis/machining/operations.js';
import { fetchMachines } from '../../../../apis/machines.js';
import { HeaderComponent } from '../../../../components/header/header.js';
import { FiltersComponent } from '../../../../components/filters/filters.js';
import { StatisticsCards } from '../../../../components/statistics-cards/statistics-cards.js';
import { DisplayModal } from '../../../../components/display-modal/display-modal.js';
import { TableComponent } from '../../../../components/table/table.js';

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
        onBackClick: () => window.location.href = '/manufacturing/machining_2/tasks/',
        onCreateClick: () => showCreatePartModal()
    });
    
    // Initialize Statistics Cards component
    partsStats = new StatisticsCards('parts-statistics', {
        cards: [
            { title: 'Tüm Parçalar', value: '0', icon: 'fas fa-list', color: 'primary', id: 'all-parts-count' },
            { title: 'Tamamlanan', value: '0', icon: 'fas fa-check', color: 'success', id: 'completed-parts-count' },
            { title: 'Devam Eden', value: '0', icon: 'fas fa-clock', color: 'warning', id: 'incomplete-parts-count' }
        ],
        compact: true,
        animation: true
    });
    
    setupEventListeners();
    await initializeParts();
});

async function initializeParts() {
    try {
        initializeFiltersComponent();
        initializeTableComponent();
        await loadMachines();
        await loadParts();
        updatePartCounts();
    } catch (error) {
        console.error('Error initializing parts:', error);
        showNotification('Parçalar yüklenirken hata oluştu', 'error');
    }
}

async function loadMachines() {
    try {
        const machinesResponse = await fetchMachines(1, 100, { used_in: 'machining' });
        machines = machinesResponse.results || machinesResponse || [];
        
        // Populate modal machine dropdowns
        populateModalMachineDropdowns();
    } catch (error) {
        console.error('Error loading machines:', error);
        machines = [];
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
                formatter: (value) => `<span class="part-key">${value || '-'}</span>`
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
                sortable: true,
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
                sortable: true,
                width: '10%',
                formatter: (value) => value || '-'
            },
            {
                field: 'position_no',
                label: 'Poz No',
                sortable: true,
                width: '10%',
                formatter: (value) => value || '-'
            },
            {
                field: 'quantity',
                label: 'Adet',
                sortable: true,
                width: '8%',
                type: 'number',
                formatter: (value) => `<span class="quantity-badge">${value || 0}</span>`
            },
            {
                field: 'material',
                label: 'Malzeme',
                sortable: true,
                width: '9%',
                formatter: (value) => value || '-'
            },
            {
                field: 'weight_kg',
                label: 'Ağırlık (kg)',
                sortable: true,
                width: '9%',
                formatter: (value) => value ? `${parseFloat(value).toFixed(3)} kg` : '-'
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
                icon: 'fas fa-eye',
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
        editableColumns: ['name', 'description', 'job_no', 'image_no', 'position_no', 'quantity', 'material', 'finish_time'],
        onEdit: async (row, field, newValue, oldValue) => {
            try {
                // Check if value actually changed
                let normalizedOld = oldValue;
                let normalizedNew = newValue;
                
                // For numeric fields, convert to numbers for comparison
                if (field === 'quantity') {
                    normalizedOld = parseFloat(oldValue) || 0;
                    normalizedNew = parseFloat(newValue) || 0;
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
                updateData[field] = newValue;
                
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
        
        updatePartCounts();
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
    const jobNoFilter = filterValues['job-no-filter']?.trim();
    const statusFilter = filterValues['status-filter'] || '';
    
    if (keyFilter) {
        let key = keyFilter;
        if (/^\d+$/.test(key)) {
            key = 'PT-' + key;
        }
        // Note: The API might need a different filter name, adjust as needed
    }
    
    if (nameFilter) filters.name = nameFilter;
    if (jobNoFilter) filters.job_no = jobNoFilter;
    
    // Add status filter
    if (statusFilter === 'completed') {
        filters.completion_date = 'not_null'; // This might need adjustment based on API
    } else if (statusFilter === 'incomplete') {
        filters.completion_date = 'null'; // This might need adjustment based on API
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

function updatePartCounts() {
    // Calculate counts from current data
    const allCount = totalParts;
    const completedCount = parts.filter(p => p.completion_date).length;
    const incompleteCount = parts.filter(p => !p.completion_date).length;
    
    // Update statistics cards using the component
    if (partsStats) {
        partsStats.updateValues({
            0: allCount.toString(),
            1: completedCount.toString(),
            2: incompleteCount.toString()
        });
    }
}

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
            showNotification('Parça başarıyla oluşturuldu', 'success');
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
                            <th style="width: 6%;">Sıra</th>
                            <th style="width: 18%;">Operasyon Adı</th>
                            <th style="width: 15%;">Açıklama</th>
                            <th style="width: 12%;">Makine</th>
                            <th style="width: 10%;">Tahmini Saat</th>
                            <th style="width: 10%;">Harcanan Saat</th>
                            <th style="width: 8%;">Değiştirilebilir</th>
                            <th style="width: 8%;">Durum</th>
                            <th style="width: 8%;">İşlem</th>
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
            });
        } else {
            // Populate machine dropdowns in existing rows
            populateMachineDropdownsInTable();
        }
    }, 100);
}

function populateMachineDropdownsInTable() {
    const tbody = document.getElementById('operations-detail-table-body');
    if (!tbody || machines.length === 0) return;
    
    const machineSelects = tbody.querySelectorAll('.operation-machine');
    machineSelects.forEach(select => {
        // Only update if it's empty or has default option
        if (select.options.length <= 1) {
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
    if (isCompleted) {
        statusHtml = '<span class="status-badge status-green">Tamamlandı</span>';
        isReadOnly = true;
    } else if (hoursSpent > 0) {
        statusHtml = '<span class="status-badge status-yellow">Çalışıldı</span>';
    } else {
        statusHtml = '<span class="status-badge status-grey">Bekliyor</span>';
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
    
    // Build machine options HTML
    const machineOptionsHtml = machines.map(m => {
        const selected = operation.machine_fk == m.id ? 'selected' : '';
        return `<option value="${m.id}" ${selected}>${escapeHtml(m.name)}</option>`;
    }).join('');
    
    return `
        <tr data-operation-key="${operation.key || ''}" data-is-new="${isNew}" data-row-id="${rowId}">
            <td>
                <input type="number" class="form-control form-control-sm operation-order" value="${orderValue}" min="1" ${isReadOnly ? 'readonly' : ''}>
            </td>
            <td>
                <input type="text" class="form-control form-control-sm operation-name" value="${nameValue}" ${isReadOnly ? 'readonly' : ''}>
            </td>
            <td>
                <textarea class="form-control form-control-sm operation-description" rows="1" ${isReadOnly ? 'readonly' : ''}>${descValue}</textarea>
            </td>
            <td>
                <select class="form-control form-control-sm operation-machine" ${isReadOnly ? 'disabled' : ''}>
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
                    <input class="form-check-input operation-interchangeable" type="checkbox" ${operation.interchangeable ? 'checked' : ''} ${isReadOnly ? 'disabled' : ''}>
                </div>
            </td>
            <td class="text-center">
                ${statusHtml}
            </td>
            <td class="text-center">
                ${!isReadOnly ? `
                    <button type="button" class="btn btn-sm btn-outline-danger remove-operation-row-btn" title="Kaldır">
                        <i class="fas fa-trash"></i>
                    </button>
                ` : '-'}
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
    
    // Add event listeners for order changes to re-sort rows
    setupOrderChangeListeners();
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
    const orderInput = newRow.querySelector('.operation-order');
    const nameInput = newRow.querySelector('.operation-name');
    const descTextarea = newRow.querySelector('.operation-description');
    const hoursInput = newRow.querySelector('.operation-estimated-hours');
    const interchangeableCheckbox = newRow.querySelector('.operation-interchangeable');
    
    if (orderInput) {
        orderInput.removeAttribute('readonly');
        orderInput.readOnly = false;
    }
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
    
    // Setup event listener for remove button
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
    
    return notification;
}

