import { initNavbar } from '../../../../components/navbar.js';
import { getParts } from '../../../../apis/machining/parts.js';
import { bulkCreateParts } from '../../../../apis/machining/parts.js';
import { HeaderComponent } from '../../../../components/header/header.js';
import { FiltersComponent } from '../../../../components/filters/filters.js';
import { TableComponent } from '../../../../components/table/table.js';
import { getUser } from '../../../../authService.js';
import { showNotification } from '../../../../components/notification/notification.js';
import { ModernDropdown } from '../../../../components/dropdown/dropdown.js';
import { getJobOrderDropdown } from '../../../../apis/projects/jobOrders.js';

// State management
let currentPage = 1;
let currentSortField = 'key';
let currentSortDirection = 'asc';
let tasks = [];
let totalTasks = 0;
let isLoading = false;
let currentUser = null;
let taskFilters = null;
let tasksTable = null;
let createdTasks = []; // Store created tasks for displaying keys

// Define columns for bulk creation (without machine_fk and estimated_hours)
const columns = [
    { key: 'name', label: 'Ad', required: true },
    { key: 'job_no', label: 'İş No', required: true },
    { key: 'image_no', label: 'Resim No', required: false },
    { key: 'position_no', label: 'Pozisyon No', required: false },
    { key: 'quantity', label: 'Adet', required: true, type: 'number' },
    { key: 'material', label: 'Malzeme', required: false },
    { key: 'weight_kg', label: 'Ağırlık (kg)', required: false, type: 'number' },
    { key: 'finish_time', label: 'Bitiş Tarihi', required: true, type: 'date' },
    { key: 'description', label: 'Açıklama', required: false, type: 'textarea' }
];

let rows = [Object.fromEntries(columns.map(c => [c.key, '']))];
let eventListenersSetup = false;

// Job order dropdown state
let jobOrderDropdowns = new Map(); // Store dropdown references by row index
let jobOrderDropdownOptions = []; // Array of { job_no, title }

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    await initNavbar();
    
    // Get current user
    try {
        currentUser = await getUser();
    } catch (error) {
        console.error('Error fetching user:', error);
        showNotification('Kullanıcı bilgileri yüklenirken hata oluştu', 'error');
    }
    
    // Initialize header component
    const header = new HeaderComponent({
        title: 'Görev Oluştur',
        subtitle: 'Yeni görev oluştur ve oluşturduğun görevleri görüntüle',
        icon: 'plus-circle',
        showBackButton: 'block',
        showCreateButton: 'none',
        showBulkCreateButton: 'none',
        onBackClick: () => window.location.href = '/manufacturing/machining/tasks/'
    });
    
    // Setup bulk create table
    setupBulkCreateTable();
    
    // Setup event listeners
    setupEventListeners();
    
    // Initialize filters and table
    await initializeFiltersComponent();
    await initializeTableComponent();
    
    // Load job order dropdown options
    await loadJobOrderDropdownOptions();
    
    // Load tasks
    await loadTasks();
});

// Load job order dropdown options
async function loadJobOrderDropdownOptions() {
    try {
        jobOrderDropdownOptions = await getJobOrderDropdown();
    } catch (error) {
        console.error('Error loading job order dropdown options:', error);
        jobOrderDropdownOptions = [];
        showNotification('İş emirleri yüklenirken hata oluştu', 'error');
    }
}

// Initialize job order dropdown for a specific row
function initializeJobOrderDropdown(rowIndex, initialValue = '') {
    const container = document.getElementById(`job-no-dropdown-${rowIndex}`);
    if (!container) return;

    // Load options if not already loaded
    if (jobOrderDropdownOptions.length === 0) {
        loadJobOrderDropdownOptions().then(() => {
            setupJobOrderDropdown(container, rowIndex, initialValue);
        }).catch(() => {
            // Initialize with empty options if loading fails
            setupJobOrderDropdown(container, rowIndex, initialValue);
        });
    } else {
        setupJobOrderDropdown(container, rowIndex, initialValue);
    }
}

