import { initNavbar } from '../../../components/navbar.js';
import { fetchMachines } from '../../../generic/machines.js';
import { fetchTasks, deleteTask as deleteTaskAPI, updateTask as updateTaskAPI, fetchTaskById, createTask as createTaskAPI, bulkCreateTasks, markTaskCompleted, unmarkTaskCompleted } from '../../../generic/tasks.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { StatisticsCards } from '../../../components/statistics-cards/statistics-cards.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
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
let tasksStats = null; // Statistics Cards component instance
let taskFilters = null; // Filters component instance
let tasksTable = null; // TableComponent instance

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
});

async function initializeTasks() {
    try {
        initializeFiltersComponent();
        await loadMachines();
        initializeTableComponent();
        
        await loadTasks();
        updateTaskCounts();
    } catch (error) {
        console.error('Error initializing tasks:', error);
        showNotification('Görevler yüklenirken hata oluştu', 'error');
    }
}

function initializeTableComponent() {
    // Initialize TableComponent
    tasksTable = new TableComponent('tasks-table-container', {
        title: 'Görev Listesi',
        titleIcon: 'fas fa-table',
        refreshable: true,
        exportable: true,
        onRefresh: () => loadTasks(),
        onExport: () => exportTasks(),
        editable: true,
        columns: [
            { field: 'key', label: 'TI No', sortable: true, type: 'text', editable: false },
            { field: 'name', label: 'Ad', sortable: true, type: 'text', editable: true },
            { field: 'job_no', label: 'İş No', sortable: true, type: 'text', editable: true },
            { field: 'image_no', label: 'Resim No', sortable: true, type: 'text', editable: true },
            { field: 'position_no', label: 'Poz No', sortable: true, type: 'text', editable: true },
            { field: 'quantity', label: 'Adet', sortable: true, type: 'number', editable: true },
            { field: 'machine_name', label: 'Makine', sortable: true, type: 'select', editable: true, options: machines.map(machine => ({ 
                value: machine.id.toString(), 
                label: machine.name 
            })) },
            { field: 'estimated_hours', label: 'Tahmini Saat', sortable: true, type: 'number', editable: true },
            { field: 'total_hours_spent', label: 'Harcanan Saat', sortable: true, type: 'text', editable: false },
            { field: 'finish_time', label: 'Bitmesi Planlanan Tarih', sortable: true, type: 'date', editable: true },
            { field: 'status', label: 'Durum', sortable: true, type: 'select', editable: true, options: [
                { value: 'pending', label: 'Bekliyor' },
                { value: 'completed', label: 'Tamamlandı' }
            ]}
        ],
        actions: [
            {
                key: 'view-data',
                label: 'Görev Verileri',
                icon: 'fas fa-chart-line',
                class: 'btn-outline-success',
                visible: () => true,
                onClick: (task) => showCompletionData(task.key)
            },
            {
                key: 'delete',
                label: 'Sil',
                icon: 'fas fa-trash',
                class: 'btn-outline-danger',
                visible: () => true,
                onClick: (task) => deleteTask(task.key)
            }
        ],
        onEdit: async (row, field, newValue, oldValue) => {
            return await updateTaskInline(row.key, field, newValue);
        },
        formatters: {
            key: (value) => `<span class="task-key">${value || 'N/A'}</span>`,
            name: (value, task) => `
                <div class="task-name">
                    <strong>${value || 'N/A'}</strong>
                    ${task.description ? `<br><small class="text-muted">${task.description}</small>` : ''}
                </div>
            `,
            quantity: (value) => `<span class="quantity-badge">${value || 0}</span>`,
            machine_name: (value, task) => {
                const machine = machines.find(m => m.id == task.machine_fk);
                return `<span class="machine-name">${machine ? machine.name : 'N/A'}</span>`;
            },
            estimated_hours: (value) => `<span class="estimated-hours">${value ? value + ' saat' : 'Belirtilmemiş'}</span>`,
            total_hours_spent: (value) => `<span class="hours-spent">${value || 0} saat</span>`,
            finish_time: (value) => {
                if (value) {
                    try {
                        const date = new Date(value);
                        return date.toLocaleDateString('tr-TR');
                    } catch (e) {
                        return 'Belirtilmemiş';
                    }
                }
                return 'Belirtilmemiş';
            },
                    status: (value, task) => {
            // Use the value from valueGetter (which is already processed)
            if (value === 'completed') {
                return '<span class="status-badge completed">Tamamlandı</span>';
            } else if (value === 'in-progress') {
                return '<span class="status-badge in-progress">Çalışıldı</span>';
            } else {
                return '<span class="status-badge pending">Bekliyor</span>';
            }
        }
        },
        valueGetters: {
            machine_name: (task) => task.machine_fk ? task.machine_fk.toString() : '',
                    status: (task) => {
            const status = task.completion_date ? 'completed' : (task.total_hours_spent > 0 ? 'in-progress' : 'pending');
            return status;
        }
        },
        validators: {
            quantity: (value) => {
                const quantity = parseInt(value);
                return !isNaN(quantity) && quantity >= 1;
            },
            estimated_hours: (value) => {
                const hours = parseFloat(value);
                return !isNaN(hours) && hours >= 0;
            },
            machine_name: (value) => {
                const machineId = parseInt(value);
                return !isNaN(machineId) && machines.some(m => m.id === machineId);
            },
            status: (value) => value === 'pending' || value === 'in-progress' || value === 'completed',
            finish_time: (value) => {
                if (value === '') return true;
                const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
                if (!dateRegex.test(value)) return false;
                const date = new Date(value);
                return !isNaN(date.getTime());
            }
        },
        onSort: (field, direction) => {
            currentOrdering = direction === 'asc' ? field : `-${field}`;
            loadTasks();
        }
    });
    
    // Set initial sort state
    tasksTable.setSortState('key', 'asc');
}

