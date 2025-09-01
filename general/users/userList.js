import { initNavbar } from '../../components/navbar.js';
import { ModernDropdown } from '../../components/dropdown.js';
import { authFetchUsers, deleteUser as deleteUserAPI, createUser as createUserAPI, updateUser as updateUserAPI, fetchTeams, fetchOccupations } from '../../generic/users.js';
import { fetchUsersSummary } from '../../generic/summaries.js';
import { HeaderComponent } from '../../components/header/header.js';
import { FiltersComponent } from '../../components/filters/filters.js';
import { StatisticsCards } from '../../components/statistics-cards/statistics-cards.js';

// State management
let currentPage = 1;
let currentFilter = 'all';
let currentOrdering = 'username'; // Default backend ordering
let currentSortField = 'username'; // Default sort field
let currentSortDirection = 'asc'; // Default sort direction
let users = [];
let totalUsers = 0;
let isLoading = false;
let usersStats = null; // Statistics Cards component instance
let userFilters = null; // Filters component instance

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    await initNavbar();
    
    // Initialize header component
    const header = new HeaderComponent({
        title: 'Çalışan Yönetimi',
        subtitle: 'Çalışan listesi ve yönetimi',
        icon: 'users',
        showBackButton: 'block',
        showCreateButton: 'block',
        showBulkCreateButton: 'block',
        createButtonText: '      Yeni Çalışan',
        bulkCreateButtonText: 'Toplu Oluştur',
        onBackClick: () => window.location.href = '/general/',
        onCreateClick: () => showCreateUserModal(),
        onBulkCreateClick: () => showBulkCreateUserModal()
    });
    
    // Initialize Statistics Cards component
    usersStats = new StatisticsCards('users-statistics', {
        cards: [
            { title: 'Toplam Çalışan', value: '0', icon: 'fas fa-users', color: 'primary', id: 'total-users-count' },
            { title: 'Ofis', value: '0', icon: 'fas fa-building', color: 'success', id: 'office-users-count' },
            { title: 'Atölye', value: '0', icon: 'fas fa-industry', color: 'info', id: 'workshop-users-count' },
            { title: 'Aktif Takım', value: '0', icon: 'fas fa-user-friends', color: 'warning', id: 'active-teams-count' }
        ],
        compact: true,
        animation: true
    });
    
    await initializeUsers();
    setupEventListeners();
});

async function initializeUsers() {
    try {
        initializeFiltersComponent();
        initializeSortableHeaders();
        
        await loadTeams();
        await loadOccupations();
        await loadUsers();
        updateUserCounts();
    } catch (error) {
        console.error('Error initializing users:', error);
        showNotification('Çalışanlar yüklenirken hata oluştu', 'error');
    }
}

async function loadTeams() {
    try {
        const teams = await fetchTeams();
        
                 // Populate team dropdown in create user modal
         const teamSelect = document.getElementById('user-team');
         if (teamSelect) {
             teamSelect.innerHTML = '<option value="">Takım seçin...</option>';
             teams.forEach(team => {
                 const option = document.createElement('option');
                 option.value = team.value || team.id;
                 option.textContent = team.label || team.name;
                 teamSelect.appendChild(option);
             });
         }
         
         // Also populate team dropdown in edit user modal
         const editTeamSelect = document.getElementById('edit-user-team');
         if (editTeamSelect) {
             editTeamSelect.innerHTML = '<option value="">Takım seçin...</option>';
             teams.forEach(team => {
                 const option = document.createElement('option');
                 option.value = team.value || team.id;
                 option.textContent = team.label || team.name;
                 editTeamSelect.appendChild(option);
             });
         }
    } catch (error) {
        console.error('Error loading teams:', error);
    }
}

