import { initNavbar } from '../../components/navbar.js';
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
} from '../../generic/overtime.js';
import { fetchUsers, fetchTeams } from '../../generic/users.js';
import { formatDate, formatDateTime } from '../../generic/formatters.js';
import { HeaderComponent } from '../../components/header/header.js';
import { StatisticsCards } from '../../components/statistics-cards/statistics-cards.js';
import { FiltersComponent } from '../../components/filters/filters.js';
import { TableComponent } from '../../components/table/table.js';
import { ModernDropdown } from '../../components/dropdown.js';

// Global variables
let currentOvertimeRequests = [];
let currentFilters = {};
let currentPage = 1;
let itemsPerPage = 20;
let selectedOvertimeRequest = null;
let currentUser = null;
let allUsers = [];
let allTeams = [];

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
        onBackClick: () => window.location.href = '/general',
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
    
    // Load initial data
    loadInitialData();
    
    // Add event listeners
    addEventListeners();
});

// Load initial data
async function loadInitialData() {
    try {
        // Load teams and users in parallel
        const [teams, users] = await Promise.all([
            fetchTeams(),
            fetchUsers()
        ]);
        
        allTeams = teams;
        allUsers = users;
        
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
    // Refresh button
    const refreshBtn = document.getElementById('refresh-overtime-requests');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadOvertimeRequests);
    }
    
    // Export button
    const exportBtn = document.getElementById('export-overtime-requests');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportOvertimeRequests);
    }
    
    // Create overtime modal events
    setupCreateOvertimeModalEvents();
    
    // Details modal events
    setupDetailsModalEvents();
    
    // Cancel modal events
    setupCancelModalEvents();
    
    // Edit modal events
    setupEditModalEvents();
    
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
        showLoadingState();
        
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
        
        renderOvertimeRequestsTable();
        renderStatistics();
        renderPagination();
        
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
    } finally {
        hideLoadingState();
    }
}

