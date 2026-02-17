import { initNavbar } from '../navbar.js';
import { HeaderComponent } from '../header/header.js';
import { FiltersComponent } from '../filters/filters.js';
import { TableComponent } from '../table/table.js';
import { ConfirmationModal } from '../confirmation-modal/confirmation-modal.js';
import { EditModal } from '../edit-modal/edit-modal.js';
import { DisplayModal } from '../display-modal/display-modal.js';
import { showNotification } from '../notification/notification.js';
import { initRouteProtection } from '../../apis/routeProtection.js';
import { getUser } from '../../authService.js';
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
import { createRelease, completeRevision } from '../../apis/projects/design.js';
import { markPlanningRequestItemDelivered } from '../../apis/planning/planningRequestItems.js';

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
    // Read initial page and page_size from URL
    const urlParams = new URLSearchParams(window.location.search);
    let currentPage = parseInt(urlParams.get('page')) || 1;
    let currentPageSize = parseInt(urlParams.get('page_size')) || 20;
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
    let currentSortField = 'job_order'; // Default sort field
    let currentSortDirection = 'desc'; // Default sort direction

    // Component instances
    let tasksFilters = null;
    let tasksTable = null;
    let confirmationModal = null;
    let taskDetailsModal = null;
    let editTaskModal = null;
    let addSubtaskModal = null;
    let createReleaseModal = null;
    let completeRevisionModal = null;

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
            updateUrlParams({ page: 1 });
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

        // Get current user to determine default filter
        let defaultAssignedUserId = null;
        try {
            const currentUser = await getUser();
            // Filter by current user if not superuser and occupation is not manager
            if (!currentUser.is_superuser && currentUser.occupation !== 'manager') {
                defaultAssignedUserId = currentUser.id ? currentUser.id.toString() : null;
            }
        } catch (error) {
            console.warn('Could not fetch current user:', error);
        }

        initializeFiltersComponent(defaultAssignedUserId);
        initializeTableComponent();
        initializeModalComponents();
        
        // Initialize release modal for design department
        if (department === 'design') {
            initializeReleaseModal();
        }
        
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
        // Reload tasks if page/page_size changed
        const urlParams = new URLSearchParams(window.location.search);
        const urlPage = parseInt(urlParams.get('page')) || 1;
        const urlPageSize = parseInt(urlParams.get('page_size')) || 20;
        if (urlPage !== currentPage || urlPageSize !== currentPageSize) {
            currentPage = urlPage;
            currentPageSize = urlPageSize;
            if (tasksTable) {
                tasksTable.options.itemsPerPage = currentPageSize;
            }
            loadTasks();
        }
    });
}