async function loadMachines() {
    try {
        machines = await fetchMachines('machining');
        
        // Update machine filter options if filters component is initialized
        if (taskFilters) {
            const machineOptions = [
                { value: '', label: 'Tüm Makineler' },
                ...machines.map(machine => ({ value: machine.id.toString(), label: machine.name }))
            ];
            taskFilters.updateFilterOptions('machine-filter', machineOptions);
        }
        
        // Update table component machine options
        if (tasksTable) {
            const machineOptions = machines.map(machine => ({ 
                value: machine.id.toString(), 
                label: machine.name 
            }));
            tasksTable.updateColumn('machine_name', { options: machineOptions });
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
        onApply: (filters) => {
            currentFilter = filters;
            loadTasks();
        },
        onClear: () => {
            currentFilter = {};
            loadTasks();
        },
        compact: true
    });

    // Add filters using the proper methods
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

    taskFilters.addDropdownFilter({
        id: 'machine-filter',
        label: 'Makine',
        placeholder: 'Makine seçin',
        options: [
            { value: '', label: 'Tüm Makineler' }
        ],
        colSize: 2
    });

    taskFilters.addDropdownFilter({
        id: 'status-filter',
        label: 'Durum',
        placeholder: 'Durum seçin',
        options: [
            { value: '', label: 'Tüm Durumlar' },
            { value: 'active', label: 'Aktif' },
            { value: 'completed', label: 'Tamamlanan' },
            { value: 'pending', label: 'Bekleyen' },
            { value: 'hold', label: 'Bekletilen' }
        ],
        value: 'active',
        colSize: 2
    });

    // Apply default filters after initialization
    setTimeout(() => {
        const defaultFilters = {
            'status-filter': 'active'
        };
        currentFilter = defaultFilters;
    }, 100);
}

function handleUrlParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    let filterApplied = false;
    
    // Handle status filter from URL
    const status = urlParams.get('status');
    if (status && taskFilters) {
        taskFilters.setFilterValues({ 'status-filter': status });
        filterApplied = true;
    }
    
    // Handle machine filter from URL
    const machine = urlParams.get('machine');
    if (machine && taskFilters) {
        taskFilters.setFilterValues({ 'machine-filter': machine });
        filterApplied = true;
    }
    
    return filterApplied;
}

function populateModalMachineDropdowns() {
    const createModalSelect = document.getElementById('task-machine');
    const editModalSelect = document.getElementById('edit-task-machine');
    
    if (createModalSelect) {
        createModalSelect.innerHTML = '<option value="">Makine seçin...</option>';
        machines.forEach(machine => {
            const option = document.createElement('option');
            option.value = machine.id;
            option.textContent = machine.name;
            createModalSelect.appendChild(option);
        });
    }
    
    if (editModalSelect) {
        editModalSelect.innerHTML = '<option value="">Makine seçin...</option>';
        machines.forEach(machine => {
            const option = document.createElement('option');
            option.value = machine.id;
            option.textContent = machine.name;
            editModalSelect.appendChild(option);
        });
    }
}

async function loadTasks(page = 1) {
    try {
        if (isLoading) return;
        isLoading = true;
        
        if (tasksTable) {
            tasksTable.setLoading(true);
        }
        
        const query = buildTaskQuery(page);
        const response = await fetchTasks(query);
        
        // Check if response is JSON or needs to be parsed
        let responseData;
        if (typeof response === 'string') {
            responseData = JSON.parse(response);
        } else if (response.json) {
            responseData = await response.json();
        } else {
            responseData = response;
        }
        
        tasks = responseData.results || responseData.tasks || [];
        totalTasks = responseData.count || responseData.total || 0;
        currentPage = page;
        
        // Update table data
        if (tasksTable) {
            tasksTable.updateData(tasks);
            tasksTable.setLoading(false);
        }
        
        updateTaskCounts();
        
    } catch (error) {
        console.error('Error loading tasks:', error);
        showNotification('Görevler yüklenirken hata oluştu', 'error');
        
        if (tasksTable) {
            tasksTable.setLoading(false);
        }
    } finally {
        isLoading = false;
    }
}

function buildTaskQuery(page = 1) {
    const params = new URLSearchParams();
    
    params.append('page', page);
    params.append('page_size', 20);
    params.append('ordering', currentOrdering);
    
    // Add filters
    if (currentFilter) {
        if (currentFilter['status-filter']) {
            const status = currentFilter['status-filter'];
            if (status === 'active') {
                params.append('completion_date__isnull', 'true');
            } else if (status === 'completed') {
                params.append('completion_date__isnull', 'false');
            } else if (status === 'pending') {
                params.append('total_hours_spent', '0');
                params.append('completion_date__isnull', 'true');
            }
        }
        
        if (currentFilter['machine-filter']) {
            params.append('machine_fk', currentFilter['machine-filter']);
        }
        
        if (currentFilter['key-filter']) {
            params.append('key', currentFilter['key-filter']);
        }
        
        if (currentFilter['name-filter']) {
            params.append('name', currentFilter['name-filter']);
        }
        
        if (currentFilter['job-no-filter']) {
            params.append('job_no', currentFilter['job-no-filter']);
        }
    }
    
    const query = `?${params.toString()}`;
    return query;
}

function updateTaskCounts() {
    if (!tasksStats) return;
    
    const allTasks = totalTasks;
    const activeTasks = tasks.filter(task => !task.completion_date).length;
    const completedTasks = tasks.filter(task => task.completion_date).length;
    const pendingTasks = tasks.filter(task => !task.completion_date && task.total_hours_spent === 0).length;
    
    tasksStats.updateCard('all-tasks-count', allTasks.toString());
    tasksStats.updateCard('active-tasks-count', activeTasks.toString());
    tasksStats.updateCard('completed-tasks-count', completedTasks.toString());
    tasksStats.updateCard('pending-tasks-count', pendingTasks.toString());
}

