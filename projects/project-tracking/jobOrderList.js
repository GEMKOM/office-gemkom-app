import { initNavbar } from '../../components/navbar.js';
import { ModernDropdown } from '../../components/dropdown/dropdown.js';
import { 
    listJobOrders, 
    getJobOrderByJobNo, 
    createJobOrder as createJobOrderAPI, 
    updateJobOrder as updateJobOrderAPI,
    startJobOrder as startJobOrderAPI,
    completeJobOrder as completeJobOrderAPI,
    holdJobOrder as holdJobOrderAPI,
    resumeJobOrder as resumeJobOrderAPI,
    cancelJobOrder as cancelJobOrderAPI,
    getJobOrderHierarchy,
    getStatusChoices,
    getPriorityChoices,
    applyTemplateToJobOrder,
    getChildJobOrders,
    STATUS_OPTIONS,
    PRIORITY_OPTIONS
} from '../../apis/projects/jobOrders.js';
import { createDepartmentTask, bulkCreateDepartmentTasks, patchDepartmentTask, getDepartmentChoices as getDepartmentTaskChoices, listDepartmentTasks } from '../../apis/projects/departmentTasks.js';
import { listTaskTemplates, getTaskTemplateById } from '../../apis/projects/taskTemplates.js';
import { listCustomers } from '../../apis/projects/customers.js';
import { CURRENCY_OPTIONS } from '../../apis/projects/customers.js';
import { HeaderComponent } from '../../components/header/header.js';
import { FiltersComponent } from '../../components/filters/filters.js';
import { StatisticsCards } from '../../components/statistics-cards/statistics-cards.js';
import { TableComponent } from '../../components/table/table.js';
import { DisplayModal } from '../../components/display-modal/display-modal.js';
import { EditModal } from '../../components/edit-modal/edit-modal.js';
import { ConfirmationModal } from '../../components/confirmation-modal/confirmation-modal.js';
import { initRouteProtection } from '../../apis/routeProtection.js';
import { showNotification } from '../../components/notification/notification.js';

// State management
let currentPage = 1;
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
let priorityOptions = PRIORITY_OPTIONS; // Priority options
let expandedRows = new Set(); // Track expanded rows by job_no
let childrenCache = new Map(); // Cache children data by parent job_no

// Modal component instances
let createJobOrderModal = null;
let editJobOrderModal = null;
let deleteJobOrderModal = null;
let addDepartmentTaskModal = null;
let createDepartmentTaskModal = null;
let viewJobOrderModal = null;
let confirmationModal = null;

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
        
        // Check for job_no parameter in URL to open modal directly
        const urlParams = new URLSearchParams(window.location.search);
        const jobNo = urlParams.get('job_no');
        
        if (jobNo) {
            // Open modal directly without loading other data first
            await viewJobOrder(jobNo);
        } else {
            // Load page normally
            await loadJobOrders();
            updateJobOrderCounts();
        }
    } catch (error) {
        console.error('Error initializing job orders:', error);
        showNotification('İş emirleri yüklenirken hata oluştu', 'error');
    }
}

