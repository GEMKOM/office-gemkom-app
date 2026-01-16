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
    STATUS_OPTIONS,
    PRIORITY_OPTIONS
} from '../../apis/projects/jobOrders.js';
import { listCustomers } from '../../apis/projects/customers.js';
import { CURRENCY_OPTIONS } from '../../apis/projects/customers.js';
import { HeaderComponent } from '../../components/header/header.js';
import { FiltersComponent } from '../../components/filters/filters.js';
import { StatisticsCards } from '../../components/statistics-cards/statistics-cards.js';
import { TableComponent } from '../../components/table/table.js';
import { DisplayModal } from '../../components/display-modal/display-modal.js';
import { EditModal } from '../../components/edit-modal/edit-modal.js';
import { initRouteProtection } from '../../apis/routeProtection.js';

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
        
        await loadJobOrders();
        updateJobOrderCounts();
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
        columns: [
            {
                field: 'job_no',
                label: 'İş Emri No',
                sortable: true,
                formatter: (value, row) => {
                    const hasChildren = row.children_count && row.children_count > 0;
                    const isExpanded = expandedRows.has(row.job_no);
                    const isChild = !!row.parent;
                    
                    // Add indentation for child jobs
                    const indent = isChild ? 30 : 0;
                    const prefix = isChild ? '<i class="fas fa-level-down-alt text-muted me-1"></i>' : '';
                    
                    // Expand/collapse button for rows with children
                    let expandButton = '';
                    if (hasChildren && !isChild) {
                        const expandIcon = isExpanded ? 'fa-chevron-down' : 'fa-chevron-right';
                        expandButton = `
                            <button type="button" 
                                    class="btn btn-sm btn-link p-0 me-2 expand-toggle-btn" 
                                    data-job-no="${row.job_no}"
                                    style="width: 20px; height: 20px; line-height: 1; border: none; background: none;"
                                    title="${isExpanded ? 'Daralt' : 'Genişlet'}">
                                <i class="fas ${expandIcon} text-primary"></i>
                            </button>
                        `;
                    } else if (!isChild) {
                        // Add spacing for rows without children to align with expandable rows
                        expandButton = '<span class="me-2" style="display: inline-block; width: 20px;"></span>';
                    }
                    
                    return `<div style="padding-left: ${indent}px;">${expandButton}${prefix}<strong>${value || '-'}</strong></div>`;
                }
            },
            {
                field: 'parent',
                label: 'Ana İş',
                sortable: false,
                formatter: (value) => {
                    if (!value) return '<span class="text-muted">-</span>';
                    return `<span class="badge bg-light text-dark">${value}</span>`;
                }
            },
            {
                field: 'title',
                label: 'Başlık',
                sortable: true,
                formatter: (value) => value || '-'
            },
            {
                field: 'customer_name',
                label: 'Müşteri',
                sortable: false,
                formatter: (value, row) => {
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
                    const priority = row.priority;
                    if (priority === 'urgent') {
                        return '<span class="badge bg-danger">Acil</span>';
                    } else if (priority === 'high') {
                        return '<span class="badge bg-warning">Yüksek</span>';
                    } else if (priority === 'normal') {
                        return '<span class="badge bg-info">Normal</span>';
                    } else if (priority === 'low') {
                        return '<span class="badge bg-secondary">Düşük</span>';
                    }
                    return value || '-';
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
                    if (!value) return '-';
                    const percentage = parseFloat(value);
                    const color = percentage >= 100 ? 'success' : percentage >= 50 ? 'info' : 'warning';
                    return `
                        <div class="progress" style="height: 20px;">
                            <div class="progress-bar bg-${color}" role="progressbar" 
                                 style="width: ${percentage}%" 
                                 aria-valuenow="${percentage}" 
                                 aria-valuemin="0" 
                                 aria-valuemax="100">
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
                formatter: (value) => {
                    if (!value || value === 0) return '-';
                    return `<span class="badge bg-secondary">${value}</span>`;
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

// Merge expanded children into the job orders array
function mergeExpandedChildren(rootOrders) {
    const merged = [];
    
    rootOrders.forEach(rootOrder => {
        merged.push(rootOrder);
        
        // If this row is expanded, add its children
        if (expandedRows.has(rootOrder.job_no)) {
            const children = childrenCache.get(rootOrder.job_no) || [];
            children.forEach(child => {
                // Mark as child for proper formatting
                child.hierarchy_level = 1;
                merged.push(child);
            });
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
            // Expand: fetch children if not cached
            if (!childrenCache.has(jobNo)) {
                try {
                    // Show loading state on button
                    const icon = expandButton.querySelector('i');
                    if (icon) {
                        icon.className = 'fas fa-spinner fa-spin text-primary';
                    }
                    
                    await fetchJobOrderChildren(jobNo);
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
            expandedRows.add(jobNo);
            // Update table without loading state
            updateTableDataOnly();
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
            colSize: 6,
            helpText: 'Tahmini maliyet'
        });

        editJobOrderModal.addField({
            id: 'cost_currency',
            name: 'cost_currency',
            label: 'Para Birimi',
            type: 'dropdown',
            value: jobOrder.cost_currency || 'TRY',
            icon: 'fas fa-coins',
            colSize: 6,
            helpText: 'Maliyet para birimi',
            options: CURRENCY_OPTIONS.map(c => ({
                value: c.value,
                label: c.label
            }))
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
        
        // Create a detailed view modal
        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.innerHTML = `
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            <i class="fas fa-info-circle me-2"></i>İş Emri Detayları
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="row mb-3">
                            <div class="col-md-6">
                                <strong>İş Emri No:</strong> ${jobOrder.job_no}
                            </div>
                            <div class="col-md-6">
                                <strong>Durum:</strong> ${jobOrder.status_display}
                            </div>
                        </div>
                        <div class="row mb-3">
                            <div class="col-12">
                                <strong>Başlık:</strong> ${jobOrder.title}
                            </div>
                        </div>
                        ${jobOrder.description ? `
                        <div class="row mb-3">
                            <div class="col-12">
                                <strong>Açıklama:</strong><br>
                                ${jobOrder.description}
                            </div>
                        </div>
                        ` : ''}
                        <div class="row mb-3">
                            <div class="col-md-6">
                                <strong>Müşteri:</strong> ${jobOrder.customer_name} (${jobOrder.customer_code})
                            </div>
                            <div class="col-md-6">
                                <strong>Öncelik:</strong> ${jobOrder.priority_display}
                            </div>
                        </div>
                        ${jobOrder.parent ? `
                        <div class="row mb-3">
                            <div class="col-12">
                                <strong>Ana İş:</strong> ${jobOrder.parent} - ${jobOrder.parent_title || ''}
                            </div>
                        </div>
                        ` : ''}
                        ${jobOrder.children && jobOrder.children.length > 0 ? `
                        <div class="row mb-3">
                            <div class="col-12">
                                <strong>Alt İşler (${jobOrder.children.length}):</strong>
                                <ul class="mt-2">
                                    ${jobOrder.children.map(child => `
                                        <li>${child.job_no} - ${child.title} (${child.status_display}, %${child.completion_percentage})</li>
                                    `).join('')}
                                </ul>
                            </div>
                        </div>
                        ` : ''}
                        <div class="row mb-3">
                            <div class="col-md-6">
                                <strong>Tamamlanma:</strong> ${jobOrder.completion_percentage}%
                            </div>
                            <div class="col-md-6">
                                <strong>Hedef Tarih:</strong> ${jobOrder.target_completion_date ? new Date(jobOrder.target_completion_date).toLocaleDateString('tr-TR') : '-'}
                            </div>
                        </div>
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

window.showCreateChildJobOrderModal = function(parentJobNo) {
    if (customers.length === 0) {
        showNotification('Müşteri verileri yükleniyor, lütfen bekleyin...', 'warning');
        return;
    }

    // Find parent job order to get customer info
    const parentJob = jobOrders.find(j => j.job_no === parentJobNo);
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

    // Note: Customer is inherited from parent, so we don't show it
    createJobOrderModal.addSection({
        title: 'Bilgi',
        icon: 'fas fa-info',
        iconColor: 'text-success'
    });

    createJobOrderModal.addField({
        id: 'info',
        name: 'info',
        label: 'Not',
        type: 'text',
        value: `Müşteri bilgisi otomatik olarak ana iş emrinden (${parentJob.customer_name}) alınacaktır.`,
        icon: 'fas fa-info-circle',
        colSize: 12,
        helpText: 'Müşteri bilgisi otomatik alınır',
        disabled: true
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
    if (!confirm(`İş emri ${jobNo} başlatılsın mı?`)) {
        return;
    }
    
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
        helpText: 'Müşteri seçin',
        options: customers.map(c => ({
            value: c.id.toString(),
            label: `${c.code} - ${c.name}`
        }))
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
        colSize: 6,
        helpText: 'Tahmini maliyet'
    });

    createJobOrderModal.addField({
        id: 'cost_currency',
        name: 'cost_currency',
        label: 'Para Birimi',
        type: 'dropdown',
        placeholder: 'Para birimi seçin...',
        value: 'TRY',
        icon: 'fas fa-coins',
        colSize: 6,
        helpText: 'Maliyet para birimi',
        options: CURRENCY_OPTIONS.map(c => ({
            value: c.value,
            label: c.label
        }))
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
    
    // Set up customer dropdown change listener
    const setupCustomerListener = () => {
        // Find the dropdown container by ID (EditModal creates it as dropdown-{fieldId})
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
        setupCustomerListener();
    });
    
    // Also set up after modal is shown
    const modalElement = createJobOrderModal.container.querySelector('#editModal');
    if (modalElement) {
        const handleShown = () => {
            setupCustomerListener();
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
            if (formData.job_no_extension && window.selectedCustomerCode) {
                formData.job_no = window.selectedCustomerCode + '-' + formData.job_no_extension;
                delete formData.job_no_extension; // Remove the extension field
            }
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

// Helper function for notifications
function showNotification(message, type = 'info') {
    alert(`${type.toUpperCase()}: ${message}`);
}
