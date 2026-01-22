import { initNavbar } from '../../../components/navbar.js';
import { fetchTasks, bulkCreateTasks } from '../../../apis/tasks.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
import { TableComponent } from '../../../components/table/table.js';
import { getUser } from '../../../authService.js';
import { showNotification } from '../../../components/notification/notification.js';

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
    { key: 'finish_time', label: 'Bitiş Tarihi', required: true, type: 'date' },
    { key: 'description', label: 'Açıklama', required: false, type: 'textarea' }
];

let rows = [Object.fromEntries(columns.map(c => [c.key, '']))];
let eventListenersSetup = false;

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
        onBackClick: () => window.location.href = '/manufacturing/machining/'
    });
    
    // Setup bulk create table
    setupBulkCreateTable();
    
    // Setup event listeners
    setupEventListeners();
    
    // Initialize filters and table
    await initializeFiltersComponent();
    await initializeTableComponent();
    
    // Load tasks
    await loadTasks();
});

function setupBulkCreateTable() {
    renderBulkCreateTable();
}

function renderBulkCreateTable() {
    const container = document.getElementById('bulk-create-table-container');
    if (!container) return;
    
    let html = `
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
            if (col.type === 'textarea') {
                html += `<td><textarea class="form-control form-control-sm bulk-input" data-row="${i}" data-key="${col.key}" rows="2" ${col.required ? 'required' : ''}>${row[col.key] || ''}</textarea></td>`;
            } else {
                const inputType = col.type === 'number' ? 'number' : (col.type === 'date' ? 'date' : 'text');
                let inputAttrs = '';
                if (col.key === 'quantity') {
                    inputAttrs = 'min="1"';
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
                const newRow = { ...rows[rowIdx] };
                rows.splice(rowIdx + 1, 0, newRow);
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
                rows.splice(rowIdx, 1);
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
            if (!row[field] || row[field].toString().trim() === '') {
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
    });
    
    if (validationErrors.length > 0) {
        showNotification('Lütfen aşağıdaki hataları düzeltin:<br>' + validationErrors.join('<br>'), 'error');
        return;
    }
    
    // Prepare payload
    const payload = rows.map(row => ({
        name: row.name,
        job_no: row.job_no,
        image_no: row.image_no || null,
        position_no: row.position_no || null,
        quantity: row.quantity ? parseInt(row.quantity) : null,
        finish_time: row.finish_time,
        description: row.description || null
    }));
    
    try {
        const response = await bulkCreateTasks(payload);
        
        if (!response.ok) throw new Error('Görevler oluşturulamadı');
        
        const responseData = await response.json();
        
        // Check if the response contains created tasks data
        if (responseData && Array.isArray(responseData)) {
            // Show the created tasks modal
            showCreatedTasksModal(responseData);
            
            // Reset form
            rows = [Object.fromEntries(columns.map(c => [c.key, '']))];
            renderBulkCreateTable();
        } else {
            showNotification(`${payload.length} görev başarıyla oluşturuldu!`, 'success');
            // Reset form
            rows = [Object.fromEntries(columns.map(c => [c.key, '']))];
            renderBulkCreateTable();
        }
        
        // Reload tasks list
        await loadTasks(1);
        
    } catch (err) {
        console.error('Error creating tasks:', err);
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
        const queryParams = buildTaskQuery(page);
        const response = await fetchTasks(queryParams);
        
        if (response.ok) {
            const data = await response.json();
            tasks = Array.isArray(data.results) ? data.results : [];
            totalTasks = data.count || 0;
            currentPage = page;
            
            // Update table component with new data
            if (tasksTable) {
                tasksTable.setLoading(false);
                tasksTable.updateData(tasks, totalTasks, currentPage);
            }
        } else {
            throw new Error('Failed to load tasks');
        }
    } catch (error) {
        console.error('Error loading tasks:', error);
        showNotification('Görevler yüklenirken hata oluştu', 'error');
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
    const params = new URLSearchParams();
    
    // Always filter by current user's created_by
    if (currentUser && currentUser.id) {
        params.append('created_by', currentUser.id.toString());
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
            key = 'TI-' + key;
        }
        params.append('key', key);
    }
    
    if (nameFilter) params.append('name', nameFilter);
    if (jobNoFilter) params.append('job_no', jobNoFilter);
    if (imageNoFilter) params.append('image_no', imageNoFilter);
    if (positionNoFilter) params.append('position_no', positionNoFilter);
    
    // Add finish time filters
    if (finishTimeFilter) {
        params.append('finish_time', finishTimeFilter);
    }
    if (finishTimeGteFilter) {
        // DateFilter expects date string
        params.append('finish_time__gte', finishTimeGteFilter);
    }
    if (finishTimeLteFilter) {
        // DateFilter expects date string
        params.append('finish_time__lte', finishTimeLteFilter);
    }
    
    // Add has_timer filter
    if (hasTimerFilter) {
        params.append('has_timer', 'true');
    }
    
    // Add exceeded estimated hours filter
    if (exceededEstimatedHoursFilter) {
        params.append('exceeded_estimated_hours', 'true');
    }
    
    // Add pagination
    params.append('page', page);
    const pageSize = tasksTable ? tasksTable.options.itemsPerPage : 20;
    params.append('page_size', String(pageSize));
    
    // Add ordering
    const orderingParam = currentSortDirection === 'asc' ? currentSortField : `-${currentSortField}`;
    params.append('ordering', orderingParam);
    
    return `?${params.toString()}`;
}