async function loadOccupations() {
    try {
        const occupations = await fetchOccupations();
        
                 // Populate occupation dropdown in create user modal
         const occupationSelect = document.getElementById('user-occupation');
         if (occupationSelect) {
             occupationSelect.innerHTML = '<option value="">Görev seçin...</option>';
             occupations.forEach(occupation => {
                 const option = document.createElement('option');
                 option.value = occupation.value || occupation.id;
                 option.textContent = occupation.label || occupation.name;
                 occupationSelect.appendChild(option);
             });
         }
         
         // Also populate occupation dropdown in edit user modal (if it exists)
         const editOccupationSelect = document.getElementById('edit-user-occupation');
         if (editOccupationSelect) {
             editOccupationSelect.innerHTML = '<option value="">Görev seçin...</option>';
             occupations.forEach(occupation => {
                 const option = document.createElement('option');
                 option.value = occupation.value || occupation.id;
                 option.textContent = occupation.label || occupation.name;
                 editOccupationSelect.appendChild(option);
             });
         }
    } catch (error) {
        console.error('Error loading occupations:', error);
    }
}

function initializeFiltersComponent() {
    // Initialize filters component
    userFilters = new FiltersComponent('filters-placeholder', {
        title: 'Çalışan Filtreleri',
        onApply: (values) => {
            // Apply filters and reload users
            loadUsers(1);
        },
        onClear: () => {
            // Clear filters and reload users
            loadUsers(1);
            showNotification('Filtreler temizlendi', 'info');
        },
        onFilterChange: (filterId, value) => {
            // Optional: Handle individual filter changes
            console.log(`Filter ${filterId} changed to:`, value);
        }
    });

    // Add text filters
    userFilters.addTextFilter({
        id: 'username-filter',
        label: 'Kullanıcı Adı',
        placeholder: 'Kullanıcı adı',
        colSize: 3
    });

    // Add dropdown filters with initial empty options
    userFilters.addDropdownFilter({
        id: 'team-filter',
        label: 'Takım',
        options: [
            { value: '', label: 'Tüm Takımlar' }
        ],
        placeholder: 'Tüm Takımlar',
        colSize: 3
    });

    userFilters.addDropdownFilter({
        id: 'work-location-filter',
        label: 'Çalışma Yeri',
        options: [
            { value: '', label: 'Tümü' },
            { value: 'office', label: 'Ofis' },
            { value: 'workshop', label: 'Atölye' }
        ],
        placeholder: 'Tümü',
        colSize: 3
    });

    userFilters.addDropdownFilter({
        id: 'occupation-filter',
        label: 'Görev',
        options: [
            { value: '', label: 'Tüm Görevler' }
        ],
        placeholder: 'Tüm Görevler',
        colSize: 3
    });
}

async function loadUsers(page = 1) {
    try {
        if (isLoading) return;
        
        isLoading = true;
        currentPage = page;
        showLoadingState();
        
        // Get filter values
        const filterValues = userFilters ? userFilters.getFilterValues() : {};
        
        // Build query parameters
        const params = new URLSearchParams();
        params.append('page', page.toString());
        params.append('page_size', '20');
        
        // Add filters
        if (filterValues['username-filter']) {
            params.append('username', filterValues['username-filter']);
        }
        if (filterValues['team-filter']) {
            params.append('team', filterValues['team-filter']);
        }
        if (filterValues['work-location-filter']) {
            params.append('work_location', filterValues['work-location-filter']);
        }
        if (filterValues['occupation-filter']) {
            params.append('occupation', filterValues['occupation-filter']);
        }
        
        // Add ordering
        const orderingParam = currentSortDirection === 'asc' ? currentSortField : `-${currentSortField}`;
        params.append('ordering', orderingParam);
        
        const response = await authFetchUsers(page, 20, {
            username: filterValues['username-filter'] || '',
            team: filterValues['team-filter'] || '',
            work_location: filterValues['work-location-filter'] || '',
            occupation: filterValues['occupation-filter'] || '',
            ordering: orderingParam
        });
        
        users = response.results || [];
        totalUsers = response.count || 0;
        
        renderUsersTable();
        renderPagination();
        updateUserCounts();
        
        // Update team filter options
        updateTeamFilterOptions();
        
    } catch (error) {
        console.error('Error loading users:', error);
        showNotification('Çalışanlar yüklenirken hata oluştu', 'error');
        users = [];
        totalUsers = 0;
    } finally {
        isLoading = false;
        hideLoadingState();
    }
}

