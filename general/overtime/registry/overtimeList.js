import { initNavbar } from '../../../components/navbar.js';
import { 
    fetchOvertimeRequests,
    fetchOvertimeRequest,
    createOvertimeRequest,
    cancelOvertimeRequest,
    formatOvertimeDuration,
    canCancelOvertime,
    validateOvertimeRequest
} from '../../../apis/overtime.js';
import { fetchTeams, authFetchUsers } from '../../../apis/users.js';
import { getAllowedTeams } from '../../../apis/teams.js';
import { formatDateTime } from '../../../apis/formatters.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { StatisticsCards } from '../../../components/statistics-cards/statistics-cards.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
import { TableComponent } from '../../../components/table/table.js';
import { ModernDropdown } from '../../../components/dropdown/dropdown.js';
import { DisplayModal } from '../../../components/display-modal/display-modal.js';
import { EditModal } from '../../../components/edit-modal/edit-modal.js';
import { getJobOrderDropdown } from '../../../apis/projects/jobOrders.js';
import { 
    initializeModalComponents, 
    showOvertimeDetailsModal, 
    setupModalEventListeners,
    setGlobalVariables 
} from '../pending/modals.js';

// Global variables
let currentOvertimeRequests = [];
let currentFilters = {};
let currentPage = 1;
let itemsPerPage = 20;
let selectedOvertimeRequest = null;
let currentUser = null;
let allUsers = [];
let allTeams = [];
let overtimeTable = null; // TableComponent instance
let userDropdowns = new Map(); // Store dropdown references
let jobOrderDropdowns = new Map(); // Store job order dropdown references
let jobOrderDropdownOptions = []; // Array of { job_no, title }
let cancelOvertimeModal = null; // DisplayModal instance for cancel
let createOvertimeModal = null; // EditModal instance for create

// Initialize the page
document.addEventListener('DOMContentLoaded', function() {
    initNavbar();
    
    // Get current user info from localStorage or session
    const userData = localStorage.getItem('user');
    if (userData) {
        currentUser = JSON.parse(userData);
    }
    
    // Initialize header component
    new HeaderComponent({
        title: 'Mesai Talepleri',
        subtitle: 'Mesai talepleri takibi ve yönetimi',
        icon: 'clock',
        showBackButton: 'block',
        showCreateButton: 'block',
        showExportButton: 'none',
        showRefreshButton: 'none',
        createButtonText: 'Yeni Mesai Talebi',
        onBackClick: () => window.location.href = '/general/overtime',
        onCreateClick: showCreateOvertimeModal
    });
    
    // Check for request ID in URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const requestId = urlParams.get('request');
    
    if (requestId) {
        // Store the request ID to show modal after data loads
        window.pendingRequestId = requestId;
    }
    
    // Initialize modal components
    initializeModalComponents();
    setupModalEventListeners();
    
    // Set global variables for modals
    setGlobalVariables({
        currentRequest: null,
        requests: currentOvertimeRequests,
        loadRequests: loadOvertimeRequests,
        loadApprovedRequests: () => {}, // Not needed for registry
    });
    
    // Initialize cancel overtime modal
    initializeCancelModal();
    
    // Initialize create overtime modal
    initializeCreateModal();
    
    // Initialize statistics cards component
    window.overtimeStats = new StatisticsCards('overtime-statistics', {
        cards: [
            {
                title: 'Toplam Talep',
                value: '0',
                icon: 'fas fa-clock',
                color: 'primary',
                trend: null
            },
            {
                title: 'Bekleyen Talepler',
                value: '0',
                icon: 'fas fa-hourglass-half',
                color: 'warning',
                trend: null
            },
            {
                title: 'Onaylanan',
                value: '0',
                icon: 'fas fa-check-circle',
                color: 'success',
                trend: null
            },
            {
                title: 'Toplam Mesai Saati',
                value: '0 saat',
                icon: 'fas fa-business-time',
                color: 'info',
                trend: null
            }
        ]
    });
    
    // Initialize filters component
    new FiltersComponent('filters-placeholder', {
        title: 'Filtreler',
        onApply: (filters) => {
            currentFilters = filters;
            currentPage = 1;
            loadOvertimeRequests();
        },
        onClear: () => {
            currentFilters = {};
            currentPage = 1;
            loadOvertimeRequests();
        }
    }).addSelectFilter({
        id: 'status-filter',
        label: 'Durum',
        options: [
            { value: '', label: 'Tümü' },
            { value: 'submitted', label: 'Bekliyor' },
            { value: 'approved', label: 'Onaylandı' },
            { value: 'cancelled', label: 'İptal Edildi' }
        ],
        colSize: 2
    }).addSelectFilter({
        id: 'team-filter',
        label: 'Takım',
        options: [
            { value: '', label: 'Tümü' }
            // Teams will be loaded dynamically
        ],
        colSize: 2
    }).addDateFilter({
        id: 'start-date-filter',
        label: 'Başlangıç Tarihi',
        colSize: 2
    }).addDateFilter({
        id: 'end-date-filter',
        label: 'Bitiş Tarihi',
        colSize: 2
    }).addTextFilter({
        id: 'search-filter',
        label: 'Arama',
        placeholder: 'Neden, iş no, açıklama...',
        colSize: 2
    });
    
    // Initialize table component
    initializeTableComponent();
    
    // Load initial data
    loadInitialData();
    
    // Add event listeners
    addEventListeners();
});

