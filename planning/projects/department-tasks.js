import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
import { StatisticsCards } from '../../../components/statistics-cards/statistics-cards.js';
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
    blockDepartmentTask,
    unblockDepartmentTask,
    skipDepartmentTask,
    patchDepartmentTask,
    createDepartmentTask,
    getStatusChoices,
    getDepartmentChoices,
    STATUS_OPTIONS,
    DEPARTMENT_OPTIONS
} from '../../../apis/projects/departmentTasks.js';
import { fetchAllUsers } from '../../../apis/users.js';

// State management
let currentPage = 1;
let currentStatusFilter = 'pending,in_progress,blocked'; // Default: show active tasks
let currentFilters = {};
let tasks = [];
let totalTasks = 0;
let isLoading = false;
let statusOptions = STATUS_OPTIONS;
let departmentOptions = DEPARTMENT_OPTIONS;
let users = [];

// Component instances
let tasksStats = null;
let tasksFilters = null;
let tasksTable = null;
let blockTaskModal = null;
let confirmationModal = null;
let taskDetailsModal = null;
let editTaskModal = null;
let addSubtaskModal = null;

// Department constant
const DEPARTMENT = 'planning';

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize route protection
    if (!initRouteProtection()) {
        return;
    }

    await initNavbar();

    // Initialize header component
    const header = new HeaderComponent({
        title: 'Planlama Departmanı Görevleri',
        subtitle: 'Görevleri görüntüleyin, başlatın ve yönetin',
        icon: 'project-diagram',
        showBackButton: 'block',
        showCreateButton: 'none',
        showRefreshButton: 'block',
        onBackClick: () => window.location.href = '/planning/',
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
            statusOptions = await getStatusChoices();
        } catch (error) {
            console.warn('Could not fetch status choices, using defaults:', error);
        }

        try {
            departmentOptions = await getDepartmentChoices();
        } catch (error) {
            console.warn('Could not fetch department choices, using defaults:', error);
        }

        // Load users for assignment filter
        try {
            users = await fetchAllUsers();
        } catch (error) {
            console.warn('Could not fetch users:', error);
        }

        initializeStatisticsCards();
        initializeFiltersComponent();
        initializeTableComponent();
        initializeModalComponents();
    } catch (error) {
        console.error('Error initializing components:', error);
        showNotification('Bileşenler yüklenirken hata oluştu', 'error');
    }
}

