import { initNavbar } from '../../../components/navbar.js';
import { ModernDropdown } from '../../../components/dropdown/dropdown.js';
import { fetchMachines } from '../../../apis/machines.js';
import { fetchTasks, deleteTask as deleteTaskAPI, updateTask as updateTaskAPI, fetchTaskById, createTask as createTaskAPI, bulkCreateTasks, markTaskCompleted, unmarkTaskCompleted } from '../../../apis/tasks.js';
import { fetchTimers } from '../../../apis/timers.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
import { StatisticsCards } from '../../../components/statistics-cards/statistics-cards.js';
import { DisplayModal } from '../../../components/display-modal/display-modal.js';
import { TableComponent } from '../../../components/table/table.js';

// State management
let currentPage = 1;
let currentFilter = 'all';
let currentOrdering = 'key';
let currentSortField = 'key';
let currentSortDirection = 'asc';
let tasks = [];
let machines = [];
let totalTasks = 0;
let isLoading = false;
let createdTasks = []; // Store created tasks for displaying keys
let isInlineEditing = false; // Flag to prevent re-rendering during inline editing
let tasksStats = null; // Statistics Cards component instance
let taskFilters = null; // Filters component instance

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    await initNavbar();
    
    // Initialize header component
    const header = new HeaderComponent({
        title: 'Talaşlı İmalat Görevleri',
        subtitle: 'Görev yönetimi ve takibi',
        icon: 'tasks',
        showBackButton: 'block',
        showCreateButton: 'block',
        showBulkCreateButton: 'block',
        createButtonText: '      Yeni Görev',
        bulkCreateButtonText: 'Toplu Oluştur',
        onBackClick: () => window.location.href = '/manufacturing/machining/',
        onCreateClick: () => showCreateTaskModal(),
        onBulkCreateClick: () => showBulkCreateModal()
    });
    
    // Initialize Statistics Cards component
    tasksStats = new StatisticsCards('tasks-statistics', {
        cards: [
            { title: 'Tüm Görevler', value: '0', icon: 'fas fa-list', color: 'primary', id: 'all-tasks-count' },
            { title: 'Aktif Görevler', value: '0', icon: 'fas fa-play', color: 'success', id: 'active-tasks-count' },
            { title: 'Tamamlanan', value: '0', icon: 'fas fa-check', color: 'info', id: 'completed-tasks-count' },
            { title: 'Bekleyen', value: '0', icon: 'fas fa-clock', color: 'warning', id: 'pending-tasks-count' }
        ],
        compact: true,
        animation: true
    });
    
    await initializeTasks();
    setupEventListeners();
    setupUrlHandlers();
});

async function initializeTasks() {
    try {
        initializeFiltersComponent();
        await loadMachines();
        initializeSortableHeaders();
        
        await loadTasks();
        updateTaskCounts();
    } catch (error) {
        console.error('Error initializing tasks:', error);
        showNotification('Görevler yüklenirken hata oluştu', 'error');
    }
}

async function loadMachines() {
    try {
        const machinesResponse = await fetchMachines(1, 100, { used_in: 'machining' });
        machines = machinesResponse.results || machinesResponse || [];
        
        // Update machine filter options if filters component is initialized
        if (taskFilters) {
            const machineOptions = [
                { value: '', label: 'Tüm Makineler' },
                ...machines.map(machine => ({ value: machine.id.toString(), label: machine.name }))
            ];
            taskFilters.updateFilterOptions('machine-filter', machineOptions);
        }
        
        // Populate modal machine dropdowns
        populateModalMachineDropdowns();
        
        // Set default status filter to 'active' if no URL parameters were applied
        const filterApplied = handleUrlParameters();
        if (!filterApplied && taskFilters) {
            taskFilters.setFilterValues({ 'status-filter': 'active' });
        }
    } catch (error) {
        console.error('Error loading machines:', error);
        machines = [];
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

    // Add dropdown filters with initial empty options
    taskFilters.addDropdownFilter({
        id: 'machine-filter',
        label: 'Makine',
        options: [
            { value: '', label: 'Tüm Makineler' }
        ],
        placeholder: 'Tüm Makineler',
        colSize: 2
    });

    taskFilters.addDropdownFilter({
        id: 'status-filter',
        label: 'Durum',
        options: [
            { value: '', label: 'Tümü' },
            { value: 'active', label: 'Aktif' },
            { value: 'completed', label: 'Tamamlanan' },
            { value: 'pending', label: 'Bekliyor' },
            { value: 'worked_on', label: 'Çalışıldı' }
        ],
        placeholder: 'Tümü',
        colSize: 2
    });
}

// Handle URL parameters for filtering and task modal
function handleUrlParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const filterParam = urlParams.get('filter');
    const taskParam = urlParams.get('task');
    
    // Handle task parameter to open modal
    if (taskParam) {
        // Open the task details modal with the specified task key
        showCompletionData(taskParam);
        return true; // Indicate that a parameter was handled
    }
    
    if (filterParam && taskFilters) {
        // Set the key filter with the provided value
        taskFilters.setFilterValues({ 'key-filter': filterParam });
        
        // Show a notification that the page is filtered
        showNotification(`"${filterParam}" için filtrelenmiş sonuçlar gösteriliyor`, 'info');
        
        // Automatically apply the filter
        return true; // Indicate that a filter was applied
    }
    
    return false; // No parameter was applied
}

function populateModalMachineDropdowns() {
    const taskMachine = document.getElementById('task-machine');
    const editTaskMachine = document.getElementById('edit-task-machine');
    
    if (taskMachine) {
        taskMachine.innerHTML = '<option value="">Makine seçin...</option>';
        machines.forEach(machine => {
            taskMachine.innerHTML += `<option value="${machine.id}">${machine.name}</option>`;
        });
    }
    
    if (editTaskMachine) {
        editTaskMachine.innerHTML = '<option value="">Makine seçin...</option>';
        machines.forEach(machine => {
            editTaskMachine.innerHTML += `<option value="${machine.id}">${machine.name}</option>`;
        });
    }
}

function initializeSortableHeaders() {
    const sortableHeaders = document.querySelectorAll('.sortable');
    sortableHeaders.forEach(header => {
        header.addEventListener('click', () => {
            const field = header.getAttribute('data-field');
            handleColumnSort(field);
        });
    });
    
    // Set initial sort indicator
    const initialHeader = document.querySelector(`[data-field="${currentSortField}"]`);
    if (initialHeader) {
        initialHeader.classList.add(`sort-${currentSortDirection}`);
    }
}

function handleColumnSort(field) {
    // Clear previous sort indicators
    document.querySelectorAll('.sortable').forEach(header => {
        header.classList.remove('sort-asc', 'sort-desc');
    });
    
    // Determine sort direction
    if (currentSortField === field) {
        // Toggle direction if same field
        currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        // New field, start with ascending
        currentSortField = field;
        currentSortDirection = 'asc';
    }
    
    // Update current ordering
    currentOrdering = currentSortDirection === 'asc' ? field : `-${field}`;
    
    // Update sort indicator
    const header = document.querySelector(`[data-field="${field}"]`);
    if (header) {
        header.classList.add(`sort-${currentSortDirection}`);
    }
    
    // Reload tasks with new sorting
    loadTasks(1);
}

async function loadTasks(page = 1) {
    if (isLoading) return;
    
    // Don't reload if inline editing is active
    if (isInlineEditing) {
        console.log('Skipping loadTasks due to active inline editing');
        return;
    }
    
    isLoading = true;
    showLoadingState();
    
    try {
        const queryParams = buildTaskQuery(page);
        const response = await fetchTasks(queryParams);
        
        if (response.ok) {
            const data = await response.json();
            tasks = Array.isArray(data.results) ? data.results : [];
            totalTasks = data.count || 0;
            currentPage = page;
            
            renderTasksTable();
            renderPagination();
            updateTaskCounts();
        } else {
            throw new Error('Failed to load tasks');
        }
    } catch (error) {
        console.error('Error loading tasks:', error);
        showNotification('Görevler yüklenirken hata oluştu', 'error');
        tasks = [];
        totalTasks = 0;
    } finally {
        isLoading = false;
        hideLoadingState();
    }
}

