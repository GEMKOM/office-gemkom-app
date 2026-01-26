import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
import { TableComponent } from '../../../components/table/table.js';
import { ConfirmationModal } from '../../../components/confirmation-modal/confirmation-modal.js';
import { EditModal } from '../../../components/edit-modal/edit-modal.js';
import { DisplayModal } from '../../../components/display-modal/display-modal.js';
import { showNotification } from '../../../components/notification/notification.js';
import { initRouteProtection } from '../../../apis/routeProtection.js';
import {
    listDepartmentTasks,
    getDepartmentTaskById,
    startDepartmentTask,
    completeDepartmentTask,
    uncompleteDepartmentTask,
    skipDepartmentTask,
    patchDepartmentTask,
    createDepartmentTask,
    getStatusChoices,
    getDepartmentChoices,
    STATUS_OPTIONS,
    DEPARTMENT_OPTIONS
} from '../../../apis/projects/departmentTasks.js';
import { authFetchUsers } from '../../../apis/users.js';

// State management
let currentPage = 1;
let currentStatusFilter = 'pending,in_progress'; // Default: show active tasks
let currentFilters = {};
let tasks = [];
let totalTasks = 0;
let isLoading = false;
let statusOptions = STATUS_OPTIONS;
let departmentOptions = DEPARTMENT_OPTIONS;
let users = [];
let expandedRows = new Set(); // Track expanded rows by task ID
let subtasksCache = new Map(); // Cache subtasks data by parent task ID
let expandButtonHandler = null; // Event handler for expand buttons

// Component instances
let tasksFilters = null;
let tasksTable = null;
let confirmationModal = null;
let taskDetailsModal = null;
let editTaskModal = null;
let addSubtaskModal = null;

// Department constant
const DEPARTMENT = 'design';

// Status color mapping to ensure consistency with CSS classes
const STATUS_COLOR_MAP = {
    'pending': 'yellow',
    'in_progress': 'blue',
    'blocked': 'red',
    'completed': 'green',
    'skipped': 'grey'
};

// Normalize status colors to match CSS classes
function normalizeStatusColors(statusOptions) {
    return statusOptions.map(status => {
        // If status has a color, use the mapped color, otherwise use the color from map
        const normalizedColor = STATUS_COLOR_MAP[status.value] || status.color || 'grey';
        return {
            ...status,
            color: normalizedColor
        };
    });
}

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize route protection
    if (!initRouteProtection()) {
        return;
    }

    await initNavbar();

    // Initialize header component
    const header = new HeaderComponent({
        title: 'Dizayn Departmanı Görevleri',
        subtitle: 'Görevleri görüntüleyin, başlatın ve yönetin',
        icon: 'project-diagram',
        showBackButton: 'block',
        showCreateButton: 'none',
        showRefreshButton: 'block',
        onBackClick: () => window.location.href = '/design/',
        onRefreshClick: async () => {
            currentPage = 1;
            await loadTasks();
        }
    });

    // Initialize components
    await initializeComponents();
    await loadTasks();
});

async function initializeComponents() {
    try {
        // Load status and department options from API
        try {
            const apiStatusOptions = await getStatusChoices();
            // Normalize status colors to match CSS classes
            statusOptions = normalizeStatusColors(apiStatusOptions);
        } catch (error) {
            console.warn('Could not fetch status choices, using defaults:', error);
            // Ensure default options have correct colors
            statusOptions = normalizeStatusColors(STATUS_OPTIONS);
        }

        try {
            departmentOptions = await getDepartmentChoices();
        } catch (error) {
            console.warn('Could not fetch department choices, using defaults:', error);
        }

        // Load users for assignment filter (only design team)
        try {
            const usersResponse = await authFetchUsers(1, 10000, { team: 'design' });
            users = usersResponse.results || [];
        } catch (error) {
            console.warn('Could not fetch users:', error);
        }

        initializeFiltersComponent();
        initializeTableComponent();
        initializeModalComponents();
    } catch (error) {
        console.error('Error initializing components:', error);
        showNotification('Bileşenler yüklenirken hata oluştu', 'error');
    }
}

