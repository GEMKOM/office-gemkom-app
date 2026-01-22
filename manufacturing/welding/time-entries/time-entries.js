import { initNavbar } from '../../../../components/navbar.js';
import { HeaderComponent } from '../../../../components/header/header.js';
import { FiltersComponent } from '../../../../components/filters/filters.js';
import { TableComponent } from '../../../../components/table/table.js';
import { EditModal } from '../../../../components/edit-modal/edit-modal.js';
import { ConfirmationModal } from '../../../../components/confirmation-modal/confirmation-modal.js';
import { 
    fetchWeldingTimeEntries, 
    createWeldingTimeEntry, 
    updateWeldingTimeEntry, 
    deleteWeldingTimeEntry,
    bulkCreateWeldingTimeEntries
} from '../../../../apis/welding/crud.js';
import { authFetchUsers } from '../../../../apis/users.js';
import { showNotification } from '../../../../components/notification/notification.js';

// State management
let currentPage = 1;
let currentSortField = 'date';
let currentSortDirection = 'desc';
let timeEntries = [];
let totalEntries = 0;
let isLoading = false;
let timeEntriesFilters = null;
let timeEntriesTable = null;
let users = [];
let editTimeEntryModal = null;
let deleteTimeEntryModal = null;

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    await initNavbar();
    
    // Initialize header component
    const header = new HeaderComponent({
        title: 'Kaynak Zaman Kayıtları',
        subtitle: 'Kaynak zaman kayıtlarını görüntüleyin ve yönetin',
        icon: 'clock',
        showBackButton: 'block',
        showBulkCreateButton: 'block',
        bulkCreateButtonText: 'Toplu Oluştur',
        onBackClick: () => window.location.href = '/manufacturing/welding/',
        onBulkCreateClick: () => showBulkCreateModal()
    });
    
    await loadUsers();
    initializeFiltersComponent();
    initializeTableComponent();
    initializeEditModal();
    initializeDeleteModal();
    await loadTimeEntries();
});

async function loadUsers() {
    try {
        const response = await authFetchUsers(1, 10000, { 
            team: 'welding',
            ordering: 'full_name'
        });
        users = response.results || [];
    } catch (error) {
        console.error('Error loading users:', error);
        users = [];
    }
}

function initializeFiltersComponent() {
    // Initialize filters component
    timeEntriesFilters = new FiltersComponent('filters-placeholder', {
        title: 'Zaman Kaydı Filtreleri',
        onApply: (values) => {
            loadTimeEntries(1);
        },
        onClear: () => {
            loadTimeEntries(1);
            showNotification('Filtreler temizlendi', 'info');
        }
    });

    // Add employee filter (dropdown)
    const userOptions = [
        { value: '', label: 'Tüm Çalışanlar' },
        ...users.map(user => ({
            value: user.id ? user.id.toString() : '',
            label: user.full_name ? `${user.full_name} (${user.username})` : 
                   (user.first_name && user.last_name) ? `${user.first_name} ${user.last_name} (${user.username})` :
                   user.username
        }))
    ];

    timeEntriesFilters.addDropdownFilter({
        id: 'employee-filter',
        label: 'Çalışan',
        options: userOptions,
        placeholder: 'Çalışan seçin',
        colSize: 2,
        searchable: true
    });

    // Add text filters
    timeEntriesFilters.addTextFilter({
        id: 'employee-username-filter',
        label: 'Kullanıcı Adı',
        placeholder: 'Kullanıcı adı',
        colSize: 2
    });

    timeEntriesFilters.addTextFilter({
        id: 'job-no-filter',
        label: 'İş No',
        placeholder: 'İş numarası',
        colSize: 2
    });

    timeEntriesFilters.addTextFilter({
        id: 'description-filter',
        label: 'Açıklama',
        placeholder: 'Açıklama',
        colSize: 2
    });

    // Add date filters
    timeEntriesFilters.addDateFilter({
        id: 'date-filter',
        label: 'Tarih',
        colSize: 2
    });

    timeEntriesFilters.addDateFilter({
        id: 'date-after-filter',
        label: 'Tarih (Başlangıç)',
        colSize: 2
    });

    timeEntriesFilters.addDateFilter({
        id: 'date-before-filter',
        label: 'Tarih (Bitiş)',
        colSize: 2
    });

    // Add hours filters
    timeEntriesFilters.addTextFilter({
        id: 'hours-min-filter',
        label: 'Min. Saat',
        type: 'number',
        placeholder: '0.00',
        colSize: 2
    });

    timeEntriesFilters.addTextFilter({
        id: 'hours-max-filter',
        label: 'Max. Saat',
        type: 'number',
        placeholder: '0.00',
        colSize: 2
    });

    // Add overtime type filter
    timeEntriesFilters.addDropdownFilter({
        id: 'overtime-type-filter',
        label: 'Mesai Tipi',
        options: [
            { value: '', label: 'Tümü' },
            { value: 'regular', label: 'Normal (1x)' },
            { value: 'after_hours', label: 'Fazla Mesai (1.5x)' },
            { value: 'holiday', label: 'Tatil (2x)' }
        ],
        placeholder: 'Tümü',
        colSize: 2
    });
}