async function updateTaskInline(taskKey, field, newValue) {
    try {
        const task = tasks.find(t => t.key === taskKey);
        if (!task) {
            throw new Error('Task not found');
        }
        
        // Handle status updates
        if (field === 'status') {
            // Get current status value
            const currentStatus = task.completion_date ? 'completed' : (task.total_hours_spent > 0 ? 'in-progress' : 'pending');
            
            // Only send request if status actually changes
            if (newValue === currentStatus) {
                return true;
            }
            
            try {
                if (newValue === 'completed') {
                    // Mark task as completed
                    await markTaskCompleted(taskKey);
                    showNotification('Görev tamamlandı olarak işaretlendi', 'success');
                } else if (newValue === 'pending') {
                    // Unmark task as completed
                    await unmarkTaskCompleted(taskKey);
                    showNotification('Görev bekliyor olarak işaretlendi', 'success');
                }
                
                // Reload tasks to get fresh data
                await loadTasks();
                return true;
            } catch (error) {
                console.error('Error updating task status:', error);
                showNotification('Durum güncellenirken hata oluştu', 'error');
                return false;
            }
        }
        
        // Prepare update data
        const updateData = {};
        
        switch (field) {
            case 'name':
            case 'job_no':
            case 'image_no':
            case 'position_no':
            case 'quantity':
            case 'estimated_hours':
            case 'finish_time':
                updateData[field] = newValue;
                break;
            case 'machine_name':
                updateData.machine_fk = parseInt(newValue);
                break;
            default:
                throw new Error(`Unknown field: ${field}`);
        }
        
        // Call API to update task
        const updatedTask = await updateTaskAPI(taskKey, updateData);
        
        // Update local task data
        const taskIndex = tasks.findIndex(t => t.key === taskKey);
        if (taskIndex !== -1) {
            tasks[taskIndex] = { ...tasks[taskIndex], ...updatedTask };
        }
        
        showNotification('Görev başarıyla güncellendi', 'success');
        return updatedTask; // Return the updated task data
        
    } catch (error) {
        console.error('Error updating task:', error);
        showNotification('Görev güncellenirken hata oluştu', 'error');
        return false;
    }
}

function setupEventListeners() {
    // Create task modal events
    const createTaskModal = document.getElementById('createTaskModal');
    if (createTaskModal) {
        createTaskModal.addEventListener('show.bs.modal', () => {
            document.getElementById('create-task-form').reset();
        });
        
        createTaskModal.addEventListener('hidden.bs.modal', () => {
            document.getElementById('create-task-form').reset();
        });
    }
    
    // Edit task modal events
    const editTaskModal = document.getElementById('editTaskModal');
    if (editTaskModal) {
        editTaskModal.addEventListener('show.bs.modal', (event) => {
            const button = event.relatedTarget;
            const taskKey = button.getAttribute('data-task-key');
            if (taskKey) {
                loadTaskForEdit(taskKey);
            }
        });
        
        editTaskModal.addEventListener('hidden.bs.modal', () => {
            document.getElementById('edit-task-form').reset();
        });
    }
    
    // Form submission events
    const createTaskForm = document.getElementById('create-task-form');
    if (createTaskForm) {
        createTaskForm.addEventListener('submit', (e) => {
            e.preventDefault();
            saveTask();
        });
    }
    
    const editTaskForm = document.getElementById('edit-task-form');
    if (editTaskForm) {
        editTaskForm.addEventListener('submit', (e) => {
            e.preventDefault();
            updateTask();
        });
    }
    
    // Button click events
    const saveTaskBtn = document.getElementById('save-task-btn');
    if (saveTaskBtn) {
        saveTaskBtn.addEventListener('click', saveTask);
    }
    
    const updateTaskBtn = document.getElementById('update-task-btn');
    if (updateTaskBtn) {
        updateTaskBtn.addEventListener('click', updateTask);
    }
    
    const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', confirmDeleteTask);
    }
    
    const exportCreatedTasksBtn = document.getElementById('export-created-tasks-btn');
    if (exportCreatedTasksBtn) {
        exportCreatedTasksBtn.addEventListener('click', exportCreatedTasks);
    }
    
    // Modal cleanup for delete modal
    const deleteModal = document.getElementById('deleteConfirmModal');
    if (deleteModal) {
        deleteModal.addEventListener('hidden.bs.modal', () => {
            // Clean up modal backdrop and body classes
            const backdrop = document.querySelector('.modal-backdrop');
            if (backdrop) {
                backdrop.remove();
            }
            document.body.classList.remove('modal-open');
            document.body.style.overflow = '';
            document.body.style.paddingRight = '';
        });
    }
    
    // Modal cleanup for completion data modal
    const completionModal = document.getElementById('completionDataModal');
    if (completionModal) {
        completionModal.addEventListener('hidden.bs.modal', () => {
            // Clean up modal backdrop and body classes
            const backdrop = document.querySelector('.modal-backdrop');
            if (backdrop) {
                backdrop.remove();
            }
            document.body.classList.remove('modal-open');
            document.body.style.overflow = '';
            document.body.style.paddingRight = '';
        });
    }
}