function initializeStatisticsCards() {
    tasksStats = new StatisticsCards('tasks-statistics', {
        cards: [
            { title: 'Toplam Görev', value: '0', icon: 'fas fa-tasks', color: 'primary', id: 'total-tasks-count' },
            { title: 'Bekleyen', value: '0', icon: 'fas fa-clock', color: 'warning', id: 'pending-tasks-count' },
            { title: 'Devam Ediyor', value: '0', icon: 'fas fa-spinner', color: 'info', id: 'in-progress-tasks-count' },
            { title: 'Engellendi', value: '0', icon: 'fas fa-ban', color: 'danger', id: 'blocked-tasks-count' },
            { title: 'Tamamlandı', value: '0', icon: 'fas fa-check-circle', color: 'success', id: 'completed-tasks-count' }
        ],
        compact: true,
        animation: true
    });
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
            currentStatusFilter = 'pending,in_progress,blocked';
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
        { value: 'pending,in_progress,blocked', label: 'Aktif Görevler' },
        ...statusOptions.map(s => ({ value: s.value, label: s.label }))
    ];

    tasksFilters.addDropdownFilter({
        id: 'status-filter',
        label: 'Durum',
        options: statusFilterOptions,
        placeholder: 'Durum seçin',
        value: 'pending,in_progress,blocked',
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
        columns: [
            {
                field: 'job_order',
                label: 'İş Emri',
                sortable: true,
                formatter: (value, row) => {
                    if (!value) return '-';
                    const jobOrderTitle = row.job_order_title ? ` - ${row.job_order_title}` : '';
                    return `<strong>${value}</strong>${jobOrderTitle}`;
                }
            },
            {
                field: 'title',
                label: 'Görev Başlığı',
                sortable: true,
                formatter: (value) => value || '-'
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
                field: 'is_blocked',
                label: 'Engel',
                sortable: false,
                formatter: (value) => {
                    if (value) {
                        return '<span class="status-badge status-red">Engellendi</span>';
                    }
                    return '-';
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
                key: 'block',
                label: 'Engelle',
                icon: 'fas fa-ban',
                class: 'btn-outline-danger',
                onClick: (row) => showBlockTaskModal(row.id),
                visible: (row) => row.status === 'in_progress'
            },
            {
                key: 'unblock',
                label: 'Engeli Kaldır',
                icon: 'fas fa-unlock',
                class: 'btn-outline-warning',
                onClick: (row) => handleUnblockTask(row.id),
                visible: (row) => row.status === 'blocked'
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
    // Block task modal (for entering reason)
    blockTaskModal = new EditModal('block-task-modal-container', {
        title: 'Görevi Engelle',
        icon: 'fas fa-ban',
        size: 'md',
        showEditButton: false
    });

    blockTaskModal.onSaveCallback(async (formData) => {
        const taskId = window.pendingBlockTaskId;
        if (!taskId) return;

        const reason = formData.blocker_reason;
        if (!reason || reason.trim() === '') {
            showNotification('Engel nedeni gereklidir', 'error');
            return;
        }

        try {
            await blockDepartmentTask(taskId, { reason: reason.trim() });
            showNotification('Görev engellendi', 'success');
            blockTaskModal.hide();
            window.pendingBlockTaskId = null;
            await loadTasks();
        } catch (error) {
            console.error('Error blocking task:', error);
            let errorMessage = 'Görev engellenirken hata oluştu';
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

            if (formData.title !== undefined) updateData.title = formData.title;
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
            if (formData.sequence !== undefined) {
                updateData.sequence = formData.sequence ? parseInt(formData.sequence) : null;
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
            window.pendingSubtaskParentId = null;
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
        if (filterValues['status-filter']) {
            if (filterValues['status-filter'].includes(',')) {
                options.status__in = filterValues['status-filter'];
            } else {
                options.status = filterValues['status-filter'];
            }
        } else {
            // Default: show active tasks
            options.status__in = 'pending,in_progress,blocked';
        }

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
        tasks = response.results || [];
        totalTasks = response.count || 0;

        // Update table data with pagination info
        if (tasksTable) {
            tasksTable.updateData(tasks, totalTasks, currentPage);
        }

        updateStatistics();

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

function updateStatistics() {
    try {
        const totalCount = totalTasks;
        const pendingCount = tasks.filter(t => t.status === 'pending').length;
        const inProgressCount = tasks.filter(t => t.status === 'in_progress').length;
        const blockedCount = tasks.filter(t => t.status === 'blocked' || t.is_blocked).length;
        const completedCount = tasks.filter(t => t.status === 'completed').length;

        // Update statistics cards
        if (tasksStats) {
            tasksStats.updateValues({
                0: totalCount.toString(),
                1: pendingCount.toString(),
                2: inProgressCount.toString(),
                3: blockedCount.toString(),
                4: completedCount.toString()
            });
        }
    } catch (error) {
        console.error('Error updating statistics:', error);
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

        if (task.is_blocked && task.blocker_reason) {
            taskDetailsModal.addSection({
                title: 'Engel Bilgisi',
                icon: 'fas fa-ban',
                iconColor: 'text-danger'
            });

            taskDetailsModal.addField({
                id: 'task-blocker-reason',
                name: 'blocker_reason',
                label: 'Engel Nedeni',
                type: 'textarea',
                value: task.blocker_reason,
                icon: 'fas fa-exclamation-triangle',
                colSize: 12
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
            id: 'edit-title',
            name: 'title',
            label: 'Başlık',
            type: 'text',
            value: task.title || '',
            required: true,
            icon: 'fas fa-heading',
            colSize: 12,
            helpText: 'Görev başlığı'
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
            icon: 'fas fa-sort-numeric-up',
            colSize: 6,
            helpText: 'Görev sırası'
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

function showBlockTaskModal(taskId) {
    window.pendingBlockTaskId = taskId;

    blockTaskModal.clearAll();

    blockTaskModal.addSection({
        title: 'Görevi Engelle',
        icon: 'fas fa-ban',
        iconColor: 'text-danger'
    });

    blockTaskModal.addField({
        id: 'blocker_reason',
        name: 'blocker_reason',
        label: 'Engel Nedeni',
        type: 'textarea',
        placeholder: 'Görevin engellenme nedenini açıklayın...',
        required: true,
        icon: 'fas fa-exclamation-triangle',
        colSize: 12,
        helpText: 'Görevin neden engellendiğini detaylı olarak açıklayın'
    });

    blockTaskModal.render();
    blockTaskModal.show();
}

async function handleUnblockTask(taskId) {
    confirmationModal.show({
        message: 'Bu görevin engelini kaldırmak istediğinize emin misiniz?',
        confirmText: 'Evet, Engeli Kaldır',
        onConfirm: async () => {
            try {
                await unblockDepartmentTask(taskId);
                showNotification('Görev engeli kaldırıldı', 'success');
                confirmationModal.hide();
                await loadTasks();
            } catch (error) {
                console.error('Error unblocking task:', error);
                let errorMessage = 'Görev engeli kaldırılırken hata oluştu';
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
        if (filterValues['status-filter']) {
            if (filterValues['status-filter'].includes(',')) {
                options.status__in = filterValues['status-filter'];
            } else {
                options.status = filterValues['status-filter'];
            }
        } else {
            options.status__in = 'pending,in_progress,blocked';
        }

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
