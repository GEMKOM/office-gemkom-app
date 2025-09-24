import { initNavbar } from '../../../components/navbar.js';
import { 
    fetchOvertimeRequests,
    fetchOvertimeRequest,
    createOvertimeRequest,
    updateOvertimeRequest,
    cancelOvertimeRequest,
    getOvertimeStatusInfo,
    formatOvertimeDuration,
    canCancelOvertime,
    canEditOvertime,
    validateOvertimeRequest
} from '../../../generic/overtime.js';
import { fetchUsers, fetchTeams, authFetchUsers } from '../../../generic/users.js';
import { getAllowedTeams } from '../../../generic/teams.js';
import { formatDate, formatDateTime } from '../../../generic/formatters.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { StatisticsCards } from '../../../components/statistics-cards/statistics-cards.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
import { TableComponent } from '../../../components/table/table.js';
import { ModernDropdown } from '../../../components/dropdown.js';

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
        showExportButton: 'block',
        showRefreshButton: 'block',
        createButtonText: 'Yeni Mesai Talebi',
        exportButtonText: 'Dışa Aktar',
        refreshButtonText: 'Yenile',
        onBackClick: () => window.location.href = '/general/overtime',
        onCreateClick: showCreateOvertimeModal,
        onExportClick: exportOvertimeRequests,
        onRefreshClick: loadOvertimeRequests
    });
    
    // Check for request ID in URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const requestId = urlParams.get('request');
    
    if (requestId) {
        // Store the request ID to show modal after data loads
        window.pendingRequestId = requestId;
    }
    
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
            { value: 'rejected', label: 'Reddedildi' },
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
                formatter: (value) => `
                    <div style="font-weight: 500; color: #495057;">
                        <i class="fas fa-user-circle me-2 text-muted"></i>
                        ${value || 'Bilinmiyor'}
                    </div>
                `
            },
            {
                field: 'team_label',
                label: 'Departman',
                sortable: true,
                formatter: (value) => `
                    <div style="color: #495057; font-weight: 500;">${value || '-'}</div>
                `
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
                formatter: (value) => `
                    <div style="color: #495057; font-weight: 500;">${formatOvertimeDuration(value)}</div>
                `
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
                formatter: (value, row) => renderStatusBadge(value, row.status_label)
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
        onExport: (format) => {
            exportOvertimeRequests(format);
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
            itemsPerPage = newPageSize;
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
        console.error('Error loading initial data:', error);
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
    // Create overtime modal events
    setupCreateOvertimeModalEvents();
    
    // Cancel modal events
    setupCancelModalEvents();
    
    
    // Handle modal close to clean up URL
    const overtimeDetailsModal = document.getElementById('overtimeDetailsModal');
    if (overtimeDetailsModal) {
        overtimeDetailsModal.addEventListener('hidden.bs.modal', function () {
            // Remove request parameter from URL when modal is closed
            const url = new URL(window.location);
            url.searchParams.delete('request');
            window.history.pushState({}, '', url);
        });
    }
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
            page_size: itemsPerPage
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
                    console.error('Request not found:', requestId);
                    showErrorMessage('Belirtilen mesai talebi bulunamadı.');
                    window.pendingRequestId = null;
                }
            }
        }
        
    } catch (error) {
        console.error('Error loading overtime requests:', error);
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
    return `
        <span class="status-badge status-${status}">
            ${statusLabel}
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

// Show/hide loading state in modal
function showModalLoading(show) {
    const participantsSection = document.querySelector('#createOvertimeModal .form-section:last-of-type');
    const addParticipantBtn = document.getElementById('add-participant');
    const submitBtn = document.getElementById('submit-overtime-request');
    
    if (show) {
        // Show loading state
        if (participantsSection) {
            participantsSection.innerHTML = `
                <div class="text-center py-4">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Yükleniyor...</span>
                    </div>
                    <div class="mt-2">Kullanıcılar yükleniyor...</div>
                </div>
            `;
        }
        
        if (addParticipantBtn) addParticipantBtn.disabled = true;
        if (submitBtn) submitBtn.disabled = true;
    } else {
        // Restore original content
        if (participantsSection) {
            participantsSection.innerHTML = `
                <h6 class="section-subtitle compact">
                    <i class="fas fa-users me-2 text-success"></i>Katılımcılar
                </h6>
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <div class="form-text compact">Mesai talebine katılacak çalışanları ekleyin</div>
                    <button type="button" class="btn btn-sm btn-outline-primary" id="add-participant">
                        <i class="fas fa-plus me-1"></i>Katılımcı Ekle
                    </button>
                </div>
                <div id="participants-container">
                    <!-- Participants will be added here -->
                </div>
            `;
            
            // Re-attach event listener
            const newAddParticipantBtn = document.getElementById('add-participant');
            if (newAddParticipantBtn) {
                newAddParticipantBtn.addEventListener('click', addParticipant);
            }
        }
        
        if (addParticipantBtn) addParticipantBtn.disabled = false;
        if (submitBtn) submitBtn.disabled = false;
    }
}

// Show create overtime modal
async function showCreateOvertimeModal() {
    // Reset form
    const form = document.getElementById('create-overtime-form');
    if (form) {
        form.reset();
    }
    
    // Clear participants
    const participantsContainer = document.getElementById('participants-container');
    if (participantsContainer) {
        participantsContainer.innerHTML = '';
    }
    
    // Show modal with loading state
    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('createOvertimeModal'));
    modal.show();
    
    // Show loading state
    showModalLoading(true);
    
    try {
        // Fetch users based on current user's allowed teams
        await loadUsersForModal();
        
    } catch (error) {
        console.error('Error loading users for modal:', error);
        showErrorMessage('Kullanıcılar yüklenirken hata oluştu.');
    } finally {
        // Hide loading state
        showModalLoading(false);
        
        // Add initial participant after UI is restored
        setTimeout(() => {
            addParticipant();
        }, 100);
    }
}

// Setup create overtime modal events
function setupCreateOvertimeModalEvents() {
    // Add participant button
    const addParticipantBtn = document.getElementById('add-participant');
    if (addParticipantBtn) {
        addParticipantBtn.addEventListener('click', addParticipant);
    }
    
    // Submit button
    const submitBtn = document.getElementById('submit-overtime-request');
    if (submitBtn) {
        submitBtn.addEventListener('click', submitOvertimeRequest);
    }
}

// Add participant to form
function addParticipant() {
    const container = document.getElementById('participants-container');
    if (!container) {
        console.error('Participants container not found');
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
                        <input type="text" class="form-control form-control-sm" name="job_no" placeholder="Örn: 001-23" required>
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
    }, 10);
}

// Initialize user dropdown
function initializeUserDropdown(index) {
    const container = document.getElementById(`user-dropdown-${index}`);
    if (!container) {
        console.error('Container not found for dropdown index:', index);
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
    
    // Store dropdown reference
    container.dropdown = dropdown;
}

// Remove participant
function removeParticipant(index) {
    const participantRow = document.querySelector(`.participant-row[data-index="${index}"]`);
    if (participantRow) {
        // Don't remove if it's the only participant
        const container = document.getElementById('participants-container');
        if (container.children.length > 1) {
            participantRow.remove();
        } else {
            showErrorMessage('En az bir katılımcı olmalıdır.');
        }
    }
}

// Submit overtime request
async function submitOvertimeRequest() {
    const submitBtn = document.getElementById('submit-overtime-request');
    const addParticipantBtn = document.getElementById('add-participant');
    
    // Prevent multiple submissions
    if (submitBtn.disabled) {
        return;
    }
    
    // Show loading state
    showSubmitLoading(true);
    
    try {
        const startAt = document.getElementById('overtime-start-at').value;
        const endAt = document.getElementById('overtime-end-at').value;
        const reason = document.getElementById('overtime-reason').value;
        
        // Collect participants
        const participants = [];
        const participantRows = document.querySelectorAll('.participant-row');
        
        for (const row of participantRows) {
            // Try multiple selectors to find the dropdown container
            let userDropdownContainer = row.querySelector('.user-dropdown-container');
            if (!userDropdownContainer) {
                // Try finding by ID pattern
                const rowIndex = row.getAttribute('data-index');
                userDropdownContainer = document.getElementById(`user-dropdown-${rowIndex}`);
            }
            
            const jobNoInput = row.querySelector('input[name="job_no"]');
            const descriptionInput = row.querySelector('input[name="description"]');
            
            // Check if dropdown is properly initialized
            if (userDropdownContainer && !userDropdownContainer.dropdown) {
                const rowIndex = row.getAttribute('data-index');
                initializeUserDropdown(parseInt(rowIndex));
            }
            
            // Try multiple ways to get the selected value
            let userId = userDropdownContainer?.dropdown?.getValue();
            
            // Fallback: try to get value from the dropdown's selectedValue property
            if (!userId && userDropdownContainer?.dropdown?.selectedValue) {
                userId = userDropdownContainer.dropdown.selectedValue;
            }
            
            // Another fallback: try to get value from the selected display text
            if (!userId && userDropdownContainer) {
                const selectedText = userDropdownContainer.querySelector('.selected-text');
                if (selectedText && selectedText.textContent !== 'Çalışan seçiniz...') {
                    // Find the user by display text
                    const user = allUsers.find(u => {
                        const displayName = (u.first_name && u.last_name) ? 
                            `${u.first_name} ${u.last_name}` : 
                            u.username;
                        return displayName === selectedText.textContent;
                    });
                    if (user) {
                        // Try ID first, fallback to username
                        userId = user.id || user.username;
                    }
                }
            }
            const jobNo = jobNoInput?.value?.trim();
            const description = descriptionInput?.value?.trim() || '';
            
            // Check if user is selected
            if (!userId || userId === null || userId === undefined) {
                showErrorMessage('Lütfen tüm katılımcılar için çalışan seçimi yapın.');
                return;
            }
            
            // Check if job number is provided
            if (!jobNo) {
                showErrorMessage('Lütfen tüm katılımcılar için iş emri numarası girin.');
                return;
            }
            
            participants.push({
                user: parseInt(userId),
                job_no: jobNo,
                description: description
            });
        }
        
        // Check if we have at least one participant
        if (participants.length === 0) {
            showErrorMessage('En az 1 katılımcı eklemelisiniz.');
            return;
        }
        
        // Convert local datetime to UTC ISO string
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
        const modal = bootstrap.Modal.getInstance(document.getElementById('createOvertimeModal'));
        modal.hide();
        
        // Refresh data
        loadOvertimeRequests();
        
    } catch (error) {
        console.error('Error creating overtime request:', error);
        console.error('Error message:', error.message);
        console.error('Error response:', error.response);
        
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
        
        const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('overtimeDetailsModal'));
        const content = document.getElementById('overtime-details-content');
        
        // Get rejection comments
        const rejectionComments = getRejectionComments(request);
        
        content.innerHTML = `
            <div class="row">
                <div class="col-md-6">
                    <h6 class="text-primary">Genel Bilgiler</h6>
                    <table class="table table-sm">
                        <tr><td><strong class="text-dark">Talep No:</strong></td><td>#${request.id}</td></tr>
                        <tr><td><strong class="text-dark">Talep Eden:</strong></td><td>${request.requester_username}</td></tr>
                        <tr><td><strong class="text-dark">Departman:</strong></td><td>${request.team_label || request.team || '-'}</td></tr>
                        <tr><td><strong class="text-dark">Durum:</strong></td><td>${renderStatusBadge(request.status, request.status_label)}</td></tr>
                        <tr><td><strong class="text-dark">Oluşturulma:</strong></td><td>${formatDateTime(request.created_at)}</td></tr>
                        <tr><td><strong class="text-dark">Son Güncelleme:</strong></td><td>${formatDateTime(request.updated_at)}</td></tr>
                    </table>
                </div>
                <div class="col-md-6">
                    <h6 class="text-primary">Mesai Bilgileri</h6>
                    <table class="table table-sm">
                        <tr><td><strong class="text-dark">Başlangıç:</strong></td><td>${formatDateTime(request.start_at)}</td></tr>
                        <tr><td><strong class="text-dark">Bitiş:</strong></td><td>${formatDateTime(request.end_at)}</td></tr>
                        <tr><td><strong class="text-dark">Süre:</strong></td><td><strong>${formatOvertimeDuration(parseFloat(request.duration_hours))}</strong></td></tr>
                        <tr><td><strong class="text-dark">Katılımcı Sayısı:</strong></td><td>${request.entries?.length || 0} kişi</td></tr>
                        <tr><td><strong class="text-dark">Neden:</strong></td><td>${request.reason || 'Belirtilmemiş'}</td></tr>
                    </table>
                </div>
            </div>
            ${rejectionComments.length > 0 ? `
            <div class="row mt-4">
                <div class="col-12">
                    <h6 class="text-danger">
                        <i class="fas fa-times-circle me-2"></i>
                        Reddetme Gerekçeleri
                    </h6>
                    <div class="alert alert-danger">
                        ${rejectionComments.map(comment => `
                            <div class="mb-3 p-3 border border-danger rounded" style="background-color: rgba(220, 53, 69, 0.1);">
                                <div class="d-flex justify-content-between align-items-start mb-2">
                                    <div>
                                        <strong class="text-danger">
                                            <i class="fas fa-user-times me-1"></i>
                                            ${comment.approver}
                                        </strong>
                                        <span class="badge bg-danger ms-2">${comment.stage}</span>
                                    </div>
                                    <small class="text-muted">
                                        <i class="fas fa-clock me-1"></i>
                                        ${comment.date ? formatDateTime(comment.date) : '-'}
                                    </small>
                                </div>
                                <div class="text-dark" style="line-height: 1.4;">
                                    <i class="fas fa-comment-alt me-1 text-muted"></i>
                                    ${comment.comment}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
            ` : ''}
            <div class="row mt-4">
                <div class="col-12">
                    <div id="participants-table-container" style="display: none;">
                        <!-- Participants table will be rendered here using TableComponent -->
                    </div>
                </div>
            </div>
        `;
        
        // Render participants table using TableComponent if there are entries
        if (request.entries && request.entries.length > 0) {
            renderParticipantsTable(request.entries);
        }
        
        // Update action buttons
        updateDetailsModalActions(request);
        
        modal.show();
        
    } catch (error) {
        console.error('Error loading overtime details:', error);
        showErrorMessage('Mesai talebi detayları yüklenirken hata oluştu.');
    }
}

