import { initNavbar } from '../../../../components/navbar.js';
import { ModernDropdown } from '../../../../components/dropdown.js';
import { EditModal } from '../../../../components/edit-modal/edit-modal.js';
import { TableComponent } from '../../../../components/table/table.js';
import { fetchMachines } from '../../../../generic/machines.js';
import { fetchUsers } from '../../../../generic/users.js';
import { fetchTaskById } from '../../../../generic/tasks.js';
import { backendBase } from '../../../../base.js';
import { authedFetch } from '../../../../authService.js';
import { HeaderComponent } from '../../../../components/header/header.js';
import { FiltersComponent } from '../../../../components/filters/filters.js';
import { StatisticsCards } from '../../../../components/statistics-cards/statistics-cards.js';

// State management
let currentPage = 1;
let currentSortField = 'finish_time';
let currentSortDirection = 'desc';
let timers = [];
let machines = [];
let users = [];
let totalTimers = 0;
let isLoading = false;
let pageSize = 20;
let timerFilters = null; // Filters component instance

// Header component instance
let headerComponent;

// Statistics Cards component instance
let finishedTimersStats = null;

// Edit Modal component instance
let editTimerModal = null;

// Table component instance
let timersTable = null;

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    await initNavbar();
    
    // Initialize header component
    initHeaderComponent();
    
    // Initialize Statistics Cards component
    finishedTimersStats = new StatisticsCards('finished-timers-statistics', {
        cards: [
            { title: 'Toplam Zamanlayıcı', value: '0', icon: 'fas fa-list', color: 'primary', id: 'total-timers-count' },
            { title: 'Toplam Süre (Saat)', value: '0', icon: 'fas fa-clock', color: 'success', id: 'total-hours' },
            { title: 'Aktif Kullanıcı', value: '0', icon: 'fas fa-users', color: 'info', id: 'active-users-count' },
            { title: 'Aktif Makine', value: '0', icon: 'fas fa-cogs', color: 'warning', id: 'active-machines-count' }
        ],
        compact: true,
        animation: true
    });
    
    initializeEditModal();
    initializeTable();
    setupEventListeners();
    await initializeFinishedTimers();
    
    // Check for edit parameter in URL
    checkForEditParameter();
});

// Initialize Edit Modal
function initializeEditModal() {
    editTimerModal = new EditModal('edit-timer-modal-container', {
        title: 'Zamanlayıcıyı Düzenle',
        icon: 'fas fa-edit',
        saveButtonText: 'Kaydet',
        size: 'lg'
    });
    
    // Configure the modal with timer fields
    editTimerModal
        .addSection({
            title: 'Temel Bilgiler',
            icon: 'fas fa-info-circle',
            iconColor: 'text-primary',
            fields: [
                {
                    id: 'job_no',
                    name: 'job_no',
                    label: 'İş No',
                    type: 'text',
                    placeholder: 'İş numarasını girin',
                    icon: 'fas fa-hashtag',
                    colSize: 6,
                    readonly: true
                },
                {
                    id: 'image_no',
                    name: 'image_no',
                    label: 'Resim No',
                    type: 'text',
                    placeholder: 'Resim numarasını girin',
                    icon: 'fas fa-image',
                    colSize: 6,
                    readonly: true
                },
                {
                    id: 'position_no',
                    name: 'position_no',
                    label: 'Pozisyon No',
                    type: 'text',
                    placeholder: 'Pozisyon numarasını girin',
                    icon: 'fas fa-map-marker-alt',
                    colSize: 6,
                    readonly: true
                },
                {
                    id: 'quantity',
                    name: 'quantity',
                    label: 'Adet',
                    type: 'number',
                    placeholder: 'Adet girin',
                    min: 1,
                    icon: 'fas fa-cubes',
                    colSize: 6,
                    readonly: true
                },
                {
                    id: 'username',
                    name: 'username',
                    label: 'Kullanıcı',
                    type: 'text',
                    placeholder: 'Kullanıcı adı',
                    icon: 'fas fa-user',
                    colSize: 6,
                    readonly: true
                }
            ]
        })
        .addSection({
            title: 'Zamanlayıcı Bilgileri',
            icon: 'fas fa-clock',
            iconColor: 'text-success',
            fields: [
                {
                    id: 'start_time',
                    name: 'start_time',
                    label: 'Başlangıç Zamanı',
                    type: 'text',
                    icon: 'fas fa-calendar-check',
                    colSize: 6,
                    readonly: true
                },
                {
                    id: 'calculated_duration',
                    name: 'calculated_duration',
                    label: 'Hesaplanan Süre',
                    type: 'text',
                    icon: 'fas fa-hourglass-half',
                    colSize: 6,
                    readonly: true
                },
                {
                    id: 'machine',
                    name: 'machine',
                    label: 'Makine',
                    type: 'text',
                    placeholder: 'Makine adı',
                    icon: 'fas fa-cogs',
                    colSize: 6,
                    readonly: true
                },
                {
                    id: 'finish_time',
                    name: 'finish_time',
                    label: 'Bitiş Zamanı',
                    type: 'datetime-local',
                    icon: 'fas fa-calendar-times',
                    colSize: 6
                },
                {
                    id: 'comment',
                    name: 'comment',
                    label: 'Yorum',
                    type: 'textarea',
                    placeholder: 'Yorum girin...',
                    rows: 3,
                    icon: 'fas fa-comment',
                    colSize: 12
                },
                {
                    id: 'manual_entry',
                    name: 'manual_entry',
                    label: 'Manuel Giriş',
                    type: 'checkbox',
                    icon: 'fas fa-hand-paper',
                    colSize: 12
                }
            ]
        })
        .render()
        .onSaveCallback(async (formData) => {
            await saveEditTimer(formData);
        });
}