// Render overtime requests table
function renderOvertimeRequestsTable() {
    const tbody = document.getElementById('overtime-requests-table-body');
    
    if (!currentOvertimeRequests || currentOvertimeRequests.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="text-center text-muted py-4">
                    <i class="fas fa-inbox fa-2x mb-3"></i>
                    <p>Henüz mesai talebi bulunmamaktadır.</p>
                </td>
            </tr>
        `;
        return;
    }
    
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageData = currentOvertimeRequests.slice(startIndex, endIndex);
    
    tbody.innerHTML = pageData.map(request => `
        <tr>
            <td>
                <strong>#${request.id}</strong>
            </td>
            <td>${request.requester_username || '-'}</td>
            <td><strong>${request.team_label || request.team || '-'}</strong></td>
            <td>${formatDateTime(request.start_at)}</td>
            <td>${formatDateTime(request.end_at)}</td>
            <td>
                <span class="badge bg-info text-dark">
                    ${formatOvertimeDuration(parseFloat(request.duration_hours))}
                </span>
            </td>
            <td>
                <span class="badge bg-secondary">
                    ${request.total_users || 0} kişi
                </span>
            </td>
            <td>
                ${renderStatusBadge(request.status, request.status_label)}
            </td>
            <td>${formatDate(request.created_at)}</td>
            <td class="text-center">
                <div class="btn-group" role="group">
                    <button class="btn btn-sm btn-outline-primary" onclick="viewOvertimeDetails(${request.id})" title="Detayları Görüntüle">
                        <i class="fas fa-eye"></i>
                    </button>
                    
                    ${canCancelOvertime(request, currentUser?.id) ? `
                        <button class="btn btn-sm btn-outline-danger" onclick="showCancelOvertimeModal(${request.id})" title="İptal Et">
                            <i class="fas fa-ban"></i>
                        </button>
                    ` : ''}
                </div>
            </td>
        </tr>
    `).join('');
}

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

// Render pagination
function renderPagination() {
    const paginationContainer = document.getElementById('overtime-requests-pagination');
    const totalPages = Math.ceil(currentOvertimeRequests.length / itemsPerPage);
    
    if (totalPages <= 1) {
        paginationContainer.innerHTML = '';
        return;
    }
    
    let paginationHTML = '';
    
    // Previous button
    paginationHTML += `
        <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="changePage(${currentPage - 1})">
                <i class="fas fa-chevron-left"></i>
            </a>
        </li>
    `;
    
    // Page numbers
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
            paginationHTML += `
                <li class="page-item ${i === currentPage ? 'active' : ''}">
                    <a class="page-link" href="#" onclick="changePage(${i})">${i}</a>
                </li>
            `;
        } else if (i === currentPage - 3 || i === currentPage + 3) {
            paginationHTML += '<li class="page-item disabled"><span class="page-link">...</span></li>';
        }
    }
    
    // Next button
    paginationHTML += `
        <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="changePage(${currentPage + 1})">
                <i class="fas fa-chevron-right"></i>
            </a>
        </li>
    `;
    
    paginationContainer.innerHTML = paginationHTML;
}

// Show create overtime modal
function showCreateOvertimeModal() {
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
    
    // Add initial participant
    addParticipant();
    
    const modal = new bootstrap.Modal(document.getElementById('createOvertimeModal'));
    modal.show();
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
    
    // Initialize user dropdown for this participant
    initializeUserDropdown(participantIndex);
}

// Initialize user dropdown
function initializeUserDropdown(index) {
    const container = document.getElementById(`user-dropdown-${index}`);
    if (!container) return;
    
    const dropdown = new ModernDropdown(container, {
        placeholder: 'Çalışan seçiniz...',
        searchable: true
    });
    
    // Set user options
    const userItems = allUsers.map(user => ({
        value: user.id,
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
    try {
        const startAt = document.getElementById('overtime-start-at').value;
        const endAt = document.getElementById('overtime-end-at').value;
        const reason = document.getElementById('overtime-reason').value;
        
        // Collect participants
        const participants = [];
        const participantRows = document.querySelectorAll('.participant-row');
        
        for (const row of participantRows) {
            const userDropdownContainer = row.querySelector('.user-dropdown-container');
            const jobNoInput = row.querySelector('input[name="job_no"]');
            const descriptionInput = row.querySelector('input[name="description"]');
            
            const userId = userDropdownContainer?.dropdown?.getValue();
            const jobNo = jobNoInput?.value;
            const description = descriptionInput?.value || '';
            
            if (userId && jobNo) {
                participants.push({
                    user: parseInt(userId),
                    job_no: jobNo.trim(),
                    description: description.trim()
                });
            }
        }
        
        // Prepare request data
        const requestData = {
            start_at: startAt,
            end_at: endAt,
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
        
        if (response) {
            showSuccessMessage('Mesai talebi başarıyla oluşturuldu.');
            
            // Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('createOvertimeModal'));
            modal.hide();
            
            // Refresh data
            loadOvertimeRequests();
        }
        
    } catch (error) {
        console.error('Error creating overtime request:', error);
        showErrorMessage(error.message || 'Mesai talebi oluşturulurken hata oluştu.');
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
        
        const modal = new bootstrap.Modal(document.getElementById('overtimeDetailsModal'));
        const content = document.getElementById('overtime-details-content');
        
        content.innerHTML = `
            <div class="row">
                <div class="col-md-6">
                    <h6 class="text-primary">Genel Bilgiler</h6>
                    <table class="table table-sm">
                        <tr><td><strong>Talep No:</strong></td><td>#${request.id}</td></tr>
                        <tr><td><strong>Talep Eden:</strong></td><td>${request.requester_username}</td></tr>
                                                 <tr><td><strong>Departman:</strong></td><td>${request.team || '-'}</td></tr>
                                                 <tr><td><strong>Durum:</strong></td><td>${renderStatusBadge(request.status, request.status_label)}</td></tr>
                        <tr><td><strong>Oluşturulma:</strong></td><td>${formatDateTime(request.created_at)}</td></tr>
                        <tr><td><strong>Son Güncelleme:</strong></td><td>${formatDateTime(request.updated_at)}</td></tr>
                    </table>
                </div>
                <div class="col-md-6">
                    <h6 class="text-primary">Mesai Bilgileri</h6>
                    <table class="table table-sm">
                        <tr><td><strong>Başlangıç:</strong></td><td>${formatDateTime(request.start_at)}</td></tr>
                        <tr><td><strong>Bitiş:</strong></td><td>${formatDateTime(request.end_at)}</td></tr>
                        <tr><td><strong>Süre:</strong></td><td><strong>${formatOvertimeDuration(parseFloat(request.duration_hours))}</strong></td></tr>
                        <tr><td><strong>Katılımcı Sayısı:</strong></td><td>${request.entries?.length || 0} kişi</td></tr>
                        <tr><td><strong>Neden:</strong></td><td>${request.reason || 'Belirtilmemiş'}</td></tr>
                    </table>
                </div>
            </div>
            ${request.entries && request.entries.length > 0 ? `
            <div class="row mt-3">
                <div class="col-12">
                    <h6 class="text-primary">Katılımcılar</h6>
                    <div class="table-responsive">
                        <table class="table table-sm table-striped">
                            <thead>
                                <tr>
                                    <th>Çalışan</th>
                                    <th>İş Emri No</th>
                                    <th>Açıklama</th>
                                    <th>Onaylanan Saat</th>
                                </tr>
                            </thead>
                            <tbody>
                                                                 ${request.entries.map(entry => {
                                     const userName = (entry.user_first_name && entry.user_last_name) ? 
                                         `${entry.user_first_name} ${entry.user_last_name}` : 
                                         entry.user_username;
                                     return `
                                     <tr>
                                         <td>${userName}</td>
                                         <td><code>${entry.job_no}</code></td>
                                         <td>${entry.description || '-'}</td>
                                         <td>${entry.approved_hours ? formatOvertimeDuration(parseFloat(entry.approved_hours)) : '-'}</td>
                                     </tr>
                                     `;
                                 }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            ` : ''}
        `;
        
        // Update action buttons
        updateDetailsModalActions(request);
        
        modal.show();
        
    } catch (error) {
        console.error('Error loading overtime details:', error);
        showErrorMessage('Mesai talebi detayları yüklenirken hata oluştu.');
    }
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

// Show edit overtime modal
function showEditOvertimeModal(requestId) {
    const request = currentOvertimeRequests.find(r => r.id === requestId) || selectedOvertimeRequest;
    if (!request) return;
    
    // Populate form
    document.getElementById('edit-overtime-reason').value = request.reason || '';
    
    // Store request ID for submission
    document.getElementById('edit-overtime-form').dataset.requestId = requestId;
    
    const modal = new bootstrap.Modal(document.getElementById('editOvertimeModal'));
    modal.show();
}

// Setup edit modal events
function setupEditModalEvents() {
    const submitBtn = document.getElementById('submit-overtime-edit');
    if (submitBtn) {
        submitBtn.addEventListener('click', submitOvertimeEdit);
    }
}

// Submit overtime edit
async function submitOvertimeEdit() {
    try {
        const form = document.getElementById('edit-overtime-form');
        const requestId = form.dataset.requestId;
        const reason = document.getElementById('edit-overtime-reason').value;
        
        const updateData = {
            reason: reason.trim()
        };
        
        await updateOvertimeRequest(requestId, updateData);
        
        showSuccessMessage('Mesai talebi başarıyla güncellendi.');
        
        // Close modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('editOvertimeModal'));
        modal.hide();
        
        // Refresh data
        loadOvertimeRequests();
        
        // If details modal is open, refresh it
        if (selectedOvertimeRequest && selectedOvertimeRequest.id == requestId) {
            setTimeout(() => viewOvertimeDetails(requestId), 500);
        }
        
    } catch (error) {
        console.error('Error updating overtime request:', error);
        showErrorMessage(error.message || 'Mesai talebi güncellenirken hata oluştu.');
    }
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
async function exportOvertimeRequests() {
    try {
        // For now, export as CSV (you can implement Excel export later)
        const csvContent = generateCSV(currentOvertimeRequests);
        downloadCSV(csvContent, `mesai-talepleri-${new Date().toISOString().split('T')[0]}.csv`);
    } catch (error) {
        console.error('Error exporting overtime requests:', error);
        showErrorMessage('Dışa aktarma sırasında hata oluştu.');
    }
}

// Generate CSV content
function generateCSV(data) {
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
    
    const rows = data.map(request => [
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
    ]);
    
    const csvContent = [headers, ...rows]
        .map(row => row.map(field => `"${field}"`).join(','))
        .join('\n');
    
    return csvContent;
}

// Download CSV
function downloadCSV(content, filename) {
    const blob = new Blob(['\ufeff' + content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Utility functions are now imported from formatters.js

function showLoadingState() {
    const tbody = document.getElementById('overtime-requests-table-body');
    tbody.innerHTML = `
        <tr>
            <td colspan="10" class="text-center py-4">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Yükleniyor...</span>
                </div>
                <p class="mt-2">Yükleniyor...</p>
            </td>
        </tr>
    `;
}

function hideLoadingState() {
    // Loading state is handled by renderOvertimeRequestsTable
}

function showSuccessMessage(message) {
    // You can implement a toast notification system here
    alert(message);
}

function showErrorMessage(message) {
    // You can implement a toast notification system here
    alert('Hata: ' + message);
}

// Global functions for onclick handlers
window.viewOvertimeDetails = viewOvertimeDetails;
window.showEditOvertimeModal = showEditOvertimeModal;
window.showCancelOvertimeModal = showCancelOvertimeModal;
window.removeParticipant = removeParticipant;

window.changePage = function(page) {
    currentPage = page;
    renderOvertimeRequestsTable();
    renderPagination();
};