// Render participants table using TableComponent
function renderParticipantsTable(entries) {
    const container = document.getElementById('participants-table-container');
    if (!container) return;
    
    // Clear any existing table
    container.innerHTML = '';
    container.style.display = 'block';
    
    // Create TableComponent for participants
    const participantsTable = new TableComponent('participants-table-container', {
        title: 'Katılımcılar',
        columns: [
            {
                field: 'user_name',
                label: 'Çalışan',
                sortable: true,
                formatter: (value) => value || '-'
            },
            {
                field: 'job_no',
                label: 'İş Emri No',
                sortable: true,
                formatter: (value) => `<code>${value || '-'}</code>`
            },
            {
                field: 'description',
                label: 'Açıklama',
                sortable: true,
                formatter: (value) => value || '-'
            },
            {
                field: 'approved_hours',
                label: 'Onaylanan Saat',
                sortable: true,
                formatter: (value) => value ? formatOvertimeDuration(parseFloat(value)) : '-'
            }
        ],
        data: entries.map(entry => ({
            ...entry,
            user_name: (entry.user_first_name && entry.user_last_name) ? 
                `${entry.user_first_name} ${entry.user_last_name}` : 
                entry.user_username
        })),
        sortable: true,
        pagination: false,
        responsive: true,
        striped: true,
        small: true,
        tableClass: 'table table-sm table-striped',
        emptyMessage: 'Katılımcı bulunamadı',
        emptyIcon: 'fas fa-users',
        skeleton: false
    });
}