function initializeFiltersComponent() {
    tasksFilters = new FiltersComponent('filters-placeholder', {
        title: 'Görev Filtreleri',
        onApply: (values) => {
            currentPage = 1;
            loadTasks();
        },
        onClear: () => {
            currentPage = 1;
            currentStatusFilter = '';
            currentFilters = {};
            loadTasks();
            showNotification('Filtreler temizlendi', 'info');
        },
        onFilterChange: (filterId, value) => {
            // Optional: Handle individual filter changes
        }
    });

    // Status filter (multi-select via dropdown)
    const statusFilterOptions = [
        { value: '', label: 'Tümü' },
        { value: 'pending,in_progress', label: 'Aktif Görevler' },
        ...statusOptions.map(s => ({ value: s.value, label: s.label }))
    ];

    tasksFilters.addDropdownFilter({
        id: 'status-filter',
        label: 'Durum',
        options: statusFilterOptions,
        placeholder: 'Durum seçin',
        value: 'pending,in_progress',
        colSize: 2
    });

    // Search filter
    tasksFilters.addTextFilter({
        id: 'search-filter',
        label: 'Arama',
        placeholder: 'Görev başlığı, açıklama, iş emri...',
        colSize: 3
    });

    // Job order filter
    tasksFilters.addTextFilter({
        id: 'job-order-filter',
        label: 'İş Emri',
        placeholder: 'İş emri numarası',
        colSize: 2
    });

    // Assigned user filter
    const userOptions = [
        { value: '', label: 'Tümü' },
        { value: '__unassigned__', label: 'Atanmamış' },
        ...users.map(u => ({ value: u.id.toString(), label: u.name || u.username }))
    ];

    tasksFilters.addDropdownFilter({
        id: 'assigned-to-filter',
        label: 'Atanan Kişi',
        options: userOptions,
        placeholder: 'Kişi seçin',
        colSize: 2
    });

    // Date filters
    tasksFilters.addDateFilter({
        id: 'target-start-date-filter',
        label: 'Hedef Başlangıç',
        colSize: 2
    });

    tasksFilters.addDateFilter({
        id: 'target-completion-date-filter',
        label: 'Hedef Bitiş',
        colSize: 2
    });
}

function initializeTableComponent() {
    tasksTable = new TableComponent('tasks-table-container', {
        title: 'Görev Listesi',
        rowAttributes: (row, rowIndex) => {
            // Style subtasks differently
            if (row.parent) {
                return {
                    class: 'subtask-row',
                    'data-parent-id': row.parent
                };
            }
            return null;
        },
        columns: [
            {
                field: 'job_order',
                label: 'İş Emri',
                sortable: true,
                formatter: (value, row) => {
                    if (!value) return '-';
                    
                    // Check if task has subtasks (check both subtasks_count and subtasks array)
                    const subtasksCount = row.subtasks_count || (row.subtasks ? row.subtasks.length : 0);
                    const hasSubtasks = subtasksCount > 0;
                    const isExpanded = expandedRows.has(row.id);
                    const isSubtask = !!row.parent;
                    
                    // Add indentation for subtasks
                    const indent = isSubtask ? 30 : 0;
                    const prefix = isSubtask ? '<i class="fas fa-level-down-alt text-muted me-1"></i>' : '';
                    
                    // Expand/collapse button for tasks with subtasks
                    let expandButton = '';
                    if (hasSubtasks && !isSubtask) {
                        const expandIcon = isExpanded ? 'fa-chevron-down' : 'fa-chevron-right';
                        expandButton = `
                            <button type="button" 
                                    class="btn btn-sm btn-link p-0 me-2 expand-toggle-btn" 
                                    data-task-id="${row.id}"
                                    style="width: 20px; height: 20px; line-height: 1; border: none; background: none;"
                                    title="${isExpanded ? 'Daralt' : 'Genişlet'}">
                                <i class="fas ${expandIcon} text-primary"></i>
                            </button>
                        `;
                    } else if (!isSubtask) {
                        // Add spacing for rows without subtasks to align with expandable rows
                        expandButton = '<span class="me-2" style="display: inline-block; width: 20px;"></span>';
                    }
                    
                    // Make job_order a clickable link
                    const jobOrderLink = `<a href="/projects/project-tracking/?job_no=${encodeURIComponent(value)}" class="text-decoration-none"><strong>${value}</strong></a>`;
                    
                    return `<div style="padding-left: ${indent}px;">${expandButton}${prefix}${jobOrderLink}</div>`;
                }
            },
            {
                field: 'title',
                label: 'Görev Başlığı',
                sortable: true,
                formatter: (value, row) => {
                    const isSubtask = !!row.parent;
                    const indent = isSubtask ? 30 : 0;
                    return `<div style="padding-left: ${indent}px;">${value || '-'}</div>`;
                }
            },
            {
                field: 'status',
                label: 'Durum',
                sortable: true,
                formatter: (value, row) => {
                    const status = statusOptions.find(s => s.value === value) || { label: value, color: 'grey' };
                    const colorClass = `status-${status.color}`;
                    return `<span class="status-badge ${colorClass}">${status.label}</span>`;
                }
            },
            {
                field: 'assigned_to_name',
                label: 'Atanan',
                sortable: false,
                formatter: (value) => value || '-'
            },
            {
                field: 'target_completion_date',
                label: 'Hedef Bitiş',
                sortable: true,
                type: 'date',
                formatter: (value) => {
                    if (!value) return '-';
                    const date = new Date(value);
                    return date.toLocaleDateString('tr-TR', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                    });
                }
            },
            {
                field: 'subtasks_count',
                label: 'Alt Görevler',
                sortable: false,
                formatter: (value, row) => {
                    if (!value || value === 0) return '-';
                    const completed = row.subtasks ? row.subtasks.filter(s => s.status === 'completed').length : 0;
                    return `${completed}/${value}`;
                }
            },
            {
                field: 'sequence',
                label: 'Sıra',
                sortable: true,
                formatter: (value) => value || '-'
            }
        ],
        data: [],
        sortable: true,
        pagination: true,
        serverSidePagination: true,
        itemsPerPage: 20,
        refreshable: true,
        exportable: true,
        onRefresh: async () => {
            currentPage = 1;
            await loadTasks();
        },
        onExport: async (format) => {
            await exportTasks(format);
        },
        onSort: async (field, direction) => {
            currentPage = 1;
            await loadTasks();
        },
        onPageSizeChange: async (newPageSize) => {
            currentPage = 1;
            await loadTasks();
        },
        onPageChange: async (page) => {
            currentPage = page;
            await loadTasks();
        },
        actions: [
            {
                key: 'view',
                label: 'Detay',
                icon: 'fas fa-eye',
                class: 'btn-outline-info',
                onClick: (row) => viewTaskDetails(row.id)
            },
            {
                key: 'edit',
                label: 'Düzenle',
                icon: 'fas fa-edit',
                class: 'btn-outline-primary',
                onClick: (row) => showEditTaskModal(row.id)
            },
            {
                key: 'add-subtask',
                label: 'Alt Görev Ekle',
                icon: 'fas fa-plus-circle',
                class: 'btn-outline-info',
                onClick: (row) => showAddSubtaskModal(row.id),
                visible: (row) => !row.parent // Only show for main tasks (not subtasks)
            },
            {
                key: 'start',
                label: 'Başlat',
                icon: 'fas fa-play',
                class: 'btn-outline-success',
                onClick: (row) => handleStartTask(row.id),
                visible: (row) => row.status === 'pending' && row.can_start
            },
            {
                key: 'complete',
                label: 'Tamamla',
                icon: 'fas fa-check',
                class: 'btn-outline-success',
                onClick: (row) => handleCompleteTask(row.id),
                visible: (row) => row.status === 'in_progress'
            },
            {
                key: 'uncomplete',
                label: 'Tamamlanmayı Geri Al',
                icon: 'fas fa-undo',
                class: 'btn-outline-warning',
                onClick: (row) => handleUncompleteTask(row.id),
                visible: (row) => row.status === 'completed'
            },
            {
                key: 'skip',
                label: 'Atla',
                icon: 'fas fa-forward',
                class: 'btn-outline-secondary',
                onClick: (row) => handleSkipTask(row.id),
                visible: (row) => row.status === 'pending'
            }
        ],
        emptyMessage: 'Görev bulunamadı',
        emptyIcon: 'fas fa-tasks'
    });
}