// Initialize Table Component
function initializeTable() {
    timersTable = new TableComponent('timers-table-container', {
        title: 'Zamanlayıcı Listesi',
        icon: 'fas fa-table',
        iconColor: 'text-primary',
        columns: [
            {
                field: 'username',
                label: 'Kullanıcı',
                sortable: false,
                type: 'text',
                formatter: (value) => `<span style="font-weight: 600; color: #343a40;">${value || '-'}</span>`
            },
            {
                field: 'issue_key',
                label: 'TI No',
                sortable: true,
                type: 'text',
                formatter: (value) => {
                    if (!value) return '-';
                    return `<span style="font-weight: 700; color: #0d6efd; font-family: 'Courier New', monospace; font-size: 1rem; background: rgba(13, 110, 253, 0.1); padding: 0.25rem 0.5rem; border-radius: 4px; border: 1px solid rgba(13, 110, 253, 0.2);">${value}</span>`;
                }
            },
            {
                field: 'job_no',
                label: 'İş No',
                sortable: false,
                type: 'text',
                formatter: (value) => value || '-'
            },
            {
                field: 'image_no',
                label: 'Resim No',
                sortable: false,
                type: 'text',
                formatter: (value) => value || '-'
            },
            {
                field: 'position_no',
                label: 'Poz No',
                sortable: false,
                type: 'text',
                formatter: (value) => value || '-'
            },
            {
                field: 'quantity',
                label: 'Adet',
                sortable: false,
                type: 'number',
                formatter: (value) => value || '-'
            },
            {
                field: 'machine_name',
                label: 'Makine',
                sortable: false,
                type: 'text',
                formatter: (value) => `<span style="font-weight: 500; color: #495057;">${value || '-'}</span>`
            },
            {
                field: 'start_time',
                label: 'Başlangıç',
                sortable: true,
                type: 'text',
                formatter: (value) => `<span style="color: #6c757d; font-weight: 500;">${formatDateTime(value)}</span>`
            },
            {
                field: 'finish_time',
                label: 'Bitiş',
                sortable: true,
                type: 'text',
                formatter: (value) => `<span style="color: #495057; font-weight: 500;">${formatDateTime(value)}</span>`
            },
            {
                field: 'duration',
                label: 'Süre (Saat)',
                sortable: true,
                type: 'text',
                formatter: (value, row) => {
                    const duration = calculateDuration(row.start_time, row.finish_time);
                    return `<span style="display: inline-block; padding: 0.25rem 0.5rem; background: #f8f9fa; color: #495057; border: 1px solid #dee2e6; border-radius: 4px; font-size: 0.75rem; font-weight: 500;">${duration}</span>`;
                }
            },
            {
                field: 'comment',
                label: 'Yorum',
                sortable: true,
                type: 'text',
                formatter: (value) => {
                    if (!value) return '<span class="text-muted">-</span>';
                    return `<button class="btn btn-sm btn-outline-info" data-comment="${value}" title="Yorumu görüntüle" style="font-size: 0.75rem; padding: 0.25rem 0.5rem; border-radius: 4px; transition: all 0.2s ease;">
                        <i class="fas fa-comment me-1"></i>Yorum
                    </button>`;
                }
            },
            {
                field: 'manual_entry',
                label: 'Manuel Giriş',
                sortable: true,
                type: 'text',
                formatter: (value) => {
                    return value ? 
                        '<span style="display: inline-block; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; background: rgba(40, 167, 69, 0.1); color: #198754; border: 1px solid rgba(40, 167, 69, 0.2);">Manuel</span>' : 
                        '<span class="text-muted">-</span>';
                }
            }
        ],
        actions: [
            {
                key: 'edit',
                label: 'Düzenle',
                icon: 'fas fa-edit',
                class: 'btn-outline-primary',
                onClick: (row) => showEditTimerModal(row)
            },
            {
                key: 'delete',
                label: 'Sil',
                icon: 'fas fa-trash',
                class: 'btn-outline-danger',
                onClick: (row) => deleteTimer(row.id)
            }
        ],
        data: timers,
        sortable: true,
        pagination: true,
        serverSidePagination: true,
        itemsPerPage: pageSize,
        currentPage: currentPage,
        totalItems: totalTimers,
        responsive: true,
        emptyMessage: 'Zamanlayıcı bulunamadı',
        emptyIcon: 'fas fa-inbox',
        loading: true,
        skeleton: true,
        skeletonRows: 5,
        onSort: (field, direction) => {
            currentSortField = field;
            currentSortDirection = direction;
            loadTimers(currentPage);
        },
        onPageChange: (page) => {
            currentPage = page;
            loadTimers(page);
        },
        onRowClick: (row) => {
            // Optional: Add row click functionality if needed
        }
    });
    
    timersTable.render();
}