// Setup the job order dropdown component
function setupJobOrderDropdown(container, rowIndex, initialValue = '') {
    // Clear container
    container.innerHTML = '';

    // Create dropdown
    const dropdown = new ModernDropdown(container, {
        placeholder: 'İş emri seçin',
        searchable: true,
        multiple: false,
        maxHeight: 200,
        width: '100%'
    });

    // Convert job orders to dropdown items format
    const dropdownItems = jobOrderDropdownOptions.map(jobOrder => ({
        value: jobOrder.job_no,
        text: `${jobOrder.job_no} - ${jobOrder.title}`
    }));

    dropdown.setItems(dropdownItems);

    // Set initial value if provided
    if (initialValue) {
        dropdown.setValue(initialValue);
    }

    // Store dropdown reference in Map
    jobOrderDropdowns.set(rowIndex, dropdown);

    // Add event listener to update row data when dropdown value changes
    container.addEventListener('dropdown:select', (e) => {
        const selectedValue = e.detail.value;
        if (rows[rowIndex] !== undefined) {
            rows[rowIndex].job_no = selectedValue || '';
        }
    });
}

function setupBulkCreateTable() {
    renderBulkCreateTable();
}

function renderBulkCreateTable() {
    const container = document.getElementById('bulk-create-table-container');
    if (!container) return;
    
    let html = `
        <div class="bulk-create-header mb-4">
            <p class="text-muted small">Birden fazla görev oluşturmak için aşağıdaki tabloyu kullanın.</p>
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
            if (col.key === 'job_no') {
                // Use dropdown container for job_no
                html += `<td><div id="job-no-dropdown-${i}" class="job-no-dropdown-container"></div></td>`;
            } else if (col.type === 'textarea') {
                html += `<td><textarea class="form-control form-control-sm bulk-input" data-row="${i}" data-key="${col.key}" rows="2" ${col.required ? 'required' : ''}>${row[col.key] || ''}</textarea></td>`;
            } else {
                const inputType = col.type === 'number' ? 'number' : (col.type === 'date' ? 'date' : 'text');
                let inputAttrs = '';
                if (col.key === 'quantity') {
                    inputAttrs = 'min="1"';
                } else if (col.key === 'weight_kg') {
                    inputAttrs = 'min="0" step="0.01"';
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
        <div class="bulk-create-footer mt-2">
            <small class="text-muted text-end d-block">Toplam satır sayısı: ${rows.length}</small>
        </div>`;
    
    container.innerHTML = html;
    
    // Initialize job order dropdowns for all rows
    setTimeout(() => {
        rows.forEach((row, i) => {
            initializeJobOrderDropdown(i, row.job_no);
        });
    }, 100);
    
    // Add "Add Row" button if not already present
    const actionsContainer = document.querySelector('.bulk-create-actions');
    if (actionsContainer && !actionsContainer.querySelector('#bulk-add-row')) {
        const addRowBtn = document.createElement('button');
        addRowBtn.type = 'button';
        addRowBtn.className = 'btn btn-outline-primary btn-sm';
        addRowBtn.id = 'bulk-add-row';
        addRowBtn.innerHTML = '<i class="fas fa-plus me-1"></i>Satır Ekle';
        actionsContainer.insertBefore(addRowBtn, actionsContainer.firstChild);
    }
    
    // Re-attach event listeners after rendering
    setupBulkCreateEventListeners();
}