async function loadTaskForEdit(taskKey) {
    try {
        const task = await fetchTaskById(taskKey);
        if (!task) {
            showNotification('Görev bulunamadı', 'error');
            return;
        }
        
        // Populate form fields
        document.getElementById('edit-task-key').value = task.key;
        document.getElementById('edit-task-name').value = task.name || '';
        document.getElementById('edit-task-job-no').value = task.job_no || '';
        document.getElementById('edit-task-image-no').value = task.image_no || '';
        document.getElementById('edit-task-position-no').value = task.position_no || '';
        document.getElementById('edit-task-quantity').value = task.quantity || '';
        document.getElementById('edit-task-estimated-hours').value = task.estimated_hours || '';
        document.getElementById('edit-task-finish-time').value = task.finish_time || '';
        document.getElementById('edit-task-description').value = task.description || '';
        
        // Set machine selection
        const machineSelect = document.getElementById('edit-task-machine');
        if (machineSelect) {
            machineSelect.value = task.machine_fk || '';
        }
        
    } catch (error) {
        console.error('Error loading task for edit:', error);
        showNotification('Görev yüklenirken hata oluştu', 'error');
    }
}

async function saveTask() {
    try {
        const form = document.getElementById('create-task-form');
        const formData = new FormData(form);
        
        const taskData = {
            name: formData.get('task-name') || document.getElementById('task-name').value,
            job_no: formData.get('task-job-no') || document.getElementById('task-job-no').value,
            image_no: formData.get('task-image-no') || document.getElementById('task-image-no').value,
            position_no: formData.get('task-position-no') || document.getElementById('task-position-no').value,
            quantity: parseInt(formData.get('task-quantity') || document.getElementById('task-quantity').value),
            estimated_hours: parseFloat(formData.get('task-estimated-hours') || document.getElementById('task-estimated-hours').value),
            machine_fk: parseInt(formData.get('task-machine') || document.getElementById('task-machine').value),
            finish_time: formData.get('task-finish-time') || document.getElementById('task-finish-time').value,
            description: formData.get('task-description') || document.getElementById('task-description').value
        };
        
        // Validate required fields
        if (!taskData.name || !taskData.job_no || !taskData.quantity || !taskData.estimated_hours || !taskData.machine_fk) {
            showNotification('Lütfen tüm zorunlu alanları doldurun', 'error');
            return;
        }
        
        const createdTask = await createTaskAPI(taskData);
        
        // Close modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('createTaskModal'));
        if (modal) {
            modal.hide();
        }
        
        // Reload tasks
        await loadTasks();
        
        showNotification('Görev başarıyla oluşturuldu', 'success');
        
    } catch (error) {
        console.error('Error creating task:', error);
        showNotification('Görev oluşturulurken hata oluştu', 'error');
    }
}

