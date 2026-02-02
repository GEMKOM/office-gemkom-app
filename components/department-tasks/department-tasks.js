import { initNavbar } from '../navbar.js';
import { HeaderComponent } from '../header/header.js';
import { FiltersComponent } from '../filters/filters.js';
import { TableComponent } from '../table/table.js';
import { ConfirmationModal } from '../confirmation-modal/confirmation-modal.js';
import { EditModal } from '../edit-modal/edit-modal.js';
import { DisplayModal } from '../display-modal/display-modal.js';
import { showNotification } from '../notification/notification.js';
import { initRouteProtection } from '../../apis/routeProtection.js';
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
} from '../../apis/projects/departmentTasks.js';
import { authFetchUsers } from '../../apis/users.js';

/**
 * Initialize the department tasks page. Call from design/projects, planning/projects, or procurement/projects.
 * @param {Object} config - Page configuration
 * @param {string} config.department - API department: design, planning, procurement
 * @param {string} config.backUrl - URL for back button
 * @param {string} config.pageTitle - Header title
 * @param {string} config.subtitle - Header subtitle
 * @param {string} [config.userTeam] - Team for assigned-user filter (defaults to department)
 * @param {Object} [config.containerIds] - Override container IDs: header, filters, table
 * @param {Array} [config.customFilters] - Extra filter definitions added after defaults
 * @param {Object} [config.customTableColumns] - { insertAfter: string, columns: Array } to add columns
 * @param {Function} [config.onBeforeLoadTasks] - Called before each loadTasks()
 * @param {Function} [config.onAfterLoadTasks] - Called after each loadTasks()
 */
export async function initDepartmentTasksPage(config) {
    const {
        department,
        backUrl,
        pageTitle,
        subtitle,
        userTeam = department,
        containerIds: containerIdsOverride = {},
        customFilters = [],
        customTableColumns,
        onBeforeLoadTasks,
        onAfterLoadTasks
    } = config;

    const containerIds = {
        header: 'header-placeholder',
        filters: 'filters-placeholder',
        table: 'tasks-table-container',
        ...containerIdsOverride
    };

    // State management (closure)
    let currentPage = 1;
    let currentStatusFilter = 'pending,in_progress';
    let currentFilters = {};
    let tasks = [];
    let totalTasks = 0;
    let isLoading = false;
    let statusOptions = STATUS_OPTIONS;
    let departmentOptions = DEPARTMENT_OPTIONS;
    let users = [];
    let expandedRows = new Set();
    let subtasksCache = new Map();
    let taskHierarchyMap = new Map(); // Track hierarchy levels for each task
    let expandButtonHandler = null;

    // Component instances
    let tasksFilters = null;
    let tasksTable = null;
    let confirmationModal = null;
    let taskDetailsModal = null;
    let editTaskModal = null;
    let addSubtaskModal = null;

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

    // --- Init entry (called by page) ---
    if (!initRouteProtection()) {
        return;
    }

    await initNavbar();

    new HeaderComponent({
        title: pageTitle,
        subtitle: subtitle,
        icon: 'project-diagram',
        showBackButton: 'block',
        showCreateButton: 'none',
        showRefreshButton: 'block',
        onBackClick: () => { window.location.href = backUrl; },
        onRefreshClick: async () => {
            currentPage = 1;
            await loadTasks();
        }
    });

    await initializeComponents();
    await loadTasks();

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

        // Load users for assignment filter (team from config)
        try {
            const usersResponse = await authFetchUsers(1, 10000, { team: userTeam });
            users = usersResponse.results || [];
        } catch (error) {
            console.warn('Could not fetch users:', error);
        }

        initializeFiltersComponent();
        initializeTableComponent();
        initializeModalComponents();
        
        // Check for task parameter in URL to open modal directly
        setupUrlHandlers();
    } catch (error) {
        console.error('Error initializing components:', error);
        showNotification('Bileşenler yüklenirken hata oluştu', 'error');
    }
}

function setupUrlHandlers() {
    // Check URL on initial load
    checkUrlAndOpenModal();
    
    // Handle browser back/forward buttons
    window.addEventListener('popstate', () => {
        checkUrlAndOpenModal();
    });
}