// Helper function to update URL parameters
function updateUrlParams(params) {
    const url = new URL(window.location);
    Object.keys(params).forEach(key => {
        if (params[key] !== null && params[key] !== undefined) {
            url.searchParams.set(key, params[key].toString());
        } else {
            url.searchParams.delete(key);
        }
    });
    window.history.replaceState({}, '', url);
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

function initializeFiltersComponent(defaultAssignedUserId = null) {
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
        value: defaultAssignedUserId || '',
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
        currentSortField: currentSortField,
        currentSortDirection: currentSortDirection,
        rowAttributes: (row, rowIndex) => {
            const attributes = {};
            
            // Style subtasks differently
            if (row.parent) {
                attributes.class = 'subtask-row';
                attributes['data-parent-id'] = row.parent;
            }
            
            // Clearly indicate tasks under revision
            if (row.is_under_revision) {
                // Light warning background (no custom CSS)
                attributes.style = 'background-color: rgba(255, 193, 7, 0.12);';
                attributes['data-under-revision'] = 'true';
            }
            
            return Object.keys(attributes).length ? attributes : null;
        },
        columns: [
            {
                field: '_expand',
                label: '',
                sortable: false,
                width: '80px',
                headerClass: 'expand-column-header',
                cellClass: 'expand-column-cell',
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
                    const isSubtask = !!row.parent;
                    const indent = isSubtask ? 30 : 0;
                    const prefix = isSubtask ? '<i class="fas fa-level-down-alt text-muted me-1"></i>' : '';
                    
                    // Special case: for procurement_item task type, show purchase_request_number or planning_request_number
                    // Style it like machining tasks with badge-like appearance
                    if (row.task_type === 'procurement_item') {
                        let requestNumber = null;
                        let requestUrl = null;
                        
                        if (row.purchase_request_number) {
                            requestNumber = row.purchase_request_number;
                            requestUrl = `/procurement/purchase-requests/registry/?talep=${encodeURIComponent(requestNumber)}`;
                        } else if (row.planning_request_number) {
                            requestNumber = row.planning_request_number;
                            requestUrl = `/planning/department-requests/?talep=${encodeURIComponent(requestNumber)}`;
                        }
                        
                        if (requestNumber && requestUrl) {
                            const requestLink = `<a href="${requestUrl}" target="_blank" rel="noopener noreferrer" class="text-decoration-none" style="font-weight: 700; color: #0d6efd; font-family: 'Courier New', monospace; font-size: 1rem; background: rgba(13, 110, 253, 0.1); padding: 0.25rem 0.5rem; border-radius: 4px; border: 1px solid rgba(13, 110, 253, 0.2); text-decoration: none; display: inline-block; white-space: nowrap; cursor: pointer; transition: all 0.2s ease;" onmouseover="this.style.background='rgba(13, 110, 253, 0.2)'; this.style.textDecoration='underline';" onmouseout="this.style.background='rgba(13, 110, 253, 0.1)'; this.style.textDecoration='none';">${requestNumber}</a>`;
                            return `<div style="padding-left: ${indent}px;">${prefix}${requestLink}</div>`;
                        }
                    }
                    
                    // Early return if no value (after checking procurement)
                    if (!value) return '-';
                    
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
                    // Check if this is a subtask (has a parent)
                    // Consistent with other column formatters (line 446, 509, 533)
                    const isSubtask = !!row.parent;
                    const indent = isSubtask ? 30 : 0;
                    // Main tasks: show job order title; subtasks: show task title
                    const displayText = isSubtask ? (value || '-') : (row.job_order_title || value || '-');
                    
                    // Make title editable only for subtasks
                    if (isSubtask) {
                        const taskId = row.id;
                        const cursorStyle = 'cursor: pointer;';
                        return `
                            <div class="editable-title" data-task-id="${taskId}" data-title-value="${value || ''}" style="padding-left: ${indent}px; ${cursorStyle}" title="Başlığı düzenlemek için tıklayın">
                                ${displayText}
                            </div>
                        `;
                    }
                    
                    return `<div style="padding-left: ${indent}px;">${displayText}</div>`;
                }
            },
            {
                field: 'customer_name',
                label: 'Müşteri',
                sortable: true,
                formatter: (value, row) => {
                    const isSubtask = !!row.parent;
                    const indent = isSubtask ? 30 : 0;
                    const displayText = value || '-';
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
                    const statusBadge = `<span class="status-badge ${colorClass}">${status.label}</span>`;
                    const revisionBadge = row.is_under_revision
                        ? `<span class="status-badge status-red ms-1"><i class="fas fa-rotate me-1"></i>Revizyonda</span>`
                        : '';
                    
                    return `<div class="d-flex align-items-center flex-wrap">${statusBadge}${revisionBadge}</div>`;
                }
            },
            {
                field: 'assigned_to_name',
                label: 'Atanan',
                sortable: false,
                editable: true,
                formatter: (value, row) => {
                    // Make it editable (exclude machining_part and cnc_part types)
                    const isEditable = row.type !== 'machining_part' && row.type !== 'cnc_part';
                    const cursorStyle = isEditable ? 'cursor: pointer;' : '';
                    const taskId = row.id;
                    const assignedToId = row.assigned_to || '';
                    const displayValue = value || '-';
                    
                    return `
                        <div class="editable-assigned" data-task-id="${taskId}" data-assigned-to="${assignedToId}" style="${cursorStyle}" ${isEditable ? 'title="Atanan kişiyi değiştirmek için tıklayın"' : ''}>
                            ${displayValue}
                        </div>
                    `;
                }
            },
            {
                field: 'target_completion_date',
                label: 'Hedef Bitiş',
                sortable: true,
                type: 'date',
                editable: true,
                formatter: (value, row) => {
                    // Make it editable (exclude machining_part and cnc_part types)
                    const isEditable = row.type !== 'machining_part' && row.type !== 'cnc_part';
                    const cursorStyle = isEditable ? 'cursor: pointer;' : '';
                    const taskId = row.id;
                    
                    let displayValue = '-';
                    let dateValue = '';
                    if (value) {
                        const date = new Date(value);
                        displayValue = date.toLocaleDateString('tr-TR', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                        });
                        // Format for date input (YYYY-MM-DD)
                        dateValue = date.toISOString().split('T')[0];
                    }
                    
                    return `
                        <div class="editable-date" data-task-id="${taskId}" data-date-value="${dateValue}" style="${cursorStyle}" ${isEditable ? 'title="Hedef bitiş tarihini değiştirmek için tıklayın"' : ''}>
                            ${displayValue}
                        </div>
                    `;
                }
            },
            {
                field: 'completion_percentage',
                label: 'Tamamlanma',
                sortable: false,
                editable: true,
                formatter: (value, row) => {
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
                    
                    // Text color is always black
                    const textColor = '#1f2937';
                    const textShadow = 'none';
                    
                    // Make it clickable for editing (exclude machining_part and cnc_part types)
                    const isEditable = row.type !== 'machining_part' && row.type !== 'cnc_part';
                    const cursorStyle = isEditable ? 'cursor: pointer;' : '';
                    const taskId = row.id;
                    
                    return `
                        <div class="text-center editable-progress" data-task-id="${taskId}" style="position: relative; width: 100%; ${cursorStyle}" ${isEditable ? 'title="İlerlemeyi düzenlemek için tıklayın"' : ''}>
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
                field: 'weight',
                label: 'Ağırlık',
                sortable: true,
                editable: true,
                formatter: (value, row) => {
                    // Make it editable (exclude machining_part and cnc_part types)
                    const isEditable = row.type !== 'machining_part' && row.type !== 'cnc_part';
                    const cursorStyle = isEditable ? 'cursor: pointer;' : '';
                    const taskId = row.id;
                    
                    let displayValue = '-';
                    if (value !== null && value !== undefined && value !== '') {
                        displayValue = parseFloat(value).toFixed(2);
                    }
                    
                    return `
                        <div class="text-center editable-weight" data-task-id="${taskId}" data-weight-value="${value || ''}" style="${cursorStyle}" ${isEditable ? 'title="Ağırlığı düzenlemek için tıklayın"' : ''}>
                            ${displayValue}
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
        itemsPerPage: currentPageSize,
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
            currentSortField = field;
            currentSortDirection = direction;
            await loadTasks();
        },
        onPageSizeChange: async (newPageSize) => {
            currentPage = 1;
            currentPageSize = newPageSize;
            updateUrlParams({ page: 1, page_size: newPageSize });
            await loadTasks();
        },
        onPageChange: async (page) => {
            currentPage = page;
            updateUrlParams({ page: page });
            await loadTasks();
        },
        actions: [
            {
                key: 'view',
                label: 'Detay',
                icon: 'fas fa-eye',
                class: 'btn-outline-info',
                onClick: (row) => viewTaskDetails(row.id),
                visible: (row) => {
                    // Hide for machining_part, cnc_part
                    if (row.type === 'machining_part' || row.type === 'cnc_part') return false;
                    // Hide for procurement_item tasks (with or without purchase_order_id)
                    if (row.task_type === 'procurement_item') return false;
                    return true;
                }
            },
            {
                key: 'edit',
                label: 'Düzenle',
                icon: 'fas fa-edit',
                class: 'btn-outline-primary',
                onClick: (row) => showEditTaskModal(row.id),
                visible: (row) => {
                    // Hide for machining_part, cnc_part
                    if (row.type === 'machining_part' || row.type === 'cnc_part') return false;
                    // Hide for procurement_item tasks (with or without purchase_order_id)
                    if (row.task_type === 'procurement_item') return false;
                    return true;
                }
            },
            {
                key: 'add-subtask',
                label: 'Alt Görev Ekle',
                icon: 'fas fa-plus-circle',
                class: 'btn-outline-info',
                onClick: (row) => showAddSubtaskModal(row.id),
                visible: (row) => {
                    // Hide for subtasks, machining_part, cnc_part
                    if (row.parent) return false;
                    if (row.type === 'machining_part' || row.type === 'cnc_part') return false;
                    // Hide for procurement_item tasks (with or without purchase_order_id)
                    if (row.task_type === 'procurement_item') return false;
                    return true;
                }
            },
            {
                key: 'start',
                label: 'Başlat',
                icon: 'fas fa-play',
                class: 'btn-outline-success',
                onClick: (row) => handleStartTask(row.id),
                visible: (row) => {
                    // Hide for procurement_item tasks (with or without purchase_order_id)
                    if (row.task_type === 'procurement_item') return false;
                    return row.status === 'pending' && row.can_start && row.type !== 'machining_part' && row.type !== 'cnc_part';
                }
            },
            {
                key: 'complete',
                label: 'Tamamla',
                icon: 'fas fa-check',
                class: 'btn-outline-success',
                onClick: (row) => handleCompleteTask(row.id, row),
                visible: (row) => {
                    // For procurement_item tasks, show only if planning_request_item_id exists and is_delivered is false
                    if (row.task_type === 'procurement_item') {
                        return !!row.planning_request_item_id && row.is_delivered === false;
                    }
                    // For other tasks, show only when in_progress and not machining/cnc parts
                    return row.status === 'in_progress' && row.type !== 'machining_part' && row.type !== 'cnc_part';
                }
            },
            {
                key: 'uncomplete',
                label: 'Tamamlanmayı Geri Al',
                icon: 'fas fa-undo',
                class: 'btn-outline-warning',
                onClick: (row) => handleUncompleteTask(row.id),
                visible: (row) => {
                    // Hide for procurement_item tasks (with or without purchase_order_id)
                    if (row.task_type === 'procurement_item') return false;
                    return row.status === 'completed' && row.type !== 'machining_part' && row.type !== 'cnc_part';
                }
            },
            {
                key: 'skip',
                label: 'Atla',
                icon: 'fas fa-forward',
                class: 'btn-outline-secondary',
                onClick: (row) => handleSkipTask(row.id),
                visible: (row) => {
                    // Hide for procurement_item tasks (with or without purchase_order_id)
                    if (row.task_type === 'procurement_item') return false;
                    return row.status !== 'completed' && row.status !== 'skipped' && row.type !== 'machining_part' && row.type !== 'cnc_part';
                }
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
            // Get the task to check if it's a subtask
            const task = await getDepartmentTaskById(taskId);
            const isSubtask = !!task.parent;
            
            // Prepare update data
            const updateData = {};

            // Title can only be changed for subtasks
            if (isSubtask && formData.title !== undefined) {
                const trimmedTitle = formData.title.trim();
                if (!trimmedTitle) {
                    showNotification('Başlık boş olamaz', 'error');
                    return;
                }
                updateData.title = trimmedTitle;
            }
            // job_order and sequence cannot be changed, so don't include them in update
            
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
            if (formData.weight !== undefined && formData.weight !== null && formData.weight !== '') {
                const weightValue = parseFloat(formData.weight);
                if (!isNaN(weightValue)) {
                    subtaskData.weight = weightValue;
                }
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

function initializeReleaseModal() {
    // Create release modal
    createReleaseModal = new EditModal('create-release-modal-container', {
        title: 'Teknik Çizim Yayını Oluştur',
        icon: 'fas fa-file-export',
        size: 'lg',
        showEditButton: false
    });

    // Complete revision modal
    completeRevisionModal = new EditModal('complete-revision-modal-container', {
        title: 'Revizyonu Tamamla',
        icon: 'fas fa-check-circle',
        size: 'lg',
        showEditButton: false,
        saveButtonText: 'Tamamla'
    });

    createReleaseModal.onSaveCallback(async (formData) => {
        const taskId = window.pendingReleaseTaskId;
        if (!taskId) return;

        try {
            // Get task to get job_order and check if it's a subtask
            const task = await getDepartmentTaskById(taskId);
            
            if (!task.job_order) {
                showNotification('İş emri bulunamadı', 'error');
                return;
            }

            // Check if this is a subtask
            const isSubtask = !!task.parent;

            // Prepare release data
            const releaseData = {
                job_order: task.job_order,
                folder_path: formData.folder_path || '',
                changelog: formData.changelog ? formData.changelog.trim() : '',
                revision_code: formData.revision_code || '',
            };

            // auto_complete_design_task is only for parent tasks
            // For subtasks, we'll complete them separately after creating the release
            if (!isSubtask) {
                releaseData.auto_complete_design_task = formData.auto_complete_design_task !== false;
            }

            // Optional fields
            if (formData.hardcopy_count !== undefined && formData.hardcopy_count !== null && formData.hardcopy_count !== '') {
                const hardcopyCount = parseInt(formData.hardcopy_count);
                if (!isNaN(hardcopyCount)) {
                    releaseData.hardcopy_count = hardcopyCount;
                }
            }

            // Validate required fields
            if (!releaseData.folder_path.trim()) {
                showNotification('Klasör yolu gereklidir', 'error');
                return;
            }

            // Create release
            await createRelease(releaseData);
            
            // For subtasks, complete them separately via the completion endpoint
            if (isSubtask) {
                const completeResponse = await completeDepartmentTask(taskId);
                
                // Update the task in local data
                if (completeResponse && completeResponse.task) {
                    updateTaskInLocalData(taskId, completeResponse.task);
                }
            }
            
            showNotification('Teknik çizim yayını oluşturuldu', 'success');
            createReleaseModal.hide();
            window.pendingReleaseTaskId = null;
            
            // Update the table without full reload
            updateTableDataOnly();
        } catch (error) {
            console.error('Error creating release:', error);
            let errorMessage = 'Yayın oluşturulurken hata oluştu';
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

    completeRevisionModal.onSaveCallback(async (formData) => {
        const taskId = window.pendingRevisionCompletionTaskId;
        if (!taskId) return;

        try {
            const task = await getDepartmentTaskById(taskId);

            const releaseId = task.active_revision_release_id;
            if (!releaseId) {
                showNotification('Aktif revizyon yayını bulunamadı', 'error');
                return;
            }

            const completionData = {
                folder_path: formData.folder_path || '',
                revision_code: formData.revision_code || '',
                changelog: formData.changelog ? formData.changelog.trim() : ''
            };

            if (!completionData.folder_path.trim()) {
                showNotification('Klasör yolu gereklidir', 'error');
                return;
            }
            if (!completionData.revision_code.trim()) {
                showNotification('Revizyon kodu gereklidir', 'error');
                return;
            }
            if (!completionData.changelog.trim()) {
                showNotification('Değişiklik günlüğü gereklidir', 'error');
                return;
            }

            if (formData.hardcopy_count !== undefined && formData.hardcopy_count !== null && formData.hardcopy_count !== '') {
                const hardcopyCount = parseInt(formData.hardcopy_count);
                if (!isNaN(hardcopyCount)) {
                    completionData.hardcopy_count = hardcopyCount;
                }
            }

            if (formData.topic_content && formData.topic_content.trim()) {
                completionData.topic_content = formData.topic_content.trim();
            }

            await completeRevision(releaseId, completionData);

            showNotification('Revizyon tamamlandı', 'success');
            completeRevisionModal.hide();
            window.pendingRevisionCompletionTaskId = null;
            await loadTasks();
        } catch (error) {
            console.error('Error completing revision:', error);
            let errorMessage = 'Revizyon tamamlanırken hata oluştu';
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
                // ignore parse
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
        // Build ordering string (field name with optional '-' prefix for descending)
        const orderingField = currentSortField || 'job_order';
        const orderingDirection = currentSortDirection === 'desc' ? '-' : '';
        const ordering = `${orderingDirection}${orderingField}`;
        
        const options = {
            page: currentPage,
            page_size: currentPageSize,
            department: department,
            main_only: true, // Only show main tasks (no subtasks)
            ordering: ordering
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
            // Sync sort state with table component
            tasksTable.currentSortField = currentSortField;
            tasksTable.currentSortDirection = currentSortDirection;
            tasksTable.options.currentSortField = currentSortField;
            tasksTable.options.currentSortDirection = currentSortDirection;
            tasksTable.updateData(dataToDisplay, totalTasks, currentPage);
        }

        // Setup expand button listeners after table is updated
        setTimeout(() => {
            setupExpandButtonListeners();
            setupProgressEditListeners();
            setupAssignedEditListeners();
            setupDateEditListeners();
            setupWeightEditListeners();
            setupTitleEditListeners();
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
        setupProgressEditListeners();
        setupAssignedEditListeners();
        setupDateEditListeners();
        setupWeightEditListeners();
        setupTitleEditListeners();
    }, 50);
}

// Update a single task in the local data after API response
function updateTaskInLocalData(taskId, updatedTask) {
    // Find and update the task in the tasks array
    const taskIndex = tasks.findIndex(t => t.id === taskId);
    if (taskIndex !== -1) {
        tasks[taskIndex] = updatedTask;
        return true;
    }
    
    // If task not found in main tasks, it might be a subtask
    // Check in subtasks cache
    for (const [parentId, subtasks] of subtasksCache.entries()) {
        const subtaskIndex = subtasks.findIndex(st => st.id === taskId);
        if (subtaskIndex !== -1) {
            subtasks[subtaskIndex] = updatedTask;
            return true;
        }
    }
    
    return false;
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

// Setup event listeners for progress editing using event delegation
let progressEditHandler = null;
function setupProgressEditListeners() {
    if (!tasksTable || !tasksTable.container) {
        // Table not ready yet, try again later
        setTimeout(setupProgressEditListeners, 100);
        return;
    }
    
    // Remove existing handler if any
    if (progressEditHandler) {
        tasksTable.container.removeEventListener('click', progressEditHandler);
    }
    
    // Create the handler function
    progressEditHandler = (e) => {
        // Check if the clicked element is an editable progress cell
        const progressCell = e.target.closest('.editable-progress');
        if (!progressCell) return;
        
        // Don't trigger if clicking on an input
        if (e.target.tagName === 'INPUT') return;
        
        e.preventDefault();
        e.stopPropagation();
        
        const taskIdAttr = progressCell.getAttribute('data-task-id');
        if (!taskIdAttr) {
            console.warn('Progress cell missing data-task-id attribute');
            return;
        }
        
        // Get current percentage from the displayed text
        const percentageText = progressCell.querySelector('div[style*="position: absolute"]');
        let currentValue = 0;
        if (percentageText) {
            const match = percentageText.textContent.match(/(\d+\.?\d*)%/);
            if (match) {
                currentValue = parseFloat(match[1]);
            }
        }
        
        // Store original value for comparison
        const originalValue = currentValue;
        const originalContent = progressCell.innerHTML;
        
        // Create inline input
        const input = document.createElement('input');
        input.type = 'number';
        input.min = '0';
        input.max = '99';
        input.step = '0.1';
        input.value = currentValue.toFixed(1);
        input.className = 'form-control form-control-sm';
        input.style.cssText = 'width: 80px; margin: 0 auto; text-align: center; font-weight: 600; z-index: 10; position: relative;';
        
        // Replace the progress bar with input
        progressCell.innerHTML = '';
        progressCell.style.display = 'flex';
        progressCell.style.justifyContent = 'center';
        progressCell.style.alignItems = 'center';
        progressCell.appendChild(input);
        
        // Focus and select the input
        input.focus();
        input.select();
        
        // Helper function to update progress display without reloading
        const updateProgressDisplay = (percentage) => {
            const percentageValue = Math.min(100, Math.max(0, parseFloat(percentage) || 0));
            
            // Determine color based on percentage
            let colorClass = 'bg-success';
            let barColor = '#10b981';
            if (percentageValue === 0) {
                colorClass = 'bg-secondary';
                barColor = '#6b7280';
            } else if (percentageValue < 25) {
                colorClass = 'bg-danger';
                barColor = '#ef4444';
            } else if (percentageValue < 50) {
                colorClass = 'bg-warning';
                barColor = '#f59e0b';
            } else if (percentageValue < 75) {
                colorClass = 'bg-info';
                barColor = '#3b82f6';
            } else if (percentageValue < 100) {
                colorClass = 'bg-success';
                barColor = '#10b981';
            } else {
                colorClass = 'bg-success';
                barColor = '#059669';
            }
            
            // Text color is always black
            const textColor = '#1f2937';
            const textShadow = 'none';
            
            progressCell.innerHTML = `
                <div class="text-center" style="position: relative; width: 100%;">
                    <div class="progress" style="height: 24px; border-radius: 6px; background-color: #e5e7eb; box-shadow: inset 0 1px 2px rgba(0,0,0,0.1);">
                        <div class="progress-bar ${colorClass}" 
                             role="progressbar" 
                             style="width: ${percentageValue}%; 
                                    background: linear-gradient(90deg, ${barColor} 0%, ${barColor}dd 100%);
                                    border-radius: 6px;
                                    transition: width 0.6s ease;
                                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);" 
                             aria-valuenow="${percentageValue}" 
                             aria-valuemin="0" 
                             aria-valuemax="100">
                        </div>
                    </div>
                    <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); 
                                font-weight: 600; font-size: 0.75rem; color: ${textColor}; 
                                text-shadow: ${textShadow}; pointer-events: none; white-space: nowrap; z-index: 1;">
                        ${percentageValue.toFixed(1)}%
                    </div>
                </div>
            `;
            progressCell.style.display = '';
            progressCell.style.justifyContent = '';
            progressCell.style.alignItems = '';
        };
        
        // Handle save on Enter or blur
        const saveProgress = async () => {
            const newValue = parseFloat(input.value);
            if (isNaN(newValue) || newValue < 0 || newValue > 99) {
                showNotification('Geçerli bir değer girin (0-99)', 'error');
                // Restore original display
                progressCell.innerHTML = originalContent;
                progressCell.style.display = '';
                progressCell.style.justifyContent = '';
                progressCell.style.alignItems = '';
                return;
            }
            
            // Check if value actually changed
            if (Math.abs(newValue - originalValue) < 0.01) {
                // Value didn't change, just restore display
                progressCell.innerHTML = originalContent;
                progressCell.style.display = '';
                progressCell.style.justifyContent = '';
                progressCell.style.alignItems = '';
                return;
            }
            
            const taskId = isNaN(taskIdAttr) ? taskIdAttr : parseInt(taskIdAttr);
            const numericTaskId = typeof taskId === 'string' && !isNaN(taskId) ? parseInt(taskId) : taskId;
            
            try {
                // Send PATCH request with manual_progress
                await patchDepartmentTask(numericTaskId, { manual_progress: newValue });
                showNotification('İlerleme güncellendi', 'success');
                // Update display without reloading
                updateProgressDisplay(newValue);
                // Also update the task in the data array
                const task = tasks.find(t => t.id === numericTaskId) || 
                           Array.from(subtasksCache.values()).flat().find(t => t.id === numericTaskId);
                if (task) {
                    task.completion_percentage = newValue;
                }
            } catch (error) {
                console.error('Error updating progress:', error);
                let errorMessage = 'İlerleme güncellenirken hata oluştu';
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
                // Restore original display
                progressCell.innerHTML = originalContent;
                progressCell.style.display = '';
                progressCell.style.justifyContent = '';
                progressCell.style.alignItems = '';
            }
        };
        
        // Handle cancel on Escape
        const cancelEdit = () => {
            progressCell.innerHTML = originalContent;
            progressCell.style.display = '';
            progressCell.style.justifyContent = '';
            progressCell.style.alignItems = '';
        };
        
        input.addEventListener('blur', saveProgress);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                input.blur();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelEdit();
            }
        });
    };
    
    // Attach the event listener to the container (which persists across renders)
    tasksTable.container.addEventListener('click', progressEditHandler);
}

// Setup event listeners for assigned user editing using event delegation
let assignedEditHandler = null;
function setupAssignedEditListeners() {
    if (!tasksTable || !tasksTable.container) {
        setTimeout(setupAssignedEditListeners, 100);
        return;
    }
    
    if (assignedEditHandler) {
        tasksTable.container.removeEventListener('click', assignedEditHandler);
    }
    
    assignedEditHandler = (e) => {
        const assignedCell = e.target.closest('.editable-assigned');
        if (!assignedCell) return;
        
        if (e.target.tagName === 'SELECT') return;
        
        e.preventDefault();
        e.stopPropagation();
        
        const taskIdAttr = assignedCell.getAttribute('data-task-id');
        const currentAssignedTo = assignedCell.getAttribute('data-assigned-to') || '';
        
        if (!taskIdAttr) {
            console.warn('Assigned cell missing data-task-id attribute');
            return;
        }
        
        // Store original values
        const originalValue = currentAssignedTo;
        const originalContent = assignedCell.innerHTML;
        const originalDisplayValue = assignedCell.textContent.trim();
        
        // Create dropdown with users
        const select = document.createElement('select');
        select.className = 'form-select form-select-sm';
        select.style.cssText = 'width: 180px; margin: 0 auto; z-index: 10; position: relative;';
        
        // Add "Unassigned" option
        const unassignedOption = document.createElement('option');
        unassignedOption.value = '';
        unassignedOption.textContent = 'Atanmamış';
        if (!currentAssignedTo) {
            unassignedOption.selected = true;
        }
        select.appendChild(unassignedOption);
        
        // Add user options
        users.forEach(user => {
            const option = document.createElement('option');
            option.value = user.id.toString();
            option.textContent = user.name || user.username;
            if (currentAssignedTo === user.id.toString()) {
                option.selected = true;
            }
            select.appendChild(option);
        });
        
        // Replace cell content with dropdown
        assignedCell.innerHTML = '';
        assignedCell.style.display = 'flex';
        assignedCell.style.justifyContent = 'center';
        assignedCell.style.alignItems = 'center';
        assignedCell.appendChild(select);
        
        // Focus the select
        select.focus();
        
        // Helper function to update assigned display without reloading
        const updateAssignedDisplay = (assignedToId) => {
            let displayValue = '-';
            if (assignedToId) {
                const user = users.find(u => u.id.toString() === assignedToId.toString());
                if (user) {
                    displayValue = user.name || user.username;
                }
            }
            assignedCell.innerHTML = displayValue;
            assignedCell.setAttribute('data-assigned-to', assignedToId || '');
            assignedCell.style.display = '';
            assignedCell.style.justifyContent = '';
            assignedCell.style.alignItems = '';
        };
        
        // Handle save on blur or change
        const saveAssigned = async () => {
            const newValue = select.value;
            
            // Check if value actually changed
            if (newValue === originalValue) {
                // Value didn't change, just restore display
                assignedCell.innerHTML = originalContent;
                assignedCell.style.display = '';
                assignedCell.style.justifyContent = '';
                assignedCell.style.alignItems = '';
                return;
            }
            
            const taskId = isNaN(taskIdAttr) ? taskIdAttr : parseInt(taskIdAttr);
            const numericTaskId = typeof taskId === 'string' && !isNaN(taskId) ? parseInt(taskId) : taskId;
            
            // Prepare update data
            const updateData = {
                assigned_to: newValue === '' || newValue === null ? null : parseInt(newValue)
            };
            
            try {
                await patchDepartmentTask(numericTaskId, updateData);
                showNotification('Atanan kişi güncellendi', 'success');
                // Update display without reloading
                updateAssignedDisplay(newValue);
                // Also update the task in the data array
                const task = tasks.find(t => t.id === numericTaskId) || 
                           Array.from(subtasksCache.values()).flat().find(t => t.id === numericTaskId);
                if (task) {
                    task.assigned_to = newValue ? parseInt(newValue) : null;
                    const user = users.find(u => u.id.toString() === newValue);
                    task.assigned_to_name = user ? (user.name || user.username) : null;
                }
            } catch (error) {
                console.error('Error updating assigned user:', error);
                let errorMessage = 'Atanan kişi güncellenirken hata oluştu';
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
                // Restore original display
                assignedCell.innerHTML = originalContent;
                assignedCell.style.display = '';
                assignedCell.style.justifyContent = '';
                assignedCell.style.alignItems = '';
            }
        };
        
        // Handle cancel on Escape
        const cancelEdit = () => {
            assignedCell.innerHTML = originalContent;
            assignedCell.style.display = '';
            assignedCell.style.justifyContent = '';
            assignedCell.style.alignItems = '';
        };
        
        select.addEventListener('blur', saveAssigned);
        select.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                cancelEdit();
            }
        });
        // Also save on change (user selects a different option)
        select.addEventListener('change', () => {
            setTimeout(() => select.blur(), 100);
        });
    };
    
    tasksTable.container.addEventListener('click', assignedEditHandler);
}

// Setup event listeners for date editing using event delegation
let dateEditHandler = null;
function setupDateEditListeners() {
    if (!tasksTable || !tasksTable.container) {
        setTimeout(setupDateEditListeners, 100);
        return;
    }
    
    if (dateEditHandler) {
        tasksTable.container.removeEventListener('click', dateEditHandler);
    }
    
    dateEditHandler = (e) => {
        const dateCell = e.target.closest('.editable-date');
        if (!dateCell) return;
        
        if (e.target.tagName === 'INPUT') return;
        
        e.preventDefault();
        e.stopPropagation();
        
        const taskIdAttr = dateCell.getAttribute('data-task-id');
        const currentDateValue = dateCell.getAttribute('data-date-value') || '';
        
        if (!taskIdAttr) {
            console.warn('Date cell missing data-task-id attribute');
            return;
        }
        
        // Store original values
        const originalValue = currentDateValue;
        const originalContent = dateCell.innerHTML;
        
        // Create date input
        const input = document.createElement('input');
        input.type = 'date';
        input.value = currentDateValue;
        input.className = 'form-control form-control-sm';
        input.style.cssText = 'width: 150px; margin: 0 auto; z-index: 10; position: relative;';
        
        // Replace cell content with input
        dateCell.innerHTML = '';
        dateCell.style.display = 'flex';
        dateCell.style.justifyContent = 'center';
        dateCell.style.alignItems = 'center';
        dateCell.appendChild(input);
        
        // Focus the input
        input.focus();
        
        // Helper function to update date display without reloading
        const updateDateDisplay = (dateValue) => {
            let displayValue = '-';
            if (dateValue) {
                const date = new Date(dateValue);
                displayValue = date.toLocaleDateString('tr-TR', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                });
            }
            dateCell.innerHTML = displayValue;
            dateCell.setAttribute('data-date-value', dateValue || '');
            dateCell.style.display = '';
            dateCell.style.justifyContent = '';
            dateCell.style.alignItems = '';
        };
        
        // Handle save on blur or Enter
        const saveDate = async () => {
            const newValue = input.value;
            
            // Check if value actually changed
            if (newValue === originalValue) {
                // Value didn't change, just restore display
                dateCell.innerHTML = originalContent;
                dateCell.style.display = '';
                dateCell.style.justifyContent = '';
                dateCell.style.alignItems = '';
                return;
            }
            
            const taskId = isNaN(taskIdAttr) ? taskIdAttr : parseInt(taskIdAttr);
            const numericTaskId = typeof taskId === 'string' && !isNaN(taskId) ? parseInt(taskId) : taskId;
            
            // Prepare update data
            const updateData = {
                target_completion_date: newValue || null
            };
            
            try {
                await patchDepartmentTask(numericTaskId, updateData);
                showNotification('Hedef bitiş tarihi güncellendi', 'success');
                // Update display without reloading
                updateDateDisplay(newValue);
                // Also update the task in the data array
                const task = tasks.find(t => t.id === numericTaskId) || 
                           Array.from(subtasksCache.values()).flat().find(t => t.id === numericTaskId);
                if (task) {
                    task.target_completion_date = newValue || null;
                }
            } catch (error) {
                console.error('Error updating date:', error);
                let errorMessage = 'Hedef bitiş tarihi güncellenirken hata oluştu';
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
                // Restore original display
                dateCell.innerHTML = originalContent;
                dateCell.style.display = '';
                dateCell.style.justifyContent = '';
                dateCell.style.alignItems = '';
            }
        };
        
        // Handle cancel on Escape
        const cancelEdit = () => {
            dateCell.innerHTML = originalContent;
            dateCell.style.display = '';
            dateCell.style.justifyContent = '';
            dateCell.style.alignItems = '';
        };
        
        input.addEventListener('blur', saveDate);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                input.blur();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelEdit();
            }
        });
    };
    
    tasksTable.container.addEventListener('click', dateEditHandler);
}

// Setup event listeners for weight editing using event delegation
let weightEditHandler = null;
function setupWeightEditListeners() {
    if (!tasksTable || !tasksTable.container) {
        setTimeout(setupWeightEditListeners, 100);
        return;
    }
    
    if (weightEditHandler) {
        tasksTable.container.removeEventListener('click', weightEditHandler);
    }
    
    weightEditHandler = (e) => {
        const weightCell = e.target.closest('.editable-weight');
        if (!weightCell) return;
        
        if (e.target.tagName === 'INPUT') return;
        
        e.preventDefault();
        e.stopPropagation();
        
        const taskIdAttr = weightCell.getAttribute('data-task-id');
        const currentWeightValue = weightCell.getAttribute('data-weight-value') || '';
        
        if (!taskIdAttr) {
            console.warn('Weight cell missing data-task-id attribute');
            return;
        }
        
        // Store original values
        const originalValue = currentWeightValue;
        const originalContent = weightCell.innerHTML;
        
        // Get current value from display text
        let currentValue = '';
        const displayText = weightCell.textContent.trim();
        if (displayText && displayText !== '-') {
            currentValue = displayText;
        } else if (currentWeightValue) {
            currentValue = parseFloat(currentWeightValue).toFixed(2);
        }
        
        // Create number input
        const input = document.createElement('input');
        input.type = 'number';
        input.step = '0.01';
        input.min = '0';
        input.value = currentValue;
        input.className = 'form-control form-control-sm';
        input.style.cssText = 'width: 100px; margin: 0 auto; z-index: 10; position: relative; text-align: center;';
        
        // Replace cell content with input
        weightCell.innerHTML = '';
        weightCell.style.display = 'flex';
        weightCell.style.justifyContent = 'center';
        weightCell.style.alignItems = 'center';
        weightCell.appendChild(input);
        
        // Focus and select the input
        input.focus();
        input.select();
        
        // Helper function to update weight display without reloading
        const updateWeightDisplay = (weightValue) => {
            let displayValue = '-';
            if (weightValue !== null && weightValue !== undefined && weightValue !== '') {
                const numValue = parseFloat(weightValue);
                if (!isNaN(numValue)) {
                    displayValue = numValue.toFixed(2);
                }
            }
            weightCell.innerHTML = displayValue;
            weightCell.setAttribute('data-weight-value', weightValue || '');
            weightCell.style.display = '';
            weightCell.style.justifyContent = '';
            weightCell.style.alignItems = '';
        };
        
        // Handle save on blur or Enter
        const saveWeight = async () => {
            const newValue = input.value.trim();
            
            // Check if value actually changed
            const originalNum = originalValue ? parseFloat(originalValue) : null;
            const newNum = newValue ? parseFloat(newValue) : null;
            
            if ((originalNum === null && newNum === null) || 
                (originalNum !== null && newNum !== null && Math.abs(originalNum - newNum) < 0.001)) {
                // Value didn't change, just restore display
                weightCell.innerHTML = originalContent;
                weightCell.style.display = '';
                weightCell.style.justifyContent = '';
                weightCell.style.alignItems = '';
                return;
            }
            
            // Validate the value
            if (newValue && (isNaN(parseFloat(newValue)) || parseFloat(newValue) < 0)) {
                showNotification('Geçerli bir ağırlık değeri girin (0 veya pozitif sayı)', 'error');
                // Restore original display
                weightCell.innerHTML = originalContent;
                weightCell.style.display = '';
                weightCell.style.justifyContent = '';
                weightCell.style.alignItems = '';
                return;
            }
            
            const taskId = isNaN(taskIdAttr) ? taskIdAttr : parseInt(taskIdAttr);
            const numericTaskId = typeof taskId === 'string' && !isNaN(taskId) ? parseInt(taskId) : taskId;
            
            // Prepare update data
            const updateData = {
                weight: newValue === '' ? null : parseFloat(newValue)
            };
            
            try {
                await patchDepartmentTask(numericTaskId, updateData);
                showNotification('Ağırlık güncellendi', 'success');
                // Update display without reloading
                updateWeightDisplay(newValue);
                // Also update the task in the data array
                const task = tasks.find(t => t.id === numericTaskId) || 
                           Array.from(subtasksCache.values()).flat().find(t => t.id === numericTaskId);
                if (task) {
                    task.weight = newValue === '' ? null : parseFloat(newValue);
                }
            } catch (error) {
                console.error('Error updating weight:', error);
                let errorMessage = 'Ağırlık güncellenirken hata oluştu';
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
                // Restore original display
                weightCell.innerHTML = originalContent;
                weightCell.style.display = '';
                weightCell.style.justifyContent = '';
                weightCell.style.alignItems = '';
            }
        };
        
        // Handle cancel on Escape
        const cancelEdit = () => {
            weightCell.innerHTML = originalContent;
            weightCell.style.display = '';
            weightCell.style.justifyContent = '';
            weightCell.style.alignItems = '';
        };
        
        input.addEventListener('blur', saveWeight);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                input.blur();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelEdit();
            }
        });
    };
    
    tasksTable.container.addEventListener('click', weightEditHandler);
}