function buildTaskQuery(page = 1) {
    const params = new URLSearchParams();
    
    // Get filter values from the filters component
    const filterValues = taskFilters ? taskFilters.getFilterValues() : {};
    
    // Add filters
    const keyFilter = filterValues['key-filter']?.trim();
    const nameFilter = filterValues['name-filter']?.trim();
    const jobNoFilter = filterValues['job-no-filter']?.trim();
    const machineFilter = filterValues['machine-filter'] || '';
    const statusFilter = filterValues['status-filter'] || '';
    
    if (keyFilter) {
        let key = keyFilter;
        if (/^\d+$/.test(key)) {
            key = 'TI-' + key;
        }
        params.append('key', key);
    }
    
    if (nameFilter) params.append('name', nameFilter);
    if (jobNoFilter) params.append('job_no', jobNoFilter);
    if (machineFilter) params.append('machine_fk', machineFilter);
    
    // Add status filter
    if (statusFilter === 'active') {
        params.append('completion_date__isnull', 'true');
    } else if (statusFilter === 'completed') {
        params.append('completion_date__isnull', 'false');
    } else if (statusFilter === 'pending') {
        params.append('completion_date__isnull', 'true');
        params.append('has_timer', 'false');
    } else if (statusFilter === 'worked_on') {
        params.append('completion_date__isnull', 'true');
        params.append('has_timer', 'true');
    }
    
    // Add pagination
    params.append('page', page);
    params.append('page_size', '20');
    
    // Add ordering
    const orderingParam = currentSortDirection === 'asc' ? currentSortField : `-${currentSortField}`;
    params.append('ordering', orderingParam);
    
    return `?${params.toString()}`;
}

function renderTasksTable() {
    const tbody = document.getElementById('tasks-table-body');
    if (!tbody) return;
    
    if (tasks.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="12" class="text-center" style="height: 200px; vertical-align: middle;">
                    <div class="empty-state">
                        <i class="fas fa-tasks"></i>
                        <h5>Görev Bulunamadı</h5>
                        <p>Filtrelerinizi değiştirmeyi deneyin veya yeni bir görev oluşturun.</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = tasks.map(task => `
        <tr class="data-update" data-task-key="${task.key}">
            <td>
                <span class="task-key">${task.key || 'N/A'}</span>
            </td>
            <td class="editable-cell" data-field="name" data-task-key="${task.key}">
                <div class="task-name">
                    <strong>${task.name || 'N/A'}</strong>
                    ${task.description ? `<br><small class="text-muted">${task.description}</small>` : ''}
                </div>
            </td>
            <td class="editable-cell" data-field="job_no" data-task-key="${task.key}">${task.job_no || 'N/A'}</td>
            <td class="editable-cell" data-field="image_no" data-task-key="${task.key}">${task.image_no || 'N/A'}</td>
            <td class="editable-cell" data-field="position_no" data-task-key="${task.key}">${task.position_no || 'N/A'}</td>
            <td class="editable-cell" data-field="quantity" data-task-key="${task.key}">
                <span class="quantity-badge">${task.quantity || 0}</span>
            </td>
            <td class="editable-cell" data-field="machine_name" data-task-key="${task.key}">
                <span class="machine-name">${task.machine_name || 'N/A'}</span>
            </td>
            <td class="editable-cell" data-field="estimated_hours" data-task-key="${task.key}">
                <span class="estimated-hours">${task.estimated_hours ? task.estimated_hours + ' saat' : 'Belirtilmemiş'}</span>
            </td>
            <td>
                <span class="hours-spent">${task.total_hours_spent || 0} saat</span>
            </td>
            <td class="editable-cell" data-field="finish_time" data-task-key="${task.key}">
                ${task.planned_end_ms ? new Date(task.planned_end_ms).toLocaleDateString('tr-TR') : 'Belirtilmemiş'}
            </td>
            <td class="editable-cell" data-field="status" data-task-key="${task.key}">
                ${getStatusBadge(task)}
            </td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-sm btn-outline-success" onclick="showCompletionData('${task.key}')" title="Görev Verileri">
                        <i class="fas fa-chart-line"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteTask('${task.key}')" title="Sil">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
    
    // Add click event listeners for inline editing
    setupInlineEditing();
}

function getStatusBadge(task) {
    if (task.completion_date) {
        return '<span class="status-badge completed">Tamamlandı</span>';
    } else if (task.total_hours_spent > 0) {
        return '<span class="status-badge worked-on">Çalışıldı</span>';
    } else {
        return '<span class="status-badge pending">Bekliyor</span>';
    }
}

function renderPagination() {
    const pagination = document.getElementById('tasks-pagination');
    if (!pagination) return;
    
    const totalPages = Math.ceil(totalTasks / 20);
    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }
    
    let html = '';
    
    // Previous button
    html += `
        <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="changePage(${currentPage - 1})">
                <i class="fas fa-chevron-left"></i>
            </a>
        </li>
    `;
    
    // Page numbers
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, currentPage + 2);
    
    for (let i = startPage; i <= endPage; i++) {
        html += `
            <li class="page-item ${i === currentPage ? 'active' : ''}">
                <a class="page-link" href="#" onclick="changePage(${i})">${i}</a>
            </li>
        `;
    }
    
    // Next button
    html += `
        <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="changePage(${currentPage + 1})">
                <i class="fas fa-chevron-right"></i>
            </a>
        </li>
    `;
    
    pagination.innerHTML = html;
}

function updateTaskCounts() {
    // Calculate counts from current data
    const allCount = totalTasks;
    const activeCount = tasks.filter(t => t.total_hours_spent > 0 && !t.completion_date).length;
    const completedCount = tasks.filter(t => t.completion_date).length;
    const pendingCount = tasks.filter(t => t.total_hours_spent === 0 && !t.completion_date).length;
    
    // Update statistics cards using the component
    if (tasksStats) {
        tasksStats.updateValues({
            0: allCount.toString(),
            1: activeCount.toString(),
            2: completedCount.toString(),
            3: pendingCount.toString()
        });
    }
}



function setupEventListeners() {
    // Refresh button
    document.getElementById('refresh-tasks')?.addEventListener('click', () => {
        loadTasks(currentPage);
    });
    
    // Export button
    document.getElementById('export-tasks')?.addEventListener('click', () => {
        exportTasks();
    });
    
    // Save task button
    document.getElementById('save-task-btn')?.addEventListener('click', () => {
        saveTask();
    });
    
    // Update task button
    document.getElementById('update-task-btn')?.addEventListener('click', () => {
        updateTask();
    });
    
    // Confirm delete button
    document.getElementById('confirm-delete-btn')?.addEventListener('click', async () => {
        const taskKey = window.pendingDeleteTaskKey;
        if (!taskKey) return;
        
        try {
            const response = await deleteTaskAPI(taskKey);
            
            if (response.ok) {
                showNotification('Görev silindi', 'success');
                // Hide the modal
                bootstrap.Modal.getInstance(document.getElementById('deleteConfirmModal')).hide();
                // Clear the pending delete key
                window.pendingDeleteTaskKey = null;
                // Reload tasks
                loadTasks(currentPage);
            } else {
                throw new Error('Failed to delete task');
            }
        } catch (error) {
            console.error('Error deleting task:', error);
            showNotification('Görev silinirken hata oluştu', 'error');
        }
    });
    
    // Export created tasks button
    document.getElementById('export-created-tasks-btn')?.addEventListener('click', () => {
        exportCreatedTasks();
    });
}

function setupUrlHandlers() {
    // Handle browser back/forward navigation
    window.addEventListener('popstate', (event) => {
        const urlParams = new URLSearchParams(window.location.search);
        const taskParam = urlParams.get('task');
        
        if (taskParam) {
            // Open modal if task parameter is present
            showCompletionData(taskParam);
        } else {
            // Close any open modals if no task parameter
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
            'Makine',
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
                task.machine_name || '',
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
            { wch: 15 }, // Makine
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

function showCreatedTasksModal(tasks) {
    createdTasks = tasks;
    const tbody = document.getElementById('created-tasks-table');
    
    if (tbody) {
        tbody.innerHTML = tasks.map(task => `
            <tr>
                <td>${task.name || 'N/A'}</td>
                <td><strong class="text-primary">${task.key || 'N/A'}</strong></td>
                <td>${task.job_no || 'N/A'}</td>
                <td>${task.machine_name || 'N/A'}</td>
            </tr>
        `).join('');
    }
    
    const modal = new bootstrap.Modal(document.getElementById('createdTasksModal'));
    modal.show();
}

function showCreateTaskModal() {
    const modal = new bootstrap.Modal(document.getElementById('createTaskModal'));
    modal.show();
}

function showBulkCreateModal() {
    const modalElement = document.getElementById('bulkCreateModal');
    const modal = new bootstrap.Modal(modalElement, {
        backdrop: 'static', // Prevents closing when clicking outside
        keyboard: false     // Prevents closing with Escape key
    });
    loadBulkCreateContent();
    modal.show();
}

async function loadBulkCreateContent() {
    const container = document.querySelector('.bulk-create-container');
    if (!container) return;
    
    // Define columns for bulk creation
    const columns = [
        { key: 'name', label: 'Ad', required: true },
        { key: 'job_no', label: 'İş No', required: true },
        { key: 'image_no', label: 'Resim No', required: false },
        { key: 'position_no', label: 'Pozisyon No', required: false },
        { key: 'quantity', label: 'Adet', required: true, type: 'number' },
        { key: 'estimated_hours', label: 'Tahmini Saat', required: true, type: 'number' },
        { key: 'machine_fk', label: 'Makine', required: true, type: 'select' },
        { key: 'finish_time', label: 'Bitiş Tarihi', required: false, type: 'date' }
    ];
    
    let rows = [Object.fromEntries(columns.map(c => [c.key, '']))];
    let hasUnsavedChanges = false;
    let initialRows = JSON.stringify(rows);
    
    function checkForUnsavedChanges() {
        const currentRows = JSON.stringify(rows);
        hasUnsavedChanges = currentRows !== initialRows;
        return hasUnsavedChanges;
    }
    
    function updateInitialState() {
        initialRows = JSON.stringify(rows);
        hasUnsavedChanges = false;
    }
    
    function renderBulkTable() {
        let html = `
            <div class="bulk-create-header mb-4">
                <h6 class="mb-2">
                    <i class="fas fa-layer-group me-2"></i>Toplu Görev Oluşturma
                </h6>
                <p class="text-muted small">Birden fazla görev oluşturmak için aşağıdaki tabloyu kullanın.</p>
            </div>
            <form id="bulk-task-form">
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
                    // Render machine dropdown
                    html += `<td><select class="form-control form-control-sm bulk-input" data-row="${i}" data-key="${col.key}" ${col.required ? 'required' : ''}>`;
                    html += `<option value="">Makine seçin...</option>`;
                    machines.forEach(machine => {
                        const selected = row[col.key] == machine.id ? 'selected' : '';
                        html += `<option value="${machine.id}" ${selected}>${machine.name}</option>`;
                    });
                    html += `</select></td>`;
                } else {
                    const inputType = col.type === 'number' ? 'number' : (col.type === 'date' ? 'date' : 'text');
                    let inputAttrs = '';
                    if (col.key === 'estimated_hours') {
                        inputAttrs = 'step="0.01" min="0.01"';
                    } else if (col.key === 'quantity') {
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
        <div class="bulk-create-actions mt-3">
            <button type="button" class="btn btn-outline-primary btn-sm" id="bulk-add-row">
                <i class="fas fa-plus me-1"></i>Satır Ekle
            </button>
            <button type="submit" class="btn btn-primary btn-sm ms-2">
                <i class="fas fa-save me-1"></i>Görevleri Oluştur
            </button>
        </div>
        </form>`;
        
        container.innerHTML = html;
        
        // Add event listeners
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
            btn.addEventListener('click', () => {
                const rowIdx = parseInt(btn.getAttribute('data-row'));
                const newRow = { ...rows[rowIdx] };
                rows.splice(rowIdx + 1, 0, newRow);
                checkForUnsavedChanges();
                renderBulkTable();
            });
        });
        
        document.querySelectorAll('.bulk-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                const rowIdx = parseInt(btn.getAttribute('data-row'));
                if (rows.length > 1) {
                    rows.splice(rowIdx, 1);
                    checkForUnsavedChanges();
                    renderBulkTable();
                }
            });
        });
        
        document.getElementById('bulk-add-row').onclick = () => {
            rows.push(Object.fromEntries(columns.map(c => [c.key, ''])));
            checkForUnsavedChanges();
            renderBulkTable();
        };
        
        document.getElementById('bulk-task-form').onsubmit = async (e) => {
            e.preventDefault();
            
            // Validate required fields
            const requiredFields = ['name', 'job_no', 'quantity', 'estimated_hours', 'machine_fk'];
            const missingFields = [];
            
            rows.forEach((row, index) => {
                requiredFields.forEach(field => {
                    if (!row[field] || row[field].toString().trim() === '') {
                        missingFields.push(`Satır ${index + 1}: ${columns.find(col => col.key === field)?.label}`);
                    }
                });
            });
            
            if (missingFields.length > 0) {
                showNotification('Lütfen aşağıdaki zorunlu alanları doldurun:\n' + missingFields.join('\n'), 'error');
                return;
            }
            
            // Validate numeric constraints
            const validationErrors = [];
            rows.forEach((row, index) => {
                // Check estimated_hours constraints
                if (row.estimated_hours) {
                    const hours = parseFloat(row.estimated_hours);
                    if (hours <= 0) {
                        validationErrors.push(`Satır ${index + 1}: Tahmini Saat 0'dan büyük olmalıdır`);
                    }
                    if (hours.toString().includes('.') && hours.toString().split('.')[1].length > 2) {
                        validationErrors.push(`Satır ${index + 1}: Tahmini Saat en fazla 2 ondalık basamak içerebilir`);
                    }
                }
                
                // Check quantity constraints
                if (row.quantity) {
                    const quantity = parseInt(row.quantity);
                    if (quantity <= 0) {
                        validationErrors.push(`Satır ${index + 1}: Adet 0'dan büyük olmalıdır`);
                    }
                }
            });
            
            if (validationErrors.length > 0) {
                showNotification('Lütfen aşağıdaki hataları düzeltin:\n' + validationErrors.join('\n'), 'error');
                return;
            }
            
            // Prepare payload
            const payload = rows.map(row => ({
                name: row.name,
                job_no: row.job_no,
                image_no: row.image_no,
                position_no: row.position_no,
                quantity: row.quantity ? parseInt(row.quantity) : null,
                estimated_hours: row.estimated_hours ? parseFloat(row.estimated_hours) : null,
                machine_fk: row.machine_fk ? parseInt(row.machine_fk) : null,
                finish_time: row.finish_time || null
            }));
            
            try {
                const response = await bulkCreateTasks(payload);
                
                if (!response.ok) throw new Error('Toplu görev oluşturulamadı');
                
                const responseData = await response.json();
                
                // Check if the response contains created tasks data
                if (responseData && Array.isArray(responseData)) {
                    // Map the created tasks with machine names
                    const createdTasksWithMachineNames = responseData.map(task => {
                        const machine = machines.find(m => m.id == task.machine_fk);
                        return {
                            ...task,
                            machine_name: machine ? machine.name : 'N/A'
                        };
                    });
                    
                    // Show the created tasks modal
                    showCreatedTasksModal(createdTasksWithMachineNames);
                } else {
                    showNotification(`${payload.length} görev başarıyla oluşturuldu!`, 'success');
                }
                
                rows = [Object.fromEntries(columns.map(c => [c.key, '']))];
                updateInitialState();
                renderBulkTable();
                
                // Reload tasks list
                loadTasks(currentPage);
                
                // Close the modal after successful creation
                const modal = bootstrap.Modal.getInstance(document.getElementById('bulkCreateModal'));
                if (modal) {
                    modal.hide();
                }
                
            } catch (err) {
                console.error('Error creating bulk tasks:', err);
                showNotification('Hata: ' + err.message, 'error');
            }
        };
    }
    
    // Render the table
    renderBulkTable();
}