// Initialize header component
function initHeaderComponent() {
    headerComponent = new HeaderComponent({
        title: 'Biten Zamanlayıcılar Raporu',
        subtitle: 'Tamamlanan zamanlayıcıların detaylı raporu',
        icon: 'clock',
        showBackButton: 'block',
        showRefreshButton: 'block',
        showExportButton: 'block',
        refreshButtonText: 'Yenile',
        exportButtonText: 'Dışa Aktar',
        onBackClick: () => {
            window.history.back();
        },
        onRefreshClick: () => {
            loadTimers(currentPage);
        },
        onExportClick: () => {
            exportTimers();
        }
    });
}

async function initializeFinishedTimers() {
    try {
        initializeFiltersComponent();
        await loadMachines();
        await loadUsers();
        initializeSortableHeaders();
        setDefaultDateFilters();
        
        await loadTimers();
        updateStatistics();
    } catch (error) {
        console.error('Error initializing finished timers:', error);
        showNotification('Zamanlayıcılar yüklenirken hata oluştu', 'error');
    }
}

async function loadMachines() {
    try {
        const machinesResponse = await fetchMachines(1, 100, { used_in: 'machining' });
        machines = machinesResponse.results || machinesResponse || [];
        
        // Update machine filter options if filters component is initialized
        if (timerFilters) {
            const machineOptions = [
                { value: '', label: 'Tüm Makineler' },
                ...machines.map(machine => ({ value: machine.id.toString(), label: machine.name }))
            ];
            timerFilters.updateFilterOptions('machine-filter', machineOptions);
        }
        
        // Machine field is now readonly text field, no need to populate dropdown options
    } catch (error) {
        console.error('Error loading machines:', error);
        machines = [];
    }
}