// Initialize TableComponent
function initializeTableComponent() {
    overtimeTable = new TableComponent('overtime-table-container', {
        title: 'Mesai Talepleri',
        columns: [
            {
                field: 'id',
                label: 'Talep No',
                sortable: true,
                formatter: (value) => `<span style="font-weight: 700; color: #0d6efd; font-family: 'Courier New', monospace; font-size: 1rem; background: rgba(13, 110, 253, 0.1); padding: 0.25rem 0.5rem; border-radius: 4px; border: 1px solid rgba(13, 110, 253, 0.2);">${value || '-'}</span>`
            },
            {
                field: 'requester_username',
                label: 'Talep Eden',
                sortable: true,
                formatter: (value, row) => {
                    if (typeof value === 'undefined' || value === null) {
                        return 'Bilinmiyor';
                    }
                    // For export, return clean text; for display, return HTML
                    if (window.isExporting) {
                        return value;
                    }
                    return `
                        <div style="font-weight: 500; color: #495057;">
                            <i class="fas fa-user-circle me-2 text-muted"></i>
                            ${value}
                        </div>
                    `;
                }
            },
            {
                field: 'team_label',
                label: 'Departman',
                sortable: true,
                formatter: (value, row) => {
                    // For export, return clean text; for display, return HTML
                    if (window.isExporting) {
                        return value || '-';
                    }
                    return `
                        <div style="color: #495057; font-weight: 500;">${value || '-'}</div>
                    `;
                }
            },
            {
                field: 'start_at',
                label: 'Başlangıç',
                sortable: true,
                type: 'date'
            },
            {
                field: 'end_at',
                label: 'Bitiş',
                sortable: true,
                type: 'date'
            },
            {
                field: 'duration_hours',
                label: 'Süre',
                sortable: true,
                formatter: (value, row) => {
                    // For export, return clean text; for display, return HTML
                    if (window.isExporting) {
                        return formatOvertimeDuration(value);
                    }
                    return `
                        <div style="color: #495057; font-weight: 500;">${formatOvertimeDuration(value)}</div>
                    `;
                }
            },
            {
                field: 'total_users',
                label: 'Katılımcı',
                sortable: true,
                formatter: (value) => `
                    <div style="color: #495057; font-weight: 500;">${value || 0} kişi</div>
                `
            },
            {
                field: 'approval',
                label: 'Onay Durumu',
                sortable: false,
                formatter: (value, row) => getApprovalInfo(row)
            },
            {
                field: 'status',
                label: 'Durum',
                sortable: true,
                formatter: (value, row) => {
                    // For export, return clean text; for display, return HTML
                    if (window.isExporting) {
                        return row.status_label || value || '-';
                    }
                    return renderStatusBadge(value, row.status_label);
                }
            },
            {
                field: 'created_at',
                label: 'Oluşturulma',
                sortable: true,
                type: 'date'
            }
        ],
        data: [],
        sortable: true,
        pagination: true,
        serverSidePagination: true,
        itemsPerPage: 20,
        currentPage: 1,
        totalItems: 0,
        refreshable: true,
        exportable: true,
        onRefresh: async () => {
            currentPage = 1;
            await loadOvertimeRequests();
        },
        onSort: async (field, direction) => {
            currentPage = 1;
            await loadOvertimeRequests();
        },
        onPageChange: async (page) => {
            currentPage = page;
            await loadOvertimeRequests();
        },
        onPageSizeChange: async (newPageSize) => {
            // Update local variable to keep in sync
            itemsPerPage = newPageSize;
            // Ensure table component also has the correct value (should already be set, but ensure sync)
            if (overtimeTable) {
                overtimeTable.options.itemsPerPage = newPageSize;
            }
            // Reset to page 1 and load with new page size
            currentPage = 1;
            await loadOvertimeRequests();
        },
        actions: [
            {
                key: 'view',
                label: 'Detayları Görüntüle',
                icon: 'fas fa-eye',
                class: 'btn-outline-primary',
                onClick: (row) => {
                    viewOvertimeDetails(row.id);
                }
            },
            {
                key: 'cancel',
                label: 'İptal Et',
                icon: 'fas fa-ban',
                class: 'btn-outline-danger',
                visible: (row) => canCancelOvertime(row, currentUser?.id),
                onClick: (row) => {
                    showCancelOvertimeModal(row.id);
                }
            }
        ],
        emptyMessage: 'Henüz mesai talebi bulunmamaktadır',
        emptyIcon: 'fas fa-inbox',
        skeleton: true
    });
}

