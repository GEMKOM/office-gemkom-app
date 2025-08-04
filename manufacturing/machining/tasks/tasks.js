import { initNavbar } from '../../../components/navbar.js';
import { ModernDropdown } from '../../../components/dropdown.js';
import { fetchMachines } from '../../../generic/machines.js';
import { fetchTasks, deleteTask as deleteTaskAPI, updateTask as updateTaskAPI, fetchTaskById, createTask as createTaskAPI, bulkCreateTasks } from '../../../generic/tasks.js';

// State management
let currentPage = 1;
let currentFilter = 'all';
let currentOrdering = 'job_no';
let currentSortField = 'job_no';
let currentSortDirection = 'asc';
let tasks = [];
let machines = [];
let totalTasks = 0;
let isLoading = false;
let createdTasks = []; // Store created tasks for displaying keys
let machineFilterDropdown = null;
let statusFilterDropdown = null;

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    await initNavbar();
    await initializeTasks();
    setupEventListeners();
});

async function initializeTasks() {
    try {
        await loadMachines();
        initializeSortableHeaders();
        
        // Check for URL parameters and set filters
        const filterApplied = handleUrlParameters();
        
        await loadTasks();
        updateTaskCounts();
    } catch (error) {
        console.error('Error initializing tasks:', error);
        showNotification('Görevler yüklenirken hata oluştu', 'error');
    }
}

async function loadMachines() {
    try {
        machines = await fetchMachines('machining');
        populateMachineFilters();
    } catch (error) {
        console.error('Error loading machines:', error);
        machines = [];
    }
}

// Handle URL parameters for filtering
function handleUrlParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const filterParam = urlParams.get('filter');
    
    if (filterParam) {
        // Set the key filter with the provided value
        const keyFilter = document.getElementById('key-filter');
        if (keyFilter) {
            keyFilter.value = filterParam;
        }
        
        // Show a notification that the page is filtered
        showNotification(`"${filterParam}" için filtrelenmiş sonuçlar gösteriliyor`, 'info');
        
        // Automatically apply the filter
        return true; // Indicate that a filter was applied
    }
    
    return false; // No filter was applied
}

function populateMachineFilters() {
    const machineFilterContainer = document.getElementById('machine-filter-container');
    const taskMachine = document.getElementById('task-machine');
    const editTaskMachine = document.getElementById('edit-task-machine');
    
    // Initialize machine filter dropdown
    if (machineFilterContainer && machines.length > 0) {
        const machineItems = [
            { value: '', text: 'Tüm Makineler' },
            ...machines.map(machine => ({ value: machine.id.toString(), text: machine.name }))
        ];
        
        machineFilterDropdown = new ModernDropdown(machineFilterContainer, {
            placeholder: 'Tüm Makineler',
            searchable: true
        });
        machineFilterDropdown.setItems(machineItems);
    }
    
    // Initialize status filter dropdown
    const statusFilterContainer = document.getElementById('status-filter-container');
    if (statusFilterContainer) {
        const statusItems = [
            { value: '', text: 'Tümü' },
            { value: 'active', text: 'Aktif' },
            { value: 'completed', text: 'Tamamlanan' },
            { value: 'pending', text: 'Bekleyen' }
        ];
        
        statusFilterDropdown = new ModernDropdown(statusFilterContainer, {
            placeholder: 'Tümü',
            searchable: false
        });
        statusFilterDropdown.setItems(statusItems);
    }
    
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
    
    // Add filters
    const keyFilter = document.getElementById('key-filter')?.value.trim();
    const nameFilter = document.getElementById('name-filter')?.value.trim();
    const jobNoFilter = document.getElementById('job-no-filter')?.value.trim();
    const machineFilter = machineFilterDropdown?.getValue() || '';
    const statusFilter = statusFilterDropdown?.getValue() || '';
    
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
                <td colspan="11" class="text-center">
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
        <tr class="data-update">
            <td>
                <span class="task-key">${task.key || 'N/A'}</span>
            </td>
            <td>
                <div class="task-name">
                    <strong>${task.name || 'N/A'}</strong>
                    ${task.description ? `<br><small class="text-muted">${task.description}</small>` : ''}
                </div>
            </td>
            <td>${task.job_no || 'N/A'}</td>
            <td>${task.image_no || 'N/A'}</td>
            <td>${task.position_no || 'N/A'}</td>
            <td>
                <span class="quantity-badge">${task.quantity || 0}</span>
            </td>
            <td>
                <span class="machine-name">${task.machine_name || 'N/A'}</span>
            </td>
            <td>
                <span class="estimated-hours">${task.estimated_hours ? task.estimated_hours + ' saat' : 'Belirtilmemiş'}</span>
            </td>
            <td>
                <span class="hours-spent">${task.total_hours_spent || 0} saat</span>
            </td>
            <td>
                ${getStatusBadge(task)}
            </td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-sm btn-outline-primary" onclick="editTask('${task.key}')" title="Düzenle">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteTask('${task.key}')" title="Sil">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
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
    
    // Animate number updates
    animateNumber('all-tasks-count', allCount);
    animateNumber('active-tasks-count', activeCount);
    animateNumber('completed-tasks-count', completedCount);
    animateNumber('pending-tasks-count', pendingCount);
}