function initializeModalComponents() {
    // Confirmation modal
    confirmationModal = new ConfirmationModal('confirmation-modal-container', {
        title: 'Onay',
        icon: 'fas fa-exclamation-triangle',
        message: 'Bu işlemi yapmak istediğinize emin misiniz?',
        confirmText: 'Evet',
        cancelText: 'İptal'
    });

    // Task details modal
    taskDetailsModal = new DisplayModal('task-details-modal-container', {
        title: 'Görev Detayları',
        icon: 'fas fa-info-circle',
        size: 'lg',
        showEditButton: false
    });

    // Edit task modal
    editTaskModal = new EditModal('edit-task-modal-container', {
        title: 'Görevi Düzenle',
        icon: 'fas fa-edit',
        size: 'lg',
        showEditButton: false
    });

    editTaskModal.onSaveCallback(async (formData) => {
        const taskId = window.editingTaskId;
        if (!taskId) return;

        try {
            // Prepare update data
            const updateData = {};

            // Title, job_order, and sequence cannot be changed, so don't include them in update
            if (formData.description !== undefined) updateData.description = formData.description || null;
            if (formData.assigned_to !== undefined) {
                updateData.assigned_to = formData.assigned_to === '' || formData.assigned_to === null ? null : parseInt(formData.assigned_to);
            }
            if (formData.target_start_date !== undefined) {
                updateData.target_start_date = formData.target_start_date || null;
            }
            if (formData.target_completion_date !== undefined) {
                updateData.target_completion_date = formData.target_completion_date || null;
            }
            if (formData.notes !== undefined) updateData.notes = formData.notes || null;

            await patchDepartmentTask(taskId, updateData);
            showNotification('Görev güncellendi', 'success');
            editTaskModal.hide();
            window.editingTaskId = null;
            await loadTasks();
        } catch (error) {
            console.error('Error updating task:', error);
            let errorMessage = 'Görev güncellenirken hata oluştu';
            try {
                if (error.message) {
                    const errorData = JSON.parse(error.message);
                    if (typeof errorData === 'object') {
                        const errors = Object.values(errorData).flat();
                        errorMessage = errors.join(', ') || errorMessage;
                    } else {
                        errorMessage = error.message;
                    }
                }
            } catch (e) {
                // If parsing fails, use default message
            }
            showNotification(errorMessage, 'error');
        }
    });

    // Add subtask modal
    addSubtaskModal = new EditModal('add-subtask-modal-container', {
        title: 'Alt Görev Ekle',
        icon: 'fas fa-plus-circle',
        size: 'md',
        showEditButton: false
    });

    addSubtaskModal.onSaveCallback(async (formData) => {
        const parentTaskId = window.pendingSubtaskParentId;
        if (!parentTaskId) return;

        try {
            // Get parent task to get job_order
            const parentTask = await getDepartmentTaskById(parentTaskId);

            const subtaskData = {
                job_order: parentTask.job_order,
                parent: parentTaskId,
                department: parentTask.department
            };

            if (formData.title && formData.title.trim()) {
                subtaskData.title = formData.title.trim();
            }
            if (formData.description && formData.description.trim()) {
                subtaskData.description = formData.description.trim();
            }
            if (formData.sequence) {
                subtaskData.sequence = parseInt(formData.sequence);
            }

            await createDepartmentTask(subtaskData);
            showNotification('Alt görev eklendi', 'success');
            addSubtaskModal.hide();
            const parentTaskId = window.pendingSubtaskParentId;
            window.pendingSubtaskParentId = null;
            
            // Clear subtasks cache for parent to force refresh
            if (parentTaskId && subtasksCache.has(parentTaskId)) {
                subtasksCache.delete(parentTaskId);
            }
            
            // If parent was expanded, refresh subtasks
            if (parentTaskId && expandedRows.has(parentTaskId)) {
                await fetchTaskSubtasks(parentTaskId);
            }
            
            await loadTasks();
        } catch (error) {
            console.error('Error creating subtask:', error);
            let errorMessage = 'Alt görev eklenirken hata oluştu';
            try {
                if (error.message) {
                    const errorData = JSON.parse(error.message);
                    if (typeof errorData === 'object') {
                        const errors = Object.values(errorData).flat();
                        errorMessage = errors.join(', ') || errorMessage;
                    } else {
                        errorMessage = error.message;
                    }
                }
            } catch (e) {
                // If parsing fails, use default message
            }
            showNotification(errorMessage, 'error');
        }
    });
}