function initializeTableComponent() {
    // Initialize table component
    timeEntriesTable = new TableComponent('time-entries-table-container', {
        title: 'Zaman Kayıtları',
        icon: 'fas fa-clock',
        iconColor: 'text-primary',
        columns: [
            {
                field: 'id',
                label: 'ID',
                sortable: true,
                width: '5%',
                formatter: (value) => `<span class="entry-id">${value || '-'}</span>`
            },
            {
                field: 'employee',
                label: 'Çalışan',
                sortable: true,
                width: '15%',
                formatter: (value, row) => {
                    // Handle different response structures
                    if (row.employee_full_name) {
                        return `<span class="employee-name">${row.employee_full_name}</span><br><small class="text-muted">${row.employee_username || '-'}</small>`;
                    }
                    if (row.employee && typeof row.employee === 'object') {
                        const emp = row.employee;
                        const fullName = emp.full_name || (emp.first_name && emp.last_name ? `${emp.first_name} ${emp.last_name}` : null);
                        if (fullName) {
                            return `<span class="employee-name">${fullName}</span><br><small class="text-muted">${emp.username || '-'}</small>`;
                        }
                        return emp.username || '-';
                    }
                    return row.employee_username || (typeof value === 'object' && value ? value.username : '-');
                }
            },
            {
                field: 'job_no',
                label: 'İş No',
                sortable: true,
                width: '10%',
                formatter: (value) => value || '-'
            },
            {
                field: 'date',
                label: 'Tarih',
                sortable: true,
                width: '10%',
                type: 'date',
                formatter: (value) => {
                    if (!value) return '-';
                    return new Date(value).toLocaleDateString('tr-TR');
                }
            },
            {
                field: 'hours',
                label: 'Saat',
                sortable: true,
                width: '8%',
                type: 'number',
                formatter: (value) => {
                    if (value === null || value === undefined) return '-';
                    return `<span class="hours-badge">${parseFloat(value).toFixed(2)}</span>`;
                }
            },
            {
                field: 'overtime_type',
                label: 'Mesai Tipi',
                sortable: true,
                width: '12%',
                formatter: (value) => {
                    if (!value) return '-';
                    const typeMap = {
                        'regular': { label: 'Normal', badge: 'status-grey', multiplier: '1x' },
                        'after_hours': { label: 'Fazla Mesai', badge: 'status-yellow', multiplier: '1.5x' },
                        'holiday': { label: 'Tatil', badge: 'status-red', multiplier: '2x' }
                    };
                    const typeInfo = typeMap[value] || { label: value, badge: 'status-grey', multiplier: '' };
                    return `<span class="status-badge ${typeInfo.badge}">${typeInfo.label}${typeInfo.multiplier ? ' (' + typeInfo.multiplier + ')' : ''}</span>`;
                }
            },
            {
                field: 'description',
                label: 'Açıklama',
                sortable: true,
                width: '20%',
                formatter: (value) => value || '-'
            },
            {
                field: 'created_at',
                label: 'Oluşturulma',
                sortable: true,
                width: '12%',
                formatter: (value) => {
                    if (!value) return '-';
                    const date = new Date(value);
                    return date.toLocaleDateString('tr-TR') + '<br><small class="text-muted">' + date.toLocaleTimeString('tr-TR') + '</small>';
                }
            }
        ],
        actions: [
            {
                key: 'edit',
                label: 'Düzenle',
                icon: 'fas fa-edit',
                class: 'btn-outline-primary',
                onClick: (row) => editTimeEntry(row)
            },
            {
                key: 'delete',
                label: 'Sil',
                icon: 'fas fa-trash',
                class: 'btn-outline-danger',
                onClick: (row) => deleteTimeEntry(row)
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
            loadTimeEntries(page);
        },
        onPageSizeChange: (newSize) => {
            if (timeEntriesTable) {
                timeEntriesTable.options.itemsPerPage = newSize;
            }
            currentPage = 1;
            loadTimeEntries(1);
        },
        onSort: (field, direction) => {
            currentSortField = field;
            currentSortDirection = direction;
            loadTimeEntries(1);
        },
        exportable: true,
        refreshable: true,
        onRefresh: () => {
            loadTimeEntries(currentPage);
        },
        striped: false,
        small: false,
        emptyMessage: 'Zaman kaydı bulunamadı',
        emptyIcon: 'fas fa-clock'
    });
}

async function loadTimeEntries(page = 1) {
    if (isLoading) return;
    
    isLoading = true;
    
    if (timeEntriesTable) {
        timeEntriesTable.setLoading(true);
    }
    
    try {
        // Get filter values
        const filterValues = timeEntriesFilters ? timeEntriesFilters.getFilterValues() : {};
        
        // Build filters object
        const filters = {};
        
        if (filterValues['employee-filter']) {
            filters.employee = parseInt(filterValues['employee-filter']);
        }
        if (filterValues['employee-username-filter']) {
            filters.employee_username = filterValues['employee-username-filter'];
        }
        if (filterValues['job-no-filter']) {
            filters.job_no = filterValues['job-no-filter'];
        }
        if (filterValues['description-filter']) {
            filters.description = filterValues['description-filter'];
        }
        if (filterValues['date-filter']) {
            filters.date = filterValues['date-filter'];
        }
        if (filterValues['date-after-filter']) {
            filters.date_after = filterValues['date-after-filter'];
        }
        if (filterValues['date-before-filter']) {
            filters.date_before = filterValues['date-before-filter'];
        }
        if (filterValues['hours-min-filter']) {
            filters.hours_min = parseFloat(filterValues['hours-min-filter']);
        }
        if (filterValues['hours-max-filter']) {
            filters.hours_max = parseFloat(filterValues['hours-max-filter']);
        }
        if (filterValues['overtime-type-filter']) {
            filters.overtime_type = filterValues['overtime-type-filter'];
        }
        
        // Add pagination
        filters.page = page;
        filters.page_size = timeEntriesTable ? timeEntriesTable.options.itemsPerPage : 20;
        
        // Add ordering
        const orderingParam = currentSortDirection === 'asc' ? currentSortField : `-${currentSortField}`;
        filters.ordering = orderingParam;
        
        // Fetch time entries
        const response = await fetchWeldingTimeEntries(filters);
        
        timeEntries = response.results || [];
        totalEntries = response.count || 0;
        currentPage = page;
        
        // Update table component
        if (timeEntriesTable) {
            timeEntriesTable.setLoading(false);
            timeEntriesTable.updateData(timeEntries, totalEntries, currentPage);
        }
    } catch (error) {
        console.error('Error loading time entries:', error);
        showNotification('Zaman kayıtları yüklenirken hata oluştu', 'error');
        timeEntries = [];
        totalEntries = 0;
        
        if (timeEntriesTable) {
            timeEntriesTable.setLoading(false);
            timeEntriesTable.updateData([], 0, 1);
        }
    } finally {
        isLoading = false;
    }
}

function showBulkCreateModal() {
    // Create Edit Modal instance for bulk create
    const bulkCreateModal = new EditModal('bulk-create-modal-container', {
        title: 'Toplu Zaman Kaydı Oluştur',
        icon: 'fas fa-layer-group',
        saveButtonText: 'Kayıtları Oluştur',
        size: 'xl'
    });
    
    // Set up the bulk create form
    setupBulkCreateForm(bulkCreateModal);
    
    // Show the modal
    bulkCreateModal.show();
}

function setupBulkCreateForm(bulkCreateModal) {
    // Define columns for bulk creation
    const columns = [
        { key: 'employee', label: 'Çalışan', required: true, type: 'select' },
        { key: 'job_no', label: 'İş No', required: true },
        { key: 'date', label: 'Tarih', required: true, type: 'date' },
        { key: 'hours', label: 'Saat', required: true, type: 'number' },
        { key: 'overtime_type', label: 'Mesai Tipi', required: true, type: 'select', options: [
            { value: 'regular', label: 'Normal (1x)' },
            { value: 'after_hours', label: 'Fazla Mesai (1.5x)' },
            { value: 'holiday', label: 'Tatil (2x)' }
        ]},
        { key: 'description', label: 'Açıklama', required: false }
    ];
    
    let rows = [Object.fromEntries(columns.map(c => [c.key, '']))];
    let hasUnsavedChanges = false;
    let initialRows = JSON.stringify(rows);
    let parsedExcelRows = []; // Store parsed Excel rows
    
    function checkForUnsavedChanges() {
        const currentRows = JSON.stringify(rows);
        hasUnsavedChanges = currentRows !== initialRows;
        return hasUnsavedChanges;
    }
    
    function updateInitialState() {
        initialRows = JSON.stringify(rows);
        hasUnsavedChanges = false;
    }
    
    // Function to show notifications within the modal
    function showModalNotification(message, type = 'info') {
        const existingNotifications = bulkCreateModal.container.querySelectorAll('.bulk-create-notification');
        existingNotifications.forEach(n => n.remove());
        
        const notification = document.createElement('div');
        notification.className = `bulk-create-notification alert alert-${type === 'error' ? 'danger' : type} alert-dismissible fade show`;
        notification.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        
        const modalBody = bulkCreateModal.container.querySelector('.modal-body');
        if (modalBody) {
            modalBody.appendChild(notification);
        }
        
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
    
    // Function to create the bulk create table HTML
    function createBulkCreateTable() {
        let html = `
            <div class="bulk-create-header mb-4">
                <p class="text-muted small">Birden fazla zaman kaydı oluşturmak için aşağıdaki tabloyu kullanın.</p>
                <small class="text-info">Toplam satır sayısı: ${rows.length} / 300 ${rows.length >= 300 ? '<span class="text-danger">(Maksimum limit)</span>' : ''}</small>
            </div>
            <div class="table-responsive">
                <table class="table table-bordered table-sm">
                    <thead class="table-light">
                        <tr>
        `;
        
        for (const col of columns) {
            html += `<th>${col.label}${col.required ? ' *' : ''}</th>`;
        }
        html += `<th>İşlem</th></tr></thead><tbody>`;
        
        rows.forEach((row, i) => {
            html += `<tr>`;
            for (const col of columns) {
                if (col.type === 'select') {
                    html += `<td><select class="form-control form-control-sm bulk-input" data-row="${i}" data-key="${col.key}" ${col.required ? 'required' : ''}>`;
                    if (col.key === 'employee') {
                        // Render employee dropdown
                        html += `<option value="">Çalışan seçin...</option>`;
                        users.forEach(user => {
                            const userId = user.id ? user.id.toString() : '';
                            const userLabel = user.full_name ? `${user.full_name} (${user.username})` : 
                                           (user.first_name && user.last_name) ? `${user.first_name} ${user.last_name} (${user.username})` :
                                           user.username;
                            const selected = row[col.key] == userId ? 'selected' : '';
                            html += `<option value="${userId}" ${selected}>${userLabel}</option>`;
                        });
                    } else if (col.options) {
                        // Render other select fields with options
                        html += `<option value="">Seçin...</option>`;
                        col.options.forEach(option => {
                            const selected = row[col.key] == option.value ? 'selected' : '';
                            html += `<option value="${option.value}" ${selected}>${option.label}</option>`;
                        });
                    }
                    html += `</select></td>`;
                } else {
                    const inputType = col.type === 'number' ? 'number' : (col.type === 'date' ? 'date' : 'text');
                    let inputAttrs = '';
                    if (col.key === 'hours') {
                        inputAttrs = 'step="0.01" min="0.01"';
                    }
                    html += `<td><input type="${inputType}" class="form-control form-control-sm bulk-input" data-row="${i}" data-key="${col.key}" value="${row[col.key] || ''}" ${col.required ? 'required' : ''} ${inputAttrs}></td>`;
                }
            }
            html += `<td>
                <div class="btn-group btn-group-sm" role="group">
                    <button type="button" class="btn btn-outline-secondary bulk-duplicate" data-row="${i}" title="Kopyala">
                        <i class="fas fa-copy"></i>
                    </button>
                    <button type="button" class="btn btn-outline-danger bulk-remove" data-row="${i}" ${rows.length === 1 ? 'disabled' : ''} title="Sil">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td></tr>`;
        });
        
        html += `</tbody></table></div>
        <div class="bulk-create-actions mt-3">
            <button type="button" class="btn btn-outline-primary btn-sm" id="bulk-add-row" ${rows.length >= 300 ? 'disabled' : ''}>
                <i class="fas fa-plus me-1"></i>Satır Ekle
            </button>
            <button type="button" class="btn btn-outline-success btn-sm" id="bulk-paste-excel">
                <i class="fas fa-paste me-1"></i>Excel'den Yapıştır
            </button>
            <button type="button" class="btn btn-outline-danger btn-sm" id="bulk-clear-all">
                <i class="fas fa-trash-alt me-1"></i>Tümünü Temizle
            </button>
        </div>
        <div id="excel-paste-section" class="mt-4" style="display: none;">
            <div class="card">
                <div class="card-header">
                    <h6 class="mb-0">
                        <i class="fas fa-file-excel me-2 text-success"></i>Excel Verisi Yapıştır
                    </h6>
                </div>
                <div class="card-body">
                    <p class="text-muted small mb-3">
                        Excel'den kopyaladığınız verileri aşağıdaki alana yapıştırın. Sütunlar: Çalışan, İş No, Tarih, Saat, Mesai Tipi, Açıklama
                    </p>
                    <textarea class="form-control" id="excel-paste-input" rows="5" placeholder="Excel'den kopyaladığınız verileri buraya yapıştırın..."></textarea>
                    <div class="mt-2">
                        <button type="button" class="btn btn-sm btn-primary" id="parse-excel-btn">
                            <i class="fas fa-search me-1"></i>Önizle
                        </button>
                        <button type="button" class="btn btn-sm btn-outline-secondary" id="clear-excel-btn">
                            <i class="fas fa-times me-1"></i>Temizle
                        </button>
                    </div>
                    <div id="excel-preview-section" class="mt-3" style="display: none;">
                        <hr>
                        <h6 class="mb-2">
                            <i class="fas fa-eye me-2"></i>Önizleme
                            <span class="badge bg-info ms-2" id="preview-count">0 satır</span>
                        </h6>
                        <div class="table-responsive" style="max-height: 300px; overflow-y: auto;">
                            <table class="table table-sm table-bordered">
                                <thead class="table-light sticky-top">
                                    <tr>
                                        <th>Çalışan</th>
                                        <th>İş No</th>
                                        <th>Tarih</th>
                                        <th>Saat</th>
                                        <th>Mesai Tipi</th>
                                        <th>Açıklama</th>
                                    </tr>
                                </thead>
                                <tbody id="excel-preview-tbody">
                                </tbody>
                            </table>
                        </div>
                        <div class="mt-2">
                            <button type="button" class="btn btn-sm btn-success" id="confirm-add-excel-btn">
                                <i class="fas fa-check me-1"></i>Ekle
                            </button>
                            <button type="button" class="btn btn-sm btn-outline-secondary" id="cancel-preview-btn">
                                <i class="fas fa-times me-1"></i>İptal
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
        
        return html;
    }
    
    // Function to re-render the table
    function reRenderTable() {
        const customContent = createBulkCreateTable();
        
        const sectionElement = bulkCreateModal.container.querySelector('[data-section-id="bulk-create-table"]');
        if (sectionElement) {
            const customContentDiv = sectionElement.querySelector('.custom-content');
            if (customContentDiv) {
                customContentDiv.innerHTML = customContent;
                setupBulkCreateEventListeners();
            }
        }
    }
    
    // Function to set up event listeners
    function setupBulkCreateEventListeners() {
        document.querySelectorAll('.bulk-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const row = parseInt(input.getAttribute('data-row'));
                const key = input.getAttribute('data-key');
                rows[row][key] = input.value;
                checkForUnsavedChanges();
            });
        });
        
        document.querySelectorAll('.bulk-input').forEach(select => {
            select.addEventListener('change', (e) => {
                const row = parseInt(select.getAttribute('data-row'));
                const key = select.getAttribute('data-key');
                rows[row][key] = select.value;
                checkForUnsavedChanges();
            });
        });
        
        document.querySelectorAll('.bulk-duplicate').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (rows.length >= 300) {
                    showModalNotification('Maksimum 300 satır limitine ulaşıldı', 'warning');
                    return;
                }
                const rowIdx = parseInt(btn.getAttribute('data-row'));
                const newRow = { ...rows[rowIdx] };
                rows.splice(rowIdx + 1, 0, newRow);
                checkForUnsavedChanges();
                reRenderTable();
            });
        });
        
        document.querySelectorAll('.bulk-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const rowIdx = parseInt(btn.getAttribute('data-row'));
                if (rows.length > 1) {
                    rows.splice(rowIdx, 1);
                    checkForUnsavedChanges();
                    reRenderTable();
                }
            });
        });
        
        const addRowBtn = document.getElementById('bulk-add-row');
        if (addRowBtn) {
            addRowBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (rows.length >= 300) {
                    showModalNotification('Maksimum 300 satır eklenebilir', 'warning');
                    return;
                }
                rows.push(Object.fromEntries(columns.map(c => [c.key, ''])));
                checkForUnsavedChanges();
                reRenderTable();
            });
        }
        
        const clearAllBtn = document.getElementById('bulk-clear-all');
        if (clearAllBtn) {
            clearAllBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (confirm('Tüm satırları temizlemek istediğinize emin misiniz?')) {
                    // Keep only one empty row
                    rows = [Object.fromEntries(columns.map(c => [c.key, '']))];
                    updateInitialState();
                    reRenderTable();
                    showModalNotification('Tüm satırlar temizlendi', 'info');
                }
            });
        }
        
        // Excel paste functionality
        const pasteExcelBtn = document.getElementById('bulk-paste-excel');
        const excelPasteSection = document.getElementById('excel-paste-section');
        const parseExcelBtn = document.getElementById('parse-excel-btn');
        const clearExcelBtn = document.getElementById('clear-excel-btn');
        const excelPasteInput = document.getElementById('excel-paste-input');
        const excelPreviewSection = document.getElementById('excel-preview-section');
        const confirmAddExcelBtn = document.getElementById('confirm-add-excel-btn');
        const cancelPreviewBtn = document.getElementById('cancel-preview-btn');
        
        if (pasteExcelBtn && excelPasteSection) {
            pasteExcelBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                excelPasteSection.style.display = excelPasteSection.style.display === 'none' ? 'block' : 'none';
                if (excelPasteSection.style.display === 'block') {
                    excelPasteInput.focus();
                }
            });
        }
        
        if (parseExcelBtn && excelPasteInput) {
            parseExcelBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                parseExcelData();
            });
        }
        
        if (clearExcelBtn && excelPasteInput) {
            clearExcelBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                excelPasteInput.value = '';
                excelPreviewSection.style.display = 'none';
                parsedExcelRows = [];
            });
        }
        
        if (confirmAddExcelBtn) {
            confirmAddExcelBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                addParsedRowsToTable();
            });
        }
        
        if (cancelPreviewBtn) {
            cancelPreviewBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                excelPreviewSection.style.display = 'none';
                parsedExcelRows = [];
            });
        }
        
        // Auto-parse on paste (optional)
        if (excelPasteInput) {
            excelPasteInput.addEventListener('paste', () => {
                setTimeout(() => {
                    // Auto-parse after paste
                    // parseExcelData();
                }, 100);
            });
        }
    }
    
    // Function to parse Excel data
    function parseExcelData() {
        const pasteInput = document.getElementById('excel-paste-input');
        const previewSection = document.getElementById('excel-preview-section');
        const previewTbody = document.getElementById('excel-preview-tbody');
        const previewCount = document.getElementById('preview-count');
        
        if (!pasteInput || !previewSection || !previewTbody) return;
        
        const rawText = pasteInput.value.trim();
        
        if (!rawText) {
            showModalNotification('Lütfen Excel verilerini yapıştırın', 'warning');
            previewSection.style.display = 'none';
            parsedExcelRows = [];
            return;
        }
        
        try {
            // Split by lines
            const lines = rawText.split(/\r?\n/g).filter(line => line.trim().length > 0);
            
            if (lines.length < 1) {
                showModalNotification('Geçerli veri bulunamadı', 'warning');
                previewSection.style.display = 'none';
                parsedExcelRows = [];
                return;
            }
            
            // Parse rows - Excel uses tab-separated values
            parsedExcelRows = [];
            
            // Check if first line is header (optional)
            let startIndex = 0;
            const firstLine = lines[0];
            const firstLineLower = firstLine.toLowerCase();
            
            // Check if first line looks like headers
            if (firstLineLower.includes('çalışan') || firstLineLower.includes('employee') || 
                firstLineLower.includes('iş no') || firstLineLower.includes('job')) {
                startIndex = 1; // Skip header row
            }
            
            // Parse data rows
            for (let i = startIndex; i < lines.length; i++) {
                const line = lines[i];
                let cells = line.split('\t').map(cell => cell.trim());
                
                // Expected order: Çalışan, İş No, Tarih, Saat, Mesai Tipi, Açıklama
                // Or flexible: try to match by content
                if (cells.length < 4) {
                    // Try comma-separated as fallback
                    const cellsComma = line.split(',').map(cell => cell.trim());
                    if (cellsComma.length >= 4) {
                        cells = cellsComma;
                    } else {
                        continue; // Skip invalid rows
                    }
                }
                
                // Map cells to fields
                // Try to find employee by username or full name
                let employeeId = '';
                const employeeText = cells[0] || '';
                
                // Try to match employee
                const matchedUser = users.find(user => {
                    const username = user.username || '';
                    const fullName = user.full_name || (user.first_name && user.last_name ? `${user.first_name} ${user.last_name}` : '');
                    return username.toLowerCase() === employeeText.toLowerCase() ||
                           fullName.toLowerCase() === employeeText.toLowerCase() ||
                           employeeText.includes(username) ||
                           employeeText.includes(fullName);
                });
                
                if (matchedUser && matchedUser.id) {
                    employeeId = matchedUser.id.toString();
                }
                
                // Parse date - try multiple formats
                let dateValue = '';
                const dateText = cells[2] || '';
                if (dateText) {
                    // Try to parse date
                    const date = new Date(dateText);
                    if (!isNaN(date.getTime())) {
                        // Format as YYYY-MM-DD
                        dateValue = date.toISOString().split('T')[0];
                    } else {
                        // Try DD.MM.YYYY or DD/MM/YYYY
                        const dateMatch = dateText.match(/(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/);
                        if (dateMatch) {
                            const day = dateMatch[1].padStart(2, '0');
                            const month = dateMatch[2].padStart(2, '0');
                            const year = dateMatch[3];
                            dateValue = `${year}-${month}-${day}`;
                        } else {
                            dateValue = dateText; // Use as-is
                        }
                    }
                }
                
                // Parse hours
                let hoursValue = '';
                const hoursText = cells[3] || '';
                if (hoursText) {
                    const hours = parseFloat(hoursText.replace(',', '.'));
                    if (!isNaN(hours) && hours > 0) {
                        hoursValue = hours.toString();
                    }
                }
                
                // Parse overtime type
                let overtimeTypeValue = 'regular';
                const overtimeText = (cells[4] || '').toLowerCase();
                if (overtimeText.includes('mesai') || overtimeText.includes('after') || overtimeText === '1.5x' || overtimeText === '1,5x') {
                    overtimeTypeValue = 'after_hours';
                } else if (overtimeText.includes('tatil') || overtimeText.includes('holiday') || overtimeText === '2x') {
                    overtimeTypeValue = 'holiday';
                }
                
                // Description
                const descriptionValue = cells[5] || '';
                
                // Only add if we have minimum required fields
                if (employeeId && cells[1] && dateValue && hoursValue) {
                    parsedExcelRows.push({
                        employee: employeeId,
                        job_no: cells[1],
                        date: dateValue,
                        hours: hoursValue,
                        overtime_type: overtimeTypeValue,
                        description: descriptionValue
                    });
                }
            }
            
            if (parsedExcelRows.length === 0) {
                showModalNotification('Yapıştırılan veriler ayrıştırılamadı. Lütfen formatı kontrol edin.', 'warning');
                previewSection.style.display = 'none';
                return;
            }
            
            // Show preview
            previewTbody.innerHTML = '';
            parsedExcelRows.forEach((row, index) => {
                const tr = document.createElement('tr');
                const user = users.find(u => u.id && u.id.toString() === row.employee);
                const userLabel = user ? (user.full_name || `${user.first_name} ${user.last_name}` || user.username) : 'Bulunamadı';
                const overtimeTypeLabel = {
                    'regular': 'Normal (1x)',
                    'after_hours': 'Fazla Mesai (1.5x)',
                    'holiday': 'Tatil (2x)'
                }[row.overtime_type] || row.overtime_type;
                
                tr.innerHTML = `
                    <td>${userLabel}</td>
                    <td>${row.job_no || '-'}</td>
                    <td>${row.date || '-'}</td>
                    <td>${row.hours || '-'}</td>
                    <td>${overtimeTypeLabel}</td>
                    <td>${row.description || '-'}</td>
                `;
                previewTbody.appendChild(tr);
            });
            
            if (previewCount) {
                previewCount.textContent = `${parsedExcelRows.length} satır`;
            }
            
            previewSection.style.display = 'block';
            showModalNotification(`${parsedExcelRows.length} satır başarıyla ayrıştırıldı`, 'success');
            
        } catch (error) {
            console.error('Error parsing Excel data:', error);
            showModalNotification('Veri ayrıştırılırken hata oluştu: ' + error.message, 'error');
            previewSection.style.display = 'none';
            parsedExcelRows = [];
        }
    }
    
    // Function to add parsed rows to the table
    function addParsedRowsToTable() {
        if (parsedExcelRows.length === 0) {
            showModalNotification('Eklenecek veri bulunamadı', 'warning');
            return;
        }
        
        const rowCount = parsedExcelRows.length;
        
        // Check if adding these rows would exceed the limit
        if (rows.length + parsedExcelRows.length > 300) {
            const available = 300 - rows.length;
            if (available <= 0) {
                showModalNotification('Maksimum 300 satır limitine ulaşıldı. Lütfen mevcut satırları temizleyin.', 'warning');
                return;
            }
            showModalNotification(`Sadece ${available} satır eklenebilir (Maksimum 300 satır limiti). İlk ${available} satır eklenecek.`, 'warning');
            // Add only the available rows
            rows.push(...parsedExcelRows.slice(0, available));
        } else {
            // Add parsed rows to the main rows array
            rows.push(...parsedExcelRows);
        }
        checkForUnsavedChanges();
        
        // Clear Excel paste section
        const excelPasteInput = document.getElementById('excel-paste-input');
        const excelPreviewSection = document.getElementById('excel-preview-section');
        const excelPasteSection = document.getElementById('excel-paste-section');
        
        if (excelPasteInput) excelPasteInput.value = '';
        if (excelPreviewSection) excelPreviewSection.style.display = 'none';
        if (excelPasteSection) excelPasteSection.style.display = 'none';
        
        parsedExcelRows = [];
        
        // Re-render table
        reRenderTable();
        
        showModalNotification(`${rowCount} satır tabloya eklendi`, 'success');
    }
    
    // Add section for the bulk create table
    bulkCreateModal.addSection({
        id: 'bulk-create-table',
        title: 'Toplu Zaman Kaydı Oluşturma',
        icon: 'fas fa-layer-group',
        iconColor: 'text-primary',
        fields: []
    });
    
    // Set up save callback
    bulkCreateModal.onSaveCallback(async (formData) => {
        await handleBulkCreateSave(rows, columns, showModalNotification);
    });
    
    // Set up cancel callback
    bulkCreateModal.onCancelCallback(() => {
        rows = [Object.fromEntries(columns.map(c => [c.key, '']))];
        updateInitialState();
    });
    
    // Render the modal
    bulkCreateModal.render();
    
    // Add custom content after rendering
    setTimeout(() => {
        const sectionElement = bulkCreateModal.container.querySelector('[data-section-id="bulk-create-table"]');
        if (sectionElement) {
            const fieldsContainer = sectionElement.querySelector('.row.g-2');
            if (fieldsContainer) {
                fieldsContainer.outerHTML = `<div class="custom-content">${createBulkCreateTable()}</div>`;
            }
        }
        
        setupBulkCreateEventListeners();
    }, 100);
}

async function handleBulkCreateSave(rows, columns, showModalNotification) {
    // Check maximum limit
    if (rows.length > 300) {
        showModalNotification('Maksimum 300 satır oluşturulabilir. Lütfen satır sayısını azaltın.', 'error');
        return;
    }
    
    const requiredFields = ['employee', 'job_no', 'date', 'hours', 'overtime_type'];
    const missingFields = [];
    
    rows.forEach((row, index) => {
        requiredFields.forEach(field => {
            if (!row[field] || row[field].toString().trim() === '') {
                missingFields.push(`Satır ${index + 1}: ${columns.find(col => col.key === field)?.label}`);
            }
        });
    });
    
    if (missingFields.length > 0) {
        showModalNotification('Lütfen aşağıdaki zorunlu alanları doldurun:<br>' + missingFields.join('<br>'), 'error');
        return;
    }
    
    const validationErrors = [];
    rows.forEach((row, index) => {
        if (row.hours) {
            const hours = parseFloat(row.hours);
            if (hours <= 0) {
                validationErrors.push(`Satır ${index + 1}: Saat 0'dan büyük olmalıdır`);
            }
        }
    });
    
    if (validationErrors.length > 0) {
        showModalNotification('Lütfen aşağıdaki hataları düzeltin:<br>' + validationErrors.join('<br>'), 'error');
        return;
    }
    
    const payload = {
        entries: rows.map(row => ({
            employee: parseInt(row.employee),
            job_no: row.job_no,
            date: row.date,
            hours: parseFloat(row.hours),
            overtime_type: row.overtime_type || 'regular',
            description: row.description || ''
        }))
    };
    
    try {
        const data = await bulkCreateWeldingTimeEntries(payload);
        
        showNotification(`${data.created_count || payload.entries.length} zaman kaydı başarıyla oluşturuldu`, 'success');
        
        const modalInstance = bootstrap.Modal.getOrCreateInstance(document.querySelector('#bulk-create-modal-container .modal'));
        if (modalInstance) {
            modalInstance.hide();
        }
        
        loadTimeEntries(currentPage);
    } catch (err) {
        console.error('Error creating bulk time entries:', err);
        showModalNotification('Hata: ' + err.message, 'error');
    }
}