function initializeFiltersComponent() {
    // Initialize filters component
    timerFilters = new FiltersComponent('filters-placeholder', {
        title: 'Zamanlayıcı Filtreleri',
        onApply: (values) => {
            // Apply filters and reload timers
            loadTimers(1);
        },
        onClear: () => {
            // Clear filters and reload timers
            loadTimers(1);
            showNotification('Filtreler temizlendi', 'info');
        },
        onFilterChange: (filterId, value) => {
            // Optional: Handle individual filter changes
            console.log(`Filter ${filterId} changed to:`, value);
        }
    });

    // Add dropdown filters
    timerFilters.addDropdownFilter({
        id: 'user-filter',
        label: 'Kullanıcı',
        options: [
            { value: '', label: 'Tüm Kullanıcılar' }
        ],
        placeholder: 'Tüm Kullanıcılar',
        colSize: 2
    });

    // Add text filters
    timerFilters.addTextFilter({
        id: 'issue-key-filter',
        label: 'TI No',
        placeholder: 'TI-123',
        colSize: 1
    });

    timerFilters.addTextFilter({
        id: 'job-no-filter',
        label: 'İş No',
        placeholder: 'İş no',
        colSize: 1
    });

    // Add machine dropdown filter
    timerFilters.addDropdownFilter({
        id: 'machine-filter',
        label: 'Makine',
        options: [
            { value: '', label: 'Tüm Makineler' }
        ],
        placeholder: 'Tüm Makineler',
        colSize: 2
    });

    // Add date filters
    timerFilters.addDateFilter({
        id: 'start-date-filter',
        label: 'Başlangıç',
        colSize: 2
    });

    timerFilters.addDateFilter({
        id: 'finish-date-filter',
        label: 'Bitiş',
        colSize: 2
    });
}

async function loadUsers() {
    try {
        users = await fetchUsers('machining');
        
        // Update user filter options if filters component is initialized
        if (timerFilters) {
            const userOptions = [
                { value: '', label: 'Tüm Kullanıcılar' },
                ...users.map(user => ({ value: user.username, label: user.username }))
            ];
            timerFilters.updateFilterOptions('user-filter', userOptions);
        }
    } catch (error) {
        console.error('Error loading users:', error);
        users = [];
    }
}

function setDefaultDateFilters() {
    const today = new Date();
    const yesterday = new Date(Date.now() - 86400000);
    
    if (timerFilters) {
        timerFilters.setFilterValues({
            'start-date-filter': yesterday.toISOString().slice(0, 10),
            'finish-date-filter': today.toISOString().slice(0, 10)
        });
    }
}



function initializeSortableHeaders() {
    document.querySelectorAll('.sortable').forEach(header => {
        header.addEventListener('click', () => {
            const field = header.getAttribute('data-field');
            handleColumnSort(field);
        });
    });
    
    // Set initial sort state for finish_time (default sorting)
    updateSortIcons();
}

function updateSortIcons() {
    document.querySelectorAll('.sortable').forEach(header => {
        const icon = header.querySelector('.sort-icon');
        const headerField = header.getAttribute('data-field');
        
        if (headerField === currentSortField) {
            icon.className = `fas fa-sort-${currentSortDirection === 'asc' ? 'up' : 'down'} sort-icon`;
        } else {
            icon.className = 'fas fa-sort sort-icon';
        }
    });
}

function handleColumnSort(field) {
    if (currentSortField === field) {
        currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortField = field;
        currentSortDirection = 'asc';
    }
    
    // Update sort icons
    updateSortIcons();
    
    loadTimers();
}

async function loadTimers(page = 1) {
    try {
        showLoadingState();
        currentPage = page;
        
        const query = buildTimerQuery(page);
        const response = await authedFetch(`${backendBase}/machining/timers/?${query}`);
        
        if (!response.ok) {
            throw new Error('Zamanlayıcılar yüklenemedi');
        }
        
        const data = await response.json();
        timers = data.results || [];
        totalTimers = data.count || 0;
        
        updateTable();
        updateStatistics();
        
    } catch (error) {
        console.error('Error loading timers:', error);
        showNotification('Zamanlayıcılar yüklenirken hata oluştu', 'error');
    } finally {
        hideLoadingState();
    }
}