function setupBulkCreateEventListeners() {
    const container = document.getElementById('bulk-create-table-container');
    if (!container) return;
    
    // Only set up event listeners once using event delegation
    if (eventListenersSetup) return;
    eventListenersSetup = true;
    
    // Use event delegation for better performance and to handle dynamically added elements
    // Input changes
    container.addEventListener('input', (e) => {
        if (e.target.classList.contains('bulk-input')) {
            const row = parseInt(e.target.getAttribute('data-row'));
            const key = e.target.getAttribute('data-key');
            if (rows[row] !== undefined) {
                rows[row][key] = e.target.value;
            }
        }
    });
    
    // Click events for duplicate and remove buttons
    container.addEventListener('click', (e) => {
        // Duplicate row functionality
        if (e.target.closest('.bulk-duplicate')) {
            e.preventDefault();
            e.stopPropagation();
            const btn = e.target.closest('.bulk-duplicate');
            const rowIdx = parseInt(btn.getAttribute('data-row'));
            if (rows[rowIdx] !== undefined) {
                // Get job_no from dropdown before duplicating
                const dropdown = jobOrderDropdowns.get(rowIdx);
                const jobNo = dropdown?.getValue() || rows[rowIdx].job_no || '';
                
                const newRow = { ...rows[rowIdx] };
                newRow.job_no = jobNo; // Preserve job_no value
                rows.splice(rowIdx + 1, 0, newRow);
                
                // Clear dropdown references (will be recreated in renderBulkCreateTable)
                jobOrderDropdowns.clear();
                renderBulkCreateTable();
            }
            return;
        }
        
        // Remove row functionality
        if (e.target.closest('.bulk-remove')) {
            e.preventDefault();
            e.stopPropagation();
            const btn = e.target.closest('.bulk-remove');
            const rowIdx = parseInt(btn.getAttribute('data-row'));
            if (rows.length > 1 && rows[rowIdx] !== undefined) {
                // Clean up dropdown reference
                jobOrderDropdowns.delete(rowIdx);
                rows.splice(rowIdx, 1);
                
                // Re-index dropdown references
                const newDropdowns = new Map();
                jobOrderDropdowns.forEach((dropdown, oldIndex) => {
                    if (oldIndex < rowIdx) {
                        newDropdowns.set(oldIndex, dropdown);
                    } else if (oldIndex > rowIdx) {
                        newDropdowns.set(oldIndex - 1, dropdown);
                    }
                });
                jobOrderDropdowns = newDropdowns;
                
                renderBulkCreateTable();
            }
            return;
        }
    });
    
    // Add row functionality - this button is outside the container, so handle separately
    // We'll set this up in setupEventListeners since it's called after the button is created
}

function setupEventListeners() {
    // Create tasks button
    const createBtn = document.getElementById('create-tasks-btn');
    if (createBtn) {
        createBtn.addEventListener('click', async () => {
            await handleBulkCreateSave();
        });
    }
    
    // Clear form button
    const clearBtn = document.getElementById('clear-form-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            rows = [Object.fromEntries(columns.map(c => [c.key, '']))];
            // Clear dropdown references
            jobOrderDropdowns.clear();
            renderBulkCreateTable();
            showNotification('Form temizlendi', 'info');
        });
    }
    
    // Add row functionality - set up after button is created
    const addRowBtn = document.getElementById('bulk-add-row');
    if (addRowBtn) {
        // Remove existing listeners by replacing the button
        const newAddRowBtn = addRowBtn.cloneNode(true);
        addRowBtn.parentNode.replaceChild(newAddRowBtn, addRowBtn);
        
        newAddRowBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            rows.push(Object.fromEntries(columns.map(c => [c.key, ''])));
            renderBulkCreateTable();
        });
    }
    
    // Export created tasks button
    const exportBtn = document.getElementById('export-created-tasks-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            exportCreatedTasks();
        });
    }
}