async function updateTask() {
    try {
        const taskKey = document.getElementById('edit-task-key').value;
        const form = document.getElementById('edit-task-form');
        const formData = new FormData(form);
        
        const taskData = {
            name: formData.get('edit-task-name') || document.getElementById('edit-task-name').value,
            job_no: formData.get('edit-task-job-no') || document.getElementById('edit-task-job-no').value,
            image_no: formData.get('edit-task-image-no') || document.getElementById('edit-task-image-no').value,
            position_no: formData.get('edit-task-position-no') || document.getElementById('edit-task-position-no').value,
            quantity: parseInt(formData.get('edit-task-quantity') || document.getElementById('edit-task-quantity').value),
            estimated_hours: parseFloat(formData.get('edit-task-estimated-hours') || document.getElementById('edit-task-estimated-hours').value),
            machine_fk: parseInt(formData.get('edit-task-machine') || document.getElementById('edit-task-machine').value),
            finish_time: formData.get('edit-task-finish-time') || document.getElementById('edit-task-finish-time').value,
            description: formData.get('edit-task-description') || document.getElementById('edit-task-description').value
        };
        
        // Validate required fields
        if (!taskData.name || !taskData.job_no || !taskData.quantity || !taskData.estimated_hours || !taskData.machine_fk) {
            showNotification('Lütfen tüm zorunlu alanları doldurun', 'error');
            return;
        }
        
        const updatedTask = await updateTaskAPI(taskKey, taskData);
        
        // Close modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('editTaskModal'));
        if (modal) {
            modal.hide();
        }
        
        // Reload tasks
        await loadTasks();
        
        showNotification('Görev başarıyla güncellendi', 'success');
        
    } catch (error) {
        console.error('Error updating task:', error);
        showNotification('Görev güncellenirken hata oluştu', 'error');
    }
}

function showCompletionData(taskKey) {
    const task = tasks.find(t => t.key === taskKey);
    if (!task) {
        showNotification('Görev bulunamadı', 'error');
        return;
    }
    
    showCompletionDataModal(task);
}

function deleteTask(taskKey) {
    const task = tasks.find(t => t.key === taskKey);
    if (!task) {
        showNotification('Görev bulunamadı', 'error');
        return;
    }
    
    // Show confirmation modal
    document.getElementById('delete-task-name').textContent = task.name;
    const deleteModal = new bootstrap.Modal(document.getElementById('deleteConfirmModal'));
    deleteModal.show();
    
    // Store task key for confirmation
    document.getElementById('confirm-delete-btn').setAttribute('data-task-key', taskKey);
}

async function confirmDeleteTask() {
    try {
        const taskKey = document.getElementById('confirm-delete-btn').getAttribute('data-task-key');
        
        await deleteTaskAPI(taskKey);
        
        // Close modal properly
        const modalElement = document.getElementById('deleteConfirmModal');
        const modal = bootstrap.Modal.getInstance(modalElement);
        if (modal) {
            modal.hide();
            // Remove backdrop manually if needed
            const backdrop = document.querySelector('.modal-backdrop');
            if (backdrop) {
                backdrop.remove();
            }
            // Remove modal-open class from body
            document.body.classList.remove('modal-open');
            document.body.style.overflow = '';
            document.body.style.paddingRight = '';
        }
        
        // Reload tasks
        await loadTasks();
        
        showNotification('Görev başarıyla silindi', 'success');
        
    } catch (error) {
        console.error('Error deleting task:', error);
        showNotification('Görev silinirken hata oluştu', 'error');
    }
}

function showCreateTaskModal() {
    const modal = new bootstrap.Modal(document.getElementById('createTaskModal'));
    modal.show();
}