// Update table with new data
function updateTable() {
    if (timersTable) {
        timersTable.updateData(timers, totalTimers, currentPage);
        timersTable.setLoading(false);
        
        // Add event listeners for task info links and comment buttons
        addTableEventListeners();
    }
}

// Add event listeners for table-specific elements
function addTableEventListeners() {
    // Task info links
    document.querySelectorAll('.task-info-link').forEach(link => {
        link.addEventListener('click', async (e) => {
            e.preventDefault();
            const timerData = JSON.parse(link.getAttribute('data-task'));
            
            if (!timerData.issue_is_hold_task) {
                const taskDetails = await fetchTaskById(timerData.issue_key);
                if (taskDetails) {
                    showTaskInfoModal(timerData, taskDetails);
                } else {
                    showTaskInfoModal(timerData);
                }
            } else {
                showTaskInfoModal(timerData);
            }
        });
    });
    
    // Comment buttons
    document.querySelectorAll('.comment-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const comment = btn.getAttribute('data-comment');
            showCommentPopup(comment, btn);
        });
    });
}

function buildTimerQuery(page = 1) {
    const params = new URLSearchParams();
    
    // Pagination
    params.append('page', page.toString());
    params.append('page_size', pageSize.toString());
    
    // Sorting
    params.append('ordering', currentSortDirection === 'desc' ? `-${currentSortField}` : currentSortField);
    
    // Filters
    params.append('is_active', 'false'); // Only finished timers
    
    // Get filter values from the filters component
    const filterValues = timerFilters ? timerFilters.getFilterValues() : {};
    
    const userFilter = filterValues['user-filter'];
    if (userFilter) {
        params.append('user', userFilter);
    }
    
    const issueKeyFilter = filterValues['issue-key-filter'];
    if (issueKeyFilter) {
        params.append('issue_key', issueKeyFilter);
    }
    
    const jobNoFilter = filterValues['job-no-filter'];
    if (jobNoFilter) {
        params.append('job_no', jobNoFilter);
    }
    
    const machineFilter = filterValues['machine-filter'];
    if (machineFilter) {
        params.append('machine_fk', machineFilter);
    }
    
    const startDateFilter = filterValues['start-date-filter'];
    if (startDateFilter) {
        // Convert to Unix timestamp for start of day (00:00:00)
        const startDate = new Date(`${startDateFilter}T00:00:00`);
        params.append('start_after', startDate.getTime().toString());
    }
    
    const finishDateFilter = filterValues['finish-date-filter'];
    if (finishDateFilter) {
        // Convert to Unix timestamp for end of day (23:59:59)
        const finishDate = new Date(`${finishDateFilter}T23:59:59`);
        params.append('start_before', finishDate.getTime().toString());
    }
    
    return params.toString();
}


function calculateDuration(startTime, finishTime) {
    if (!startTime || !finishTime) return '-';
    
    const duration = (finishTime - startTime) / 3600000; // Convert to hours
    return duration.toFixed(2);
}