async function loadChoices() {
    try {
        const [statuses, priorities] = await Promise.all([
            getStatusChoices().catch(() => STATUS_OPTIONS),
            getPriorityChoices().catch(() => PRIORITY_OPTIONS)
        ]);
        statusOptions = statuses;
        priorityOptions = priorities;
    } catch (error) {
        console.error('Error loading choices:', error);
        // Use static fallbacks
        statusOptions = STATUS_OPTIONS;
        priorityOptions = PRIORITY_OPTIONS;
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
                formatter: (value, row) => {
                    const isChild = !!row.parent;
                    
                    // Calculate hierarchy level (0 = root, 1 = child, 2 = grandchild, etc.)
                    const hierarchyLevel = row.hierarchy_level || (isChild ? 1 : 0);
                    
                    // Job number with hierarchy styling - lighter color for child jobs
                    const jobNoStyle = hierarchyLevel > 0 ? 'color: #6c757d; font-weight: 500;' : 'font-weight: 600;';
                    const jobNoDisplay = hierarchyLevel > 0 
                        ? `<span style="${jobNoStyle}">${value || '-'}</span>` 
                        : `<strong style="${jobNoStyle}">${value || '-'}</strong>`;
                    
                    return jobNoDisplay;
                }
            },
            {
                field: 'parent',
                label: 'Ana İş',
                sortable: false,
                formatter: (value, row) => {
                    if (row._isDepartmentTasksRow) return '';
                    if (!value) return '<span class="text-muted">-</span>';
                    return `<span class="badge bg-light text-dark">${value}</span>`;
                }
            },
            {
                field: 'title',
                label: 'Başlık',
                sortable: true,
                formatter: (value, row) => {
                    if (row._isDepartmentTasksRow) return '';
                    return value || '-';
                }
            },
            {
                field: 'customer_name',
                label: 'Müşteri',
                sortable: false,
                formatter: (value, row) => {
                    if (row._isDepartmentTasksRow) return '';
                    if (value) {
                        return `${value} <small class="text-muted">(${row.customer_code || ''})</small>`;
                    }
                    return '-';
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
                        return '<span class="status-badge status-green">Aktif</span>';
                    } else if (status === 'draft') {
                        return '<span class="status-badge status-grey">Taslak</span>';
                    } else if (status === 'on_hold') {
                        return '<span class="status-badge status-yellow">Beklemede</span>';
                    } else if (status === 'completed') {
                        return '<span class="status-badge status-blue">Tamamlandı</span>';
                    } else if (status === 'cancelled') {
                        return '<span class="status-badge status-red">İptal Edildi</span>';
                    }
                    return value || '-';
                }
            },
            {
                field: 'priority_display',
                label: 'Öncelik',
                sortable: true,
                formatter: (value, row) => {
                    if (row._isDepartmentTasksRow) return '';
                    const priority = row.priority;
                    const getPriorityBadgeClass = (priority) => {
                        switch (priority) {
                            case 'urgent': return 'status-red';
                            case 'high': return 'status-yellow';
                            case 'normal': return 'status-blue';
                            case 'low': return 'status-grey';
                            default: return 'status-grey';
                        }
                    };
                    const badgeClass = getPriorityBadgeClass(priority);
                    return `<span class="status-badge ${badgeClass}">${value || '-'}</span>`;
                }
            },
            {
                field: 'target_completion_date',
                label: 'Hedef Tamamlanma',
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
                    
                    // Determine text color based on percentage (for contrast)
                    const textColor = percentage > 50 ? '#ffffff' : '#1f2937';
                    const textShadow = percentage > 50 ? '0 1px 2px rgba(0,0,0,0.2)' : 'none';
                    
                    return `
                        <div style="position: relative; width: 100%;">
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
                field: 'children_count',
                label: 'Alt İşler',
                sortable: false,
                formatter: (value, row) => {
                    if (row._isDepartmentTasksRow) return '';
                    if (!value || value === 0) return '-';
                    return `<span class="status-badge status-grey">${value}</span>`;
                }
            },
            {
                field: 'department_tasks_count',
                label: 'Görevler',
                sortable: false,
                formatter: (value, row) => {
                    if (row._isDepartmentTasksRow) return '';
                    if (!value || value === 0) return '-';
                    return `<span class="status-badge status-blue">${value}</span>`;
                }
            },
            {
                field: 'created_at',
                label: 'Oluşturulma',
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
            await loadJobOrders();
        },
        onPageChange: async (page) => {
            currentPage = page;
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
                visible: (row) => row.status !== 'completed' && row.status !== 'cancelled'
            },
            {
                key: 'view',
                label: 'Detay',
                icon: 'fas fa-eye',
                class: 'btn-outline-info',
                onClick: (row) => {
                    viewJobOrder(row.job_no);
                }
            },
            {
                key: 'create-child',
                label: 'Alt İş Oluştur',
                icon: 'fas fa-plus-circle',
                class: 'btn-outline-success',
                onClick: (row) => {
                    showCreateChildJobOrderModal(row.job_no);
                },
                visible: (row) => row.status !== 'completed' && row.status !== 'cancelled'
            },
            {
                key: 'add-department-task',
                label: 'Görev Ekle',
                icon: 'fas fa-tasks',
                class: 'btn-outline-primary',
                onClick: (row) => {
                    showAddDepartmentTaskModal(row.job_no);
                },
                visible: (row) => row.status !== 'completed' && row.status !== 'cancelled'
            },
            {
                key: 'hierarchy',
                label: 'Hiyerarşi',
                icon: 'fas fa-sitemap',
                class: 'btn-outline-primary',
                onClick: (row) => {
                    viewJobOrderHierarchy(row.job_no);
                }
            },
            {
                key: 'start',
                label: 'Başlat',
                icon: 'fas fa-play',
                class: 'btn-outline-success',
                onClick: (row) => {
                    startJobOrder(row.job_no);
                },
                visible: (row) => row.status === 'draft'
            },
            {
                key: 'complete',
                label: 'Tamamla',
                icon: 'fas fa-check',
                class: 'btn-outline-success',
                onClick: (row) => {
                    completeJobOrder(row.job_no);
                },
                visible: (row) => row.status === 'active' || row.status === 'on_hold'
            },
            {
                key: 'hold',
                label: 'Beklet',
                icon: 'fas fa-pause',
                class: 'btn-outline-warning',
                onClick: (row) => {
                    holdJobOrder(row.job_no);
                },
                visible: (row) => row.status === 'active'
            },
            {
                key: 'resume',
                label: 'Devam Et',
                icon: 'fas fa-play-circle',
                class: 'btn-outline-info',
                onClick: (row) => {
                    resumeJobOrder(row.job_no);
                },
                visible: (row) => row.status === 'on_hold'
            },
            {
                key: 'cancel',
                label: 'İptal Et',
                icon: 'fas fa-times',
                class: 'btn-outline-danger',
                onClick: (row) => {
                    cancelJobOrder(row.job_no);
                },
                visible: (row) => row.status !== 'completed' && row.status !== 'cancelled'
            }
        ],
        emptyMessage: 'İş emri bulunamadı',
        emptyIcon: 'fas fa-tasks'
    });
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

    jobOrderFilters.addDropdownFilter({
        id: 'priority-filter',
        label: 'Öncelik',
        options: [
            { value: '', label: 'Tümü' },
            ...priorityOptions.map(p => ({ value: p.value, label: p.label }))
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

    // Set up close callback to clean up URL
    viewJobOrderModal.onCloseCallback(() => {
        // Remove job_no parameter from URL
        const url = new URL(window.location);
        url.searchParams.delete('job_no');
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
            ordering: currentSortDirection === 'asc' ? currentSortField : `-${currentSortField}`
        };
        
        // Add filters
        if (filterValues['search-filter']) {
            options.search = filterValues['search-filter'];
        }
        if (filterValues['status-filter']) {
            options.status = filterValues['status-filter'];
        }
        if (filterValues['priority-filter']) {
            options.priority = filterValues['priority-filter'];
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
        
        // Call API
        const response = await listJobOrders(options);
        
        // Extract job orders and total count from response
        let rootOrders = response.results || [];
        totalJobOrders = response.count || 0;
        
        // Cache root orders for quick access during expand/collapse
        rootOrdersCache = [...rootOrders];
        
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

// Store root orders separately for quick access during expand/collapse
let rootOrdersCache = [];

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
        // Use cached root orders and merge expanded children
        // If rootOrdersCache is empty, extract root orders from current jobOrders
        const rootOrders = rootOrdersCache.length > 0 ? rootOrdersCache : jobOrders.filter(j => !j.parent);
        dataToDisplay = mergeExpandedChildren(rootOrders);
    }
    
    // Update table data without loading state
    jobOrdersTable.updateData(dataToDisplay, totalJobOrders, currentPage);
    
    // Setup expand button listeners after table is updated
    setTimeout(() => {
        setupExpandButtonListeners();
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

        // Add Priority and Dates section
        editJobOrderModal.addSection({
            title: 'Öncelik ve Tarihler',
            icon: 'fas fa-calendar-alt',
            iconColor: 'text-info'
        });

        editJobOrderModal.addField({
            id: 'priority',
            name: 'priority',
            label: 'Öncelik',
            type: 'dropdown',
            value: jobOrder.priority || 'normal',
            icon: 'fas fa-exclamation-triangle',
            colSize: 6,
            helpText: 'İş emri önceliği',
            options: priorityOptions.map(p => ({
                value: p.value,
                label: p.label
            }))
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


        // Render and show modal
        editJobOrderModal.render();
        editJobOrderModal.show();
    } catch (error) {
        console.error('Error loading job order for edit:', error);
        showNotification('İş emri bilgileri yüklenirken hata oluştu', 'error');
    }
};

window.viewJobOrder = async function(jobNo) {
    try {
        const jobOrder = await getJobOrderByJobNo(jobNo);
        
        // Fetch children if they exist
        let children = [];
        if (jobOrder.children && Array.isArray(jobOrder.children)) {
            children = jobOrder.children;
        } else if (jobOrder.children_count > 0) {
            // Fetch children if count > 0 but not in response
            try {
                const childrenResponse = await getChildJobOrders(jobNo);
                children = childrenResponse.results || [];
            } catch (error) {
                console.warn('Could not fetch children:', error);
            }
        }
        
        // Clear and configure the view modal
        viewJobOrderModal.clearData();
        viewJobOrderModal.setTitle(`İş Emri Detayları: ${jobOrder.job_no}`);
        
        // Helper functions for badge classes
        const getStatusBadgeClass = (status) => {
            switch (status) {
                case 'active': return 'status-green';
                case 'draft': return 'status-grey';
                case 'on_hold': return 'status-yellow';
                case 'completed': return 'status-blue';
                case 'cancelled': return 'status-red';
                default: return 'status-grey';
            }
        };
        
        const getPriorityBadgeClass = (priority) => {
            switch (priority) {
                case 'urgent': return 'status-red';
                case 'high': return 'status-yellow';
                case 'normal': return 'status-blue';
                case 'low': return 'status-grey';
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
        
        // Build sidebar HTML with Temel Bilgiler and Sistem Bilgileri
        const sidebarHtml = `
            <div class="job-order-sidebar" style="background: #f8f9fa; padding: 20px; border-right: 1px solid #dee2e6; height: 100%; overflow-y: auto;">
                <!-- Temel Bilgiler Section -->
                <div class="sidebar-section mb-4">
                    <h6 class="mb-3 d-flex align-items-center">
                        <i class="fas fa-info-circle me-2 text-primary"></i>
                        Temel Bilgiler
                    </h6>
                    <div class="sidebar-fields">
                        <div class="field-item mb-3">
                            <label class="field-label small text-muted mb-1">
                                <i class="fas fa-barcode me-1"></i>İş Emri No
                            </label>
                            <div class="field-value fw-medium">${jobOrder.job_no || '-'}</div>
                        </div>
                        <div class="field-item mb-3">
                            <label class="field-label small text-muted mb-1">
                                <i class="fas fa-heading me-1"></i>Başlık
                            </label>
                            <div class="field-value">${jobOrder.title || '-'}</div>
                        </div>
                        <div class="field-item mb-3">
                            <label class="field-label small text-muted mb-1">
                                <i class="fas fa-users me-1"></i>Müşteri
                            </label>
                            <div class="field-value">${jobOrder.customer_name ? `${jobOrder.customer_name}${jobOrder.customer_code ? ' (' + jobOrder.customer_code + ')' : ''}` : '-'}</div>
                        </div>
                        <div class="field-item mb-3">
                            <label class="field-label small text-muted mb-1">
                                <i class="fas fa-tasks me-1"></i>Durum
                            </label>
                            <div class="field-value">
                                ${jobOrder.status_display ? `<span class="status-badge ${getStatusBadgeClass(jobOrder.status)}">${jobOrder.status_display}</span>` : '-'}
                            </div>
                        </div>
                        <div class="field-item mb-3">
                            <label class="field-label small text-muted mb-1">
                                <i class="fas fa-exclamation-triangle me-1"></i>Öncelik
                            </label>
                            <div class="field-value">
                                ${jobOrder.priority_display ? `<span class="status-badge ${getPriorityBadgeClass(jobOrder.priority)}">${jobOrder.priority_display}</span>` : '-'}
                            </div>
                        </div>
                        <div class="field-item mb-3">
                            <label class="field-label small text-muted mb-1">
                                <i class="fas fa-file-invoice me-1"></i>Müşteri Sipariş No
                            </label>
                            <div class="field-value">${jobOrder.customer_order_no || '-'}</div>
                        </div>
                        <div class="field-item mb-3">
                            <label class="field-label small text-muted mb-1">
                                <i class="fas fa-calendar-check me-1"></i>Hedef Tamamlanma
                            </label>
                            <div class="field-value">${formatDate(jobOrder.target_completion_date)}</div>
                        </div>
                        <div class="field-item mb-3">
                            <label class="field-label small text-muted mb-1">
                                <i class="fas fa-play-circle me-1"></i>Başlangıç Tarihi
                            </label>
                            <div class="field-value">${formatDateTime(jobOrder.started_at)}</div>
                        </div>
                        <div class="field-item mb-3">
                            <label class="field-label small text-muted mb-1">
                                <i class="fas fa-check-circle me-1"></i>Tamamlanma Tarihi
                            </label>
                            <div class="field-value">${formatDateTime(jobOrder.completed_at)}</div>
                        </div>
                        <div class="field-item mb-3">
                            <label class="field-label small text-muted mb-1">
                                <i class="fas fa-percentage me-1"></i>Tamamlanma Oranı
                            </label>
                            <div class="field-value">
                                ${jobOrder.completion_percentage ? `${parseFloat(jobOrder.completion_percentage)}%` : '0%'}
                            </div>
                        </div>
                        ${jobOrder.description ? `
                        <div class="field-item mb-3">
                            <label class="field-label small text-muted mb-1">
                                <i class="fas fa-align-left me-1"></i>Açıklama
                            </label>
                            <div class="field-value">${jobOrder.description}</div>
                        </div>
                        ` : ''}
                        ${jobOrder.parent ? `
                        <div class="field-item mb-3">
                            <label class="field-label small text-muted mb-1">
                                <i class="fas fa-level-up-alt me-1"></i>Ana İş
                            </label>
                            <div class="field-value">${jobOrder.parent}${jobOrder.parent_title ? ' - ' + jobOrder.parent_title : ''}</div>
                        </div>
                        ` : ''}
                        ${(jobOrder.estimated_cost || jobOrder.total_cost) ? `
                        <div class="field-item mb-3">
                            <label class="field-label small text-muted mb-1">
                                <i class="fas fa-calculator me-1"></i>Tahmini Maliyet
                            </label>
                            <div class="field-value">${formatCurrency(jobOrder.estimated_cost, jobOrder.cost_currency)}</div>
                        </div>
                        <div class="field-item mb-3">
                            <label class="field-label small text-muted mb-1">
                                <i class="fas fa-money-bill-wave me-1"></i>Toplam Maliyet
                            </label>
                            <div class="field-value">${formatCurrency(jobOrder.total_cost, jobOrder.cost_currency)}</div>
                        </div>
                        ` : ''}
                    </div>
                </div>
                
                <!-- Sistem Bilgileri Section -->
                <div class="sidebar-section">
                    <h6 class="mb-3 d-flex align-items-center">
                        <i class="fas fa-info me-2 text-secondary"></i>
                        Sistem Bilgileri
                    </h6>
                    <div class="sidebar-fields">
                        <div class="field-item mb-3">
                            <label class="field-label small text-muted mb-1">
                                <i class="fas fa-calendar-plus me-1"></i>Oluşturulma Tarihi
                            </label>
                            <div class="field-value">${formatDateTime(jobOrder.created_at)}</div>
                        </div>
                        <div class="field-item mb-3">
                            <label class="field-label small text-muted mb-1">
                                <i class="fas fa-user me-1"></i>Oluşturan
                            </label>
                            <div class="field-value">${jobOrder.created_by_name || '-'}</div>
                        </div>
                        <div class="field-item mb-3">
                            <label class="field-label small text-muted mb-1">
                                <i class="fas fa-calendar-edit me-1"></i>Güncellenme Tarihi
                            </label>
                            <div class="field-value">${formatDateTime(jobOrder.updated_at)}</div>
                        </div>
                        ${jobOrder.completed_by_name ? `
                        <div class="field-item mb-3">
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
        
        // Build main content HTML
        const mainContentHtml = `
            <div class="job-order-main-content" style="padding: 20px; height: 100%; overflow-y: auto;">
                <!-- Children Table -->
                ${children.length > 0 ? `
                <div class="content-section mb-4" id="children-section">
                    <div id="children-table-container"></div>
                </div>
                ` : ''}
                
                <!-- Department Tasks Table -->
                ${jobOrder.department_tasks && jobOrder.department_tasks.length > 0 ? `
                <div class="content-section mb-4" id="department-tasks-section">
                    <div id="department-tasks-table-container"></div>
                </div>
                ` : ''}
                
                <!-- Files Section -->
                <div class="content-section" id="files-section">
                    <div id="files-container"></div>
                </div>
            </div>
        `;
        
        // Create custom layout with sidebar and main content
        const layoutHtml = `
            <div class="row g-0" style="height: calc(100vh - 200px);">
                <div class="col-md-4" style="max-height: 100%;">
                    ${sidebarHtml}
                </div>
                <div class="col-md-8" style="max-height: 100%;">
                    ${mainContentHtml}
                </div>
            </div>
        `;
        
        // Add custom section with the layout
        viewJobOrderModal.addCustomSection({
            id: 'job-order-details-layout',
            customContent: layoutHtml
        });
        
        // Render the modal
        viewJobOrderModal.render();
        
        // Initialize children table
        if (children.length > 0) {
            const childrenContainer = viewJobOrderModal.content.querySelector('#children-table-container');
            if (childrenContainer) {
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
                            field: 'priority_display',
                            label: 'Öncelik',
                            sortable: true,
                            formatter: (value, row) => {
                                if (!value || value === '-') return '-';
                                const badgeClass = getPriorityBadgeClass(row.priority);
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
        }
        
        // Initialize department tasks table
        if (jobOrder.department_tasks && jobOrder.department_tasks.length > 0) {
            const departmentTasksContainer = viewJobOrderModal.content.querySelector('#department-tasks-table-container');
            if (departmentTasksContainer) {
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
                            field: 'sequence',
                            label: 'Sıra',
                            sortable: true,
                            formatter: (value) => value || '-'
                        },
                        {
                            field: 'department_display',
                            label: 'Departman',
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
                    data: jobOrder.department_tasks || [],
                    sortable: true,
                    pagination: false,
                    exportable: false,
                    refreshable: false,
                    small: true,
                    striped: true,
                    emptyMessage: 'Departman görevi bulunamadı',
                    emptyIcon: 'fas fa-tasks'
                });
            }
        }
        
        // Initialize file attachments
        const filesContainer = viewJobOrderModal.content.querySelector('#files-container');
        if (filesContainer) {
            // Import FileAttachments dynamically
            const { FileAttachments } = await import('../../components/file-attachments/file-attachments.js');
            // FileViewer is available globally as window.fileViewer
            
            const files = jobOrder.files || jobOrder.attachments || [];
            
            if (files.length > 0) {
                const fileAttachments = new FileAttachments('files-container', {
                    title: 'Dosyalar',
                    titleIcon: 'fas fa-paperclip',
                    titleIconColor: 'text-primary',
                    layout: 'grid',
                    onFileClick: (file) => {
                        const fileName = file.file_name || file.name || file.filename || 'Dosya';
                        const fileExtension = fileName.split('.').pop().toLowerCase();
                        const fileUrl = file.file_url || file.url || file.file;
                        
                        if (fileUrl && window.fileViewer) {
                            window.fileViewer.openFile(fileUrl, fileName, fileExtension);
                        }
                    },
                    onDownloadClick: (fileUrl, fileName) => {
                        const link = document.createElement('a');
                        link.href = fileUrl;
                        link.download = fileName;
                        link.target = '_blank';
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                    }
                });
                
                fileAttachments.setFiles(files);
            } else {
                filesContainer.innerHTML = '<p class="text-muted text-center py-3">Henüz dosya eklenmemiş.</p>';
            }
        }
        
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

window.viewJobOrderHierarchy = async function(jobNo) {
    try {
        const hierarchy = await getJobOrderHierarchy(jobNo);
        
        // Create hierarchy view modal
        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.innerHTML = `
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            <i class="fas fa-sitemap me-2"></i>İş Emri Hiyerarşisi: ${hierarchy.job_no}
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        ${renderHierarchyTree(hierarchy)}
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Kapat</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();
        modal.addEventListener('hidden.bs.modal', () => modal.remove());
    } catch (error) {
        console.error('Error viewing hierarchy:', error);
        showNotification('Hiyerarşi bilgileri yüklenirken hata oluştu', 'error');
    }
};