function showBulkCreateModal() {
    const modal = new bootstrap.Modal(document.getElementById('bulkCreateModal'));
    modal.show();
    loadBulkCreateContent();
}

async function loadBulkCreateContent() {
    try {
        const container = document.querySelector('#bulkCreateModal .bulk-create-container');
        if (!container) return;
        
        // Load bulk create content
        container.innerHTML = `
            <div class="bulk-create-header">
                <h6>Toplu Görev Oluşturma</h6>
                <p class="text-muted">Birden fazla görev oluşturmak için aşağıdaki formu kullanın.</p>
            </div>
            <div class="bulk-create-form">
                <!-- Bulk create form will be implemented here -->
                <p class="text-center text-muted">Toplu oluşturma özelliği yakında eklenecek.</p>
            </div>
        `;
        
    } catch (error) {
        console.error('Error loading bulk create content:', error);
        showNotification('Toplu oluşturma içeriği yüklenirken hata oluştu', 'error');
    }
}

function showCompletionDataModal(task) {
    // Populate modal with task data
    document.getElementById('completion-task-key').textContent = task.key || 'N/A';
    document.getElementById('completion-task-name').textContent = task.name || 'N/A';
    document.getElementById('completion-job-no').textContent = task.job_no || 'N/A';
    
    const machine = machines.find(m => m.id === task.machine_fk);
    document.getElementById('completion-machine').textContent = machine ? machine.name : 'N/A';
    
    document.getElementById('completion-quantity').textContent = task.quantity || 'N/A';
    document.getElementById('completion-estimated-hours').textContent = task.estimated_hours ? `${task.estimated_hours} saat` : 'N/A';
    document.getElementById('completion-total-hours').textContent = task.total_hours_spent ? `${task.total_hours_spent} saat` : 'N/A';
    
    // Status
    let statusText = 'Bekliyor';
    let statusClass = 'pending';
    if (task.completion_date) {
        statusText = 'Tamamlandı';
        statusClass = 'completed';
    } else if (task.total_hours_spent > 0) {
        statusText = 'Çalışıldı';
        statusClass = 'in-progress';
    }
    document.getElementById('completion-status').innerHTML = `<span class="status-badge ${statusClass}">${statusText}</span>`;
    
    // Time tracking
    document.getElementById('completion-start-time').textContent = task.start_time ? new Date(task.start_time).toLocaleString('tr-TR') : 'Belirtilmemiş';
    document.getElementById('completion-end-time').textContent = task.end_time ? new Date(task.end_time).toLocaleString('tr-TR') : 'Belirtilmemiş';
    
    // Calculate duration
    let duration = 'Belirtilmemiş';
    if (task.start_time && task.end_time) {
        const start = new Date(task.start_time);
        const end = new Date(task.end_time);
        const diffMs = end - start;
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        duration = `${diffHours}s ${diffMinutes}dk`;
    }
    document.getElementById('completion-duration').textContent = duration;
    
    document.getElementById('completion-date').textContent = task.completion_date ? new Date(task.completion_date).toLocaleDateString('tr-TR') : 'Belirtilmemiş';
    document.getElementById('completion-user').textContent = task.completed_by || 'Belirtilmemiş';
    
    // Statistics (mock data for now)
    const efficiency = task.estimated_hours && task.total_hours_spent ? 
        Math.round((task.estimated_hours / task.total_hours_spent) * 100) : 0;
    document.getElementById('completion-efficiency').textContent = `${efficiency}%`;
    
    const progress = task.completion_date ? 100 : (task.total_hours_spent > 0 ? 50 : 0);
    document.getElementById('completion-progress').textContent = `${progress}%`;
    
    const accuracy = 95; // Mock data
    document.getElementById('completion-accuracy').textContent = `${accuracy}%`;
    
    const quality = task.completion_date ? 98 : 85; // Mock data
    document.getElementById('completion-quality').textContent = `${quality}%`;
    
    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('completionDataModal'));
    modal.show();
}