function initializeEditModal() {
    // Initialize edit modal
    editTimeEntryModal = new EditModal('edit-time-entry-modal-container', {
        title: 'Zaman Kaydı Düzenle',
        icon: 'fas fa-edit',
        size: 'lg',
        showEditButton: false
    });

    // Set up save callback
    editTimeEntryModal.onSaveCallback(async (formData) => {
        await updateTimeEntry(formData);
    });
}

function editTimeEntry(row) {
    if (!row || !row.id) {
        showNotification('Geçersiz zaman kaydı', 'error');
        return;
    }

    // Clear and configure the edit modal
    editTimeEntryModal.clearAll();
    
    // Store the entry ID for update
    window.editingTimeEntryId = row.id;
    
    // Add section
    editTimeEntryModal.addSection({
        title: 'Zaman Kaydı Bilgileri',
        icon: 'fas fa-clock',
        iconColor: 'text-primary'
    });

    // Get employee ID from row data
    let employeeId = '';
    if (row.employee && typeof row.employee === 'object' && row.employee.id) {
        employeeId = row.employee.id.toString();
    } else if (row.employee_id) {
        employeeId = row.employee_id.toString();
    } else if (row.employee) {
        employeeId = row.employee.toString();
    }

    // Add employee dropdown
    editTimeEntryModal.addField({
        id: 'employee',
        name: 'employee',
        label: 'Çalışan',
        type: 'dropdown',
        value: employeeId,
        required: true,
        icon: 'fas fa-user',
        colSize: 6,
        helpText: 'Çalışan seçin',
        options: [
            { value: '', label: 'Çalışan seçin...' },
            ...users.map(user => ({
                value: user.id ? user.id.toString() : '',
                label: user.full_name ? `${user.full_name} (${user.username})` : 
                       (user.first_name && user.last_name) ? `${user.first_name} ${user.last_name} (${user.username})` :
                       user.username
            }))
        ]
    });

    // Add job number field
    editTimeEntryModal.addField({
        id: 'job_no',
        name: 'job_no',
        label: 'İş No',
        type: 'text',
        value: row.job_no || '',
        required: true,
        icon: 'fas fa-hashtag',
        colSize: 6,
        helpText: 'İş numarası'
    });

    // Add date field
    let dateValue = '';
    if (row.date) {
        // Format date as YYYY-MM-DD for date input
        const date = new Date(row.date);
        if (!isNaN(date.getTime())) {
            dateValue = date.toISOString().split('T')[0];
        } else {
            dateValue = row.date;
        }
    }

    editTimeEntryModal.addField({
        id: 'date',
        name: 'date',
        label: 'Tarih',
        type: 'date',
        value: dateValue,
        required: true,
        icon: 'fas fa-calendar',
        colSize: 6,
        helpText: 'Tarih seçin'
    });

    // Add hours field
    editTimeEntryModal.addField({
        id: 'hours',
        name: 'hours',
        label: 'Saat',
        type: 'number',
        value: row.hours || '',
        required: true,
        icon: 'fas fa-clock',
        colSize: 6,
        helpText: 'Çalışılan saat',
        step: '0.01',
        min: '0.01'
    });

    // Add overtime type dropdown
    editTimeEntryModal.addField({
        id: 'overtime_type',
        name: 'overtime_type',
        label: 'Mesai Tipi',
        type: 'dropdown',
        value: row.overtime_type || 'regular',
        required: true,
        icon: 'fas fa-briefcase',
        colSize: 6,
        helpText: 'Mesai tipi seçin',
        options: [
            { value: 'regular', label: 'Normal (1x)' },
            { value: 'after_hours', label: 'Fazla Mesai (1.5x)' },
            { value: 'holiday', label: 'Tatil (2x)' }
        ]
    });

    // Add description field
    editTimeEntryModal.addField({
        id: 'description',
        name: 'description',
        label: 'Açıklama',
        type: 'textarea',
        value: row.description || '',
        icon: 'fas fa-align-left',
        colSize: 12,
        helpText: 'İş açıklaması (opsiyonel)'
    });

    // Render and show modal
    editTimeEntryModal.render();
    editTimeEntryModal.show();
}