function renderUsersTable() {
    const tbody = document.getElementById('users-table-body');
    if (!tbody) return;
    
         if (users.length === 0) {
         tbody.innerHTML = `
             <tr>
                 <td colspan="8" class="text-center">
                     <div class="empty-state">
                         <i class="fas fa-users"></i>
                         <h5>Çalışan Bulunamadı</h5>
                         <p>Kriterlere uygun çalışan bulunamadı</p>
                     </div>
                 </td>
             </tr>
         `;
         return;
     }
    
         tbody.innerHTML = users.map(user => `
         <tr>
             <td style="color: #000;">${user.username || '-'}</td>
             <td>${user.first_name || '-'}</td>
             <td>${user.last_name || '-'}</td>
             <td>${user.email || '-'}</td>
             <td>${user.team_label || '-'}</td>
             <td>${user.occupation_label || '-'}</td>
             <td>${user.work_location_label || '-'}</td>
             <td>
                 <div class="btn-group btn-group-sm" role="group">
                     <button type="button" class="btn btn-outline-primary" onclick="editUser('${user.id || ''}')" title="Düzenle">
                         <i class="fas fa-edit"></i>
                     </button>
                     <button type="button" class="btn btn-outline-danger" onclick="deleteUser('${user.id}', '${user.username}')" title="Sil">
                         <i class="fas fa-trash"></i>
                     </button>
                 </div>
             </td>
         </tr>
     `).join('');
}