async function handleBulkCreateSave() {
    // Validate required fields
    const requiredFields = ['name', 'job_no', 'quantity', 'finish_time'];
    const missingFields = [];
    
    rows.forEach((row, index) => {
        requiredFields.forEach(field => {
            let value = row[field];
            // Get job_no from dropdown if it's job_no field
            if (field === 'job_no') {
                const dropdown = jobOrderDropdowns.get(index);
                value = dropdown?.getValue() || row[field];
            }
            if (!value || value.toString().trim() === '') {
                missingFields.push(`Satır ${index + 1}: ${columns.find(col => col.key === field)?.label}`);
            }
        });
    });
    
    if (missingFields.length > 0) {
        showNotification('Lütfen aşağıdaki zorunlu alanları doldurun:<br>' + missingFields.join('<br>'), 'error');
        return;
    }
    
    // Validate numeric constraints
    const validationErrors = [];
    rows.forEach((row, index) => {
        // Check quantity constraints
        if (row.quantity) {
            const quantity = parseInt(row.quantity);
            if (quantity <= 0) {
                validationErrors.push(`Satır ${index + 1}: Adet 0'dan büyük olmalıdır`);
            }
        }
        // Check weight constraints
        if (row.weight_kg) {
            const weight = parseFloat(row.weight_kg);
            if (isNaN(weight) || weight < 0) {
                validationErrors.push(`Satır ${index + 1}: Ağırlık geçerli bir pozitif sayı olmalıdır`);
            }
        }
    });
    
    if (validationErrors.length > 0) {
        showNotification('Lütfen aşağıdaki hataları düzeltin:<br>' + validationErrors.join('<br>'), 'error');
        return;
    }
    
    // Prepare payload for bulk create parts (without operations)
    const payload = rows.map((row, index) => {
        // Get job_no from dropdown
        const dropdown = jobOrderDropdowns.get(index);
        const jobNo = dropdown?.getValue() || row.job_no || '';
        
        return {
            name: row.name,
            job_no: jobNo,
            image_no: row.image_no || null,
            position_no: row.position_no || null,
            quantity: row.quantity ? parseInt(row.quantity) : null,
            material: row.material || null,
            weight_kg: row.weight_kg ? parseFloat(row.weight_kg) : null,
            finish_time: row.finish_time,
            description: row.description || null,
            operations: [] // Empty operations array - operations can be added later
        };
    });
    
    try {
        const responseData = await bulkCreateParts(payload);
        
        // Check if the response contains created parts data
        if (responseData && responseData.parts && Array.isArray(responseData.parts)) {
            // Show the created parts modal
            showCreatedTasksModal(responseData.parts);
            
            // Reset form
            rows = [Object.fromEntries(columns.map(c => [c.key, '']))];
            jobOrderDropdowns.clear();
            renderBulkCreateTable();
            
            showNotification(`${responseData.created || responseData.parts.length} parça başarıyla oluşturuldu!`, 'success');
        } else {
            showNotification(`${payload.length} parça başarıyla oluşturuldu!`, 'success');
            // Reset form
            rows = [Object.fromEntries(columns.map(c => [c.key, '']))];
            jobOrderDropdowns.clear();
            renderBulkCreateTable();
        }
        
        // Reload tasks list
        await loadTasks(1);
        
    } catch (err) {
        console.error('Error creating parts:', err);
        showNotification('Hata: ' + err.message, 'error');
    }
}

function showCreatedTasksModal(tasks) {
    createdTasks = tasks;
    const tbody = document.getElementById('created-tasks-table');
    
    if (tbody) {
        tbody.innerHTML = tasks.map(task => `
            <tr>
                <td>${task.name || 'N/A'}</td>
                <td><strong class="text-primary">${task.key || 'N/A'}</strong></td>
                <td>${task.job_no || 'N/A'}</td>
            </tr>
        `).join('');
    }
    
    const modal = new bootstrap.Modal(document.getElementById('createdTasksModal'));
    modal.show();
}

function exportCreatedTasks() {
    if (createdTasks.length === 0) {
        showNotification('Dışa aktarılacak görev bulunamadı', 'warning');
        return;
    }
    
    try {
        // Prepare data for Excel
        const headers = [
            'TI No',
            'Görev Adı',
            'İş No',
            'Resim No',
            'Pozisyon No',
            'Adet',
            'Tahmini Saat',
            'Açıklama',
            'Oluşturulma Tarihi'
        ];
        
        // Convert created tasks to worksheet data
        const worksheetData = [
            headers,
            ...createdTasks.map(task => [
                task.key || '',
                task.name || '',
                task.job_no || '',
                task.image_no || '',
                task.position_no || '',
                task.quantity || '',
                task.estimated_hours || '',
                task.description || '',
                task.created_at ? new Date(task.created_at).toLocaleDateString('tr-TR') : ''
            ])
        ];
        
        // Create workbook and worksheet
        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
        
        // Set column widths for better readability
        const columnWidths = [
            { wch: 12 }, // TI No
            { wch: 30 }, // Görev Adı
            { wch: 12 }, // İş No
            { wch: 12 }, // Resim No
            { wch: 12 }, // Pozisyon No
            { wch: 8 },  // Adet
            { wch: 12 }, // Tahmini Saat
            { wch: 30 }, // Açıklama
            { wch: 15 }  // Oluşturulma Tarihi
        ];
        worksheet['!cols'] = columnWidths;
        
        // Add worksheet to workbook
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Oluşturulan Görevler');
        
        // Generate Excel file
        const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        
        // Create download link
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `olusturulan_gorevler_${new Date().toISOString().split('T')[0]}.xlsx`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showNotification(`${createdTasks.length} görev başarıyla Excel dosyası olarak dışa aktarıldı`, 'success');
    } catch (error) {
        console.error('Error exporting created tasks:', error);
        showNotification('Dışa aktarma sırasında hata oluştu', 'error');
    }
}