async function loadTasks() {
    try {
        if (isLoading) return;

        isLoading = true;
        if (tasksTable) {
            tasksTable.setLoading(true);
        }

        // Get filter values
        const filterValues = tasksFilters ? tasksFilters.getFilterValues() : {};

        // Build query options
        const options = {
            page: currentPage,
            department: DEPARTMENT,
            main_only: true, // Only show main tasks (no subtasks)
            ordering: 'sequence'
        };

        // Status filter
        // Only apply status filter if a value is selected (not empty string for "Tümü")
        if (filterValues['status-filter'] && filterValues['status-filter'].trim() !== '') {
            if (filterValues['status-filter'].includes(',')) {
                options.status__in = filterValues['status-filter'];
            } else {
                options.status = filterValues['status-filter'];
            }
        }
        // If "Tümü" is selected (empty string), don't add any status filter

        // Search filter
        if (filterValues['search-filter']) {
            options.search = filterValues['search-filter'];
        }

        // Job order filter
        if (filterValues['job-order-filter']) {
            options.job_order = filterValues['job-order-filter'];
        }

        // Assigned user filter
        if (filterValues['assigned-to-filter']) {
            if (filterValues['assigned-to-filter'] === '__unassigned__') {
                options.assigned_to__isnull = true;
            } else {
                options.assigned_to = parseInt(filterValues['assigned-to-filter']);
            }
        }

        // Date filters
        if (filterValues['target-start-date-filter']) {
            options.target_start_date = filterValues['target-start-date-filter'];
        }

        if (filterValues['target-completion-date-filter']) {
            options.target_completion_date = filterValues['target-completion-date-filter'];
        }

        // Call API
        const response = await listDepartmentTasks(options);

        // Extract tasks and total count from response
        const mainTasks = response.results || [];
        totalTasks = response.count || 0;

        // Store main tasks separately for quick access during expand/collapse
        tasks = mainTasks;

        // Merge expanded subtasks into display data
        const dataToDisplay = mergeExpandedSubtasks(mainTasks);

        // Update table data with pagination info
        if (tasksTable) {
            tasksTable.updateData(dataToDisplay, totalTasks, currentPage);
        }

        // Setup expand button listeners after table is updated
        setTimeout(() => {
            setupExpandButtonListeners();
        }, 50);

    } catch (error) {
        console.error('Error loading tasks:', error);
        showNotification('Görevler yüklenirken hata oluştu', 'error');
        tasks = [];
        totalTasks = 0;
        if (tasksTable) {
            tasksTable.updateData([], 0, currentPage);
        }
    } finally {
        isLoading = false;
        if (tasksTable) {
            tasksTable.setLoading(false);
        }
    }
}

// Merge expanded subtasks into the main tasks array
function mergeExpandedSubtasks(mainTasks) {
    const merged = [];
    
    mainTasks.forEach(task => {
        merged.push(task);
        
        // If this task is expanded, add its subtasks
        if (expandedRows.has(task.id) && subtasksCache.has(task.id)) {
            const subtasks = subtasksCache.get(task.id);
            subtasks.forEach(subtask => {
                merged.push(subtask);
            });
        }
    });
    
    return merged;
}