function renderHierarchyTree(node, level = 0) {
    const indent = level * 30;
    const hasChildren = node.children && node.children.length > 0;
    
    let html = `
        <div class="hierarchy-node mb-2" style="padding-left: ${indent}px; border-left: ${level > 0 ? '2px solid #dee2e6' : 'none'};">
            <div class="d-flex align-items-center p-2 bg-light rounded">
                <i class="fas ${hasChildren ? 'fa-folder' : 'fa-file'} me-2 text-primary"></i>
                <div class="flex-grow-1">
                    <strong>${node.job_no}</strong> - ${node.title}
                    <br>
                    <small class="text-muted">
                        Durum: ${node.status_display} | 
                        Öncelik: ${node.priority || 'N/A'} | 
                        Tamamlanma: ${node.completion_percentage}%
                    </small>
                </div>
            </div>
        </div>
    `;
    
    if (hasChildren) {
        node.children.forEach(child => {
            html += renderHierarchyTree(child, level + 1);
        });
    }
    
    return html;
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

    // Add Priority and Dates section (customer is inherited from parent)
    createJobOrderModal.addSection({
        title: 'Öncelik ve Tarihler',
        icon: 'fas fa-calendar-alt',
        iconColor: 'text-info'
    });

    createJobOrderModal.addField({
        id: 'priority',
        name: 'priority',
        label: 'Öncelik',
        type: 'dropdown',
        placeholder: 'Öncelik seçin...',
        value: parentJob.priority || 'normal',
        icon: 'fas fa-exclamation-triangle',
        colSize: 6,
        helpText: 'İş emri önceliği',
        options: priorityOptions.map(p => ({
            value: p.value,
            label: p.label
        }))
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

window.completeJobOrder = async function(jobNo) {
    if (!confirm(`İş emri ${jobNo} tamamlanacak mı?`)) {
        return;
    }
    
    try {
        const response = await completeJobOrderAPI(jobNo);
        if (response && response.status === 'success') {
            showNotification(response.message || 'İş emri tamamlandı', 'success');
            await loadJobOrders();
        } else {
            throw new Error('İş emri tamamlanamadı');
        }
    } catch (error) {
        console.error('Error completing job order:', error);
        let errorMessage = 'İş emri tamamlanırken hata oluştu';
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
};

window.holdJobOrder = async function(jobNo) {
    const reason = prompt('Bekletme nedeni (opsiyonel):');
    
    try {
        const response = await holdJobOrderAPI(jobNo, reason ? { reason } : {});
        if (response && response.status === 'success') {
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
};

window.resumeJobOrder = async function(jobNo) {
    if (!confirm(`İş emri ${jobNo} devam ettirilsin mi?`)) {
        return;
    }
    
    try {
        const response = await resumeJobOrderAPI(jobNo);
        if (response && response.status === 'success') {
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
        showNotification(errorMessage, 'error');
    }
};

window.cancelJobOrder = async function(jobNo) {
    if (!confirm(`İş emri ${jobNo} iptal edilecek mi? Bu işlem geri alınamaz.`)) {
        return;
    }
    
    try {
        const response = await cancelJobOrderAPI(jobNo);
        if (response && response.status === 'success') {
            showNotification(response.message || 'İş emri iptal edildi', 'success');
            await loadJobOrders();
        } else {
            throw new Error('İş emri iptal edilemedi');
        }
    } catch (error) {
        console.error('Error cancelling job order:', error);
        let errorMessage = 'İş emri iptal edilirken hata oluştu';
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

    // Add Priority and Dates section
    createJobOrderModal.addSection({
        title: 'Öncelik ve Tarihler',
        icon: 'fas fa-calendar-alt',
        iconColor: 'text-info'
    });

    createJobOrderModal.addField({
        id: 'priority',
        name: 'priority',
        label: 'Öncelik',
        type: 'dropdown',
        placeholder: 'Öncelik seçin...',
        value: 'normal',
        icon: 'fas fa-exclamation-triangle',
        colSize: 6,
        helpText: 'İş emri önceliği',
        options: priorityOptions.map(p => ({
            value: p.value,
            label: p.label
        }))
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
        if (filterValues['priority-filter']) {
            options.priority = filterValues['priority-filter'];
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
                
                // Clean main tasks data
                const cleanedMainTasks = mainTasksData.map(task => {
                    const cleaned = {};
                    Object.keys(task).forEach(key => {
                        if (key.startsWith('_')) return;
                        if (task[key] !== null && task[key] !== '') {
                            cleaned[key] = task[key];
                        }
                    });
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
                    createdMainTasks = mainResponse.tasks || [];
                    
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
                    
                    // Clean child tasks data
                    const cleanedChildTasks = childTasksData.map(task => {
                        const cleaned = {};
                        Object.keys(task).forEach(key => {
                            if (task[key] !== null && task[key] !== '') {
                                cleaned[key] = task[key];
                            }
                        });
                        return cleaned;
                    });
                    
                    if (cleanedChildTasks.length > 0) {
                        const childBulkData = {
                            job_order: jobOrderId,
                            tasks: cleanedChildTasks
                        };
                        const childResponse = await bulkCreateDepartmentTasks(childBulkData);
                        createdChildTasks = childResponse.tasks || [];
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
                    // Fetch template with items
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
                        
                        // First pass: add only main tasks and create mapping
                        const newMainTasks = mainItems.map((item, itemIndex) => {
                            const actualIndex = window.tasksList.length + itemIndex;
                            templateItemIdToIndex.set(item.id, actualIndex);
                            
                            return {
                                department: item.department,
                                department_display: item.department_display,
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
                                        sequence: child.sequence || (childIndex + 1),
                                        description: '',
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

// Render tasks table
function renderTasksTable() {
    const container = document.getElementById('tasks-table-container');
    if (!container) return;
    
    if (window.tasksList.length === 0) {
        container.innerHTML = '<p class="text-muted text-center py-3">Henüz görev eklenmedi. Şablon seçin veya manuel görev ekleyin.</p>';
        return;
    }
    
    const tableHtml = `
        <div class="table-responsive">
            <table class="table table-sm table-bordered">
                <thead>
                    <tr>
                        <th style="width: 60px;">Sıra</th>
                        <th>Departman</th>
                        <th style="width: 200px;">Bağımlılıklar</th>
                        <th style="width: 100px;">İşlemler</th>
                    </tr>
                </thead>
                <tbody>
                    ${window.tasksList.map((task, index) => {
                        const isChildTask = task.isChildTask || false;
                        const indentClass = isChildTask ? 'ps-4' : '';
                        const childIndicator = isChildTask ? '<span class="text-muted me-1">↳</span>' : '';
                        return `
                        <tr data-task-index="${index}" ${isChildTask ? 'class="table-light"' : ''}>
                            <td class="${indentClass}">
                                ${childIndicator}
                                <input type="number" class="form-control form-control-sm task-sequence" 
                                       value="${task.sequence || index + 1}" 
                                       data-index="${index}" 
                                       style="width: 60px;"
                                       ${isChildTask ? 'readonly' : ''}>
                            </td>
                            <td>
                                <select class="form-select form-select-sm task-department" 
                                        data-index="${index}"
                                        ${isChildTask ? 'disabled' : ''}>
                                    ${window.departmentChoicesForTasks.map(dept => 
                                        `<option value="${dept.value}" ${task.department === dept.value ? 'selected' : ''}>${dept.label}</option>`
                                    ).join('')}
                                </select>
                            </td>
                            <td>
                                ${isChildTask ? '<span class="text-muted">Alt görev - bağımlılık yok</span>' : `<div id="depends-on-dropdown-${index}" class="depends-on-dropdown-container" data-index="${index}"></div>`}
                            </td>
                            <td>
                                <button type="button" class="btn btn-sm btn-outline-danger remove-task-btn" 
                                        data-index="${index}">
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
                    const displayText = `${deptLabel} (Sıra: ${t.sequence || idx + 1})`;
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
            
            // Clean up dropdown if it exists
            if (window.taskDependsOnDropdowns && window.taskDependsOnDropdowns.has(index)) {
                const dropdown = window.taskDependsOnDropdowns.get(index);
                dropdown.destroy();
                window.taskDependsOnDropdowns.delete(index);
            }
            
            window.tasksList.splice(index, 1);
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