async function updateTimeEntry(formData) {
    const entryId = window.editingTimeEntryId;
    if (!entryId) {
        showNotification('Düzenlenecek zaman kaydı bulunamadı', 'error');
        return;
    }
    
    try {
        // Prepare update data
        const updateData = {
            employee: parseInt(formData.employee),
            job_no: formData.job_no,
            date: formData.date,
            hours: parseFloat(formData.hours),
            overtime_type: formData.overtime_type || 'regular',
            description: formData.description || ''
        };

        // Update the time entry
        await updateWeldingTimeEntry(entryId, updateData);
        
        // Hide modal
        editTimeEntryModal.hide();
        
        // Clear the editing entry ID
        window.editingTimeEntryId = null;
        
        // Show success notification
        showNotification('Zaman kaydı başarıyla güncellendi', 'success');
        
        // Reload time entries
        await loadTimeEntries(currentPage);
    } catch (error) {
        console.error('Error updating time entry:', error);
        showNotification(error.message || 'Zaman kaydı güncellenirken hata oluştu', 'error');
    }
}

function initializeDeleteModal() {
    // Initialize delete confirmation modal
    deleteTimeEntryModal = new ConfirmationModal('delete-time-entry-modal-container', {
        title: 'Zaman Kaydını Sil',
        icon: 'fas fa-trash-alt',
        message: 'Bu zaman kaydını silmek istediğinizden emin misiniz?',
        confirmText: 'Evet, Sil',
        cancelText: 'İptal',
        confirmButtonClass: 'btn-danger',
        showCancelButton: true
    });

    // Set up delete modal callback
    deleteTimeEntryModal.setOnConfirm(async () => {
        const entryId = window.pendingDeleteTimeEntryId;
        if (!entryId) {
            showNotification('Silinecek zaman kaydı bulunamadı', 'error');
            return;
        }

        try {
            await deleteTimeEntryAPI(entryId);
            deleteTimeEntryModal.hide();
            window.pendingDeleteTimeEntryId = null;
        } catch (error) {
            console.error('Error deleting time entry:', error);
            showNotification('Zaman kaydı silinirken hata oluştu: ' + error.message, 'error');
        }
    });
}