// Load initial data
async function loadInitialData() {
    try {
        // Load teams only
        const teams = await fetchTeams();
        allTeams = teams;
        
        // Update team filter options
        updateTeamFilterOptions();
        
        // Load overtime requests
        await loadOvertimeRequests();
        
    } catch (error) {
        showErrorMessage('Veriler yüklenirken hata oluştu.');
    }
}

// Update team filter options
function updateTeamFilterOptions() {
    const teamOptions = [
        { value: '', label: 'Tümü' },
        ...allTeams.map(team => ({
            value: team.value || team.code,
            label: team.label || team.name
        }))
    ];
    
    // Find filters component and update team options
    const filtersContainer = document.getElementById('filters-placeholder');
    if (filtersContainer) {
        // This would need to be implemented in the FiltersComponent
        // For now, we'll handle it when creating the filter
    }
}

// Add event listeners
function addEventListeners() {
    
    
    
    // Modal close handling is now managed by the DisplayModal component
}

// Initialize cancel overtime modal
function initializeCancelModal() {
    cancelOvertimeModal = new DisplayModal('cancel-overtime-modal-container', {
        title: 'Mesai Talebini İptal Et',
        icon: 'fas fa-ban',
        size: 'md',
        showEditButton: false
    });
    
    // Set up modal close callback
    cancelOvertimeModal.onCloseCallback(() => {
        window.pendingCancelRequestId = null;
    });
}

// Show cancel overtime modal using DisplayModal
function showCancelOvertimeModal(requestId) {
    const request = currentOvertimeRequests.find(r => r.id === requestId) || selectedOvertimeRequest;
    if (!request) return;
    
    window.pendingCancelRequestId = requestId;
    
    // Clear previous data
    cancelOvertimeModal.clearData();
    
    // Add warning section
    cancelOvertimeModal.addSection({
        title: 'İptal Onayı',
        icon: 'fas fa-exclamation-triangle',
        iconColor: 'text-warning'
    });
    
    // Add warning message
    cancelOvertimeModal.addField({
        id: 'cancel-warning',
        name: 'warning',
        label: 'Uyarı',
        type: 'text',
        value: 'Bu mesai talebini iptal etmek istediğinizden emin misiniz? Bu işlem geri alınamaz.',
        icon: 'fas fa-exclamation-triangle',
        colSize: 12
    });
    
    // Add request details section
    cancelOvertimeModal.addSection({
        title: 'Talep Detayları',
        icon: 'fas fa-info-circle',
        iconColor: 'text-info'
    });
    
    cancelOvertimeModal.addField({
        id: 'cancel-request-id',
        name: 'request_id',
        label: 'Talep No',
        type: 'text',
        value: `#${request.id}`,
        icon: 'fas fa-hashtag',
        colSize: 6,
        layout: 'horizontal'
    });
    
    cancelOvertimeModal.addField({
        id: 'cancel-start-time',
        name: 'start_time',
        label: 'Başlangıç',
        type: 'text',
        value: formatDateTime(request.start_at),
        icon: 'fas fa-play',
        colSize: 6,
        layout: 'horizontal'
    });
    
    cancelOvertimeModal.addField({
        id: 'cancel-end-time',
        name: 'end_time',
        label: 'Bitiş',
        type: 'text',
        value: formatDateTime(request.end_at),
        icon: 'fas fa-stop',
        colSize: 6,
        layout: 'horizontal'
    });
    
    cancelOvertimeModal.addField({
        id: 'cancel-duration',
        name: 'duration',
        label: 'Süre',
        type: 'text',
        value: formatOvertimeDuration(parseFloat(request.duration_hours)),
        icon: 'fas fa-hourglass-half',
        colSize: 6,
        layout: 'horizontal'
    });
    
    // Render modal
    cancelOvertimeModal.render();
    
    // Add custom footer with action buttons
    const modalFooter = cancelOvertimeModal.container.querySelector('.modal-footer');
    if (modalFooter) {
        modalFooter.innerHTML = `
            <div class="d-flex justify-content-end gap-2">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                    <i class="fas fa-times me-1"></i>Vazgeç
                </button>
                <button type="button" class="btn btn-danger" id="confirm-cancel-overtime-btn">
                    <i class="fas fa-ban me-1"></i>İptal Et
                </button>
            </div>
        `;
    }
    
    // Add event listener for confirm button
    const confirmBtn = cancelOvertimeModal.container.querySelector('#confirm-cancel-overtime-btn');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', confirmCancelOvertime);
    }
    
    cancelOvertimeModal.show();
}

