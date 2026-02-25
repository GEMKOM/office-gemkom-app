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
    unskipDepartmentTask,
    patchDepartmentTask,
    createDepartmentTask,
    bulkCreateSubtasks,
    getStatusChoices,
    getDepartmentChoices,
    STATUS_OPTIONS,
    DEPARTMENT_OPTIONS
} from '../../apis/projects/departmentTasks.js';
import { authFetchUsers } from '../../apis/users.js';
import { createRelease, completeRevision, selfStartRevision } from '../../apis/projects/design.js';
import { markPlanningRequestItemDelivered } from '../../apis/planning/planningRequestItems.js';
import { 
    fetchAssignments, 
    createAssignment, 
    updateAssignment, 
    deleteAssignment,
    createAssignmentWithSubtask
} from '../../apis/subcontracting/assignments.js';
import { fetchSubcontractors } from '../../apis/subcontracting/subcontractors.js';
import { fetchPriceTiers, getPriceTierRemainingWeight, updatePriceTier } from '../../apis/subcontracting/priceTiers.js';
import { submitQCReview, bulkSubmitQCReviews, listQCReviews, listNCRs } from '../../apis/qualityControl.js';

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
    let bulkSubtaskModal = null;
    let createReleaseModal = null;
    let completeRevisionModal = null;
    let submitQCModal = null;

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
        
        // Initialize QC submit modal for manufacturing department
        if (department === 'manufacturing') {
            initializeQCSubmitModal();
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
                    
                    // QC status badge
                    let qcBadge = '';
                    if (row.qc_required === true) {
                        const qcStatusMap = {
                            'pending': { class: 'status-yellow', label: 'KK Bekleniyor', icon: 'fas fa-clock' },
                            'waiting': { class: 'status-blue', label: 'KK Bekleniyor', icon: 'fas fa-hourglass-half' },
                            'approved': { class: 'status-green', label: 'KK Onaylandı', icon: 'fas fa-check-circle' },
                            'rejected': { class: 'status-red', label: 'KK Reddedildi', icon: 'fas fa-times-circle' }
                        };
                        const qcStatus = qcStatusMap[row.qc_status] || { class: 'status-grey', label: 'KK', icon: 'fas fa-clipboard-check' };
                        qcBadge = `<span class="status-badge ${qcStatus.class} ms-1"><i class="${qcStatus.icon} me-1"></i>${qcStatus.label}</span>`;
                    }
                    
                    return `<div class="d-flex align-items-center flex-wrap">${statusBadge}${revisionBadge}${qcBadge}</div>`;
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
                icon: 'fas fa-cog',
                class: 'btn-outline-primary',
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
                    // Also check QC approval: if qc_required=true, must have has_qc_approval=true (qc_status='approved')
                    if (row.status !== 'in_progress' || row.type === 'machining_part' || row.type === 'cnc_part') {
                        return false;
                    }
                    // Block completion if QC required but not approved
                    if (row.qc_required === true && row.has_qc_approval !== true) {
                        return false;
                    }
                    return true;
                }
            },
            {
                key: 'self-start-revision',
                label: 'Revizyonu Başlat',
                icon: 'fas fa-rotate',
                class: 'btn-outline-warning',
                onClick: (row) => handleSelfStartRevisionFromTable(row),
                visible: (row) => {
                    // Only for design department tasks
                    if (department !== 'design') return false;
                    // Must have a current release ID
                    if (!row.current_release_id) return false;
                    // Must not be under revision
                    if (row.is_under_revision) return false;
                    // Exclude certain task types
                    if (row.type === 'machining_part' || row.type === 'cnc_part' || row.task_type === 'procurement_item') return false;
                    return true;
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
        title: 'Görev İşlemleri',
        icon: 'fas fa-tasks',
        size: 'xl',
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

    // Bulk subtask modal (only if container exists)
    const bulkSubtaskContainer = document.getElementById('bulk-subtask-modal-container');
    if (bulkSubtaskContainer) {
        bulkSubtaskModal = new EditModal('bulk-subtask-modal-container', {
            title: 'Toplu Alt Görev Ekle',
            icon: 'fas fa-layer-group',
            size: 'xl',
            showEditButton: false,
            saveButtonText: 'Oluştur'
        });
    }
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

function initializeQCSubmitModal() {
    // QC submit modal
    submitQCModal = new EditModal('submit-qc-modal-container', {
        title: 'Kalite Kontrole Gönder',
        icon: 'fas fa-clipboard-check',
        size: 'lg',
        showEditButton: false,
        saveButtonText: 'Gönder'
    });

    submitQCModal.onSaveCallback(async (formData) => {
        const taskId = window.pendingQCTaskId;
        if (!taskId) return;

        try {
            // Build part_data object from form fields
            const partData = {};
            
            if (formData.location) {
                partData.location = formData.location.trim();
            }
            if (formData.quantity_inspected) {
                partData.quantity_inspected = parseInt(formData.quantity_inspected);
            }
            if (formData.position_no) {
                partData.position_no = formData.position_no.trim();
            }
            if (formData.drawing_no) {
                partData.drawing_no = formData.drawing_no.trim();
            }
            if (formData.notes) {
                partData.notes = formData.notes.trim();
            }

            // Add any other custom fields that might be in the form
            Object.keys(formData).forEach(key => {
                if (!['location', 'quantity_inspected', 'position_no', 'drawing_no', 'notes'].includes(key) && formData[key]) {
                    partData[key] = formData[key];
                }
            });

            await submitQCReview(taskId, partData);
            showNotification('Görev kalite kontrole gönderildi', 'success');
            submitQCModal.hide();
            window.pendingQCTaskId = null;
        } catch (error) {
            console.error('Error submitting QC review:', error);
            let errorMessage = 'Kalite kontrole gönderilirken hata oluştu';
            try {
                if (error.message) {
                    errorMessage = error.message;
                }
            } catch (e) {
                // If parsing fails, use default message
            }
            showNotification(errorMessage, 'error');
        }
    });
}

async function showSubmitQCModal(taskId, taskRow = null) {
    try {
        if (!submitQCModal) {
            showNotification('QC gönderme modalı başlatılamadı', 'error');
            return;
        }

        const task = taskRow || await getDepartmentTaskById(taskId);

        if (!task.qc_required) {
            showNotification('Bu görev kalite kontrol gerektirmiyor', 'error');
            return;
        }

        // Allow submitting even if already approved - can send multiple reviews
        window.pendingQCTaskId = taskId;

        submitQCModal.clearAll();

        submitQCModal.addSection({
            title: 'Parça Bilgileri',
            icon: 'fas fa-cog'
        });

        submitQCModal.addField({
            id: 'qc-job-order',
            name: 'job_order',
            label: 'İş Emri',
            type: 'text',
            value: task.job_order ? `${task.job_order} - ${task.job_order_title || ''}` : '-',
            readonly: true,
            icon: 'fas fa-file-invoice',
            colSize: 12,
            section: 0
        });

        submitQCModal.addField({
            id: 'qc-task-title',
            name: 'task_title',
            label: 'Görev',
            type: 'text',
            value: task.title || '-',
            readonly: true,
            icon: 'fas fa-tasks',
            colSize: 12,
            section: 0
        });

        submitQCModal.addField({
            id: 'qc-location',
            name: 'location',
            label: 'Konum',
            type: 'text',
            placeholder: 'Örn: Atölye B, Raf 3',
            icon: 'fas fa-map-marker-alt',
            colSize: 6,
            section: 0
        });

        submitQCModal.addField({
            id: 'qc-quantity',
            name: 'quantity_inspected',
            label: 'İncelenen Miktar',
            type: 'number',
            placeholder: '0',
            icon: 'fas fa-hashtag',
            colSize: 6,
            section: 0
        });

        submitQCModal.addField({
            id: 'qc-position',
            name: 'position_no',
            label: 'Pozisyon No',
            type: 'text',
            placeholder: 'Örn: POS-07',
            icon: 'fas fa-tag',
            colSize: 6,
            section: 0
        });

        submitQCModal.addField({
            id: 'qc-drawing',
            name: 'drawing_no',
            label: 'Çizim No',
            type: 'text',
            placeholder: 'Örn: GEM-254-01-A',
            icon: 'fas fa-drafting-compass',
            colSize: 6,
            section: 0
        });

        submitQCModal.addField({
            id: 'qc-notes',
            name: 'notes',
            label: 'Notlar',
            type: 'textarea',
            placeholder: 'İlk parti, ölçümler ekte',
            icon: 'fas fa-sticky-note',
            colSize: 12,
            section: 0
        });

        submitQCModal.render();
        submitQCModal.show();
    } catch (error) {
        console.error('Error showing QC submit modal:', error);
        showNotification('Modal açılırken hata oluştu', 'error');
    }
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
        
        // Determine available actions based on task type and status
        const availableActions = getAvailableActions(task);
        
        if (availableActions.length === 0) {
            showNotification('Bu görev için kullanılabilir işlem bulunmamaktadır', 'info');
            return;
        }

        // Create custom modal with vertical tabs
        taskDetailsModal.clearData();
        
        // Create custom HTML for vertical tab interface
        const modalHtml = `
            <div class="task-actions-modal">
                <div class="row g-0 h-100">
                    <!-- Vertical Tabs -->
                    <div class="col-md-3 border-end bg-light" style="min-height: 400px;">
                        <div class="nav flex-column nav-pills p-3" id="task-actions-tabs" role="tablist">
                            ${availableActions.map((action, index) => `
                                <button class="nav-link ${index === 0 ? 'active' : ''} mb-2 text-start" 
                                        id="tab-${action.key}-nav" 
                                        data-bs-toggle="tab" 
                                        data-bs-target="#tab-${action.key}-pane" 
                                        type="button" 
                                        role="tab"
                                        aria-controls="tab-${action.key}-pane"
                                        aria-selected="${index === 0 ? 'true' : 'false'}"
                                        style="${index === 0 ? 'color: #0d6efd !important; background-color: #e7f1ff !important; border: 2px solid #0d6efd !important;' : 'color: #212529 !important; background-color: #ffffff !important;'}">
                                    <i class="${action.icon} me-2" style="color: ${index === 0 ? '#0d6efd' : '#212529'} !important;"></i><span style="color: ${index === 0 ? '#0d6efd' : '#212529'} !important;">${action.label}</span>
                                </button>
                            `).join('')}
                        </div>
                    </div>
                    <!-- Tab Content -->
                    <div class="col-md-9">
                        <div class="tab-content p-4" id="task-actions-tab-content">
                            ${availableActions.map((action, index) => `
                                <div class="tab-pane fade ${index === 0 ? 'show active' : ''}" 
                                     id="tab-${action.key}-pane" 
                                     role="tabpanel"
                                     aria-labelledby="tab-${action.key}-nav">
                                    <div id="action-content-${action.key}">
                                        <!-- Content will be loaded here -->
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>
        `;

        taskDetailsModal.addCustomContent(modalHtml);
        taskDetailsModal.render();
        
        // Load content for each action tab
        availableActions.forEach((action, index) => {
            if (index === 0) {
                // Load first tab immediately
                loadActionContent(task, action);
            } else {
                // Load other tabs on click
                const tabNav = taskDetailsModal.container.querySelector(`#tab-${action.key}-nav`);
                if (tabNav) {
                    tabNav.addEventListener('shown.bs.tab', () => {
                        loadActionContent(task, action);
                    });
                }
            }
        });
        
        // Setup tab click handlers to update colors
        setTimeout(() => {
            const tabButtons = taskDetailsModal.container.querySelectorAll('#task-actions-tabs .nav-link');
            tabButtons.forEach(btn => {
                btn.addEventListener('click', function() {
                    // Update all tabs
                    tabButtons.forEach(tab => {
                        if (tab === this) {
                            // Active tab
                            tab.style.color = '#0d6efd';
                            tab.style.backgroundColor = '#e7f1ff';
                            tab.style.border = '2px solid #0d6efd';
                            const icon = tab.querySelector('i');
                            const span = tab.querySelector('span');
                            if (icon) icon.style.color = '#0d6efd';
                            if (span) span.style.color = '#0d6efd';
                        } else {
                            // Non-active tabs
                            tab.style.color = '#212529';
                            tab.style.backgroundColor = '#ffffff';
                            tab.style.border = '1px solid #dee2e6';
                            const icon = tab.querySelector('i');
                            const span = tab.querySelector('span');
                            if (icon) icon.style.color = '#212529';
                            if (span) span.style.color = '#212529';
                        }
                    });
                });
                
                // Also listen to Bootstrap tab events
                btn.addEventListener('shown.bs.tab', function() {
                    tabButtons.forEach(tab => {
                        if (tab.classList.contains('active')) {
                            tab.style.color = '#0d6efd';
                            tab.style.backgroundColor = '#e7f1ff';
                            tab.style.border = '2px solid #0d6efd';
                            const icon = tab.querySelector('i');
                            const span = tab.querySelector('span');
                            if (icon) icon.style.color = '#0d6efd';
                            if (span) span.style.color = '#0d6efd';
                        } else {
                            tab.style.color = '#212529';
                            tab.style.backgroundColor = '#ffffff';
                            tab.style.border = '1px solid #dee2e6';
                            const icon = tab.querySelector('i');
                            const span = tab.querySelector('span');
                            if (icon) icon.style.color = '#212529';
                            if (span) span.style.color = '#212529';
                        }
                    });
                });
            });
        }, 100);
        
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

