import { initNavbar } from '../../../../components/navbar.js';
import { fetchTasks, updateTask as updateTaskAPI } from '../../../../apis/tasks.js';
import { fetchMachines } from '../../../../apis/machines.js';
import { authFetchUsers } from '../../../../apis/users.js';
import { HeaderComponent } from '../../../../components/header/header.js';
import { FiltersComponent } from '../../../../components/filters/filters.js';
import { TableComponent } from '../../../../components/table/table.js';

// State management
let pendingTasksTable = null;
let notInPlanTasksTable = null;
let pendingTasksFilters = null;
let tasks = [];
let notInPlanTasks = [];
let machines = [];
let users = [];
let isLoading = false;
let isLoadingNotInPlan = false;
let isInlineEditing = false;
let currentPage = 1;
let totalTasks = 0;
let currentSortField = 'key';
let currentSortDirection = 'asc';

// Badge rendering function
function renderTaskKeyBadge(value) {
    if (!value) return '-';
    return `
        <a href="/manufacturing/machining/tasks/list/?task=${value}" target="_blank" rel="noopener noreferrer" 
           style="text-decoration: none; cursor: pointer;">
            <span style="font-weight: 700; color: #0d6efd; font-family: 'Courier New', monospace; font-size: 1rem; background: rgba(13, 110, 253, 0.1); padding: 0.25rem 0.5rem; border-radius: 4px; border: 1px solid rgba(13, 110, 253, 0.2); display: inline-block;">
                ${value}
            </span>
        </a>
    `;
}

function renderTaskCountBadge(count) {
    return `
        <span class="status-badge status-green" style="min-width: auto; padding: 0.25rem 0.5rem; margin-left: 0.5rem;">
            ${count} ${count === 1 ? 'görev' : 'görev'}
        </span>
    `;
}

function renderPendingTasksTable() {
    // Prepare data for table (convert finish_time format)
    const tableData = tasks.map(task => {
        let finishTimeValue = null;
        if (task.finish_time) {
            const date = new Date(task.finish_time);
            if (!isNaN(date.getTime())) {
                finishTimeValue = date.toISOString().split('T')[0];
            }
        } else if (task.planned_end_ms) {
            const date = new Date(task.planned_end_ms);
            if (!isNaN(date.getTime())) {
                finishTimeValue = date.toISOString().split('T')[0];
            }
        }
        
        return {
            ...task,
            finish_time: finishTimeValue
        };
    });
    
    if (pendingTasksTable) {
        pendingTasksTable.setLoading(false);
        pendingTasksTable.updateData(tableData, totalTasks, currentPage);
        
        // Update machine options if machines are loaded
        if (machines.length > 0) {
            const machineOptions = machines.map(machine => ({
                value: machine.id.toString(),
                label: machine.name
            }));
            pendingTasksTable.updateColumn('machine_fk', { options: machineOptions });
        }
    }
}

function renderNotInPlanTasksTable() {
    if (notInPlanTasksTable) {
        notInPlanTasksTable.setLoading(false);
        notInPlanTasksTable.updateData(notInPlanTasks);
    }
}

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    await initNavbar();
    
    // Initialize header component
    const header = new HeaderComponent({
        title: 'Bekleyen Görevler',
        subtitle: 'Makine atanmamış görevler',
        icon: 'clock',
        showBackButton: 'block',
        showRefreshButton: 'block',
        refreshButtonText: 'Yenile',
        onBackClick: () => window.location.href = '/manufacturing/machining/tasks/',
        onRefreshClick: () => {
            Promise.all([
                loadPendingTasks(currentPage),
                loadNotInPlanTasks()
            ]);
        }
    });
    
    // Initialize filters component
    await initializeFiltersComponent();
    
    // Initialize tables immediately with loading state
    initializePendingTasksTable();
    initializeNotInPlanTasksTable();
    
    // Load machines first (needed for machine dropdown)
    await loadMachines();
    
    // Load users for completed_by filter
    await loadUsers();
    
    // Load pending tasks and not in plan tasks in parallel
    await Promise.all([
        loadPendingTasks(),
        loadNotInPlanTasks()
    ]);
});

async function loadMachines() {
    try {
        const machinesResponse = await fetchMachines(1, 100, { used_in: 'machining' });
        machines = machinesResponse.results || machinesResponse || [];
        
        // Update table machine options if table exists
        if (pendingTasksTable && machines.length > 0) {
            const machineOptions = machines.map(machine => ({
                value: machine.id.toString(),
                label: machine.name
            }));
            pendingTasksTable.updateColumn('machine_fk', { options: machineOptions });
        }
    } catch (error) {
        console.error('Error loading machines:', error);
        machines = [];
    }
}