async function checkUrlAndOpenModal() {
    const urlParams = new URLSearchParams(window.location.search);
    const taskParam = urlParams.get('task');
    
    if (taskParam) {
        try {
            // Fetch task data and open modal
            await viewTaskDetails(taskParam);
        } catch (error) {
            console.error('Error opening modal from URL:', error);
            showNotification('Modal açılırken hata oluştu', 'error');
            // Clean up URL if task not found
            const url = new URL(window.location);
            url.searchParams.delete('task');
            window.history.replaceState({}, '', url);
        }
    } else {
        // Close any open modals if no task parameter
        if (taskDetailsModal) {
            taskDetailsModal.hide();
        }
    }
}

function initializeFiltersComponent() {
    tasksFilters = new FiltersComponent(containerIds.filters, {
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

    // Optional: add custom filters (for future per-page extensions)
    (customFilters || []).forEach(f => {
        if (f.type === 'dropdown') tasksFilters.addDropdownFilter(f);
        else if (f.type === 'text') tasksFilters.addTextFilter(f);
        else if (f.type === 'date') tasksFilters.addDateFilter(f);
    });
}

function initializeTableComponent() {
    tasksTable = new TableComponent(containerIds.table, {
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
                field: '_expand',
                label: '',
                sortable: false,
                width: '80px',
                formatter: (value, row) => {
                    const subtasksCount = row.subtasks_count || (row.subtasks ? row.subtasks.length : 0);
                    const hasChildren = subtasksCount > 0; // Show expand button for any task with subtasks
                    // Check expanded state with both ID formats
                    const isExpanded = expandedRows.has(row.id) || 
                                     (typeof row.id === 'number' && expandedRows.has(String(row.id))) ||
                                     (typeof row.id === 'string' && !isNaN(row.id) && expandedRows.has(parseInt(row.id)));
                    
                    // Get hierarchy level from map (calculated in mergeExpandedSubtasks)
                    let hierarchyLevel = taskHierarchyMap.get(row.id);
                    if (hierarchyLevel === undefined) {
                        // Fallback: calculate on the fly if not in map
                        hierarchyLevel = row.parent ? calculateTaskHierarchyLevel(row, tasks, subtasksCache) : 0;
                    }

                    const LEVEL_WIDTH = 20;
                    const LINE_THICKNESS = 2;
                    const LINE_COLOR = '#cbd5e0';
                    const BUTTON_SIZE = 24;
                    const buttonLeftPosition = hierarchyLevel * LEVEL_WIDTH;

                    // Build tree lines for all hierarchy levels
                    let treeLinesHtml = '';
                    if (hierarchyLevel > 0) {
                        // Draw vertical lines for all ancestor levels
                        for (let level = 0; level < hierarchyLevel; level++) {
                            const lineLeft = (level * LEVEL_WIDTH) + (LEVEL_WIDTH / 2) - (LINE_THICKNESS / 2);
                            
                            // Vertical line (from top to middle) for each ancestor level
                            treeLinesHtml += `
                                <div style="position: absolute; left: ${lineLeft}px; top: 0; height: 50%; width: ${LINE_THICKNESS}px; background: ${LINE_COLOR};"></div>
                            `;
                            
                            // Horizontal line for levels before the last one
                            if (level < hierarchyLevel - 1) {
                                const levelCenter = (level * LEVEL_WIDTH) + (LEVEL_WIDTH / 2);
                                const nextLevelCenter = ((level + 1) * LEVEL_WIDTH) + (LEVEL_WIDTH / 2);
                                const horizontalWidth = nextLevelCenter - levelCenter;
                                treeLinesHtml += `
                                    <div style="position: absolute; left: ${levelCenter}px; top: 50%; width: ${horizontalWidth}px; height: ${LINE_THICKNESS}px; background: ${LINE_COLOR}; transform: translateY(-50%);"></div>
                                `;
                            }
                        }
                        
                        // Draw horizontal line for the last level (connects to button)
                        const lastLevelCenter = ((hierarchyLevel - 1) * LEVEL_WIDTH) + (LEVEL_WIDTH / 2);
                        const buttonLeft = hierarchyLevel * LEVEL_WIDTH;
                        const horizontalWidth = buttonLeft - lastLevelCenter;
                        treeLinesHtml += `
                            <div style="position: absolute; left: ${lastLevelCenter}px; top: 50%; width: ${horizontalWidth}px; height: ${LINE_THICKNESS}px; background: ${LINE_COLOR}; transform: translateY(-50%);"></div>
                        `;
                    }

                    let expandButton = '';
                    if (hasChildren) {
                        const expandIcon = isExpanded ? 'fa-minus' : 'fa-plus';
                        const buttonClass = isExpanded ? 'expanded' : 'collapsed';
                        expandButton = `
                            <button type="button" class="btn btn-sm expand-toggle-btn ${buttonClass}" data-task-id="${row.id}"
                                style="position: absolute; left: ${buttonLeftPosition}px; top: 50%; transform: translateY(-50%); width: ${BUTTON_SIZE}px; height: ${BUTTON_SIZE}px; padding: 0; border-radius: 4px; border: 1.5px solid #0d6efd; background: ${isExpanded ? '#0d6efd' : '#ffffff'}; color: ${isExpanded ? '#ffffff' : '#0d6efd'}; display: inline-flex; align-items: center; justify-content: center; transition: all 0.2s ease; cursor: pointer; z-index: 1;"
                                onmouseover="this.style.transform='translateY(-50%) scale(1.1)'; this.style.boxShadow='0 2px 4px rgba(13,110,253,0.3)';"
                                onmouseout="this.style.transform='translateY(-50%) scale(1)'; this.style.boxShadow='none';"
                                title="${isExpanded ? 'Daralt' : 'Genişlet'}">
                                <i class="fas ${expandIcon}" style="font-size: 10px;"></i>
                            </button>
                        `;
                    }

                    return `
                        <div style="position: relative; width: 100%; height: 40px; min-height: 40px;">
                            ${treeLinesHtml}
                            ${expandButton}
                        </div>
                    `;
                }
            },
            {
                field: 'job_order',
                label: 'İş Emri',
                sortable: true,
                formatter: (value, row) => {
                    if (!value) return '-';
                    const isSubtask = !!row.parent;
                    const indent = isSubtask ? 30 : 0;
                    const prefix = isSubtask ? '<i class="fas fa-level-down-alt text-muted me-1"></i>' : '';
                    
                    // Special case: if type is machining_part, show key link to machining tasks
                    if (row.type === 'machining_part') {
                        // Try to get key from various possible locations
                        let key = row.key || (row.machining_data && row.machining_data.key);
                        
                        if (key) {
                            // Make the key clickable, opening in a new tab
                            const keyUrl = `/manufacturing/machining/tasks/list/?key=${encodeURIComponent(key)}`;
                            const keyLink = `<a href="${keyUrl}" target="_blank" rel="noopener noreferrer" class="text-decoration-none" style="font-weight: 700; color: #0d6efd; font-family: 'Courier New', monospace; font-size: 1rem; background: rgba(13, 110, 253, 0.1); padding: 0.25rem 0.5rem; border-radius: 4px; border: 1px solid rgba(13, 110, 253, 0.2); text-decoration: none; display: inline-block; white-space: nowrap; cursor: pointer; transition: all 0.2s ease;" onmouseover="this.style.background='rgba(13, 110, 253, 0.2)'; this.style.textDecoration='underline';" onmouseout="this.style.background='rgba(13, 110, 253, 0.1)'; this.style.textDecoration='none';">${key}</a>`;
                            return `<div style="padding-left: ${indent}px;">${prefix}${keyLink}</div>`;
                        }
                    }
                    
                    // Special case: if type is cnc_part, show key link to CNC cutting
                    if (row.type === 'cnc_part') {
                        // Try to get key from cnc_data
                        let key = (row.cnc_data && row.cnc_data.cnc_task_key) || row.key;
                        
                        if (key) {
                            // Make the key clickable, opening in a new tab
                            const keyUrl = `/manufacturing/cnc-cutting/cuts/?cut=${encodeURIComponent(key)}`;
                            const keyLink = `<a href="${keyUrl}" target="_blank" rel="noopener noreferrer" class="text-decoration-none" style="font-weight: 700; color: #0d6efd; font-family: 'Courier New', monospace; font-size: 1rem; background: rgba(13, 110, 253, 0.1); padding: 0.25rem 0.5rem; border-radius: 4px; border: 1px solid rgba(13, 110, 253, 0.2); text-decoration: none; display: inline-block; white-space: nowrap; cursor: pointer; transition: all 0.2s ease;" onmouseover="this.style.background='rgba(13, 110, 253, 0.2)'; this.style.textDecoration='underline';" onmouseout="this.style.background='rgba(13, 110, 253, 0.1)'; this.style.textDecoration='none';">${key}</a>`;
                            return `<div style="padding-left: ${indent}px;">${prefix}${keyLink}</div>`;
                        }
                    }
                    
                    // Default: show job order link to project tracking
                    const jobOrderLink = `<a href="/projects/project-tracking/?job_no=${encodeURIComponent(value)}" class="text-decoration-none"><strong>${value}</strong></a>`;
                    return `<div style="padding-left: ${indent}px;">${prefix}${jobOrderLink}</div>`;
                }
            },
            {
                field: 'title',
                label: 'Görev Başlığı',
                sortable: true,
                formatter: (value, row) => {
                    const isSubtask = !!row.parent;
                    const indent = isSubtask ? 30 : 0;
                    // Main tasks: show job order title; subtasks: show task title
                    const displayText = isSubtask ? (value || '-') : (row.job_order_title || value || '-');
                    return `<div style="padding-left: ${indent}px;">${displayText}</div>`;
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
                field: 'completion_percentage',
                label: 'Tamamlanma',
                sortable: false,
                formatter: (value) => {
                    if (!value && value !== 0) return '<div class="text-center">-</div>';
                    const percentage = Math.min(100, Math.max(0, parseFloat(value) || 0));
                    
                    // Determine color based on percentage
                    let colorClass = 'bg-success';
                    let barColor = '#10b981'; // green
                    if (percentage === 0) {
                        colorClass = 'bg-secondary';
                        barColor = '#6b7280'; // grey
                    } else if (percentage < 25) {
                        colorClass = 'bg-danger';
                        barColor = '#ef4444'; // red
                    } else if (percentage < 50) {
                        colorClass = 'bg-warning';
                        barColor = '#f59e0b'; // yellow/orange
                    } else if (percentage < 75) {
                        colorClass = 'bg-info';
                        barColor = '#3b82f6'; // blue
                    } else if (percentage < 100) {
                        colorClass = 'bg-success';
                        barColor = '#10b981'; // green
                    } else {
                        colorClass = 'bg-success';
                        barColor = '#059669'; // darker green for 100%
                    }
                    
                    // Determine text color based on percentage (for contrast)
                    const textColor = percentage > 50 ? '#ffffff' : '#1f2937';
                    const textShadow = percentage > 50 ? '0 1px 2px rgba(0,0,0,0.2)' : 'none';
                    
                    return `
                        <div class="text-center" style="position: relative; width: 100%;">
                            <div class="progress" style="height: 24px; border-radius: 6px; background-color: #e5e7eb; box-shadow: inset 0 1px 2px rgba(0,0,0,0.1);">
                                <div class="progress-bar ${colorClass}" 
                                     role="progressbar" 
                                     style="width: ${percentage}%; 
                                            background: linear-gradient(90deg, ${barColor} 0%, ${barColor}dd 100%);
                                            border-radius: 6px;
                                            transition: width 0.6s ease;
                                            box-shadow: 0 2px 4px rgba(0,0,0,0.1);" 
                                     aria-valuenow="${percentage}" 
                                     aria-valuemin="0" 
                                     aria-valuemax="100">
                                </div>
                            </div>
                            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); 
                                        font-weight: 600; font-size: 0.75rem; color: ${textColor}; 
                                        text-shadow: ${textShadow}; pointer-events: none; white-space: nowrap; z-index: 1;">
                                ${percentage.toFixed(1)}%
                            </div>
                        </div>
                    `;
                }
            },
            {
                field: 'subtasks_count',
                label: 'Alt Görevler',
                sortable: false,
                formatter: (value) => {
                    if (!value || value === 0) return '<div class="text-center">-</div>';
                    return `<div class="text-center">${value.toString()}</div>`;
                }
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
                onClick: (row) => viewTaskDetails(row.id),
                visible: (row) => row.type !== 'machining_part' && row.type !== 'cnc_part'
            },
            {
                key: 'edit',
                label: 'Düzenle',
                icon: 'fas fa-edit',
                class: 'btn-outline-primary',
                onClick: (row) => showEditTaskModal(row.id),
                visible: (row) => row.type !== 'machining_part' && row.type !== 'cnc_part'
            },
            {
                key: 'add-subtask',
                label: 'Alt Görev Ekle',
                icon: 'fas fa-plus-circle',
                class: 'btn-outline-info',
                onClick: (row) => showAddSubtaskModal(row.id),
                visible: (row) => !row.parent && row.type !== 'machining_part' && row.type !== 'cnc_part' // Only show for main tasks (not subtasks) and not for machining/cnc parts
            },
            {
                key: 'start',
                label: 'Başlat',
                icon: 'fas fa-play',
                class: 'btn-outline-success',
                onClick: (row) => handleStartTask(row.id),
                visible: (row) => row.status === 'pending' && row.can_start && row.type !== 'machining_part' && row.type !== 'cnc_part'
            },
            {
                key: 'complete',
                label: 'Tamamla',
                icon: 'fas fa-check',
                class: 'btn-outline-success',
                onClick: (row) => handleCompleteTask(row.id),
                visible: (row) => row.status === 'in_progress' && row.type !== 'machining_part' && row.type !== 'cnc_part'
            },
            {
                key: 'uncomplete',
                label: 'Tamamlanmayı Geri Al',
                icon: 'fas fa-undo',
                class: 'btn-outline-warning',
                onClick: (row) => handleUncompleteTask(row.id),
                visible: (row) => row.status === 'completed' && row.type !== 'machining_part' && row.type !== 'cnc_part'
            },
            {
                key: 'skip',
                label: 'Atla',
                icon: 'fas fa-forward',
                class: 'btn-outline-secondary',
                onClick: (row) => handleSkipTask(row.id),
                visible: (row) => row.status === 'pending' && row.type !== 'machining_part' && row.type !== 'cnc_part'
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
    
    // Handle URL cleanup when modal is closed
    taskDetailsModal.onCloseCallback(() => {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('task')) {
            const url = new URL(window.location);
            url.searchParams.delete('task');
            window.history.replaceState({}, '', url);
        }
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

        if (typeof onBeforeLoadTasks === 'function') {
            await onBeforeLoadTasks();
        }

        // Clear caches so we always show fresh data (multi-user safe)
        subtasksCache.clear();
        expandedRows.clear();
        taskHierarchyMap.clear();

        isLoading = true;
        if (tasksTable) {
            tasksTable.setLoading(true);
        }

        // Get filter values
        const filterValues = tasksFilters ? tasksFilters.getFilterValues() : {};

        // Build query options
        const options = {
            page: currentPage,
            department: department,
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

        if (typeof onAfterLoadTasks === 'function') {
            await onAfterLoadTasks();
        }
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

// Calculate hierarchy level for a task based on its parent chain
function calculateTaskHierarchyLevel(task, mainTasks, subtasksCache) {
    if (!task.parent) {
        return 0;
    }
    
    // Check if parent is in main tasks (level 0)
    const parentInMain = mainTasks.find(t => t.id === task.parent);
    if (parentInMain) {
        return 1;
    }
    
    // Search in cached subtasks recursively
    for (const [parentId, subtasks] of subtasksCache.entries()) {
        const parentTask = subtasks.find(st => st.id === task.parent);
        if (parentTask) {
            // Found parent, calculate its level + 1
            return calculateTaskHierarchyLevel(parentTask, mainTasks, subtasksCache) + 1;
        }
    }
    
    // Default: assume it's a direct child (level 1)
    return 1;
}

// Recursively merge expanded subtasks into the main tasks array
function mergeExpandedSubtasks(mainTasks) {
    const merged = [];
    
    // Clear hierarchy map before recalculating
    taskHierarchyMap.clear();
    
    function addTaskAndChildren(task, level = 0) {
        // Store hierarchy level
        taskHierarchyMap.set(task.id, level);
        
        merged.push(task);
        
        // If this task is expanded, add its subtasks recursively
        // Check both the task ID and try numeric conversion if it's a string
        const taskId = task.id;
        const isExpanded = expandedRows.has(taskId) || 
                          (typeof taskId === 'string' && !isNaN(taskId) && expandedRows.has(parseInt(taskId))) ||
                          (typeof taskId === 'number' && expandedRows.has(String(taskId)));
        
        let subtasks = null;
        if (subtasksCache.has(taskId)) {
            subtasks = subtasksCache.get(taskId);
        } else if (typeof taskId === 'string' && !isNaN(taskId) && subtasksCache.has(parseInt(taskId))) {
            subtasks = subtasksCache.get(parseInt(taskId));
        } else if (typeof taskId === 'number' && subtasksCache.has(String(taskId))) {
            subtasks = subtasksCache.get(String(taskId));
        }
        
        if (isExpanded && subtasks && subtasks.length > 0) {
            subtasks.forEach(subtask => {
                const subtaskLevel = level + 1;
                addTaskAndChildren(subtask, subtaskLevel);
            });
        }
    }
    
    mainTasks.forEach(task => {
        addTaskAndChildren(task, 0);
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
        
        const taskIdAttr = expandButton.getAttribute('data-task-id');
        if (!taskIdAttr) {
            console.warn('Expand button missing data-task-id attribute');
            return;
        }
        
        // Handle both numeric and string IDs (e.g., 96 or "cnc-part-1722")
        const taskId = isNaN(taskIdAttr) ? taskIdAttr : parseInt(taskIdAttr);
        const numericTaskId = typeof taskId === 'string' && !isNaN(taskId) ? parseInt(taskId) : taskId;
        
        // Check expanded state (try both formats)
        const isExpanded = expandedRows.has(taskId) || 
                          (typeof taskId === 'number' && expandedRows.has(String(taskId))) ||
                          (typeof taskId === 'string' && !isNaN(taskId) && expandedRows.has(parseInt(taskId)));
        
        if (isExpanded) {
            // Collapse: remove from expanded set (both formats)
            expandedRows.delete(taskId);
            if (typeof taskId === 'number') {
                expandedRows.delete(String(taskId));
            } else if (typeof taskId === 'string' && !isNaN(taskId)) {
                expandedRows.delete(parseInt(taskId));
            }
            // Update table without loading state
            updateTableDataOnly();
        } else {
            // Expand: always fetch subtasks to get latest data
            try {
                // Show loading state on button
                const icon = expandButton.querySelector('i');
                if (icon) {
                    icon.className = 'fas fa-spinner fa-spin text-primary';
                }
                
                // Use numeric ID for API call if it's a numeric string
                await fetchTaskSubtasks(numericTaskId);
            } catch (error) {
                console.error(`Error fetching subtasks for task ${numericTaskId}:`, error);
                showNotification('Alt görevler yüklenirken hata oluştu', 'error');
                // Restore icon on error
                const icon = expandButton.querySelector('i');
                if (icon) {
                    icon.className = 'fas fa-chevron-right text-primary';
                }
                return;
            }
            // Store expanded state with both formats
            expandedRows.add(taskId);
            if (typeof taskId === 'number') {
                expandedRows.add(String(taskId));
            } else if (typeof taskId === 'string' && !isNaN(taskId)) {
                expandedRows.add(parseInt(taskId));
            }
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
            department: department,
            parent: taskId,
            ordering: 'sequence'
        });
        
        const subtasks = response.results || [];
        // Store with both ID formats for flexibility
        subtasksCache.set(taskId, subtasks);
        if (typeof taskId === 'number') {
            subtasksCache.set(String(taskId), subtasks);
        } else if (typeof taskId === 'string' && !isNaN(taskId)) {
            subtasksCache.set(parseInt(taskId), subtasks);
        }
    } catch (error) {
        console.error(`Error fetching subtasks for task ${taskId}:`, error);
        subtasksCache.set(taskId, []);
        if (typeof taskId === 'number') {
            subtasksCache.set(String(taskId), []);
        } else if (typeof taskId === 'string' && !isNaN(taskId)) {
            subtasksCache.set(parseInt(taskId), []);
        }
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
        
        // Update URL to include the task ID
        const url = new URL(window.location);
        url.searchParams.set('task', taskId);
        window.history.pushState({}, '', url);
        
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
            department: department,
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

} // end initDepartmentTasksPage