function formatDateTime(timestamp) {
    if (!timestamp) return '-';
    
    const date = new Date(timestamp);
    return date.toLocaleString('tr-TR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}


function updateStatistics() {
    // Calculate statistics from current data
    const totalHours = timers.reduce((sum, timer) => {
        if (timer.start_time && timer.finish_time) {
            return sum + ((timer.finish_time - timer.start_time) / 3600000);
        }
        return sum;
    }, 0);
    
    const uniqueUsers = new Set(timers.map(timer => timer.username).filter(Boolean));
    const uniqueMachines = new Set(timers.map(timer => timer.machine_name).filter(Boolean));
    
    // Update statistics cards using the component
    if (finishedTimersStats) {
        finishedTimersStats.updateValues({
            0: timers.length.toString(),
            1: totalHours.toFixed(2),
            2: uniqueUsers.size.toString(),
            3: uniqueMachines.size.toString()
        });
    }
}



function setupEventListeners() {
    // Event listeners are now handled by the TableComponent
    // Task info links and comment buttons are handled in the table render functions
}



async function deleteTimer(timerId) {
    try {
        const response = await authedFetch(`${backendBase}/machining/timers/${timerId}/`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error('Zamanlayıcı silinemedi');
        }
        
        showNotification('Zamanlayıcı başarıyla silindi', 'success');
        loadTimers(currentPage);
    } catch (error) {
        console.error('Error deleting timer:', error);
        showNotification('Zamanlayıcı silinirken hata oluştu', 'error');
    }
}

function showEditTimerModal(timer) {
    if (!editTimerModal) {
        console.error('Edit modal not initialized');
        return;
    }
    
    // Store the timer ID, start time, and machine ID for saving
    editTimerModal.timerId = timer.id;
    editTimerModal.startTime = timer.start_time;
    editTimerModal.machineId = timer.machine_fk;
    
    // Calculate duration from start and finish times
    let calculatedDuration = '-';
    if (timer.start_time && timer.finish_time) {
        const start = new Date(timer.start_time);
        const end = new Date(timer.finish_time);
        const diffMs = end - start;
        const diffSeconds = Math.floor(diffMs / 1000);
        calculatedDuration = formatDuration(diffSeconds);
    }
    
    // Populate modal fields with timer data
    const formData = {
        job_no: timer.job_no || '',
        image_no: timer.image_no || '',
        position_no: timer.position_no || '',
        quantity: timer.quantity || '',
        username: timer.username || '',
        start_time: timer.start_time ? formatDateTime(timer.start_time) : '-',
        calculated_duration: calculatedDuration,
        comment: timer.comment || '',
        manual_entry: !!timer.manual_entry
    };
    
    // Set machine value (display machine name, not ID)
    formData.machine = timer.machine_name || '';
    
    // Set finish time
    formData.finish_time = timer.finish_time ? 
        toLocalDatetimeInput(timer.finish_time) : '';
    
    // Set form data
    editTimerModal.setFormData(formData);
    
    // Add event listener for finish time changes to update calculated duration
    setTimeout(() => {
        const finishTimeInput = editTimerModal.container.querySelector('input[name="finish_time"]');
        if (finishTimeInput) {
            finishTimeInput.addEventListener('change', updateCalculatedDuration);
        }
    }, 100);
    
    // Show modal
    editTimerModal.show();
}

// Function to update calculated duration when finish time changes
function updateCalculatedDuration() {
    if (!editTimerModal || !editTimerModal.startTime) {
        return;
    }
    
    const finishTimeInput = editTimerModal.container.querySelector('input[name="finish_time"]');
    const durationField = editTimerModal.container.querySelector('input[name="calculated_duration"]');
    
    if (!finishTimeInput || !durationField) {
        return;
    }
    
    const finishTimeValue = finishTimeInput.value;
    if (!finishTimeValue) {
        durationField.value = '-';
        return;
    }
    
    try {
        const start = new Date(editTimerModal.startTime);
        const end = new Date(finishTimeValue);
        const diffMs = end - start;
        const diffSeconds = Math.floor(diffMs / 1000);
        durationField.value = formatDuration(diffSeconds);
    } catch (error) {
        console.error('Error calculating duration:', error);
        durationField.value = '-';
    }
}

// Format duration from seconds to human readable format
function formatDuration(seconds) {
    if (!seconds || seconds === 0) {
        return '0m';
    }
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}


async function saveEditTimer(formData) {
    if (!editTimerModal || !editTimerModal.timerId) {
        console.error('No timer ID available for saving');
        return;
    }
    
    const timerId = editTimerModal.timerId;
    const patch = {
        job_no: formData.job_no,
        image_no: formData.image_no,
        position_no: formData.position_no,
        quantity: parseInt(formData.quantity) || null,
        comment: formData.comment,
        manual_entry: formData.manual_entry,
        machine_fk: editTimerModal.machineId,
        finish_time: formData.finish_time ? 
            new Date(formData.finish_time).getTime() : null,
    };
    
    try {
        const response = await authedFetch(`${backendBase}/machining/timers/${timerId}/`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch)
        });
        
        if (!response.ok) {
            throw new Error('Zamanlayıcı güncellenemedi');
        }
        
        editTimerModal.hide();
        showNotification('Zamanlayıcı başarıyla güncellendi', 'success');
        loadTimers(currentPage);
    } catch (error) {
        console.error('Error updating timer:', error);
        showNotification('Zamanlayıcı güncellenirken hata oluştu', 'error');
    }
}