async function loadUsers() {
    try {
        const usersResponse = await authFetchUsers(1, 1000, { 
            team: 'manufacturing',
            ordering: 'full_name'
        });
        users = usersResponse.results || [];
        
        // Update completed_by filter options if filters component exists
        if (pendingTasksFilters && users.length > 0) {
            const userOptions = [
                { value: '', label: 'Tüm Kullanıcılar' },
                ...users.map(user => ({
                    value: user.id.toString(),
                    label: user.full_name ? `${user.full_name} (${user.username})` : user.username
                }))
            ];
            pendingTasksFilters.updateFilterOptions('completed-by-filter', userOptions);
        }
    } catch (error) {
        console.error('Error loading users:', error);
        users = [];
    }
}

async function initializeFiltersComponent() {
    pendingTasksFilters = new FiltersComponent('filters-placeholder', {
        title: 'Bekleyen Görevler Filtreleri',
        onApply: (values) => {
            currentPage = 1;
            loadPendingTasks();
        },
        onClear: () => {
            currentPage = 1;
            loadPendingTasks();
            showNotification('Filtreler temizlendi', 'info');
        },
        onFilterChange: (filterId, value) => {
            console.log(`Filter ${filterId} changed to:`, value);
        }
    });

    // Add TI No filter
    pendingTasksFilters.addTextFilter({
        id: 'key-filter',
        label: 'TI No',
        placeholder: 'TI-001',
        colSize: 3
    });

    // Add completed_by filter (will be populated after users are loaded)
    pendingTasksFilters.addDropdownFilter({
        id: 'completed-by-filter',
        label: 'Oluşturan',
        options: [
            { value: '', label: 'Tüm Kullanıcılar' }
        ],
        placeholder: 'Tüm Kullanıcılar',
        colSize: 3
    });
}

async function loadPendingTasks(page = 1) {
    if (isLoading) return;
    
    // Don't reload if inline editing is active
    if (isInlineEditing) {
        console.log('Skipping loadPendingTasks due to active inline editing');
        return;
    }
    
    isLoading = true;
    currentPage = page;
    
    // Set loading state on table
    if (pendingTasksTable) {
        pendingTasksTable.setLoading(true);
    }
    
    try {
        // Build query parameters
        const params = new URLSearchParams();
        params.append('machine_fk__isnull', 'true');
        
        // Get filter values from the filters component
        const filterValues = pendingTasksFilters ? pendingTasksFilters.getFilterValues() : {};
        
        // Add filters
        const keyFilter = filterValues['key-filter']?.trim();
        const completedByFilter = filterValues['completed-by-filter'] || '';
        
        if (keyFilter) {
            let key = keyFilter;
            if (/^\d+$/.test(key)) {
                key = 'TI-' + key;
            }
            params.append('key', key);
        }
        
        if (completedByFilter) {
            params.append('created_by', completedByFilter);
        }
        
        // Add pagination
        params.append('page', page);
        const pageSize = pendingTasksTable ? pendingTasksTable.options.itemsPerPage : 20;
        params.append('page_size', String(pageSize));
        
        // Add ordering
        const orderingParam = currentSortDirection === 'asc' ? currentSortField : `-${currentSortField}`;
        params.append('ordering', orderingParam);
        
        const response = await fetchTasks(`?${params.toString()}`);
        
        if (response.ok) {
            const data = await response.json();
            tasks = Array.isArray(data.results) ? data.results : [];
            totalTasks = data.count || 0;
            
            renderPendingTasksTable();
        } else {
            throw new Error('Failed to load pending tasks');
        }
    } catch (error) {
        console.error('Error loading pending tasks:', error);
        showNotification('Bekleyen görevler yüklenirken hata oluştu', 'error');
        tasks = [];
        totalTasks = 0;
        if (pendingTasksTable) {
            pendingTasksTable.setLoading(false);
            pendingTasksTable.updateData([], 0, 1);
        }
    } finally {
        isLoading = false;
    }
}

