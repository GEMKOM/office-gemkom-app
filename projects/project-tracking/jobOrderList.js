import { initNavbar } from '../../components/navbar.js';
import { ModernDropdown } from '../../components/dropdown/dropdown.js';
import { 
    listJobOrders, 
    getJobOrderByJobNo, 
    createJobOrder as createJobOrderAPI, 
    updateJobOrder as updateJobOrderAPI,
    startJobOrder as startJobOrderAPI,
    holdJobOrder as holdJobOrderAPI,
    resumeJobOrder as resumeJobOrderAPI,
    cancelJobOrder as cancelJobOrderAPI,
    recalculateJobOrderProgress,
    getStatusChoices,
    applyTemplateToJobOrder,
    getChildJobOrders,
    getJobOrderDepartmentTasks,
    getJobOrderChildren,
    getJobOrderFiles,
    STATUS_OPTIONS
} from '../../apis/projects/jobOrders.js';
import { createDepartmentTask, bulkCreateDepartmentTasks, patchDepartmentTask, getDepartmentChoices as getDepartmentTaskChoices, listDepartmentTasks } from '../../apis/projects/departmentTasks.js';
import { listTaskTemplates, getTaskTemplateById } from '../../apis/projects/taskTemplates.js';
import { listCustomers } from '../../apis/projects/customers.js';
import { CURRENCY_OPTIONS } from '../../apis/projects/customers.js';
import {
    listTopics,
    getTopic,
    createTopic,
    updateTopic,
    deleteTopic,
    getTopicComments,
    uploadTopicAttachment,
    createComment,
    updateComment,
    deleteComment,
    uploadCommentAttachment
} from '../../apis/projects/topics.js';
import { HeaderComponent } from '../../components/header/header.js';
import { FiltersComponent } from '../../components/filters/filters.js';
import { StatisticsCards } from '../../components/statistics-cards/statistics-cards.js';
import { TableComponent } from '../../components/table/table.js';
import { DisplayModal } from '../../components/display-modal/display-modal.js';
import { EditModal } from '../../components/edit-modal/edit-modal.js';
import { ConfirmationModal } from '../../components/confirmation-modal/confirmation-modal.js';
import { initRouteProtection } from '../../apis/routeProtection.js';
import { showNotification } from '../../components/notification/notification.js';
import { backendBase } from '../../base.js';
import { isAdmin, canViewCostTab } from '../../authService.js';
import { listDrawingReleases, getCurrentRelease, requestRevision } from '../../apis/projects/design.js';
import { fetchAllUsers } from '../../apis/users.js';
import { extractResultsFromResponse } from '../../apis/paginationHelper.js';
import { 
    fetchPriceTiers, 
    createPriceTier, 
    updatePriceTier, 
    deletePriceTier 
} from '../../apis/subcontracting/priceTiers.js';
import { listNCRs } from '../../apis/qualityControl.js';
import { getJobCostSummary } from '../../apis/projects/cost.js';

// State management
// Read initial page and page_size from URL
const urlParams = new URLSearchParams(window.location.search);
let currentPage = parseInt(urlParams.get('page')) || 1;
let currentPageSize = parseInt(urlParams.get('page_size')) || 100;
let currentOrdering = 'job_no'; // Default backend ordering
let currentSortField = 'job_no'; // Default sort field
let currentSortDirection = 'asc'; // Default sort direction
let jobOrders = [];
let totalJobOrders = 0;
let isLoading = false;
let jobOrdersStats = null; // Statistics Cards component instance
let jobOrderFilters = null; // Filters component instance
let jobOrdersTable = null; // Table component instance
let customers = []; // Store customers for dropdowns
let statusOptions = STATUS_OPTIONS; // Status options
let expandedRows = new Set(); // Track expanded rows by job_no
let childrenCache = new Map(); // Cache children data by parent job_no

// Configuration: Hide action buttons except detail button
// Set to true to hide all action buttons except the detail/view button
// Can be controlled via localStorage or URL parameter
let HIDE_ACTION_BUTTONS = localStorage.getItem('hideJobOrderActions') === 'true' || 
                          urlParams.get('hideActions') === 'true';

// Function to toggle action buttons visibility
function toggleActionButtons() {
    HIDE_ACTION_BUTTONS = !HIDE_ACTION_BUTTONS;
    localStorage.setItem('hideJobOrderActions', HIDE_ACTION_BUTTONS.toString());
    
    // Re-render the table to apply changes
    if (jobOrdersTable) {
        jobOrdersTable.render();
        // Re-setup both the toggle button and expand listeners after render
        setTimeout(() => {
            setupActionToggleButton();
            setupExpandButtonListeners();
        }, 50);
    }
}

// Helper function to check if user has planning team or superuser access
function canEditJobOrders() {
    try {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        return user.team === 'planning' || isAdmin();
    } catch (error) {
        console.warn('Failed to parse user data for permission check:', error);
        return false;
    }
}

// Helper function to check if user has planning or management access
function canViewSubcontracting() {
    try {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        return user.team === 'planning' || user.team === 'management' || isAdmin();
    } catch (error) {
        console.warn('Failed to parse user data for permission check:', error);
        return false;
    }
}

// Modal component instances
let createJobOrderModal = null;
let editJobOrderModal = null;
let deleteJobOrderModal = null;
let addDepartmentTaskModal = null;
let createDepartmentTaskModal = null;
let viewJobOrderModal = null;
let confirmationModal = null;
let requestRevisionModal = null;
let holdJobOrderModal = null;

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize route protection
    if (!initRouteProtection()) {
        return;
    }

    await initNavbar();
    
    // Initialize header component
    const header = new HeaderComponent({
        title: 'Proje Takibi',
        subtitle: 'İş emirleri ve proje durumu takibi',
        icon: 'project-diagram',
        showBackButton: 'block',
        showCreateButton: 'block',
        showBulkCreateButton: 'none',
        createButtonText: '      Yeni İş Emri',
        onBackClick: () => window.location.href = '/projects/',
        onCreateClick: () => showCreateJobOrderModal()
    });
    
    // Initialize Statistics Cards component
    jobOrdersStats = new StatisticsCards('job-orders-statistics', {
        cards: [
            { title: 'Toplam İş Emri', value: '0', icon: 'fas fa-tasks', color: 'primary', id: 'total-job-orders-count' },
            { title: 'Aktif', value: '0', icon: 'fas fa-play-circle', color: 'success', id: 'active-job-orders-count' },
            { title: 'Beklemede', value: '0', icon: 'fas fa-pause-circle', color: 'warning', id: 'on-hold-job-orders-count' },
            { title: 'Tamamlanan', value: '0', icon: 'fas fa-check-circle', color: 'info', id: 'completed-job-orders-count' }
        ],
        compact: true,
        animation: true
    });
    
    await initializeJobOrders();
    setupEventListeners();
});

async function initializeJobOrders() {
    try {
        // Load choices and customers
        await loadChoices();
        await loadCustomers();
        
        initializeFiltersComponent();
        initializeTableComponent();
        initializeModalComponents();
        
        // Setup expand button listeners (will be ready when table is rendered)
        setupExpandButtonListeners();
        
        // Check for deep-link parameters in URL to open modals directly
        const urlParams = new URLSearchParams(window.location.search);
        const jobNo = urlParams.get('job_no');
        const topicIdParam = urlParams.get('topic_id');
        
        if (jobNo) {
            // Open job order modal directly without loading other data first
            await viewJobOrder(jobNo);

            // If topic_id exists, open topic detail modal on top
            if (topicIdParam) {
                const topicId = parseInt(topicIdParam, 10);
                if (!Number.isNaN(topicId)) {
                    setTimeout(() => {
                        viewTopicDetail(topicId, jobNo);
                    }, 200);
                }
            }
            return;
        }

        if (topicIdParam) {
            // Open topic detail modal (and its job order) directly from email link
            const topicId = parseInt(topicIdParam, 10);
            if (!Number.isNaN(topicId)) {
                try {
                    const topic = await getTopic(topicId);
                    const inferredJobNo = topic.job_order || topic.job_order_no || null;

                    if (inferredJobNo) {
                        await viewJobOrder(inferredJobNo);
                        setTimeout(() => {
                            viewTopicDetail(topicId, inferredJobNo);
                        }, 200);
                        return;
                    }

                    // Fallback: show topic modal even if job order cannot be inferred
                    await viewTopicDetail(topicId, null);
                    return;
                } catch (error) {
                    console.error('Error opening topic from deep link:', error);
                    showNotification('Tartışma detayı açılırken hata oluştu', 'error');
                    // Fall through to normal load
                }
            }
        }

        // Setup URL handlers for pagination
        setupUrlHandlers();
        
        // Load page normally
        await loadJobOrders();
        updateJobOrderCounts();
    } catch (error) {
        console.error('Error initializing job orders:', error);
        showNotification('İş emirleri yüklenirken hata oluştu', 'error');
    }
}