// Update table data without showing loading state (for expand/collapse operations)
function updateTableDataOnly() {
    if (!tasksTable) return;
    
    // Merge expanded subtasks into display data
    const dataToDisplay = mergeExpandedSubtasks(tasks);
    
    // Update table data without loading state
    tasksTable.updateData(dataToDisplay, totalTasks, currentPage);
    
    // Setup expand button listeners after table is updated
    setTimeout(() => {
        setupExpandButtonListeners();
    }, 50);
}

// Setup event listeners for expand/collapse buttons using event delegation
function setupExpandButtonListeners() {
    if (!tasksTable || !tasksTable.container) {
        // Table not ready yet, try again later
        setTimeout(setupExpandButtonListeners, 100);
        return;
    }
    
    // Remove existing handler if any
    if (expandButtonHandler) {
        tasksTable.container.removeEventListener('click', expandButtonHandler);
    }
    
    // Create the handler function
    expandButtonHandler = async (e) => {
        // Check if the clicked element is an expand button or inside one
        const expandButton = e.target.closest('.expand-toggle-btn');
        if (!expandButton) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        const taskId = parseInt(expandButton.getAttribute('data-task-id'));
        if (!taskId) {
            console.warn('Expand button missing data-task-id attribute');
            return;
        }
        
        const isExpanded = expandedRows.has(taskId);
        
        if (isExpanded) {
            // Collapse: remove from expanded set
            expandedRows.delete(taskId);
            // Update table without loading state
            updateTableDataOnly();
        } else {
            // Expand: fetch subtasks if not cached
            if (!subtasksCache.has(taskId)) {
                try {
                    // Show loading state on button
                    const icon = expandButton.querySelector('i');
                    if (icon) {
                        icon.className = 'fas fa-spinner fa-spin text-primary';
                    }
                    
                    await fetchTaskSubtasks(taskId);
                } catch (error) {
                    console.error(`Error fetching subtasks for task ${taskId}:`, error);
                    showNotification('Alt görevler yüklenirken hata oluştu', 'error');
                    // Restore icon on error
                    const icon = expandButton.querySelector('i');
                    if (icon) {
                        icon.className = 'fas fa-chevron-right text-primary';
                    }
                    return;
                }
            }
            expandedRows.add(taskId);
            // Update table without loading state
            updateTableDataOnly();
        }
    };
    
    // Attach the event listener to the container (which persists across renders)
    tasksTable.container.addEventListener('click', expandButtonHandler);
}

// Fetch subtasks for a specific task
async function fetchTaskSubtasks(taskId) {
    try {
        // Fetch tasks with parent filter
        const response = await listDepartmentTasks({
            department: DEPARTMENT,
            parent: taskId,
            ordering: 'sequence'
        });
        
        const subtasks = response.results || [];
        subtasksCache.set(taskId, subtasks);
    } catch (error) {
        console.error(`Error fetching subtasks for task ${taskId}:`, error);
        subtasksCache.set(taskId, []);
        throw error;
    }
}