// Initialize create overtime modal
function initializeCreateModal() {
    createOvertimeModal = new EditModal('create-overtime-modal-container', {
        title: 'Yeni Mesai Talebi',
        icon: 'fas fa-plus',
        size: 'lg',
        showEditButton: false
    });
    
    // Set up save callback
    createOvertimeModal.onSaveCallback(async (formData) => {
        await submitOvertimeRequest(formData);
    });
}

// Show create overtime modal using EditModal
async function showCreateOvertimeModal() {
    if (!createOvertimeModal) {
        return;
    }
    
    // Clear previous data
    createOvertimeModal.clearAll();
    
    // Clear dropdown references
    userDropdowns.clear();
    jobOrderDropdowns.clear();
    
    // Add basic information section
    createOvertimeModal.addSection({
        title: 'Temel Bilgiler',
        icon: 'fas fa-info-circle',
        iconColor: 'text-primary'
    });
    
    // Add reason field
    createOvertimeModal.addField({
        id: 'reason',
        name: 'reason',
        label: 'Mesai Nedeni',
        type: 'textarea',
        placeholder: 'Mesai talebinin nedenini açıklayın...',
        required: true,
        icon: 'fas fa-comment',
        colSize: 12,
        helpText: 'Mesai talebinin nedenini detaylı olarak açıklayın'
    });
    
    // Add date and time section
    createOvertimeModal.addSection({
        title: 'Tarih ve Saat',
        icon: 'fas fa-calendar',
        iconColor: 'text-info'
    });
    
    // Add start date field
    createOvertimeModal.addField({
        id: 'start_date',
        name: 'start_date',
        label: 'Başlangıç Tarihi',
        type: 'date',
        required: true,
        icon: 'fas fa-calendar-day',
        colSize: 6
    });
    
    // Add start time field
    createOvertimeModal.addField({
        id: 'start_time',
        name: 'start_time',
        label: 'Başlangıç Saati',
        type: 'time',
        required: true,
        icon: 'fas fa-clock',
        colSize: 6
    });
    
    // Add end date field
    createOvertimeModal.addField({
        id: 'end_date',
        name: 'end_date',
        label: 'Bitiş Tarihi',
        type: 'date',
        required: true,
        icon: 'fas fa-calendar-day',
        colSize: 6
    });
    
    // Add end time field
    createOvertimeModal.addField({
        id: 'end_time',
        name: 'end_time',
        label: 'Bitiş Saati',
        type: 'time',
        required: true,
        icon: 'fas fa-clock',
        colSize: 6
    });
    
    // Add participants section
    createOvertimeModal.addSection({
        title: 'Katılımcılar',
        icon: 'fas fa-users',
        iconColor: 'text-success'
    });
    
    // Render modal first
    createOvertimeModal.render();
    
    // Add participants table inside the Katılımcılar section
    const participantsHtml = `
        <div class="d-flex justify-content-between align-items-center mb-2">
            <h6 class="mb-0">Katılımcı Listesi</h6>
            <button type="button" class="btn btn-sm btn-outline-primary" id="add-participant-btn">
                <i class="fas fa-plus me-1"></i>Katılımcı Ekle
            </button>
        </div>
        <div id="participants-container">
            <!-- Participants will be added here -->
        </div>
    `;
    
    // Find the Katılımcılar section and add the participants table inside it
    const katilimcilarSection = createOvertimeModal.container.querySelector('[data-section-id*="section"]:last-of-type');
    if (katilimcilarSection) {
        const fieldsContainer = katilimcilarSection.querySelector('.row.g-2');
        if (fieldsContainer) {
            fieldsContainer.insertAdjacentHTML('beforeend', participantsHtml);
        }
    }
    
    // Add event listener for add participant button
    const addParticipantBtn = createOvertimeModal.container.querySelector('#add-participant-btn');
    if (addParticipantBtn) {
        addParticipantBtn.addEventListener('click', addParticipant);
    }
    
    // Load users and job orders for dropdowns
    try {
        await loadUsersForModal();
        await loadJobOrderDropdownOptions();
        // Add initial participant
        setTimeout(() => {
            addParticipant();
        }, 100);
    } catch (error) {
        showErrorMessage('Veriler yüklenirken hata oluştu.');
    }
    
    createOvertimeModal.show();
}