// Setup URL handlers for pagination
function setupUrlHandlers() {
    // Handle browser back/forward buttons
    window.addEventListener('popstate', () => {
        // Reload job orders if page/page_size changed
        const urlParams = new URLSearchParams(window.location.search);
        const urlPage = parseInt(urlParams.get('page')) || 1;
        const urlPageSize = parseInt(urlParams.get('page_size')) || 100;
        if (urlPage !== currentPage || urlPageSize !== currentPageSize) {
            currentPage = urlPage;
            currentPageSize = urlPageSize;
            if (jobOrdersTable) {
                jobOrdersTable.options.itemsPerPage = currentPageSize;
            }
            loadJobOrders();
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

async function loadChoices() {
    try {
        const statuses = await getStatusChoices().catch(() => STATUS_OPTIONS);
        statusOptions = statuses;
    } catch (error) {
        console.error('Error loading choices:', error);
        // Use static fallbacks
        statusOptions = STATUS_OPTIONS;
    }
}

async function loadCustomers() {
    try {
        const response = await listCustomers({ page_size: 1000 });
        customers = response.results || [];
        
        // Update customer filter options
        if (jobOrderFilters && customers.length > 0) {
            const customerOptions = [
                { value: '', label: 'Tümü' },
                ...customers.map(c => ({ 
                    value: c.id.toString(), 
                    label: `${c.code} - ${c.name}` 
                }))
            ];
            jobOrderFilters.updateFilterOptions('customer-filter', customerOptions);
        }
    } catch (error) {
        console.error('Error loading customers:', error);
        customers = [];
    }
}

function initializeTableComponent() {
    jobOrdersTable = new TableComponent('job-orders-table-container', {
        title: 'İş Emri Listesi',
        rowAttributes: (row, rowIndex) => {
            const attributes = {};
            
            // Handle department tasks row
            if (row._isDepartmentTasksRow) {
                attributes.class = 'department-tasks-row';
                attributes['data-parent-job-no'] = row._parentJobNo;
                return attributes;
            }
            
            // Check target_completion_date for highlighting
            if (row.target_completion_date) {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                
                const completionDate = new Date(row.target_completion_date);
                completionDate.setHours(0, 0, 0, 0);
                
                const daysRemaining = Math.ceil((completionDate - today) / (1000 * 60 * 60 * 24));
                
                // Red: past due (earlier than today)
                if (completionDate < today) {
                    attributes.class = (attributes.class ? attributes.class + ' ' : '') + 'job-order-past-due';
                }
                // Yellow: 1 week or less remaining
                else if (daysRemaining <= 7 && daysRemaining >= 0) {
                    attributes.class = (attributes.class ? attributes.class + ' ' : '') + 'job-order-due-soon';
                }
            }
            
            return Object.keys(attributes).length > 0 ? attributes : null;
        },
        columns: [
            {
                field: '_expand',
                label: '',
                sortable: false,
                width: '80px',
                formatter: (value, row) => {
                    const hasChildren = row.children_count && row.children_count > 0;
                    const isExpanded = expandedRows.has(row.job_no);
                    
                    // Calculate hierarchy level (0 = root, 1 = child, 2 = grandchild, etc.)
                    const hierarchyLevel = row.hierarchy_level || 0;
                    
                    // Constants for consistent spacing
                    const LEVEL_WIDTH = 20; // Width per hierarchy level
                    const LINE_THICKNESS = 2; // Thickness of tree lines
                    const LINE_COLOR = '#cbd5e0';
                    const BUTTON_SIZE = 24;
                    
                    // Calculate positions
                    const buttonLeftPosition = hierarchyLevel * LEVEL_WIDTH;
                    
                    // Generate tree lines with absolute positioning for consistency
                    let treeLinesHtml = '';
                    if (hierarchyLevel > 0) {
                        for (let i = 0; i < hierarchyLevel; i++) {
                            const isLastLevel = i === hierarchyLevel - 1;
                            const lineLeft = i * LEVEL_WIDTH + (LEVEL_WIDTH / 2) - (LINE_THICKNESS / 2);
                            
                            if (!isLastLevel) {
                                // Vertical line through the level
                                treeLinesHtml += `
                                    <div style="
                                        position: absolute;
                                        left: ${lineLeft}px;
                                        top: 0;
                                        bottom: 0;
                                        width: ${LINE_THICKNESS}px;
                                        background: ${LINE_COLOR};
                                    "></div>
                                `;
                            } else {
                                // Last level: L-shaped connector
                                // Vertical line (top half)
                                treeLinesHtml += `
                                    <div style="
                                        position: absolute;
                                        left: ${lineLeft}px;
                                        top: 0;
                                        height: 50%;
                                        width: ${LINE_THICKNESS}px;
                                        background: ${LINE_COLOR};
                                    "></div>
                                `;
                                // Horizontal line
                                treeLinesHtml += `
                                    <div style="
                                        position: absolute;
                                        left: ${lineLeft}px;
                                        top: 50%;
                                        width: ${LEVEL_WIDTH / 2}px;
                                        height: ${LINE_THICKNESS}px;
                                        background: ${LINE_COLOR};
                                        transform: translateY(-50%);
                                    "></div>
                                `;
                            }
                        }
                    }
                    
                    // Expand/collapse button for rows with children
                    let expandButton = '';
                    if (hasChildren) {
                        const expandIcon = isExpanded ? 'fa-minus' : 'fa-plus';
                        const buttonClass = isExpanded ? 'expanded' : 'collapsed';
                        expandButton = `
                            <button type="button" 
                                    class="btn btn-sm expand-toggle-btn ${buttonClass}" 
                                    data-job-no="${row.job_no}"
                                    style="
                                        position: absolute;
                                        left: ${buttonLeftPosition}px;
                                        top: 50%;
                                        transform: translateY(-50%);
                                        width: ${BUTTON_SIZE}px;
                                        height: ${BUTTON_SIZE}px;
                                        padding: 0;
                                        border-radius: 4px;
                                        border: 1.5px solid #0d6efd;
                                        background: ${isExpanded ? '#0d6efd' : '#ffffff'};
                                        color: ${isExpanded ? '#ffffff' : '#0d6efd'};
                                        display: inline-flex;
                                        align-items: center;
                                        justify-content: center;
                                        transition: all 0.2s ease;
                                        cursor: pointer;
                                        z-index: 1;
                                    "
                                    onmouseover="this.style.transform='translateY(-50%) scale(1.1)'; this.style.boxShadow='0 2px 4px rgba(13,110,253,0.3)';"
                                    onmouseout="this.style.transform='translateY(-50%) scale(1)'; this.style.boxShadow='none';"
                                    title="${isExpanded ? 'Daralt' : 'Genişlet'}">
                                <i class="fas ${expandIcon}" style="font-size: 10px;"></i>
                            </button>
                        `;
                    }
                    
                    return `
                        <div style="
                            position: relative;
                            width: 100%;
                            height: 40px;
                            min-height: 40px;
                        ">
                            ${treeLinesHtml}
                            ${expandButton}
                        </div>
                    `;
                }
            },
            {
                field: 'job_no',
                label: 'İş Emri No',
                sortable: true,
                width: '160px',
                formatter: (value, row) => {
                    if (row._isDepartmentTasksRow) return '';
                    
                    const isChild = !!row.parent;
                    const hierarchyLevel = row.hierarchy_level || (isChild ? 1 : 0);
                    
                    if (!value) return '-';
                    
                    // Badge-style styling for job number (similar to talep_no in purchase requests)
                    if (hierarchyLevel > 0) {
                        // Child jobs - subtle badge styling
                        return `<span style="font-weight: 600; color: #6c757d; font-family: 'Courier New', monospace; font-size: 0.9rem; background: rgba(108, 117, 125, 0.1); padding: 0.25rem 0.5rem; border-radius: 4px; border: 1px solid rgba(108, 117, 125, 0.2);">${value}</span>`;
                    } else {
                        // Root jobs - prominent badge styling
                        return `<span style="font-weight: 700; color: #0d6efd; font-family: 'Courier New', monospace; font-size: 1rem; background: rgba(13, 110, 253, 0.1); padding: 0.25rem 0.5rem; border-radius: 4px; border: 1px solid rgba(13, 110, 253, 0.2);">${value}</span>`;
                    }
                }
            },
            {
                field: 'title',
                label: 'Başlık',
                sortable: true,
                formatter: (value, row) => {
                    if (row._isDepartmentTasksRow) return '';
                    if (!value) return '-';
                    
                    const hierarchyLevel = row.hierarchy_level || 0;
                    
                    // Enhanced title display with hierarchy awareness
                    if (hierarchyLevel > 0) {
                        return `
                            <div style="
                                color: #495057;
                                font-weight: 500;
                                font-size: 0.9rem;
                                line-height: 1.4;
                            ">${value}</div>
                        `;
                    } else {
                        return `
                            <div style="
                                color: #212529;
                                font-weight: 600;
                                font-size: 0.95rem;
                                line-height: 1.5;
                            ">${value}</div>
                        `;
                    }
                }
            },
            {
                field: 'customer_name',
                label: 'Müşteri',
                sortable: false,
                width: '220px',
                formatter: (value, row) => {
                    if (row._isDepartmentTasksRow) return '';
                    
                    const customerDisplayName = row.customer_short_name || row.customer_name || value;
                    
                    if (!customerDisplayName) return '-';
                    
                    return `<span class="status-badge status-grey">${customerDisplayName}</span>`;
                }
            },
            {
                field: 'quantity',
                label: 'Miktar',
                sortable: true,
                formatter: (value, row) => {
                    if (row._isDepartmentTasksRow) return '';
                    return value || value === 0 ? value : '-';
                }
            },
            {
                field: 'status_display',
                label: 'Durum',
                sortable: true,
                formatter: (value, row) => {
                    if (row._isDepartmentTasksRow) return '';
                    const status = row.status;
                    if (status === 'active') {
                        return '<span class="status-badge status-blue">Aktif</span>';
                    } else if (status === 'draft') {
                        return '<span class="status-badge status-grey">Taslak</span>';
                    } else if (status === 'on_hold') {
                        return '<span class="status-badge status-yellow">Beklemede</span>';
                    } else if (status === 'completed') {
                        return '<span class="status-badge status-green">Tamamlandı</span>';
                    } else if (status === 'cancelled') {
                        return '<span class="status-badge status-red">İptal Edildi</span>';
                    }
                    return value || '-';
                }
            },
            {
                field: 'target_completion_date',
                label: 'Hedef Tamamlanma',
                sortable: true,
                type: 'date',
                formatter: (value, row) => {
                    if (row._isDepartmentTasksRow) return '';
                    if (!value) return '-';
                    const date = new Date(value);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const completionDate = new Date(date);
                    completionDate.setHours(0, 0, 0, 0);
                    const daysRemaining = Math.ceil((completionDate - today) / (1000 * 60 * 60 * 24));
                    
                    const formattedDate = date.toLocaleDateString('tr-TR', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                    });
                    
                    // Color code based on urgency
                    // Use darker colors for better contrast, especially on yellow backgrounds
                    let dateClass = 'text-muted';
                    let fontWeight = '500';
                    if (completionDate < today) {
                        dateClass = 'text-danger';
                        fontWeight = '700';
                    } else if (daysRemaining <= 7) {
                        // Use dark brown/black for yellow background rows for better visibility
                        dateClass = '';
                        fontWeight = '700';
                        return `<span style="color: #92400e; font-size: 0.875rem; font-weight: ${fontWeight};">${formattedDate}</span>`;
                    } else {
                        dateClass = 'text-dark';
                    }
                    
                    return `<span class="${dateClass}" style="font-size: 0.875rem; font-weight: ${fontWeight};">${formattedDate}</span>`;
                }
            },
            {
                field: 'completion_percentage',
                label: 'Tamamlanma',
                sortable: false,
                width: '300px',
                headerClass: 'completion-percentage-header',
                formatter: (value) => {
                    if (!value && value !== 0) return '-';
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
                    
                    // Text color always black for visibility
                    const textColor = '#000000';
                    
                    return `
                        <div style="position: relative; width: 100%; padding: 4px 0;">
                            <div class="progress" style="height: 28px; border-radius: 6px; background-color: #e5e7eb; 
                                                         box-shadow: inset 0 1px 2px rgba(0,0,0,0.1); overflow: hidden;">
                                <div class="progress-bar ${colorClass}" 
                                     role="progressbar" 
                                     style="width: ${percentage}%; 
                                            background: linear-gradient(90deg, ${barColor} 0%, ${barColor}dd 100%);
                                            border-radius: 6px;
                                            transition: width 0.6s ease;
                                            box-shadow: 0 1px 3px rgba(0,0,0,0.15);
                                            position: relative;
                                            overflow: hidden;" 
                                     aria-valuenow="${percentage}" 
                                     aria-valuemin="0" 
                                     aria-valuemax="100">
                                    <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0;
                                                background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.25) 50%, transparent 100%);
                                                animation: shimmer 3s infinite;
                                                pointer-events: none;"></div>
                                </div>
                            </div>
                            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); 
                                        font-weight: 600; font-size: 0.8rem; color: ${textColor}; 
                                        pointer-events: none; white-space: nowrap; z-index: 2;">
                                ${percentage.toFixed(1)}%
                            </div>
                        </div>
                    `;
                }
            },
            {
                field: 'ncr_count',
                label: 'NCR Sayısı',
                sortable: false,
                formatter: (value, row) => {
                    if (row._isDepartmentTasksRow) return '';
                    if (!value || value === 0) return '-';
                    return `<span class="status-badge status-grey">${value}</span>`;
                }
            },
            {
                field: 'created_at',
                label: 'Oluşturulma',
                sortable: true,
                type: 'date',
                formatter: (value, row) => {
                    if (row._isDepartmentTasksRow) return '';
                    if (!value) return '-';
                    const date = new Date(value);
                    const formattedDate = date.toLocaleDateString('tr-TR', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                    });
                    return `<span class="text-dark" style="font-size: 0.875rem; font-weight: 500;">${formattedDate}</span>`;
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
            updateUrlParams({ page: 1 });
            await loadJobOrders();
        },
        onExport: async (format) => {
            await exportJobOrders(format);
        },
        onSort: async (field, direction) => {
            currentPage = 1;
            currentSortField = field;
            currentSortDirection = direction;
            await loadJobOrders();
        },
        onPageSizeChange: async (newPageSize) => {
            if (jobOrdersTable) {
                jobOrdersTable.options.itemsPerPage = newPageSize;
            }
            currentPage = 1;
            currentPageSize = newPageSize;
            updateUrlParams({ page: 1, page_size: newPageSize });
            await loadJobOrders();
        },
        onPageChange: async (page) => {
            currentPage = page;
            updateUrlParams({ page: page });
            await loadJobOrders();
        },
        actions: [
            {
                key: 'edit',
                label: 'Düzenle',
                icon: 'fas fa-edit',
                class: 'btn-outline-primary',
                onClick: (row) => {
                    editJobOrder(row.job_no);
                },
                visible: (row) => !HIDE_ACTION_BUTTONS && canEditJobOrders() && row.status !== 'completed' && row.status !== 'cancelled'
            },
            {
                key: 'view',
                label: 'Detay',
                icon: 'fas fa-eye',
                class: 'btn-outline-info',
                onClick: (row) => {
                    viewJobOrder(row.job_no);
                },
                visible: () => true // Always show detail button
            },
            {
                key: 'create-child',
                label: 'Alt İş Oluştur',
                icon: 'fas fa-plus-circle',
                class: 'btn-outline-success',
                onClick: (row) => {
                    showCreateChildJobOrderModal(row.job_no);
                },
                visible: (row) => !HIDE_ACTION_BUTTONS && canEditJobOrders() && row.status !== 'completed' && row.status !== 'cancelled'
            },
            {
                key: 'add-department-task',
                label: 'Görev Ekle',
                icon: 'fas fa-tasks',
                class: 'btn-outline-primary',
                onClick: (row) => {
                    showAddDepartmentTaskModal(row.job_no);
                },
                visible: (row) => !HIDE_ACTION_BUTTONS && canEditJobOrders() && row.status !== 'completed' && row.status !== 'cancelled'
            },
            {
                key: 'start',
                label: 'Başlat',
                icon: 'fas fa-play',
                class: 'btn-outline-success',
                onClick: (row) => {
                    startJobOrder(row.job_no);
                },
                visible: (row) => !HIDE_ACTION_BUTTONS && row.status === 'draft'
            },
            {
                key: 'hold',
                label: 'Beklet',
                icon: 'fas fa-pause',
                class: 'btn-outline-warning',
                onClick: (row) => {
                    holdJobOrder(row.job_no);
                },
                visible: (row) => !HIDE_ACTION_BUTTONS && canEditJobOrders() && row.status === 'active'
            },
            {
                key: 'resume',
                label: 'Devam Et',
                icon: 'fas fa-play-circle',
                class: 'btn-outline-info',
                onClick: (row) => {
                    resumeJobOrder(row.job_no);
                },
                visible: (row) => !HIDE_ACTION_BUTTONS && row.status === 'on_hold'
            },
            {
                key: 'cancel',
                label: 'İptal Et',
                icon: 'fas fa-times',
                class: 'btn-outline-danger',
                onClick: (row) => {
                    cancelJobOrder(row.job_no);
                },
                visible: (row) => !HIDE_ACTION_BUTTONS && canEditJobOrders() && row.status !== 'completed' && row.status !== 'cancelled'
            },
            {
                key: 'recalculate-progress',
                label: 'İlerlemeyi Yeniden Hesapla',
                icon: 'fas fa-calculator',
                class: 'btn-outline-info',
                onClick: (row) => {
                    recalculateProgress(row.job_no);
                },
                visible: (row) => !HIDE_ACTION_BUTTONS && canEditJobOrders() && row.status !== 'cancelled'
            }
        ],
        emptyMessage: 'İş emri bulunamadı',
        emptyIcon: 'fas fa-tasks'
    });
    
    // Add toggle button for action buttons visibility
    setupActionToggleButton();
}

// Setup toggle button for action buttons
function setupActionToggleButton() {
    // Wait for table to render, then add the button
    const trySetup = () => {
        const tableContainer = document.getElementById('job-orders-table-container');
        if (!tableContainer) {
            setTimeout(trySetup, 100);
            return;
        }
        
        const cardHeader = tableContainer.querySelector('.card-header');
        if (!cardHeader) {
            setTimeout(trySetup, 100);
            return;
        }
        
        const cardActions = cardHeader.querySelector('.card-actions');
        if (!cardActions) {
            setTimeout(trySetup, 100);
            return;
        }
        
        // Remove existing button if it exists (to ensure it's in the right place after re-render)
        const existingBtn = document.getElementById('toggle-actions-btn');
        if (existingBtn) {
            existingBtn.remove();
        }
        
        // Create toggle button
        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'toggle-actions-btn';
        toggleBtn.className = 'btn btn-sm btn-outline-secondary';
        toggleBtn.innerHTML = `
            <i class="fas ${HIDE_ACTION_BUTTONS ? 'fa-eye' : 'fa-eye-slash'} me-1"></i>
            <span>${HIDE_ACTION_BUTTONS ? 'Aksiyonları Göster' : 'Aksiyonları Gizle'}</span>
        `;
        toggleBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleActionButtons();
        };
        
        // Insert before other buttons
        cardActions.insertBefore(toggleBtn, cardActions.firstChild);
    };
    
    trySetup();
}

function initializeFiltersComponent() {
    // Initialize filters component
    jobOrderFilters = new FiltersComponent('filters-placeholder', {
        title: 'İş Emri Filtreleri',
        onApply: (values) => {
            currentPage = 1;
            loadJobOrders();
        },
        onClear: () => {
            currentPage = 1;
            loadJobOrders();
        },
        onFilterChange: (filterId, value) => {
            // Optional: Handle individual filter changes
        }
    });

    // Add text filters
    jobOrderFilters.addTextFilter({
        id: 'search-filter',
        label: 'Arama',
        placeholder: 'İş emri no, başlık, açıklama, müşteri',
        colSize: 3
    });

    // Add dropdown filters
    jobOrderFilters.addDropdownFilter({
        id: 'status-filter',
        label: 'Durum',
        options: [
            { value: '', label: 'Tümü' },
            ...statusOptions.map(s => ({ value: s.value, label: s.label }))
        ],
        placeholder: 'Tümü',
        colSize: 2
    });


    // Customer filter - will be updated after customers load
    jobOrderFilters.addDropdownFilter({
        id: 'customer-filter',
        label: 'Müşteri',
        options: [
            { value: '', label: 'Tümü' },
            ...(customers.length > 0 ? customers.map(c => ({ 
                value: c.id.toString(), 
                label: `${c.code} - ${c.name}` 
            })) : [])
        ],
        placeholder: 'Tümü',
        colSize: 2
    });

    jobOrderFilters.addCheckboxFilter({
        id: 'root-only-filter',
        label: 'Tüm İşler (Ana + Alt)',
        checked: false,
        colSize: 2,
        helpText: 'İşaretlenirse ana ve alt işler birlikte gösterilir'
    });
}

// Initialize modal components
function initializeModalComponents() {
    // Create Job Order Modal
    createJobOrderModal = new EditModal('create-job-order-modal-container', {
        title: 'Yeni İş Emri Oluştur',
        icon: 'fas fa-plus-circle',
        size: 'lg',
        showEditButton: false
    });

    // Edit Job Order Modal
    editJobOrderModal = new EditModal('edit-job-order-modal-container', {
        title: 'İş Emri Düzenle',
        icon: 'fas fa-edit',
        size: 'lg',
        showEditButton: false
    });

    // Delete Job Order Modal
    deleteJobOrderModal = new DisplayModal('delete-job-order-modal-container', {
        title: 'İş Emri Silme Onayı',
        icon: 'fas fa-exclamation-triangle',
        size: 'md',
        showEditButton: false
    });

    // Add Department Task Modal (selection modal)
    addDepartmentTaskModal = new EditModal('add-department-task-modal-container', {
        title: 'Departman Görevi Ekle',
        icon: 'fas fa-tasks',
        size: 'xl',
        showEditButton: false
    });

    // Create Department Task Modal (manual creation)
    createDepartmentTaskModal = new EditModal('create-department-task-modal-container', {
        title: 'Yeni Departman Görevi Oluştur',
        icon: 'fas fa-plus-circle',
        size: 'lg',
        showEditButton: false
    });

    // View Job Order Modal
    viewJobOrderModal = new DisplayModal('view-job-order-modal-container', {
        title: 'İş Emri Detayları',
        icon: 'fas fa-info-circle',
        size: 'xl',
        fullscreen: true,
        showEditButton: false
    });

    // Confirmation Modal
    confirmationModal = new ConfirmationModal('confirmation-modal-container', {
        title: 'Onay',
        icon: 'fas fa-exclamation-triangle',
        confirmText: 'Evet',
        cancelText: 'İptal',
        confirmButtonClass: 'btn-primary'
    });

    // Request Revision Modal
    requestRevisionModal = new EditModal('request-revision-modal-container', {
        title: 'Revizyon İste',
        icon: 'fas fa-edit',
        size: 'lg',
        showEditButton: false
    });

    // Hold Job Order Modal
    holdJobOrderModal = new EditModal('hold-job-order-modal-container', {
        title: 'İş Emrini Beklet',
        icon: 'fas fa-pause',
        size: 'md',
        showEditButton: false,
        saveButtonText: 'Beklet'
    });

    requestRevisionModal.onSaveCallback(async (formData) => {
        const releaseId = window.pendingRevisionReleaseId;
        if (!releaseId) return;

        try {
            if (!formData.reason || !formData.reason.trim()) {
                showNotification('Revizyon nedeni gereklidir', 'error');
                return;
            }

            await requestRevision(releaseId, {
                reason: formData.reason.trim()
            });

            showNotification('Revizyon isteği gönderildi', 'success');
            requestRevisionModal.hide();
            window.pendingRevisionReleaseId = null;
            
            // Reload drawing releases tab
            const jobNo = window.pendingRevisionJobNo;
            if (jobNo) {
                // Clear cache and reload
                jobOrderTabCache.drawingReleases = null;
                jobOrderTabCache.currentRelease = null;
                jobOrderTabCache.drawingReleasesJobNo = null;
                await loadDrawingReleasesTab(jobNo);
            }
        } catch (error) {
            console.error('Error requesting revision:', error);
            let errorMessage = 'Revizyon isteği gönderilirken hata oluştu';
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

    // Set up close callback to clean up URL and clear cache
    viewJobOrderModal.onCloseCallback(() => {
        // Clear tab cache when modal closes
        jobOrderTabCache = {
            jobNo: null,
            jobOrder: null,
            departmentTasks: null,
            children: null,
            files: null,
            topics: null,
            drawingReleases: null,
            currentRelease: null,
            drawingReleasesJobNo: null,
            ncrs: null,
            costSummary: null
        };
        
        // Remove deep-link parameters from URL
        const url = new URL(window.location);
        url.searchParams.delete('job_no');
        url.searchParams.delete('topic_id');
        window.history.replaceState({}, '', url);
        
        // Load the page properly after modal is closed
        loadJobOrders();
        updateJobOrderCounts();
    });

    // Set up modal callbacks
    setupModalCallbacks();
}

// Set up modal callbacks
function setupModalCallbacks() {
    // Create job order modal callbacks
    createJobOrderModal.onSaveCallback(async (formData) => {
        await createJobOrder(formData);
    });

    // Edit job order modal callbacks
    editJobOrderModal.onSaveCallback(async (formData) => {
        await updateJobOrder(formData);
    });

    // Delete job order modal callbacks
    deleteJobOrderModal.onCloseCallback(() => {
        window.pendingDeleteJobOrderNo = null;
    });
}

async function loadJobOrders() {
    try {
        if (isLoading) return;
        
        isLoading = true;
        if (jobOrdersTable) {
            jobOrdersTable.setLoading(true);
        }
        
        // Get filter values
        const filterValues = jobOrderFilters ? jobOrderFilters.getFilterValues() : {};
        
        // Build query options
        const options = {
            page: currentPage,
            page_size: currentPageSize,
            ordering: currentSortDirection === 'asc' ? currentSortField : `-${currentSortField}`
        };
        
        // Add filters
        if (filterValues['search-filter']) {
            options.search = filterValues['search-filter'];
        }
        if (filterValues['status-filter']) {
            options.status = filterValues['status-filter'];
        }
        if (filterValues['customer-filter']) {
            options.customer = parseInt(filterValues['customer-filter']);
        }
        
        // Always use root_only=true initially (unless explicitly filtered)
        // Checkbox label: "Tüm İşler (Ana + Alt)" - when checked, show all orders
        // Note: checkbox returns true when checked, false/undefined when unchecked
        const showAllOrders = filterValues['root-only-filter'] === true || filterValues['root-only-filter'] === 'true';
        
        if (showAllOrders) {
            // User checked the filter to show all orders (root + children)
            delete options.root_only;
        } else {
            // Default: show only root orders
            options.root_only = true;
        }
        
        // Clear caches so we always show fresh data (multi-user safe)
        childrenCache.clear();
        expandedRows.clear();
        
        // Call API
        const response = await listJobOrders(options);
        
        // Extract job orders and total count from response
        let rootOrders = response.results || [];
        totalJobOrders = response.count || 0;
        
        // Only merge expanded children if we're showing root-only orders
        // If showing all orders, children are already in the list
        if (!showAllOrders) {
            jobOrders = mergeExpandedChildren(rootOrders);
        } else {
            jobOrders = rootOrders;
        }
        
        // Update table data with pagination info
        if (jobOrdersTable) {
            jobOrdersTable.updateData(jobOrders, totalJobOrders, currentPage);
            // Setup expand button listeners after table is updated
            // Use setTimeout to ensure DOM is fully rendered
            setTimeout(() => {
                setupExpandButtonListeners();
                setupActionToggleButton(); // Setup toggle button after table renders
            }, 50);
        } else {
            console.warn('jobOrdersTable is null, cannot update data');
        }
        
        updateJobOrderCounts();
        
    } catch (error) {
        console.error('Error loading job orders:', error);
        showNotification('İş emirleri yüklenirken hata oluştu', 'error');
        jobOrders = [];
        totalJobOrders = 0;
        if (jobOrdersTable) {
            jobOrdersTable.updateData([], 0, currentPage);
        }
    } finally {
        isLoading = false;
        if (jobOrdersTable) {
            jobOrdersTable.setLoading(false);
        }
    }
}

// Merge expanded children into the job orders array (recursive for nested children)
function mergeExpandedChildren(rootOrders, level = 0) {
    const merged = [];
    
    rootOrders.forEach(rootOrder => {
        // Set hierarchy level
        rootOrder.hierarchy_level = level;
        merged.push(rootOrder);
        
        // If this row is expanded, add its children
        if (expandedRows.has(rootOrder.job_no)) {
            const children = childrenCache.get(rootOrder.job_no) || [];
            // Recursively merge children (for grandchildren, etc.)
            const childRows = mergeExpandedChildren(children, level + 1);
            merged.push(...childRows);
        }
    });
    
    return merged;
}

// Update table data without showing loading state (for expand/collapse operations)
function updateTableDataOnly() {
    if (!jobOrdersTable) return;
    
    // Get filter values to determine if we should show all orders
    const filterValues = jobOrderFilters ? jobOrderFilters.getFilterValues() : {};
    const showAllOrders = filterValues['root-only-filter'] === true || filterValues['root-only-filter'] === 'true';
    
    let dataToDisplay;
    if (showAllOrders) {
        // If showing all orders, use current jobOrders as-is
        dataToDisplay = jobOrders;
    } else {
        // Derive root orders from current jobOrders and merge expanded children
        const rootOrders = jobOrders.filter(j => !j.parent);
        dataToDisplay = mergeExpandedChildren(rootOrders);
    }
    
    // Update table data without loading state
    jobOrdersTable.updateData(dataToDisplay, totalJobOrders, currentPage);
    
    // Setup both expand button listeners and toggle button after table is updated
    setTimeout(() => {
        setupExpandButtonListeners();
        setupActionToggleButton();
    }, 50);
}

// Setup event listeners for expand/collapse buttons using event delegation
// Use a persistent container that doesn't get recreated
let expandButtonHandler = null;

function setupExpandButtonListeners() {
    if (!jobOrdersTable || !jobOrdersTable.container) {
        // Table not ready yet, try again later
        setTimeout(setupExpandButtonListeners, 100);
        return;
    }
    
    // Remove existing handler if any
    if (expandButtonHandler) {
        jobOrdersTable.container.removeEventListener('click', expandButtonHandler);
    }
    
    // Create the handler function
    expandButtonHandler = async (e) => {
        // Check if the clicked element is an expand button or inside one
        // This handles clicks on both the button and the icon inside it
        const expandButton = e.target.closest('.expand-toggle-btn');
        if (!expandButton) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        const jobNo = expandButton.getAttribute('data-job-no');
        if (!jobNo) {
            console.warn('Expand button missing data-job-no attribute');
            return;
        }
        
        const isExpanded = expandedRows.has(jobNo);
        
        if (isExpanded) {
            // Collapse: remove from expanded set
            expandedRows.delete(jobNo);
            // Update table without loading state
            updateTableDataOnly();
        } else {
            // Expand: always fetch children to get latest updates
            try {
                // Show loading state on button
                const icon = expandButton.querySelector('i');
                if (icon) {
                    icon.className = 'fas fa-spinner fa-spin text-primary';
                }
                
                await fetchJobOrderChildren(jobNo);
                
                expandedRows.add(jobNo);
                // Update table without loading state
                updateTableDataOnly();
            } catch (error) {
                console.error(`Error fetching children for ${jobNo}:`, error);
                showNotification('Alt işler yüklenirken hata oluştu', 'error');
                // Restore icon on error
                const icon = expandButton.querySelector('i');
                if (icon) {
                    icon.className = 'fas fa-chevron-right text-primary';
                }
                return;
            }
        }
    };
    
    // Attach the event listener to the container (which persists across renders)
    jobOrdersTable.container.addEventListener('click', expandButtonHandler);
}

// Fetch children for a specific job order
async function fetchJobOrderChildren(jobNo) {
    try {
        const jobOrder = await getJobOrderByJobNo(jobNo);
        
        // The API should return children in the response
        // If children are in a 'children' field, use that
        if (jobOrder.children && Array.isArray(jobOrder.children)) {
            childrenCache.set(jobNo, jobOrder.children);
        } else {
            // If no children field, return empty array
            childrenCache.set(jobNo, []);
        }
    } catch (error) {
        console.error(`Error fetching job order ${jobNo}:`, error);
        childrenCache.set(jobNo, []);
        throw error;
    }
}

function updateJobOrderCounts() {
    try {
        const totalCount = totalJobOrders;
        const activeCount = jobOrders.filter(j => j.status === 'active').length;
        const onHoldCount = jobOrders.filter(j => j.status === 'on_hold').length;
        const completedCount = jobOrders.filter(j => j.status === 'completed').length;
        
        // Update statistics cards using the component
        if (jobOrdersStats) {
            jobOrdersStats.updateValues({
                0: totalCount.toString(),
                1: activeCount.toString(),
                2: onHoldCount.toString(),
                3: completedCount.toString()
            });
        }
    } catch (error) {
        console.error('Error updating job order counts:', error);
    }
}

function setupEventListeners() {
    // Event listeners for workflow actions are handled in the table actions
    // Expand button listeners are set up in loadJobOrders after table update
}

// Global functions for actions

window.editJobOrder = async function(jobNo) {
    if (!jobNo || jobNo === '') {
        showNotification('Geçersiz iş emri numarası', 'error');
        return;
    }
    
    try {
        const jobOrder = await getJobOrderByJobNo(jobNo);
        
        if (!jobOrder) {
            showNotification('İş emri bulunamadı', 'error');
            return;
        }
        
        // Store the job order number for update
        window.editingJobOrderNo = jobNo;
        
        // Clear and configure the edit modal
        editJobOrderModal.clearAll();
        
        // Add Basic Information section
        editJobOrderModal.addSection({
            title: 'Temel Bilgiler',
            icon: 'fas fa-info-circle',
            iconColor: 'text-primary'
        });

        editJobOrderModal.addField({
            id: 'job_no',
            name: 'job_no',
            label: 'İş Emri No',
            type: 'text',
            value: jobOrder.job_no || '',
            required: true,
            icon: 'fas fa-barcode',
            colSize: 6,
            helpText: 'Benzersiz iş emri numarası',
            disabled: true // Cannot change job_no
        });

        editJobOrderModal.addField({
            id: 'title',
            name: 'title',
            label: 'Başlık',
            type: 'text',
            value: jobOrder.title || '',
            required: true,
            icon: 'fas fa-heading',
            colSize: 6,
            helpText: 'İş emri başlığı'
        });

        editJobOrderModal.addField({
            id: 'description',
            name: 'description',
            label: 'Açıklama',
            type: 'textarea',
            value: jobOrder.description || '',
            icon: 'fas fa-align-left',
            colSize: 12,
            helpText: 'Detaylı açıklama'
        });

        // Add Customer Information section
        editJobOrderModal.addSection({
            title: 'Müşteri Bilgileri',
            icon: 'fas fa-building',
            iconColor: 'text-success'
        });

        editJobOrderModal.addField({
            id: 'customer',
            name: 'customer',
            label: 'Müşteri',
            type: 'dropdown',
            value: jobOrder.customer ? jobOrder.customer.toString() : '',
            required: !jobOrder.parent, // Required unless it's a child job
            icon: 'fas fa-users',
            colSize: 6,
            helpText: 'Müşteri seçin',
            options: customers.map(c => ({
                value: c.id.toString(),
                label: `${c.code} - ${c.name}`
            })),
            disabled: !!jobOrder.parent // Cannot change customer for child jobs
        });

        editJobOrderModal.addField({
            id: 'customer_order_no',
            name: 'customer_order_no',
            label: 'Müşteri Sipariş No',
            type: 'text',
            value: jobOrder.customer_order_no || '',
            icon: 'fas fa-file-invoice',
            colSize: 6,
            helpText: 'Müşteri sipariş numarası'
        });

        editJobOrderModal.addField({
            id: 'quantity',
            name: 'quantity',
            label: 'Miktar',
            type: 'number',
            value: jobOrder.quantity || jobOrder.quantity === 0 ? jobOrder.quantity : '1',
            icon: 'fas fa-hashtag',
            colSize: 6,
            helpText: 'İş emri miktarı',
            min: 1,
            step: 1
        });

        editJobOrderModal.addField({
            id: 'incoterms',
            name: 'incoterms',
            label: 'Teslim Şekli',
            type: 'text',
            value: jobOrder.incoterms || '',
            icon: 'fas fa-globe',
            colSize: 6,
            helpText: 'Teslim şekli bilgisi'
        });

        // Add Dates section
        editJobOrderModal.addSection({
            title: 'Tarihler',
            icon: 'fas fa-calendar-alt',
            iconColor: 'text-info'
        });

        editJobOrderModal.addField({
            id: 'target_completion_date',
            name: 'target_completion_date',
            label: 'Hedef Tamamlanma Tarihi',
            type: 'date',
            value: jobOrder.target_completion_date ? jobOrder.target_completion_date.split('T')[0] : '',
            icon: 'fas fa-calendar-check',
            colSize: 6,
            helpText: 'Hedef tamamlanma tarihi'
        });

        // Add Cost Information section
        editJobOrderModal.addSection({
            title: 'Maliyet Bilgileri',
            icon: 'fas fa-dollar-sign',
            iconColor: 'text-warning'
        });

        editJobOrderModal.addField({
            id: 'estimated_cost',
            name: 'estimated_cost',
            label: 'Tahmini Maliyet',
            type: 'number',
            value: jobOrder.estimated_cost || '',
            icon: 'fas fa-calculator',
            colSize: 12,
            helpText: 'Tahmini maliyet'
        });

        editJobOrderModal.addField({
            id: 'general_expenses_rate',
            name: 'general_expenses_rate',
            label: 'Genel Gider Oranı',
            type: 'number',
            value: jobOrder.general_expenses_rate ?? '',
            icon: 'fas fa-percent',
            colSize: 12,
            required: true,
            step: '0.0001',
            placeholder: '0.0000',
            helpText: 'Genel gider oranı (zorunlu)'
        });

        // Render and show modal
        editJobOrderModal.render();
        editJobOrderModal.show();
    } catch (error) {
        console.error('Error loading job order for edit:', error);
        showNotification('İş emri bilgileri yüklenirken hata oluştu', 'error');
    }
};

// Cache for tab data (cleared when modal closes)
let jobOrderTabCache = {
    jobNo: null,
    jobOrder: null,
    departmentTasks: null,
    children: null,
    files: null,
    topics: null,
    drawingReleases: null,
    currentRelease: null,
    drawingReleasesJobNo: null,
    ncrs: null,
    costSummary: null
};

window.viewJobOrder = async function(jobNo) {
    try {
        // Clear cache for new job order
        jobOrderTabCache = {
            jobNo: jobNo,
            jobOrder: null,
            departmentTasks: null,
            children: null,
            files: null,
            topics: null,
            drawingReleases: null,
            currentRelease: null,
            drawingReleasesJobNo: null,
            ncrs: null,
            costSummary: null
        };
        
        // Fetch only basic job order data
        const jobOrder = await getJobOrderByJobNo(jobNo);
        jobOrderTabCache.jobOrder = jobOrder;
        
        // Clear and configure the view modal
        viewJobOrderModal.clearData();
        viewJobOrderModal.setTitle(`İş Emri Detayları: ${jobOrder.job_no}`);
        
        // Helper functions for badge classes
        const getStatusBadgeClass = (status) => {
            switch (status) {
                case 'active': return 'status-blue';
                case 'draft': return 'status-grey';
                case 'on_hold': return 'status-yellow';
                case 'completed': return 'status-green';
                case 'cancelled': return 'status-red';
                default: return 'status-grey';
            }
        };
        
        // Format date helper
        const formatDate = (dateString) => {
            if (!dateString) return '-';
            const date = new Date(dateString);
            return date.toLocaleDateString('tr-TR', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        };
        
        const formatDateTime = (dateString) => {
            if (!dateString) return '-';
            const date = new Date(dateString);
            return date.toLocaleString('tr-TR', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        };
        
        // Format currency helper
        const formatCurrency = (value, currency = 'TRY') => {
            if (!value) return '-';
            const numValue = parseFloat(value);
            const currencySymbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '₺';
            return `${currencySymbol} ${numValue.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        };
        
        // Build Temel Bilgiler tab content
        const temelBilgilerHtml = `
            <div style="padding: 20px;">
                <!-- Temel Bilgiler Section -->
                <div class="mb-4">
                    <h6 class="mb-3 d-flex align-items-center">
                        <i class="fas fa-info-circle me-2 text-primary"></i>
                        Temel Bilgiler
                    </h6>
                    <div class="row g-3">
                        <div class="col-md-6">
                            <label class="field-label small text-muted mb-1">
                                <i class="fas fa-barcode me-1"></i>İş Emri No
                            </label>
                            <div class="field-value fw-medium">${jobOrder.job_no || '-'}</div>
                        </div>
                        <div class="col-md-6">
                            <label class="field-label small text-muted mb-1">
                                <i class="fas fa-heading me-1"></i>Başlık
                            </label>
                            <div class="field-value">${jobOrder.title || '-'}</div>
                        </div>
                        <div class="col-md-6">
                            <label class="field-label small text-muted mb-1">
                                <i class="fas fa-users me-1"></i>Müşteri
                            </label>
                            <div class="field-value">${(jobOrder.customer_short_name || jobOrder.customer_name) ? `${jobOrder.customer_short_name || jobOrder.customer_name}${jobOrder.customer_code ? ' (' + jobOrder.customer_code + ')' : ''}` : '-'}</div>
                        </div>
                        <div class="col-md-6">
                            <label class="field-label small text-muted mb-1">
                                <i class="fas fa-tasks me-1"></i>Durum
                            </label>
                            <div class="field-value">
                                ${jobOrder.status_display ? `<span class="status-badge ${getStatusBadgeClass(jobOrder.status)}">${jobOrder.status_display}</span>` : '-'}
                            </div>
                        </div>
                        <div class="col-md-6">
                            <label class="field-label small text-muted mb-1">
                                <i class="fas fa-file-invoice me-1"></i>Müşteri Sipariş No
                            </label>
                            <div class="field-value">${jobOrder.customer_order_no || '-'}</div>
                        </div>
                        <div class="col-md-6">
                            <label class="field-label small text-muted mb-1">
                                <i class="fas fa-hashtag me-1"></i>Miktar
                            </label>
                            <div class="field-value">${jobOrder.quantity || jobOrder.quantity === 0 ? jobOrder.quantity : '-'}</div>
                        </div>
                        <div class="col-md-6">
                            <label class="field-label small text-muted mb-1">
                                <i class="fas fa-globe me-1"></i>Teslim Şekli
                            </label>
                            <div class="field-value">${jobOrder.incoterms || '-'}</div>
                        </div>
                        <div class="col-md-6">
                            <label class="field-label small text-muted mb-1">
                                <i class="fas fa-calendar-check me-1"></i>Hedef Tamamlanma
                            </label>
                            <div class="field-value fw-bold">${formatDate(jobOrder.target_completion_date)}</div>
                        </div>
                        <div class="col-md-6">
                            <label class="field-label small text-muted mb-1">
                                <i class="fas fa-play-circle me-1"></i>Başlangıç Tarihi
                            </label>
                            <div class="field-value">${formatDateTime(jobOrder.started_at)}</div>
                        </div>
                        <div class="col-md-6">
                            <label class="field-label small text-muted mb-1">
                                <i class="fas fa-check-circle me-1"></i>Tamamlanma Tarihi
                            </label>
                            <div class="field-value">${formatDateTime(jobOrder.completed_at)}</div>
                        </div>
                        <div class="col-md-6">
                            <label class="field-label small text-muted mb-1">
                                <i class="fas fa-percentage me-1"></i>Tamamlanma Oranı
                            </label>
                            <div class="field-value">
                                ${jobOrder.completion_percentage ? `${parseFloat(jobOrder.completion_percentage)}%` : '0%'}
                            </div>
                        </div>
                        ${jobOrder.description ? `
                        <div class="col-12">
                            <label class="field-label small text-muted mb-1">
                                <i class="fas fa-align-left me-1"></i>Açıklama
                            </label>
                            <div class="field-value">${jobOrder.description}</div>
                        </div>
                        ` : ''}
                        ${(jobOrder.estimated_cost || jobOrder.total_cost) ? `
                        <div class="col-md-6">
                            <label class="field-label small text-muted mb-1">
                                <i class="fas fa-calculator me-1"></i>Tahmini Maliyet
                            </label>
                            <div class="field-value">${formatCurrency(jobOrder.estimated_cost, jobOrder.cost_currency)}</div>
                        </div>
                        <div class="col-md-6">
                            <label class="field-label small text-muted mb-1">
                                <i class="fas fa-money-bill-wave me-1"></i>Toplam Maliyet
                            </label>
                            <div class="field-value">${formatCurrency(jobOrder.total_cost, jobOrder.cost_currency)}</div>
                        </div>
                        ` : ''}
                    </div>
                </div>
                
                <!-- Sistem Bilgileri Section -->
                <div>
                    <h6 class="mb-3 d-flex align-items-center">
                        <i class="fas fa-info me-2 text-secondary"></i>
                        Sistem Bilgileri
                    </h6>
                    <div class="row g-3">
                        <div class="col-md-6">
                            <label class="field-label small text-muted mb-1">
                                <i class="fas fa-calendar-plus me-1"></i>Oluşturulma Tarihi
                            </label>
                            <div class="field-value">${formatDateTime(jobOrder.created_at)}</div>
                        </div>
                        <div class="col-md-6">
                            <label class="field-label small text-muted mb-1">
                                <i class="fas fa-user me-1"></i>Oluşturan
                            </label>
                            <div class="field-value">${jobOrder.created_by_name || '-'}</div>
                        </div>
                        <div class="col-md-6">
                            <label class="field-label small text-muted mb-1">
                                <i class="fas fa-calendar-edit me-1"></i>Güncellenme Tarihi
                            </label>
                            <div class="field-value">${formatDateTime(jobOrder.updated_at)}</div>
                        </div>
                        ${jobOrder.completed_by_name ? `
                        <div class="col-md-6">
                            <label class="field-label small text-muted mb-1">
                                <i class="fas fa-user-check me-1"></i>Tamamlayan
                            </label>
                            <div class="field-value">${jobOrder.completed_by_name}</div>
                        </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
        
        // Add tabs to modal
        viewJobOrderModal.addTab({
            id: 'temel-bilgiler',
            label: 'Temel Bilgiler',
            icon: 'fas fa-info-circle',
            iconColor: 'text-primary',
            customContent: temelBilgilerHtml,
            active: true
        });
        
        // Add Departman Görevleri tab
        viewJobOrderModal.addTab({
            id: 'departman-gorevleri',
            label: 'Departman Görevleri',
            icon: 'fas fa-tasks',
            iconColor: 'text-primary',
            customContent: '<div id="department-tasks-table-container"></div>'
        });
        
        // Add Alt Görevler tab (only if count > 0)
        if (jobOrder.children_count && jobOrder.children_count > 0) {
            viewJobOrderModal.addTab({
                id: 'alt-gorevler',
                label: 'Alt Görevler',
                icon: 'fas fa-sitemap',
                iconColor: 'text-primary',
                customContent: '<div id="children-table-container"></div>'
            });
        }
        
        // Add Files tab
        viewJobOrderModal.addTab({
            id: 'dosyalar',
            label: 'Dosyalar',
            icon: 'fas fa-paperclip',
            iconColor: 'text-primary',
            customContent: '<div id="files-container"></div>'
        });
        
        // Add Topics tab
        viewJobOrderModal.addTab({
            id: 'topics',
            label: 'Tartışmalar',
            icon: 'fas fa-comments',
            iconColor: 'text-primary',
            customContent: '<div id="topics-container" style="padding: 20px;"></div>'
        });
        
        // Add Teknik Çizimler tab (only for root job orders)
        if (!jobOrder.parent) {
            viewJobOrderModal.addTab({
                id: 'teknik-cizimler',
                label: 'Teknik Çizimler',
                icon: 'fas fa-drafting-compass',
                iconColor: 'text-primary',
                customContent: '<div id="drawing-releases-container" style="padding: 20px;"></div>'
            });
        }
        
        // Add Taşeronluk tab (only for planning and management)
        if (canViewSubcontracting()) {
            viewJobOrderModal.addTab({
                id: 'taseronluk',
                label: 'Taşeron',
                icon: 'fas fa-handshake',
                iconColor: 'text-primary',
                customContent: '<div id="price-tiers-container" style="padding: 20px;"></div>'
            });
        }
        
        // Add Kalite Kontrol tab (show NCRs for this job order)
        viewJobOrderModal.addTab({
            id: 'kalite-kontrol',
            label: 'Kalite Kontrol',
            icon: 'fas fa-clipboard-check',
            iconColor: 'text-primary',
            customContent: '<div id="ncrs-container" style="padding: 20px;"></div>'
        });
        
        // Add Maliyet (Cost) tab — only for management, superusers, or planning managers
        if (canViewCostTab()) {
            viewJobOrderModal.addTab({
                id: 'maliyet',
                label: 'Maliyet',
                icon: 'fas fa-calculator',
                iconColor: 'text-primary',
                customContent: '<div id="cost-summary-container" style="padding: 20px;"></div>'
            });
        }
        
        // Render the modal
        viewJobOrderModal.render();
        
        // Set up tab click handlers for lazy loading
        setTimeout(() => {
            setupTabClickHandlers(jobNo, getStatusBadgeClass, formatDate, formatCurrency);
        }, 100);
        
        // Data will be loaded on tab click (lazy loading)
        
        // Update URL with job_no parameter (only if not already set)
        const url = new URL(window.location);
        const currentJobNo = url.searchParams.get('job_no');
        if (currentJobNo !== jobNo) {
            url.searchParams.set('job_no', jobNo);
            window.history.pushState({}, '', url);
        }
        
        // Show the modal
        viewJobOrderModal.show();
    } catch (error) {
        console.error('Error viewing job order:', error);
        showNotification('İş emri bilgileri yüklenirken hata oluştu', 'error');
    }
};

// Setup tab click handlers for lazy loading
function setupTabClickHandlers(jobNo, getStatusBadgeClass, formatDate, formatCurrency) {
    const modal = viewJobOrderModal.modal;
    if (!modal) return;
    
    // Listen for Bootstrap tab events on tab buttons
    const tabButtons = modal.querySelectorAll('[data-bs-toggle="tab"]');
    tabButtons.forEach(button => {
        button.addEventListener('shown.bs.tab', async (e) => {
            const targetTab = e.target;
            const tabId = targetTab.getAttribute('data-bs-target');
            
            if (!tabId) return;
            
            const match = tabId.match(/#tab-(.+)-pane/);
            if (!match) return;
            
            const tabName = match[1];
            
            switch (tabName) {
                case 'departman-gorevleri':
                    await loadDepartmentTasksTab(jobNo, getStatusBadgeClass, formatDate);
                    break;
                case 'alt-gorevler':
                    await loadChildrenTab(jobNo, getStatusBadgeClass);
                    break;
                case 'dosyalar':
                    await loadFilesTab(jobNo);
                    break;
                case 'topics':
                    await loadTopicsTab(jobNo);
                    break;
                case 'teknik-cizimler':
                    await loadDrawingReleasesTab(jobNo);
                    break;
                case 'taseronluk':
                    await loadPriceTiersTab(jobNo);
                    break;
                case 'kalite-kontrol':
                    await loadNCRsTab(jobNo);
                    break;
                case 'maliyet':
                    await loadCostSummaryTab(jobNo, formatCurrency);
                    break;
            }
        });
    });
}

// Load Department Tasks Tab
async function loadDepartmentTasksTab(jobNo, getStatusBadgeClass, formatDate) {
    // Check cache first
    if (jobOrderTabCache.departmentTasks !== null) {
        renderDepartmentTasksTable(jobOrderTabCache.departmentTasks, getStatusBadgeClass, formatDate);
        return;
    }
    
    const container = viewJobOrderModal.content.querySelector('#department-tasks-table-container');
    if (!container) return;
    
    // Show loading state
    container.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin fa-2x text-muted"></i><p class="mt-2 text-muted">Yükleniyor...</p></div>';
    
    try {
        const response = await getJobOrderDepartmentTasks(jobNo);
        const tasks = extractResultsFromResponse(response);
        
        // Cache the data
        jobOrderTabCache.departmentTasks = tasks;
        
        // Render the table
        renderDepartmentTasksTable(tasks, getStatusBadgeClass, formatDate);
    } catch (error) {
        console.error('Error loading department tasks:', error);
        container.innerHTML = '<div class="alert alert-danger"><i class="fas fa-exclamation-triangle me-2"></i>Departman görevleri yüklenirken hata oluştu.</div>';
    }
}

// Render Department Tasks Table
function renderDepartmentTasksTable(tasks, getStatusBadgeClass, formatDate) {
    const container = viewJobOrderModal.content.querySelector('#department-tasks-table-container');
    if (!container) return;
    
    if (tasks.length === 0) {
        container.innerHTML = '<p class="text-muted text-center py-3">Departman görevi bulunamadı.</p>';
        return;
    }
    
    const getDepartmentTaskStatusBadgeClass = (status) => {
        switch (status) {
            case 'completed': return 'status-green';
            case 'in_progress': return 'status-blue';
            case 'pending': return 'status-yellow';
            case 'blocked': return 'status-red';
            case 'skipped': return 'status-grey';
            default: return 'status-grey';
        }
    };
    
    const departmentTasksTable = new TableComponent('department-tasks-table-container', {
        title: 'Departman Görevleri',
        icon: 'fas fa-tasks',
        iconColor: 'text-primary',
        columns: [
            {
                field: 'department_display',
                label: 'Departman',
                sortable: true,
                formatter: (value, row) => {
                    if (!value || value === '-') return '-';
                    
                    const departmentUrlMap = {
                        'manufacturing': '/manufacturing/projects/',
                        'design': '/design/projects/',
                        'planning': '/planning/projects/',
                        'procurement': '/procurement/projects/',
                        'logistics': '/logistics/projects/',
                        'painting': '/painting/projects/'
                    };
                    
                    const department = row.department || '';
                    const taskId = row.id;
                    const departmentUrl = departmentUrlMap[department];
                    
                    if (departmentUrl && taskId) {
                        const url = `${departmentUrl}?task=${encodeURIComponent(taskId)}`;
                        const escapedUrl = url.replace(/'/g, "&#39;").replace(/"/g, "&quot;");
                        return `<span class="department-link" data-href="${escapedUrl}" style="font-weight: 700; color: #0d6efd; text-decoration: none; cursor: pointer; user-select: none;" onmouseover="this.style.textDecoration='underline';" onmouseout="this.style.textDecoration='none';">${value}</span>`;
                    }
                    
                    return `<strong>${value}</strong>`;
                }
            },
            {
                field: 'weight',
                label: 'Ağırlık',
                sortable: true,
                formatter: (value, row) => {
                    const isEditable = row.type !== 'machining_part' && row.type !== 'cnc_part';
                    const cursorStyle = isEditable ? 'cursor: pointer;' : '';
                    const taskId = row.id;
                    let displayValue = '-';
                    if (value !== null && value !== undefined && value !== '') {
                        displayValue = parseFloat(value).toFixed(2);
                    }
                    return `
                        <div class="text-center editable-weight" data-task-id="${taskId}" data-weight-value="${value != null && value !== '' ? value : ''}" data-editable="${isEditable ? '1' : '0'}" style="${cursorStyle}" ${isEditable ? 'title="Ağırlığı düzenlemek için tıklayın"' : ''}>
                            ${displayValue}
                        </div>
                    `;
                }
            },
            {
                field: 'completion_percentage',
                label: 'Tamamlanma',
                sortable: true,
                width: '300px',
                headerClass: 'completion-percentage-header',
                formatter: (value) => {
                    if (!value && value !== 0) return '-';
                    const percentage = Math.min(100, Math.max(0, parseFloat(value) || 0));
                    
                    let colorClass = 'bg-success';
                    let barColor = '#10b981';
                    if (percentage === 0) {
                        colorClass = 'bg-secondary';
                        barColor = '#6b7280';
                    } else if (percentage < 25) {
                        colorClass = 'bg-danger';
                        barColor = '#ef4444';
                    } else if (percentage < 50) {
                        colorClass = 'bg-warning';
                        barColor = '#f59e0b';
                    } else if (percentage < 75) {
                        colorClass = 'bg-info';
                        barColor = '#3b82f6';
                    } else if (percentage < 100) {
                        colorClass = 'bg-success';
                        barColor = '#10b981';
                    } else {
                        colorClass = 'bg-success';
                        barColor = '#059669';
                    }
                    
                    // Text color always black for visibility
                    const textColor = '#000000';
                    
                    return `
                        <div style="position: relative; width: 100%; padding: 4px 0;">
                            <div class="progress" style="height: 28px; border-radius: 6px; background-color: #e5e7eb; 
                                                         box-shadow: inset 0 1px 2px rgba(0,0,0,0.1); overflow: hidden;">
                                <div class="progress-bar ${colorClass}" 
                                     role="progressbar" 
                                     style="width: ${percentage}%; 
                                            background: linear-gradient(90deg, ${barColor} 0%, ${barColor}dd 100%);
                                            border-radius: 6px;
                                            transition: width 0.6s ease;
                                            box-shadow: 0 1px 3px rgba(0,0,0,0.15);
                                            position: relative;
                                            overflow: hidden;" 
                                     aria-valuenow="${percentage}" 
                                     aria-valuemin="0" 
                                     aria-valuemax="100">
                                    <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0;
                                                background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.25) 50%, transparent 100%);
                                                animation: shimmer 3s infinite;
                                                pointer-events: none;"></div>
                                </div>
                            </div>
                            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); 
                                        font-weight: 600; font-size: 0.8rem; color: ${textColor}; 
                                        pointer-events: none; white-space: nowrap; z-index: 2;">
                                ${percentage.toFixed(1)}%
                            </div>
                        </div>
                    `;
                }
            },
            {
                field: 'status_display',
                label: 'Durum',
                sortable: true,
                formatter: (value, row) => {
                    if (!value || value === '-') return '-';
                    const status = row.status;
                    const badgeClass = getDepartmentTaskStatusBadgeClass(status);
                    return `<span class="status-badge ${badgeClass}">${value}</span>`;
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
                label: 'Hedef Tarih',
                sortable: true,
                type: 'date',
                formatter: (value) => formatDate(value)
            },
            {
                field: 'completed_at',
                label: 'Tamamlanma Tarihi',
                sortable: true,
                type: 'datetime',
                formatter: (value) => formatDate(value)
            }
        ],
        data: tasks,
        sortable: true,
        pagination: false,
        exportable: false,
        refreshable: false,
        small: true,
        striped: true,
        emptyMessage: 'Departman görevi bulunamadı',
        emptyIcon: 'fas fa-tasks'
    });
    
    // Add click event delegation for department links and weight editing
    setTimeout(() => {
        const tableContainer = document.getElementById('department-tasks-table-container');
        if (!tableContainer) return;

        tableContainer.addEventListener('click', (e) => {
            const departmentLink = e.target.closest('.department-link');
            if (departmentLink) {
                e.preventDefault();
                e.stopPropagation();
                const url = departmentLink.getAttribute('data-href');
                if (url) {
                    window.location.href = url;
                }
                return;
            }

            const weightCell = e.target.closest('.editable-weight');
            if (!weightCell || e.target.tagName === 'INPUT') return;
            if (weightCell.getAttribute('data-editable') !== '1') return; // not editable (e.g. machining_part)

            e.preventDefault();
            e.stopPropagation();
            const taskIdAttr = weightCell.getAttribute('data-task-id');
            const currentWeightValue = weightCell.getAttribute('data-weight-value') || '';
            if (!taskIdAttr) return;

            const originalContent = weightCell.innerHTML;
            const displayText = weightCell.textContent.trim();
            let currentValue = displayText && displayText !== '-' ? displayText : (currentWeightValue ? parseFloat(currentWeightValue).toFixed(2) : '');

            const input = document.createElement('input');
            input.type = 'number';
            input.step = '0.01';
            input.min = '0';
            input.value = currentValue;
            input.className = 'form-control form-control-sm';
            input.style.cssText = 'width: 100px; margin: 0 auto; z-index: 10; position: relative; text-align: center;';
            weightCell.innerHTML = '';
            weightCell.style.display = 'flex';
            weightCell.style.justifyContent = 'center';
            weightCell.style.alignItems = 'center';
            weightCell.appendChild(input);
            input.focus();
            input.select();

            const updateWeightDisplay = (weightValue) => {
                let displayValue = '-';
                if (weightValue !== null && weightValue !== undefined && weightValue !== '') {
                    const numValue = parseFloat(weightValue);
                    if (!isNaN(numValue)) displayValue = numValue.toFixed(2);
                }
                weightCell.innerHTML = displayValue;
                weightCell.setAttribute('data-weight-value', weightValue || '');
                weightCell.style.display = '';
                weightCell.style.justifyContent = '';
                weightCell.style.alignItems = '';
            };

            const saveWeight = async () => {
                const newValue = input.value.trim();
                const originalNum = currentWeightValue ? parseFloat(currentWeightValue) : null;
                const newNum = newValue ? parseFloat(newValue) : null;
                if ((originalNum === null && newNum === null) || (originalNum !== null && newNum !== null && Math.abs(originalNum - newNum) < 0.001)) {
                    weightCell.innerHTML = originalContent;
                    weightCell.style.display = '';
                    weightCell.style.justifyContent = '';
                    weightCell.style.alignItems = '';
                    return;
                }
                if (newValue && (isNaN(parseFloat(newValue)) || parseFloat(newValue) < 0)) {
                    showNotification('Geçerli bir ağırlık değeri girin (0 veya pozitif sayı)', 'error');
                    weightCell.innerHTML = originalContent;
                    weightCell.style.display = '';
                    weightCell.style.justifyContent = '';
                    weightCell.style.alignItems = '';
                    return;
                }
                const taskId = parseInt(taskIdAttr, 10);
                try {
                    await patchDepartmentTask(taskId, { weight: newValue === '' ? null : parseFloat(newValue) });
                    showNotification('Ağırlık güncellendi', 'success');
                    updateWeightDisplay(newValue);
                    const cached = jobOrderTabCache.departmentTasks;
                    if (Array.isArray(cached)) {
                        const task = cached.find(t => t.id === taskId);
                        if (task) task.weight = newValue === '' ? null : parseFloat(newValue);
                    }
                } catch (err) {
                    console.error('Error updating weight:', err);
                    let errMsg = 'Ağırlık güncellenirken hata oluştu';
                    try {
                        if (err.message) {
                            const data = JSON.parse(err.message);
                            if (typeof data === 'object') {
                                const errors = Object.values(data).flat();
                                if (errors.length) errMsg = errors.join(', ');
                            }
                        }
                    } catch (_) {}
                    showNotification(errMsg, 'error');
                    weightCell.innerHTML = originalContent;
                    weightCell.style.display = '';
                    weightCell.style.justifyContent = '';
                    weightCell.style.alignItems = '';
                }
            };

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
        });
    }, 200);
}

// Load Children Tab
async function loadChildrenTab(jobNo, getStatusBadgeClass, getPriorityBadgeClass) {
    // Check cache first
    if (jobOrderTabCache.children !== null) {
        renderChildrenTable(jobOrderTabCache.children, getStatusBadgeClass);
        return;
    }
    
    const container = viewJobOrderModal.content.querySelector('#children-table-container');
    if (!container) return;
    
    // Show loading state
    container.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin fa-2x text-muted"></i><p class="mt-2 text-muted">Yükleniyor...</p></div>';
    
    try {
        const children = await getJobOrderChildren(jobNo);
        
        // Cache the data
        jobOrderTabCache.children = children;
        
        // Render the table
        renderChildrenTable(children, getStatusBadgeClass);
    } catch (error) {
        console.error('Error loading children:', error);
        container.innerHTML = '<div class="alert alert-danger"><i class="fas fa-exclamation-triangle me-2"></i>Alt iş emirleri yüklenirken hata oluştu.</div>';
    }
}

// Render Children Table
function renderChildrenTable(children, getStatusBadgeClass) {
    const container = viewJobOrderModal.content.querySelector('#children-table-container');
    if (!container) return;
    
    if (children.length === 0) {
        container.innerHTML = '<p class="text-muted text-center py-3">Alt iş emri bulunamadı.</p>';
        return;
    }
    
    const childrenTable = new TableComponent('children-table-container', {
        title: 'Alt İş Emirleri',
        icon: 'fas fa-sitemap',
        iconColor: 'text-primary',
        columns: [
            {
                field: 'job_no',
                label: 'İş Emri No',
                sortable: true,
                formatter: (value) => `<strong>${value || '-'}</strong>`
            },
            {
                field: 'title',
                label: 'Başlık',
                sortable: true,
                formatter: (value) => value || '-'
            },
            {
                field: 'status_display',
                label: 'Durum',
                sortable: true,
                formatter: (value, row) => {
                    if (!value || value === '-') return '-';
                    const badgeClass = getStatusBadgeClass(row.status);
                    return `<span class="status-badge ${badgeClass}">${value}</span>`;
                }
            },
            {
                field: 'completion_percentage',
                label: 'Tamamlanma',
                sortable: true,
                formatter: (value) => value ? `${parseFloat(value)}%` : '0%'
            }
        ],
        data: children,
        sortable: true,
        pagination: false,
        exportable: false,
        refreshable: false,
        small: true,
        striped: true,
        emptyMessage: 'Alt iş emri bulunamadı',
        emptyIcon: 'fas fa-sitemap',
        actions: [
            {
                key: 'view',
                label: 'Detay',
                icon: 'fas fa-eye',
                class: 'btn-outline-info',
                onClick: (row) => {
                    viewJobOrderModal.hide();
                    viewJobOrder(row.job_no);
                }
            }
        ]
    });
}

// Load Files Tab
async function loadFilesTab(jobNo) {
    // Check cache first
    if (jobOrderTabCache.files !== null) {
        renderFilesTab(jobOrderTabCache.files);
        return;
    }
    
    const container = viewJobOrderModal.content.querySelector('#files-container');
    if (!container) return;
    
    // Show loading state
    container.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin fa-2x text-muted"></i><p class="mt-2 text-muted">Yükleniyor...</p></div>';
    
    try {
        const files = await getJobOrderFiles(jobNo);
        
        // Cache the data
        jobOrderTabCache.files = files;
        
        // Render the files
        renderFilesTab(files);
    } catch (error) {
        console.error('Error loading files:', error);
        container.innerHTML = '<div class="alert alert-danger"><i class="fas fa-exclamation-triangle me-2"></i>Dosyalar yüklenirken hata oluştu.</div>';
    }
}

// Render Files Tab
async function renderFilesTab(files) {
    const container = viewJobOrderModal.content.querySelector('#files-container');
    if (!container) return;
    
    if (files.length === 0) {
        container.innerHTML = '<p class="text-muted text-center py-3">Henüz dosya eklenmemiş.</p>';
        return;
    }
    
    const { FileAttachments } = await import('../../components/file-attachments/file-attachments.js');
    
    const fileAttachments = new FileAttachments('files-container', {
        title: 'Dosyalar',
        titleIcon: 'fas fa-paperclip',
        titleIconColor: 'text-primary',
        layout: 'grid',
        onFileClick: async (file) => {
            const fileName = file.file_name || 'Dosya';
            const fileExtension = file.file_extension || (fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : '');
            const fileUrl = file.file_url;
            
            if (!fileUrl) {
                console.error('File URL is missing');
                return;
            }
            
            let viewer = window.fileViewer;
            if (!viewer) {
                try {
                    const { FileViewer } = await import('../../components/file-viewer/file-viewer.js');
                    viewer = new FileViewer();
                    viewer.setDownloadCallback(async () => {
                        await viewer.downloadFile(fileUrl, fileName);
                    });
                } catch (error) {
                    console.error('Error loading FileViewer:', error);
                    showNotification('Dosya görüntüleyici yüklenemedi', 'error');
                    return;
                }
            }
            
            if (viewer) {
                viewer.openFile(fileUrl, fileName, fileExtension);
            }
        },
        onDownloadClick: async (fileUrl, fileName) => {
            try {
                const response = await fetch(fileUrl);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = fileName;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);
            } catch (error) {
                console.error('Error downloading file:', error);
                const link = document.createElement('a');
                link.href = fileUrl;
                link.download = fileName;
                link.target = '_blank';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
        }
    });
    
    // Map files to FileAttachments format
    const mappedFiles = files.map(file => ({
        file_url: file.file_url || file.url || file.file || '',
        file_name: file.name || file.file_name || 'Dosya',
        uploaded_at: file.uploaded_at,
        uploaded_by_username: file.uploaded_by || 'Bilinmeyen'
    }));
    
    fileAttachments.setFiles(mappedFiles);
}

// Load Topics Tab
async function loadTopicsTab(jobNo) {
    // Check cache first
    if (jobOrderTabCache.topics !== null) {
        const container = viewJobOrderModal.content.querySelector('#topics-container');
        if (container) {
            renderTopicsUI(container, jobOrderTabCache.topics, jobNo);
        }
        return;
    }
    
    const container = viewJobOrderModal.content.querySelector('#topics-container');
    if (!container) return;
    
    // Show loading state
    container.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin fa-2x text-muted"></i><p class="mt-2 text-muted">Yükleniyor...</p></div>';
    
    try {
        const response = await listTopics({ job_order: jobNo, ordering: '-created_at' });
        const topics = extractResultsFromResponse(response);
        
        // Cache the data
        jobOrderTabCache.topics = topics;
        
        // Render topics UI
        renderTopicsUI(container, topics, jobNo);
    } catch (error) {
        console.error('Error loading topics:', error);
        container.innerHTML = '<div class="alert alert-danger"><i class="fas fa-exclamation-triangle me-2"></i>Tartışmalar yüklenirken hata oluştu.</div>';
    }
}

// Initialize Topics Tab (kept for backward compatibility, but now uses loadTopicsTab)
async function initializeTopicsTab(jobNo) {
    await loadTopicsTab(jobNo);
}

// Load Drawing Releases Tab
async function loadDrawingReleasesTab(jobNo) {
    const container = document.getElementById('drawing-releases-container');
    if (!container) return;
    
    // Check cache
    if (jobOrderTabCache.drawingReleases && jobOrderTabCache.drawingReleasesJobNo === jobNo) {
        renderDrawingReleasesUI(container, jobOrderTabCache.drawingReleases, jobNo);
        return;
    }
    
    // Show loading state
    container.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin fa-2x text-muted"></i><p class="mt-2 text-muted">Yükleniyor...</p></div>';
    
    try {
        const response = await listDrawingReleases(jobNo);
        const releases = extractResultsFromResponse(response);
        const currentRelease = await getCurrentRelease(jobNo);
        
        // Cache the data
        jobOrderTabCache.drawingReleases = releases;
        jobOrderTabCache.currentRelease = currentRelease;
        jobOrderTabCache.drawingReleasesJobNo = jobNo;
        
        // Render drawing releases UI
        renderDrawingReleasesUI(container, releases, jobNo, currentRelease);
    } catch (error) {
        console.error('Error loading drawing releases:', error);
        container.innerHTML = '<div class="alert alert-danger"><i class="fas fa-exclamation-triangle me-2"></i>Teknik çizimler yüklenirken hata oluştu.</div>';
    }
}

// Render Drawing Releases UI
function renderDrawingReleasesUI(container, releases, jobNo, currentRelease = null) {
    const formatDateTime = (dateString) => {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleString('tr-TR', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };
    
    const getStatusBadge = (release) => {
        // Use status_display if available, otherwise fall back to status mapping
        const statusDisplay = release.status_display;
        if (statusDisplay) {
            const statusMap = {
                'released': 'status-green',
                'in_revision': 'status-yellow',
                'pending_revision': 'status-blue'
            };
            const statusClass = statusMap[release.status] || 'status-grey';
            return `<span class="status-badge ${statusClass}">${statusDisplay}</span>`;
        }
        // Fallback to old mapping if status_display is not available
        const statusMap = {
            'released': { label: 'Yayınlandı', class: 'status-green' },
            'in_revision': { label: 'Revizyonda', class: 'status-yellow' },
            'pending_revision': { label: 'Revizyon Bekliyor', class: 'status-blue' }
        };
        const statusInfo = statusMap[release.status] || { label: release.status, class: 'status-grey' };
        return `<span class="status-badge ${statusInfo.class}">${statusInfo.label}</span>`;
    };
    
    let html = '<div class="drawing-releases-section">';
    
    // Current Release Section
    if (currentRelease) {
        html += `
            <div class="card mb-4">
                <div class="card-header">
                    <h6 class="mb-0"><i class="fas fa-star me-2"></i>Aktif Yayın</h6>
                </div>
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-6">
                            <p><strong>Revizyon:</strong> ${currentRelease.revision_code || '-'} (Rev. ${currentRelease.revision_number || '-'})</p>
                            <p><strong>Durum:</strong> ${getStatusBadge(currentRelease)}</p>
                            <p><strong>Klasör Yolu:</strong> ${currentRelease.folder_path || '-'}</p>
                        </div>
                        <div class="col-md-6">
                            <p><strong>Yayınlayan:</strong> ${currentRelease.released_by_name || '-'}</p>
                            <p><strong>Yayın Tarihi:</strong> ${formatDateTime(currentRelease.released_at)}</p>
                            <p><strong>Hardcopy Sayısı:</strong> ${currentRelease.hardcopy_count || 0}</p>
                        </div>
                    </div>
                    ${currentRelease.changelog ? `<div class="mt-3"><strong>Değişiklik Günlüğü:</strong><pre class="bg-light p-2 rounded">${escapeHtml(currentRelease.changelog)}</pre></div>` : ''}
                    ${currentRelease.status === 'released' ? `
                        <div class="mt-3">
                            <button type="button" class="btn btn-sm btn-outline-primary request-revision-btn" data-release-id="${currentRelease.id}">
                                <i class="fas fa-edit me-1"></i>Revizyon İste
                            </button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }
    
    // All Releases List
    html += `
        <div class="card">
            <div class="card-header">
                <h6 class="mb-0"><i class="fas fa-list me-2"></i>Tüm Yayınlar (${releases.length || 0})</h6>
            </div>
            <div class="card-body">
    `;
    
    if (!releases || releases.length === 0) {
        html += '<div class="alert alert-info"><i class="fas fa-info-circle me-2"></i>Henüz teknik çizim yayını bulunmamaktadır.</div>';
    } else {
        html += '<div class="table-responsive"><table class="table table-hover">';
        html += `
            <thead>
                <tr>
                    <th>Revizyon</th>
                    <th>Durum</th>
                    <th>Yayınlayan</th>
                    <th>Yayın Tarihi</th>
                    <th>Hardcopy</th>
                    <th>Klasör Yolu</th>
                    <th>Değişiklik Günlüğü</th>
                </tr>
            </thead>
            <tbody>
        `;
        
        releases.forEach(release => {
            const isCurrent = currentRelease && release.id === currentRelease.id;
            const folderPath = release.folder_path ? escapeHtml(release.folder_path) : '-';
            const changelog = release.changelog ? escapeHtml(release.changelog.trim()) : '-';
            html += `
                <tr ${isCurrent ? 'style="background-color: #f8f9fa;"' : ''}>
                    <td><strong>${release.revision_code || '-'}</strong> (Rev. ${release.revision_number || '-'})</td>
                    <td>${getStatusBadge(release)}</td>
                    <td>${release.released_by_name || '-'}</td>
                    <td>${formatDateTime(release.released_at)}</td>
                    <td>${release.hardcopy_count || 0}</td>
                    <td><code style="font-size: 0.9em; word-break: break-all;">${folderPath}</code></td>
                    <td>${changelog !== '-' ? `<pre style="white-space: pre-wrap; word-wrap: break-word; margin: 0; font-size: 0.9em; max-width: 400px;">${changelog}</pre>` : '-'}</td>
                </tr>
            `;
        });
        
        html += '</tbody></table></div>';
    }
    
    html += '</div></div></div>';
    
    container.innerHTML = html;
    
    // Add event listeners for request revision buttons
    container.querySelectorAll('.request-revision-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const releaseId = parseInt(e.target.closest('.request-revision-btn').getAttribute('data-release-id'));
            showRequestRevisionModal(releaseId, jobNo);
        });
    });
}

// Load Price Tiers Tab
async function loadPriceTiersTab(jobNo) {
    const container = document.getElementById('price-tiers-container');
    if (!container) return;
    
    // Show loading state
    container.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin fa-2x text-muted"></i><p class="mt-2 text-muted">Yükleniyor...</p></div>';
    
    try {
        // Get job order to check total_weight_kg
        const jobOrder = jobOrderTabCache.jobOrder || await getJobOrderByJobNo(jobNo);
        if (!jobOrderTabCache.jobOrder) {
            jobOrderTabCache.jobOrder = jobOrder;
        }
        
        // Fetch price tiers
        const response = await fetchPriceTiers({ job_order: jobNo });
        const tiers = response.results || response || [];
        
        // Render price tiers UI
        renderPriceTiersUI(container, tiers, jobOrder, jobNo);
    } catch (error) {
        console.error('Error loading price tiers:', error);
        container.innerHTML = '<div class="alert alert-danger"><i class="fas fa-exclamation-triangle me-2"></i>Fiyat kademeleri yüklenirken hata oluştu.</div>';
    }
}

// Render Price Tiers UI
function renderPriceTiersUI(container, tiers, jobOrder, jobNo) {
    const formatCurrency = (amount, currency) => {
        if (!amount) return '-';
        return new Intl.NumberFormat('tr-TR', {
            style: 'decimal',
            minimumFractionDigits: 2,
            maximumFractionDigits: 4
        }).format(amount) + ' ' + (currency || 'TRY');
    };
    
    const formatWeight = (weight) => {
        if (!weight) return '-';
        return new Intl.NumberFormat('tr-TR', {
            style: 'decimal',
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        }).format(weight) + ' kg';
    };
    
    let html = '<div class="price-tiers-section">';
    
    // Total Weight Section
    html += `
        <div class="card mb-4">
            <div class="card-header">
                <h6 class="mb-0"><i class="fas fa-weight me-2"></i>Toplam Ağırlık</h6>
            </div>
            <div class="card-body">
                <div class="row align-items-center">
                    <div class="col-md-6">
                        <label class="form-label">Toplam Ağırlık (kg)</label>
                        <div class="input-group">
                            <input type="number" class="form-control" id="total-weight-input" 
                                   value="${jobOrder.total_weight_kg || ''}" 
                                   step="0.01" min="0"
                                   ${!canEditJobOrders() ? 'readonly' : ''}>
                            <button class="btn btn-primary" id="save-total-weight-btn" 
                                    ${!canEditJobOrders() ? 'disabled' : ''}>
                                <i class="fas fa-save me-1"></i>Kaydet
                            </button>
                        </div>
                        ${!jobOrder.total_weight_kg ? '<small class="text-warning"><i class="fas fa-exclamation-triangle me-1"></i>Toplam ağırlık belirlenmeden fiyat kademesi eklenemez.</small>' : ''}
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Price Tiers Table
    html += `
        <div class="card">
            <div class="card-header d-flex justify-content-between align-items-center">
                <h6 class="mb-0"><i class="fas fa-list me-2"></i>Fiyat Kademeleri</h6>
                <button class="btn btn-sm btn-primary" id="add-tier-btn" 
                        ${!jobOrder.total_weight_kg ? 'disabled' : ''}>
                    <i class="fas fa-plus me-1"></i>Kademe Ekle
                </button>
            </div>
            <div class="card-body">
                ${tiers.length === 0 ? `
                    <div class="text-center py-4 text-muted">
                        <i class="fas fa-list fa-2x mb-2"></i>
                        <p>Henüz fiyat kademesi eklenmemiş.</p>
                    </div>
                ` : `
                    <div class="table-responsive">
                        <table class="table table-sm table-bordered">
                            <thead class="table-light">
                                <tr>
                                    <th>Ad</th>
                                    <th>Fiyat/kg</th>
                                    <th>Para Birimi</th>
                                    <th>Ayrılan Ağırlık</th>
                                    <th>Kullanılan</th>
                                    <th>Kalan</th>
                                    <th>İşlemler</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${tiers.map(tier => `
                                    <tr>
                                        <td><strong>${tier.name || '-'}</strong></td>
                                        <td>${formatCurrency(tier.price_per_kg, tier.currency)}</td>
                                        <td>${tier.currency || '-'}</td>
                                        <td>${formatWeight(tier.allocated_weight_kg)}</td>
                                        <td>${formatWeight(tier.used_weight_kg || 0)}</td>
                                        <td>${formatWeight(tier.remaining_weight_kg || 0)}</td>
                                        <td>
                                            ${canEditJobOrders() ? `
                                                <button class="btn btn-sm btn-outline-primary edit-tier-btn" data-tier-id="${tier.id}">
                                                    <i class="fas fa-edit"></i>
                                                </button>
                                                <button class="btn btn-sm btn-outline-danger delete-tier-btn" data-tier-id="${tier.id}">
                                                    <i class="fas fa-trash"></i>
                                                </button>
                                            ` : '-'}
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `}
            </div>
        </div>
    `;
    
    html += '</div>';
    
    container.innerHTML = html;
    
    // Set up event listeners
    if (canEditJobOrders()) {
        // Save total weight
        const saveWeightBtn = container.querySelector('#save-total-weight-btn');
        if (saveWeightBtn) {
            saveWeightBtn.addEventListener('click', async () => {
                const totalWeight = parseFloat(container.querySelector('#total-weight-input').value);
                if (isNaN(totalWeight) || totalWeight < 0) {
                    showNotification('Geçerli bir ağırlık değeri giriniz', 'error');
                    return;
                }
                
                try {
                    await updateJobOrderAPI(jobNo, { total_weight_kg: totalWeight });
                    showNotification('Toplam ağırlık güncellendi', 'success');
                    // Reload the tab
                    await loadPriceTiersTab(jobNo);
                } catch (error) {
                    console.error('Error updating total weight:', error);
                    showNotification(error.message || 'Toplam ağırlık güncellenirken hata oluştu', 'error');
                }
            });
        }
        
        // Add tier button
        const addTierBtn = container.querySelector('#add-tier-btn');
        if (addTierBtn) {
            addTierBtn.addEventListener('click', () => {
                showAddTierModal(jobNo, jobOrder);
            });
        }
        
        // Edit tier buttons
        container.querySelectorAll('.edit-tier-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tierId = parseInt(btn.dataset.tierId);
                const tier = tiers.find(t => t.id === tierId);
                if (tier) {
                    showEditTierModal(jobNo, tier, jobOrder);
                }
            });
        });
        
        // Delete tier buttons
        container.querySelectorAll('.delete-tier-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const tierId = parseInt(btn.dataset.tierId);
                const tier = tiers.find(t => t.id === tierId);
                if (tier && confirm(`"${tier.name}" kademesini silmek istediğinizden emin misiniz?`)) {
                    try {
                        await deletePriceTier(tierId);
                        showNotification('Fiyat kademesi silindi', 'success');
                        await loadPriceTiersTab(jobNo);
                    } catch (error) {
                        console.error('Error deleting tier:', error);
                        showNotification(error.message || 'Fiyat kademesi silinirken hata oluştu', 'error');
                    }
                }
            });
        });
    }
}

// Load NCRs Tab
async function loadNCRsTab(jobNo) {
    // Check cache first
    if (jobOrderTabCache.ncrs !== null) {
        renderNCRsTab(jobOrderTabCache.ncrs);
        return;
    }
    
    const container = viewJobOrderModal.content.querySelector('#ncrs-container');
    if (!container) return;
    
    // Show loading state
    container.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin fa-2x text-muted"></i><p class="mt-2 text-muted">Yükleniyor...</p></div>';
    
    try {
        // Fetch NCRs for this job order
        const response = await listNCRs({ job_order: jobNo }, '', '-created_at', 1, 100);
        const ncrs = response.results || [];
        
        // Cache the data
        jobOrderTabCache.ncrs = ncrs;
        
        // Render the table
        renderNCRsTab(ncrs);
    } catch (error) {
        console.error('Error loading NCRs:', error);
        container.innerHTML = '<div class="alert alert-danger"><i class="fas fa-exclamation-triangle me-2"></i>Uygunsuzluk raporları yüklenirken hata oluştu.</div>';
    }
}

// Load Cost Summary Tab
async function loadCostSummaryTab(jobNo, formatCurrency) {
    if (jobOrderTabCache.costSummary !== null) {
        renderCostSummaryTab(jobOrderTabCache.costSummary, jobNo, formatCurrency);
        return;
    }
    const container = viewJobOrderModal.content.querySelector('#cost-summary-container');
    if (!container) return;
    container.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin fa-2x text-muted"></i><p class="mt-2 text-muted">Yükleniyor...</p></div>';
    try {
        const data = await getJobCostSummary(jobNo);
        jobOrderTabCache.costSummary = data;
        renderCostSummaryTab(data, jobNo, formatCurrency);
    } catch (error) {
        console.error('Error loading cost summary:', error);
        container.innerHTML = '<div class="alert alert-danger"><i class="fas fa-exclamation-triangle me-2"></i>Maliyet özeti yüklenirken hata oluştu.</div>';
    }
}

// Render Cost Summary Tab
function renderCostSummaryTab(data, jobNo, formatCurrency) {
    const container = viewJobOrderModal.content.querySelector('#cost-summary-container');
    if (!container) return;

    const rateSuffix = (rate) => {
        if (rate == null || rate === '' || rate === undefined) return '';
        const n = parseFloat(rate);
        if (Number.isNaN(n)) return '';
        return ` (${n})`;
    };
    const paintMaterialRateSuffix = (rate) => {
        if (rate == null || rate === '' || rate === undefined) return '';
        const n = parseFloat(rate);
        if (Number.isNaN(n)) return '';
        return ` (${formatCurrency(String(n), 'TRY')})`;
    };

    // Rows that have an at_100 estimate from API; others use actual cost in the estimate column
    const costRows = [
        { label: 'İşçilik', value: data.labor_cost, valueAt100: null },
        { label: 'Malzeme', value: data.material_cost, valueAt100: null },
        { label: 'Taşeron', value: data.subcontractor_cost, valueAt100: data.subcontractor_cost_at_100 },
        { label: 'Boya', value: data.paint_cost, valueAt100: data.paint_cost_at_100 },
        { label: `Boya Malzemesi${paintMaterialRateSuffix(data.paint_material_rate)}`, value: data.paint_material_cost, valueAt100: data.paint_material_cost_at_100 },
        { label: 'Kalite Kontrol', value: data.qc_cost, valueAt100: null },
        { label: 'Sevkiyat', value: data.shipping_cost, valueAt100: null },
        { label: `Genel Giderler${rateSuffix(data.general_expenses_rate)}`, value: data.general_expenses_cost, valueAt100: null },
        { label: `Personel Genel Giderleri${rateSuffix(data.employee_overhead_rate)}`, value: data.employee_overhead_cost, valueAt100: null }
    ];

    const fmt = (v) => (v != null && v !== '') ? formatCurrency(v, 'EUR') : formatCurrency('0', 'EUR');
    const estimateValue = (r) => (r.valueAt100 != null && r.valueAt100 !== '') ? parseFloat(r.valueAt100) : (parseFloat(r.value) || 0);
    const displayEstimate = (r) => (r.valueAt100 != null && r.valueAt100 !== '') ? r.valueAt100 : (r.value ?? '0');
    const at100Sum = costRows.reduce((acc, r) => acc + estimateValue(r), 0);
    const at100SumStr = at100Sum.toFixed(2);

    container.innerHTML = `
        <div class="card mb-4">
            <div class="card-header"><h6 class="mb-0"><i class="fas fa-list me-2"></i>Maliyet Dağılımı</h6></div>
            <div class="card-body">
                <div class="table-responsive">
                    <table class="table table-sm table-bordered">
                        <thead>
                            <tr>
                                <th class="text-muted">Kalem</th>
                                <th class="text-end">Mevcut</th>
                                <th class="text-end">Tahmini (%100)</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${costRows.map(r => `<tr><td class="text-muted">${r.label}</td><td class="text-end">${fmt(r.value)}</td><td class="text-end">${fmt(displayEstimate(r))}</td></tr>`).join('')}
                            <tr class="table-light"><td><strong>Toplam Maliyet</strong></td><td class="text-end"><strong>${formatCurrency(data.actual_total_cost, 'EUR')}</strong></td><td class="text-end"><strong>${formatCurrency(at100SumStr, 'EUR')}</strong></td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

// Render NCRs Tab
function renderNCRsTab(ncrs) {
    const container = viewJobOrderModal.content.querySelector('#ncrs-container');
    if (!container) return;
    
    if (ncrs.length === 0) {
        container.innerHTML = '<p class="text-muted text-center py-3">Bu iş emri için henüz uygunsuzluk raporu bulunmamaktadır.</p>';
        return;
    }
    
    // Status badge mapping
    const statusBadgeMap = {
        'draft': '<span class="status-badge status-grey">Taslak</span>',
        'submitted': '<span class="status-badge status-yellow">Gönderildi</span>',
        'approved': '<span class="status-badge status-green">Onaylandı</span>',
        'rejected': '<span class="status-badge status-red">Reddedildi</span>',
        'closed': '<span class="status-badge status-blue">Kapatıldı</span>'
    };
    
    // Severity badge mapping
    const severityBadgeMap = {
        'minor': '<span class="status-badge status-yellow">Minör</span>',
        'major': '<span class="status-badge status-orange">Majör</span>',
        'critical': '<span class="status-badge status-red">Kritik</span>'
    };
    
    const formatDate = (dateString) => {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleString('tr-TR', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };
    
    const ncrsTable = new TableComponent('ncrs-container', {
        title: 'Uygunsuzluk Raporları',
        icon: 'fas fa-exclamation-triangle',
        iconColor: 'text-primary',
        columns: [
            {
                field: 'ncr_number',
                label: 'NCR No',
                sortable: true,
                formatter: (value) => value || '-'
            },
            {
                field: 'title',
                label: 'Başlık',
                sortable: true,
                formatter: (value) => value || '-'
            },
            {
                field: 'status',
                label: 'Durum',
                sortable: true,
                formatter: (value) => {
                    return statusBadgeMap[value] || `<span class="status-badge status-grey">${value || '-'}</span>`;
                }
            },
            {
                field: 'severity',
                label: 'Önem Derecesi',
                sortable: true,
                formatter: (value) => {
                    return severityBadgeMap[value] || `<span class="status-badge status-grey">${value || '-'}</span>`;
                }
            },
            {
                field: 'defect_type_display',
                label: 'Kusur Tipi',
                sortable: false,
                formatter: (value) => value || '-'
            },
            {
                field: 'affected_quantity',
                label: 'Etkilenen Miktar',
                sortable: true,
                formatter: (value) => value || '-'
            },
            {
                field: 'assigned_team',
                label: 'Atanan Takım',
                sortable: false,
                formatter: (value) => value || '-'
            },
            {
                field: 'created_at',
                label: 'Oluşturulma Tarihi',
                sortable: true,
                type: 'datetime',
                formatter: (value) => formatDate(value)
            }
        ],
        data: ncrs,
        sortable: true,
        pagination: false,
        exportable: false,
        refreshable: false,
        small: true,
        striped: true,
        emptyMessage: 'Uygunsuzluk raporu bulunamadı',
        emptyIcon: 'fas fa-exclamation-triangle',
        actions: [
            {
                key: 'view',
                label: 'Detay',
                icon: 'fas fa-eye',
                class: 'btn-outline-info',
                onClick: (row) => {
                    // Open NCR details page in a new tab
                    window.open(`/quality-control/ncrs/?ncr=${row.id}`, '_blank');
                }
            }
        ]
    });
}

// Show Add Tier Modal
function showAddTierModal(jobNo, jobOrder) {
    if (!jobOrder.total_weight_kg) {
        showNotification('Önce toplam ağırlık belirlenmelidir', 'error');
        return;
    }
    
    const modal = new EditModal('price-tier-modal-container', {
        title: 'Yeni Fiyat Kademesi Ekle',
        icon: 'fas fa-plus-circle',
        size: 'md',
        showEditButton: false
    });
    
    modal.clearAll();
    modal.addSection({
        title: 'Kademe Bilgileri',
        icon: 'fas fa-info-circle',
        iconColor: 'text-primary'
    });
    
    modal.addField({
        id: 'tier-name',
        name: 'name',
        label: 'Ad',
        type: 'text',
        value: '',
        required: true,
        icon: 'fas fa-tag',
        colSize: 12
    });
    
    modal.addField({
        id: 'tier-price',
        name: 'price_per_kg',
        label: 'Fiyat/kg',
        type: 'number',
        value: '',
        required: true,
        step: '0.01',
        min: '0',
        icon: 'fas fa-money-bill-wave',
        colSize: 6
    });
    
    modal.addField({
        id: 'tier-currency',
        name: 'currency',
        label: 'Para Birimi',
        type: 'dropdown',
        value: 'TRY',
        options: CURRENCY_OPTIONS.map(c => ({ value: c.value, label: c.label })),
        icon: 'fas fa-coins',
        colSize: 6
    });
    
    modal.addField({
        id: 'tier-weight',
        name: 'allocated_weight_kg',
        label: 'Ayrılan Ağırlık (kg)',
        type: 'number',
        value: '',
        required: true,
        step: '0.01',
        min: '0',
        max: jobOrder.total_weight_kg.toString(),
        icon: 'fas fa-weight',
        colSize: 12,
        helpText: `Maksimum: ${jobOrder.total_weight_kg} kg`
    });
    
    modal.render();
    modal.show();
    
    modal.onSaveCallback(async (formData) => {
        try {
            await createPriceTier({
                job_order: jobNo,
                name: formData.name,
                price_per_kg: parseFloat(formData.price_per_kg),
                currency: formData.currency || 'TRY',
                allocated_weight_kg: parseFloat(formData.allocated_weight_kg)
            });
            showNotification('Fiyat kademesi eklendi', 'success');
            modal.hide();
            await loadPriceTiersTab(jobNo);
        } catch (error) {
            console.error('Error creating tier:', error);
            showNotification(error.message || 'Fiyat kademesi eklenirken hata oluştu', 'error');
        }
    });
}

// Show Edit Tier Modal
function showEditTierModal(jobNo, tier, jobOrder) {
    const modal = new EditModal('price-tier-modal-container', {
        title: 'Fiyat Kademesi Düzenle',
        icon: 'fas fa-edit',
        size: 'md',
        showEditButton: false
    });
    
    modal.clearAll();
    modal.addSection({
        title: 'Kademe Bilgileri',
        icon: 'fas fa-info-circle',
        iconColor: 'text-primary'
    });
    
    modal.addField({
        id: 'tier-name',
        name: 'name',
        label: 'Ad',
        type: 'text',
        value: tier.name || '',
        required: true,
        icon: 'fas fa-tag',
        colSize: 12
    });
    
    modal.addField({
        id: 'tier-price',
        name: 'price_per_kg',
        label: 'Fiyat/kg',
        type: 'number',
        value: tier.price_per_kg || '',
        required: true,
        step: '0.01',
        min: '0',
        icon: 'fas fa-money-bill-wave',
        colSize: 6
    });
    
    modal.addField({
        id: 'tier-currency',
        name: 'currency',
        label: 'Para Birimi',
        type: 'dropdown',
        value: tier.currency || 'TRY',
        options: CURRENCY_OPTIONS.map(c => ({ value: c.value, label: c.label })),
        icon: 'fas fa-coins',
        colSize: 6
    });
    
    modal.addField({
        id: 'tier-weight',
        name: 'allocated_weight_kg',
        label: 'Ayrılan Ağırlık (kg)',
        type: 'number',
        value: tier.allocated_weight_kg || '',
        required: true,
        step: '0.01',
        min: '0',
        max: jobOrder.total_weight_kg.toString(),
        icon: 'fas fa-weight',
        colSize: 12,
        helpText: `Maksimum: ${jobOrder.total_weight_kg} kg`
    });
    
    modal.render();
    modal.show();
    
    window.editingTierId = tier.id;
    
    modal.onSaveCallback(async (formData) => {
        try {
            await updatePriceTier(window.editingTierId, {
                name: formData.name,
                price_per_kg: parseFloat(formData.price_per_kg),
                currency: formData.currency || 'TRY',
                allocated_weight_kg: parseFloat(formData.allocated_weight_kg)
            });
            showNotification('Fiyat kademesi güncellendi', 'success');
            modal.hide();
            window.editingTierId = null;
            await loadPriceTiersTab(jobNo);
        } catch (error) {
            console.error('Error updating tier:', error);
            showNotification(error.message || 'Fiyat kademesi güncellenirken hata oluştu', 'error');
        }
    });
}

// Show Request Revision Modal
async function showRequestRevisionModal(releaseId, jobNo) {
    if (!requestRevisionModal) {
        showNotification('Revizyon modalı başlatılamadı', 'error');
        return;
    }

    window.pendingRevisionReleaseId = releaseId;
    window.pendingRevisionJobNo = jobNo;

    requestRevisionModal.clearAll();

    requestRevisionModal.addSection({
        title: 'Revizyon İsteği',
        icon: 'fas fa-edit',
        iconColor: 'text-warning'
    });

    requestRevisionModal.addField({
        id: 'revision-reason',
        name: 'reason',
        label: 'Revizyon Nedeni',
        type: 'textarea',
        value: '',
        required: true,
        placeholder: 'Revizyon nedenini açıklayın...',
        icon: 'fas fa-comment',
        colSize: 12,
        helpText: 'Revizyon nedenini detaylı olarak açıklayın'
    });

    requestRevisionModal.render();
    requestRevisionModal.show();
}

// Render Topics UI
function renderTopicsUI(container, topics, jobNo) {
    const getPriorityBadgeClass = (priority) => {
        switch (priority) {
            case 'urgent': return 'status-red';
            case 'high': return 'status-yellow';
            case 'normal': return 'status-blue';
            case 'low': return 'status-grey';
            default: return 'status-grey';
        }
    };
    
    const formatDateTime = (dateString) => {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleString('tr-TR', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };
    
    const formatDate = (dateString) => {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleDateString('tr-TR', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };
    
    container.innerHTML = `
        <div class="topics-section">
            <div class="d-flex justify-content-between align-items-center mb-3">
                <h6 class="mb-0">
                    <i class="fas fa-comments me-2 text-primary"></i>
                    Tartışmalar (${topics.length})
                </h6>
                <button class="btn btn-sm btn-primary" id="create-topic-btn">
                    <i class="fas fa-plus me-1"></i>Yeni Tartışma
                </button>
            </div>
            
            <div id="topics-list">
                ${topics.length === 0 ? `
                    <div class="text-center py-5 text-muted">
                        <i class="fas fa-comments fa-3x mb-3"></i>
                        <p>Henüz tartışma yok.</p>
                    </div>
                ` : topics.map(topic => `
                    <div class="topic-item card mb-3" data-topic-id="${topic.id}">
                        <div class="card-body">
                            <div class="d-flex justify-content-between align-items-start mb-2">
                                <div class="flex-grow-1">
                                    <h6 class="mb-1">
                                        <a href="#" class="topic-link text-decoration-none" data-topic-id="${topic.id}">
                                            ${topic.title || 'Başlıksız'}
                                        </a>
                                    </h6>
                                    <div class="text-muted small">
                                        <span class="status-badge ${getPriorityBadgeClass(topic.priority)} me-2">${topic.priority_display || topic.priority}</span>
                                        <span>${topic.created_by_name || 'Bilinmeyen'}</span>
                                        <span class="mx-1">•</span>
                                        <span>${formatDateTime(topic.created_at)}</span>
                                        <span class="mx-1">•</span>
                                        <span><i class="fas fa-comments me-1"></i>${topic.comment_count || 0} yorum</span>
                                        <span class="mx-1">•</span>
                                        <span><i class="fas fa-users me-1"></i>${topic.participant_count || 0} katılımcı</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    // Attach event listeners
    const createTopicBtn = container.querySelector('#create-topic-btn');
    if (createTopicBtn) {
        createTopicBtn.addEventListener('click', () => {
            showCreateTopicModal(jobNo);
        });
    }
    
    const topicLinks = container.querySelectorAll('.topic-link');
    topicLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const topicId = parseInt(link.getAttribute('data-topic-id'));
            if (topicId) {
                viewTopicDetail(topicId, jobNo);
            }
        });
    });
}

// Helper functions for mentions (reusable)
function getUserInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
}

function getAvatarColor(name) {
    if (!name) return '#6c757d';
    const colors = [
        '#0052CC', '#0065FF', '#0747A6', '#00875A', '#36B37E',
        '#FF5630', '#FFAB00', '#FF991F', '#6554C0', '#8777D9',
        '#00B8D9', '#00C7E6', '#DE350B', '#FF8F73', '#253858'
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
}

// Initialize @mention functionality for any textarea
function initializeMentionFunctionality(textarea, mentionSuggestionsContainer) {
    let allUsers = [];
    let mentionStartPos = -1;
    let selectedSuggestionIndex = -1;
    
    // Load users for @mentions
    (async () => {
        try {
            allUsers = await fetchAllUsers();
        } catch (error) {
            console.error('Error loading users for mentions:', error);
        }
    })();
    
    // Handle @mention detection
    textarea.addEventListener('input', (e) => {
        const text = e.target.value;
        const cursorPos = e.target.selectionStart;
        const textBeforeCursor = text.substring(0, cursorPos);
        
        // Check if we're typing after @
        const mentionMatch = textBeforeCursor.match(/@(\w*)$/);
        
        if (mentionMatch) {
            const query = mentionMatch[1].toLowerCase();
            mentionStartPos = cursorPos - query.length - 1; // -1 for @
            
            // Filter users based on query
            const filteredUsers = allUsers.filter(user => {
                const username = (user.username || '').toLowerCase();
                const fullName = (user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || '').toLowerCase();
                return username.includes(query) || fullName.includes(query);
            }).slice(0, 10); // Limit to 10 suggestions
            
            if (filteredUsers.length > 0) {
                selectedSuggestionIndex = -1;
                renderMentionSuggestions(filteredUsers, query, mentionSuggestionsContainer, textarea);
            } else {
                hideMentionSuggestions(mentionSuggestionsContainer);
            }
        } else {
            hideMentionSuggestions(mentionSuggestionsContainer);
        }
    });
    
    // Handle keyboard navigation in suggestions
    textarea.addEventListener('keydown', (e) => {
        if (mentionSuggestionsContainer.style.display === 'none') return;
        
        const suggestionItems = mentionSuggestionsContainer.querySelectorAll('.mention-suggestion-item');
        if (suggestionItems.length === 0) return;
        
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedSuggestionIndex = Math.min(selectedSuggestionIndex + 1, suggestionItems.length - 1);
            updateSuggestionSelection(suggestionItems);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedSuggestionIndex = Math.max(selectedSuggestionIndex - 1, -1);
            updateSuggestionSelection(suggestionItems);
        } else if (e.key === 'Enter' || e.key === 'Tab') {
            if (selectedSuggestionIndex >= 0 && selectedSuggestionIndex < suggestionItems.length) {
                e.preventDefault();
                const selectedItem = suggestionItems[selectedSuggestionIndex];
                const username = selectedItem.dataset.username;
                insertMention(username, textarea, mentionStartPos);
                hideMentionSuggestions(mentionSuggestionsContainer);
            }
        } else if (e.key === 'Escape') {
            hideMentionSuggestions(mentionSuggestionsContainer);
        }
    });
    
    // Hide suggestions when clicking outside
    const clickHandler = (e) => {
        if (!textarea.contains(e.target) && !mentionSuggestionsContainer.contains(e.target)) {
            hideMentionSuggestions(mentionSuggestionsContainer);
        }
    };
    document.addEventListener('click', clickHandler);
    
    function renderMentionSuggestions(users, query, container, textarea) {
        container.innerHTML = users.map((user, index) => {
            const username = user.username || '';
            const fullName = user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || username;
            const initials = getUserInitials(fullName);
            const avatarColor = getAvatarColor(fullName);
            
            return `
                <div class="mention-suggestion-item ${index === 0 ? 'selected' : ''}" 
                     data-username="${username}" 
                     data-full-name="${fullName}"
                     style="cursor: pointer; padding: 8px 12px; display: flex; align-items: center; gap: 10px; border-bottom: 1px solid #e1e5e9;">
                    <div class="mention-avatar" style="width: 24px; height: 24px; border-radius: 50%; background: ${avatarColor}; color: white; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 600; flex-shrink: 0;">
                        ${initials}
                    </div>
                    <div class="flex-grow-1">
                        <div style="font-weight: 500; color: #172b4d; font-size: 14px;">${fullName}</div>
                        <div style="font-size: 12px; color: #6c757d;">@${username}</div>
                    </div>
                </div>
            `;
        }).join('');
        
        container.style.display = 'block';
        
        // Add click handlers
        container.querySelectorAll('.mention-suggestion-item').forEach((item, index) => {
            item.addEventListener('click', () => {
                const username = item.dataset.username;
                insertMention(username, textarea, mentionStartPos);
                hideMentionSuggestions(container);
            });
            
            item.addEventListener('mouseenter', () => {
                selectedSuggestionIndex = index;
                updateSuggestionSelection(container.querySelectorAll('.mention-suggestion-item'));
            });
        });
    }
    
    function updateSuggestionSelection(items) {
        items.forEach((item, index) => {
            if (index === selectedSuggestionIndex) {
                item.style.backgroundColor = '#e3fcef';
                item.classList.add('selected');
            } else {
                item.style.backgroundColor = '';
                item.classList.remove('selected');
            }
        });
    }
    
    function insertMention(username, textarea, startPos) {
        const text = textarea.value;
        const beforeMention = text.substring(0, startPos);
        const afterMention = text.substring(textarea.selectionStart);
        const newText = beforeMention + `@${username} ` + afterMention;
        
        textarea.value = newText;
        const newCursorPos = startPos + username.length + 2; // +2 for @ and space
        textarea.setSelectionRange(newCursorPos, newCursorPos);
        textarea.focus();
    }
    
    function hideMentionSuggestions(container) {
        container.style.display = 'none';
        selectedSuggestionIndex = -1;
    }
}

// View Topic Detail
async function viewTopicDetail(topicId, jobNo) {
    try {
        const [topic, comments] = await Promise.all([
            getTopic(topicId),
            getTopicComments(topicId)
        ]);

        // Keep URL in sync so topic detail can be shared via email
        const resolvedJobNo = jobNo || topic.job_order || topic.job_order_no || null;
        {
            const url = new URL(window.location);
            if (resolvedJobNo) {
                url.searchParams.set('job_no', resolvedJobNo);
            }
            url.searchParams.set('topic_id', topicId.toString());
            window.history.pushState({}, '', url);
        }
        
        // Create detail modal
        const detailModal = new DisplayModal('topic-detail-modal-container', {
            title: `Tartışma: ${topic.title}`,
            icon: 'fas fa-comments',
            size: 'xl',
            fullscreen: true,
            showEditButton: false
        });

        // Remove topic_id from URL when the topic modal is closed (keep job_no)
        detailModal.onCloseCallback(() => {
            const url = new URL(window.location);
            url.searchParams.delete('topic_id');
            window.history.replaceState({}, '', url);
        });
        
        const getPriorityBadgeClass = (priority) => {
            switch (priority) {
                case 'urgent': return 'status-red';
                case 'high': return 'status-yellow';
                case 'normal': return 'status-blue';
                case 'low': return 'status-grey';
                default: return 'status-grey';
            }
        };
        
        const formatDateTime = (dateString) => {
            if (!dateString) return '-';
            const date = new Date(dateString);
            return date.toLocaleString('tr-TR', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        };
        
        // Format content with @mentions - enhanced version
        const formatContent = (content, mentionedUsers = []) => {
            if (!content) return '';
            let formatted = content;
            
            // Create a map of username to user data for quick lookup
            const userMap = {};
            if (mentionedUsers && Array.isArray(mentionedUsers)) {
                mentionedUsers.forEach(user => {
                    if (user.username) {
                        userMap[user.username] = user;
                    }
                });
            }
            
            // Replace @mentions with styled badges
            formatted = formatted.replace(/@(\w+)/g, (match, username) => {
                const user = userMap[username];
                const displayName = user ? (user.full_name || user.username) : username;
                return `<span class="mention-badge" data-username="${username}">@${displayName}</span>`;
            });
            
            // Preserve line breaks
            formatted = formatted.replace(/\n/g, '<br>');
            
            return formatted;
        };
        
        
        detailModal.addSection({
            title: 'Tartışma Detayı',
            icon: 'fas fa-info-circle',
            iconColor: 'text-primary',
            fields: [
                {
                    id: 'topic_title',
                    label: 'Başlık',
                    value: topic.title,
                    icon: 'fas fa-heading',
                    colSize: 12,
                    layout: 'horizontal'
                },
                {
                    id: 'topic_priority',
                    label: 'Öncelik',
                    value: topic.priority_display,
                    icon: 'fas fa-exclamation-triangle',
                    colSize: 12,
                    layout: 'horizontal',
                    format: (value) => `<span class="status-badge ${getPriorityBadgeClass(topic.priority)}">${value}</span>`
                },
                {
                    id: 'topic_created_by',
                    label: 'Oluşturan',
                    value: topic.created_by_name,
                    icon: 'fas fa-user',
                    colSize: 12,
                    layout: 'horizontal'
                },
                {
                    id: 'topic_created_at',
                    label: 'Oluşturulma',
                    value: formatDateTime(topic.created_at),
                    icon: 'fas fa-calendar',
                    colSize: 12,
                    layout: 'horizontal'
                }
            ]
        });
        
        detailModal.addCustomSection({
            id: 'topic-content',
            customContent: `
                <div class="mb-3">
                    <h6 class="mb-2"><i class="fas fa-align-left me-2"></i>İçerik</h6>
                    <div class="p-3 bg-light rounded" style="line-height: 1.6;">${formatContent(topic.content, topic.mentioned_users_data || [])}</div>
                </div>
            `
        });
        
        if (topic.attachments_data && topic.attachments_data.length > 0) {
            detailModal.addCustomSection({
                id: 'topic-attachments',
                customContent: `
                    <div class="mb-3">
                        <div id="topic-attachments-container"></div>
                    </div>
                `
            });
        }
        
        detailModal.addCustomSection({
            id: 'topic-comments',
            customContent: `
                <div class="mb-3">
                    <h6 class="mb-3">
                        <i class="fas fa-comments me-2"></i>Yorumlar (${comments.length})
                    </h6>
                    <div id="comments-list" class="mb-4">
                        ${comments.length === 0 ? '<p class="text-muted text-center py-4">Henüz yorum yok.</p>' : comments.map(comment => {
                            const initials = getUserInitials(comment.created_by_name);
                            const avatarColor = getAvatarColor(comment.created_by_name);
                            return `
                            <div class="comment-item mb-3 pb-3 border-bottom">
                                <div class="d-flex gap-3">
                                    <div class="comment-avatar" style="width: 32px; height: 32px; border-radius: 50%; background: ${avatarColor}; color: white; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; flex-shrink: 0;">
                                        ${initials}
                                    </div>
                                    <div class="flex-grow-1">
                                        <div class="d-flex align-items-center gap-2 mb-1">
                                            <span class="fw-medium" style="color: #172b4d;">${comment.created_by_name}</span>
                                            <span class="text-muted small">${formatDateTime(comment.created_at)}</span>
                                            ${comment.is_edited ? '<span class="text-muted small"><i class="fas fa-edit me-1"></i>Düzenlendi</span>' : ''}
                                        </div>
                                        <div class="comment-content" style="color: #172b4d; line-height: 1.6; margin-bottom: 8px;">
                                            ${formatContent(comment.content, comment.mentioned_users_data || [])}
                                        </div>
                                        ${comment.attachments_data && comment.attachments_data.length > 0 ? `
                                            <div class="mt-2" id="comment-attachments-${comment.id}"></div>
                                        ` : ''}
                                    </div>
                                </div>
                            </div>
                        `;
                        }).join('')}
                    </div>
                    <div class="border-top pt-3">
                        <div class="d-flex gap-3">
                            <div class="comment-avatar" style="width: 32px; height: 32px; border-radius: 50%; background: #0052CC; color: white; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; flex-shrink: 0;">
                                <i class="fas fa-user"></i>
                            </div>
                            <div class="flex-grow-1">
                                <div class="position-relative">
                                    <textarea id="new-comment-text" class="form-control mb-2" rows="3" placeholder="Yorum yazın... (@ile kullanıcı etiketleyin)" style="resize: vertical;"></textarea>
                                    <div id="mention-suggestions" class="mention-suggestions" style="display: none;"></div>
                                </div>
                                <div class="mb-2">
                                    <label class="form-label small">
                                        <i class="fas fa-paperclip me-1"></i>Dosyalar (Opsiyonel)
                                    </label>
                                    <input type="file" class="form-control form-control-sm" id="comment-files-input" multiple>
                                    <div id="comment-files-preview" class="mt-1"></div>
                                </div>
                                <button class="btn btn-sm btn-primary" id="add-comment-btn" data-topic-id="${topicId}">
                                    <i class="fas fa-paper-plane me-1"></i>Yorum Ekle
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `
        });
        
        detailModal.render();
        detailModal.show();
        
        // Initialize FileAttachments for topic attachments
        setTimeout(async () => {
            const topicAttachmentsContainer = document.getElementById('topic-attachments-container');
            if (topicAttachmentsContainer && topic.attachments_data && topic.attachments_data.length > 0) {
                const { FileAttachments } = await import('../../components/file-attachments/file-attachments.js');
                
                // Map API response to FileAttachments format
                const mappedFiles = topic.attachments_data.map(att => {
                    // Use file_url from API response (already a full URL with signed parameters)
                    const fileUrl = att.file_url || att.file || '';
                    return {
                        file_url: fileUrl,
                        file_name: att.name || 'Dosya',
                        uploaded_at: att.uploaded_at,
                        uploaded_by_username: att.uploaded_by || 'Bilinmeyen'
                    };
                });
                
                const fileAttachments = new FileAttachments('topic-attachments-container', {
                    title: 'Ekler',
                    titleIcon: 'fas fa-paperclip',
                    titleIconColor: 'text-primary',
                    layout: 'grid',
                    onFileClick: async (file) => {
                        const fileName = file.file_name || 'Dosya';
                        // Use file_extension from file object if available (FileAttachments already extracts it)
                        const fileExtension = file.file_extension || (fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : '');
                        const fileUrl = file.file_url;
                        
                        if (!fileUrl) {
                            console.error('File URL is missing');
                            return;
                        }
                        
                        // Wait for fileViewer to be available or import it
                        let viewer = window.fileViewer;
                        if (!viewer) {
                            try {
                                const { FileViewer } = await import('../../components/file-viewer/file-viewer.js');
                                viewer = new FileViewer();
                                // Set download callback for authenticated URLs
                                viewer.setDownloadCallback(async () => {
                                    await viewer.downloadFile(fileUrl, fileName);
                                });
                            } catch (error) {
                                console.error('Error loading FileViewer:', error);
                                showNotification('Dosya görüntüleyici yüklenemedi', 'error');
                                return;
                            }
                        }
                        
                        if (viewer) {
                            viewer.openFile(fileUrl, fileName, fileExtension);
                        }
                    },
                    onDownloadClick: async (fileUrl, fileName) => {
                        try {
                            // For signed URLs, fetch as blob and download
                            const response = await fetch(fileUrl);
                            if (!response.ok) {
                                throw new Error(`HTTP error! status: ${response.status}`);
                            }
                            const blob = await response.blob();
                            const url = window.URL.createObjectURL(blob);
                            const link = document.createElement('a');
                            link.href = url;
                            link.download = fileName;
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                            window.URL.revokeObjectURL(url);
                        } catch (error) {
                            console.error('Error downloading file:', error);
                            // Fallback to direct link
                            const link = document.createElement('a');
                            link.href = fileUrl;
                            link.download = fileName;
                            link.target = '_blank';
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                        }
                    }
                });
                
                fileAttachments.setFiles(mappedFiles);
            }
            
            // Initialize FileAttachments for comment attachments
            comments.forEach(comment => {
                if (comment.attachments_data && comment.attachments_data.length > 0) {
                    const commentAttachmentsContainer = document.getElementById(`comment-attachments-${comment.id}`);
                    if (commentAttachmentsContainer) {
                        (async () => {
                            const { FileAttachments } = await import('../../components/file-attachments/file-attachments.js');
                            
                            // Map API response to FileAttachments format
                            const mappedFiles = comment.attachments_data.map(att => {
                                // Use file_url from API response (already a full URL with signed parameters)
                                const fileUrl = att.file_url || att.file || '';
                                return {
                                    file_url: fileUrl,
                                    file_name: att.name || 'Dosya',
                                    uploaded_at: att.uploaded_at,
                                    uploaded_by_username: att.uploaded_by || 'Bilinmeyen'
                                };
                            });
                            
                            const fileAttachments = new FileAttachments(`comment-attachments-${comment.id}`, {
                                title: '',
                                showTitle: false,
                                layout: 'list',
                                maxThumbnailSize: 50,
                                onFileClick: async (file) => {
                                    const fileName = file.file_name || 'Dosya';
                                    // Use file_extension from file object if available (FileAttachments already extracts it)
                                    const fileExtension = file.file_extension || (fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : '');
                                    const fileUrl = file.file_url;
                                    
                                    if (!fileUrl) {
                                        console.error('File URL is missing');
                                        return;
                                    }
                                    
                                    // Wait for fileViewer to be available or import it
                                    let viewer = window.fileViewer;
                                    if (!viewer) {
                                        try {
                                            const { FileViewer } = await import('../../components/file-viewer/file-viewer.js');
                                            viewer = new FileViewer();
                                            // Set download callback for authenticated URLs
                                            viewer.setDownloadCallback(async () => {
                                                await viewer.downloadFile(fileUrl, fileName);
                                            });
                                        } catch (error) {
                                            console.error('Error loading FileViewer:', error);
                                            showNotification('Dosya görüntüleyici yüklenemedi', 'error');
                                            return;
                                        }
                                    }
                                    
                                    if (viewer) {
                                        viewer.openFile(fileUrl, fileName, fileExtension);
                                    }
                                },
                                onDownloadClick: async (fileUrl, fileName) => {
                                    try {
                                        // For signed URLs, fetch as blob and download
                                        const response = await fetch(fileUrl);
                                        if (!response.ok) {
                                            throw new Error(`HTTP error! status: ${response.status}`);
                                        }
                                        const blob = await response.blob();
                                        const url = window.URL.createObjectURL(blob);
                                        const link = document.createElement('a');
                                        link.href = url;
                                        link.download = fileName;
                                        document.body.appendChild(link);
                                        link.click();
                                        document.body.removeChild(link);
                                        window.URL.revokeObjectURL(url);
                                    } catch (error) {
                                        console.error('Error downloading file:', error);
                                        // Fallback to direct link
                                        const link = document.createElement('a');
                                        link.href = fileUrl;
                                        link.download = fileName;
                                        link.target = '_blank';
                                        document.body.appendChild(link);
                                        link.click();
                                        document.body.removeChild(link);
                                    }
                                }
                            });
                            
                            fileAttachments.setFiles(mappedFiles);
                        })();
                    }
                }
            });
        }, 100);
        
        // Initialize @mention functionality for comments
        const commentTextarea = document.getElementById('new-comment-text');
        const mentionSuggestions = document.getElementById('mention-suggestions');
        
        if (commentTextarea && mentionSuggestions) {
            initializeMentionFunctionality(commentTextarea, mentionSuggestions);
        }
        
        // Handle file selection preview for comments
        const commentFileInput = document.getElementById('comment-files-input');
        const commentFilePreview = document.getElementById('comment-files-preview');
        
        if (commentFileInput) {
            const updateCommentFilePreview = () => {
                const files = Array.from(commentFileInput.files);
                if (files.length > 0) {
                    commentFilePreview.innerHTML = `
                        <div class="d-flex flex-wrap gap-2">
                            ${files.map((file, index) => `
                                <span class="badge bg-secondary d-flex align-items-center gap-1">
                                    <i class="fas fa-file me-1"></i>${file.name}
                                    <button type="button" class="btn-close btn-close-white btn-sm" data-file-index="${index}" style="font-size: 0.7rem;"></button>
                                </span>
                            `).join('')}
                        </div>
                    `;
                    
                    // Handle remove file buttons
                    commentFilePreview.querySelectorAll('.btn-close').forEach(btn => {
                        btn.addEventListener('click', () => {
                            const index = parseInt(btn.getAttribute('data-file-index'));
                            const dt = new DataTransfer();
                            const currentFiles = Array.from(commentFileInput.files);
                            currentFiles.forEach((f, i) => {
                                if (i !== index) dt.items.add(f);
                            });
                            commentFileInput.files = dt.files;
                            updateCommentFilePreview();
                        });
                    });
                } else {
                    commentFilePreview.innerHTML = '';
                }
            };
            
            commentFileInput.addEventListener('change', updateCommentFilePreview);
        }
        
        // Add comment button
        const addCommentBtn = document.getElementById('add-comment-btn');
        if (addCommentBtn) {
            addCommentBtn.addEventListener('click', async () => {
                const commentText = document.getElementById('new-comment-text').value.trim();
                if (!commentText) {
                    showNotification('Lütfen yorum metni girin', 'error');
                    return;
                }
                
                try {
                    // Create comment first and get the response with ID
                    const commentResponse = await createComment({
                        topic: topicId,
                        content: commentText
                    });
                    
                    // Extract comment ID from response
                    const commentId = commentResponse.id;
                    if (!commentId) {
                        throw new Error('Comment ID not found in response');
                    }
                    
                    // Upload files if any, using the comment ID from response
                    const files = commentFileInput ? Array.from(commentFileInput.files) : [];
                    if (files.length > 0) {
                        try {
                            // Upload files one by one
                            for (const file of files) {
                                await uploadCommentAttachment(commentId, file);
                            }
                        } catch (fileError) {
                            console.error('Error uploading files:', fileError);
                            showNotification('Yorum eklendi ancak bazı dosyalar yüklenemedi', 'warning');
                        }
                    }
                    
                    showNotification('Yorum başarıyla eklendi', 'success');
                    
                    // Clear the textarea and file input
                    if (commentTextarea) {
                        commentTextarea.value = '';
                    }
                    if (commentFileInput) {
                        commentFileInput.value = '';
                        if (commentFilePreview) {
                            commentFilePreview.innerHTML = '';
                        }
                    }
                    
                    // Refresh comments in the modal
                    try {
                        const [updatedTopic, updatedComments] = await Promise.all([
                            getTopic(topicId),
                            getTopicComments(topicId)
                        ]);
                        
                        // Update comments list
                        const commentsList = document.getElementById('comments-list');
                        if (commentsList) {
                            if (updatedComments.length === 0) {
                                commentsList.innerHTML = '<p class="text-muted text-center py-4">Henüz yorum yok.</p>';
                            } else {
                                commentsList.innerHTML = updatedComments.map(comment => {
                                    const initials = getUserInitials(comment.created_by_name);
                                    const avatarColor = getAvatarColor(comment.created_by_name);
                                    return `
                                    <div class="comment-item mb-3 pb-3 border-bottom">
                                        <div class="d-flex gap-3">
                                            <div class="comment-avatar" style="width: 32px; height: 32px; border-radius: 50%; background: ${avatarColor}; color: white; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; flex-shrink: 0;">
                                                ${initials}
                                            </div>
                                            <div class="flex-grow-1">
                                                <div class="d-flex align-items-center gap-2 mb-1">
                                                    <span class="fw-medium" style="color: #172b4d;">${comment.created_by_name}</span>
                                                    <span class="text-muted small">${formatDateTime(comment.created_at)}</span>
                                                    ${comment.is_edited ? '<span class="text-muted small"><i class="fas fa-edit me-1"></i>Düzenlendi</span>' : ''}
                                                </div>
                                                <div class="comment-content" style="color: #172b4d; line-height: 1.6; margin-bottom: 8px;">
                                                    ${formatContent(comment.content, comment.mentioned_users_data || [])}
                                                </div>
                                                ${comment.attachments_data && comment.attachments_data.length > 0 ? `
                                                    <div class="mt-2" id="comment-attachments-${comment.id}"></div>
                                                ` : ''}
                                            </div>
                                        </div>
                                    </div>
                                `;
                                }).join('');
                                
                                // Re-initialize FileAttachments for comment attachments
                                setTimeout(async () => {
                                    updatedComments.forEach(comment => {
                                        if (comment.attachments_data && comment.attachments_data.length > 0) {
                                            const commentAttachmentsContainer = document.getElementById(`comment-attachments-${comment.id}`);
                                            if (commentAttachmentsContainer) {
                                                (async () => {
                                                    const { FileAttachments } = await import('../../components/file-attachments/file-attachments.js');
                                                    
                                                    const mappedFiles = comment.attachments_data.map(att => {
                                                        let fileUrl = att.file;
                                                        if (fileUrl && !fileUrl.startsWith('http')) {
                                                            fileUrl = fileUrl.startsWith('/') ? `${backendBase}${fileUrl}` : `${backendBase}/${fileUrl}`;
                                                        }
                                                        return {
                                                            file_url: fileUrl || '',
                                                            file_name: att.name || 'Dosya',
                                                            uploaded_at: att.uploaded_at,
                                                            uploaded_by_username: att.uploaded_by || 'Bilinmeyen'
                                                        };
                                                    });
                                                    
                                                    const fileAttachments = new FileAttachments(`comment-attachments-${comment.id}`, {
                                                        title: '',
                                                        showTitle: false,
                                                        layout: 'list',
                                                        maxThumbnailSize: 50,
                                                        onFileClick: async (file) => {
                                                            const fileName = file.file_name || 'Dosya';
                                                            // Use file_extension from file object if available (FileAttachments already extracts it)
                                                            const fileExtension = file.file_extension || (fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : '');
                                                            const fileUrl = file.file_url;
                                                            
                                                            if (!fileUrl) {
                                                                console.error('File URL is missing');
                                                                return;
                                                            }
                                                            
                                                            // Wait for fileViewer to be available or import it
                                                            let viewer = window.fileViewer;
                                                            if (!viewer) {
                                                                try {
                                                                    const { FileViewer } = await import('../../components/file-viewer/file-viewer.js');
                                                                    viewer = new FileViewer();
                                                                    // Set download callback for authenticated URLs
                                                                    viewer.setDownloadCallback(async () => {
                                                                        await viewer.downloadFile(fileUrl, fileName);
                                                                    });
                                                                } catch (error) {
                                                                    console.error('Error loading FileViewer:', error);
                                                                    showNotification('Dosya görüntüleyici yüklenemedi', 'error');
                                                                    return;
                                                                }
                                                            }
                                                            
                                                            if (viewer) {
                                                                viewer.openFile(fileUrl, fileName, fileExtension);
                                                            }
                                                        },
                                                        onDownloadClick: async (fileUrl, fileName) => {
                                                            try {
                                                                // For signed URLs, fetch as blob and download
                                                                const response = await fetch(fileUrl);
                                                                if (!response.ok) {
                                                                    throw new Error(`HTTP error! status: ${response.status}`);
                                                                }
                                                                const blob = await response.blob();
                                                                const url = window.URL.createObjectURL(blob);
                                                                const link = document.createElement('a');
                                                                link.href = url;
                                                                link.download = fileName;
                                                                document.body.appendChild(link);
                                                                link.click();
                                                                document.body.removeChild(link);
                                                                window.URL.revokeObjectURL(url);
                                                            } catch (error) {
                                                                console.error('Error downloading file:', error);
                                                                // Fallback to direct link
                                                                const link = document.createElement('a');
                                                                link.href = fileUrl;
                                                                link.download = fileName;
                                                                link.target = '_blank';
                                                                document.body.appendChild(link);
                                                                link.click();
                                                                document.body.removeChild(link);
                                                            }
                                                        }
                                                    });
                                                    
                                                    fileAttachments.setFiles(mappedFiles);
                                                })();
                                            }
                                        }
                                    });
                                }, 100);
                            }
                            
                            // Update comment count in header
                            const commentsHeader = detailModal.content.querySelector('h6');
                            if (commentsHeader) {
                                commentsHeader.innerHTML = `<i class="fas fa-comments me-2"></i>Yorumlar (${updatedComments.length})`;
                            }
                        }
                    } catch (refreshError) {
                        console.error('Error refreshing comments:', refreshError);
                    }
                    
                    // Refresh topics list (but keep modal open)
                    setTimeout(() => {
                        initializeTopicsTab(jobNo);
                    }, 100);
                } catch (error) {
                    console.error('Error adding comment:', error);
                    showNotification('Yorum eklenirken hata oluştu', 'error');
                }
            });
        }
    } catch (error) {
        console.error('Error viewing topic detail:', error);
        showNotification('Tartışma detayları yüklenirken hata oluştu', 'error');
    }
}

// Show Create Topic Modal
function showCreateTopicModal(jobNo) {
    const createModal = new EditModal('create-topic-modal-container', {
        title: 'Yeni Tartışma Oluştur',
        icon: 'fas fa-plus-circle',
        size: 'lg',
        showEditButton: false
    });
    
    createModal.addSection({
        title: 'Tartışma Bilgileri',
        icon: 'fas fa-info-circle',
        iconColor: 'text-primary'
    });
    
    createModal.addField({
        id: 'title',
        name: 'title',
        label: 'Başlık',
        type: 'text',
        required: true,
        icon: 'fas fa-heading',
        colSize: 12,
        helpText: 'Tartışma başlığı'
    });
    
    createModal.addField({
        id: 'content',
        name: 'content',
        label: 'İçerik',
        type: 'textarea',
        required: true,
        icon: 'fas fa-align-left',
        colSize: 12,
        helpText: 'Tartışma içeriği (@ile kullanıcı etiketleyin)',
        rows: 5
    });
    
    createModal.addField({
        id: 'priority',
        name: 'priority',
        label: 'Öncelik',
        type: 'select',
        required: true,
        icon: 'fas fa-exclamation-triangle',
        colSize: 12,
        options: [
            { value: 'low', label: 'Düşük' },
            { value: 'normal', label: 'Normal' },
            { value: 'high', label: 'Yüksek' },
            { value: 'urgent', label: 'Acil' }
        ],
        value: 'normal'
    });
    
    createModal.render();
    
    // Add @mention functionality to content textarea
    setTimeout(() => {
        const contentTextarea = document.getElementById('content');
        if (contentTextarea) {
            // Wrap textarea in a relative container for mention suggestions
            const textareaContainer = contentTextarea.parentElement;
            if (textareaContainer && !textareaContainer.querySelector('.mention-suggestions')) {
                const mentionSuggestions = document.createElement('div');
                mentionSuggestions.id = 'topic-mention-suggestions';
                mentionSuggestions.className = 'mention-suggestions';
                mentionSuggestions.style.display = 'none';
                textareaContainer.style.position = 'relative';
                textareaContainer.appendChild(mentionSuggestions);
                
                // Initialize mention functionality
                initializeMentionFunctionality(contentTextarea, mentionSuggestions);
            }
        }
    }, 100);
    
    // Add file upload section after rendering
    const form = createModal.form;
    const fileUploadSection = document.createElement('div');
    fileUploadSection.className = 'mb-3';
    fileUploadSection.innerHTML = `
        <label class="form-label">
            <i class="fas fa-paperclip me-2"></i>Dosyalar (Opsiyonel)
        </label>
        <input type="file" class="form-control" id="topic-files-input" multiple>
        <div id="topic-files-preview" class="mt-2"></div>
        <small class="text-muted">Birden fazla dosya seçebilirsiniz.</small>
    `;
    form.appendChild(fileUploadSection);
    
    // Handle file selection preview
    const fileInput = fileUploadSection.querySelector('#topic-files-input');
    const filePreview = fileUploadSection.querySelector('#topic-files-preview');
    
    const updateFilePreview = () => {
        const files = Array.from(fileInput.files);
        if (files.length > 0) {
            filePreview.innerHTML = `
                <div class="d-flex flex-wrap gap-2">
                    ${files.map((file, index) => `
                        <span class="badge bg-secondary d-flex align-items-center gap-1">
                            <i class="fas fa-file me-1"></i>${file.name}
                            <button type="button" class="btn-close btn-close-white btn-sm" data-file-index="${index}" style="font-size: 0.7rem;"></button>
                        </span>
                    `).join('')}
                </div>
            `;
            
            // Handle remove file buttons
            filePreview.querySelectorAll('.btn-close').forEach(btn => {
                btn.addEventListener('click', () => {
                    const index = parseInt(btn.getAttribute('data-file-index'));
                    const dt = new DataTransfer();
                    const currentFiles = Array.from(fileInput.files);
                    currentFiles.forEach((f, i) => {
                        if (i !== index) dt.items.add(f);
                    });
                    fileInput.files = dt.files;
                    updateFilePreview();
                });
            });
        } else {
            filePreview.innerHTML = '';
        }
    };
    
    fileInput.addEventListener('change', updateFilePreview);
    
    createModal.onSaveCallback(async (data) => {
        try {
            // Create topic first and get the response with ID
            const topicResponse = await createTopic({
                job_order: jobNo,
                title: data.title,
                content: data.content,
                priority: data.priority
            });
            
            // Extract topic ID from response
            const topicId = topicResponse.id;
            if (!topicId) {
                throw new Error('Topic ID not found in response');
            }
            
            // Upload files if any, using the topic ID from response
            const files = Array.from(fileInput.files);
            if (files.length > 0) {
                try {
                    // Upload files one by one
                    for (const file of files) {
                        await uploadTopicAttachment(topicId, file);
                    }
                } catch (fileError) {
                    console.error('Error uploading files:', fileError);
                    showNotification('Tartışma oluşturuldu ancak bazı dosyalar yüklenemedi', 'warning');
                }
            }
            
            createModal.hide();
            showNotification('Tartışma başarıyla oluşturuldu', 'success');
            
            // Refresh topics
            setTimeout(() => {
                initializeTopicsTab(jobNo);
            }, 100);
        } catch (error) {
            console.error('Error creating topic:', error);
            let errorMessage = 'Tartışma oluşturulurken hata oluştu';
            try {
                const errorData = JSON.parse(error.message);
                if (typeof errorData === 'object') {
                    const errors = Object.values(errorData).flat();
                    errorMessage = errors.join(', ') || errorMessage;
                }
            } catch (e) {}
            showNotification(errorMessage, 'error');
        }
    });
    
    createModal.show();
}


window.showCreateChildJobOrderModal = async function(parentJobNo) {
    if (customers.length === 0) {
        showNotification('Müşteri verileri yükleniyor, lütfen bekleyin...', 'warning');
        return;
    }

    // Find parent job order to get customer info
    // First check main jobOrders array
    let parentJob = jobOrders.find(j => j.job_no === parentJobNo);
    
    // If not found, check childrenCache (for grandchildren)
    if (!parentJob) {
        for (const [parentJobNoKey, children] of childrenCache.entries()) {
            const child = children.find(j => j.job_no === parentJobNo);
            if (child) {
                parentJob = child;
                break;
            }
        }
    }
    
    // If still not found, fetch from API
    if (!parentJob) {
        try {
            parentJob = await getJobOrderByJobNo(parentJobNo);
        } catch (error) {
            console.error('Error fetching parent job order:', error);
            showNotification('Ana iş emri bulunamadı', 'error');
            return;
        }
    }
    
    if (!parentJob) {
        showNotification('Ana iş emri bulunamadı', 'error');
        return;
    }

    // Calculate the next extension number based on existing children
    const childrenCount = parentJob.children_count || 0;
    const nextExtension = String(childrenCount + 1).padStart(2, '0'); // "01", "02", etc.

    // Clear and configure the create modal
    createJobOrderModal.clearAll();
    
    // Add Basic Information section
    createJobOrderModal.addSection({
        title: 'Temel Bilgiler',
        icon: 'fas fa-info-circle',
        iconColor: 'text-primary'
    });

    // Add job_no field with extension input (pre-filled with next extension)
    createJobOrderModal.addField({
        id: 'job_no_extension',
        name: 'job_no_extension',
        label: 'İş Emri No',
        type: 'text',
        value: nextExtension,
        placeholder: '01',
        required: true,
        icon: 'fas fa-barcode',
        colSize: 6,
        helpText: 'Alt iş emri uzantısı (örn: 01, 02)'
    });

    createJobOrderModal.addField({
        id: 'title',
        name: 'title',
        label: 'Başlık',
        type: 'text',
        placeholder: 'Alt iş emri başlığını girin',
        required: true,
        icon: 'fas fa-heading',
        colSize: 12,
        helpText: 'Alt iş emri başlığı'
    });

    createJobOrderModal.addField({
        id: 'description',
        name: 'description',
        label: 'Açıklama',
        type: 'textarea',
        placeholder: 'Detaylı açıklama',
        icon: 'fas fa-align-left',
        colSize: 12,
        helpText: 'Detaylı açıklama'
    });

    createJobOrderModal.addField({
        id: 'quantity',
        name: 'quantity',
        label: 'Miktar',
        type: 'number',
        value: '1',
        placeholder: 'Miktar',
        icon: 'fas fa-hashtag',
        colSize: 6,
        helpText: 'İş emri miktarı',
        min: 1,
        step: 1
    });

    createJobOrderModal.addField({
        id: 'incoterms',
        name: 'incoterms',
        label: 'Teslim Şekli',
        type: 'text',
        placeholder: 'Teslim şekli',
        icon: 'fas fa-globe',
        colSize: 6,
        helpText: 'Teslim şekli bilgisi'
    });

    // Add Dates section (customer is inherited from parent)
    createJobOrderModal.addSection({
        title: 'Tarihler',
        icon: 'fas fa-calendar-alt',
        iconColor: 'text-info'
    });

    createJobOrderModal.addField({
        id: 'target_completion_date',
        name: 'target_completion_date',
        label: 'Hedef Tamamlanma Tarihi',
        type: 'date',
        value: parentJob.target_completion_date ? parentJob.target_completion_date.split('T')[0] : '',
        icon: 'fas fa-calendar-check',
        colSize: 6,
        helpText: 'Hedef tamamlanma tarihi'
    });

    createJobOrderModal.addSection({
        title: 'Maliyet Bilgileri',
        icon: 'fas fa-dollar-sign',
        iconColor: 'text-warning'
    });

    createJobOrderModal.addField({
        id: 'general_expenses_rate',
        name: 'general_expenses_rate',
        label: 'Genel Gider Oranı',
        type: 'number',
        value: parentJob.general_expenses_rate ?? '0.0000',
        placeholder: '0.0000',
        required: true,
        icon: 'fas fa-percent',
        colSize: 12,
        step: '0.0001',
        helpText: 'Genel gider oranı (zorunlu)'
    });

    // Store parent job no for form submission
    window.creatingChildForParent = parentJobNo;

    // Render and show modal
    createJobOrderModal.render();
    
    // Flag to prevent duplicate modifications
    let fieldModified = false;
    
    // Function to modify the field after modal is shown
    const modifyField = () => {
        if (fieldModified) return; // Prevent duplicate modifications
        
        const fieldGroup = createJobOrderModal.container.querySelector('[data-field-id="job_no_extension"]');
        if (fieldGroup) {
            // Ensure field-group doesn't cause wrapping
            fieldGroup.style.display = 'block';
            fieldGroup.style.width = '100%';
            
            const input = fieldGroup.querySelector('.field-input');
            if (input && !input.closest('.input-group')) { // Check if already modified
                // Create a composite input group - ensure it's on same line
                const newInputGroup = document.createElement('div');
                newInputGroup.className = 'input-group';
                newInputGroup.style.display = 'flex';
                newInputGroup.style.flexWrap = 'nowrap';
                newInputGroup.style.width = '100%';
                newInputGroup.style.alignItems = 'stretch';
                
                // Create prefix span (appears inline with input)
                const prefixSpan = document.createElement('span');
                prefixSpan.className = 'input-group-text';
                prefixSpan.textContent = parentJobNo + '-';
                prefixSpan.style.fontWeight = 'bold';
                prefixSpan.style.borderRight = 'none';
                prefixSpan.style.backgroundColor = '#f8f9fa';
                prefixSpan.style.paddingRight = '0.375rem';
                prefixSpan.style.whiteSpace = 'nowrap';
                prefixSpan.style.flexShrink = '0';
                prefixSpan.style.display = 'flex';
                prefixSpan.style.alignItems = 'center';
                
                // Replace the input with the input-group containing prefix and input
                input.parentNode.replaceChild(newInputGroup, input);
                newInputGroup.appendChild(prefixSpan);
                newInputGroup.appendChild(input);
                
                // Update input attributes
                input.className = 'form-control field-input';
                input.placeholder = '01';
                input.id = 'job_no_extension';
                input.name = 'job_no_extension';
                input.style.borderLeft = 'none';
                input.style.paddingLeft = '0.375rem';
                input.style.flex = '1 1 auto';
                input.style.minWidth = '0';
                input.style.width = 'auto';
                
                // Set the default value (next extension number) if not already set
                if (!input.value || input.value === '') {
                    const childrenCount = parentJob.children_count || 0;
                    const nextExtension = String(childrenCount + 1).padStart(2, '0');
                    input.value = nextExtension;
                }
                
                fieldModified = true;
            }
        }
    };
    
    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
        modifyField();
    });
    
    // Also modify after modal is shown (in case DOM wasn't ready)
    const modalElement = createJobOrderModal.container.querySelector('#editModal');
    if (modalElement) {
        const handleShown = () => {
            modifyField();
            modalElement.removeEventListener('shown.bs.modal', handleShown);
        };
        modalElement.addEventListener('shown.bs.modal', handleShown);
    }
    
    createJobOrderModal.show();
};

window.startJobOrder = async function(jobNo) {
    confirmationModal.show({
        title: 'İş Emri Başlatma',
        message: `İş emri ${jobNo} başlatılsın mı?`,
        confirmText: 'Başlat',
        onConfirm: async () => {
            try {
                const response = await startJobOrderAPI(jobNo);
                if (response && response.status === 'success') {
                    showNotification(response.message || 'İş emri başlatıldı', 'success');
                    await loadJobOrders();
                } else {
                    throw new Error('İş emri başlatılamadı');
                }
            } catch (error) {
                console.error('Error starting job order:', error);
                let errorMessage = 'İş emri başlatılırken hata oluştu';
                try {
                    if (error.message) {
                        const errorData = JSON.parse(error.message);
                        if (typeof errorData === 'object') {
                            const errors = Object.values(errorData).flat();
                            errorMessage = errors.join(', ') || errorMessage;
                        }
                    }
                } catch (e) {}
                showNotification(errorMessage, 'error');
            }
        }
    });
};


window.holdJobOrder = async function(jobNo) {
    // Store the job number for the callback
    window.holdingJobOrderNo = jobNo;
    
    // Clear and configure the hold modal
    holdJobOrderModal.clearAll();
    
    holdJobOrderModal.addSection({
        title: 'Bekletme Nedeni',
        icon: 'fas fa-info-circle',
        iconColor: 'text-warning'
    });
    
    holdJobOrderModal.addField({
        id: 'reason',
        name: 'reason',
        label: 'Bekletme Nedeni (Opsiyonel)',
        type: 'textarea',
        value: '',
        icon: 'fas fa-comment',
        colSize: 12,
        helpText: 'İş emrinin neden bekletildiğini açıklayın',
        rows: 4
    });
    
    // Set up save callback
    holdJobOrderModal.onSaveCallback(async (formData) => {
        const jobNo = window.holdingJobOrderNo;
        if (!jobNo) {
            showNotification('Bekletilecek iş emri bulunamadı', 'error');
            return;
        }
        
        try {
            const response = await holdJobOrderAPI(jobNo, formData.reason ? { reason: formData.reason } : {});
            if (response && response.status === 'success') {
                holdJobOrderModal.hide();
                window.holdingJobOrderNo = null;
                showNotification(response.message || 'İş emri beklemede', 'success');
                await loadJobOrders();
            } else {
                throw new Error('İş emri bekletilemedi');
            }
        } catch (error) {
            console.error('Error holding job order:', error);
            let errorMessage = 'İş emri bekletilirken hata oluştu';
            try {
                if (error.message) {
                    const errorData = JSON.parse(error.message);
                    if (typeof errorData === 'object') {
                        const errors = Object.values(errorData).flat();
                        errorMessage = errors.join(', ') || errorMessage;
                    }
                }
            } catch (e) {}
            showNotification(errorMessage, 'error');
        }
    });
    
    // Render and show modal
    holdJobOrderModal.render();
    holdJobOrderModal.show();
};

window.resumeJobOrder = async function(jobNo) {
    // Show confirmation modal
    confirmationModal.setOnConfirm(async () => {
        try {
            const response = await resumeJobOrderAPI(jobNo);
            if (response && response.status === 'success') {
                confirmationModal.hide();
                showNotification(response.message || 'İş emri devam ediyor', 'success');
                await loadJobOrders();
            } else {
                throw new Error('İş emri devam ettirilemedi');
            }
        } catch (error) {
            console.error('Error resuming job order:', error);
            let errorMessage = 'İş emri devam ettirilirken hata oluştu';
            try {
                if (error.message) {
                    const errorData = JSON.parse(error.message);
                    if (typeof errorData === 'object') {
                        const errors = Object.values(errorData).flat();
                        errorMessage = errors.join(', ') || errorMessage;
                    }
                }
            } catch (e) {}
            confirmationModal.hide();
            showNotification(errorMessage, 'error');
        }
    });
    
    confirmationModal.show({
        title: 'İş Emri Devam Ettirme',
        message: `İş emri ${jobNo} devam ettirilsin mi?`,
        icon: 'fas fa-play-circle',
        confirmText: 'Evet, Devam Ettir',
        cancelText: 'Vazgeç',
        confirmButtonClass: 'btn-info'
    });
};

window.cancelJobOrder = async function(jobNo) {
    // Show confirmation modal but don't make the API request
    confirmationModal.show({
        title: 'İş Emri İptal Onayı',
        message: `İş emri ${jobNo} iptal edilecek mi? Bu işlem geri alınamaz.`,
        icon: 'fas fa-exclamation-triangle',
        confirmText: 'Evet',
        cancelText: 'Vazgeç',
        confirmButtonClass: 'btn-danger',
        onConfirm: () => {
            // Don't make the API request - just show a message
            confirmationModal.hide();
            showNotification('İş emri iptal işlemi gerçekleştirilemiyor. Lütfen sistem yöneticisi ile iletişime geçin.', 'info');
        }
    });
};

window.recalculateProgress = async function(jobNo) {
    confirmationModal.show({
        title: 'İlerleme Yeniden Hesaplama',
        message: `İş emri ${jobNo} için ilerleme yüzdesi yeniden hesaplansın mı?`,
        icon: 'fas fa-calculator',
        confirmText: 'Evet, Hesapla',
        cancelText: 'Vazgeç',
        confirmButtonClass: 'btn-info',
        onConfirm: async () => {
            try {
                const response = await recalculateJobOrderProgress(jobNo);
                if (response && response.job_no) {
                    confirmationModal.hide();
                    const oldPercentage = response.old_percentage !== undefined ? response.old_percentage.toFixed(1) : 'N/A';
                    const newPercentage = response.new_percentage !== undefined ? response.new_percentage.toFixed(1) : 'N/A';
                    showNotification(
                        `İlerleme yeniden hesaplandı. Eski: %${oldPercentage}, Yeni: %${newPercentage}`,
                        'success'
                    );
                    await loadJobOrders();
                } else {
                    throw new Error('İlerleme yeniden hesaplanamadı');
                }
            } catch (error) {
                console.error('Error recalculating progress:', error);
                let errorMessage = 'İlerleme yeniden hesaplanırken hata oluştu';
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
                confirmationModal.hide();
                showNotification(errorMessage, 'error');
            }
        }
    });
};

function showCreateJobOrderModal() {
    if (customers.length === 0) {
        showNotification('Müşteri verileri yükleniyor, lütfen bekleyin...', 'warning');
        return;
    }

    // Clear any parent flag
    window.creatingChildForParent = null;
    window.selectedCustomerCode = null; // Store selected customer code

    // Clear and configure the create modal
    createJobOrderModal.clearAll();
    
    // Add Customer Information section (first, so user selects customer first)
    createJobOrderModal.addSection({
        title: 'Müşteri Bilgileri',
        icon: 'fas fa-building',
        iconColor: 'text-success'
    });

    createJobOrderModal.addField({
        id: 'customer',
        name: 'customer',
        label: 'Müşteri',
        type: 'dropdown',
        placeholder: 'Müşteri seçin...',
        required: true,
        icon: 'fas fa-users',
        colSize: 6,
        helpText: 'Müşteri seçin (arama yapabilirsiniz)',
        searchable: true, // Enable search
        options: [] // Empty initially, will be loaded async
    });

    // Add Basic Information section
    createJobOrderModal.addSection({
        title: 'Temel Bilgiler',
        icon: 'fas fa-info-circle',
        iconColor: 'text-primary'
    });

    createJobOrderModal.addField({
        id: 'job_no_extension',
        name: 'job_no_extension',
        label: 'İş Emri No',
        type: 'text',
        placeholder: '01',
        required: true,
        icon: 'fas fa-barcode',
        colSize: 6,
        helpText: 'İş emri uzantısı (örn: 01, 02)',
        disabled: true // Disabled until customer is selected
    });

    createJobOrderModal.addField({
        id: 'title',
        name: 'title',
        label: 'Başlık',
        type: 'text',
        placeholder: 'İş emri başlığını girin',
        required: true,
        icon: 'fas fa-heading',
        colSize: 6,
        helpText: 'İş emri başlığı'
    });

    createJobOrderModal.addField({
        id: 'description',
        name: 'description',
        label: 'Açıklama',
        type: 'textarea',
        placeholder: 'Detaylı açıklama',
        icon: 'fas fa-align-left',
        colSize: 12,
        helpText: 'Detaylı açıklama'
    });

    createJobOrderModal.addField({
        id: 'customer_order_no',
        name: 'customer_order_no',
        label: 'Müşteri Sipariş No',
        type: 'text',
        placeholder: 'Müşteri sipariş numarası',
        icon: 'fas fa-file-invoice',
        colSize: 6,
        helpText: 'Müşteri sipariş numarası'
    });

    createJobOrderModal.addField({
        id: 'quantity',
        name: 'quantity',
        label: 'Miktar',
        type: 'number',
        value: '1',
        placeholder: 'Miktar',
        icon: 'fas fa-hashtag',
        colSize: 6,
        helpText: 'İş emri miktarı',
        min: 1,
        step: 1
    });

    createJobOrderModal.addField({
        id: 'incoterms',
        name: 'incoterms',
        label: 'Teslim Şekli',
        type: 'text',
        placeholder: 'Teslim şekli',
        icon: 'fas fa-globe',
        colSize: 6,
        helpText: 'Teslim şekli bilgisi'
    });

    // Add Dates section
    createJobOrderModal.addSection({
        title: 'Tarihler',
        icon: 'fas fa-calendar-alt',
        iconColor: 'text-info'
    });

    createJobOrderModal.addField({
        id: 'target_completion_date',
        name: 'target_completion_date',
        label: 'Hedef Tamamlanma Tarihi',
        type: 'date',
        icon: 'fas fa-calendar-check',
        colSize: 6,
        helpText: 'Hedef tamamlanma tarihi'
    });

    // Add Cost Information section
    createJobOrderModal.addSection({
        title: 'Maliyet Bilgileri',
        icon: 'fas fa-dollar-sign',
        iconColor: 'text-warning'
    });

    createJobOrderModal.addField({
        id: 'estimated_cost',
        name: 'estimated_cost',
        label: 'Tahmini Maliyet',
        type: 'number',
        placeholder: 'Tahmini maliyet',
        icon: 'fas fa-calculator',
        colSize: 12,
        helpText: 'Tahmini maliyet'
    });

    createJobOrderModal.addField({
        id: 'general_expenses_rate',
        name: 'general_expenses_rate',
        label: 'Genel Gider Oranı',
        type: 'number',
        placeholder: '0.0000',
        required: true,
        icon: 'fas fa-percent',
        colSize: 12,
        step: '0.0001',
        helpText: 'Genel gider oranı (zorunlu)'
    });

    // Render and show modal
    createJobOrderModal.render();
    
    // Flag to prevent duplicate modifications
    let fieldModified = false;
    
    // Function to update the job_no field with customer code prefix
    const updateJobNoField = (customerCode) => {
        if (fieldModified) {
            // Update existing prefix
            const fieldGroup = createJobOrderModal.container.querySelector('[data-field-id="job_no_extension"]');
            if (fieldGroup) {
                const inputGroup = fieldGroup.querySelector('.input-group');
                if (inputGroup) {
                    const prefixSpan = inputGroup.querySelector('.input-group-text');
                    if (prefixSpan) {
                        prefixSpan.textContent = customerCode + '-';
                    }
                    const input = inputGroup.querySelector('.field-input');
                    if (input) {
                        input.disabled = false;
                    }
                }
            }
        } else {
            // Create the composite field for the first time
            const fieldGroup = createJobOrderModal.container.querySelector('[data-field-id="job_no_extension"]');
            if (fieldGroup) {
                fieldGroup.style.display = 'block';
                fieldGroup.style.width = '100%';
                
                const input = fieldGroup.querySelector('.field-input');
                if (input && !input.closest('.input-group')) {
                    // Create a composite input group
                    const newInputGroup = document.createElement('div');
                    newInputGroup.className = 'input-group';
                    newInputGroup.style.display = 'flex';
                    newInputGroup.style.flexWrap = 'nowrap';
                    newInputGroup.style.width = '100%';
                    newInputGroup.style.alignItems = 'stretch';
                    
                    // Create prefix span
                    const prefixSpan = document.createElement('span');
                    prefixSpan.className = 'input-group-text';
                    prefixSpan.textContent = customerCode + '-';
                    prefixSpan.style.fontWeight = 'bold';
                    prefixSpan.style.borderRight = 'none';
                    prefixSpan.style.backgroundColor = '#f8f9fa';
                    prefixSpan.style.paddingRight = '0.375rem';
                    prefixSpan.style.whiteSpace = 'nowrap';
                    prefixSpan.style.flexShrink = '0';
                    prefixSpan.style.display = 'flex';
                    prefixSpan.style.alignItems = 'center';
                    
                    // Replace the input with the input-group
                    input.parentNode.replaceChild(newInputGroup, input);
                    newInputGroup.appendChild(prefixSpan);
                    newInputGroup.appendChild(input);
                    
                    // Update input attributes
                    input.className = 'form-control field-input';
                    input.placeholder = '01';
                    input.id = 'job_no_extension';
                    input.name = 'job_no_extension';
                    input.style.borderLeft = 'none';
                    input.style.paddingLeft = '0.375rem';
                    input.style.flex = '1 1 auto';
                    input.style.minWidth = '0';
                    input.style.width = 'auto';
                    input.disabled = false;
                    
                    fieldModified = true;
                }
            }
        }
    };
    
    // Set up async customer dropdown with search and pagination
    const setupAsyncCustomerDropdown = async () => {
        // Find the dropdown container created by EditModal
        const dropdownContainer = createJobOrderModal.container.querySelector('#dropdown-customer');
        if (!dropdownContainer) {
            // Retry after a short delay if container not found
            setTimeout(setupAsyncCustomerDropdown, 100);
            return;
        }

        // Get the existing ModernDropdown instance from EditModal
        const existingDropdown = createJobOrderModal.dropdowns.get('customer');
        if (!existingDropdown) {
            setTimeout(setupAsyncCustomerDropdown, 100);
            return;
        }

        let currentPage = 1;
        let hasMore = true;
        let isLoading = false;
        let searchTimeout = null;
        let allLoadedCustomers = [];
        let currentSearchTerm = '';

        // Function to load customers from API
        const loadCustomers = async (page = 1, search = '', append = false) => {
            if (isLoading) return;
            isLoading = true;

            try {
                const response = await listCustomers({
                    page: page,
                    search: search || undefined,
                    is_active: true,
                    ordering: 'code',
                    page_size: 20
                });

                const newCustomers = response.results || [];
                
                if (append) {
                    allLoadedCustomers = [...allLoadedCustomers, ...newCustomers];
                } else {
                    allLoadedCustomers = newCustomers;
                }

                // Convert to dropdown items
                const items = allLoadedCustomers.map(c => ({
                    value: c.id.toString(),
                    text: `${c.code} - ${c.name}`
                }));

                // Update dropdown items
                if (append) {
                    // Append new items - get current items from dropdown
                    const currentItems = existingDropdown.items || [];
                    existingDropdown.setItems([...currentItems, ...items]);
                } else {
                    // Replace items
                    existingDropdown.setItems(items);
                }

                // Check if there are more pages
                hasMore = !!response.next;
                currentPage = page;

            } catch (error) {
                console.error('Error loading customers:', error);
                showNotification('Müşteriler yüklenirken hata oluştu', 'error');
            } finally {
                isLoading = false;
            }
        };

        // Enable search on the dropdown
        if (existingDropdown.searchInput) {
            // Override the default filterItems to use API search instead
            const originalFilter = existingDropdown.filterItems.bind(existingDropdown);
            
            existingDropdown.searchInput.addEventListener('input', (e) => {
                const searchTerm = e.target.value.trim();
                currentSearchTerm = searchTerm;

                // Clear existing timeout
                if (searchTimeout) {
                    clearTimeout(searchTimeout);
                }

                // Only send request if 3 or more characters are entered
                if (searchTerm.length >= 3) {
                    // Debounce search (500ms)
                    searchTimeout = setTimeout(async () => {
                        currentPage = 1;
                        hasMore = true;
                        allLoadedCustomers = [];
                        await loadCustomers(1, searchTerm, false);
                    }, 500);
                } else if (searchTerm.length === 0) {
                    // If search is cleared, reload initial page
                    searchTimeout = setTimeout(async () => {
                        currentPage = 1;
                        hasMore = true;
                        allLoadedCustomers = [];
                        await loadCustomers(1, '', false);
                    }, 500);
                } else {
                    // If less than 3 characters, clear the dropdown items
                    existingDropdown.setItems([]);
                }
            });
        }

        // Infinite scroll pagination
        const itemsContainer = existingDropdown.itemsContainer;
        if (itemsContainer) {
            itemsContainer.addEventListener('scroll', async () => {
                const scrollTop = itemsContainer.scrollTop;
                const scrollHeight = itemsContainer.scrollHeight;
                const clientHeight = itemsContainer.clientHeight;

                // Load next page when scrolled near bottom (within 50px)
                if (scrollTop + clientHeight >= scrollHeight - 50 && hasMore && !isLoading) {
                    await loadCustomers(currentPage + 1, currentSearchTerm, true);
                }
            });
        }

        // Initial load
        await loadCustomers(1, '', false);

        // Handle customer selection
        dropdownContainer.addEventListener('dropdown:select', (e) => {
            const customerId = e.detail.value;
            if (customerId) {
                const customer = allLoadedCustomers.find(c => c.id.toString() === customerId);
                if (customer && customer.code) {
                    window.selectedCustomerCode = customer.code;
                    updateJobNoField(customer.code);
                }
            }
        });
    };

    // Set up customer dropdown change listener (legacy - keeping for compatibility)
    const setupCustomerListener = () => {
        // This is now handled by setupAsyncCustomerDropdown
        // Keeping this function for any other dropdowns that might need it
        const dropdownContainer = createJobOrderModal.container.querySelector('#dropdown-customer');
        if (dropdownContainer) {
            // Listen to dropdown:select event
            dropdownContainer.addEventListener('dropdown:select', (e) => {
                const customerId = e.detail.value;
                if (customerId) {
                    const customer = customers.find(c => c.id.toString() === customerId);
                    if (customer && customer.code) {
                        window.selectedCustomerCode = customer.code;
                        updateJobNoField(customer.code);
                    }
                }
            });
        } else {
            // Fallback: try to find by field ID and search within
            const customerField = createJobOrderModal.container.querySelector('[data-field-id="customer"]');
            if (customerField) {
                const container = customerField.querySelector('.dropdown-field-container');
                if (container) {
                    container.addEventListener('dropdown:select', (e) => {
                        const customerId = e.detail.value;
                        if (customerId) {
                            const customer = customers.find(c => c.id.toString() === customerId);
                            if (customer && customer.code) {
                                window.selectedCustomerCode = customer.code;
                                updateJobNoField(customer.code);
                            }
                        }
                    });
                }
            }
        }
    };
    
    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
        setupAsyncCustomerDropdown();
    });
    
    // Also set up after modal is shown
    const modalElement = createJobOrderModal.container.querySelector('#editModal');
    if (modalElement) {
        const handleShown = () => {
            setupAsyncCustomerDropdown();
            modalElement.removeEventListener('shown.bs.modal', handleShown);
        };
        modalElement.addEventListener('shown.bs.modal', handleShown);
    }
    
    createJobOrderModal.show();
}

async function createJobOrder(formData) {
    try {
        // If creating a child job, set parent and don't include customer
        if (window.creatingChildForParent) {
            formData.parent = window.creatingChildForParent;
            // Combine parent job number with extension for job_no
            if (formData.job_no_extension) {
                formData.job_no = window.creatingChildForParent + '-' + formData.job_no_extension;
                delete formData.job_no_extension; // Remove the extension field
            }
            // Remove customer field - it will be inherited from parent
            delete formData.customer;
            window.creatingChildForParent = null; // Clear the flag
        } else {
            // For root jobs, combine customer code with extension for job_no
            // First, ensure we have the customer code
            let customerCode = window.selectedCustomerCode;
            
            // If customer code is not set, try to get it from the customer ID
            if (!customerCode && formData.customer) {
                const customerId = parseInt(formData.customer);
                const customer = customers.find(c => c.id === customerId);
                if (customer && customer.code) {
                    customerCode = customer.code;
                }
            }
            
            // Validate that we have both customer code and extension
            if (!customerCode) {
                throw new Error('Müşteri kodu bulunamadı. Lütfen müşteri seçtiğinizden emin olun.');
            }
            
            if (!formData.job_no_extension || formData.job_no_extension.trim() === '') {
                throw new Error('İş emri uzantısı gereklidir.');
            }
            
            // Combine customer code with extension for job_no
            formData.job_no = customerCode + '-' + formData.job_no_extension.trim();
            delete formData.job_no_extension; // Remove the extension field
            
            // Convert customer string to number if needed
            if (formData.customer) {
                formData.customer = parseInt(formData.customer);
            }
            
            // Clear the selected customer code
            window.selectedCustomerCode = null;
        }
        
        // Handle quantity - convert to number and default to 1 if not provided
        if (formData.quantity) {
            formData.quantity = parseInt(formData.quantity) || 1;
        } else {
            formData.quantity = 1;
        }
        
        // Handle incoterms - include if provided
        if (formData.incoterms && formData.incoterms.trim() === '') {
            delete formData.incoterms;
        }
        
        const response = await createJobOrderAPI(formData);
        
        if (response && response.job_no) {
            showNotification('İş emri başarıyla oluşturuldu', 'success');
            
            // Hide modal
            createJobOrderModal.hide();
            
            // If creating a child, clear parent's cache
            if (window.creatingChildForParent) {
                childrenCache.delete(window.creatingChildForParent);
            }
            
            // Reload job orders (preserve expanded state)
            currentPage = 1;
            await loadJobOrders();
        } else {
            throw new Error('İş emri oluşturulamadı');
        }
    } catch (error) {
        console.error('Error creating job order:', error);
        let errorMessage = 'İş emri oluşturulurken hata oluştu';
        
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
        } catch (e) {}
        
        showNotification(errorMessage, 'error');
    }
}

async function updateJobOrder(formData) {
    const jobNo = window.editingJobOrderNo;
    if (!jobNo) {
        showNotification('Düzenlenecek iş emri bulunamadı', 'error');
        return;
    }
    
    try {
        // Convert customer string to number if needed
        if (formData.customer) {
            formData.customer = parseInt(formData.customer);
        }
        
        // Handle quantity - convert to number, default to 1 if not provided or invalid
        if (formData.quantity !== undefined && formData.quantity !== null && formData.quantity !== '') {
            const quantityValue = parseInt(formData.quantity);
            formData.quantity = isNaN(quantityValue) || quantityValue < 1 ? 1 : quantityValue;
        } else {
            formData.quantity = 1;
        }
        
        // Handle incoterms - include if provided and not empty
        if (formData.incoterms !== undefined && formData.incoterms !== null) {
            if (formData.incoterms.trim() === '') {
                delete formData.incoterms;
            } else {
                formData.incoterms = formData.incoterms.trim();
            }
        }
        
        const response = await updateJobOrderAPI(jobNo, formData);
        
        if (response && response.job_no) {
            // Hide modal
            editJobOrderModal.hide();
            
            // Clear the editing job order number
            const editedJobNo = window.editingJobOrderNo;
            window.editingJobOrderNo = null;
            
            // If this is a parent job, clear its cache to refresh children count
            if (editedJobNo && !response.parent) {
                childrenCache.delete(editedJobNo);
            }
            
            // Reload job orders
            await loadJobOrders();
            
            showNotification('İş emri başarıyla güncellendi', 'success');
        } else {
            throw new Error('İş emri güncellenemedi');
        }
    } catch (error) {
        console.error('Error updating job order:', error);
        let errorMessage = 'İş emri güncellenirken hata oluştu';
        
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
        } catch (e) {}
        
        showNotification(errorMessage, 'error');
    }
}

async function exportJobOrders(format) {
    try {
        if (jobOrdersTable) {
            jobOrdersTable.setExportLoading(true);
        }
        
        const filterValues = jobOrderFilters ? jobOrderFilters.getFilterValues() : {};
        
        const options = {
            page: 1,
            ordering: currentSortDirection === 'asc' ? currentSortField : `-${currentSortField}`
        };
        
        if (filterValues['search-filter']) {
            options.search = filterValues['search-filter'];
        }
        if (filterValues['status-filter']) {
            options.status = filterValues['status-filter'];
        }
        if (filterValues['customer-filter']) {
            options.customer = parseInt(filterValues['customer-filter']);
        }
        
        let allJobOrders = [];
        let page = 1;
        let hasMore = true;
        
        while (hasMore) {
            const response = await listJobOrders({ ...options, page });
            const results = response.results || [];
            allJobOrders = [...allJobOrders, ...results];
            
            if (response.next && results.length > 0) {
                page++;
            } else {
                hasMore = false;
            }
        }
        
        if (allJobOrders.length === 0) {
            alert('Dışa aktarılacak iş emri bulunamadı');
            return;
        }
        
        const originalData = jobOrdersTable.options.data;
        const originalTotal = jobOrdersTable.options.totalItems;
        
        jobOrdersTable.options.data = allJobOrders;
        jobOrdersTable.options.totalItems = allJobOrders.length;
        
        jobOrdersTable.exportData('excel');
        
        jobOrdersTable.options.data = originalData;
        jobOrdersTable.options.totalItems = originalTotal;
        
    } catch (error) {
        alert('Dışa aktarma sırasında hata oluştu');
        console.error('Export error:', error);
    } finally {
        if (jobOrdersTable) {
            jobOrdersTable.setExportLoading(false);
        }
    }
}


// Show modal to add department tasks with optional template
window.showAddDepartmentTaskModal = async function(jobNo) {
    try {
        // Load department choices and templates
        let departmentChoices = [];
        let templates = [];
        let existingTasks = [];
        
        try {
            departmentChoices = await getDepartmentTaskChoices();
        } catch (error) {
            console.error('Error loading department choices:', error);
            showNotification('Departman seçenekleri yüklenirken hata oluştu', 'error');
            return;
        }
        
        try {
            const templatesResponse = await listTaskTemplates({ is_active: true });
            templates = templatesResponse.results || [];
        } catch (error) {
            console.error('Error loading templates:', error);
        }
        
        // Fetch existing department tasks for this job order to populate depends_on dropdown
        try {
            const tasksResponse = await listDepartmentTasks({ 
                job_order: jobNo,
                page: 1
            });
            existingTasks = tasksResponse.results || [];
        } catch (error) {
            console.error('Error loading existing tasks:', error);
        }
        
        // Clear and configure the modal
        addDepartmentTaskModal.clearAll();
        
        // Store existing tasks for use in dropdowns
        window.existingTasksForJobOrder = existingTasks;
        
        // Add template selection section
        addDepartmentTaskModal.addSection({
            id: 'template-section',
            title: 'Şablon Seçimi (İsteğe Bağlı)',
            icon: 'fas fa-file-alt',
            iconColor: 'text-info'
        });
        
        addDepartmentTaskModal.addField({
            id: 'template_id',
            name: 'template_id',
            label: 'Şablon',
            type: 'dropdown',
            placeholder: 'Şablon seçin (isteğe bağlı)...',
            required: false,
            icon: 'fas fa-file-alt',
            colSize: 12,
            helpText: 'Şablon seçin ve "Şablon Görevlerini Ekle" butonuna tıklayın',
            options: [
                { value: '', label: 'Şablon Seçilmedi' },
                ...templates.map(t => ({
                    value: t.id.toString(),
                    label: `${t.name}${t.is_default ? ' (Varsayılan)' : ''}`
                }))
            ]
        });
        
        // Add tasks section (will add custom content after render)
        addDepartmentTaskModal.addSection({
            id: 'tasks-section',
            title: 'Görevler',
            icon: 'fas fa-tasks',
            iconColor: 'text-primary'
        });
        
        // Store data for later use
        window.currentJobNoForTask = jobNo;
        window.departmentChoicesForTasks = departmentChoices;
        window.tasksList = []; // Array to store tasks: { department, sequence, description, depends_on, ... }
        
        // Set up save callback
        addDepartmentTaskModal.onSave = null;
        addDepartmentTaskModal.onSaveCallback(async (formData) => {
            if (window.tasksList.length === 0) {
                showNotification('En az bir görev eklemelisiniz', 'error');
                return;
            }
            
            // Sync current table input values into tasksList (in case user saved without blurring)
            const container = document.getElementById('tasks-table-container');
            if (container) {
                container.querySelectorAll('.task-title').forEach(input => {
                    const index = parseInt(input.dataset.index);
                    if (!isNaN(index) && window.tasksList[index]) window.tasksList[index].title = input.value || '';
                });
                container.querySelectorAll('.task-sequence').forEach(input => {
                    const index = parseInt(input.dataset.index);
                    if (!isNaN(index) && window.tasksList[index]) window.tasksList[index].sequence = input.value ? parseInt(input.value) : null;
                });
                container.querySelectorAll('.task-department').forEach(select => {
                    const index = parseInt(select.dataset.index);
                    if (!isNaN(index) && window.tasksList[index]) window.tasksList[index].department = select.value || '';
                });
            }
            
            try {
                // Get job order to retrieve ID
                let jobOrderId = jobNo;
                try {
                    const jobOrder = await getJobOrderByJobNo(jobNo);
                    if (jobOrder && jobOrder.id) {
                        jobOrderId = jobOrder.id;
                    }
                } catch (error) {
                    console.warn('Could not fetch job order ID, using job_no:', error);
                    // Continue with job_no, backend might accept it
                }
                
                // Separate main tasks and child tasks
                const mainTasks = window.tasksList.filter(task => !task.isChildTask);
                const childTasks = window.tasksList.filter(task => task.isChildTask);
                
                // Step 1: Create main tasks first
                const mainTasksData = mainTasks.map((task, taskIndex) => {
                    const taskData = {
                        department: task.department,
                        title: task.title || 'Yeni Görev',
                        sequence: task.sequence ? parseInt(task.sequence) : null,
                        description: task.description || '',
                        target_start_date: task.target_start_date || null,
                        target_completion_date: task.target_completion_date || null,
                        notes: task.notes || null
                    };
                    
                    // Process depends_on: values are indices into mainTasks (new tasks in batch) or
                    // existing department task IDs. The API expects task IDs.
                    const existingTaskIds = (window.existingTasksForJobOrder || []).map(t => t.id);
                    if (task.depends_on && Array.isArray(task.depends_on) && task.depends_on.length > 0) {
                        const existingIds = [];
                        const indicesToResolve = [];
                        for (const dep of task.depends_on) {
                            // Check if it's an index in mainTasks
                            const mainTaskIndex = mainTasks.findIndex((t, idx) => {
                                // Check if dep matches the index in the original tasksList
                                return window.tasksList.indexOf(t) === dep;
                            });
                            if (mainTaskIndex >= 0 && mainTaskIndex !== taskIndex) {
                                indicesToResolve.push(mainTaskIndex);
                            } else if (typeof dep === 'number' && existingTaskIds.includes(dep)) {
                                existingIds.push(dep);
                            }
                        }
                        if (indicesToResolve.length > 0) {
                            taskData._dependsOnIndices = indicesToResolve;
                            if (existingIds.length > 0) taskData._existingDepIds = existingIds;
                        } else if (existingIds.length > 0) {
                            taskData.depends_on = existingIds;
                        }
                    }
                    
                    return taskData;
                });
                
                // Clean main tasks data (ensure required: department, title)
                const cleanedMainTasks = mainTasksData.map((task, taskIndex) => {
                    const cleaned = {};
                    Object.keys(task).forEach(key => {
                        if (key.startsWith('_')) return;
                        const val = task[key];
                        if (val !== null && val !== undefined && val !== '') {
                            cleaned[key] = val;
                        }
                    });
                    if (!cleaned.title) cleaned.title = 'Yeni Görev';
                    if (!cleaned.department && mainTasks[taskIndex]) cleaned.department = mainTasks[taskIndex].department || '';
                    return cleaned;
                });
                
                // Create main tasks
                let createdMainTasks = [];
                if (cleanedMainTasks.length > 0) {
                    const mainBulkData = {
                        job_order: jobOrderId,
                        tasks: cleanedMainTasks
                    };
                    const mainResponse = await bulkCreateDepartmentTasks(mainBulkData);
                    createdMainTasks = mainResponse.tasks || mainResponse.created_tasks || [];
                    
                    // Resolve depends_on for main tasks
                    const dependsOnIndicesByTask = mainTasksData.map(t => t._dependsOnIndices || []);
                    const dependsOnExistingIdsByTask = mainTasksData.map(t => t._existingDepIds || []);
                    
                    for (let i = 0; i < dependsOnIndicesByTask.length; i++) {
                        const indices = dependsOnIndicesByTask[i];
                        const existingIds = dependsOnExistingIdsByTask[i] || [];
                        if ((indices.length === 0 && existingIds.length === 0) || !createdMainTasks[i]?.id) continue;
                        const resolvedIds = indices.map(idx => createdMainTasks[idx]?.id).filter(Boolean);
                        const depIds = [...existingIds, ...resolvedIds];
                        if (depIds.length > 0) {
                            await patchDepartmentTask(createdMainTasks[i].id, { depends_on: depIds });
                        }
                    }
                }
                
                // Step 2: Create child tasks with parent references
                // Map parentTaskIndex to created main task IDs
                const parentIndexToIdMap = new Map();
                mainTasks.forEach((mainTask, mainIndex) => {
                    const originalIndex = window.tasksList.indexOf(mainTask);
                    if (createdMainTasks[mainIndex]?.id) {
                        parentIndexToIdMap.set(originalIndex, createdMainTasks[mainIndex].id);
                    }
                });
                
                let createdChildTasks = [];
                if (childTasks.length > 0) {
                    const childTasksData = childTasks.map((childTask) => {
                        const taskData = {
                            department: childTask.department,
                            title: childTask.title || 'Alt görev',
                            sequence: childTask.sequence ? parseInt(childTask.sequence) : null,
                            description: childTask.description || '',
                            target_start_date: childTask.target_start_date || null,
                            target_completion_date: childTask.target_completion_date || null,
                            notes: childTask.notes || null
                        };
                        
                        // Set parent if available
                        if (childTask.parentTaskIndex !== undefined && parentIndexToIdMap.has(childTask.parentTaskIndex)) {
                            taskData.parent = parentIndexToIdMap.get(childTask.parentTaskIndex);
                        }
                        
                        return taskData;
                    });
                    
                    // Clean child tasks data (ensure required: department, title)
                    const cleanedChildTasks = childTasksData.map((task, taskIndex) => {
                        const cleaned = {};
                        Object.keys(task).forEach(key => {
                            const val = task[key];
                            if (val !== null && val !== undefined && val !== '') {
                                cleaned[key] = val;
                            }
                        });
                        if (!cleaned.title) cleaned.title = 'Alt görev';
                        if (!cleaned.department && childTasks[taskIndex]) cleaned.department = childTasks[taskIndex].department || '';
                        return cleaned;
                    });
                    
                    if (cleanedChildTasks.length > 0) {
                        const childBulkData = {
                            job_order: jobOrderId,
                            tasks: cleanedChildTasks
                        };
                        const childResponse = await bulkCreateDepartmentTasks(childBulkData);
                        createdChildTasks = childResponse.tasks || childResponse.created_tasks || [];
                    }
                }
                
                const response = {
                    tasks: [...createdMainTasks, ...createdChildTasks],
                    message: `${createdMainTasks.length} ana görev ve ${createdChildTasks.length} alt görev başarıyla oluşturuldu.`
                };
                
                // Close modal
                addDepartmentTaskModal.hide();
                
                // Show success message
                const message = response.message || `${response.tasks?.length || window.tasksList.length} görev başarıyla oluşturuldu.`;
                showNotification(message, 'success');
            } catch (error) {
                console.error('Error bulk creating tasks:', error);
                let errorMessage = 'Görevler oluşturulurken hata oluştu';
                try {
                    const errorData = JSON.parse(error.message);
                    if (typeof errorData === 'object') {
                        if (errorData.errors) {
                            errorMessage = `Hatalar: ${JSON.stringify(errorData.errors)}`;
                        } else {
                            const errors = Object.values(errorData).flat();
                            errorMessage = errors.join(', ') || errorMessage;
                        }
                    }
                } catch (e) {}
                showNotification(errorMessage, 'error');
            }
        });
        
        // Render modal
        addDepartmentTaskModal.render();
        
        // Add button to template section - similar to Görev Ekle button
        const templateSection = addDepartmentTaskModal.form.querySelector('[data-section-id="template-section"]');
        if (templateSection) {
            const fieldsContainer = templateSection.querySelector('.row');
            if (fieldsContainer) {
                // Add button container similar to Görev Ekle button structure
                const buttonCol = document.createElement('div');
                buttonCol.className = 'col-12';
                buttonCol.innerHTML = `
                    <div class="d-flex justify-content-end mb-3">
                        <button type="button" class="btn btn-sm btn-success" id="add-template-items-btn">
                            <i class="fas fa-plus me-1"></i>Şablon Görevlerini Ekle
                        </button>
                    </div>
                `;
                fieldsContainer.appendChild(buttonCol);
            }
        }
        
        // Add custom tasks table HTML after rendering
        const tasksSection = addDepartmentTaskModal.form.querySelector('[data-section-id="tasks-section"]');
        if (tasksSection) {
            const fieldsContainer = tasksSection.querySelector('.row');
            if (fieldsContainer) {
                fieldsContainer.innerHTML = `
                    <div class="col-12">
                        <div id="tasks-container" class="mt-3">
                            <div class="d-flex justify-content-between align-items-center mb-3">
                                <h6 class="mb-0">Görev Listesi</h6>
                                <button type="button" class="btn btn-sm btn-primary" id="add-task-btn">
                                    <i class="fas fa-plus me-1"></i>Görev Ekle
                                </button>
                            </div>
                            <div id="tasks-table-container">
                                <p class="text-muted text-center py-3">Henüz görev eklenmedi. Şablon seçin veya manuel görev ekleyin.</p>
                            </div>
                        </div>
                    </div>
                `;
            }
        }
        
        // Button is always visible, no need for show/hide logic
        
        // Setup add template items button
        const addTemplateItemsBtn = addDepartmentTaskModal.container.querySelector('#add-template-items-btn');
        if (addTemplateItemsBtn) {
            addTemplateItemsBtn.addEventListener('click', async () => {
                // Use getFormData to properly get dropdown value
                const formData = addDepartmentTaskModal.getFormData();
                const templateId = formData.template_id;
                
                if (!templateId || templateId === '' || templateId === null) {
                    showNotification('Lütfen önce bir şablon seçin', 'warning');
                    return;
                }
                
                try {
                    // Fetch template with items and job order (for main task titles)
                    const jobNo = window.currentJobNoForTask;
                    let jobOrderTitle = '';
                    if (jobNo) {
                        try {
                            const jobOrder = await getJobOrderByJobNo(jobNo);
                            if (jobOrder && jobOrder.title) jobOrderTitle = jobOrder.title;
                        } catch (e) { /* use template title fallback */ }
                    }
                    
                    const template = await getTaskTemplateById(parseInt(templateId));
                    
                    if (template.items && template.items.length > 0) {
                        // Filter only main items (parent === null)
                        const mainItems = template.items.filter(item => item.parent === null);
                        
                        if (mainItems.length === 0) {
                            showNotification('Seçilen şablonda ana görev bulunamadı', 'warning');
                            return;
                        }
                        
                        // Create a map from template item ID to tasksList index (for main items only)
                        const templateItemIdToIndex = new Map();
                        
                        // First pass: add only main tasks and create mapping (main tasks use job order title)
                        const newMainTasks = mainItems.map((item, itemIndex) => {
                            const actualIndex = window.tasksList.length + itemIndex;
                            templateItemIdToIndex.set(item.id, actualIndex);
                            
                            return {
                                department: item.department,
                                department_display: item.department_display,
                                title: jobOrderTitle || item.title || '',
                                sequence: item.sequence || (window.tasksList.length + itemIndex + 1),
                                description: item.description || '',
                                depends_on: item.depends_on || [],
                                fromTemplate: true,
                                templateItemId: item.id, // Store original template item ID for mapping
                                children: item.children || [], // Store children for later processing
                                isMainTask: true // Mark as main task
                            };
                        });
                        
                        // Second pass: map depends_on template item IDs to tasksList indices (only main items)
                        newMainTasks.forEach((task, taskIndex) => {
                            if (task.depends_on && Array.isArray(task.depends_on) && task.depends_on.length > 0) {
                                // Map template item IDs to tasksList indices (only for main items)
                                task.depends_on = task.depends_on.map(templateItemId => {
                                    if (templateItemIdToIndex.has(templateItemId)) {
                                        return templateItemIdToIndex.get(templateItemId);
                                    }
                                    // If not found in template, it might be an existing task ID
                                    return templateItemId;
                                });
                            }
                        });
                        
                        // Third pass: add child tasks as separate entries with parent reference
                        const newChildTasks = [];
                        newMainTasks.forEach((mainTask, mainIndex) => {
                            if (mainTask.children && mainTask.children.length > 0) {
                                mainTask.children.forEach((child, childIndex) => {
                                    const childTaskIndex = window.tasksList.length + newMainTasks.length + newChildTasks.length;
                                    newChildTasks.push({
                                        department: child.department || mainTask.department,
                                        department_display: child.department_display || mainTask.department_display,
                                        title: child.title || '',
                                        sequence: child.sequence || (childIndex + 1),
                                        description: child.description || '',
                                        depends_on: [],
                                        fromTemplate: true,
                                        templateItemId: child.id,
                                        parentTemplateItemId: mainTask.templateItemId, // Reference to parent template item
                                        parentTaskIndex: window.tasksList.length + mainIndex, // Reference to parent in tasksList
                                        isChildTask: true // Mark as child task
                                    });
                                });
                            }
                        });
                        
                        // Append main tasks first, then child tasks
                        window.tasksList = [...window.tasksList, ...newMainTasks, ...newChildTasks];
                        
                        // Update sequences to be sequential for main tasks
                        let mainSequence = 1;
                        window.tasksList.forEach((task, index) => {
                            if (task.isMainTask && !task.sequence) {
                                task.sequence = mainSequence++;
                            }
                        });
                        
                        // Clean up old dropdowns before re-rendering
                        if (window.taskDependsOnDropdowns) {
                            window.taskDependsOnDropdowns.forEach(dropdown => dropdown.destroy());
                            window.taskDependsOnDropdowns.clear();
                        }
                        
                        renderTasksTable();
                        const totalTasks = newMainTasks.length + newChildTasks.length;
                        showNotification(`${newMainTasks.length} ana görev ve ${newChildTasks.length} alt görev şablondan eklendi`, 'success');
                    } else {
                        showNotification('Seçilen şablonda görev bulunamadı', 'warning');
                    }
                } catch (error) {
                    console.error('Error loading template:', error);
                    showNotification('Şablon yüklenirken hata oluştu', 'error');
                }
            });
        }
        
        // Setup add task button
        const addTaskBtn = addDepartmentTaskModal.container.querySelector('#add-task-btn');
        if (addTaskBtn) {
            addTaskBtn.addEventListener('click', () => {
                addNewTask();
            });
        }
        
        // Initial render
        renderTasksTable();
        
        addDepartmentTaskModal.show();
    } catch (error) {
        console.error('Error showing add department task modal:', error);
        showNotification('Görev ekleme modalı açılırken hata oluştu', 'error');
    }
};

// Build display order: main tasks with their children interleaved (hierarchy order)
function getTasksDisplayOrder() {
    const mainTasks = window.tasksList.filter(t => !t.isChildTask);
    const childTasks = window.tasksList.filter(t => t.isChildTask);
    const displayIndices = [];
    mainTasks.forEach(mainTask => {
        const mainIdx = window.tasksList.indexOf(mainTask);
        displayIndices.push(mainIdx);
        childTasks.forEach(child => {
            if (child.parentTaskIndex === mainIdx) {
                displayIndices.push(window.tasksList.indexOf(child));
            }
        });
    });
    return displayIndices;
}

// Render tasks table
function renderTasksTable() {
    const container = document.getElementById('tasks-table-container');
    if (!container) return;
    
    if (window.tasksList.length === 0) {
        container.innerHTML = '<p class="text-muted text-center py-3">Henüz görev eklenmedi. Şablon seçin veya manuel görev ekleyin.</p>';
        return;
    }
    
    const displayIndices = getTasksDisplayOrder();
    
    const tableHtml = `
        <div class="table-responsive">
            <table class="table table-sm table-bordered">
                <thead>
                    <tr>
                        <th style="width: 60px;">Sıra</th>
                        <th>Başlık</th>
                        <th>Departman</th>
                        <th style="width: 200px;">Bağımlılıklar</th>
                        <th style="width: 100px;">İşlemler</th>
                    </tr>
                </thead>
                <tbody>
                    ${displayIndices.map((actualIndex) => {
                        const task = window.tasksList[actualIndex];
                        const isChildTask = task.isChildTask || false;
                        const indentClass = isChildTask ? 'ps-4' : '';
                        const childIndicator = isChildTask ? '<span class="text-muted me-1">↳</span>' : '';
                        const titleValue = (task.title || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                        return `
                        <tr data-task-index="${actualIndex}" ${isChildTask ? 'class="table-light"' : ''}>
                            <td class="${indentClass}">
                                ${childIndicator}
                                <input type="number" class="form-control form-control-sm task-sequence" 
                                       value="${task.sequence || actualIndex + 1}" 
                                       data-index="${actualIndex}" 
                                       style="width: 60px;"
                                       ${isChildTask ? 'readonly' : ''}>
                            </td>
                            <td class="${indentClass}">
                                ${childIndicator}
                                <input type="text" class="form-control form-control-sm task-title" 
                                       value="${titleValue}" 
                                       data-index="${actualIndex}" 
                                       placeholder="${isChildTask ? 'Alt görev başlığı' : 'Görev başlığı'}">
                            </td>
                            <td>
                                <select class="form-select form-select-sm task-department" 
                                        data-index="${actualIndex}"
                                        ${isChildTask ? 'disabled' : ''}>
                                    ${window.departmentChoicesForTasks.map(dept => 
                                        `<option value="${dept.value}" ${task.department === dept.value ? 'selected' : ''}>${dept.label}</option>`
                                    ).join('')}
                                </select>
                            </td>
                            <td>
                                ${isChildTask ? '<span class="text-muted">Alt görev - bağımlılık yok</span>' : `<div id="depends-on-dropdown-${actualIndex}" class="depends-on-dropdown-container" data-index="${actualIndex}"></div>`}
                            </td>
                            <td>
                                <button type="button" class="btn btn-sm btn-outline-danger remove-task-btn" 
                                        data-index="${actualIndex}">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </td>
                        </tr>
                    `;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
    
    container.innerHTML = tableHtml;
    
    // Attach event listeners
    container.querySelectorAll('.task-sequence').forEach(input => {
        input.addEventListener('change', (e) => {
            const index = parseInt(e.target.dataset.index);
            window.tasksList[index].sequence = e.target.value ? parseInt(e.target.value) : null;
        });
    });
    
    container.querySelectorAll('.task-title').forEach(input => {
        input.addEventListener('change', (e) => {
            const index = parseInt(e.target.dataset.index);
            window.tasksList[index].title = e.target.value || '';
        });
        input.addEventListener('blur', (e) => {
            const index = parseInt(e.target.dataset.index);
            window.tasksList[index].title = e.target.value || '';
        });
    });
    
    container.querySelectorAll('.task-department').forEach(select => {
        select.addEventListener('change', (e) => {
            const index = parseInt(e.target.dataset.index);
            window.tasksList[index].department = e.target.value;
        });
    });
    
    // Initialize multiselect dropdowns for depends_on (only for main tasks)
    container.querySelectorAll('.depends-on-dropdown-container').forEach(container => {
        const index = parseInt(container.dataset.index);
        const task = window.tasksList[index];
        
        // Only show items from tasksList (items being added), not existing tasks
        // The depends_on in template items reference other template items, so we only need to show those
        const dropdownOptions = [];
        const seenValues = new Set(); // Track to avoid duplicates
        
        // Add tasks being added (excluding current task and child tasks - only main tasks can be dependencies)
        window.tasksList.forEach((t, idx) => {
            if (idx !== index && !t.isChildTask) {
                const value = `new_${idx}`;
                if (!seenValues.has(value)) {
                    const deptLabel = window.departmentChoicesForTasks.find(d => d.value === t.department)?.label || t.department_display || t.department;
                    const displayText = (t.title ? `${t.title} — ` : '') + `${deptLabel} (Sıra: ${t.sequence || idx + 1})`;
                    dropdownOptions.push({
                        value: value,
                        text: displayText
                    });
                    seenValues.add(value);
                }
            }
        });
        
        // Initialize ModernDropdown
        const dropdown = new ModernDropdown(container, {
            placeholder: 'Bağımlılık seçin...',
            multiple: true,
            searchable: true
        });
        
        dropdown.setItems(dropdownOptions);
        
        // Map depends_on IDs to dropdown values
        // Since we only show items from tasksList, we only need to map indices
        let selectedValues = [];
        if (task.depends_on && Array.isArray(task.depends_on) && task.depends_on.length > 0) {
            selectedValues = task.depends_on.map(depId => {
                // Check if it's a tasksList index (for template items that were mapped)
                if (typeof depId === 'number' && depId < window.tasksList.length && depId !== index) {
                    return `new_${depId}`;
                }
                return null;
            }).filter(v => v !== null);
        }
        
        if (selectedValues.length > 0) {
            dropdown.setValue(selectedValues);
        }
        
        // Store dropdown reference
        if (!window.taskDependsOnDropdowns) {
            window.taskDependsOnDropdowns = new Map();
        }
        window.taskDependsOnDropdowns.set(index, dropdown);
        
        // Listen for changes
        container.addEventListener('dropdown:select', (e) => {
            const selectedValues = dropdown.getValue();
            // Convert dropdown values back to indices (only new tasks are shown)
            task.depends_on = selectedValues.map(val => {
                if (val.startsWith('new_')) {
                    const idx = parseInt(val.replace('new_', ''));
                    // Store the index - these reference other items in tasksList
                    return idx;
                }
                return null;
            }).filter(id => id !== null);
        });
    });
    
    container.querySelectorAll('.remove-task-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.closest('.remove-task-btn').dataset.index);
            const task = window.tasksList[index];
            
            // Collect indices to remove: this task and, if main task, all its children
            const indicesToRemove = [index];
            if (task && !task.isChildTask) {
                window.tasksList.forEach((t, idx) => {
                    if (t.isChildTask && t.parentTaskIndex === index) indicesToRemove.push(idx);
                });
            }
            // Store parent task object references for children (before splice) so we can re-bind indices after
            const childToParentObject = new Map();
            window.tasksList.forEach((t, idx) => {
                if (t.isChildTask && typeof t.parentTaskIndex === 'number' && !indicesToRemove.includes(idx)) {
                    const parentTask = window.tasksList[t.parentTaskIndex];
                    if (parentTask && !indicesToRemove.includes(t.parentTaskIndex)) {
                        childToParentObject.set(t, parentTask);
                    }
                }
            });
            // Sort descending so splicing doesn't shift indices
            indicesToRemove.sort((a, b) => b - a);
            
            indicesToRemove.forEach(idx => {
                if (window.taskDependsOnDropdowns && window.taskDependsOnDropdowns.has(idx)) {
                    const dropdown = window.taskDependsOnDropdowns.get(idx);
                    dropdown.destroy();
                    window.taskDependsOnDropdowns.delete(idx);
                }
                window.tasksList.splice(idx, 1);
            });
            // Re-bind parentTaskIndex for remaining child tasks
            childToParentObject.forEach((parentTask, childTask) => {
                const newParentIdx = window.tasksList.indexOf(parentTask);
                if (newParentIdx >= 0) childTask.parentTaskIndex = newParentIdx;
            });
            renderTasksTable();
        });
    });
}

// Add new task (main task only)
function addNewTask() {
    if (!window.tasksList) {
        window.tasksList = [];
    }
    
    const newTask = {
        department: window.departmentChoicesForTasks[0]?.value || '',
        title: 'Yeni Görev',
        sequence: window.tasksList.filter(t => !t.isChildTask).length + 1,
        description: '',
        depends_on: [],
        fromTemplate: false,
        isMainTask: true
    };
    
    window.tasksList.push(newTask);
    
    // Clean up old dropdowns before re-rendering
    if (window.taskDependsOnDropdowns) {
        window.taskDependsOnDropdowns.forEach(dropdown => dropdown.destroy());
        window.taskDependsOnDropdowns.clear();
    }
    
    renderTasksTable();
}

// Helper function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Show manual department task creation modal
window.showCreateDepartmentTaskModal = async function(jobNo) {
    try {
        // Load department choices
        let departmentChoices = [];
        try {
            departmentChoices = await getDepartmentTaskChoices();
        } catch (error) {
            console.error('Error loading department choices:', error);
            showNotification('Departman seçenekleri yüklenirken hata oluştu', 'error');
            return;
        }
        
        // Clear and configure the modal
        createDepartmentTaskModal.clearAll();
        
        // Add Basic Information section
        createDepartmentTaskModal.addSection({
            title: 'Görev Bilgileri',
            icon: 'fas fa-info-circle',
            iconColor: 'text-primary'
        });
        
        createDepartmentTaskModal.addField({
            id: 'job_order',
            name: 'job_order',
            label: 'İş Emri No',
            type: 'text',
            value: jobNo,
            required: true,
            icon: 'fas fa-barcode',
            colSize: 6,
            disabled: true
        });
        
        createDepartmentTaskModal.addField({
            id: 'department',
            name: 'department',
            label: 'Departman',
            type: 'dropdown',
            placeholder: 'Departman seçin...',
            required: true,
            icon: 'fas fa-building',
            colSize: 6,
            helpText: 'Görevin atanacağı departman',
            options: departmentChoices.map(d => ({
                value: d.value,
                label: d.label
            }))
        });
        
        createDepartmentTaskModal.addField({
            id: 'title',
            name: 'title',
            label: 'Başlık',
            type: 'text',
            placeholder: 'Görev başlığını girin',
            required: true,
            icon: 'fas fa-heading',
            colSize: 12,
            helpText: 'Görev başlığı'
        });
        
        createDepartmentTaskModal.addField({
            id: 'description',
            name: 'description',
            label: 'Açıklama',
            type: 'textarea',
            placeholder: 'Detaylı açıklama',
            icon: 'fas fa-align-left',
            colSize: 12,
            helpText: 'Görev açıklaması'
        });
        
        // Add Dates section
        createDepartmentTaskModal.addSection({
            title: 'Tarih Bilgileri',
            icon: 'fas fa-calendar',
            iconColor: 'text-success'
        });
        
        createDepartmentTaskModal.addField({
            id: 'target_start_date',
            name: 'target_start_date',
            label: 'Hedef Başlangıç Tarihi',
            type: 'date',
            icon: 'fas fa-calendar-alt',
            colSize: 6,
            helpText: 'Hedef başlangıç tarihi'
        });
        
        createDepartmentTaskModal.addField({
            id: 'target_completion_date',
            name: 'target_completion_date',
            label: 'Hedef Bitiş Tarihi',
            type: 'date',
            icon: 'fas fa-calendar-check',
            colSize: 6,
            helpText: 'Hedef bitiş tarihi'
        });
        
        // Add Additional Information section
        createDepartmentTaskModal.addSection({
            title: 'Ek Bilgiler',
            icon: 'fas fa-info',
            iconColor: 'text-info'
        });
        
        createDepartmentTaskModal.addField({
            id: 'sequence',
            name: 'sequence',
            label: 'Sıra',
            type: 'number',
            placeholder: '0',
            icon: 'fas fa-sort-numeric-up',
            colSize: 6,
            helpText: 'Görev sırası'
        });
        
        createDepartmentTaskModal.addField({
            id: 'notes',
            name: 'notes',
            label: 'Notlar',
            type: 'textarea',
            placeholder: 'Ek notlar',
            icon: 'fas fa-sticky-note',
            colSize: 12,
            helpText: 'Ek notlar'
        });
        
        // Set up save callback
        createDepartmentTaskModal.onSave = null;
        createDepartmentTaskModal.onSaveCallback(async (formData) => {
            try {
                // Prepare task data
                const taskData = {
                    job_order: jobNo,
                    department: formData.department,
                    title: formData.title,
                    description: formData.description || '',
                    target_start_date: formData.target_start_date || null,
                    target_completion_date: formData.target_completion_date || null,
                    sequence: formData.sequence ? parseInt(formData.sequence) : null,
                    notes: formData.notes || ''
                };
                
                // Remove null/empty values
                Object.keys(taskData).forEach(key => {
                    if (taskData[key] === null || taskData[key] === '') {
                        delete taskData[key];
                    }
                });
                
                // Create the task
                await createDepartmentTask(taskData);
                
                // Close modal
                createDepartmentTaskModal.hide();
                
                showNotification('Görev başarıyla oluşturuldu', 'success');
            } catch (error) {
                console.error('Error creating department task:', error);
                let errorMessage = 'Görev oluşturulurken hata oluştu';
                try {
                    const errorData = JSON.parse(error.message);
                    if (typeof errorData === 'object') {
                        const errors = Object.values(errorData).flat();
                        errorMessage = errors.join(', ') || errorMessage;
                    }
                } catch (e) {}
                showNotification(errorMessage, 'error');
            }
        });
        
        // Render and show modal
        createDepartmentTaskModal.render();
        createDepartmentTaskModal.show();
    } catch (error) {
        console.error('Error showing create department task modal:', error);
        showNotification('Görev oluşturma modalı açılırken hata oluştu', 'error');
    }
};

// Apply template to job order
async function applyTemplateToJobOrderHandler(jobNo, templateId) {
    try {
        // Show loading
        addDepartmentTaskModal.hide();
        
        // Apply template
        const response = await applyTemplateToJobOrder(jobNo, { template_id: templateId });
        
        // Show success message
        const message = response.message || `Şablon başarıyla uygulandı. ${response.created_tasks?.length || 0} görev oluşturuldu.`;
        showNotification(message, 'success');
    } catch (error) {
        console.error('Error applying template:', error);
        let errorMessage = 'Şablon uygulanırken hata oluştu';
        try {
            const errorData = JSON.parse(error.message);
            if (typeof errorData === 'object') {
                const errors = Object.values(errorData).flat();
                errorMessage = errors.join(', ') || errorMessage;
            }
        } catch (e) {}
        showNotification(errorMessage, 'error');
    }
}