// Update details modal actions
function updateDetailsModalActions(request) {
    const actionsContainer = document.getElementById('overtime-actions');
    let actionsHtml = '';
    
    if (canCancelOvertime(request, currentUser?.id)) {
        actionsHtml += `
            <button type="button" class="btn btn-sm btn-danger me-2" onclick="showCancelOvertimeModal(${request.id})">
                <i class="fas fa-ban me-1"></i>İptal Et
            </button>
        `;
    }
    
    actionsContainer.innerHTML = actionsHtml;
}

// Setup details modal events
function setupDetailsModalEvents() {
    // Events are handled via onclick attributes in the HTML
}

// Show cancel overtime modal
function showCancelOvertimeModal(requestId) {
    const request = currentOvertimeRequests.find(r => r.id === requestId) || selectedOvertimeRequest;
    if (!request) return;
    
    // Populate info
    const infoContainer = document.getElementById('cancel-overtime-info');
    infoContainer.innerHTML = `
        <table class="table table-sm">
            <tr><td><strong>Talep No:</strong></td><td>#${request.id}</td></tr>
            <tr><td><strong>Başlangıç:</strong></td><td>${formatDateTime(request.start_at)}</td></tr>
            <tr><td><strong>Bitiş:</strong></td><td>${formatDateTime(request.end_at)}</td></tr>
            <tr><td><strong>Süre:</strong></td><td>${formatOvertimeDuration(parseFloat(request.duration_hours))}</td></tr>
        </table>
    `;
    
    // Store request ID for submission
    document.getElementById('confirm-cancel-overtime').dataset.requestId = requestId;
    
    const modal = new bootstrap.Modal(document.getElementById('cancelOvertimeModal'));
    modal.show();
}