// Get available actions for a task based on type and status
function getAvailableActions(task) {
    const actions = [];
    
    // Edit action - available for most tasks
    if (task.type !== 'machining_part' && task.type !== 'cnc_part' && task.task_type !== 'procurement_item') {
        actions.push({
            key: 'edit',
            label: 'Düzenle',
            icon: 'fas fa-edit',
            handler: 'edit'
        });
    }
    
    // Start action
    if (task.status === 'pending' && task.can_start && task.type !== 'machining_part' && task.type !== 'cnc_part' && task.task_type !== 'procurement_item') {
        actions.push({
            key: 'start',
            label: 'Başlat',
            icon: 'fas fa-play',
            handler: 'start'
        });
    }
    
    // Submit QC action - allow even if already approved
    if (department === 'manufacturing' && task.qc_required === true) {
        actions.push({
            key: 'submit-qc',
            label: 'KK\'ya Gönder',
            icon: 'fas fa-clipboard-check',
            handler: 'submit-qc'
        });
    }
    
    // QC Reviews tab - show whenever task has qc_required, regardless of department
    if (task.qc_required === true) {
        actions.push({
            key: 'qc-reviews',
            label: 'KK İncelemeleri',
            icon: 'fas fa-clipboard-list',
            handler: 'qc-reviews'
        });
    }
    
    // NCRs tab - show for all tasks (NCRs can be created for any task)
    actions.push({
        key: 'ncrs',
        label: 'Uygunsuzluk Raporları',
        icon: 'fas fa-exclamation-triangle',
        handler: 'ncrs'
    });
    
    // Uncomplete action
    if (task.status === 'completed' && task.type !== 'machining_part' && task.type !== 'cnc_part' && task.task_type !== 'procurement_item') {
        actions.push({
            key: 'uncomplete',
            label: 'Tamamlanmayı Geri Al',
            icon: 'fas fa-undo',
            handler: 'uncomplete'
        });
    }
    
    // Unskip action
    if (task.status === 'skipped' && task.type !== 'machining_part' && task.type !== 'cnc_part' && task.task_type !== 'procurement_item') {
        actions.push({
            key: 'unskip',
            label: 'Atlamayı Geri Al',
            icon: 'fas fa-undo',
            handler: 'unskip'
        });
    }
    
    // Add subtask action - only for design department
    if (department === 'design' && task.type !== 'machining_part' && task.type !== 'cnc_part' && task.task_type !== 'procurement_item') {
        actions.push({
            key: 'add-subtask',
            label: 'Alt Görev Ekle',
            icon: 'fas fa-plus-circle',
            handler: 'add-subtask'
        });
    }
    
    // Bulk subtask action
    if (task.task_type !== null && task.task_type !== undefined && task.type !== 'machining_part' && task.type !== 'cnc_part' && task.task_type !== 'procurement_item') {
        actions.push({
            key: 'bulk-subtask',
            label: 'Toplu Alt Görev Ekle',
            icon: 'fas fa-layer-group',
            handler: 'bulk-subtask'
        });
    }
    
    // Assign subcontractor action
    if (department === 'manufacturing' && task.task_type === 'welding') {
        actions.push({
            key: 'assign-subcontractor',
            label: 'Taşeron Ata',
            icon: 'fas fa-handshake',
            handler: 'assign-subcontractor'
        });
        
        // Subcontractor tab - show right after "Taşeron Ata" tab
        actions.push({
            key: 'subcontractor',
            label: 'Taşeron Ataması',
            icon: 'fas fa-handshake',
            handler: 'subcontractor'
        });
    }
    
    // Set paint price action
    if (task.task_type === 'painting') {
        actions.push({
            key: 'set-paint-price',
            label: 'Boya Fiyatı Belirle',
            icon: 'fas fa-paint-brush',
            handler: 'set-paint-price'
        });
        
        // Subcontractor tab - show right after "Boya Fiyatı Belirle" tab
        actions.push({
            key: 'subcontractor',
            label: 'Taşeron Ataması',
            icon: 'fas fa-handshake',
            handler: 'subcontractor'
        });
    }
    
    // Self-start revision action - only for design department tasks with a current release that is not under revision
    if (department === 'design' && task.current_release_id && !task.is_under_revision && task.type !== 'machining_part' && task.type !== 'cnc_part' && task.task_type !== 'procurement_item') {
        actions.push({
            key: 'self-start-revision',
            label: 'Revizyonu Kendi Başlat',
            icon: 'fas fa-rotate',
            handler: 'self-start-revision'
        });
    }
    
    return actions;
}

// Load content for a specific action
async function loadActionContent(task, action) {
    const contentContainer = taskDetailsModal.container.querySelector(`#action-content-${action.key}`);
    if (!contentContainer || contentContainer.dataset.loaded === 'true') {
        return; // Already loaded
    }
    
    contentContainer.innerHTML = '<div class="text-center py-4"><div class="spinner-border" role="status"></div></div>';
    
    try {
        let content = '';
        
        switch (action.handler) {
            case 'edit':
                content = await renderEditActionForm(task);
                break;
            case 'start':
                content = await renderStartActionForm(task);
                break;
            case 'complete':
                content = await renderCompleteActionForm(task);
                break;
            case 'submit-qc':
                content = await renderSubmitQCActionForm(task);
                break;
            case 'uncomplete':
                content = await renderUncompleteActionForm(task);
                break;
            case 'skip':
                content = await renderSkipActionForm(task);
                break;
            case 'unskip':
                content = await renderUnskipActionForm(task);
                break;
            case 'add-subtask':
                content = await renderAddSubtaskActionForm(task);
                break;
            case 'bulk-subtask':
                content = await renderBulkSubtaskActionForm(task);
                break;
            case 'assign-subcontractor':
                content = await renderAssignSubcontractorActionForm(task);
                break;
            case 'set-paint-price':
                content = await renderSetPaintPriceActionForm(task);
                break;
            case 'qc-reviews':
                content = await renderQCReviewsTab(task);
                break;
            case 'subcontractor':
                content = await renderSubcontractorTab(task);
                break;
            case 'ncrs':
                content = await renderNCRsTab(task);
                break;
            case 'self-start-revision':
                content = await renderSelfStartRevisionActionForm(task);
                break;
            default:
                content = '<p>İşlem formu yüklenemedi</p>';
        }
        
        contentContainer.innerHTML = content;
        contentContainer.dataset.loaded = 'true';
        
        // Setup bulk subtask builder if needed
        if (action.handler === 'bulk-subtask') {
            setupBulkSubtaskBuilderInline(task, contentContainer);
        }
        
        // Setup QC reviews builder if needed
        if (action.handler === 'submit-qc') {
            setupQCReviewsBuilderInline(task, contentContainer);
        }
        
        // Attach event listeners for form submission
        attachActionFormListeners(task, action);
    } catch (error) {
        console.error(`Error loading ${action.key} content:`, error);
        contentContainer.innerHTML = '<p class="text-danger">İçerik yüklenirken hata oluştu</p>';
    }
}

// Render form for edit action
async function renderEditActionForm(task) {
    // This will reuse the existing edit modal form structure
    // We'll create a simplified inline form
    const userOptions = [
        { value: '', label: 'Atanmamış' },
        ...users.map(u => ({ value: u.id.toString(), label: u.name || u.username }))
    ];
    
    const isSubtask = !!task.parent;
    
    return `
        <h5 class="mb-4"><i class="fas fa-edit me-2"></i>Görevi Düzenle</h5>
        <form id="edit-action-form">
            <div class="row g-3">
                <div class="col-md-12">
                    <label class="form-label">Başlık ${isSubtask ? '' : '<span class="text-muted">(Değiştirilemez)</span>'}</label>
                    <input type="text" class="form-control" id="edit-title" value="${task.title || ''}" ${!isSubtask ? 'readonly' : ''}>
                    ${isSubtask ? '<small class="form-text text-muted">Alt görev başlığı düzenlenebilir</small>' : ''}
                </div>
                <div class="col-md-12">
                    <label class="form-label">Açıklama</label>
                    <textarea class="form-control" id="edit-description" rows="3">${task.description || ''}</textarea>
                </div>
                <div class="col-md-6">
                    <label class="form-label">Atanan Kişi</label>
                    <select class="form-select" id="edit-assigned-to">
                        ${userOptions.map(opt => `<option value="${opt.value}" ${task.assigned_to && task.assigned_to.toString() === opt.value ? 'selected' : ''}>${opt.label}</option>`).join('')}
                    </select>
                </div>
                <div class="col-md-6">
                    <label class="form-label">Hedef Bitiş Tarihi</label>
                    <input type="date" class="form-control" id="edit-target-completion-date" value="${task.target_completion_date ? task.target_completion_date.split('T')[0] : ''}">
                </div>
                <div class="col-md-12">
                    <label class="form-label">Notlar</label>
                    <textarea class="form-control" id="edit-notes" rows="2">${task.notes || ''}</textarea>
                </div>
                <div class="col-md-12">
                    <button type="submit" class="btn btn-primary">
                        <i class="fas fa-save me-1"></i>Kaydet
                    </button>
                </div>
            </div>
        </form>
    `;
}

// Render form for start action
async function renderStartActionForm(task) {
    return `
        <h5 class="mb-4"><i class="fas fa-play me-2"></i>Görevi Başlat</h5>
        <div class="alert alert-info">
            <i class="fas fa-info-circle me-2"></i>
            Bu görevi başlatmak istediğinize emin misiniz?
        </div>
        <form id="start-action-form">
            <button type="submit" class="btn btn-success">
                <i class="fas fa-play me-1"></i>Görevi Başlat
            </button>
        </form>
    `;
}

// Render form for complete action
async function renderCompleteActionForm(task) {
    if (task.task_type === 'procurement_item') {
        return `
            <h5 class="mb-4"><i class="fas fa-check me-2"></i>Planlama Talebi Kalemini Teslim Edildi Olarak İşaretle</h5>
            <div class="alert alert-info">
                <i class="fas fa-info-circle me-2"></i>
                Bu planlama talebi kalemini teslim edildi olarak işaretlemek istediğinize emin misiniz?
            </div>
            <form id="complete-action-form">
                <button type="submit" class="btn btn-success">
                    <i class="fas fa-check me-1"></i>Teslim Edildi Olarak İşaretle
                </button>
            </form>
        `;
    }
    return `
        <h5 class="mb-4"><i class="fas fa-check me-2"></i>Görevi Tamamla</h5>
        <div class="alert alert-info">
            <i class="fas fa-info-circle me-2"></i>
            Bu görevi tamamlamak istediğinize emin misiniz?
        </div>
        <form id="complete-action-form">
            <button type="submit" class="btn btn-success">
                <i class="fas fa-check me-1"></i>Görevi Tamamla
            </button>
        </form>
    `;
}

// Render form for submit QC action
async function renderSubmitQCActionForm(task) {
    const reviewsContainerId = `qc-reviews-container-${task.id}`;
    
    return `
        <h5 class="mb-4"><i class="fas fa-clipboard-check me-2"></i>Kalite Kontrolüne Gönder</h5>
        <form id="submit-qc-action-form">
            <div class="row g-3 mb-3">
                <div class="col-md-6">
                    <label class="form-label">
                        <i class="fas fa-file-invoice me-1"></i>İş Emri
                    </label>
                    <input type="text" class="form-control" value="${task.job_order ? `${task.job_order} - ${task.job_order_title || ''}` : '-'}" readonly>
                </div>
                <div class="col-md-6">
                    <label class="form-label">
                        <i class="fas fa-tasks me-1"></i>Görev
                    </label>
                    <input type="text" class="form-control" value="${task.title || '-'}" readonly>
                </div>
            </div>
            <div class="mb-4">
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <h6 class="mb-0"><i class="fas fa-clipboard-list me-2"></i>İnceleme Bilgileri</h6>
                    <div class="d-flex gap-2">
                        <button type="button" class="btn btn-sm btn-outline-success" id="excel-import-qc-btn-${task.id}">
                            <i class="fas fa-file-excel me-1"></i>Excel'den İçe Aktar
                        </button>
                        <button type="button" class="btn btn-sm btn-outline-primary" id="add-qc-review-btn-${task.id}">
                            <i class="fas fa-plus me-1"></i>İnceleme Ekle
                        </button>
                    </div>
                </div>
                <div class="row g-2 mb-2">
                    <div class="col-md-2">
                        <small class="text-muted fw-bold">
                            <i class="fas fa-map-marker-alt me-1"></i>Konum
                        </small>
                    </div>
                    <div class="col-md-2">
                        <small class="text-muted fw-bold">
                            <i class="fas fa-hashtag me-1"></i>İncelenen Miktar
                        </small>
                    </div>
                    <div class="col-md-3">
                        <small class="text-muted fw-bold">
                            <i class="fas fa-drafting-compass me-1"></i>Çizim No
                        </small>
                    </div>
                    <div class="col-md-2">
                        <small class="text-muted fw-bold">
                            <i class="fas fa-tag me-1"></i>Pozisyon No
                        </small>
                    </div>
                    <div class="col-md-2">
                        <small class="text-muted fw-bold">
                            <i class="fas fa-sticky-note me-1"></i>Notlar
                        </small>
                    </div>
                    <div class="col-md-1">
                        <small class="text-muted fw-bold">İşlem</small>
                    </div>
                </div>
                <div id="${reviewsContainerId}" class="qc-reviews-container" style="max-height: 400px; overflow-y: auto;">
                    <!-- Reviews will be added here -->
                </div>
            </div>
            <div class="mt-3">
                <button type="submit" class="btn btn-warning">
                    <i class="fas fa-clipboard-check me-1"></i>KK'ya Gönder
                </button>
            </div>
        </form>
    `;
}