function initializePendingTasksTable() {
    const container = document.getElementById('pending-tasks-table-container');
    if (!container) {
        console.error('Container element "pending-tasks-table-container" not found!');
        return;
    }
    
    pendingTasksTable = new TableComponent('pending-tasks-table-container', {
        title: 'Bekleyen Görevler',
        icon: 'fas fa-clock',
        iconColor: 'text-warning',
        columns: [
            {
                field: 'key',
                label: 'TI No',
                sortable: true,
                formatter: (value) => renderTaskKeyBadge(value)
            },
            {
                field: 'name',
                label: 'Görev Adı',
                sortable: true,
                headerClass: 'text-nowrap',
                cellClass: 'text-truncate',
                formatter: (value) => {
                    if (!value) return '-';
                    const maxLength = 40;
                    return value.length > maxLength 
                        ? `<span title="${value}">${value.substring(0, maxLength)}...</span>`
                        : value;
                }
            },
            {
                field: 'job_no',
                label: 'İş No',
                sortable: true,
                formatter: (value) => value || '-'
            },
            {
                field: 'image_no',
                label: 'Resim No',
                sortable: true,
                formatter: (value) => value || '-'
            },
            {
                field: 'position_no',
                label: 'Pozisyon No',
                sortable: true,
                formatter: (value) => value || '-'
            },
            {
                field: 'quantity',
                label: 'Adet',
                sortable: true,
                formatter: (value) => value || '-'
            },
            {
                field: 'machine_fk',
                label: 'Makine',
                sortable: true,
                type: 'select',
                options: machines.map(machine => ({
                    value: machine.id.toString(),
                    label: machine.name
                })),
                formatter: (value, row) => {
                    return `<span class="machine-name">${row.machine_name || '-'}</span>`;
                }
            },
            {
                field: 'finish_time',
                label: 'Bitiş Tarihi',
                sortable: true,
                type: 'date',
                formatter: (value, row) => {
                    if (value) {
                        const date = new Date(value);
                        if (!isNaN(date.getTime())) {
                            return date.toLocaleDateString('tr-TR');
                        }
                    }
                    if (row.planned_end_ms) {
                        const date = new Date(row.planned_end_ms);
                        return date.toLocaleDateString('tr-TR');
                    }
                    return '-';
                }
            },
            {
                field: 'created_at',
                label: 'Oluşturulma Tarihi',
                sortable: true,
                formatter: (value) => {
                    if (value) {
                        return new Date(value).toLocaleDateString('tr-TR');
                    }
                    return '-';
                }
            }
        ],
        data: [],
        loading: true,
        sortable: true,
        defaultSortField: 'key',
        defaultSortDirection: 'asc',
        pagination: true,
        itemsPerPage: 20,
        currentPage: 1,
        totalItems: 0,
        serverSidePagination: true,
        onPageChange: (page) => {
            loadPendingTasks(page);
        },
        onPageSizeChange: (newSize) => {
            if (pendingTasksTable) {
                pendingTasksTable.options.itemsPerPage = newSize;
            }
            currentPage = 1;
            loadPendingTasks(1);
        },
        onSort: (field, direction) => {
            currentSortField = field;
            currentSortDirection = direction;
            loadPendingTasks(1);
        },
        responsive: true,
        exportable: true,
        exportFormats: ['excel'],
        emptyMessage: 'Bekleyen görev bulunamadı',
        emptyIcon: 'fas fa-check-circle',
        editable: true,
        editableColumns: ['machine_fk', 'finish_time'],
        onEdit: async (row, field, newValue, oldValue) => {
            try {
                isInlineEditing = true;
                
                let normalizedOld = oldValue;
                let normalizedNew = newValue;
                
                if (field === 'machine_fk') {
                    normalizedOld = oldValue ? oldValue.toString() : '';
                    normalizedNew = newValue ? newValue.toString() : '';
                }
                
                if (field === 'finish_time') {
                    normalizedOld = oldValue ? oldValue.toString() : '';
                    normalizedNew = newValue ? newValue.toString() : '';
                }
                
                if (normalizedOld === normalizedNew) {
                    isInlineEditing = false;
                    return true;
                }
                
                const updateData = {};
                
                if (field === 'machine_fk') {
                    updateData.machine_fk = newValue ? parseInt(newValue) : null;
                } else if (field === 'finish_time') {
                    if (newValue) {
                        updateData.finish_time = newValue;
                    } else {
                        updateData.finish_time = null;
                    }
                } else {
                    updateData[field] = newValue;
                }
                
                const response = await updateTaskAPI(row.key, updateData);
                
                if (response.ok) {
                    if (field === 'machine_fk') {
                        row.machine_fk = newValue ? parseInt(newValue) : null;
                        const selectedMachine = machines.find(m => m.id == newValue);
                        row.machine_name = selectedMachine ? selectedMachine.name : null;
                        
                        if (newValue) {
                            // Remove task from local array and reload
                            tasks = tasks.filter(t => t.key !== row.key);
                            totalTasks = Math.max(0, totalTasks - 1);
                            // Reload to get updated list
                            loadPendingTasks(currentPage);
                            showNotification('Makine atandı. Görev listeden kaldırıldı.', 'success');
                            isInlineEditing = false;
                            return true;
                        }
                    } else if (field === 'finish_time') {
                        row.finish_time = newValue || null;
                        if (newValue) {
                            const date = new Date(newValue);
                            row.planned_end_ms = date.getTime();
                        } else {
                            row.planned_end_ms = null;
                        }
                        
                        const originalTask = tasks.find(t => t.key === row.key);
                        if (originalTask) {
                            originalTask.finish_time = newValue || null;
                            if (newValue) {
                                const date = new Date(newValue);
                                originalTask.planned_end_ms = date.getTime();
                            } else {
                                originalTask.planned_end_ms = null;
                            }
                        }
                    } else {
                        row[field] = newValue;
                    }
                    
                    // Reload to get updated data from server
                    loadPendingTasks(currentPage);
                    
                    loadNotInPlanTasks();
                    
                    showNotification('Görev başarıyla güncellendi', 'success');
                    isInlineEditing = false;
                    return true;
                } else {
                    throw new Error('Failed to update task');
                }
            } catch (error) {
                console.error('Error updating task:', error);
                showNotification('Görev güncellenirken hata oluştu', 'error');
                isInlineEditing = false;
                return false;
            }
        }
    });
}