function deleteTimeEntry(row) {
    if (!row || !row.id) {
        showNotification('Geçersiz zaman kaydı', 'error');
        return;
    }

    // Store the entry ID for deletion
    window.pendingDeleteTimeEntryId = row.id;

    // Build entry details for display
    const employeeName = row.employee_full_name || 
                        (row.employee && typeof row.employee === 'object' ? 
                         (row.employee.full_name || `${row.employee.first_name || ''} ${row.employee.last_name || ''}`.trim()) : 
                         row.employee_username || '-');
    const jobNo = row.job_no || '-';
    const date = row.date ? new Date(row.date).toLocaleDateString('tr-TR') : '-';
    const hours = row.hours ? parseFloat(row.hours).toFixed(2) : '-';

    // Build details HTML
    const detailsHtml = `
        <div class="alert alert-warning mt-3">
            <strong>Çalışan:</strong> ${employeeName}<br>
            <strong>İş No:</strong> ${jobNo}<br>
            <strong>Tarih:</strong> ${date}<br>
            <strong>Saat:</strong> ${hours}
        </div>
        <p class="text-muted small mt-2">Bu işlem geri alınamaz ve zaman kaydı kalıcı olarak silinecektir.</p>
    `;

    // Show the modal with details
    deleteTimeEntryModal.show({
        details: detailsHtml
    });
}

async function deleteTimeEntryAPI(entryId) {
    try {
        await deleteWeldingTimeEntry(entryId);
        showNotification('Zaman kaydı başarıyla silindi', 'success');
        loadTimeEntries(currentPage);
    } catch (error) {
        console.error('Error deleting time entry:', error);
        showNotification('Zaman kaydı silinirken hata oluştu', 'error');
    }
}