async function saveTask() {
    const form = document.getElementById('create-task-form');
    if (!form) return;
    
    const taskData = {
        name: document.getElementById('task-name')?.value,
        job_no: document.getElementById('task-job-no')?.value,
        image_no: document.getElementById('task-image-no')?.value,
        position_no: document.getElementById('task-position-no')?.value,
        quantity: parseInt(document.getElementById('task-quantity')?.value) || 0,
        estimated_hours: document.getElementById('task-estimated-hours')?.value || null,
        machine_fk: document.getElementById('task-machine')?.value,
        finish_time: document.getElementById('task-finish-time')?.value || null,
        description: document.getElementById('task-description')?.value
    };
    
    try {
        const response = await createTaskAPI(taskData);
        
        if (response.ok) {
            const responseData = await response.json();
            
            // Check if the response contains created task data
            if (responseData && responseData.key) {
                // Find the machine name for display
                const machine = machines.find(m => m.id == taskData.machine_fk);
                const createdTask = {
                    ...responseData,
                    machine_name: machine ? machine.name : 'N/A'
                };
                
                // Show the created task modal
                showCreatedTasksModal([createdTask]);
            } else {
                showNotification('Görev başarıyla oluşturuldu', 'success');
            }
            
            bootstrap.Modal.getInstance(document.getElementById('createTaskModal')).hide();
            form.reset();
            loadTasks(currentPage);
        } else {
            throw new Error('Failed to create task');
        }
    } catch (error) {
        console.error('Error creating task:', error);
        showNotification('Görev oluşturulurken hata oluştu', 'error');
    }
}