async function viewTaskDetails(taskId) {
    try {
        const task = await getDepartmentTaskById(taskId);
        
        taskDetailsModal.clearData();
        
        // Add task information section
        taskDetailsModal.addSection({
            title: 'Görev Bilgileri',
            icon: 'fas fa-info-circle',
            iconColor: 'text-primary'
        });

        taskDetailsModal.addField({
            id: 'task-title',
            name: 'title',
            label: 'Başlık',
            type: 'text',
            value: task.title || '-',
            icon: 'fas fa-heading',
            colSize: 12
        });

        taskDetailsModal.addField({
            id: 'task-job-order',
            name: 'job_order',
            label: 'İş Emri',
            type: 'text',
            value: task.job_order ? `${task.job_order} - ${task.job_order_title || ''}` : '-',
            icon: 'fas fa-file-invoice',
            colSize: 6
        });

        taskDetailsModal.addField({
            id: 'task-status',
            name: 'status',
            label: 'Durum',
            type: 'text',
            value: task.status_display || '-',
            icon: 'fas fa-info-circle',
            colSize: 6
        });

        if (task.description) {
            taskDetailsModal.addField({
                id: 'task-description',
                name: 'description',
                label: 'Açıklama',
                type: 'textarea',
                value: task.description,
                icon: 'fas fa-align-left',
                colSize: 12
            });
        }

        if (task.assigned_to_name) {
            taskDetailsModal.addField({
                id: 'task-assigned',
                name: 'assigned_to',
                label: 'Atanan Kişi',
                type: 'text',
                value: task.assigned_to_name,
                icon: 'fas fa-user',
                colSize: 6
            });
        }

        if (task.target_completion_date) {
            taskDetailsModal.addField({
                id: 'task-target-date',
                name: 'target_completion_date',
                label: 'Hedef Bitiş Tarihi',
                type: 'text',
                value: new Date(task.target_completion_date).toLocaleDateString('tr-TR'),
                icon: 'fas fa-calendar',
                colSize: 6
            });
        }

        if (task.depends_on_tasks && task.depends_on_tasks.length > 0) {
            taskDetailsModal.addSection({
                title: 'Bağımlılıklar',
                icon: 'fas fa-link',
                iconColor: 'text-warning'
            });

            task.depends_on_tasks.forEach((dep, index) => {
                taskDetailsModal.addField({
                    id: `dep-${index}`,
                    name: `dependency_${index}`,
                    label: `Bağımlılık ${index + 1}`,
                    type: 'text',
                    value: `${dep.title} (${dep.status_display || dep.status})`,
                    icon: 'fas fa-link',
                    colSize: 12
                });
            });
        }

        // Subtasks section
        taskDetailsModal.addSection({
            title: `Alt Görevler (${task.subtasks_count || 0})`,
            icon: 'fas fa-list',
            iconColor: 'text-info'
        });

        if (task.subtasks && task.subtasks.length > 0) {
            task.subtasks.forEach((subtask, index) => {
                const status = statusOptions.find(s => s.value === subtask.status) || { label: subtask.status, color: 'grey' };
                const statusLabel = status.label;
                
                taskDetailsModal.addField({
                    id: `subtask-${index}`,
                    name: `subtask_${index}`,
                    label: `Alt Görev ${index + 1} (Sıra: ${subtask.sequence || index + 1})`,
                    type: 'text',
                    value: `${subtask.title} - Durum: ${statusLabel}`,
                    icon: 'fas fa-tasks',
                    colSize: 12
                });
            });
        } else {
            taskDetailsModal.addField({
                id: 'no-subtasks',
                name: 'no_subtasks',
                label: 'Alt Görev',
                type: 'text',
                value: 'Alt görev bulunmamaktadır',
                icon: 'fas fa-info-circle',
                colSize: 12
            });
        }

        taskDetailsModal.render();
        
        // Add subtask button after rendering (only for main tasks)
        if (!task.parent) {
            setTimeout(() => {
                const modalBody = taskDetailsModal.container.querySelector('.modal-body');
                if (modalBody) {
                    // Find the subtasks section
                    const sections = modalBody.querySelectorAll('.section');
                    let subtaskSection = null;
                    sections.forEach(section => {
                        const title = section.querySelector('.section-title');
                        if (title && title.textContent.includes('Alt Görevler')) {
                            subtaskSection = section;
                        }
                    });
                    
                    if (subtaskSection) {
                        const sectionContent = subtaskSection.querySelector('.section-content') || subtaskSection;
                        const buttonDiv = document.createElement('div');
                        buttonDiv.className = 'mb-3';
                        buttonDiv.innerHTML = `
                            <button type="button" class="btn btn-sm btn-primary" id="add-subtask-btn-${task.id}">
                                <i class="fas fa-plus me-1"></i>Alt Görev Ekle
                            </button>
                        `;
                        sectionContent.insertBefore(buttonDiv, sectionContent.firstChild);
                        
                        // Add event listener
                        const addBtn = document.getElementById(`add-subtask-btn-${task.id}`);
                        if (addBtn) {
                            addBtn.addEventListener('click', () => {
                                taskDetailsModal.hide();
                                showAddSubtaskModal(task.id);
                            });
                        }
                    }
                }
            }, 100);
        }
        
        taskDetailsModal.show();
    } catch (error) {
        console.error('Error loading task details:', error);
        showNotification('Görev detayları yüklenirken hata oluştu', 'error');
    }
}