function renderPagination() {
    const pagination = document.getElementById('users-pagination');
    if (!pagination) return;
    
    const totalPages = Math.ceil(totalUsers / 20);
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

function updateUserCounts() {
    try {
        // Load summary data
        fetchUsersSummary().then(summary => {
            const officeCount = summary.find(s => s.work_location === 'office')?.count || 0;
            const workshopCount = summary.find(s => s.work_location === 'workshop')?.count || 0;
            const totalCount = officeCount + workshopCount;
            
            // Count active teams
            const teams = new Set(users.map(user => user.team_label).filter(Boolean));
            const activeTeamsCount = teams.size;
            
            // Update statistics cards using the component
            if (usersStats) {
                usersStats.updateValues({
                    0: totalCount.toString(),
                    1: officeCount.toString(),
                    2: workshopCount.toString(),
                    3: activeTeamsCount.toString()
                });
            }
        });
    } catch (error) {
        console.error('Error updating user counts:', error);
    }
}

function updateTeamFilterOptions() {
    if (!userFilters) return;
    
    const teams = [...new Set(users.map(user => user.team_label).filter(Boolean))].sort();
    const teamOptions = [
        { value: '', label: 'Tüm Takımlar' },
        ...teams.map(team => ({ value: team, label: team }))
    ];
    
    userFilters.updateFilterOptions('team-filter', teamOptions);
    
    // Also update occupation filter options
    const occupations = [...new Set(users.map(user => user.occupation_label).filter(Boolean))].sort();
    const occupationOptions = [
        { value: '', label: 'Tüm Görevler' },
        ...occupations.map(occupation => ({ value: occupation, label: occupation }))
    ];
    
    userFilters.updateFilterOptions('occupation-filter', occupationOptions);
}

function initializeSortableHeaders() {
    const sortableHeaders = document.querySelectorAll('.sortable');
    sortableHeaders.forEach(header => {
        header.addEventListener('click', () => {
            const field = header.getAttribute('data-field');
            handleColumnSort(field);
        });
    });
    
    // Set initial sort indicator
    const initialHeader = document.querySelector(`[data-field="${currentSortField}"]`);
    if (initialHeader) {
        initialHeader.classList.add(`sort-${currentSortDirection}`);
    }
}

function handleColumnSort(field) {
    // Clear previous sort indicators
    document.querySelectorAll('.sortable').forEach(header => {
        header.classList.remove('sort-asc', 'sort-desc');
    });
    
    // Determine sort direction
    if (currentSortField === field) {
        // Toggle direction if same field
        currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        // New field, start with ascending
        currentSortField = field;
        currentSortDirection = 'asc';
    }
    
    // Update current ordering
    currentOrdering = currentSortDirection === 'asc' ? field : `-${field}`;
    
    // Update sort indicator
    const header = document.querySelector(`[data-field="${field}"]`);
    if (header) {
        header.classList.add(`sort-${currentSortDirection}`);
    }
    
    // Reload users with new sorting
    loadUsers(1);
}

function setupEventListeners() {
    // Refresh button
    document.getElementById('refresh-users')?.addEventListener('click', () => {
        loadUsers(currentPage);
    });
    
    // Export button
    document.getElementById('export-users')?.addEventListener('click', () => {
        exportUsers();
    });
    
         // Save user button
     document.getElementById('save-user-btn')?.addEventListener('click', () => {
         saveUser();
     });
     
     // Update user button
     document.getElementById('update-user-btn')?.addEventListener('click', () => {
         updateUser();
     });
    
    // Confirm delete button
    document.getElementById('confirm-delete-user-btn')?.addEventListener('click', async () => {
        const userId = window.pendingDeleteUserId;
        if (!userId) return;
        
        try {
            const response = await deleteUserAPI(userId);
            
            if (response.ok) {
                showNotification('Çalışan silindi', 'success');
                // Hide the modal
                bootstrap.Modal.getInstance(document.getElementById('deleteUserConfirmModal')).hide();
                // Clear the pending delete key
                window.pendingDeleteUserId = null;
                // Reload users
                loadUsers(currentPage);
            } else {
                throw new Error('Failed to delete user');
            }
        } catch (error) {
            console.error('Error deleting user:', error);
            showNotification('Çalışan silinirken hata oluştu', 'error');
        }
    });
}

// Global functions for pagination and actions
window.changePage = function(page) {
    if (page >= 1 && page <= Math.ceil(totalUsers / 20)) {
        loadUsers(page);
    }
};

 window.editUser = function(userId) {
     // Check if userId is valid
     if (!userId || userId === '') {
         showNotification('Geçersiz çalışan ID', 'error');
         return;
     }
     
     // Find the user data - convert userId to string for comparison
     const user = users.find(u => String(u.id) === String(userId));
     if (!user) {
         showNotification('Çalışan bulunamadı', 'error');
         return;
     }
     
     // Store the user ID for update
     window.editingUserId = userId;
     
     // Populate the edit form
     document.getElementById('edit-user-username').value = user.username || '';
     document.getElementById('edit-user-email').value = user.email || '';
     document.getElementById('edit-user-first-name').value = user.first_name || '';
     document.getElementById('edit-user-last-name').value = user.last_name || '';
     document.getElementById('edit-user-team').value = user.team || '';
     document.getElementById('edit-user-work-location').value = user.work_location || '';
     
     // Show the edit modal
     const modal = new bootstrap.Modal(document.getElementById('editUserModal'));
     modal.show();
 };

window.deleteUser = function(userId, username) {
    window.pendingDeleteUserId = userId;
    document.getElementById('delete-user-name').textContent = username;
    
    const modal = new bootstrap.Modal(document.getElementById('deleteUserConfirmModal'));
    modal.show();
};

function showCreateUserModal() {
    const modal = new bootstrap.Modal(document.getElementById('createUserModal'));
    modal.show();
}

function showBulkCreateUserModal() {
    const modal = new bootstrap.Modal(document.getElementById('bulkCreateUserModal'));
    modal.show();
}

async function saveUser() {
    const form = document.getElementById('create-user-form');
    const formData = new FormData(form);
    
    const userData = {
        username: document.getElementById('user-username').value,
        email: document.getElementById('user-email').value,
        first_name: document.getElementById('user-first-name').value,
        last_name: document.getElementById('user-last-name').value,
        team: document.getElementById('user-team').value,
        work_location: document.getElementById('user-work-location').value
    };
    
    try {
        const response = await createUserAPI(userData);
        
        if (response.ok) {
            showNotification('Çalışan başarıyla oluşturuldu', 'success');
            
            // Hide modal
            bootstrap.Modal.getInstance(document.getElementById('createUserModal')).hide();
            
            // Reset form
            form.reset();
            
            // Reload users
            loadUsers(1);
        } else {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Çalışan oluşturulamadı');
        }
         } catch (error) {
         console.error('Error creating user:', error);
         showNotification(error.message || 'Çalışan oluşturulurken hata oluştu', 'error');
     }
 }
 
 async function updateUser() {
     const userId = window.editingUserId;
     if (!userId) {
         showNotification('Düzenlenecek çalışan bulunamadı', 'error');
         return;
     }
     
     const userData = {
         username: document.getElementById('edit-user-username').value,
         email: document.getElementById('edit-user-email').value,
         first_name: document.getElementById('edit-user-first-name').value,
         last_name: document.getElementById('edit-user-last-name').value,
         team: document.getElementById('edit-user-team').value,
         work_location: document.getElementById('edit-user-work-location').value
     };
     
     try {
         const response = await updateUserAPI(userId, userData);
         
         if (response.ok) {
             showNotification('Çalışan başarıyla güncellendi', 'success');
             
             // Hide modal
             bootstrap.Modal.getInstance(document.getElementById('editUserModal')).hide();
             
             // Clear the editing user ID
             window.editingUserId = null;
             
             // Reload users
             loadUsers(currentPage);
         } else {
             const errorData = await response.json();
             throw new Error(errorData.message || 'Çalışan güncellenemedi');
         }
     } catch (error) {
         console.error('Error updating user:', error);
         showNotification(error.message || 'Çalışan güncellenirken hata oluştu', 'error');
     }
 }

function exportUsers() {
    if (users.length === 0) {
        showNotification('Dışa aktarılacak çalışan bulunamadı', 'warning');
        return;
    }
    
    try {
                 // Prepare data for Excel
         const headers = [
             'Kullanıcı Adı',
             'Ad',
             'Soyad',
             'E-posta',
             'Takım',
             'Görev',
             'Çalışma Yeri'
         ];
        
                 // Convert users to worksheet data
         const worksheetData = [
             headers,
             ...users.map(user => [
                 user.username || '',
                 user.first_name || '',
                 user.last_name || '',
                 user.email || '',
                 user.team_label || '',
                 user.occupation_label || '',
                 user.work_location_label || ''
             ])
         ];
        
        // Create workbook and worksheet
        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
        
                 // Set column widths for better readability
         const columnWidths = [
             { wch: 15 }, // Kullanıcı Adı
             { wch: 15 }, // Ad
             { wch: 15 }, // Soyad
             { wch: 25 }, // E-posta
             { wch: 15 }, // Takım
             { wch: 15 }, // Görev
             { wch: 15 }  // Çalışma Yeri
         ];
        worksheet['!cols'] = columnWidths;
        
        // Add worksheet to workbook
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Çalışanlar');
        
        // Generate Excel file
        const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        
        // Create download link
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `calisanlar_${new Date().toISOString().split('T')[0]}.xlsx`;
        link.click();
        
        showNotification('Çalışanlar başarıyla dışa aktarıldı', 'success');
    } catch (error) {
        console.error('Error exporting users:', error);
        showNotification('Dışa aktarma sırasında hata oluştu', 'error');
    }
}

// Helper function for notifications
function showNotification(message, type = 'info') {
    // You can implement your own notification system here
    console.log(`${type.toUpperCase()}: ${message}`);
    
    // Simple alert for now
    alert(`${type.toUpperCase()}: ${message}`);
} 

// Loading state functions
function showLoadingState() {
    const tableBody = document.getElementById('users-table-body');
    if (tableBody) {
        // Create loading rows that maintain table structure
        const loadingRows = [];
        for (let i = 0; i < 5; i++) { // Show 5 loading rows
            loadingRows.push(`
                <tr class="loading-row">
                    <td><div class="loading-skeleton" style="width: 120px;"></div></td>
                    <td><div class="loading-skeleton" style="width: 100px;"></div></td>
                    <td><div class="loading-skeleton" style="width: 100px;"></div></td>
                    <td><div class="loading-skeleton" style="width: 150px;"></div></td>
                    <td><div class="loading-skeleton" style="width: 100px;"></div></td>
                    <td><div class="loading-skeleton" style="width: 100px;"></div></td>
                    <td><div class="loading-skeleton" style="width: 100px;"></div></td>
                    <td><div class="loading-skeleton" style="width: 120px;"></div></td>
                </tr>
            `);
        }
        tableBody.innerHTML = loadingRows.join('');
    }
}

function hideLoadingState() {
    // Loading state is cleared when table is rendered
} 