async function updateTask() {
    const form = document.getElementById('edit-task-form');
    if (!form) return;
    
    const taskKey = document.getElementById('edit-task-key')?.value;
    if (!taskKey) {
        showNotification('Görev anahtarı bulunamadı', 'error');
        return;
    }
    
    const taskData = {
        name: document.getElementById('edit-task-name')?.value,
        job_no: document.getElementById('edit-task-job-no')?.value,
        image_no: document.getElementById('edit-task-image-no')?.value,
        position_no: document.getElementById('edit-task-position-no')?.value,
        quantity: parseInt(document.getElementById('edit-task-quantity')?.value) || 0,
        estimated_hours: document.getElementById('edit-task-estimated-hours')?.value || null,
        machine_fk: document.getElementById('edit-task-machine')?.value,
        finish_time: document.getElementById('edit-task-finish-time')?.value || null,
        description: document.getElementById('edit-task-description')?.value
    };
    
    try {
        const response = await updateTaskAPI(taskKey, taskData);
        
        if (response.ok) {
            showNotification('Görev başarıyla güncellendi', 'success');
            bootstrap.Modal.getInstance(document.getElementById('editTaskModal')).hide();
            form.reset();
            loadTasks(currentPage);
        } else {
            throw new Error('Failed to update task');
        }
    } catch (error) {
        console.error('Error updating task:', error);
        showNotification('Görev güncellenirken hata oluştu', 'error');
    }
}

// Global functions for table actions
window.editTask = function(taskKey) {
    // For now, this will show a notification that inline editing is available
    showNotification('Hücreye tıklayarak düzenleme yapabilirsiniz', 'info');
};

window.showCompletionData = async function(taskKey) {
    try {
        // Update URL to include task key parameter
        const url = new URL(window.location);
        url.searchParams.set('task', taskKey);
        window.history.pushState({ task: taskKey }, '', url);
        
        // Fetch task data from API instead of using list data
        const task = await fetchTaskById(taskKey);
        
        if (task) {
            showCompletionDataModal(task);
        } else {
            showNotification('Görev bulunamadı', 'error');
        }
    } catch (error) {
        console.error('Error showing completion data:', error);
        showNotification('Görev verileri gösterilirken hata oluştu', 'error');
    }
};

async function addTimersTable(displayModal, task) {
    try {
        // Fetch timers for this task
        const response = await fetchTimers(null, null, task.key);
        
        // Handle different response structures
        let timers = [];
        console.log('Timers response:', response); // Debug log
        
        if (Array.isArray(response)) {
            timers = response;
        } else if (response && Array.isArray(response.results)) {
            timers = response.results;
        } else if (response && response.data && Array.isArray(response.data)) {
            timers = response.data;
        } else {
            console.warn('Unexpected timers response structure:', response);
        }
        
        // Convert Unix timestamps to Date objects for easier handling
        timers = timers.map(timer => ({
            ...timer,
            start_time: timer.start_time ? new Date(timer.start_time) : null,
            finish_time: timer.finish_time ? new Date(timer.finish_time) : null
        }));
        
        // Create a container for the table
        const tableContainerId = `timers-table-${task.key.replace(/[^a-zA-Z0-9]/g, '')}`;
        const tableContainerHtml = `<div id="${tableContainerId}"></div>`;
        
        displayModal.addCustomSection({
            customContent: tableContainerHtml
        });
        
        // Wait for DOM to be updated before initializing the table component
        setTimeout(() => {
            // Initialize the table component
            const timersTable = new TableComponent(tableContainerId, {
            title: 'Zamanlayıcı Kayıtları',
            icon: 'fas fa-clock',
            iconColor: 'text-primary',
            columns: [
                {
                    field: 'username',
                    label: 'Kullanıcı',
                    sortable: true,
                    width: '12%'
                },
                {
                    field: 'start_time',
                    label: 'Başlangıç',
                    sortable: true,
                    width: '25%',
                    formatter: (value) => {
                        if (!value) return '-';
                        const date = value.toLocaleDateString('tr-TR');
                        const time = value.toLocaleTimeString('tr-TR');
                        return `${date}<br><small class="text-muted">${time}</small>`;
                    }
                },
                {
                    field: 'finish_time',
                    label: 'Bitiş',
                    sortable: true,
                    width: '25%',
                    formatter: (value) => {
                        if (!value) return '-';
                        const date = value.toLocaleDateString('tr-TR');
                        const time = value.toLocaleTimeString('tr-TR');
                        return `${date}<br><small class="text-muted">${time}</small>`;
                    }
                },
                {
                    field: 'machine_name',
                    label: 'Makine',
                    sortable: true,
                    width: '13%'
                },
                {
                    field: 'duration',
                    label: 'Süre',
                    sortable: true,
                    width: '10%',
                    formatter: (value, row) => {
                        if (!row || !row.start_time) return '-';
                        
                        const startTime = row.start_time; // Already converted to Date object
                        const finishTime = row.finish_time; // Already converted to Date object or null
                        const isRunning = !finishTime;
                        
                        if (isRunning) {
                            const now = new Date();
                            const diffMs = now.getTime() - startTime.getTime();
                            const diffHours = (diffMs / (1000 * 60 * 60)).toFixed(2);
                            return `${diffHours} saat`;
                        } else {
                            const diffMs = finishTime.getTime() - startTime.getTime();
                            const diffHours = (diffMs / (1000 * 60 * 60)).toFixed(2);
                            return `${diffHours} saat`;
                        }
                    }
                }
            ],
            data: timers.filter(timer => timer && timer.start_time), // Filter out null/undefined timers
            sortable: true,
            small: true,
            striped: true,
                emptyMessage: 'Henüz zamanlayıcı kaydı bulunmamaktadır.',
                emptyIcon: 'fas fa-clock'
            });
            
            // If there are running timers, set up real-time updates
            const runningTimers = timers.filter(timer => !timer.finish_time);
            if (runningTimers.length > 0) {
                setupRealTimeTimerUpdates(runningTimers, timersTable);
            }
        }, 100); // Small delay to ensure DOM is updated
        
    } catch (error) {
        console.error('Error loading timers:', error);
        
        // Add error state section
        const errorStateHtml = `
            <div class="text-center py-4">
                <i class="fas fa-exclamation-triangle fa-3x text-danger mb-3"></i>
                <h5 class="text-danger">Zamanlayıcı Kayıtları Yüklenemedi</h5>
                <p class="text-muted">Zamanlayıcı kayıtları yüklenirken bir hata oluştu.</p>
            </div>
        `;
        
        displayModal.addCustomSection({
            title: 'Zamanlayıcı Kayıtları',
            icon: 'fas fa-clock',
            iconColor: 'text-primary',
            customContent: errorStateHtml
        });
    }
}

function setupRealTimeTimerUpdates(runningTimers, timersTable) {
    // Update running timers every 30 seconds
    const updateInterval = setInterval(() => {
        const now = new Date();
        
        // Update the data for running timers
        const updatedData = timersTable.options.data.map(timer => {
            if (!timer.finish_time) {
                // This is a running timer, update its duration
                const startTime = timer.start_time; // Already converted to Date object
                const diffMs = now.getTime() - startTime.getTime();
                const diffHours = (diffMs / (1000 * 60 * 60)).toFixed(2);
                
                // Create a new timer object with updated duration
                return {
                    ...timer,
                    _updatedDuration: `${diffHours} saat`
                };
            }
            return timer;
        });
        
        // Update the table with new data
        timersTable.updateData(updatedData);
        
    }, 30000); // Update every 30 seconds
    
    // Clean up interval when modal is closed
    const modalElement = document.querySelector('#display-modal-container .modal');
    if (modalElement) {
        modalElement.addEventListener('hidden.bs.modal', () => {
            clearInterval(updateInterval);
        });
    }
}