// Setup event listeners for title editing using event delegation (only for subtasks)
let titleEditHandler = null;
function setupTitleEditListeners() {
    if (!tasksTable || !tasksTable.container) {
        setTimeout(setupTitleEditListeners, 100);
        return;
    }
    
    if (titleEditHandler) {
        tasksTable.container.removeEventListener('click', titleEditHandler);
    }
    
    titleEditHandler = (e) => {
        const titleCell = e.target.closest('.editable-title');
        if (!titleCell) return;
        
        // Don't trigger if clicking on an input that's already there
        if (e.target.tagName === 'INPUT') return;
        
        // Don't trigger if clicking on a button or link
        if (e.target.closest('button') || e.target.closest('a')) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        const taskIdAttr = titleCell.getAttribute('data-task-id');
        const currentTitleValue = titleCell.getAttribute('data-title-value') || '';
        
        if (!taskIdAttr) {
            console.warn('Title cell missing data-task-id attribute');
            return;
        }
        
        // Store original values
        const originalValue = currentTitleValue;
        const originalContent = titleCell.innerHTML;
        
        // Get current value from display text
        let currentValue = '';
        const displayText = titleCell.textContent.trim();
        if (displayText && displayText !== '-') {
            currentValue = displayText;
        } else if (currentTitleValue) {
            currentValue = currentTitleValue;
        }
        
        // Create text input
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentValue;
        input.className = 'form-control form-control-sm';
        input.style.cssText = 'width: 100%; padding: 4px 8px; z-index: 10; position: relative;';
        
        // Replace cell content with input
        titleCell.innerHTML = '';
        titleCell.style.display = 'flex';
        titleCell.style.justifyContent = 'flex-start';
        titleCell.style.alignItems = 'center';
        titleCell.appendChild(input);
        
        // Focus and select the input
        input.focus();
        input.select();
        
        // Helper function to update title display without reloading
        const updateTitleDisplay = (titleValue) => {
            const displayValue = titleValue || '-';
            titleCell.innerHTML = displayValue;
            titleCell.setAttribute('data-title-value', titleValue || '');
            titleCell.style.display = '';
            titleCell.style.justifyContent = '';
            titleCell.style.alignItems = '';
        };
        
        // Handle save on blur or Enter
        const saveTitle = async () => {
            const newValue = input.value.trim();
            
            // Check if value actually changed
            if (newValue === originalValue) {
                // Value didn't change, just restore display
                titleCell.innerHTML = originalContent;
                titleCell.style.display = '';
                titleCell.style.justifyContent = '';
                titleCell.style.alignItems = '';
                return;
            }
            
            // Validate: title cannot be empty
            if (!newValue) {
                showNotification('Başlık boş olamaz', 'error');
                // Restore original display
                titleCell.innerHTML = originalContent;
                titleCell.style.display = '';
                titleCell.style.justifyContent = '';
                titleCell.style.alignItems = '';
                return;
            }
            
            const taskId = isNaN(taskIdAttr) ? taskIdAttr : parseInt(taskIdAttr);
            const numericTaskId = typeof taskId === 'string' && !isNaN(taskId) ? parseInt(taskId) : taskId;
            
            // Prepare update data
            const updateData = {
                title: newValue
            };
            
            try {
                await patchDepartmentTask(numericTaskId, updateData);
                showNotification('Başlık güncellendi', 'success');
                // Update display without reloading
                updateTitleDisplay(newValue);
                // Also update the task in the data array
                const task = tasks.find(t => t.id === numericTaskId) || 
                           Array.from(subtasksCache.values()).flat().find(t => t.id === numericTaskId);
                if (task) {
                    task.title = newValue;
                }
            } catch (error) {
                console.error('Error updating title:', error);
                let errorMessage = 'Başlık güncellenirken hata oluştu';
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
                // Restore original display
                titleCell.innerHTML = originalContent;
                titleCell.style.display = '';
                titleCell.style.justifyContent = '';
                titleCell.style.alignItems = '';
            }
        };
        
        // Handle cancel on Escape
        const cancelEdit = () => {
            titleCell.innerHTML = originalContent;
            titleCell.style.display = '';
            titleCell.style.justifyContent = '';
            titleCell.style.alignItems = '';
        };
        
        input.addEventListener('blur', saveTitle);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                input.blur();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelEdit();
            }
        });
    };
    
    tasksTable.container.addEventListener('click', titleEditHandler);
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

        // Check if this is a subtask (has a parent)
        const isSubtask = !!task.parent;
        
        editTaskModal.addField({
            id: 'edit-title',
            name: 'title',
            label: 'Başlık',
            type: 'text',
            value: task.title || '',
            required: true,
            readonly: !isSubtask, // Only editable for subtasks
            icon: 'fas fa-heading',
            colSize: 6,
            helpText: isSubtask ? 'Alt görev başlığı (düzenlenebilir)' : 'Görev başlığı (değiştirilemez)'
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

        addSubtaskModal.addField({
            id: 'subtask-weight',
            name: 'weight',
            label: 'Ağırlık',
            type: 'number',
            value: '',
            min: 0,
            step: 0.01,
            icon: 'fas fa-weight',
            colSize: 6,
            helpText: 'Alt görev ağırlığı'
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

async function handleCompleteTask(taskId, taskRow = null) {
    // For procurement_item tasks with planning_request_item_id, use special completion flow
    if (taskRow && taskRow.task_type === 'procurement_item' && taskRow.planning_request_item_id) {
        confirmationModal.show({
            message: 'Bu planlama talebi kalemini teslim edildi olarak işaretlemek istediğinize emin misiniz?',
            confirmText: 'Evet, Teslim Edildi',
            onConfirm: async () => {
                try {
                    // Get the task to ensure we have the latest data
                    const task = taskRow || await getDepartmentTaskById(taskId);
                    
                    if (!task.planning_request_item_id) {
                        showNotification('Planlama talebi kalemi bulunamadı', 'error');
                        return;
                    }
                    
                    // Use planning_request_item_id from the task response
                    await markPlanningRequestItemDelivered(task.planning_request_item_id);
                    showNotification('Planlama talebi kalemi teslim edildi olarak işaretlendi', 'success');
                    confirmationModal.hide();
                    await loadTasks();
                } catch (error) {
                    console.error('Error marking planning request item as delivered:', error);
                    let errorMessage = 'Planlama talebi kalemi işaretlenirken hata oluştu';
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
        return;
    }
    
    // For design department, check if it's a subtask
    if (department === 'design') {
        // Get task to check if it's a subtask
        const task = taskRow || await getDepartmentTaskById(taskId);
        const isSubtask = !!task.parent;
        
        if (isSubtask) {
            await showSubtaskCompleteModal(taskId);
        } else {
            if (task.is_under_revision) {
                await showCompleteRevisionModal(taskId);
            } else {
                await showCreateReleaseModal(taskId);
            }
        }
    } else {
        // For other departments, use the standard completion flow
        confirmationModal.show({
            message: 'Bu görevi tamamlamak istediğinize emin misiniz?',
            confirmText: 'Evet, Tamamla',
            onConfirm: async () => {
                try {
                    const response = await completeDepartmentTask(taskId);
                    showNotification('Görev tamamlandı', 'success');
                    confirmationModal.hide();
                    
                    // Update the task in the local data without reloading all tasks
                    if (response && response.task) {
                        const updatedTask = response.task;
                        if (updateTaskInLocalData(taskId, updatedTask)) {
                            // Update the table without full reload
                            updateTableDataOnly();
                        } else {
                            // Task not found, fallback to full reload
                            await loadTasks();
                        }
                    } else {
                        // Fallback to full reload if response doesn't have task data
                        await loadTasks();
                    }
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
}

async function showCompleteRevisionModal(taskId) {
    try {
        if (!completeRevisionModal) {
            showNotification('Revizyon tamamlama modalı başlatılamadı', 'error');
            return;
        }

        const task = await getDepartmentTaskById(taskId);

        if (!task.job_order) {
            showNotification('İş emri bulunamadı', 'error');
            return;
        }

        if (!task.is_under_revision) {
            showNotification('Bu görev revizyonda değil', 'error');
            return;
        }

        if (!task.active_revision_release_id) {
            showNotification('Aktif revizyon yayını bulunamadı', 'error');
            return;
        }

        window.pendingRevisionCompletionTaskId = taskId;

        completeRevisionModal.clearAll();

        completeRevisionModal.addSection({
            title: 'Revizyon Tamamlama',
            icon: 'fas fa-check-circle',
            iconColor: 'text-success'
        });

        completeRevisionModal.addField({
            id: 'rev-complete-job-order',
            name: 'job_order',
            label: 'İş Emri',
            type: 'text',
            value: task.job_order ? `${task.job_order} - ${task.job_order_title || ''}` : '-',
            readonly: true,
            icon: 'fas fa-file-invoice',
            colSize: 12,
            helpText: 'İş emri (değiştirilemez)'
        });

        completeRevisionModal.addField({
            id: 'rev-complete-folder-path',
            name: 'folder_path',
            label: 'Klasör Yolu',
            type: 'text',
            value: '',
            required: true,
            placeholder: 'C:\\CVSPDM\\CVS\\009_KAPTAN\\EAF\\009_34_EBT_PANEL\\PDF',
            icon: 'fas fa-folder',
            colSize: 12,
            helpText: 'Ağ klasör yolu (maksimum 500 karakter)'
        });

        completeRevisionModal.addField({
            id: 'rev-complete-revision-code',
            name: 'revision_code',
            label: 'Revizyon Kodu',
            type: 'text',
            value: '',
            required: true,
            placeholder: 'A1, B2, vb.',
            icon: 'fas fa-code-branch',
            colSize: 6,
            helpText: 'Revizyon kodu (örn: A1, B2) - maksimum 10 karakter'
        });

        completeRevisionModal.addField({
            id: 'rev-complete-hardcopy-count',
            name: 'hardcopy_count',
            label: 'Hardcopy Sayısı',
            type: 'number',
            value: '',
            min: 0,
            placeholder: '0',
            icon: 'fas fa-print',
            colSize: 6,
            helpText: 'Hardcopy sayısı (opsiyonel)'
        });

        completeRevisionModal.addSection({
            title: 'Değişiklik Günlüğü',
            icon: 'fas fa-edit',
            iconColor: 'text-warning'
        });

        completeRevisionModal.addField({
            id: 'rev-complete-changelog',
            name: 'changelog',
            label: 'Değişiklik Günlüğü',
            type: 'textarea',
            value: '',
            required: true,
            placeholder: 'Değişiklikleri yazın...\n\n@mention ile kullanıcıları bildirebilirsiniz',
            icon: 'fas fa-align-left',
            colSize: 12,
            helpText: 'Değişiklik günlüğü (@mention destekli)'
        });

        completeRevisionModal.addSection({
            title: 'Konu Mesajı (Opsiyonel)',
            icon: 'fas fa-comment-dots',
            iconColor: 'text-info'
        });

        completeRevisionModal.addField({
            id: 'rev-complete-topic-content',
            name: 'topic_content',
            label: 'Konu Mesajı',
            type: 'textarea',
            value: '',
            required: false,
            placeholder: 'İlgilileri bilgilendirmek için mesaj yazın...\n\n@mention ile kullanıcıları etiketleyebilirsiniz',
            icon: 'fas fa-at',
            colSize: 12,
            helpText: 'Opsiyonel'
        });

        completeRevisionModal.render();
        completeRevisionModal.show();
    } catch (error) {
        console.error('Error opening complete revision modal:', error);
        showNotification('Revizyon tamamlama modalı açılırken hata oluştu', 'error');
    }
}

async function showSubtaskCompleteModal(taskId) {
    try {
        if (!createReleaseModal) {
            showNotification('Yayın modalı başlatılamadı', 'error');
            return;
        }

        const task = await getDepartmentTaskById(taskId);
        
        if (!task.job_order) {
            showNotification('İş emri bulunamadı', 'error');
            return;
        }

        window.pendingReleaseTaskId = taskId;
        
        createReleaseModal.clearAll();

        // Add checkbox to ask if there's a release
        createReleaseModal.addSection({
            title: 'Görevi Tamamla',
            icon: 'fas fa-check-circle',
            iconColor: 'text-success'
        });

        createReleaseModal.addField({
            id: 'has-release',
            name: 'has_release',
            label: 'Yayın var mı?',
            type: 'checkbox',
            value: false,
            icon: 'fas fa-file-export',
            colSize: 12,
            helpText: 'İşaretlendiğinde yayın bilgileri girilebilir'
        });

        // Store field IDs that should be conditionally shown
        const releaseFieldIds = [];

        // Add release fields (initially hidden)
        const releaseSectionId = 'release-section';
        createReleaseModal.addSection({
            id: releaseSectionId,
            title: 'Yayın Bilgileri',
            icon: 'fas fa-info-circle',
            iconColor: 'text-primary'
        });

        createReleaseModal.addField({
            id: 'release-job-order',
            name: 'job_order',
            label: 'İş Emri',
            type: 'text',
            value: task.job_order ? `${task.job_order} - ${task.job_order_title || ''}` : '-',
            readonly: true,
            icon: 'fas fa-file-invoice',
            colSize: 12,
            helpText: 'İş emri (değiştirilemez)'
        });
        releaseFieldIds.push('release-job-order');

        createReleaseModal.addField({
            id: 'release-folder-path',
            name: 'folder_path',
            label: 'Klasör Yolu',
            type: 'text',
            value: '',
            required: false, // Will be set to true when checkbox is checked
            placeholder: 'C:\\CVSPDM\\CVS\\009_KAPTAN\\EAF\\009_34_EBT_PANEL\\PDF',
            icon: 'fas fa-folder',
            colSize: 12,
            helpText: 'Ağ klasör yolu (maksimum 500 karakter)'
        });
        releaseFieldIds.push('release-folder-path');

        createReleaseModal.addField({
            id: 'release-revision-code',
            name: 'revision_code',
            label: 'Revizyon Kodu',
            type: 'text',
            value: '',
            placeholder: 'A1, B2, vb.',
            icon: 'fas fa-code-branch',
            colSize: 6,
            helpText: 'Revizyon kodu (örn: A1, B2) - maksimum 10 karakter'
        });
        releaseFieldIds.push('release-revision-code');

        createReleaseModal.addField({
            id: 'release-hardcopy-count',
            name: 'hardcopy_count',
            label: 'Hardcopy Sayısı',
            type: 'number',
            value: '',
            min: 0,
            placeholder: '0',
            icon: 'fas fa-print',
            colSize: 6,
            helpText: 'Hardcopy sayısı (varsayılan: 0)'
        });
        releaseFieldIds.push('release-hardcopy-count');

        createReleaseModal.addSection({
            id: 'changelog-section',
            title: 'Değişiklik Günlüğü',
            icon: 'fas fa-edit',
            iconColor: 'text-warning'
        });

        // Pre-populate changelog with subtask title
        const defaultChangelog = task.title || '';
        
        createReleaseModal.addField({
            id: 'release-changelog',
            name: 'changelog',
            label: 'Değişiklik Günlüğü',
            type: 'textarea',
            value: defaultChangelog,
            required: false,
            placeholder: '3_0003_1045_EBT_RIGHT_PANEL\n20.01.2026 REV. A1 (POZ-04 REVİZE EDİLDİ)\n\n@umit.bal @elvan.gunes @abdullah.anlas',
            icon: 'fas fa-align-left',
            colSize: 12,
            helpText: 'Değişiklik günlüğü (@mention ile kullanıcıları bildirebilirsiniz) - Opsiyonel'
        });
        releaseFieldIds.push('release-changelog');

        // Initially hide release fields
        createReleaseModal.render();
        
        // Function to toggle release fields visibility
        const toggleReleaseFields = (show) => {
            const modalElement = document.getElementById('create-release-modal-container');
            if (modalElement) {
                const releaseSection = modalElement.querySelector(`[data-section-id="${releaseSectionId}"]`);
                const changelogSection = modalElement.querySelector(`[data-section-id="changelog-section"]`);
                if (releaseSection) releaseSection.style.display = show ? '' : 'none';
                if (changelogSection) changelogSection.style.display = show ? '' : 'none';
                
                // Make folder_path required only if release is checked
                const folderPathField = document.getElementById('release-folder-path');
                if (folderPathField) {
                    folderPathField.required = show;
                    const label = folderPathField.closest('.mb-3')?.querySelector('label');
                    if (label && show) {
                        const requiredMark = label.querySelector('.text-danger');
                        if (!requiredMark && folderPathField.required) {
                            label.innerHTML += ' <span class="text-danger">*</span>';
                        }
                    } else if (label && !show) {
                        const requiredMark = label.querySelector('.text-danger');
                        if (requiredMark) requiredMark.remove();
                    }
                }
            }
        };

        // Initially hide release fields
        setTimeout(() => toggleReleaseFields(false), 50);

        // Add event listener to toggle release fields
        setTimeout(() => {
            const hasReleaseCheckbox = document.getElementById('has-release');
            if (hasReleaseCheckbox) {
                hasReleaseCheckbox.addEventListener('change', (e) => {
                    toggleReleaseFields(e.target.checked);
                });
            }
        }, 100);

        // Override save callback for subtask completion
        createReleaseModal.onSaveCallback(async (formData) => {
            const taskId = window.pendingReleaseTaskId;
            if (!taskId) return;

            try {
                const hasRelease = formData.has_release === true || formData.has_release === 'true';
                
                if (hasRelease) {
                    // Get task to get job_order
                    const task = await getDepartmentTaskById(taskId);
                    
                    if (!task.job_order) {
                        showNotification('İş emri bulunamadı', 'error');
                        return;
                    }

                    // Prepare release data
                    const releaseData = {
                        job_order: task.job_order,
                        folder_path: formData.folder_path || '',
                        changelog: formData.changelog ? formData.changelog.trim() : '',
                        revision_code: formData.revision_code || '',
                    };

                    // Optional fields
                    if (formData.hardcopy_count !== undefined && formData.hardcopy_count !== null && formData.hardcopy_count !== '') {
                        const hardcopyCount = parseInt(formData.hardcopy_count);
                        if (!isNaN(hardcopyCount)) {
                            releaseData.hardcopy_count = hardcopyCount;
                        }
                    }

                    // Validate required fields
                    if (!releaseData.folder_path.trim()) {
                        showNotification('Klasör yolu gereklidir', 'error');
                        return;
                    }

                    // Create release
                    await createRelease(releaseData);
                    
                    // Complete the subtask
                    const completeResponse = await completeDepartmentTask(taskId);
                    
                    showNotification('Yayın oluşturuldu ve görev tamamlandı', 'success');
                    
                    // Update the task in local data
                    if (completeResponse && completeResponse.task) {
                        updateTaskInLocalData(taskId, completeResponse.task);
                    }
                } else {
                    // Only complete the subtask, no release
                    const completeResponse = await completeDepartmentTask(taskId);
                    showNotification('Görev tamamlandı', 'success');
                    
                    // Update the task in local data
                    if (completeResponse && completeResponse.task) {
                        updateTaskInLocalData(taskId, completeResponse.task);
                    }
                }
                
                createReleaseModal.hide();
                window.pendingReleaseTaskId = null;
                
                // Update the table without full reload
                updateTableDataOnly();
            } catch (error) {
                console.error('Error completing subtask:', error);
                const hasRelease = formData.has_release === true || formData.has_release === 'true';
                let errorMessage = hasRelease ? 'Yayın oluşturulurken hata oluştu' : 'Görev tamamlanırken hata oluştu';
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

        createReleaseModal.show();
    } catch (error) {
        console.error('Error loading task for subtask completion:', error);
        showNotification('Görev bilgileri yüklenirken hata oluştu', 'error');
    }
}

async function showCreateReleaseModal(taskId) {
    try {
        if (!createReleaseModal) {
            showNotification('Yayın modalı başlatılamadı', 'error');
            return;
        }

        const task = await getDepartmentTaskById(taskId);
        
        if (!task.job_order) {
            showNotification('İş emri bulunamadı', 'error');
            return;
        }

        window.pendingReleaseTaskId = taskId;
        
        createReleaseModal.clearAll();

        createReleaseModal.addSection({
            title: 'Yayın Bilgileri',
            icon: 'fas fa-info-circle',
            iconColor: 'text-primary'
        });

        createReleaseModal.addField({
            id: 'release-job-order',
            name: 'job_order',
            label: 'İş Emri',
            type: 'text',
            value: task.job_order ? `${task.job_order} - ${task.job_order_title || ''}` : '-',
            readonly: true,
            icon: 'fas fa-file-invoice',
            colSize: 12,
            helpText: 'İş emri (değiştirilemez)'
        });

        createReleaseModal.addField({
            id: 'release-folder-path',
            name: 'folder_path',
            label: 'Klasör Yolu',
            type: 'text',
            value: '',
            required: true,
            placeholder: 'C:\\CVSPDM\\CVS\\009_KAPTAN\\EAF\\009_34_EBT_PANEL\\PDF',
            icon: 'fas fa-folder',
            colSize: 12,
            helpText: 'Ağ klasör yolu (maksimum 500 karakter)'
        });

        createReleaseModal.addField({
            id: 'release-revision-code',
            name: 'revision_code',
            label: 'Revizyon Kodu',
            type: 'text',
            value: '',
            placeholder: 'A1, B2, vb.',
            icon: 'fas fa-code-branch',
            colSize: 6,
            helpText: 'Revizyon kodu (örn: A1, B2) - maksimum 10 karakter'
        });

        createReleaseModal.addField({
            id: 'release-hardcopy-count',
            name: 'hardcopy_count',
            label: 'Hardcopy Sayısı',
            type: 'number',
            value: '',
            min: 0,
            placeholder: '0',
            icon: 'fas fa-print',
            colSize: 6,
            helpText: 'Hardcopy sayısı (varsayılan: 0)'
        });

        createReleaseModal.addSection({
            title: 'Değişiklik Günlüğü',
            icon: 'fas fa-edit',
            iconColor: 'text-warning'
        });

        // Check if this is a subtask (has a parent)
        const isSubtask = !!task.parent;
        
        // For subtasks, pre-populate changelog with the subtask title
        const defaultChangelog = isSubtask && task.title ? task.title : '';
        
        createReleaseModal.addField({
            id: 'release-changelog',
            name: 'changelog',
            label: 'Değişiklik Günlüğü',
            type: 'textarea',
            value: defaultChangelog,
            required: false,
            placeholder: '3_0003_1045_EBT_RIGHT_PANEL\n20.01.2026 REV. A1 (POZ-04 REVİZE EDİLDİ)\n\n@umit.bal @elvan.gunes @abdullah.anlas',
            icon: 'fas fa-align-left',
            colSize: 12,
            helpText: 'Değişiklik günlüğü (@mention ile kullanıcıları bildirebilirsiniz) - Opsiyonel'
        });

        // For subtasks, "Son dağıtım" checkbox should be unchecked by default
        const defaultAutoComplete = !isSubtask;
        
        createReleaseModal.addField({
            id: 'release-auto-complete',
            name: 'auto_complete_design_task',
            label: 'Son dağıtım',
            type: 'checkbox',
            value: defaultAutoComplete,
            icon: 'fas fa-check-circle',
            colSize: 12,
            helpText: 'İşaretlendiğinde görev otomatik olarak tamamlanır'
        });

        createReleaseModal.render();
        createReleaseModal.show();
    } catch (error) {
        console.error('Error loading task for release creation:', error);
        showNotification('Görev bilgileri yüklenirken hata oluştu', 'error');
    }
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