// Load overtime requests
async function loadOvertimeRequests() {
    try {
        if (overtimeTable) {
            overtimeTable.setLoading(true);
        }
        
        // Prepare filters for API call
        const apiFilters = {
            ...currentFilters,
            page: currentPage,
            // Get page size from table component if available, otherwise use local variable
            // This ensures we always use the most up-to-date page size
            page_size: overtimeTable ? overtimeTable.options.itemsPerPage : itemsPerPage
        };
        
        // Convert filter names to API format
        if (apiFilters['status-filter']) {
            apiFilters.status = apiFilters['status-filter'];
            delete apiFilters['status-filter'];
        }
        if (apiFilters['team-filter']) {
            apiFilters.team = apiFilters['team-filter'];
            delete apiFilters['team-filter'];
        }
        if (apiFilters['start-date-filter']) {
            apiFilters.start_date = apiFilters['start-date-filter'];
            delete apiFilters['start-date-filter'];
        }
        if (apiFilters['end-date-filter']) {
            apiFilters.end_date = apiFilters['end-date-filter'];
            delete apiFilters['end-date-filter'];
        }
        if (apiFilters['search-filter']) {
            apiFilters.search = apiFilters['search-filter'];
            delete apiFilters['search-filter'];
        }
        
        const data = await fetchOvertimeRequests(apiFilters);
        currentOvertimeRequests = data.results || data;
        const totalItems = data.count || data.total || currentOvertimeRequests.length;
        
        // Update table with new data
        if (overtimeTable) {
            overtimeTable.updateData(currentOvertimeRequests, totalItems, currentPage);
        }
        
        renderStatistics();
        
        // Check if there's a pending request ID to show modal
        if (window.pendingRequestId) {
            const requestId = parseInt(window.pendingRequestId);
            const request = currentOvertimeRequests.find(r => r.id === requestId);
            
            if (request) {
                // Show the modal for the specified request
                await viewOvertimeDetails(requestId);
                // Clear the pending request ID
                window.pendingRequestId = null;
            } else {
                // Request not found in current data, try to fetch it directly
                try {
                    await viewOvertimeDetails(requestId);
                    window.pendingRequestId = null;
                } catch (error) {
                    showErrorMessage('Belirtilen mesai talebi bulunamadı.');
                    window.pendingRequestId = null;
                }
            }
        }
        
    } catch (error) {
        showErrorMessage('Mesai talepleri yüklenirken hata oluştu.');
        if (overtimeTable) {
            overtimeTable.updateData([], 0, currentPage);
        }
    } finally {
        if (overtimeTable) {
            overtimeTable.setLoading(false);
        }
    }
}

// Table rendering is now handled by TableComponent

// Render status badge
function renderStatusBadge(status, statusLabel) {
    // Map status values to badge colors
    let badgeClass = 'status-grey'; // default
    
    switch (status) {
        case 'approved':
            badgeClass = 'status-green';
            break;
        case 'submitted':
            badgeClass = 'status-yellow';
            break;
        case 'cancelled':
            badgeClass = 'status-red';
            break;
        default:
            badgeClass = 'status-grey';
    }
    
    return `
        <span class="status-badge ${badgeClass}">
            ${statusLabel || status || 'Bilinmiyor'}
        </span>
    `;
}

// Render statistics
function renderStatistics() {
    const totalRequests = currentOvertimeRequests.length;
    const pendingRequests = currentOvertimeRequests.filter(request => request.status === 'submitted').length;
    const approvedRequests = currentOvertimeRequests.filter(request => request.status === 'approved').length;
    const totalHours = currentOvertimeRequests.reduce((sum, request) => sum + parseFloat(request.duration_hours || 0), 0);
    
    // Update statistics cards
    const statsComponent = window.overtimeStats;
    if (statsComponent) {
        statsComponent.updateValues({
            0: totalRequests.toString(),
            1: pendingRequests.toString(),
            2: approvedRequests.toString(),
            3: formatOvertimeDuration(totalHours)
        });
    }
}