async function showEditTaskModal(taskId) {
    try {
        const task = await getDepartmentTaskById(taskId);
        
        window.editingTaskId = taskId;
        
        editTaskModal.clearAll();

        editTaskModal.addSection({
            title: 'Görev Bilgileri',
            icon: 'fas fa-info-circle',
            iconColor: 'text-primary'
        });

        editTaskModal.addField({
            id: 'edit-job-order',
            name: 'job_order',
            label: 'İş Emri',
            type: 'text',
            value: task.job_order ? `${task.job_order} - ${task.job_order_title || ''}` : '-',
            readonly: true,
            icon: 'fas fa-file-invoice',
            colSize: 6,
            helpText: 'İş emri (değiştirilemez)'
        });

        editTaskModal.addField({
            id: 'edit-title',
            name: 'title',
            label: 'Başlık',
            type: 'text',
            value: task.title || '',
            required: true,
            readonly: true,
            icon: 'fas fa-heading',
            colSize: 6,
            helpText: 'Görev başlığı (değiştirilemez)'
        });

        editTaskModal.addField({
            id: 'edit-description',
            name: 'description',
            label: 'Açıklama',
            type: 'textarea',
            value: task.description || '',
            icon: 'fas fa-align-left',
            colSize: 12,
            helpText: 'Görev açıklaması'
        });

        editTaskModal.addSection({
            title: 'Atama ve Tarihler',
            icon: 'fas fa-calendar',
            iconColor: 'text-success'
        });

        // Assigned user dropdown
        const userOptions = [
            { value: '', label: 'Atanmamış' },
            ...users.map(u => ({ value: u.id.toString(), label: u.name || u.username }))
        ];

        editTaskModal.addField({
            id: 'edit-assigned-to',
            name: 'assigned_to',
            label: 'Atanan Kişi',
            type: 'dropdown',
            value: task.assigned_to ? task.assigned_to.toString() : '',
            options: userOptions,
            placeholder: 'Kişi seçin',
            icon: 'fas fa-user',
            colSize: 6,
            helpText: 'Görevi atamak istediğiniz kişi'
        });

        editTaskModal.addField({
            id: 'edit-sequence',
            name: 'sequence',
            label: 'Sıra',
            type: 'number',
            value: task.sequence || '',
            min: 0,
            readonly: true,
            icon: 'fas fa-sort-numeric-up',
            colSize: 6,
            helpText: 'Görev sırası (değiştirilemez)'
        });

        editTaskModal.addField({
            id: 'edit-target-start-date',
            name: 'target_start_date',
            label: 'Hedef Başlangıç Tarihi',
            type: 'date',
            value: task.target_start_date ? task.target_start_date.split('T')[0] : '',
            icon: 'fas fa-calendar-alt',
            colSize: 6,
            helpText: 'Hedef başlangıç tarihi'
        });

        editTaskModal.addField({
            id: 'edit-target-completion-date',
            name: 'target_completion_date',
            label: 'Hedef Bitiş Tarihi',
            type: 'date',
            value: task.target_completion_date ? task.target_completion_date.split('T')[0] : '',
            icon: 'fas fa-calendar-check',
            colSize: 6,
            helpText: 'Hedef bitiş tarihi'
        });

        editTaskModal.addSection({
            title: 'Notlar',
            icon: 'fas fa-sticky-note',
            iconColor: 'text-warning'
        });

        editTaskModal.addField({
            id: 'edit-notes',
            name: 'notes',
            label: 'Notlar',
            type: 'textarea',
            value: task.notes || '',
            icon: 'fas fa-sticky-note',
            colSize: 12,
            helpText: 'Ek notlar'
        });

        editTaskModal.render();
        editTaskModal.show();
    } catch (error) {
        console.error('Error loading task for edit:', error);
        showNotification('Görev bilgileri yüklenirken hata oluştu', 'error');
    }
}

async function showAddSubtaskModal(parentTaskId) {
    window.pendingSubtaskParentId = parentTaskId;

    try {
        // Get parent task to determine next sequence number
        const parentTask = await getDepartmentTaskById(parentTaskId);
        const nextSequence = (parentTask.subtasks_count || 0) + 1;

        addSubtaskModal.clearAll();

        addSubtaskModal.addSection({
            title: 'Alt Görev Bilgileri',
            icon: 'fas fa-plus-circle',
            iconColor: 'text-primary'
        });

        addSubtaskModal.addField({
            id: 'subtask-title',
            name: 'title',
            label: 'Başlık',
            type: 'text',
            placeholder: 'Boş bırakılırsa iş emri adı kullanılır',
            icon: 'fas fa-heading',
            colSize: 12,
            helpText: 'Alt görev başlığı (boş bırakılabilir)'
        });

        addSubtaskModal.addField({
            id: 'subtask-description',
            name: 'description',
            label: 'Açıklama',
            type: 'textarea',
            placeholder: 'Alt görev açıklaması',
            icon: 'fas fa-align-left',
            colSize: 12,
            helpText: 'Alt görev açıklaması'
        });

        addSubtaskModal.addField({
            id: 'subtask-sequence',
            name: 'sequence',
            label: 'Sıra',
            type: 'number',
            value: nextSequence.toString(),
            min: 1,
            icon: 'fas fa-sort-numeric-up',
            colSize: 6,
            helpText: 'Alt görev sırası'
        });

        addSubtaskModal.render();
        addSubtaskModal.show();
    } catch (error) {
        console.error('Error loading parent task for subtask creation:', error);
        showNotification('Üst görev bilgileri yüklenirken hata oluştu', 'error');
    }
}

async function handleStartTask(taskId) {
    confirmationModal.show({
        message: 'Bu görevi başlatmak istediğinize emin misiniz?',
        confirmText: 'Evet, Başlat',
        onConfirm: async () => {
            try {
                await startDepartmentTask(taskId);
                showNotification('Görev başlatıldı', 'success');
                confirmationModal.hide();
                await loadTasks();
            } catch (error) {
                console.error('Error starting task:', error);
                let errorMessage = 'Görev başlatılırken hata oluştu';
                try {
                    if (error.message) {
                        const errorData = JSON.parse(error.message);
                        if (typeof errorData === 'object') {
                            const errors = Object.values(errorData).flat();
                            errorMessage = errors.join(', ') || errorMessage;
                        } else {
                            errorMessage = error.message;
                        }
                    }
                } catch (e) {
                    // If parsing fails, use default message
                }
                showNotification(errorMessage, 'error');
            }
        }
    });
}