function initializeFiltersComponent() {
    // Initialize filters component
    taskFilters = new FiltersComponent('filters-placeholder', {
        title: 'Görev Filtreleri',
        onApply: (values) => {
            // Apply filters and reload tasks
            loadTasks(1);
        },
        onClear: () => {
            // Clear filters and reload tasks
            loadTasks(1);
            showNotification('Filtreler temizlendi', 'info');
        },
        onFilterChange: (filterId, value) => {
            // Optional: Handle individual filter changes
            console.log(`Filter ${filterId} changed to:`, value);
        }
    });

    // Add text filters
    taskFilters.addTextFilter({
        id: 'key-filter',
        label: 'TI No',
        placeholder: 'TI-001',
        colSize: 2
    });

    taskFilters.addTextFilter({
        id: 'name-filter',
        label: 'Görev Adı',
        placeholder: 'Görev adı',
        colSize: 2
    });

    taskFilters.addTextFilter({
        id: 'job-no-filter',
        label: 'İş No',
        placeholder: 'İş numarası',
        colSize: 2
    });

    taskFilters.addTextFilter({
        id: 'image-no-filter',
        label: 'Resim No',
        placeholder: 'Resim numarası',
        colSize: 2
    });

    taskFilters.addTextFilter({
        id: 'position-no-filter',
        label: 'Pozisyon No',
        placeholder: 'Pozisyon numarası',
        colSize: 2
    });

    // Add date filters
    taskFilters.addDateFilter({
        id: 'finish-time-filter',
        label: 'Bitiş Tarihi',
        colSize: 2
    });

    taskFilters.addDateFilter({
        id: 'finish-time-gte-filter',
        label: 'Bitiş Tarihi (Başlangıç)',
        colSize: 2
    });

    taskFilters.addDateFilter({
        id: 'finish-time-lte-filter',
        label: 'Bitiş Tarihi (Bitiş)',
        colSize: 2
    });

    // Add checkbox filters
    taskFilters.addCheckboxFilter({
        id: 'has-timer-filter',
        label: 'Zamanlayıcı Var',
        checked: false,
        colSize: 2
    });

    taskFilters.addCheckboxFilter({
        id: 'exceeded-estimated-hours-filter',
        label: 'Tahmini Saati Aşan',
        checked: false,
        colSize: 2
    });
}