// Pagination is now handled by TableComponent

// Load users for modal based on current user's allowed teams
async function loadUsersForModal() {
    if (!currentUser) {
        throw new Error('Current user not available');
    }
    
    // Get allowed teams for current user
    const allowedTeams = getAllowedTeams(currentUser.team);
    
    if (allowedTeams.length === 0) {
        // If no specific teams, fetch all users
        const response = await authFetchUsers(1, 1000);
        allUsers = response.results || response;
        return;
    }
    
    // Fetch users for all allowed teams
    const userPromises = allowedTeams.map(team => 
        authFetchUsers(1, 1000, { team: team })
    );
    
    const userResponses = await Promise.all(userPromises);
    
    // Combine all users from different teams
    allUsers = [];
    userResponses.forEach(response => {
        const users = response.results || response;
        if (Array.isArray(users)) {
            allUsers.push(...users);
        }
    });
    
    // Remove duplicates based on username
    const uniqueUsers = [];
    const seenUsernames = new Set();
    
    allUsers.forEach(user => {
        if (!seenUsernames.has(user.username)) {
            seenUsernames.add(user.username);
            uniqueUsers.push(user);
        }
    });
    
    allUsers = uniqueUsers;
}

// Show/hide loading state for submit button
function showSubmitLoading(show) {
    const submitBtn = document.getElementById('submit-overtime-request');
    const addParticipantBtn = document.getElementById('add-participant');
    const cancelBtn = document.querySelector('#createOvertimeModal .btn-outline-secondary');
    
    if (show) {
        // Show loading state
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Oluşturuluyor...';
        }
        
        if (addParticipantBtn) addParticipantBtn.disabled = true;
        if (cancelBtn) cancelBtn.disabled = true;
    } else {
        // Restore original state
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-save me-1"></i>Mesai Talebi Oluştur';
        }
        
        if (addParticipantBtn) addParticipantBtn.disabled = false;
        if (cancelBtn) cancelBtn.disabled = false;
    }
}