function toLocalDatetimeInput(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const pad = n => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function showTaskInfoModal(timerData, taskDetails = null) {
    const displayData = taskDetails || timerData;
    const isHoldTask = timerData.issue_is_hold_task;
    
    const modalContent = `
        ${displayData.completion_date ? `
        <div class="alert alert-success mb-3">
            <strong>✅ Bu görev tamamlanmıştır</strong>
        </div>
        ` : ''}
        <div class="row">
            <div class="col-md-12">
                <strong>Görev Adı:</strong><br>
                <span>${isHoldTask ? (timerData.issue_name || displayData.name) : (displayData.name || 'Belirtilmemiş')}</span>
            </div>
        </div>
        <hr>
        ${isHoldTask ? `
        <div class="row">
            <div class="col-md-6">
                <strong>İş No:</strong><br>
                <span>${displayData.job_no || 'Belirtilmemiş'}</span>
            </div>
            <div class="col-md-6">
                <strong>Makine:</strong><br>
                <span>${displayData.machine_name || 'Belirtilmemiş'}</span>
            </div>
        </div>
        ${timerData.comment ? `
        <hr>
        <div class="row">
            <div class="col-md-12">
                <strong>Yorum:</strong><br>
                <span>${timerData.comment}</span>
            </div>
        </div>
        ` : ''}
        ` : `
        <div class="row">
            <div class="col-md-6">
                <strong>İş No:</strong><br>
                <span>${displayData.job_no || 'Belirtilmemiş'}</span>
            </div>
            <div class="col-md-6">
                <strong>Resim No:</strong><br>
                <span>${displayData.image_no || 'Belirtilmemiş'}</span>
            </div>
        </div>
        <hr>
        <div class="row">
            <div class="col-md-6">
                <strong>Pozisyon No:</strong><br>
                <span>${displayData.position_no || 'Belirtilmemiş'}</span>
            </div>
            <div class="col-md-6">
                <strong>Adet:</strong><br>
                <span>${displayData.quantity || 'Belirtilmemiş'}</span>
            </div>
        </div>
        <hr>
        <div class="row">
            <div class="col-md-6">
                <strong>Makine:</strong><br>
                <span>${displayData.machine_name || 'Belirtilmemiş'}</span>
            </div>
            <div class="col-md-6">
                <strong>Tahmini Süre:</strong><br>
                <span>${displayData.estimated_hours ? displayData.estimated_hours + ' saat' : 'Belirtilmemiş'}</span>
            </div>
        </div>
        `}
                 ${displayData.total_hours_spent ? `
         <hr>
         <div class="row">
             <div class="col-md-6">
                 <strong>Toplam Harcanan Süre:</strong><br>
                 <span>${displayData.total_hours_spent} saat</span>
             </div>
             <div class="col-md-6">
                 <strong>Bitmesi Gereken Tarih:</strong><br>
                 <span>${displayData.finish_time ? formatDateTime(displayData.finish_time) : 'Belirtilmemiş'}</span>
             </div>
         </div>
         ` : ''}
         ${displayData.completion_date ? `
         <hr>
         <div class="row">
             <div class="col-md-6">
                 <strong>Tamamlanma Tarihi:</strong><br>
                 <span>${displayData.completion_date ? formatDateTime(displayData.completion_date) : 'Belirtilmemiş'}</span>
             </div>
             <div class="col-md-6">
                 <strong>Tamamlayan:</strong><br>
                 <span>${displayData.completed_by_username || displayData.completed_by || 'Belirtilmemiş'}</span>
             </div>
         </div>
         ` : ''}
        ${isHoldTask ? `
        <hr>
        <div class="alert alert-warning">
            <strong>⚠️ Bu görev özel görevler kategorisindedir.</strong>
        </div>
        ` : ''}
    `;
    
    document.getElementById('task-info-content').innerHTML = modalContent;
    
    const modal = new bootstrap.Modal(document.getElementById('task-info-modal'));
    modal.show();
}

function showCommentPopup(comment, buttonElement) {
    // Remove any existing popup
    const existingPopup = document.querySelector('.comment-popup');
    if (existingPopup) {
        existingPopup.remove();
    }
    
    // Create popup element
    const popup = document.createElement('div');
    popup.className = 'comment-popup';
    popup.style.cssText = `
        position: absolute;
        background: white;
        border: 1px solid #ddd;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        padding: 12px;
        max-width: 300px;
        z-index: 9999;
        font-size: 14px;
        line-height: 1.4;
        word-wrap: break-word;
    `;
    
    // Add close button
    popup.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
            <strong style="color: #495057;">Yorum</strong>
            <button type="button" class="btn-close btn-close-sm" style="font-size: 10px;" onclick="this.parentElement.parentElement.remove()"></button>
        </div>
        <div style="color: #6c757d; white-space: pre-wrap;">${comment}</div>
    `;
    
    // Position the popup relative to the button
    const buttonRect = buttonElement.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    
    // Position above the button if there's not enough space below
    const spaceBelow = window.innerHeight - buttonRect.bottom;
    const spaceAbove = buttonRect.top;
    
    if (spaceBelow < 150 && spaceAbove > 150) {
        // Position above
        popup.style.top = `${buttonRect.top + scrollTop - 10}px`;
        popup.style.transform = 'translateY(-100%)';
    } else {
        // Position below
        popup.style.top = `${buttonRect.bottom + scrollTop + 5}px`;
    }
    
    // Center horizontally
    popup.style.left = `${buttonRect.left + scrollLeft + (buttonRect.width / 2)}px`;
    popup.style.transform += ' translateX(-50%)';
    
    // Add to document
    document.body.appendChild(popup);
    
    // Close popup when clicking outside
    const closePopup = (e) => {
        if (!popup.contains(e.target) && !buttonElement.contains(e.target)) {
            popup.remove();
            document.removeEventListener('click', closePopup);
        }
    };
    
    // Add event listener with a small delay to avoid immediate closure
    setTimeout(() => {
        document.addEventListener('click', closePopup);
    }, 100);
}

function exportTimers() {
    try {
        const query = buildTimerQuery(1);
        const exportUrl = `${backendBase}/machining/timers/export/?${query}`;
        
        // Create a temporary link to trigger download
        const link = document.createElement('a');
        link.href = exportUrl;
        link.download = `biten-zamanlayicilar-${new Date().toISOString().slice(0, 10)}.xlsx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showNotification('Rapor başarıyla indiriliyor', 'success');
    } catch (error) {
        console.error('Error exporting timers:', error);
        showNotification('Rapor indirilirken hata oluştu', 'error');
    }
}

