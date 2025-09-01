import { initNavbar } from '../../../../components/navbar.js';
import { ModernDropdown } from '../../../../components/dropdown.js';
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
    
    await initializeFinishedTimers();
    setupEventListeners();
});

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
        machines = await fetchMachines({ used_in: 'machining' });
        
        // Update machine filter options if filters component is initialized
        if (timerFilters) {
            const machineOptions = [
                { value: '', label: 'Tüm Makineler' },
                ...machines.map(machine => ({ value: machine.id.toString(), label: machine.name }))
            ];
            timerFilters.updateFilterOptions('machine-filter', machineOptions);
        }
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
        
        renderTimersTable();
        renderPagination();
        updateStatistics();
        
    } catch (error) {
        console.error('Error loading timers:', error);
        showNotification('Zamanlayıcılar yüklenirken hata oluştu', 'error');
    } finally {
        hideLoadingState();
    }
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

function renderTimersTable() {
    const tbody = document.getElementById('timers-table-body');
    
    if (timers.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="13" class="text-center text-muted py-4">
                    <i class="fas fa-inbox fa-2x mb-2"></i><br>
                    Zamanlayıcı bulunamadı
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = timers.map(timer => `
        <tr>
            <td>
                <span class="user-name">${timer.username || '-'}</span>
            </td>
            <td>
                <a href="#" class="timer-issue-key task-info-link" data-task='${JSON.stringify(timer)}'>
                    ${timer.issue_key || '-'}
                </a>
            </td>
            <td>${timer.job_no || '-'}</td>
            <td>${timer.image_no || '-'}</td>
            <td>${timer.position_no || '-'}</td>
            <td>${timer.quantity || '-'}</td>
            <td>
                <span class="machine-name">${timer.machine_name || '-'}</span>
            </td>
            <td>${formatDateTime(timer.start_time)}</td>
            <td>${formatDateTime(timer.finish_time)}</td>
            <td>
                <span class="duration-badge">
                    ${calculateDuration(timer.start_time, timer.finish_time)}
                </span>
            </td>
            <td>
                ${timer.comment ? 
                    `<button class="btn btn-sm btn-outline-info comment-btn" data-comment="${timer.comment}" title="Yorumu görüntüle">
                        <i class="fas fa-comment me-1"></i>Yorum
                    </button>` : 
                    '<span class="text-muted">-</span>'
                }
            </td>
            <td>
                ${timer.manual_entry ? 
                    '<span class="manual-entry-badge">Manuel</span>' : 
                    '<span class="text-muted">-</span>'
                }
            </td>
            <td>
                <div class="btn-group btn-group-sm">
                    <button class="btn btn-outline-primary btn-action edit-timer-btn" 
                            data-timer-id="${timer.id}" title="Düzenle">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-outline-danger btn-action delete-timer-btn" 
                            data-timer-id="${timer.id}" title="Sil">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
    
    // Add event listeners for task info links
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
    
    // Add event listeners for comment buttons
    document.querySelectorAll('.comment-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const comment = btn.getAttribute('data-comment');
            showCommentPopup(comment, btn);
        });
    });
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

function renderPagination() {
    const pagination = document.getElementById('pagination');
    if (!pagination) return;
    
    const totalPages = Math.ceil(totalTimers / 20);
    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }
    
    let html = '';
    
    // Previous button
    html += `
        <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="changePage(${currentPage - 1})">
                <i class="fas fa-chevron-left"></i>
            </a>
        </li>
    `;
    
    // Page numbers
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, currentPage + 2);
    
    for (let i = startPage; i <= endPage; i++) {
        html += `
            <li class="page-item ${i === currentPage ? 'active' : ''}">
                <a class="page-link" href="#" onclick="changePage(${i})">${i}</a>
            </li>
        `;
    }
    
    // Next button
    html += `
        <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="changePage(${currentPage + 1})">
                <i class="fas fa-chevron-right"></i>
            </a>
        </li>
    `;
    
    pagination.innerHTML = html;
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
    // Pagination
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('page-link')) {
            e.preventDefault();
            const page = parseInt(e.target.getAttribute('data-page'));
            if (page && page > 0) {
                loadTimers(page);
            }
        }
    });
    
    // Edit and delete buttons
    document.addEventListener('click', (e) => {
        if (e.target.closest('.edit-timer-btn')) {
            const timerId = e.target.closest('.edit-timer-btn').getAttribute('data-timer-id');
            const timer = timers.find(t => t.id == timerId);
            if (timer) {
                showEditTimerModal(timer);
            }
        }
        
        if (e.target.closest('.delete-timer-btn')) {
            const timerId = e.target.closest('.delete-timer-btn').getAttribute('data-timer-id');
            if (confirm('Bu zamanlayıcıyı silmek istediğinizden emin misiniz?')) {
                deleteTimer(timerId);
            }
        }
    });
    
    // Save edit button
    document.getElementById('save-edit-timer-btn').addEventListener('click', saveEditTimer);
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
    // Populate modal fields
    document.getElementById('edit-timer-id').value = timer.id;
    document.getElementById('edit-job_no').value = timer.job_no || '';
    document.getElementById('edit-image_no').value = timer.image_no || '';
    document.getElementById('edit-position_no').value = timer.position_no || '';
    document.getElementById('edit-quantity').value = timer.quantity || '';
    document.getElementById('edit-comment').value = timer.comment || '';
    document.getElementById('edit-manual_entry').checked = !!timer.manual_entry;
    
    // Populate machine dropdown
    const machineSelect = document.getElementById('edit-machine');
    machineSelect.innerHTML = '<option>Yükleniyor...</option>';
    
    const machineOptions = machines.map(machine =>
        `<option value="${machine.id}"${machine.id == timer.machine_fk ? ' selected' : ''}>${machine.name || ''}</option>`
    ).join('');
    
    machineSelect.innerHTML = machineOptions;
    
    // Set finish time
    document.getElementById('edit-finish_time').value = timer.finish_time ? 
        toLocalDatetimeInput(timer.finish_time) : '';
    
    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('edit-timer-modal'));
    modal.show();
}

async function saveEditTimer() {
    const timerId = document.getElementById('edit-timer-id').value;
    const patch = {
        job_no: document.getElementById('edit-job_no').value,
        image_no: document.getElementById('edit-image_no').value,
        position_no: document.getElementById('edit-position_no').value,
        quantity: parseInt(document.getElementById('edit-quantity').value) || null,
        comment: document.getElementById('edit-comment').value,
        manual_entry: document.getElementById('edit-manual_entry').checked,
        machine_fk: document.getElementById('edit-machine').value,
        finish_time: document.getElementById('edit-finish_time').value ? 
            new Date(document.getElementById('edit-finish_time').value).getTime() : null,
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
        
        bootstrap.Modal.getInstance(document.getElementById('edit-timer-modal')).hide();
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
    const tbody = document.getElementById('timers-table-body');
    tbody.innerHTML = `
        <tr>
            <td colspan="13" class="text-center py-4">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Yükleniyor...</span>
                </div>
                <div class="mt-2">Zamanlayıcılar yükleniyor...</div>
            </td>
        </tr>
    `;
}

function hideLoadingState() {
    // Loading state is handled in renderTimersTable
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

// Global function for pagination
window.changePage = function(page) {
    if (page >= 1) {
        loadTimers(page);
    }
}; 