function exportTasks() {
    try {
        // Create workbook
        const wb = XLSX.utils.book_new();
        
        // Prepare data for export
        const exportData = tasks.map(task => ({
            'TI No': task.key,
            'Ad': task.name,
            'İş No': task.job_no,
            'Resim No': task.image_no,
            'Poz No': task.position_no,
            'Adet': task.quantity,
            'Makine': machines.find(m => m.id === task.machine_fk)?.name || 'N/A',
            'Tahmini Saat': task.estimated_hours,
            'Harcanan Saat': task.total_hours_spent,
            'Bitiş Tarihi': task.finish_time ? new Date(task.finish_time).toLocaleDateString('tr-TR') : 'Belirtilmemiş',
            'Durum': task.completion_date ? 'Tamamlandı' : (task.total_hours_spent > 0 ? 'Çalışıldı' : 'Bekliyor'),
            'Açıklama': task.description || ''
        }));
        
        // Create worksheet
        const ws = XLSX.utils.json_to_sheet(exportData);
        
        // Add worksheet to workbook
        XLSX.utils.book_append_sheet(wb, ws, 'Görevler');
        
        // Generate filename
        const date = new Date().toISOString().split('T')[0];
        const filename = `gorevler_${date}.xlsx`;
        
        // Export file
        XLSX.writeFile(wb, filename);
        
        showNotification('Görevler başarıyla dışa aktarıldı', 'success');
        
    } catch (error) {
        console.error('Error exporting tasks:', error);
        showNotification('Görevler dışa aktarılırken hata oluştu', 'error');
    }
}

function exportCreatedTasks() {
    try {
        if (!createdTasks || createdTasks.length === 0) {
            showNotification('Dışa aktarılacak görev bulunamadı', 'warning');
            return;
        }
        
        // Create workbook
        const wb = XLSX.utils.book_new();
        
        // Prepare data for export
        const exportData = createdTasks.map(task => ({
            'Görev Adı': task.name,
            'TI No': task.key,
            'İş No': task.job_no,
            'Makine': machines.find(m => m.id === task.machine_fk)?.name || 'N/A',
            'Adet': task.quantity,
            'Tahmini Saat': task.estimated_hours,
            'Oluşturulma Tarihi': new Date(task.created_at).toLocaleDateString('tr-TR')
        }));
        
        // Create worksheet
        const ws = XLSX.utils.json_to_sheet(exportData);
        
        // Add worksheet to workbook
        XLSX.utils.book_append_sheet(wb, ws, 'Oluşturulan Görevler');
        
        // Generate filename
        const date = new Date().toISOString().split('T')[0];
        const filename = `olusturulan_gorevler_${date}.xlsx`;
        
        // Export file
        XLSX.writeFile(wb, filename);
        
        showNotification('Oluşturulan görevler başarıyla dışa aktarıldı', 'success');
        
    } catch (error) {
        console.error('Error exporting created tasks:', error);
        showNotification('Oluşturulan görevler dışa aktarılırken hata oluştu', 'error');
    }
}

function showCreatedTasksModal(tasks) {
    createdTasks = tasks;
    
    const tbody = document.getElementById('created-tasks-table');
    if (tbody) {
        tbody.innerHTML = tasks.map(task => `
            <tr>
                <td>${task.name}</td>
                <td>${task.key}</td>
                <td>${task.job_no}</td>
                <td>${machines.find(m => m.id === task.machine_fk)?.name || 'N/A'}</td>
            </tr>
        `).join('');
    }
    
    const modal = new bootstrap.Modal(document.getElementById('createdTasksModal'));
    modal.show();
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `alert alert-${type === 'error' ? 'danger' : type} alert-dismissible fade show position-fixed`;
    notification.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
    notification.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    // Add to page
    document.body.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 5000);
}