function showLoadingState() {
    if (timersTable) {
        timersTable.setLoading(true);
    }
}

function hideLoadingState() {
    if (timersTable) {
        timersTable.setLoading(false);
    }
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
    
    document.body.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 5000);
}

// Check for edit parameter in URL and open modal if found
function checkForEditParameter() {
    const urlParams = new URLSearchParams(window.location.search);
    const editTimerId = urlParams.get('edit');
    
    if (editTimerId) {
        // Find the timer in the current data
        const timer = timers.find(t => t.id == editTimerId);
        if (timer) {
            // Open the edit modal
            showEditTimerModal(timer);
        } else {
            // Timer not found in current page, try to load it
            loadTimerById(editTimerId);
        }
    }
}

// Load a specific timer by ID
async function loadTimerById(timerId) {
    try {
        const response = await authedFetch(`${backendBase}/machining/timers/${timerId}/`);
        if (response.ok) {
            const timer = await response.json();
            showEditTimerModal(timer);
        } else {
            showNotification('Zamanlayıcı bulunamadı', 'error');
        }
    } catch (error) {
        console.error('Error loading timer:', error);
        showNotification('Zamanlayıcı yüklenirken hata oluştu', 'error');
    }
}

// Global function for pagination
window.changePage = function(page) {
    if (page >= 1) {
        loadTimers(page);
    }
}; 