function initializeTableComponent() {
    // Initialize table component
    tasksTable = new TableComponent('tasks-table-container', {
        title: 'Oluşturduğum Görevler',
        icon: 'fas fa-table',
        iconColor: 'text-primary',
        columns: [
            {
                field: 'key',
                label: 'TI No',
                sortable: true,
                width: '10%',
                formatter: (value) => `<span class="task-key">${value || '-'}</span>`
            },
            {
                field: 'name',
                label: 'Ad',
                sortable: true,
                width: '12%',
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
                width: '8%',
                formatter: (value) => value || '-'
            },
            {
                field: 'image_no',
                label: 'Resim No',
                sortable: true,
                width: '8%',
                formatter: (value) => value || '-'
            },
            {
                field: 'position_no',
                label: 'Poz No',
                sortable: true,
                width: '8%',
                formatter: (value) => value || '-'
            },
            {
                field: 'quantity',
                label: 'Adet',
                sortable: true,
                width: '6%',
                type: 'number',
                formatter: (value) => `<span class="quantity-badge">${value || 0}</span>`
            },
            {
                field: 'estimated_hours',
                label: 'Tahmini Saat',
                sortable: true,
                width: '10%',
                type: 'number',
                formatter: (value) => `<span class="estimated-hours">${value ? value + ' saat' : 'Belirtilmemiş'}</span>`
            },
            {
                field: 'total_hours_spent',
                label: 'Harcanan Saat',
                sortable: true,
                width: '10%',
                formatter: (value) => `<span class="hours-spent">${value || 0} saat</span>`
            },
            {
                field: 'finish_time',
                label: 'Bitmesi Planlanan Tarih',
                sortable: true,
                width: '12%',
                formatter: (value, row) => {
                    if (row.planned_end_ms) {
                        return new Date(row.planned_end_ms).toLocaleDateString('tr-TR');
                    }
                    return 'Belirtilmemiş';
                }
            },
            {
                field: 'completion_date',
                label: 'Tamamlanma Tarihi',
                sortable: true,
                width: '12%',
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
                width: '8%',
                formatter: (value, row) => {
                    if (row.completion_date) {
                        return '<span class="status-badge status-green">Tamamlandı</span>';
                    } else if (row.total_hours_spent > 0) {
                        return '<span class="status-badge status-yellow">Çalışıldı</span>';
                    } else {
                        return '<span class="status-badge status-grey">Bekliyor</span>';
                    }
                }
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
            loadTasks(page);
        },
        onPageSizeChange: (newSize) => {
            if (tasksTable) {
                tasksTable.options.itemsPerPage = newSize;
            }
            currentPage = 1;
            loadTasks(1);
        },
        onSort: (field, direction) => {
            currentSortField = field;
            currentSortDirection = direction;
            loadTasks(1);
        },
        exportable: true,
        refreshable: true,
        onRefresh: () => {
            loadTasks(currentPage);
        },
        striped: false,
        small: false,
        emptyMessage: 'Görev bulunamadı',
        emptyIcon: 'fas fa-tasks'
    });
}

async function loadTasks(page = 1) {
    if (isLoading) return;
    
    isLoading = true;
    
    // Set loading state on table component
    if (tasksTable) {
        tasksTable.setLoading(true);
    }
    
    try {
        const filters = buildTaskQuery(page);
        const data = await getParts(filters);
        
        tasks = Array.isArray(data.results) ? data.results : (Array.isArray(data) ? data : []);
        totalTasks = data.count || tasks.length;
        currentPage = page;
        
        // Update table component with new data
        if (tasksTable) {
            tasksTable.setLoading(false);
            tasksTable.updateData(tasks, totalTasks, currentPage);
        }
    } catch (error) {
        console.error('Error loading parts:', error);
        showNotification('Parçalar yüklenirken hata oluştu', 'error');
        tasks = [];
        totalTasks = 0;
        
        // Update table component with empty data
        if (tasksTable) {
            tasksTable.setLoading(false);
            tasksTable.updateData([], 0, 1);
        }
    } finally {
        isLoading = false;
    }
}

function buildTaskQuery(page = 1) {
    const filters = {};
    
    // Always filter by current user's created_by
    if (currentUser && currentUser.id) {
        filters.created_by = currentUser.id.toString();
    }
    
    // Get filter values from the filters component
    const filterValues = taskFilters ? taskFilters.getFilterValues() : {};
    
    // Add filters
    const keyFilter = filterValues['key-filter']?.trim();
    const nameFilter = filterValues['name-filter']?.trim();
    const jobNoFilter = filterValues['job-no-filter']?.trim();
    const imageNoFilter = filterValues['image-no-filter']?.trim();
    const positionNoFilter = filterValues['position-no-filter']?.trim();
    const finishTimeFilter = filterValues['finish-time-filter'];
    const finishTimeGteFilter = filterValues['finish-time-gte-filter'];
    const finishTimeLteFilter = filterValues['finish-time-lte-filter'];
    const hasTimerFilter = filterValues['has-timer-filter'] || false;
    const exceededEstimatedHoursFilter = filterValues['exceeded-estimated-hours-filter'] || false;
    
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
    
    // Add finish time filters
    if (finishTimeFilter) {
        filters.finish_time = finishTimeFilter;
    }
    if (finishTimeGteFilter) {
        filters.finish_time__gte = finishTimeGteFilter;
    }
    if (finishTimeLteFilter) {
        filters.finish_time__lte = finishTimeLteFilter;
    }
    
    // Add has_timer filter (if applicable for parts)
    if (hasTimerFilter) {
        filters.has_timer = 'true';
    }
    
    // Add exceeded estimated hours filter (if applicable for parts)
    if (exceededEstimatedHoursFilter) {
        filters.exceeded_estimated_hours = 'true';
    }
    
    // Add pagination
    filters.page = page;
    const pageSize = tasksTable ? tasksTable.options.itemsPerPage : 20;
    filters.page_size = pageSize;
    
    // Add ordering
    const orderingParam = currentSortDirection === 'asc' ? currentSortField : `-${currentSortField}`;
    filters.ordering = orderingParam;
    
    return filters;
}