// Setup cancel modal events
function setupCancelModalEvents() {
    const confirmBtn = document.getElementById('confirm-cancel-overtime');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', confirmCancelOvertime);
    }
}

// Confirm cancel overtime
async function confirmCancelOvertime() {
    try {
        const requestId = document.getElementById('confirm-cancel-overtime').dataset.requestId;
        
        await cancelOvertimeRequest(requestId);
        
        showSuccessMessage('Mesai talebi başarıyla iptal edildi.');
        
        // Close modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('cancelOvertimeModal'));
        modal.hide();
        
        // Refresh data
        loadOvertimeRequests();
        
        // Close details modal if open
        const detailsModal = bootstrap.Modal.getInstance(document.getElementById('overtimeDetailsModal'));
        if (detailsModal) {
            detailsModal.hide();
        }
        
    } catch (error) {
        console.error('Error cancelling overtime request:', error);
        showErrorMessage(error.message || 'Mesai talebi iptal edilirken hata oluştu.');
    }
}

// Export overtime requests
async function exportOvertimeRequests(format = 'csv') {
    try {
        // Show loading message
        const exportBtn = document.querySelector('#overtime-table-container-export');
        if (exportBtn) {
            exportBtn.disabled = true;
            exportBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Dışa Aktarılıyor...';
        }
        
        // Get filter values
        const filterValues = currentFilters || {};
        
        // Prepare filters for API call
        const apiFilters = {
            ...filterValues,
            page: 1,
            page_size: 10000 // Get all records for export
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
        const allRequests = data.results || data;
        
        if (allRequests.length === 0) {
            alert('Dışa aktarılacak mesai talebi bulunamadı');
            return;
        }
        
        // Prepare data for export
        const headers = [
            'Talep No',
            'Talep Eden',
            'Departman',
            'Başlangıç',
            'Bitiş',
            'Süre (Saat)',
            'Katılımcı Sayısı',
            'Durum',
            'Neden',
            'Oluşturulma'
        ];
        
        const exportData = [
            headers,
            ...allRequests.map(request => [
                request.id,
                request.requester_username || '',
                request.team_label || request.team || '',
                formatDateTime(request.start_at),
                formatDateTime(request.end_at),
                request.duration_hours || '0',
                request.total_users || 0,
                request.status_label || '',
                request.reason || '',
                formatDateTime(request.created_at)
            ])
        ];
        
        // Export based on format
        if (format === 'csv') {
            exportToCSV(exportData, 'mesai-talepleri');
        } else if (format === 'excel') {
            exportToExcel(exportData, 'mesai-talepleri');
        }
        
    } catch (error) {
        console.error('Error exporting overtime requests:', error);
        showErrorMessage('Dışa aktarma sırasında hata oluştu.');
    } finally {
        // Reset export button
        const exportBtn = document.querySelector('#overtime-table-container-export');
        if (exportBtn) {
            exportBtn.disabled = false;
            exportBtn.innerHTML = '<i class="fas fa-download me-1"></i>Dışa Aktar';
        }
    }
}

// Export helper functions
function exportToCSV(data, filename) {
    const csvContent = data.map(row => 
        row.map(cell => `"${cell}"`).join(',')
    ).join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
}

function exportToExcel(data, filename) {
    // For Excel export, you would need a library like SheetJS
    // For now, we'll just show a message
    alert('Excel export özelliği yakında eklenecek');
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

function getRejectionComments(request) {
    if (!request.approval || !request.approval.stage_instances) {
        return [];
    }

    const rejectionComments = [];
    
    request.approval.stage_instances.forEach(stage => {
        if (stage.decisions) {
            stage.decisions.forEach(decision => {
                if (decision.decision === "reject" && decision.comment) {
                    rejectionComments.push({
                        stage: stage.name,
                        approver: decision.approver_detail?.full_name || decision.approver_detail?.username || 'Bilinmeyen',
                        comment: decision.comment,
                        date: decision.decided_at
                    });
                }
            });
        }
    });
    
    return rejectionComments;
}

// Global functions for onclick handlers
window.viewOvertimeDetails = viewOvertimeDetails;
window.showCancelOvertimeModal = showCancelOvertimeModal;
window.removeParticipant = removeParticipant;