// Add participant to form
function addParticipant() {
    const container = document.getElementById('participants-container');
    if (!container) {
        return;
    }
    const participantIndex = container.children.length;
    
    const participantHtml = `
        <div class="participant-row mb-3" data-index="${participantIndex}">
            <div class="row g-2">
                <div class="col-md-4">
                    <div class="mb-2">
                        <label class="form-label compact">
                            <i class="fas fa-user me-1"></i>Çalışan *
                        </label>
                        <div class="user-dropdown-container" id="user-dropdown-${participantIndex}"></div>
                        <div class="form-text compact">Mesai talebine katılacak çalışan</div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="mb-2">
                        <label class="form-label compact">
                            <i class="fas fa-hashtag me-1"></i>İş Emri No *
                        </label>
                        <div id="job-no-dropdown-${participantIndex}"></div>
                        <div class="form-text compact">Çalışanın çalışacağı iş emri numarası</div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="mb-2">
                        <label class="form-label compact">
                            <i class="fas fa-comment me-1"></i>Açıklama
                        </label>
                        <input type="text" class="form-control form-control-sm" name="description" placeholder="Açıklama">
                        <div class="form-text compact">İş emri için ek açıklama</div>
                    </div>
                </div>
                <div class="col-md-1">
                    <div class="mb-2">
                        <label class="form-label compact">&nbsp;</label>
                        <button type="button" class="btn btn-outline-danger btn-sm w-100" onclick="removeParticipant(${participantIndex})" title="Katılımcıyı Kaldır">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    container.insertAdjacentHTML('beforeend', participantHtml);
    
    // Initialize user dropdown for this participant with a small delay to ensure DOM is ready
    setTimeout(() => {
        initializeUserDropdown(participantIndex);
        initializeJobOrderDropdown(participantIndex);
    }, 10);
}

// Initialize user dropdown
function initializeUserDropdown(index) {
    const container = document.getElementById(`user-dropdown-${index}`);
    if (!container) {
        return;
    }
    
    const dropdown = new ModernDropdown(container, {
        placeholder: 'Çalışan seçiniz...',
        searchable: true
    });
    
    // Set user options - try ID first, fallback to username
    const userItems = allUsers.map(user => ({
        value: user.id || user.username, // Try ID first, fallback to username
        text: (user.first_name && user.last_name) ? 
            `${user.first_name} ${user.last_name}` : 
            user.username
    }));
    
    dropdown.setItems(userItems);
    
    // Store dropdown reference in Map
    userDropdowns.set(index, dropdown);
}

// Load job order dropdown options
async function loadJobOrderDropdownOptions() {
    try {
        jobOrderDropdownOptions = await getJobOrderDropdown();
    } catch (error) {
        console.error('Error loading job order dropdown options:', error);
        jobOrderDropdownOptions = [];
        showErrorMessage('İş emirleri yüklenirken hata oluştu.');
    }
}

// Initialize job order dropdown for a specific participant
function initializeJobOrderDropdown(participantIndex) {
    const container = document.getElementById(`job-no-dropdown-${participantIndex}`);
    if (!container) return;

    // Load options if not already loaded
    if (jobOrderDropdownOptions.length === 0) {
        loadJobOrderDropdownOptions().then(() => {
            setupJobOrderDropdown(container, participantIndex);
        }).catch(() => {
            // Initialize with empty options if loading fails
            setupJobOrderDropdown(container, participantIndex);
        });
    } else {
        setupJobOrderDropdown(container, participantIndex);
    }
}

// Setup the job order dropdown component
function setupJobOrderDropdown(container, participantIndex) {
    // Clear container
    container.innerHTML = '';

    // Create dropdown
    const dropdown = new ModernDropdown(container, {
        placeholder: 'İş emri seçin',
        searchable: true,
        multiple: false,
        maxHeight: 200,
        width: '100%'
    });

    // Convert job orders to dropdown items format
    const dropdownItems = jobOrderDropdownOptions.map(jobOrder => ({
        value: jobOrder.job_no,
        text: `${jobOrder.job_no} - ${jobOrder.title}`
    }));

    dropdown.setItems(dropdownItems);

    // Store dropdown reference in Map
    jobOrderDropdowns.set(participantIndex, dropdown);
}

// Remove participant
function removeParticipant(index) {
    const participantRow = document.querySelector(`.participant-row[data-index="${index}"]`);
    if (participantRow) {
        // Don't remove if it's the only participant
        const container = document.getElementById('participants-container');
        if (container.children.length > 1) {
            // Clean up dropdown references
            userDropdowns.delete(index);
            jobOrderDropdowns.delete(index);
            participantRow.remove();
        } else {
            showErrorMessage('En az bir katılımcı olmalıdır.');
        }
    }
}

// Submit overtime request
async function submitOvertimeRequest(formData) {
    try {
        // Extract form data
        const reason = formData.reason;
        const startDate = formData.start_date;
        const startTime = formData.start_time;
        const endDate = formData.end_date;
        const endTime = formData.end_time;
        
        // Collect participants from the modal
        const participants = [];
        const participantRows = document.querySelectorAll('.participant-row');
        
        for (const row of participantRows) {
            const participantIndex = parseInt(row.dataset.index);
            const descriptionInput = row.querySelector('input[name="description"]');
            
            // Get dropdowns from Maps
            const userDropdown = userDropdowns.get(participantIndex);
            const jobOrderDropdown = jobOrderDropdowns.get(participantIndex);
            
            const userId = userDropdown?.getValue();
            const jobNo = jobOrderDropdown?.getValue();
            const description = descriptionInput?.value?.trim() || '';
            
            if (!userId || !jobNo) {
                showErrorMessage('Lütfen tüm katılımcılar için gerekli bilgileri doldurun.');
                return;
            }
            
            participants.push({
                user: parseInt(userId),
                job_no: jobNo,
                description: description
            });
        }
        
        if (participants.length === 0) {
            showErrorMessage('En az 1 katılımcı eklemelisiniz.');
            return;
        }
        
        // Combine date and time
        const startAt = `${startDate}T${startTime}`;
        const endAt = `${endDate}T${endTime}`;
        
        // Convert to UTC ISO string
        const startAtUTC = new Date(startAt).toISOString();
        const endAtUTC = new Date(endAt).toISOString();
        
        // Prepare request data
        const requestData = {
            start_at: startAtUTC,
            end_at: endAtUTC,
            reason: reason.trim(),
            entries: participants
        };
        
        // Validate request
        const validation = validateOvertimeRequest(requestData);
        if (!validation.isValid) {
            showErrorMessage(validation.errors.join('<br>'));
            return;
        }
        
        // Submit request
        const response = await createOvertimeRequest(requestData);
        
        // If we reach here, the request was successful
        showSuccessMessage('Mesai talebi başarıyla oluşturuldu.');
        
        // Close modal
        createOvertimeModal.hide();
        
        // Refresh data
        loadOvertimeRequests();
        
    } catch (error) {
        
        // Extract error message from API response
        let errorMessage = 'Mesai talebi oluşturulurken hata oluştu.';
        
        if (error.response) {
            // Try to get error from the API response
            if (Array.isArray(error.response)) {
                errorMessage = error.response.join('\n');
            } else {
                errorMessage = error.response;
            }
        } else if (error.message) {
            errorMessage = error.message;
        }
        
        showErrorMessage(errorMessage);
    } finally {
        // Hide loading state
        showSubmitLoading(false);
    }
}

// View overtime details
async function viewOvertimeDetails(requestId) {
    try {
        const request = await fetchOvertimeRequest(requestId);
        
        selectedOvertimeRequest = request;
        
        // Update URL to include the request ID
        const url = new URL(window.location);
        url.searchParams.set('request', requestId);
        window.history.pushState({}, '', url);
        
        // Use the modal from modals.js
        showOvertimeDetailsModal(request);
        
    } catch (error) {
        showErrorMessage('Mesai talebi detayları yüklenirken hata oluştu.');
    }
}


// Show cancel overtime modal

// Confirm cancel overtime
async function confirmCancelOvertime() {
    try {
        const requestId = window.pendingCancelRequestId;
        if (!requestId) return;
        
        await cancelOvertimeRequest(requestId);
        
        showSuccessMessage('Mesai talebi başarıyla iptal edildi.');
        
        // Close modal
        cancelOvertimeModal.hide();
        window.pendingCancelRequestId = null;
        
        // Refresh data
        loadOvertimeRequests();
        
    } catch (error) {
        showErrorMessage(error.message || 'Mesai talebi iptal edilirken hata oluştu.');
    }
}

// Loading state is now handled by TableComponent

function showSuccessMessage(message) {
    // You can implement a toast notification system here
    alert(message);
}

function showErrorMessage(message) {
    // Clean up the message for better display
    let cleanMessage = message;
    
    // Remove HTML tags if any
    cleanMessage = cleanMessage.replace(/<[^>]*>/g, '');
    
    // Replace line breaks with spaces for alert display
    cleanMessage = cleanMessage.replace(/\n/g, ' ');
    
    // Show the error message
    alert('Hata: ' + cleanMessage);
}

function getApprovalInfo(request) {
    if (!request.approval || request.status !== 'submitted') {
        return '<span class="text-muted">-</span>';
    }

    const { stage_instances } = request.approval;
    
    // Find the current stage (first incomplete stage)
    const currentStage = stage_instances.find(stage => !stage.is_complete && !stage.is_rejected);
    
    if (!currentStage) {
        return '<span class="text-success"><i class="fas fa-check-circle me-1"></i>Tamamlandı</span>';
    }

    const { name, required_approvals, approved_count, approvers } = currentStage;
    const remainingApprovals = required_approvals - approved_count;
    
    if (remainingApprovals <= 0) {
        return `<span class="text-success"><i class="fas fa-check-circle me-1"></i>${name}</span>`;
    }

    // Get the names of remaining approvers
    const remainingApprovers = approvers.slice(approved_count);
    const approverNames = remainingApprovers.map(approver => approver.full_name || approver.username).join(', ');
    
    return `
        <div style="line-height: 1.3; text-align: middle;">
            <div style="font-size: 0.85rem; margin-bottom: 0.25rem; color: #0d6efd; font-weight: 600; text-align: middle;">${name}</div>
            <div style="font-size: 0.75rem; margin-bottom: 0.25rem; color: #6c757d; text-align: middle;">
                <i class="fas fa-users me-1"></i>
                ${remainingApprovals} onay bekleniyor
            </div>
            ${approverNames ? `
                <div style="font-size: 0.7rem; line-height: 1.2; word-wrap: break-word; color: #6c757d; text-align: middle;">
                    <i class="fas fa-user-clock me-1"></i>
                    ${approverNames}
                </div>
            ` : ''}
        </div>
    `;
}

// Global functions for onclick handlers
window.viewOvertimeDetails = viewOvertimeDetails;
window.showCancelOvertimeModal = showCancelOvertimeModal;
window.removeParticipant = removeParticipant;