// Render form for uncomplete action
async function renderUncompleteActionForm(task) {
    return `
        <h5 class="mb-4"><i class="fas fa-undo me-2"></i>Tamamlanmayı Geri Al</h5>
        <div class="alert alert-warning">
            <i class="fas fa-exclamation-triangle me-2"></i>
            Bu görevin tamamlanmasını geri almak istediğinize emin misiniz?
        </div>
        <form id="uncomplete-action-form">
            <button type="submit" class="btn btn-warning">
                <i class="fas fa-undo me-1"></i>Tamamlanmayı Geri Al
            </button>
        </form>
    `;
}

// Render form for skip action
async function renderSkipActionForm(task) {
    return `
        <h5 class="mb-4"><i class="fas fa-forward me-2"></i>Görevi Atla</h5>
        <div class="alert alert-warning">
            <i class="fas fa-exclamation-triangle me-2"></i>
            Bu görevi atlamak istediğinize emin misiniz?
        </div>
        <form id="skip-action-form">
            <button type="submit" class="btn btn-secondary">
                <i class="fas fa-forward me-1"></i>Görevi Atla
            </button>
        </form>
    `;
}

// Render form for unskip action
async function renderUnskipActionForm(task) {
    return `
        <h5 class="mb-4"><i class="fas fa-undo me-2"></i>Atlamayı Geri Al</h5>
        <div class="alert alert-info">
            <i class="fas fa-info-circle me-2"></i>
            Bu görevin atlanmasını geri almak istediğinize emin misiniz?
        </div>
        <form id="unskip-action-form">
            <button type="submit" class="btn btn-warning">
                <i class="fas fa-undo me-1"></i>Atlamayı Geri Al
            </button>
        </form>
    `;
}

// Render form for self-start revision action
async function renderSelfStartRevisionActionForm(task) {
    return `
        <h5 class="mb-4"><i class="fas fa-rotate me-2"></i>Revizyonu Kendi Başlat</h5>
        <div class="alert alert-info">
            <i class="fas fa-info-circle me-2"></i>
            Bu yayın için revizyonu dış talep olmadan kendi başınıza başlatmak istediğinize emin misiniz?
        </div>
        <div class="mb-3">
            <label class="form-label">
                <i class="fas fa-file-invoice me-1"></i>İş Emri
            </label>
            <input type="text" class="form-control" value="${task.job_order ? `${task.job_order} - ${task.job_order_title || ''}` : '-'}" readonly>
        </div>
        <div class="mb-3">
            <label class="form-label">
                <i class="fas fa-tasks me-1"></i>Görev
            </label>
            <input type="text" class="form-control" value="${task.title || '-'}" readonly>
        </div>
        <div class="mb-3">
            <label class="form-label">
                <i class="fas fa-comment me-1"></i>Revizyon Nedeni <span class="text-danger">*</span>
            </label>
            <textarea 
                class="form-control" 
                id="self-revision-reason" 
                name="reason"
                rows="3" 
                placeholder="Revizyon nedenini açıklayın..."
                required></textarea>
            <small class="form-text text-muted">Revizyon nedenini belirtmek zorunludur.</small>
        </div>
        <form id="self-start-revision-action-form">
            <button type="submit" class="btn btn-primary">
                <i class="fas fa-rotate me-1"></i>Revizyonu Başlat
            </button>
        </form>
    `;
}

// Render form for add subtask action
async function renderAddSubtaskActionForm(task) {
    try {
        // Get parent task to determine next sequence number
        const parentTask = await getDepartmentTaskById(task.id);
        const nextSequence = (parentTask.subtasks_count || 0) + 1;
        
        return `
            <h5 class="mb-4"><i class="fas fa-plus-circle me-2"></i>Alt Görev Ekle</h5>
            <form id="add-subtask-action-form">
                <div class="row g-3">
                    <div class="col-md-12">
                        <label class="form-label">
                            <i class="fas fa-heading me-1"></i>Başlık
                        </label>
                        <input type="text" class="form-control" id="subtask-title" name="title" placeholder="Boş bırakılırsa iş emri adı kullanılır">
                        <small class="form-text text-muted">Alt görev başlığı (boş bırakılabilir)</small>
                    </div>
                    <div class="col-md-12">
                        <label class="form-label">
                            <i class="fas fa-align-left me-1"></i>Açıklama
                        </label>
                        <textarea class="form-control" id="subtask-description" name="description" rows="3" placeholder="Alt görev açıklaması"></textarea>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label">
                            <i class="fas fa-sort-numeric-up me-1"></i>Sıra
                        </label>
                        <input type="number" class="form-control" id="subtask-sequence" name="sequence" value="${nextSequence}" min="1">
                        <small class="form-text text-muted">Alt görev sırası</small>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label">
                            <i class="fas fa-weight me-1"></i>Ağırlık
                        </label>
                        <input type="number" class="form-control" id="subtask-weight" name="weight" min="0" step="0.01">
                        <small class="form-text text-muted">Alt görev ağırlığı</small>
                    </div>
                    <div class="col-md-12">
                        <button type="submit" class="btn btn-primary">
                            <i class="fas fa-save me-1"></i>Alt Görev Ekle
                        </button>
                    </div>
                </div>
            </form>
        `;
    } catch (error) {
        console.error('Error loading parent task for add subtask form:', error);
        return '<p class="text-danger">Form yüklenirken hata oluştu</p>';
    }
}

// Render form for bulk subtask action
async function renderBulkSubtaskActionForm(task) {
    try {
        // Get parent task to determine next sequence number
        const parentTask = await getDepartmentTaskById(task.id);
        const nextSequence = (parentTask.subtasks_count || 0) + 1;
        
        const tasksContainerId = `bulk-subtasks-container-${task.id}`;
        
        return `
            <h5 class="mb-4"><i class="fas fa-layer-group me-2"></i>Toplu Alt Görev Ekle</h5>
            <form id="bulk-subtask-action-form">
                <div class="mb-3">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <label class="form-label mb-0"><i class="fas fa-tasks me-1"></i>Alt Görevler</label>
                        <button type="button" class="btn btn-sm btn-outline-primary" id="add-bulk-task-btn-${task.id}">
                            <i class="fas fa-plus me-1"></i>Görev Ekle
                        </button>
                    </div>
                    <div id="${tasksContainerId}" class="bulk-subtasks-container" style="max-height: 400px; overflow-y: auto;">
                        <!-- Tasks will be added here -->
                    </div>
                </div>
                <div class="mt-3">
                    <button type="submit" class="btn btn-success">
                        <i class="fas fa-save me-1"></i>Alt Görevleri Oluştur
                    </button>
                </div>
            </form>
        `;
    } catch (error) {
        console.error('Error loading parent task for bulk subtask form:', error);
        return '<p class="text-danger">Form yüklenirken hata oluştu</p>';
    }
}

// Render form for assign subcontractor action
async function renderAssignSubcontractorActionForm(task) {
    if (task.task_type !== 'welding') {
        return '<p class="text-warning">Bu işlem sadece Kaynaklı İmalat görevleri için kullanılabilir</p>';
    }
    
    try {
        // Fetch subcontractors and price tiers
        const [subcontractorsResponse, tiersResponse] = await Promise.all([
            fetchSubcontractors({ is_active: true }),
            fetchPriceTiers({ job_order: task.job_order })
        ]);
        
        const subcontractors = subcontractorsResponse.results || subcontractorsResponse || [];
        const tiers = tiersResponse.results || tiersResponse || [];
        
        const subcontractorOptions = [
            { value: '', label: 'Taşeron seçin...' },
            ...subcontractors.map(s => ({ value: s.id.toString(), label: s.name || s.short_name }))
        ];
        
        const tierOptions = [
            { value: '', label: 'Kademe seçin...' },
            ...tiers.map(t => ({ 
                value: t.id.toString(), 
                label: `${t.name} (${t.price_per_kg} ${t.currency}/kg, Kalan: ${t.remaining_weight_kg || 0} kg)` 
            }))
        ];
        
        return `
            <h5 class="mb-4"><i class="fas fa-handshake me-2"></i>Taşeron Ata ve Alt Görev Oluştur</h5>
            <form id="assign-subcontractor-action-form">
                <div class="mb-4">
                    <h6 class="text-primary"><i class="fas fa-info-circle me-2"></i>Atama Bilgileri</h6>
                </div>
                <div class="row g-3">
                    <div class="col-md-12">
                        <label class="form-label">
                            <i class="fas fa-building me-1"></i>Taşeron <span class="text-danger">*</span>
                        </label>
                        <select class="form-select" id="assignment-subtask-subcontractor" name="subcontractor" required>
                            ${subcontractorOptions.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('')}
                        </select>
                    </div>
                    <div class="col-md-12">
                        <label class="form-label">
                            <i class="fas fa-list me-1"></i>Fiyat Kademesi <span class="text-danger">*</span>
                        </label>
                        <select class="form-select" id="assignment-subtask-price-tier" name="price_tier" required>
                            ${tierOptions.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('')}
                        </select>
                    </div>
                    <div class="col-md-12">
                        <label class="form-label">
                            <i class="fas fa-weight me-1"></i>Ayrılan Ağırlık (kg) <span class="text-danger">*</span>
                        </label>
                        <input type="number" class="form-control" id="assignment-subtask-weight" name="allocated_weight_kg" step="0.01" min="0" required>
                        <small class="form-text text-muted">Maksimum ağırlık seçilen kademenin kalan ağırlığına göre belirlenecektir</small>
                    </div>
                </div>
                <div class="mb-4 mt-4">
                    <h6 class="text-info"><i class="fas fa-tasks me-2"></i>Alt Görev Bilgileri (Opsiyonel)</h6>
                </div>
                <div class="row g-3">
                    <div class="col-md-12">
                        <label class="form-label">
                            <i class="fas fa-heading me-1"></i>Alt Görev Başlığı
                        </label>
                        <input type="text" class="form-control" id="assignment-subtask-title" name="title" placeholder="Boş bırakılırsa taşeron adı kullanılacaktır">
                    </div>
                </div>
                <div class="col-md-12 mt-3">
                    <button type="submit" class="btn btn-primary">
                        <i class="fas fa-save me-1"></i>Taşeron Ata ve Alt Görev Oluştur
                    </button>
                </div>
            </form>
        `;
    } catch (error) {
        console.error('Error loading subcontractor form data:', error);
        return '<p class="text-danger">Form yüklenirken hata oluştu</p>';
    }
}

// Render form for set paint price action
async function renderSetPaintPriceActionForm(task) {
    if (task.task_type !== 'painting') {
        return '<p class="text-warning">Bu işlem sadece Boya görevleri için kullanılabilir</p>';
    }
    
    if (!task.job_order) {
        return '<p class="text-danger">İş emri bulunamadı</p>';
    }
    
    try {
        // Fetch price tiers for this job order
        const tiersResponse = await fetchPriceTiers({ job_order: task.job_order });
        const tiers = tiersResponse.results || tiersResponse || [];
        
        // Find the painting tier
        const paintingTier = tiers.find(t => {
            const tierName = (t.name || '').toLowerCase();
            return tierName.includes('boya') || tierName.includes('painting');
        });
        
        if (!paintingTier) {
            return '<p class="text-danger">Boya fiyat kademesi bulunamadı</p>';
        }
        
        return `
            <h5 class="mb-4"><i class="fas fa-paint-brush me-2"></i>Boya Fiyatı Belirle</h5>
            <form id="set-paint-price-action-form">
                <div class="row g-3">
                    <div class="col-md-12">
                        <label class="form-label">
                            <i class="fas fa-money-bill-wave me-1"></i>Fiyat/kg <span class="text-danger">*</span>
                        </label>
                        <input type="number" class="form-control" id="paint-price" name="price_per_kg" value="${paintingTier.price_per_kg || ''}" step="0.01" min="0" required>
                        <small class="form-text text-muted">Mevcut fiyat: ${paintingTier.price_per_kg || '0'} ${paintingTier.currency || 'TRY'}/kg</small>
                    </div>
                    <div class="col-md-12">
                        <button type="submit" class="btn btn-info">
                            <i class="fas fa-save me-1"></i>Fiyatı Güncelle
                        </button>
                    </div>
                </div>
            </form>
        `;
    } catch (error) {
        console.error('Error loading paint price form data:', error);
        return '<p class="text-danger">Form yüklenirken hata oluştu</p>';
    }
}