function showNotification(message, type = 'info') {
    // Remove existing notifications
    document.querySelectorAll('.notification').forEach(n => n.remove());
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification alert alert-${type === 'error' ? 'danger' : type} alert-dismissible fade show`;
    notification.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
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
    
    return notification;
}

async function loadNotInPlanTasks() {
    if (isLoadingNotInPlan) return;
    
    isLoadingNotInPlan = true;
    
    // Set loading state on table
    if (notInPlanTasksTable) {
        notInPlanTasksTable.setLoading(true);
    }
    
    try {
        // Fetch tasks where in_plan is false and completion_date is null
        const params = new URLSearchParams();
        params.append('in_plan', 'false');
        params.append('completion_date__isnull', 'true');
        params.append('page_size', '10000'); // Get all not in plan tasks
        
        const response = await fetchTasks(`?${params.toString()}`);
        
        if (response.ok) {
            const data = await response.json();
            notInPlanTasks = Array.isArray(data.results) ? data.results : [];
            
            // Sort by key
            notInPlanTasks.sort((a, b) => {
                const getKeyNumber = (key) => {
                    if (!key) return 0;
                    const match = key.toString().match(/\d+/);
                    return match ? parseInt(match[0]) : 0;
                };
                return getKeyNumber(a.key) - getKeyNumber(b.key);
            });
            
            renderNotInPlanTasksTable();
        } else {
            throw new Error('Failed to load not in plan tasks');
        }
    } catch (error) {
        console.error('Error loading not in plan tasks:', error);
        showNotification('Plana dahil olmayan görevler yüklenirken hata oluştu', 'error');
        notInPlanTasks = [];
        if (notInPlanTasksTable) {
            notInPlanTasksTable.setLoading(false);
            notInPlanTasksTable.updateData([]);
        }
    } finally {
        isLoadingNotInPlan = false;
    }
}

function initializeNotInPlanTasksTable() {
    const container = document.getElementById('not-in-plan-tasks-table-container');
    if (!container) {
        console.error('Container element "not-in-plan-tasks-table-container" not found!');
        return;
    }
    
    notInPlanTasksTable = new TableComponent('not-in-plan-tasks-table-container', {
            title: 'Plana Dahil Olmayan Görevler',
            icon: 'fas fa-calendar-times',
            iconColor: 'text-secondary',
            columns: [
                {
                    field: 'key',
                    label: 'TI No',
                    sortable: true,
                    formatter: (value) => renderTaskKeyBadge(value)
                },
                {
                    field: 'machine_name',
                    label: 'Makine',
                    sortable: true,
                    formatter: (value) => value || '-'
                },
                {
                    field: 'finish_time',
                    label: 'Bitiş Tarihi',
                    sortable: true,
                    formatter: (value, row) => {
                        if (row.finish_time) {
                            const date = new Date(row.finish_time);
                            if (!isNaN(date.getTime())) {
                                return date.toLocaleDateString('tr-TR');
                            }
                        }
                        if (row.planned_end_ms) {
                            const date = new Date(row.planned_end_ms);
                            return date.toLocaleDateString('tr-TR');
                        }
                        return '-';
                    }
                },
                {
                    field: 'created_at',
                    label: 'Oluşturulma Tarihi',
                    sortable: true,
                    formatter: (value) => {
                        if (value) {
                            return new Date(value).toLocaleDateString('tr-TR');
                        }
                        return '-';
                    }
                }
            ],
            data: [],
            loading: true,
            sortable: true,
            defaultSortField: 'key',
            defaultSortDirection: 'asc',
            pagination: false,
            responsive: true,
            exportable: true,
            exportFormats: ['excel'],
            emptyMessage: 'Plana dahil olmayan görev bulunamadı',
            emptyIcon: 'fas fa-calendar-times'
        });
}