async function showCompletionDataModal(task) {
    // Determine if task is completed
    const isCompleted = task.completion_date;
    
    // Calculate progress for unfinished tasks
    let progressPercentage = 0;
    let progressColor = 'secondary';
    let timeRemaining = '';
    let remaining_text = '';
    let efficiency = 'N/A';
    let hourDifference = 'N/A';
    let dateDifference = 'N/A';
    
    if (!isCompleted) {
        const now = new Date();
        const finishTime = task.finish_time ? new Date(task.finish_time) : null;
        const totalDuration = task.estimated_hours ? parseFloat(task.estimated_hours) : 0;
        const elapsed = task.total_hours_spent || 0;
        
        // Calculate progress percentage
        if (totalDuration > 0) {
            progressPercentage = Math.min(Math.max((elapsed / totalDuration) * 100, 0), 100);
        }
        
        // Calculate efficiency
        if (elapsed > 0 && totalDuration > 0) {
            efficiency = `${((totalDuration / elapsed) * 100).toFixed(1)}%`;
        }
        
        // Calculate hour difference
        if (totalDuration > 0) {
            const diff = (elapsed - totalDuration).toFixed(2);
            if (elapsed > totalDuration) {
                hourDifference = `${diff} saat fazla`;
            } else if (elapsed < totalDuration) {
                hourDifference = `${Math.abs(diff)} saat kaldı`;
            } else {
                hourDifference = 'Tam zamanında';
            }
        }
        
        // Calculate date difference
        if (task.planned_end_ms) {
            // Set both dates to midnight to get only day difference
            const nowOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const plannedEndOnly = new Date(task.planned_end_ms);
            const plannedEndDateOnly = new Date(plannedEndOnly.getFullYear(), plannedEndOnly.getMonth(), plannedEndOnly.getDate());
            
            const diffTime = plannedEndDateOnly.getTime() - nowOnly.getTime();
            const diffDays = diffTime / (1000 * 60 * 60 * 24);
            
            if (diffDays > 0) {
                dateDifference = `${diffDays} gün kaldı`;
            } else if (diffDays < 0) {
                dateDifference = `${Math.abs(diffDays)} gün gecikme`;
            } else {
                dateDifference = 'Bugün bitmesi gerekiyor';
            }
        }
        
        // Calculate remaining hours
        const remaining = totalDuration > 0 ? Math.abs(totalDuration - elapsed).toFixed(2) : 'N/A';
        
        // Determine progress color and remaining text
        if (progressPercentage >= 100) {
            progressColor = 'danger'; // Overdue
            remaining_text = totalDuration > 0 ? `${remaining} saat gecikme` : 'Süre belirtilmemiş';
        } else if (progressPercentage >= 75) {
            progressColor = 'warning'; // Almost due
            remaining_text = totalDuration > 0 ? `${remaining} saat kaldı` : 'Süre belirtilmemiş';
        } else {
            progressColor = 'info'; // On track
            remaining_text = totalDuration > 0 ? `${remaining} saat kaldı` : 'Süre belirtilmemiş';
        }
        
        // Calculate time remaining
        if (task.planned_end_ms) {
            const plannedEnd = new Date(task.planned_end_ms);
            const timeDiff = plannedEnd.getTime() - now.getTime();
            const daysRemaining = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
            
            if (daysRemaining > 0) {
                timeRemaining = `${daysRemaining} gün kaldı`;
            } else if (daysRemaining < 0) {
                timeRemaining = `${Math.abs(daysRemaining)} gün gecikme`;
            } else {
                timeRemaining = 'Bugün bitmesi gerekiyor';
            }
        } else {
            timeRemaining = 'Bitiş tarihi belirtilmemiş';
        }
    }
    
    // Create display modal instance
    const displayModal = new DisplayModal('display-modal-container', {
        title: `${isCompleted ? 'Tamamlanma Verileri' : 'Görev Durumu'} - ${task.key}`,
        icon: `fas fa-chart-line ${isCompleted ? 'text-success' : 'text-primary'}`,
        size: 'lg',
        showEditButton: false
    });
    
    // Add task information section
    displayModal.addSection({
        title: 'Görev Bilgileri',
        icon: 'fas fa-info-circle',
        iconColor: 'text-primary',
        fields: [
            {
                id: 'task-key',
                label: 'TI No',
                value: task.key,
                type: 'text',
                colSize: 4,
                copyable: true
            },
            {
                id: 'task-name',
                label: 'Görev Adı',
                value: task.name,
                type: 'text',
                colSize: 4
            },
            {
                id: 'job-no',
                label: 'İş No',
                value: task.job_no,
                type: 'text',
                colSize: 4
            },
            {
                id: 'image-no',
                label: 'Resim No',
                value: task.image_no,
                type: 'text',
                colSize: 4
            },
            {
                id: 'position-no',
                label: 'Pozisyon No',
                value: task.position_no,
                type: 'text',
                colSize: 4
            },
            {
                id: 'quantity',
                label: 'Adet',
                value: task.quantity,
                type: 'number',
                colSize: 4
            }
        ]
    });
    
    // Add status/completion information section
    if (isCompleted) {
        displayModal.addSection({
            title: 'Tamamlanma Bilgileri',
            icon: 'fas fa-check-circle',
            iconColor: 'text-success',
            fields: [
                {
                    id: 'completed-by',
                    label: 'Tamamlayan',
                    value: task.completed_by_username || '-',
                    type: 'text',
                    colSize: 4
                },
                {
                    id: 'completion-date',
                    label: 'Tamamlanma Tarihi',
                    value: task.completion_date ? new Date(task.completion_date).toLocaleDateString('tr-TR') : '-',
                    type: 'date',
                    colSize: 4
                },
                {
                    id: 'finish-time',
                    label: 'Bitmesi Planlanan Tarih',
                    value: task.planned_end_ms ? new Date(task.planned_end_ms).toLocaleDateString('tr-TR') : '-',
                    type: 'date',
                    colSize: 4
                },
                {
                    id: 'machine',
                    label: 'Makine',
                    value: task.machine_name || '-',
                    type: 'text',
                    colSize: 4
                },
                {
                    id: 'estimated-hours',
                    label: 'Tahmini Saat',
                    value: task.estimated_hours || '-',
                    type: 'number',
                    colSize: 4
                },
                {
                    id: 'hours-spent',
                    label: 'Harcanan Saat',
                    value: task.total_hours_spent || '0',
                    type: 'number',
                    colSize: 4
                }
            ]
        });
    } else {
        // Add status section with custom HTML for ongoing tasks
        const statusHtml = `
            <div class="row g-3">
                <div class="col-md-4">
                    <div class="field-display mb-2">
                        <label class="field-label">Durum</label>
                        <div class="field-value">
                            ${getStatusBadge(task)}
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="field-display mb-2">
                        <label class="field-label">Başlangıç</label>
                        <div class="field-value">
                            ${task.planned_start_ms ? new Date(task.planned_start_ms).toLocaleDateString('tr-TR') : '-'}
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="field-display mb-2">
                        <label class="field-label">Bitmesi Planlanan Tarih</label>
                        <div class="field-value">
                            ${task.planned_end_ms ? new Date(task.planned_end_ms).toLocaleDateString('tr-TR') : '-'}
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="field-display mb-2">
                        <label class="field-label">Makine</label>
                        <div class="field-value">
                            ${task.machine_name || '-'}
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="field-display mb-2">
                        <label class="field-label">Tahmini Saat</label>
                        <div class="field-value">
                            ${task.estimated_hours || '-'}
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="field-display mb-2">
                        <label class="field-label">Harcanan Saat</label>
                        <div class="field-value">
                            ${task.total_hours_spent || '0'}
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        displayModal.addCustomSection({
            title: 'Görev Durumu',
            icon: 'fas fa-clock',
            iconColor: 'text-primary',
            customContent: statusHtml
        });
    }
    
    // Add performance analysis section with custom HTML
    if (isCompleted) {
        // Calculate completed task performance metrics
        const efficiency = task.estimated_hours ? 
            `${((task.estimated_hours / task.total_hours_spent) * 100).toFixed(1)}%` : 
            'N/A';
        const hourDiff = task.estimated_hours ? 
            `${(task.estimated_hours - task.total_hours_spent).toFixed(2)} saat` : 
            'N/A';
        
        // Calculate date difference for completed tasks
        let dateDiff = 'N/A';
        if (task.completion_date && task.planned_end_ms) {
            const completionDate = new Date(task.completion_date);
            const plannedEnd = new Date(task.planned_end_ms);
            
            // Set both dates to midnight to get only day difference
            const completionDateOnly = new Date(completionDate.getFullYear(), completionDate.getMonth(), completionDate.getDate());
            const plannedEndOnly = new Date(plannedEnd.getFullYear(), plannedEnd.getMonth(), plannedEnd.getDate());
            
            const diffTime = completionDateOnly.getTime() - plannedEndOnly.getTime();
            const diffDays = diffTime / (1000 * 60 * 60 * 24);
            
            if (diffDays > 0) {
                dateDiff = `+${diffDays} gün gecikme`;
            } else if (diffDays < 0) {
                dateDiff = `${Math.abs(diffDays)} gün erken`;
            } else {
                dateDiff = 'Tam zamanında';
            }
        }
        
        // Create simple performance analysis HTML
        const performanceHtml = `
            <div class="simple-performance">
                <div class="performance-row">
                    <div class="metric-item">
                        <span class="metric-label">Verimlilik:</span>
                        <span class="metric-value">${efficiency}</span>
                    </div>
                    <div class="metric-item">
                        <span class="metric-label">Saat Farkı:</span>
                        <span class="metric-value">${hourDiff}</span>
                    </div>
                    <div class="metric-item">
                        <span class="metric-label">Tarih Farkı:</span>
                        <span class="metric-value">${dateDiff}</span>
                    </div>
                </div>
            </div>
        `;
        
        displayModal.addCustomSection({
            title: 'Performans Analizi',
            icon: 'fas fa-chart-bar',
            iconColor: 'text-primary',
            customContent: performanceHtml
        });
    } else {
        // Create simple performance analysis HTML for ongoing tasks
        const performanceHtml = `
            <div class="simple-performance">
                <div class="performance-row">
                    <div class="metric-item">
                        <span class="metric-label">Verimlilik:</span>
                        <span class="metric-value">${efficiency}</span>
                    </div>
                    <div class="metric-item">
                        <span class="metric-label">Saat Farkı:</span>
                        <span class="metric-value">${hourDifference}</span>
                    </div>
                    <div class="metric-item">
                        <span class="metric-label">Tarih Farkı:</span>
                        <span class="metric-value">${dateDifference}</span>
                    </div>
                </div>
            </div>
        `;
        
        displayModal.addCustomSection({
            title: 'Performans Analizi',
            icon: 'fas fa-chart-bar',
            iconColor: 'text-primary',
            customContent: performanceHtml
        });
    }
    
    // Add timers table section
    await addTimersTable(displayModal, task);
    
    // Add export button to footer if task is completed
    if (isCompleted) {
        // Create custom footer with export button
        const modalFooter = displayModal.container.querySelector('.modal-footer');
        if (modalFooter) {
            modalFooter.innerHTML = `
                <button type="button" class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal">
                    <i class="fas fa-times me-1"></i>Kapat
                </button>
                <button type="button" class="btn btn-sm btn-primary" onclick="exportCompletionData('${task.key}')">
                    <i class="fas fa-download me-1"></i>Dışa Aktar
                </button>
            `;
        }
    }
    
    // Render and show modal
    displayModal.render().show();
    
    // Add event listener to clean up URL when modal is closed
    const modalElement = displayModal.container.querySelector('.modal');
    if (modalElement) {
        modalElement.addEventListener('hidden.bs.modal', () => {
            // Remove task parameter from URL when modal is closed
            const url = new URL(window.location);
            if (url.searchParams.has('task')) {
                url.searchParams.delete('task');
                window.history.pushState({}, '', url);
            }
        });
    }
}

window.exportCompletionData = function(taskKey) {
    try {
        // Find the task in the global tasks array
        const task = tasks.find(t => t.key === taskKey);
        
        if (task && task.completion_date) {
            
            // Prepare data for Excel export
            const headers = [
                'TI No',
                'Görev Adı',
                'İş No',
                'Resim No',
                'Pozisyon No',
                'Adet',
                'Tamamlayan',
                'Tamamlanma Tarihi',
                'Bitiş Tarihi',
                'Makine',
                'Tahmini Saat',
                'Toplam Harcanan Saat',
                'Verimlilik (%)',
                'Saat Farkı',
                'Tarih Farkı'
            ];
            
            const efficiency = task.estimated_hours ? ((task.total_hours_spent / task.estimated_hours) * 100).toFixed(1) : 'N/A';
            const hourDifference = task.estimated_hours ? (task.total_hours_spent - task.estimated_hours).toFixed(2) : 'N/A';
            
            // Calculate date difference
            let dateDifference = 'N/A';
            if (task.completion_date && task.planned_end_ms) {
                const completionDate = new Date(task.completion_date);
                const plannedEnd = new Date(task.planned_end_ms);
                const diffTime = completionDate.getTime() - plannedEnd.getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                if (diffDays > 0) {
                    dateDifference = `+${diffDays} gün gecikme`;
                } else if (diffDays < 0) {
                    dateDifference = `${Math.abs(diffDays)} gün erken`;
                } else {
                    dateDifference = 'Tam zamanında';
                }
            }
            
            const worksheetData = [
                headers,
                [
                    task.key,
                    task.name,
                    task.job_no,
                    task.image_no,
                    task.position_no,
                    task.quantity,
                    task.completed_by_username,
                    task.completion_date ? new Date(task.completion_date).toLocaleDateString('tr-TR') : 'N/A',
                    task.planned_end_ms ? new Date(task.planned_end_ms).toLocaleDateString('tr-TR') : 'N/A',
                    task.machine_name,
                    task.estimated_hours || 'N/A',
                    task.total_hours_spent,
                    efficiency,
                    hourDifference,
                    dateDifference
                ]
            ];
            
            // Create workbook and worksheet
            const workbook = XLSX.utils.book_new();
            const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
            
            // Set column widths
            const columnWidths = [
                { wch: 12 }, // TI No
                { wch: 30 }, // Görev Adı
                { wch: 12 }, // İş No
                { wch: 12 }, // Resim No
                { wch: 12 }, // Pozisyon No
                { wch: 8 },  // Adet
                { wch: 15 }, // Tamamlayan
                { wch: 15 }, // Tamamlanma Tarihi
                { wch: 12 }, // Bitiş Tarihi
                { wch: 20 }, // Makine
                { wch: 12 }, // Tahmini Saat
                { wch: 15 }, // Toplam Harcanan Saat
                { wch: 12 }, // Verimlilik
                { wch: 12 }, // Saat Farkı
                { wch: 15 }  // Tarih Farkı
            ];
            worksheet['!cols'] = columnWidths;
            
            // Add worksheet to workbook
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Tamamlanma Verileri');
            
            // Generate filename
            const filename = `tamamlanma_verileri_${task.key}_${new Date().toISOString().split('T')[0]}.xlsx`;
            
            // Save file
            XLSX.writeFile(workbook, filename);
            
            showNotification('Tamamlanma verileri başarıyla dışa aktarıldı', 'success');
        } else {
            showNotification('Bu görev henüz tamamlanmamış. Sadece tamamlanan görevler dışa aktarılabilir.', 'info');
        }
    } catch (error) {
        console.error('Error exporting completion data:', error);
        showNotification('Dışa aktarma sırasında hata oluştu', 'error');
    }
};



window.deleteTask = function(taskKey) {
    // Set the pending delete key
    window.pendingDeleteTaskKey = taskKey;
    
    // Show the delete confirmation modal
    const deleteModal = new bootstrap.Modal(document.getElementById('deleteConfirmModal'));
    deleteModal.show();
};

// Global function for pagination
window.changePage = function(page) {
    if (page >= 1) {
        loadTasks(page);
    }
};



function showLoadingState() {
    const tableBody = document.getElementById('tasks-table-body');
    if (tableBody) {
        // Create loading rows that maintain table structure
        const loadingRows = [];
        for (let i = 0; i < 5; i++) { // Show 5 loading rows
            loadingRows.push(`
                <tr class="loading-row">
                    <td><div class="loading-skeleton" style="width: 80px;"></div></td>
                    <td><div class="loading-skeleton" style="width: 200px;"></div></td>
                    <td><div class="loading-skeleton" style="width: 100px;"></div></td>
                    <td><div class="loading-skeleton" style="width: 100px;"></div></td>
                    <td><div class="loading-skeleton" style="width: 100px;"></div></td>
                    <td><div class="loading-skeleton" style="width: 60px;"></div></td>
                    <td><div class="loading-skeleton" style="width: 120px;"></div></td>
                    <td><div class="loading-skeleton" style="width: 100px;"></div></td>
                    <td><div class="loading-skeleton" style="width: 100px;"></div></td>
                    <td><div class="loading-skeleton" style="width: 120px;"></div></td>
                    <td><div class="loading-skeleton" style="width: 80px;"></div></td>
                    <td><div class="loading-skeleton" style="width: 100px;"></div></td>
                </tr>
            `);
        }
        tableBody.innerHTML = loadingRows.join('');
    }
}

function hideLoadingState() {
    // Loading state is cleared when table is rendered
}

function exportTasks() {
    if (tasks.length === 0) {
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
            'Makine',
            'Tahmini Saat',
            'Harcanan Saat',
            'Durum',
            'Oluşturulma Tarihi',
            'Tamamlanma Tarihi'
        ];
        
        // Convert tasks to worksheet data
        const worksheetData = [
            headers,
            ...tasks.map(task => [
                task.key || '',
                task.name || '',
                task.job_no || '',
                task.image_no || '',
                task.position_no || '',
                task.quantity || '',
                task.machine_name || '',
                task.estimated_hours || '',
                task.total_hours_spent || '',
                task.completion_date ? 'Tamamlanan' : (task.start_date ? 'Aktif' : 'Bekleyen'),
                task.created_at ? new Date(task.created_at).toLocaleDateString('tr-TR') : '',
                task.completion_date ? new Date(task.completion_date).toLocaleDateString('tr-TR') : ''
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
            { wch: 15 }, // Makine
            { wch: 12 }, // Tahmini Saat
            { wch: 12 }, // Harcanan Saat
            { wch: 10 }, // Durum
            { wch: 15 }, // Oluşturulma Tarihi
            { wch: 15 }  // Tamamlanma Tarihi
        ];
        worksheet['!cols'] = columnWidths;
        
        // Add worksheet to workbook
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Görevler');
        
        // Generate Excel file
        const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        
        // Create download link
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `gorevler_${new Date().toISOString().split('T')[0]}.xlsx`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showNotification(`${tasks.length} görev başarıyla Excel dosyası olarak dışa aktarıldı`, 'success');
    } catch (error) {
        console.error('Error exporting tasks:', error);
        showNotification('Dışa aktarma sırasında hata oluştu', 'error');
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

function setupInlineEditing() {
    const editableCells = document.querySelectorAll('.editable-cell');
    
    editableCells.forEach(cell => {
        cell.addEventListener('click', function(e) {
            // Don't trigger if clicking on action buttons
            if (e.target.closest('.action-buttons')) {
                return;
            }
            
            // Skip if already editing globally
            if (isInlineEditing) {
                return;
            }
            
            const taskKey = this.dataset.taskKey;
            const field = this.dataset.field;
            const currentValue = this.textContent.trim();
            
            // Skip if already editing this cell
            if (this.querySelector('input')) {
                return;
            }
            
            startInlineEdit(this, taskKey, field, currentValue);
        });
    });
}

function startInlineEdit(cell, taskKey, field, currentValue) {
    // Prevent multiple simultaneous inline edits
    if (isInlineEditing) {
        return;
    }
    
    // Set inline editing flag
    isInlineEditing = true;
    
    // Clear the flag after 30 seconds as a safety measure
    setTimeout(() => {
        isInlineEditing = false;
    }, 30000);
    
    // Create input element based on field type
    let input;
    
    // Set input type and attributes based on field
    switch (field) {
        case 'quantity':
            input = document.createElement('input');
            input.type = 'number';
            input.min = '1';
            input.className = 'form-control form-control-sm';
            input.value = currentValue === 'N/A' || currentValue === '0' ? '' : currentValue;
            break;
        case 'estimated_hours':
            input = document.createElement('input');
            input.type = 'number';
            input.step = '0.5';
            input.min = '0';
            input.className = 'form-control form-control-sm';
            input.value = currentValue === 'N/A' || currentValue === 'Belirtilmemiş' ? '' : currentValue.replace(' saat', '');
            break;
        case 'machine_name':
            // Create dropdown for machine selection
            input = document.createElement('select');
            input.className = 'form-control form-control-sm';
            
            // Add default option
            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = 'Makine seçin...';
            input.appendChild(defaultOption);
            
            // Add machine options
            machines.forEach(machine => {
                const option = document.createElement('option');
                option.value = machine.id;
                option.textContent = machine.name;
                
                // Select current machine if it matches
                if (machine.name === currentValue || machine.name === currentValue.replace('N/A', '').trim()) {
                    option.selected = true;
                }
                
                input.appendChild(option);
            });
            break;
        case 'status':
            // Create dropdown for status selection
            input = document.createElement('select');
            input.className = 'form-control form-control-sm';
            
            // Add status options
            const statusOptions = [
                { value: 'pending', text: 'Bekliyor' },
                { value: 'completed', text: 'Tamamlandı' }
            ];
            
            statusOptions.forEach(status => {
                const option = document.createElement('option');
                option.value = status.value;
                option.textContent = status.text;
                
                // Select current status if it matches
                const currentStatusText = currentValue.includes('Tamamlandı') ? 'Tamamlandı' : 
                                        currentValue.includes('Çalışıldı') ? 'Çalışıldı' : 'Bekliyor';
                if (status.text === currentStatusText) {
                    option.selected = true;
                }
                
                input.appendChild(option);
            });
            break;
        case 'finish_time':
            input = document.createElement('input');
            input.type = 'date';
            input.className = 'form-control form-control-sm';
            
            // Convert current value to YYYY-MM-DD format for date input
            if (currentValue && currentValue !== 'Belirtilmemiş') {
                try {
                    // First try to parse as Turkish date format (DD.MM.YYYY)
                    let date;
                    if (currentValue.match(/^\d{1,2}\.\d{1,2}\.\d{4}$/)) {
                        // Turkish date format: DD.MM.YYYY
                        const parts = currentValue.split('.');
                        const day = parseInt(parts[0]);
                        const month = parseInt(parts[1]) - 1; // Month is 0-indexed
                        const year = parseInt(parts[2]);
                        date = new Date(year, month, day);
                    } else {
                        // Try parsing as regular date
                        date = new Date(currentValue);
                    }
                    
                    if (!isNaN(date.getTime())) {
                        const year = date.getFullYear();
                        const month = String(date.getMonth() + 1).padStart(2, '0');
                        const day = String(date.getDate()).padStart(2, '0');
                        input.value = `${year}-${month}-${day}`;
                    } else {
                        // If date parsing fails, leave input empty
                        input.value = '';
                    }
                } catch (e) {
                    // If date parsing fails, leave input empty
                    input.value = '';
                }
            } else {
                // If no current value or "Belirtilmemiş", leave input empty
                input.value = '';
            }
            break;
        default:
            input = document.createElement('input');
            input.type = 'text';
            input.className = 'form-control form-control-sm';
            input.value = currentValue === 'N/A' ? '' : currentValue;
    }
    
    // Store original content
    const originalContent = cell.innerHTML;
    
    // Replace cell content with input
    cell.innerHTML = '';
    cell.appendChild(input);
    
    // Focus on input
    input.focus();
    if (input.type !== 'select-one') {
        input.select();
    }
    
    // For select elements, ensure dropdown opens immediately
    if (input.tagName === 'SELECT') {
        // Trigger dropdown to open - use a more reliable method
        setTimeout(() => {
            input.focus();
            
            // Ensure the select element is properly sized and visible
            input.style.width = '100%';
            input.style.minWidth = '120px';
            
            // Try to open the dropdown using the native select method
            try {
                // Method 1: Use the native showPicker method if available (modern browsers)
                if (input.showPicker) {
                    input.showPicker();
                } else {
                    // Method 2: Create and dispatch a mousedown event
                    const mousedownEvent = new MouseEvent('mousedown', {
                        bubbles: true,
                        cancelable: true,
                        view: window,
                        button: 0
                    });
                    input.dispatchEvent(mousedownEvent);
                    
                    // Method 3: Also try a click event as backup
                    setTimeout(() => {
                        const clickEvent = new MouseEvent('click', {
                            bubbles: true,
                            cancelable: true,
                            view: window
                        });
                        input.dispatchEvent(clickEvent);
                    }, 5);
                }
            } catch (e) {
                console.log('Dropdown opening failed, trying alternative method');
                // Fallback: just click the element
                input.click();
            }
        }, 10);
    }
    
    // Handle input events
    input.addEventListener('blur', (e) => {
        // For select elements, don't handle blur immediately
        if (input.tagName === 'SELECT') {
            return;
        }
        
        // Check if input still exists in DOM before proceeding
        if (!input.parentNode) {
            return;
        }
        
        // Add a small delay to prevent race conditions
        setTimeout(() => {
            // Check again if input still exists
            if (input.parentNode) {
                finishInlineEdit(cell, taskKey, field, input.value, originalContent);
            }
        }, 100);
    });
    
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            finishInlineEdit(cell, taskKey, field, input.value, originalContent);
        } else if (e.key === 'Escape') {
            // Check if cell still exists before setting innerHTML
            if (cell && cell.parentNode) {
                cell.innerHTML = originalContent;
            }
        }
    });
    
    // For select elements, handle change event only
    if (input.tagName === 'SELECT') {
        let editCompleted = false; // Flag to prevent multiple finishInlineEdit calls
        
        input.addEventListener('change', () => {
            if (!editCompleted) {
                editCompleted = true;
                finishInlineEdit(cell, taskKey, field, input.value, originalContent);
            }
        });
        
        // Prevent blur when clicking on the select element
        input.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        });
        
        // Prevent blur when clicking on options
        input.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        
        // Add focus event to ensure dropdown opens
        input.addEventListener('focus', () => {
            // Small delay to ensure the element is fully focused
            setTimeout(() => {
                if (document.activeElement === input) {
                    input.click();
                }
            }, 5);
        });
        
        // Add document click listener to close dropdown when clicking outside
        const handleDocumentClick = (e) => {
            if (!input.contains(e.target) && !editCompleted) {
                editCompleted = true;
                finishInlineEdit(cell, taskKey, field, input.value, originalContent);
                document.removeEventListener('click', handleDocumentClick);
            }
        };
        
        // Add the listener immediately but with a small delay to allow the dropdown to open first
        setTimeout(() => {
            document.addEventListener('click', handleDocumentClick);
        }, 50);
    }
}

async function finishInlineEdit(cell, taskKey, field, newValue, originalContent) {
    try {
        // Clear inline editing flag
        isInlineEditing = false;
        
        // Check if this cell is already being processed
        if (cell.dataset.processing === 'true') {
            return;
        }
        
        // Mark this cell as being processed
        cell.dataset.processing = 'true';
        
        // Validate input based on field type
        if (!validateFieldValue(field, newValue)) {
            // Check if cell still exists before setting innerHTML
            if (cell && cell.parentNode) {
                cell.innerHTML = originalContent;
            }
            showNotification('Geçersiz değer', 'error');
            return;
        }
        
        // Find the task in our local array
        const task = tasks.find(t => t.key === taskKey);
        if (!task) {
            // Check if cell still exists before setting innerHTML
            if (cell && cell.parentNode) {
                cell.innerHTML = originalContent;
            }
            return;
        }
        
        // Don't update if value hasn't changed
        const currentValue = getCurrentFieldValue(task, field);
        
        // Special handling for finish_time field to compare dates properly
        if (field === 'finish_time') {
            const currentDate = currentValue ? new Date(currentValue) : null;
            const newDate = newValue ? new Date(newValue) : null;
            
            // Compare dates by converting both to YYYY-MM-DD format
            const formatDate = (date) => {
                if (!date || isNaN(date.getTime())) return '';
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            };
            
            const currentFormatted = formatDate(currentDate);
            const newFormatted = formatDate(newDate);
            
            if (currentFormatted === newFormatted) {
                // Check if cell still exists before setting innerHTML
                if (cell && cell.parentNode) {
                    cell.innerHTML = originalContent;
                }
                return;
            }
        } else if (currentValue === newValue) {
            // Check if cell still exists before setting innerHTML
            if (cell && cell.parentNode) {
                cell.innerHTML = originalContent;
            }
            return;
        }
        
        // Prepare update data
        const updateData = {};
        
        // Handle machine field specially - send machine_fk instead of machine_name
        if (field === 'machine_name') {
            updateData.machine_fk = newValue ? parseInt(newValue) : null;
        } else if (field === 'status') {
            // Handle status updates using specific API functions
            let response;
            if (newValue === 'completed') {
                response = await markTaskCompleted(taskKey);
            } else if (newValue === 'pending') {
                response = await unmarkTaskCompleted(taskKey);
            } else {
                // Check if cell still exists before setting innerHTML
                if (cell && cell.parentNode) {
                    cell.innerHTML = originalContent;
                }
                return;
            }
            
            if (response.ok) {
                // Update local task data
                if (newValue === 'completed') {
                    task.completion_date = new Date().toISOString();
                } else {
                    task.completion_date = null;
                }
                
                // Update cell content
                updateCellContent(cell, field, newValue);
                
                // Update task counts to reflect the change
                updateTaskCounts();
                
                showNotification('Görev durumu başarıyla güncellendi', 'success');
            } else {
                // Revert on error
                if (cell && cell.parentNode) {
                    cell.innerHTML = originalContent;
                }
                showNotification('Görev durumu güncellenirken hata oluştu', 'error');
            }
            return;
        } else {
            updateData[field] = newValue;
        }
        
        // Call the updateTask API
        const response = await updateTaskAPI(taskKey, updateData);
        
        if (response.ok) {
            // Update local task data
            if (field === 'machine_name') {
                task.machine_fk = newValue ? parseInt(newValue) : null;
                // Update machine_name for display
                const selectedMachine = machines.find(m => m.id == newValue);
                task.machine_name = selectedMachine ? selectedMachine.name : 'N/A';
            } else {
                task[field] = newValue;
            }
            
            // Update cell content
            updateCellContent(cell, field, newValue);
            
            showNotification('Görev başarıyla güncellendi', 'success');
        } else {
            // Revert on error
            if (cell && cell.parentNode) {
                cell.innerHTML = originalContent;
            }
            showNotification('Görev güncellenirken hata oluştu', 'error');
        }
    } catch (error) {
        console.error('Error updating task:', error);
        isInlineEditing = false; // Clear flag on error
        if (cell && cell.parentNode) {
            cell.innerHTML = originalContent;
        }
        showNotification('Görev güncellenirken hata oluştu', 'error');
    } finally {
        // Clear the processing flag
        if (cell) {
            cell.dataset.processing = 'false';
        }
    }
}

function validateFieldValue(field, value) {
    if (value === '') return true; // Allow empty values
    
    switch (field) {
        case 'quantity':
            const quantity = parseInt(value);
            return !isNaN(quantity) && quantity >= 1;
        case 'estimated_hours':
            const hours = parseFloat(value);
            return !isNaN(hours) && hours >= 0;
        case 'machine_name':
            // Validate that the machine ID exists in our machines list
            const machineId = parseInt(value);
            return !isNaN(machineId) && machines.some(m => m.id === machineId);
        case 'status':
            // Validate that the status is either 'pending' or 'completed'
            return value === 'pending' || value === 'completed';
        case 'finish_time':
            // Validate date format (YYYY-MM-DD) or empty value
            if (value === '') return true; // Allow empty values
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateRegex.test(value)) return false;
            const date = new Date(value);
            return !isNaN(date.getTime());
        case 'name':
            return value.length <= 255; // Reasonable length limit
        case 'job_no':
        case 'image_no':
        case 'position_no':
            return value.length <= 100; // Reasonable length limit
        default:
            return true;
    }
}

function getCurrentFieldValue(task, field) {
    switch (field) {
        case 'quantity':
            return task.quantity ? task.quantity.toString() : '0';
        case 'estimated_hours':
            return task.estimated_hours ? task.estimated_hours.toString() : '';
        case 'machine_name':
            return task.machine_fk ? task.machine_fk.toString() : '';
        case 'status':
            return task.completion_date ? 'completed' : 'pending';
        case 'finish_time':
            return task.finish_time || '';
        default:
            return task[field] || '';
    }
}

function updateCellContent(cell, field, newValue) {
    // Check if cell still exists before updating
    if (!cell || !cell.parentNode) {
        return;
    }
    
    // Add a small delay to ensure DOM has settled
    setTimeout(() => {
        // Check again if cell still exists
        if (!cell || !cell.parentNode) {
            return;
        }
        
        const displayValue = newValue || 'N/A';
    
    switch (field) {
        case 'name':
            cell.innerHTML = `
                <div class="task-name">
                    <strong>${displayValue}</strong>
                </div>
            `;
            break;
        case 'quantity':
            cell.innerHTML = `<span class="quantity-badge">${displayValue}</span>`;
            break;
        case 'machine_name':
            // For machine field, newValue is the machine ID, so we need to find the machine name
            const selectedMachine = machines.find(m => m.id == newValue);
            const machineName = selectedMachine ? selectedMachine.name : 'N/A';
            cell.innerHTML = `<span class="machine-name">${machineName}</span>`;
            break;
        case 'estimated_hours':
            const hoursValue = newValue ? `${newValue} saat` : 'Belirtilmemiş';
            cell.innerHTML = `<span class="estimated-hours">${hoursValue}</span>`;
            break;
        case 'finish_time':
            if (newValue && newValue !== '') {
                try {
                    const date = new Date(newValue);
                    if (!isNaN(date.getTime())) {
                        cell.innerHTML = date.toLocaleDateString('tr-TR');
                    } else {
                        cell.innerHTML = 'Belirtilmemiş';
                    }
                } catch (e) {
                    cell.innerHTML = 'Belirtilmemiş';
                }
            } else {
                cell.innerHTML = 'Belirtilmemiş';
            }
            break;
        case 'status':
            // Use the same logic as getStatusBadge function
            const task = tasks.find(t => t.key === cell.getAttribute('data-task-key'));
            if (task) {
                if (newValue === 'completed') {
                    cell.innerHTML = '<span class="status-badge completed">Tamamlandı</span>';
                } else {
                    // For pending status, check if task has hours spent
                    if (task.total_hours_spent > 0) {
                        cell.innerHTML = '<span class="status-badge worked-on">Çalışıldı</span>';
                    } else {
                        cell.innerHTML = '<span class="status-badge pending">Bekliyor</span>';
                    }
                }
            } else {
                // Fallback if task not found
                const statusText = newValue === 'completed' ? 'Tamamlandı' : 'Bekliyor';
                const statusClass = newValue === 'completed' ? 'completed' : 'pending';
                cell.innerHTML = `<span class="status-badge ${statusClass}">${statusText}</span>`;
            }
            break;
        default:
            cell.textContent = displayValue;
    }
    }, 50); // Small delay to ensure DOM has settled
} 