// Render QC Reviews tab
async function renderQCReviewsTab(task) {
    try {
        // Fetch QC reviews for this task
        const reviewsResponse = await listQCReviews({ task: task.id }, '', '-submitted_at', 1, 100);
        const reviews = reviewsResponse.results || [];
        
        if (reviews.length === 0) {
            return `
                <h5 class="mb-4"><i class="fas fa-clipboard-check me-2"></i>KK İncelemeleri</h5>
                <div class="alert alert-info">
                    <i class="fas fa-info-circle me-2"></i>
                    Bu görev için henüz kalite kontrol incelemesi bulunmamaktadır.
                </div>
            `;
        }
        
        // Status badge mapping
        const statusBadgeMap = {
            'pending': '<span class="badge bg-warning">Beklemede</span>',
            'approved': '<span class="badge bg-success">Onaylandı</span>',
            'rejected': '<span class="badge bg-danger">Reddedildi</span>'
        };
        
        const reviewsTable = reviews.map(review => {
            const submittedAt = review.submitted_at 
                ? new Date(review.submitted_at).toLocaleString('tr-TR')
                : '-';
            const reviewedAt = review.reviewed_at 
                ? new Date(review.reviewed_at).toLocaleString('tr-TR')
                : '-';
            const statusBadge = statusBadgeMap[review.status] || `<span class="badge bg-secondary">${review.status || '-'}</span>`;
            
            return `
                <tr>
                    <td>${review.id || '-'}</td>
                    <td>${review.part_data?.location || '-'}</td>
                    <td>${review.part_data?.quantity_inspected || '-'}</td>
                    <td>${review.part_data?.drawing_no || '-'}</td>
                    <td>${review.part_data?.position_no || '-'}</td>
                    <td>${statusBadge}</td>
                    <td>${review.submitted_by_name || '-'}</td>
                    <td>${submittedAt}</td>
                    <td>${review.reviewed_by_name || '-'}</td>
                    <td>${reviewedAt}</td>
                    <td>${review.comment || '-'}</td>
                </tr>
            `;
        }).join('');
        
        return `
            <h5 class="mb-4"><i class="fas fa-clipboard-check me-2"></i>KK İncelemeleri</h5>
            <div class="table-responsive">
                <table class="table table-sm table-bordered table-hover">
                    <thead class="table-light">
                        <tr>
                            <th>ID</th>
                            <th>Konum</th>
                            <th>İncelenen Miktar</th>
                            <th>Çizim No</th>
                            <th>Pozisyon No</th>
                            <th>Durum</th>
                            <th>Gönderen</th>
                            <th>Gönderilme Tarihi</th>
                            <th>İnceleyen</th>
                            <th>İnceleme Tarihi</th>
                            <th>Yorum</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${reviewsTable}
                    </tbody>
                </table>
            </div>
        `;
    } catch (error) {
        console.error('Error loading QC reviews:', error);
        return '<p class="text-danger">KK incelemeleri yüklenirken hata oluştu</p>';
    }
}

// Render Subcontractor tab
async function renderSubcontractorTab(task) {
    try {
        // Fetch assignments for this task
        const assignmentsResponse = await fetchAssignments({ department_task: task.id });
        const assignments = assignmentsResponse.results || assignmentsResponse || [];
        
        if (assignments.length === 0) {
            return `
                <h5 class="mb-4"><i class="fas fa-handshake me-2"></i>Taşeron Ataması</h5>
                <div class="alert alert-info">
                    <i class="fas fa-info-circle me-2"></i>
                    Bu görev için henüz taşeron ataması bulunmamaktadır.
                </div>
            `;
        }
        
        // Format currency
        const formatCurrency = (amount, currency = 'TRY') => {
            if (!amount) return '0';
            return new Intl.NumberFormat('tr-TR', {
                style: 'currency',
                currency: currency,
                minimumFractionDigits: 2
            }).format(amount);
        };
        
        const assignmentsTable = assignments.map(assignment => {
            const allocatedWeight = assignment.allocated_weight_kg || 0;
            const currentProgress = assignment.current_progress || 0;
            const pricePerKg = assignment.price_per_kg || 0;
            const currentCost = (allocatedWeight * currentProgress / 100 * pricePerKg) || 0;
            const unbilledProgress = assignment.unbilled_progress || 0;
            const unbilledWeight = assignment.unbilled_weight_kg || 0;
            const unbilledCost = assignment.unbilled_cost || 0;
            const lastBilledProgress = assignment.last_billed_progress || 0;
            
            return `
                <tr>
                    <td>${assignment.subcontractor_name || '-'}</td>
                    <td>${assignment.price_tier_name || '-'}</td>
                    <td>${formatCurrency(pricePerKg, assignment.cost_currency || 'TRY')}/kg</td>
                    <td>${allocatedWeight} kg</td>
                    <td>${currentProgress}%</td>
                    <td>${lastBilledProgress}%</td>
                    <td>${unbilledProgress}%</td>
                    <td>${unbilledWeight} kg</td>
                    <td>${formatCurrency(unbilledCost, assignment.cost_currency || 'TRY')}</td>
                    <td>${formatCurrency(currentCost, assignment.cost_currency || 'TRY')}</td>
                </tr>
            `;
        }).join('');
        
        return `
            <h5 class="mb-4"><i class="fas fa-handshake me-2"></i>Taşeron Ataması</h5>
            <div class="table-responsive">
                <table class="table table-sm table-bordered table-hover">
                    <thead class="table-light">
                        <tr>
                            <th>Taşeron</th>
                            <th>Fiyat Kademesi</th>
                            <th>Fiyat/kg</th>
                            <th>Ayrılan Ağırlık</th>
                            <th>Mevcut İlerleme</th>
                            <th>Faturalanmış İlerleme</th>
                            <th>Faturalanmamış İlerleme</th>
                            <th>Faturalanmamış Ağırlık</th>
                            <th>Faturalanmamış Maliyet</th>
                            <th>Toplam Maliyet</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${assignmentsTable}
                    </tbody>
                </table>
            </div>
        `;
    } catch (error) {
        console.error('Error loading subcontractor assignments:', error);
        return '<p class="text-danger">Taşeron atamaları yüklenirken hata oluştu</p>';
    }
}

// Render NCRs tab
async function renderNCRsTab(task) {
    try {
        // Fetch NCRs for this task
        const ncrsResponse = await listNCRs({ department_task: task.id }, '', '-created_at', 1, 100);
        const ncrs = ncrsResponse.results || [];
        
        if (ncrs.length === 0) {
            return `
                <h5 class="mb-4"><i class="fas fa-exclamation-triangle me-2"></i>Uygunsuzluk Raporları</h5>
                <div class="alert alert-info">
                    <i class="fas fa-info-circle me-2"></i>
                    Bu görev için henüz uygunsuzluk raporu bulunmamaktadır.
                </div>
            `;
        }
        
        // Status badge mapping
        const statusBadgeMap = {
            'draft': '<span class="badge bg-secondary">Taslak</span>',
            'submitted': '<span class="badge bg-warning">Gönderildi</span>',
            'approved': '<span class="badge bg-success">Onaylandı</span>',
            'rejected': '<span class="badge bg-danger">Reddedildi</span>',
            'closed': '<span class="badge bg-info">Kapatıldı</span>'
        };
        
        // Severity badge mapping
        const severityBadgeMap = {
            'minor': '<span class="badge bg-warning">Minör</span>',
            'major': '<span class="badge bg-orange">Majör</span>',
            'critical': '<span class="badge bg-danger">Kritik</span>'
        };
        
        const ncrsTable = ncrs.map(ncr => {
            const createdAt = ncr.created_at 
                ? new Date(ncr.created_at).toLocaleString('tr-TR')
                : '-';
            const statusBadge = statusBadgeMap[ncr.status] || `<span class="badge bg-secondary">${ncr.status_display || ncr.status || '-'}</span>`;
            const severityBadge = severityBadgeMap[ncr.severity] || `<span class="badge bg-secondary">${ncr.severity_display || ncr.severity || '-'}</span>`;
            
            return `
                <tr>
                    <td>${ncr.ncr_number || ncr.id || '-'}</td>
                    <td>${ncr.title || '-'}</td>
                    <td>${statusBadge}</td>
                    <td>${severityBadge}</td>
                    <td>${ncr.defect_type_display || ncr.defect_type || '-'}</td>
                    <td>${ncr.affected_quantity || '-'}</td>
                    <td>${ncr.assigned_team || '-'}</td>
                    <td>${createdAt}</td>
                </tr>
            `;
        }).join('');
        
        return `
            <h5 class="mb-4"><i class="fas fa-exclamation-triangle me-2"></i>Uygunsuzluk Raporları</h5>
            <div class="table-responsive">
                <table class="table table-sm table-bordered table-hover">
                    <thead class="table-light">
                        <tr>
                            <th>NCR No</th>
                            <th>Başlık</th>
                            <th>Durum</th>
                            <th>Önem Derecesi</th>
                            <th>Kusur Tipi</th>
                            <th>Etkilenen Miktar</th>
                            <th>Atanan Takım</th>
                            <th>Oluşturulma Tarihi</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${ncrsTable}
                    </tbody>
                </table>
            </div>
        `;
    } catch (error) {
        console.error('Error loading NCRs:', error);
        return '<p class="text-danger">Uygunsuzluk raporları yüklenirken hata oluştu</p>';
    }
}

// Attach form submission listeners
function attachActionFormListeners(task, action) {
    const contentContainer = taskDetailsModal.container.querySelector(`#action-content-${action.key}`);
    if (!contentContainer) return;
    
    // Handle form submission for actions with forms
    const form = contentContainer.querySelector(`#${action.handler}-action-form`);
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            try {
                switch (action.handler) {
                    case 'edit':
                        await handleEditActionSubmit(task);
                        break;
                    case 'start':
                        await handleStartTask(task.id);
                        taskDetailsModal.hide();
                        break;
                    case 'complete':
                        await handleCompleteTask(task.id, task);
                        taskDetailsModal.hide();
                        break;
                    case 'uncomplete':
                        await handleUncompleteTask(task.id);
                        taskDetailsModal.hide();
                        break;
                    case 'skip':
                        await handleSkipTask(task.id);
                        taskDetailsModal.hide();
                        break;
                    case 'unskip':
                        await handleUnskipTask(task.id);
                        taskDetailsModal.hide();
                        break;
                    case 'add-subtask':
                        await handleAddSubtaskActionSubmit(task);
                        break;
                    case 'submit-qc':
                        await handleSubmitQCActionSubmit(task);
                        break;
                    case 'assign-subcontractor':
                        await handleAssignSubcontractorActionSubmit(task);
                        break;
                    case 'set-paint-price':
                        await handleSetPaintPriceActionSubmit(task);
                        break;
                    case 'bulk-subtask':
                        await handleBulkSubtaskActionSubmit(task);
                        break;
                    case 'self-start-revision':
                        await handleSelfStartRevisionActionSubmit(task);
                        taskDetailsModal.hide();
                        break;
                }
            } catch (error) {
                console.error(`Error submitting ${action.handler} action:`, error);
            }
        });
    }
    
}

// Handle edit action form submission
async function handleEditActionSubmit(task) {
    const updateData = {};
    const isSubtask = !!task.parent;
    
    // Title can only be changed for subtasks
    if (isSubtask) {
        const titleInput = taskDetailsModal.container.querySelector('#edit-title');
        if (titleInput && titleInput.value.trim()) {
            updateData.title = titleInput.value.trim();
        }
    }
    
    const descriptionInput = taskDetailsModal.container.querySelector('#edit-description');
    if (descriptionInput) {
        updateData.description = descriptionInput.value || null;
    }
    
    const assignedInput = taskDetailsModal.container.querySelector('#edit-assigned-to');
    if (assignedInput) {
        updateData.assigned_to = assignedInput.value === '' ? null : parseInt(assignedInput.value);
    }
    
    const targetDateInput = taskDetailsModal.container.querySelector('#edit-target-completion-date');
    if (targetDateInput) {
        updateData.target_completion_date = targetDateInput.value || null;
    }
    
    const notesInput = taskDetailsModal.container.querySelector('#edit-notes');
    if (notesInput) {
        updateData.notes = notesInput.value || null;
    }
    
    await patchDepartmentTask(task.id, updateData);
    showNotification('Görev güncellendi', 'success');
    taskDetailsModal.hide();
}

// Handle add subtask action form submission
async function handleAddSubtaskActionSubmit(task) {
    const titleInput = taskDetailsModal.container.querySelector('#subtask-title');
    const descriptionInput = taskDetailsModal.container.querySelector('#subtask-description');
    const sequenceInput = taskDetailsModal.container.querySelector('#subtask-sequence');
    const weightInput = taskDetailsModal.container.querySelector('#subtask-weight');
    
    const subtaskData = {
        parent: task.id,
        title: titleInput ? titleInput.value.trim() : null,
        description: descriptionInput ? descriptionInput.value.trim() || null : null,
        sequence: sequenceInput ? parseInt(sequenceInput.value) || 1 : 1,
        weight: weightInput ? parseFloat(weightInput.value) || null : null
    };
    
    try {
        await createDepartmentTask(subtaskData);
        showNotification('Alt görev eklendi', 'success');
        taskDetailsModal.hide();
    } catch (error) {
        console.error('Error creating subtask:', error);
        showNotification(error.message || 'Alt görev eklenirken hata oluştu', 'error');
    }
}