async function handleCompleteTask(taskId) {
    confirmationModal.show({
        message: 'Bu görevi tamamlamak istediğinize emin misiniz?',
        confirmText: 'Evet, Tamamla',
        onConfirm: async () => {
            try {
                await completeDepartmentTask(taskId);
                showNotification('Görev tamamlandı', 'success');
                confirmationModal.hide();
                await loadTasks();
            } catch (error) {
                console.error('Error completing task:', error);
                let errorMessage = 'Görev tamamlanırken hata oluştu';
                try {
                    if (error.message) {
                        const errorData = JSON.parse(error.message);
                        if (typeof errorData === 'object') {
                            const errors = Object.values(errorData).flat();
                            errorMessage = errors.join(', ') || errorMessage;
                        } else {
                            errorMessage = error.message;
                        }
                    }
                } catch (e) {
                    // If parsing fails, use default message
                }
                showNotification(errorMessage, 'error');
            }
        }
    });
}

async function handleUncompleteTask(taskId) {
    confirmationModal.show({
        message: 'Bu görevin tamamlanma durumunu geri almak istediğinize emin misiniz?',
        confirmText: 'Evet, Geri Al',
        onConfirm: async () => {
            try {
                await uncompleteDepartmentTask(taskId);
                showNotification('Görev tamamlanma durumu geri alındı', 'success');
                confirmationModal.hide();
                await loadTasks();
            } catch (error) {
                console.error('Error uncompleting task:', error);
                let errorMessage = 'Görev tamamlanma durumu geri alınırken hata oluştu';
                try {
                    if (error.message) {
                        const errorData = JSON.parse(error.message);
                        if (typeof errorData === 'object') {
                            const errors = Object.values(errorData).flat();
                            errorMessage = errors.join(', ') || errorMessage;
                        } else {
                            errorMessage = error.message;
                        }
                    }
                } catch (e) {
                    // If parsing fails, use default message
                }
                showNotification(errorMessage, 'error');
            }
        }
    });
}


async function handleSkipTask(taskId) {
    confirmationModal.show({
        message: 'Bu görevi atlamak istediğinize emin misiniz?',
        confirmText: 'Evet, Atla',
        onConfirm: async () => {
            try {
                await skipDepartmentTask(taskId);
                showNotification('Görev atlandı', 'success');
                confirmationModal.hide();
                await loadTasks();
            } catch (error) {
                console.error('Error skipping task:', error);
                let errorMessage = 'Görev atlanırken hata oluştu';
                try {
                    if (error.message) {
                        const errorData = JSON.parse(error.message);
                        if (typeof errorData === 'object') {
                            const errors = Object.values(errorData).flat();
                            errorMessage = errors.join(', ') || errorMessage;
                        } else {
                            errorMessage = error.message;
                        }
                    }
                } catch (e) {
                    // If parsing fails, use default message
                }
                showNotification(errorMessage, 'error');
            }
        }
    });
}

async function exportTasks(format) {
    try {
        if (tasksTable) {
            tasksTable.setExportLoading(true);
        }

        // Get filter values
        const filterValues = tasksFilters ? tasksFilters.getFilterValues() : {};

        // Build query options for export (fetch all)
        const options = {
            page: 1,
            department: DEPARTMENT,
            main_only: true,
            ordering: 'sequence'
        };

        // Apply same filters as current view
        // Only apply status filter if a value is selected (not empty string for "Tümü")
        if (filterValues['status-filter'] && filterValues['status-filter'].trim() !== '') {
            if (filterValues['status-filter'].includes(',')) {
                options.status__in = filterValues['status-filter'];
            } else {
                options.status = filterValues['status-filter'];
            }
        }
        // If "Tümü" is selected (empty string), don't add any status filter

        if (filterValues['search-filter']) {
            options.search = filterValues['search-filter'];
        }

        if (filterValues['job-order-filter']) {
            options.job_order = filterValues['job-order-filter'];
        }

        if (filterValues['assigned-to-filter']) {
            if (filterValues['assigned-to-filter'] === '__unassigned__') {
                options.assigned_to__isnull = true;
            } else {
                options.assigned_to = parseInt(filterValues['assigned-to-filter']);
            }
        }

        // Fetch all tasks for export
        let allTasks = [];
        let page = 1;
        let hasMore = true;

        while (hasMore) {
            const response = await listDepartmentTasks({ ...options, page });
            const results = response.results || [];
            allTasks = [...allTasks, ...results];

            if (response.next && results.length > 0) {
                page++;
            } else {
                hasMore = false;
            }
        }

        if (allTasks.length === 0) {
            showNotification('Dışa aktarılacak görev bulunamadı', 'warning');
            return;
        }

        // Store current table state
        const originalData = tasksTable.options.data;
        const originalTotal = tasksTable.options.totalItems;

        // Temporarily update table with all tasks for export
        tasksTable.options.data = allTasks;
        tasksTable.options.totalItems = allTasks.length;

        // Use table component's export functionality
        tasksTable.exportData(format || 'excel');

        // Restore original table state
        tasksTable.options.data = originalData;
        tasksTable.options.totalItems = originalTotal;

    } catch (error) {
        console.error('Error exporting tasks:', error);
        showNotification('Dışa aktarma sırasında hata oluştu', 'error');
    } finally {
        if (tasksTable) {
            tasksTable.setExportLoading(false);
        }
    }
}