function animateNumber(elementId, targetValue) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    const currentValue = parseInt(element.textContent) || 0;
    const increment = (targetValue - currentValue) / 20;
    let current = currentValue;
    
    const timer = setInterval(() => {
        current += increment;
        if ((increment > 0 && current >= targetValue) || (increment < 0 && current <= targetValue)) {
            element.textContent = targetValue;
            clearInterval(timer);
        } else {
            element.textContent = Math.floor(current);
        }
    }, 50);
}

function setupEventListeners() {
    // Filter button
    document.getElementById('apply-filters')?.addEventListener('click', () => {
        loadTasks(1);
    });
    
    // Clear filters button
    document.getElementById('clear-filters')?.addEventListener('click', () => {
        clearFilters();
    });
    
    // Create task button
    document.getElementById('create-task-btn')?.addEventListener('click', () => {
        showCreateTaskModal();
    });
    
    // Bulk create button
    document.getElementById('bulk-create-btn')?.addEventListener('click', () => {
        showBulkCreateModal();
    });
    
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
    
    // Back to main button
    document.getElementById('back-to-main')?.addEventListener('click', () => {
        window.location.href = '/manufacturing/machining/';
    });
    
    // Enter key support for filters
    document.querySelectorAll('#key-filter, #name-filter, #job-no-filter').forEach(input => {
        input?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                loadTasks(1);
            }
        });
    });
}

function clearFilters() {
    // Clear text inputs
    document.getElementById('key-filter').value = '';
    document.getElementById('name-filter').value = '';
    document.getElementById('job-no-filter').value = '';
    
    // Clear dropdowns
    if (machineFilterDropdown) {
        machineFilterDropdown.setValue('');
    }
    if (statusFilterDropdown) {
        statusFilterDropdown.setValue('');
    }
    
    // Reload tasks
    loadTasks(1);
    showNotification('Filtreler temizlendi', 'info');
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
window.editTask = async function(taskKey) {
    try {
        // Show loading notification instead of replacing table
        const loadingNotification = showNotification('Görev yükleniyor...', 'info');
        
        // Fetch task details
        const task = await fetchTaskById(taskKey);
        if (!task) {
            throw new Error('Görev bulunamadı');
        }
        
        // Remove loading notification
        if (loadingNotification) {
            loadingNotification.remove();
        }
        
        // Populate edit form
        document.getElementById('edit-task-key').value = task.key;
        document.getElementById('edit-task-name').value = task.name || '';
        document.getElementById('edit-task-job-no').value = task.job_no || '';
        document.getElementById('edit-task-image-no').value = task.image_no || '';
        document.getElementById('edit-task-position-no').value = task.position_no || '';
        document.getElementById('edit-task-quantity').value = task.quantity || 1;
        document.getElementById('edit-task-estimated-hours').value = task.estimated_hours || '';
        document.getElementById('edit-task-machine').value = task.machine_fk || '';
        document.getElementById('edit-task-finish-time').value = task.finish_time || '';
        document.getElementById('edit-task-description').value = task.description || '';
        
        // Show edit modal
        const modal = new bootstrap.Modal(document.getElementById('editTaskModal'));
        modal.show();
        
    } catch (error) {
        console.error('Error loading task for edit:', error);
        showNotification('Görev yüklenirken hata oluştu', 'error');
    }
};



window.deleteTask = async function(taskKey) {
    // Find the task in the current list to get its name
    const task = tasks.find(t => t.key === taskKey);
    const taskName = task ? task.name : taskKey;
    
    // Set the task name in the modal
    document.getElementById('delete-task-name').textContent = taskName;
    
    // Store the task key for the confirmation
    window.pendingDeleteTaskKey = taskKey;
    
    // Show the delete confirmation modal
    const modal = new bootstrap.Modal(document.getElementById('deleteConfirmModal'));
    modal.show();
};

window.changePage = function(page) {
    if (page >= 1 && page <= Math.ceil(totalTasks / 20)) {
        loadTasks(page);
    }
};



function showLoadingState() {
    const tableBody = document.getElementById('tasks-table-body');
    if (tableBody) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="11" class="text-center">
                    <div class="loading-spinner"></div>
                    <p class="mt-2">Görevler yükleniyor...</p>
                </td>
            </tr>
        `;
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