// Setup QC reviews builder inline
function setupQCReviewsBuilderInline(task, contentContainer) {
    const reviewsContainerId = `qc-reviews-container-${task.id}`;
    const container = contentContainer.querySelector(`#${reviewsContainerId}`);
    const addBtn = contentContainer.querySelector(`#add-qc-review-btn-${task.id}`);
    const excelImportBtn = contentContainer.querySelector(`#excel-import-qc-btn-${task.id}`);
    
    if (!container) {
        console.error('QC reviews container not found');
        return;
    }
    
    let reviewCounter = 0;
    
    // Function to create a review row HTML
    function createReviewRowHTML(reviewId, reviewData = {}) {
        return `
            <div class="qc-review-row mb-2" data-review-id="${reviewId}">
                <div class="row g-2">
                    <div class="col-md-2">
                        <input type="text" class="form-control form-control-sm qc-location-input" 
                               data-review-id="${reviewId}" 
                               placeholder="Örn: Atölye B, Raf 3"
                               value="${reviewData.location || ''}">
                    </div>
                    <div class="col-md-2">
                        <input type="number" class="form-control form-control-sm qc-quantity-input" 
                               data-review-id="${reviewId}" 
                               placeholder="0" min="0"
                               value="${reviewData.quantity_inspected || ''}">
                    </div>
                    <div class="col-md-3">
                        <input type="text" class="form-control form-control-sm qc-drawing-input" 
                               data-review-id="${reviewId}" 
                               placeholder="Örn: GEM-254-01-A"
                               value="${reviewData.drawing_no || ''}">
                    </div>
                    <div class="col-md-2">
                        <input type="text" class="form-control form-control-sm qc-position-input" 
                               data-review-id="${reviewId}" 
                               placeholder="Örn: POS-07"
                               value="${reviewData.position_no || ''}">
                    </div>
                    <div class="col-md-2">
                        <input type="text" class="form-control form-control-sm qc-notes-input" 
                               data-review-id="${reviewId}" 
                               placeholder="Notlar"
                               value="${reviewData.notes || ''}">
                    </div>
                    <div class="col-md-1">
                        <button type="button" class="btn btn-outline-danger btn-sm w-100 remove-review-btn" data-review-id="${reviewId}" title="İncelemeyi Kaldır">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
    
    // Function to add a new review
    function addReview(reviewData = {}) {
        reviewCounter++;
        const reviewHTML = createReviewRowHTML(reviewCounter, reviewData);
        container.insertAdjacentHTML('beforeend', reviewHTML);
        
        // Attach remove listener
        const reviewRow = container.querySelector(`[data-review-id="${reviewCounter}"]`);
        if (reviewRow) {
            const removeBtn = reviewRow.querySelector('.remove-review-btn');
            if (removeBtn) {
                removeBtn.addEventListener('click', () => {
                    reviewRow.remove();
                });
            }
        }
    }
    
    // Add review button listener
    if (addBtn) {
        addBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            addReview();
        });
    }
    
    // Excel import button listener
    if (excelImportBtn) {
        excelImportBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            window.currentQCTaskId = task.id;
            window.currentQCReviewsContainer = container;
            window.currentQCAddReview = addReview;
            const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('qc-excel-import-modal'));
            modal.show();
        });
    }
    
    // Add initial review
    addReview();
}

// Handle submit QC action form submission
async function handleSubmitQCActionSubmit(task) {
    const reviewsContainerId = `qc-reviews-container-${task.id}`;
    const container = taskDetailsModal.container.querySelector(`#${reviewsContainerId}`);
    
    if (!container) {
        showNotification('İnceleme listesi bulunamadı', 'error');
        return;
    }
    
    // Build reviews array from rows
    const reviewRows = Array.from(container.querySelectorAll('.qc-review-row'));
    const reviews = [];
    
    for (const row of reviewRows) {
        const reviewId = row.dataset.reviewId;
        const locationInput = row.querySelector('.qc-location-input');
        const quantityInput = row.querySelector('.qc-quantity-input');
        const positionInput = row.querySelector('.qc-position-input');
        const drawingInput = row.querySelector('.qc-drawing-input');
        const notesInput = row.querySelector('.qc-notes-input');
        
        const reviewData = {};
        
        if (locationInput && locationInput.value.trim()) {
            reviewData.location = locationInput.value.trim();
        }
        if (quantityInput && quantityInput.value) {
            reviewData.quantity_inspected = parseInt(quantityInput.value) || null;
        }
        if (positionInput && positionInput.value.trim()) {
            reviewData.position_no = positionInput.value.trim();
        }
        if (drawingInput && drawingInput.value.trim()) {
            reviewData.drawing_no = drawingInput.value.trim();
        }
        if (notesInput && notesInput.value.trim()) {
            reviewData.notes = notesInput.value.trim();
        }
        
        reviews.push(reviewData);
    }
    
    if (reviews.length === 0) {
        showNotification('En az bir inceleme eklemelisiniz', 'error');
        return;
    }
    
    try {
        const response = await bulkSubmitQCReviews(task.id, reviews);
        const count = Array.isArray(response) ? response.length : 1;
        showNotification(`${count} inceleme kalite kontrolüne gönderildi`, 'success');
        taskDetailsModal.hide();
    } catch (error) {
        console.error('Error bulk submitting QC reviews:', error);
        let errorMessage = 'Kalite kontrolüne gönderilirken hata oluştu';
        try {
            if (error.message) {
                const errorData = JSON.parse(error.message);
                if (typeof errorData === 'object') {
                    if (errorData.message) {
                        errorMessage = errorData.message;
                    } else {
                        const errors = Object.values(errorData).flat();
                        errorMessage = errors.join(', ') || errorMessage;
                    }
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

// Handle assign subcontractor action form submission
async function handleAssignSubcontractorActionSubmit(task) {
    const subcontractorInput = taskDetailsModal.container.querySelector('#assignment-subtask-subcontractor');
    const priceTierInput = taskDetailsModal.container.querySelector('#assignment-subtask-price-tier');
    const weightInput = taskDetailsModal.container.querySelector('#assignment-subtask-weight');
    const titleInput = taskDetailsModal.container.querySelector('#assignment-subtask-title');
    
    if (!subcontractorInput || !subcontractorInput.value) {
        showNotification('Lütfen bir taşeron seçin', 'error');
        return;
    }
    
    if (!priceTierInput || !priceTierInput.value) {
        showNotification('Lütfen bir fiyat kademesi seçin', 'error');
        return;
    }
    
    if (!weightInput || !weightInput.value) {
        showNotification('Lütfen ayrılan ağırlığı girin', 'error');
        return;
    }
    
    const assignmentData = {
        kaynak_task_id: task.id,
        subcontractor: parseInt(subcontractorInput.value),
        price_tier: parseInt(priceTierInput.value),
        allocated_weight_kg: parseFloat(weightInput.value)
    };
    if (titleInput && titleInput.value.trim()) {
        assignmentData.title = titleInput.value.trim();
    }

    try {
        await createAssignmentWithSubtask(assignmentData);
        showNotification('Taşeron ataması ve alt görev oluşturuldu', 'success');
        taskDetailsModal.hide();
    } catch (error) {
        console.error('Error creating assignment with subtask:', error);
        showNotification(error.message || 'Taşeron ataması oluşturulurken hata oluştu', 'error');
    }
}

// Handle set paint price action form submission
async function handleSetPaintPriceActionSubmit(task) {
    const priceInput = taskDetailsModal.container.querySelector('#paint-price');
    
    if (!priceInput || !priceInput.value) {
        showNotification('Lütfen fiyat girin', 'error');
        return;
    }
    
    try {
        // Fetch price tiers to find the painting tier
        const tiersResponse = await fetchPriceTiers({ job_order: task.job_order });
        const tiers = tiersResponse.results || tiersResponse || [];
        
        const paintingTier = tiers.find(t => {
            const tierName = (t.name || '').toLowerCase();
            return tierName.includes('boya') || tierName.includes('painting');
        });
        
        if (!paintingTier) {
            showNotification('Boya fiyat kademesi bulunamadı', 'error');
            return;
        }
        
        await updatePriceTier(paintingTier.id, {
            price_per_kg: parseFloat(priceInput.value)
        });
        
        showNotification('Boya fiyatı güncellendi', 'success');
        taskDetailsModal.hide();
    } catch (error) {
        console.error('Error updating paint price:', error);
        showNotification(error.message || 'Boya fiyatı güncellenirken hata oluştu', 'error');
    }
}

// Handle self-start revision action submit (for modal)
async function handleSelfStartRevisionActionSubmit(task) {
    if (!task.current_release_id) {
        showNotification('Mevcut yayın bulunamadı', 'error');
        return;
    }
    
    // Get the reason from the form
    const reasonInput = taskDetailsModal.container.querySelector('#self-revision-reason');
    if (!reasonInput || !reasonInput.value.trim()) {
        showNotification('Lütfen revizyon nedenini girin', 'error');
        return;
    }
    
    const reason = reasonInput.value.trim();
    
    try {
        // Use the current_release_id from the task
        await selfStartRevision(task.current_release_id, reason);
        showNotification('Revizyon başlatıldı', 'success');
        taskDetailsModal.hide();
    } catch (error) {
        console.error('Error self-starting revision:', error);
        let errorMessage = 'Revizyon başlatılırken hata oluştu';
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

// Handle self-start revision from table button
async function handleSelfStartRevisionFromTable(row) {
    if (!row.current_release_id) {
        showNotification('Mevcut yayın bulunamadı', 'error');
        return;
    }
    
    confirmationModal.show({
        message: 'Bu yayın için revizyonu dış talep olmadan kendi başınıza başlatmak istediğinize emin misiniz?',
        confirmText: 'Evet, Başlat',
        details: `
            <div class="mt-3">
                <label for="self-revision-reason" class="form-label">
                    <i class="fas fa-comment me-1"></i>Revizyon Nedeni <span class="text-danger">*</span>
                </label>
                <textarea 
                    class="form-control" 
                    id="self-revision-reason" 
                    rows="3" 
                    placeholder="Revizyon nedenini açıklayın..."
                    required></textarea>
                <small class="form-text text-muted">Revizyon nedenini belirtmek zorunludur.</small>
            </div>
        `,
        onConfirm: async () => {
            try {
                // Get the reason from the textarea
                const reasonInput = document.getElementById('self-revision-reason');
                if (!reasonInput || !reasonInput.value.trim()) {
                    showNotification('Lütfen revizyon nedenini girin', 'error');
                    return; // Don't hide modal, let user enter reason
                }
                
                const reason = reasonInput.value.trim();
                
                // Use the current_release_id from the row
                await selfStartRevision(row.current_release_id, reason);
                showNotification('Revizyon başlatıldı', 'success');
                confirmationModal.hide();
            } catch (error) {
                console.error('Error self-starting revision:', error);
                let errorMessage = 'Revizyon başlatılırken hata oluştu';
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
                confirmationModal.hide();
            }
        }
    });
}

// Setup bulk subtask builder inline
function setupBulkSubtaskBuilderInline(task, contentContainer) {
    const tasksContainerId = `bulk-subtasks-container-${task.id}`;
    const container = contentContainer.querySelector(`#${tasksContainerId}`);
    const addBtn = contentContainer.querySelector(`#add-bulk-task-btn-${task.id}`);
    
    if (!container) {
        console.error('Bulk subtasks container not found');
        return;
    }
    
    let taskCounter = 0;
    
    // Function to create a task row HTML
    function createTaskRowHTML(taskId) {
        return `
            <div class="bulk-task-row mb-2 d-flex align-items-center gap-2" data-task-id="${taskId}">
                <div class="flex-grow-1">
                    <input type="text" class="form-control form-control-sm task-title-input" 
                           data-task-id="${taskId}" 
                           placeholder="Görev başlığı" 
                           required>
                </div>
                <button type="button" class="btn btn-sm btn-outline-danger remove-task-btn" data-task-id="${taskId}">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
    }
    
    // Function to add a new task
    function addTask() {
        taskCounter++;
        const taskHTML = createTaskRowHTML(taskCounter);
        container.insertAdjacentHTML('beforeend', taskHTML);
        
        // Attach remove listener
        const taskRow = container.querySelector(`[data-task-id="${taskCounter}"]`);
        if (taskRow) {
            const removeBtn = taskRow.querySelector('.remove-task-btn');
            if (removeBtn) {
                removeBtn.addEventListener('click', () => {
                    taskRow.remove();
                });
            }
        }
    }
    
    // Add task button listener
    if (addBtn) {
        addBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            addTask();
        });
    }
    
    // Add initial task
    addTask();
}

// Handle bulk subtask action form submission
async function handleBulkSubtaskActionSubmit(task) {
    const tasksContainerId = `bulk-subtasks-container-${task.id}`;
    const container = taskDetailsModal.container.querySelector(`#${tasksContainerId}`);
    
    if (!container) {
        showNotification('Görev listesi bulunamadı', 'error');
        return;
    }
    
    // Get parent task to determine next sequence number
    const parentTask = await getDepartmentTaskById(task.id);
    const nextSequence = (parentTask.subtasks_count || 0) + 1;
    
    // Build task array from rows
    const taskRows = Array.from(container.querySelectorAll('.bulk-task-row'));
    const taskTree = [];
    let sequence = nextSequence;
    
    for (const row of taskRows) {
        const titleInput = row.querySelector('.task-title-input');
        if (!titleInput || !titleInput.value.trim()) {
            showNotification('Tüm görevler için başlık gereklidir', 'error');
            return;
        }
        
        taskTree.push({
            title: titleInput.value.trim(),
            task_type: 'part', // Always "part"
            sequence: sequence++,
            weight: 10, // Default weight
            subtasks: [] // No nested subtasks in simplified version
        });
    }
    
    if (taskTree.length === 0) {
        showNotification('En az bir görev eklemelisiniz', 'error');
        return;
    }
    
    try {
        const response = await bulkCreateSubtasks(task.id, { tasks: taskTree });
        showNotification(response.message || `${response.tasks?.length || 0} alt görev oluşturuldu`, 'success');
        taskDetailsModal.hide();
        
        // Clear subtasks cache for parent to force refresh
        if (task.id && subtasksCache && subtasksCache.has(task.id)) {
            subtasksCache.delete(task.id);
        }
        
        // If parent was expanded, refresh subtasks
        if (task.id && expandedRows && expandedRows.has(task.id)) {
            await fetchTaskSubtasks(task.id);
        }
        
        await loadTasks();
    } catch (error) {
        console.error('Error bulk creating subtasks:', error);
        let errorMessage = 'Alt görevler oluşturulurken hata oluştu';
        try {
            if (error.message) {
                const errorData = JSON.parse(error.message);
                if (typeof errorData === 'object') {
                    if (errorData.message) {
                        errorMessage = errorData.message;
                    } else {
                        const errors = Object.values(errorData).flat();
                        errorMessage = errors.join(', ') || errorMessage;
                    }
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

async function showBulkSubtaskModal(parentTaskId) {
    window.pendingBulkSubtaskParentId = parentTaskId;

    try {
        // Get parent task to determine next sequence number
        const parentTask = await getDepartmentTaskById(parentTaskId);
        const nextSequence = (parentTask.subtasks_count || 0) + 1;

        bulkSubtaskModal.clearAll();

        // Add section with title only (like "Ürün Bilgileri")
        bulkSubtaskModal.addSection({
            id: 'subtasks-info',
            title: 'Alt Görevler',
            icon: 'fas fa-layer-group',
            iconColor: 'text-primary',
            fields: []
        });

        bulkSubtaskModal.render();

        // Add custom HTML for tasks container after rendering
        const tasksContainerId = 'bulk-subtasks-container';
        setTimeout(() => {
            const itemsSection = bulkSubtaskModal.container.querySelector('[data-section-id="subtasks-info"]');
            if (itemsSection) {
                const sectionContent = itemsSection.querySelector('.section-content') || itemsSection;
                const tasksHtml = `
                    <div class="mt-3">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <button type="button" class="btn btn-sm btn-outline-primary" id="add-bulk-task-btn">
                                <i class="fas fa-plus me-1"></i>Görev Ekle
                            </button>
                        </div>
                        <div id="${tasksContainerId}" class="bulk-subtasks-container">
                            <!-- Tasks will be added here -->
                        </div>
                    </div>
                `;
                sectionContent.insertAdjacentHTML('beforeend', tasksHtml);
                
                // Setup the dynamic task builder
                setupBulkSubtaskBuilder();
            }
        }, 100);

        function setupBulkSubtaskBuilder() {
            const container = document.getElementById(tasksContainerId);
            if (!container) {
                console.error('Container not found');
                return;
            }

            let taskCounter = 0;
            let sequenceCounter = nextSequence;

            // Function to create a simple task row HTML (just title)
            function createTaskRowHTML(taskId) {
                const sequence = sequenceCounter++;
                return `
                    <div class="bulk-task-row mb-2 d-flex align-items-center gap-2" data-task-id="${taskId}">
                        <div class="flex-grow-1">
                            <input type="text" class="form-control form-control-sm task-title-input" 
                                   data-task-id="${taskId}" 
                                   placeholder="Görev başlığı" 
                                   required>
                        </div>
                        <button type="button" class="btn btn-sm btn-outline-danger remove-task-btn" data-task-id="${taskId}">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                `;
            }

            // Function to add a new task
            function addTask() {
                taskCounter++;
                const taskHTML = createTaskRowHTML(taskCounter);
                container.insertAdjacentHTML('beforeend', taskHTML);
                attachTaskListeners(taskCounter);
            }

            // Function to attach event listeners
            function attachTaskListeners(taskId) {
                const taskRow = container.querySelector(`[data-task-id="${taskId}"]`);
                if (!taskRow) return;

                // Remove task button
                const removeBtn = taskRow.querySelector('.remove-task-btn');
                if (removeBtn) {
                    removeBtn.addEventListener('click', () => {
                        taskRow.remove();
                    });
                }
            }

            // Add initial task
            addTask();

            // Add task button listener
            const addTaskBtn = document.getElementById('add-bulk-task-btn');
            if (addTaskBtn) {
                addTaskBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    addTask();
                });
            }
        }

        // Setup save callback
        bulkSubtaskModal.onSaveCallback(async () => {
            // Get container - it should exist by now
            const container = document.getElementById(tasksContainerId);
            if (!container) {
                showNotification('Görev listesi bulunamadı', 'error');
                return;
            }
            
            // Build simple task array from rows (just title, task_type is always "part")
            const taskRows = Array.from(container.querySelectorAll('.bulk-task-row'));
            const taskTree = [];
            let sequence = nextSequence;

            for (const row of taskRows) {
                const titleInput = row.querySelector('.task-title-input');
                if (!titleInput || !titleInput.value.trim()) {
                    showNotification('Tüm görevler için başlık gereklidir', 'error');
                    return;
                }

                taskTree.push({
                    title: titleInput.value.trim(),
                    task_type: 'part', // Always "part"
                    sequence: sequence++,
                    weight: 10, // Default weight
                    subtasks: [] // No nested subtasks in simplified version
                });
            }

            if (taskTree.length === 0) {
                showNotification('En az bir görev eklemelisiniz', 'error');
                return;
            }

            try {
                const response = await bulkCreateSubtasks(parentTaskId, { tasks: taskTree });
                showNotification(response.message || `${response.tasks?.length || 0} alt görev oluşturuldu`, 'success');
                bulkSubtaskModal.hide();
                window.pendingBulkSubtaskParentId = null;

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
                console.error('Error bulk creating subtasks:', error);
                let errorMessage = 'Alt görevler oluşturulurken hata oluştu';
                try {
                    if (error.message) {
                        const errorData = JSON.parse(error.message);
                        if (typeof errorData === 'object') {
                            if (errorData.message) {
                                errorMessage = errorData.message;
                            } else {
                                const errors = Object.values(errorData).flat();
                                errorMessage = errors.join(', ') || errorMessage;
                            }
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

        bulkSubtaskModal.show();
    } catch (error) {
        console.error('Error loading parent task for bulk subtask creation:', error);
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
                const response = await uncompleteDepartmentTask(taskId);
                showNotification('Görev tamamlanma durumu geri alındı', 'success');
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
                const response = await skipDepartmentTask(taskId);
                showNotification('Görev atlandı', 'success');
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

async function handleUnskipTask(taskId) {
    confirmationModal.show({
        message: 'Bu görevin atlama durumunu geri almak istediğinize emin misiniz?',
        confirmText: 'Evet, Geri Al',
        onConfirm: async () => {
            try {
                const response = await unskipDepartmentTask(taskId);
                showNotification('Görev atlama durumu geri alındı', 'success');
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
                console.error('Error unskipping task:', error);
                let errorMessage = 'Görev atlama durumu geri alınırken hata oluştu';
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

// Add Subcontracting Assignment Section
async function addSubcontractingAssignmentSection(modal, task) {
    try {
        // Fetch assignment for this subtask
        const assignmentsResponse = await fetchAssignments({ department_task: task.id });
        const assignments = assignmentsResponse.results || assignmentsResponse || [];
        const assignment = assignments.length > 0 ? assignments[0] : null;
        
        modal.addSection({
            title: 'Taşeron Ataması',
            icon: 'fas fa-handshake',
            iconColor: 'text-warning'
        });
        
        if (assignment) {
            // Display existing assignment
            const formatCurrency = (amount, currency) => {
                if (!amount) return '-';
                return new Intl.NumberFormat('tr-TR', {
                    style: 'decimal',
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                }).format(amount) + ' ' + (currency || 'TRY');
            };
            
            modal.addCustomSection({
                id: 'assignment-info',
                customContent: `
                    <div class="assignment-info p-3 bg-light rounded">
                        <div class="row mb-2">
                            <div class="col-md-6">
                                <strong>Taşeron:</strong> ${assignment.subcontractor_name || '-'}
                            </div>
                            <div class="col-md-6">
                                <strong>Fiyat Kademesi:</strong> ${assignment.price_tier_name || '-'} (${formatCurrency(assignment.price_per_kg, assignment.cost_currency)}/kg)
                            </div>
                        </div>
                        <div class="row mb-2">
                            <div class="col-md-6">
                                <strong>Ayrılan Ağırlık:</strong> ${assignment.allocated_weight_kg || 0} kg
                            </div>
                            <div class="col-md-6">
                                <strong>Mevcut İlerleme:</strong> ${assignment.current_progress || 0}%
                            </div>
                        </div>
                        <div class="row mb-2">
                            <div class="col-md-6">
                                <strong>Faturalanmış İlerleme:</strong> ${assignment.last_billed_progress || 0}%
                            </div>
                            <div class="col-md-6">
                                <strong>Faturalanmamış:</strong> ${assignment.unbilled_progress || 0}% → ${assignment.unbilled_weight_kg || 0} kg × ${formatCurrency(assignment.price_per_kg, assignment.cost_currency)} = ${formatCurrency(assignment.unbilled_cost, assignment.cost_currency)}
                            </div>
                        </div>
                        <div class="row">
                            <div class="col-md-12">
                                <strong>Toplam Maliyet:</strong> ${assignment.allocated_weight_kg || 0} × ${assignment.current_progress || 0}% × ${formatCurrency(assignment.price_per_kg, assignment.cost_currency)} = ${formatCurrency(assignment.current_cost, assignment.cost_currency)}
                            </div>
                        </div>
                        ${task.task_type !== 'painting' ? `
                        <div class="mt-3">
                            <button type="button" class="btn btn-sm btn-primary" id="edit-assignment-btn-${task.id}">
                                <i class="fas fa-edit me-1"></i>Düzenle
                            </button>
                            <button type="button" class="btn btn-sm btn-outline-danger" id="delete-assignment-btn-${task.id}">
                                <i class="fas fa-trash me-1"></i>Sil
                            </button>
                        </div>
                        ` : ''}
                    </div>
                `
            });
            
            // Store assignment for later use
            window.currentAssignment = assignment;
        } else {
            // Show message that assignment can be created from table actions
            // Note: "Taşeron Ata" button removed from details - use table action button for Kaynaklı İmalat subtasks
            modal.addCustomSection({
                id: 'no-assignment',
                customContent: `
                    <div class="text-center py-3">
                        <p class="text-muted mb-3">Bu alt göreve henüz taşeron atanmamış.</p>
                        <p class="text-muted small">Kaynaklı İmalat alt görevleri için tablodaki "Taşeron Ata" butonunu kullanın.</p>
                    </div>
                `
            });
        }
        
        // Set up event listeners after modal is rendered
        // Skip edit/delete buttons for painting tasks (they have their own button)
        if (task.task_type !== 'painting') {
            setTimeout(() => {
                const editBtn = document.getElementById(`edit-assignment-btn-${task.id}`);
                if (editBtn) {
                    editBtn.addEventListener('click', () => {
                        modal.hide();
                        showEditAssignmentModal(task, assignment);
                    });
                }
                
                const deleteBtn = document.getElementById(`delete-assignment-btn-${task.id}`);
                if (deleteBtn) {
                    deleteBtn.addEventListener('click', async () => {
                        if (confirm('Taşeron atamasını silmek istediğinizden emin misiniz?')) {
                            try {
                                await deleteAssignment(assignment.id);
                                showNotification('Taşeron ataması silindi', 'success');
                                modal.hide();
                                viewTaskDetails(task.id);
                            } catch (error) {
                                console.error('Error deleting assignment:', error);
                                showNotification(error.message || 'Taşeron ataması silinirken hata oluştu', 'error');
                            }
                        }
                    });
                }
            }, 100);
        }
    } catch (error) {
        console.error('Error loading assignment:', error);
        // Don't show error to user, just skip the section
    }
}

// Show Create Assignment Modal
async function showCreateAssignmentModal(task) {
    try {
        // Fetch subcontractors and price tiers
        const [subcontractorsResponse, tiersResponse] = await Promise.all([
            fetchSubcontractors({ is_active: true }),
            fetchPriceTiers({ job_order: task.job_order })
        ]);
        
        const subcontractors = subcontractorsResponse.results || subcontractorsResponse || [];
        const tiers = tiersResponse.results || tiersResponse || [];
        
        const modal = new EditModal('assignment-modal-container', {
            title: 'Taşeron Ataması Oluştur',
            icon: 'fas fa-handshake',
            size: 'md',
            showEditButton: false
        });
        
        modal.clearAll();
        modal.addSection({
            title: 'Atama Bilgileri',
            icon: 'fas fa-info-circle',
            iconColor: 'text-primary'
        });
        
        modal.addField({
            id: 'assignment-subcontractor',
            name: 'subcontractor',
            label: 'Taşeron',
            type: 'dropdown',
            value: '',
            required: true,
            options: [
                { value: '', label: 'Taşeron seçin...' },
                ...subcontractors.map(s => ({ value: s.id.toString(), label: s.name || s.short_name }))
            ],
            icon: 'fas fa-building',
            colSize: 12
        });
        
        modal.addField({
            id: 'assignment-price-tier',
            name: 'price_tier',
            label: 'Fiyat Kademesi',
            type: 'dropdown',
            value: '',
            required: true,
            options: [
                { value: '', label: 'Kademe seçin...' },
                ...tiers.map(t => ({ 
                    value: t.id.toString(), 
                    label: `${t.name} (${t.price_per_kg} ${t.currency}/kg, Kalan: ${t.remaining_weight_kg || 0} kg)` 
                }))
            ],
            icon: 'fas fa-list',
            colSize: 12
        });
        
        modal.addField({
            id: 'assignment-weight',
            name: 'allocated_weight_kg',
            label: 'Ayrılan Ağırlık (kg)',
            type: 'number',
            value: '',
            required: true,
            step: '0.01',
            min: '0',
            icon: 'fas fa-weight',
            colSize: 12,
            helpText: 'Maksimum ağırlık seçilen kademenin kalan ağırlığına göre belirlenecektir'
        });
        
        modal.render();
        modal.show();
        
        // Update max weight when tier is selected
        const tierSelect = modal.container.querySelector('#assignment-price-tier');
        const weightInput = modal.container.querySelector('#assignment-weight');
        
        if (tierSelect && weightInput) {
            tierSelect.addEventListener('change', async (e) => {
                const tierId = e.target.value;
                if (tierId) {
                    try {
                        const remaining = await getPriceTierRemainingWeight(parseInt(tierId));
                        weightInput.max = remaining.remaining_weight_kg || 0;
                        weightInput.setAttribute('max', remaining.remaining_weight_kg || 0);
                        if (weightInput.value && parseFloat(weightInput.value) > remaining.remaining_weight_kg) {
                            weightInput.value = remaining.remaining_weight_kg;
                        }
                    } catch (error) {
                        console.error('Error fetching remaining weight:', error);
                    }
                }
            });
        }
        
        modal.onSaveCallback(async (formData) => {
            try {
                await createAssignment({
                    department_task: task.id,
                    subcontractor: parseInt(formData.subcontractor),
                    price_tier: parseInt(formData.price_tier),
                    allocated_weight_kg: parseFloat(formData.allocated_weight_kg)
                });
                showNotification('Taşeron ataması oluşturuldu', 'success');
                modal.hide();
                viewTaskDetails(task.id);
            } catch (error) {
                console.error('Error creating assignment:', error);
                showNotification(error.message || 'Taşeron ataması oluşturulurken hata oluştu', 'error');
            }
        });
    } catch (error) {
        console.error('Error showing create assignment modal:', error);
        showNotification('Atama formu yüklenirken hata oluştu', 'error');
    }
}

// Show Edit Assignment Modal
async function showEditAssignmentModal(task, assignment) {
    try {
        // For painting tasks, only allow editing the price (via price tier)
        if (task.task_type === 'painting') {
            if (!task.job_order) {
                showNotification('İş emri bulunamadı', 'error');
                return;
            }
            
            // Fetch price tiers for this job order
            const tiersResponse = await fetchPriceTiers({ job_order: task.job_order });
            const tiers = tiersResponse.results || tiersResponse || [];
            
            // Find the painting tier (usually named "Boya" or contains "painting")
            const paintingTier = tiers.find(t => {
                const tierName = (t.name || '').toLowerCase();
                return tierName.includes('boya') || tierName.includes('painting');
            });
            
            if (!paintingTier) {
                showNotification('Boya fiyat kademesi bulunamadı', 'error');
                return;
            }
            
            const modal = new EditModal('assignment-modal-container', {
                title: 'Boya Fiyatı Düzenle',
                icon: 'fas fa-paint-brush',
                size: 'md',
                showEditButton: false
            });
            
            modal.clearAll();
            modal.addSection({
                title: 'Fiyat Bilgisi',
                icon: 'fas fa-money-bill-wave',
                iconColor: 'text-primary'
            });
            
            modal.addField({
                id: 'edit-paint-price',
                name: 'price_per_kg',
                label: 'Fiyat/kg',
                type: 'number',
                value: paintingTier.price_per_kg || '',
                required: true,
                step: '0.01',
                min: '0',
                icon: 'fas fa-money-bill-wave',
                colSize: 12,
                helpText: `Mevcut fiyat: ${paintingTier.price_per_kg || '0'} ${paintingTier.currency || 'TRY'}/kg`
            });
            
            modal.render();
            modal.show();
            
            modal.onSaveCallback(async (formData) => {
                try {
                    await updatePriceTier(paintingTier.id, {
                        price_per_kg: formData.price_per_kg
                    });
                    showNotification('Boya fiyatı güncellendi', 'success');
                    modal.hide();
                    viewTaskDetails(task.id);
                } catch (error) {
                    console.error('Error updating paint price:', error);
                    showNotification(error.message || 'Boya fiyatı güncellenirken hata oluştu', 'error');
                }
            });
            
            return;
        }
        
        // For non-painting tasks, show the full assignment edit form
        // Fetch subcontractors and price tiers
        const [subcontractorsResponse, tiersResponse] = await Promise.all([
            fetchSubcontractors({ is_active: true }),
            fetchPriceTiers({ job_order: task.job_order })
        ]);
        
        const subcontractors = subcontractorsResponse.results || subcontractorsResponse || [];
        const tiers = tiersResponse.results || tiersResponse || [];
        
        const modal = new EditModal('assignment-modal-container', {
            title: 'Taşeron Ataması Düzenle',
            icon: 'fas fa-edit',
            size: 'md',
            showEditButton: false
        });
        
        modal.clearAll();
        modal.addSection({
            title: 'Atama Bilgileri',
            icon: 'fas fa-info-circle',
            iconColor: 'text-primary'
        });
        
        modal.addField({
            id: 'edit-assignment-subcontractor',
            name: 'subcontractor',
            label: 'Taşeron',
            type: 'dropdown',
            value: assignment.subcontractor ? assignment.subcontractor.toString() : '',
            required: true,
            options: [
                { value: '', label: 'Taşeron seçin...' },
                ...subcontractors.map(s => ({ value: s.id.toString(), label: s.name || s.short_name }))
            ],
            icon: 'fas fa-building',
            colSize: 12
        });
        
        modal.addField({
            id: 'edit-assignment-price-tier',
            name: 'price_tier',
            label: 'Fiyat Kademesi',
            type: 'dropdown',
            value: assignment.price_tier ? assignment.price_tier.toString() : '',
            required: true,
            options: [
                { value: '', label: 'Kademe seçin...' },
                ...tiers.map(t => ({ 
                    value: t.id.toString(), 
                    label: `${t.name} (${t.price_per_kg} ${t.currency}/kg, Kalan: ${t.remaining_weight_kg || 0} kg)` 
                }))
            ],
            icon: 'fas fa-list',
            colSize: 12
        });
        
        modal.addField({
            id: 'edit-assignment-weight',
            name: 'allocated_weight_kg',
            label: 'Ayrılan Ağırlık (kg)',
            type: 'number',
            value: assignment.allocated_weight_kg || '',
            required: true,
            step: '0.01',
            min: '0',
            icon: 'fas fa-weight',
            colSize: 12,
            helpText: 'Maksimum ağırlık seçilen kademenin kalan ağırlığına göre belirlenecektir'
        });
        
        modal.render();
        modal.show();
        
        window.editingAssignmentId = assignment.id;
        
        // Update max weight when tier is selected
        const tierSelect = modal.container.querySelector('#edit-assignment-price-tier');
        const weightInput = modal.container.querySelector('#edit-assignment-weight');
        
        if (tierSelect && weightInput) {
            tierSelect.addEventListener('change', async (e) => {
                const tierId = e.target.value;
                if (tierId) {
                    try {
                        const remaining = await getPriceTierRemainingWeight(parseInt(tierId));
                        weightInput.max = remaining.remaining_weight_kg || 0;
                        weightInput.setAttribute('max', remaining.remaining_weight_kg || 0);
                        if (weightInput.value && parseFloat(weightInput.value) > remaining.remaining_weight_kg) {
                            weightInput.value = remaining.remaining_weight_kg;
                        }
                    } catch (error) {
                        console.error('Error fetching remaining weight:', error);
                    }
                }
            });
        }
        
        modal.onSaveCallback(async (formData) => {
            try {
                await updateAssignment(window.editingAssignmentId, {
                    subcontractor: parseInt(formData.subcontractor),
                    price_tier: parseInt(formData.price_tier),
                    allocated_weight_kg: parseFloat(formData.allocated_weight_kg)
                });
                showNotification('Taşeron ataması güncellendi', 'success');
                modal.hide();
                window.editingAssignmentId = null;
                viewTaskDetails(task.id);
            } catch (error) {
                console.error('Error updating assignment:', error);
                showNotification(error.message || 'Taşeron ataması güncellenirken hata oluştu', 'error');
            }
        });
    } catch (error) {
        console.error('Error showing edit assignment modal:', error);
        showNotification('Atama formu yüklenirken hata oluştu', 'error');
    }
}

// Show Create Assignment With Subtask Modal
async function showCreateAssignmentWithSubtaskModal(taskId, taskRow = null) {
    try {
        // Get task to ensure we have the latest data
        const task = taskRow || await getDepartmentTaskById(taskId);
        
        // Verify this is a welding (Kaynaklı İmalat) task
        // Works for tasks at any hierarchy level (top-level, subtasks, subtasks of subtasks, etc.)
        if (task.task_type !== 'welding') {
            showNotification('Bu işlem sadece Kaynaklı İmalat görevleri için kullanılabilir', 'error');
            return;
        }
        
        // Fetch subcontractors and price tiers
        const [subcontractorsResponse, tiersResponse] = await Promise.all([
            fetchSubcontractors({ is_active: true }),
            fetchPriceTiers({ job_order: task.job_order })
        ]);
        
        const subcontractors = subcontractorsResponse.results || subcontractorsResponse || [];
        const tiers = tiersResponse.results || tiersResponse || [];
        
        const modal = new EditModal('assignment-modal-container', {
            title: 'Taşeron Ata ve Alt Görev Oluştur',
            icon: 'fas fa-handshake',
            size: 'md',
            showEditButton: false
        });
        
        modal.clearAll();
        modal.addSection({
            title: 'Atama Bilgileri',
            icon: 'fas fa-info-circle',
            iconColor: 'text-primary'
        });
        
        modal.addField({
            id: 'assignment-subtask-subcontractor',
            name: 'subcontractor',
            label: 'Taşeron',
            type: 'dropdown',
            value: '',
            required: true,
            options: [
                { value: '', label: 'Taşeron seçin...' },
                ...subcontractors.map(s => ({ value: s.id.toString(), label: s.name || s.short_name }))
            ],
            icon: 'fas fa-building',
            colSize: 12
        });
        
        modal.addField({
            id: 'assignment-subtask-price-tier',
            name: 'price_tier',
            label: 'Fiyat Kademesi',
            type: 'dropdown',
            value: '',
            required: true,
            options: [
                { value: '', label: 'Kademe seçin...' },
                ...tiers.map(t => ({ 
                    value: t.id.toString(), 
                    label: `${t.name} (${t.price_per_kg} ${t.currency}/kg, Kalan: ${t.remaining_weight_kg || 0} kg)` 
                }))
            ],
            icon: 'fas fa-list',
            colSize: 12
        });
        
        modal.addField({
            id: 'assignment-subtask-weight',
            name: 'allocated_weight_kg',
            label: 'Ayrılan Ağırlık (kg)',
            type: 'number',
            value: '',
            required: true,
            step: '0.01',
            min: '0',
            icon: 'fas fa-weight',
            colSize: 12,
            helpText: 'Maksimum ağırlık seçilen kademenin kalan ağırlığına göre belirlenecektir'
        });
        
        modal.addSection({
            title: 'Alt Görev Bilgileri (Opsiyonel)',
            icon: 'fas fa-tasks',
            iconColor: 'text-info'
        });
        
        modal.addField({
            id: 'assignment-subtask-title',
            name: 'title',
            label: 'Alt Görev Başlığı',
            type: 'text',
            value: '',
            required: false,
            icon: 'fas fa-heading',
            colSize: 12,
            helpText: 'Boş bırakılırsa taşeron adı kullanılacaktır'
        });
        
        modal.addField({
            id: 'assignment-subtask-weight-field',
            name: 'weight',
            label: 'Alt Görev Ağırlığı',
            type: 'number',
            value: '10',
            required: false,
            step: '0.01',
            min: '0',
            icon: 'fas fa-weight-hanging',
            colSize: 12,
            helpText: 'Varsayılan: 10'
        });
        
        modal.render();
        modal.show();
        
        // Update max weight when tier is selected
        const tierSelect = modal.container.querySelector('#assignment-subtask-price-tier');
        const weightInput = modal.container.querySelector('#assignment-subtask-weight');
        
        if (tierSelect && weightInput) {
            tierSelect.addEventListener('change', async (e) => {
                const tierId = e.target.value;
                if (tierId) {
                    try {
                        const remaining = await getPriceTierRemainingWeight(parseInt(tierId));
                        weightInput.max = remaining.remaining_weight_kg || 0;
                        weightInput.setAttribute('max', remaining.remaining_weight_kg || 0);
                        if (weightInput.value && parseFloat(weightInput.value) > remaining.remaining_weight_kg) {
                            weightInput.value = remaining.remaining_weight_kg;
                        }
                    } catch (error) {
                        console.error('Error fetching remaining weight:', error);
                    }
                }
            });
        }
        
        modal.onSaveCallback(async (formData) => {
            try {
                const assignmentData = {
                    kaynak_task_id: taskId,
                    subcontractor: parseInt(formData.subcontractor),
                    price_tier: parseInt(formData.price_tier),
                    allocated_weight_kg: parseFloat(formData.allocated_weight_kg)
                };
                
                // Add optional fields if provided
                if (formData.title && formData.title.trim()) {
                    assignmentData.title = formData.title.trim();
                }
                if (formData.weight !== undefined && formData.weight !== null && formData.weight !== '') {
                    assignmentData.weight = parseFloat(formData.weight);
                }
                
                await createAssignmentWithSubtask(assignmentData);
                showNotification('Taşeron ataması ve alt görev oluşturuldu', 'success');
                modal.hide();
                
                // Clear subtasks cache for this welding task to force refresh
                if (subtasksCache.has(taskId)) {
                    subtasksCache.delete(taskId);
                }
                
                // If this task was expanded, refresh subtasks
                if (expandedRows.has(taskId)) {
                    await fetchTaskSubtasks(taskId);
                }
                
                // Reload tasks to show the new subtask
                await loadTasks();
            } catch (error) {
                console.error('Error creating assignment with subtask:', error);
                showNotification(error.message || 'Taşeron ataması ve alt görev oluşturulurken hata oluştu', 'error');
            }
        });
    } catch (error) {
        console.error('Error showing create assignment with subtask modal:', error);
        showNotification('Atama formu yüklenirken hata oluştu', 'error');
    }
}

// Show Set Paint Price Modal
async function showSetPaintPriceModal(taskId, taskRow = null) {
    try {
        // Get task to ensure we have the latest data
        const task = taskRow || await getDepartmentTaskById(taskId);
        
        // Verify this is a painting task
        if (task.task_type !== 'painting') {
            showNotification('Bu işlem sadece Boya görevleri için kullanılabilir', 'error');
            return;
        }
        
        if (!task.job_order) {
            showNotification('İş emri bulunamadı', 'error');
            return;
        }
        
        // Fetch price tiers for this job order
        const tiersResponse = await fetchPriceTiers({ job_order: task.job_order });
        const tiers = tiersResponse.results || tiersResponse || [];
        
        // Find the painting tier (usually named "Boya" or contains "painting")
        const paintingTier = tiers.find(t => {
            const tierName = (t.name || '').toLowerCase();
            return tierName.includes('boya') || tierName.includes('painting');
        });
        
        if (!paintingTier) {
            showNotification('Boya fiyat kademesi bulunamadı', 'error');
            return;
        }
        
        const modal = new EditModal('assignment-modal-container', {
            title: 'Boya Fiyatı Belirle',
            icon: 'fas fa-paint-brush',
            size: 'md',
            showEditButton: false
        });
        
        modal.clearAll();
        modal.addSection({
            title: 'Fiyat Bilgisi',
            icon: 'fas fa-money-bill-wave',
            iconColor: 'text-primary'
        });
        
        modal.addField({
            id: 'paint-price',
            name: 'price_per_kg',
            label: 'Fiyat/kg',
            type: 'number',
            value: paintingTier.price_per_kg || '',
            required: true,
            step: '0.01',
            min: '0',
            icon: 'fas fa-money-bill-wave',
            colSize: 12,
            helpText: `Mevcut fiyat: ${paintingTier.price_per_kg || '0'} ${paintingTier.currency || 'TRY'}/kg`
        });
        
        modal.render();
        modal.show();
        
        modal.onSaveCallback(async (formData) => {
            try {
                await updatePriceTier(paintingTier.id, {
                    price_per_kg: formData.price_per_kg
                });
                showNotification('Boya fiyatı güncellendi', 'success');
                modal.hide();
                
                // Reload tasks to refresh any displayed price information
                await loadTasks();
            } catch (error) {
                console.error('Error updating paint price:', error);
                showNotification(error.message || 'Boya fiyatı güncellenirken hata oluştu', 'error');
            }
        });
    } catch (error) {
        console.error('Error showing set paint price modal:', error);
        showNotification('Fiyat formu yüklenirken hata oluştu', 'error');
    }
}

    // Setup QC Excel import listeners
    setupQCExcelImportListeners();
} // end initDepartmentTasksPage

// QC Excel Import functionality
let qcExcelImportData = null;

function setupQCExcelImportListeners() {
    // Use setTimeout to ensure DOM is ready
    setTimeout(() => {
        const previewBtn = document.getElementById('preview-qc-excel-import-btn');
        const clearBtn = document.getElementById('clear-qc-excel-import-btn');
        const importBtn = document.getElementById('import-qc-excel-btn');
        
        if (previewBtn) {
            previewBtn.addEventListener('click', previewQCExcelImport);
        }
        
        if (clearBtn) {
            clearBtn.addEventListener('click', clearQCExcelImport);
        }
        
        if (importBtn) {
            importBtn.addEventListener('click', importQCExcelReviews);
        }
    }, 100);
}

function previewQCExcelImport() {
    const fileInput = document.getElementById('qc-excel-file-input');
    const file = fileInput.files[0];
    
    if (!file) {
        showNotification('Lütfen bir dosya seçin', 'warning');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            let jsonData;
            
            if (file.name.toLowerCase().endsWith('.csv')) {
                const csvText = e.target.result;
                jsonData = parseCSV(csvText);
            } else {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            }

            if (jsonData.length < 2) {
                showNotification('Dosya boş veya geçersiz format', 'error');
                return;
            }

            processQCExcelData(jsonData);
        } catch (error) {
            console.error('Dosya okuma hatası:', error);
            showNotification('Dosya okunamadı. Lütfen geçerli bir Excel veya CSV dosyası seçin', 'error');
        }
    };
    
    if (file.name.toLowerCase().endsWith('.csv')) {
        reader.readAsText(file, 'UTF-8');
    } else {
        reader.readAsArrayBuffer(file);
    }
}

function parseCSV(csvText) {
    const result = [];
    const lines = csvText.split('\n');
    
    lines.forEach(line => {
        if (line.trim()) {
            // Simple CSV parsing - handle quoted fields
            const fields = [];
            let currentField = '';
            let inQuotes = false;
            
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                
                if (char === '"') {
                    inQuotes = !inQuotes;
                } else if (char === ',' && !inQuotes) {
                    fields.push(currentField.trim());
                    currentField = '';
                } else {
                    currentField += char;
                }
            }
            fields.push(currentField.trim());
            result.push(fields);
        }
    });
    
    return result;
}

function processQCExcelData(data) {
    const headers = data[0];
    const dataRows = data.slice(1);
    
    // Auto-detect column mappings
    const columnMapping = detectQCExcelColumnMapping(headers);
    
    // Process data with mapping
    const processedReviews = [];
    const errors = [];
    
    dataRows.forEach((row, index) => {
        if (!row || row.length === 0) return;
        
        try {
            const review = {
                location: getExcelCellValue(row, columnMapping.location),
                quantity_inspected: getExcelCellValue(row, columnMapping.quantity_inspected) ? parseInt(getExcelCellValue(row, columnMapping.quantity_inspected)) : null,
                position_no: getExcelCellValue(row, columnMapping.position_no),
                drawing_no: getExcelCellValue(row, columnMapping.drawing_no),
                notes: getExcelCellValue(row, columnMapping.notes)
            };
            
            // All fields are optional, so we accept empty reviews
            processedReviews.push(review);
        } catch (error) {
            errors.push(`Satır ${index + 2}: ${error.message}`);
        }
    });
    
    if (processedReviews.length === 0) {
        showNotification('İşlenecek veri bulunamadı', 'error');
        return;
    }
    
    qcExcelImportData = { processedReviews, errors };
    displayQCExcelImportPreview(processedReviews);
    
    if (errors.length > 0) {
        showQCExcelImportErrors(errors);
    }
}

function detectQCExcelColumnMapping(headers) {
    const mapping = {
        location: -1,
        quantity_inspected: -1,
        position_no: -1,
        drawing_no: -1,
        notes: -1
    };
    
    const columnKeywords = {
        location: ['konum', 'location', 'lokasyon', 'yer'],
        quantity_inspected: ['miktar', 'quantity', 'incelenen', 'adet', 'sayi', 'qty'],
        position_no: ['pozisyon', 'position', 'pos', 'pozisyonno', 'positionno'],
        drawing_no: ['cizim', 'drawing', 'cizimno', 'drawingno', 'resim', 'dwg'],
        notes: ['not', 'notes', 'notlar', 'aciklama', 'description', 'comment']
    };
    
    headers.forEach((header, index) => {
        if (!header) return;
        
        const headerNormalized = normalizeTurkish(header.toString().trim().toLowerCase());
        
        for (const [field, keywords] of Object.entries(columnKeywords)) {
            if (mapping[field] === -1) {
                for (const keyword of keywords) {
                    const keywordNormalized = normalizeTurkish(keyword);
                    if (headerNormalized === keywordNormalized || headerNormalized.includes(keywordNormalized)) {
                        mapping[field] = index;
                        break;
                    }
                }
            }
        }
    });
    
    return mapping;
}

function normalizeTurkish(text) {
    return text
        .toLowerCase()
        .replace(/ı/g, 'i')
        .replace(/ğ/g, 'g')
        .replace(/ü/g, 'u')
        .replace(/ş/g, 's')
        .replace(/ö/g, 'o')
        .replace(/ç/g, 'c')
        .replace(/İ/g, 'i')
        .replace(/Ğ/g, 'g')
        .replace(/Ü/g, 'u')
        .replace(/Ş/g, 's')
        .replace(/Ö/g, 'o')
        .replace(/Ç/g, 'c')
        .replace(/\s+/g, '')
        .replace(/\./g, '');
}

function getExcelCellValue(row, columnIndex) {
    if (columnIndex === -1 || columnIndex >= row.length) return '';
    const value = row[columnIndex];
    return value !== null && value !== undefined ? String(value).trim() : '';
}

function displayQCExcelImportPreview(reviews) {
    const previewDiv = document.getElementById('qc-excel-import-preview');
    const previewTbody = document.getElementById('qc-excel-preview-tbody');
    const importBtn = document.getElementById('import-qc-excel-btn');
    
    if (!previewDiv || !previewTbody) return;
    
    previewTbody.innerHTML = '';
    
    reviews.forEach((review, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${review.location || '-'}</td>
            <td>${review.quantity_inspected || '-'}</td>
            <td>${review.drawing_no || '-'}</td>
            <td>${review.position_no || '-'}</td>
            <td>${review.notes || '-'}</td>
            <td>
                <button type="button" class="btn btn-sm btn-outline-danger" onclick="deleteQCExcelPreviewItem(${index})">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        previewTbody.appendChild(row);
    });
    
    previewDiv.style.display = 'block';
    if (importBtn) {
        importBtn.style.display = 'inline-block';
    }
}

function deleteQCExcelPreviewItem(index) {
    if (!qcExcelImportData || !qcExcelImportData.processedReviews || 
        index < 0 || index >= qcExcelImportData.processedReviews.length) {
        return;
    }
    
    qcExcelImportData.processedReviews.splice(index, 1);
    displayQCExcelImportPreview(qcExcelImportData.processedReviews);
    
    if (qcExcelImportData.processedReviews.length === 0) {
        const previewDiv = document.getElementById('qc-excel-import-preview');
        const importBtn = document.getElementById('import-qc-excel-btn');
        if (previewDiv) previewDiv.style.display = 'none';
        if (importBtn) importBtn.style.display = 'none';
    }
}

function showQCExcelImportErrors(errors) {
    const errorContainer = document.getElementById('qc-excel-import-errors');
    if (!errorContainer) return;
    
    errorContainer.innerHTML = `
        <div class="alert alert-warning">
            <strong>Uyarılar:</strong>
            <ul class="mb-0">
                ${errors.map(err => `<li>${err}</li>`).join('')}
            </ul>
        </div>
    `;
    errorContainer.style.display = 'block';
}

function clearQCExcelImport() {
    document.getElementById('qc-excel-file-input').value = '';
    const previewDiv = document.getElementById('qc-excel-import-preview');
    const errorDiv = document.getElementById('qc-excel-import-errors');
    const importBtn = document.getElementById('import-qc-excel-btn');
    
    if (previewDiv) previewDiv.style.display = 'none';
    if (errorDiv) errorDiv.style.display = 'none';
    if (importBtn) importBtn.style.display = 'none';
    
    qcExcelImportData = null;
}

function importQCExcelReviews() {
    if (!qcExcelImportData || !qcExcelImportData.processedReviews) return;
    
    const container = window.currentQCReviewsContainer;
    const addReview = window.currentQCAddReview;
    
    if (!container || !addReview) {
        showNotification('İçe aktarma başarısız', 'error');
        return;
    }
    
    let addedCount = 0;
    
    qcExcelImportData.processedReviews.forEach(review => {
        addReview(review);
        addedCount++;
    });
    
    // Close the Excel import modal
    const excelModal = bootstrap.Modal.getInstance(document.getElementById('qc-excel-import-modal'));
    if (excelModal) {
        excelModal.hide();
    }
    
    // Clear import data
    clearQCExcelImport();
    
    showNotification(`${addedCount} inceleme başarıyla içe aktarıldı`, 'success');
}

// Make function globally available
window.deleteQCExcelPreviewItem = deleteQCExcelPreviewItem;
