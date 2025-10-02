import { initNavbar } from '../../components/navbar.js';
import { ModernDropdown } from '../../components/dropdown.js';
import { authFetchUsers, deleteUser as deleteUserAPI, createUser as createUserAPI, updateUser as updateUserAPI, fetchTeams, fetchOccupations } from '../../apis/users.js';
import { fetchUsersSummary } from '../../apis/summaries.js';
import { HeaderComponent } from '../../components/header/header.js';
import { FiltersComponent } from '../../components/filters/filters.js';
import { StatisticsCards } from '../../components/statistics-cards/statistics-cards.js';
import { TableComponent } from '../../components/table/table.js';
import { initRouteProtection } from '../../apis/routeProtection.js';

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
let teams = []; // Store teams data for filters
let occupations = []; // Store occupations data for filters
let usersTable = null; // Table component instance

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize route protection
    if (!initRouteProtection()) {
        return;
    }

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
        initializeTableComponent();
        
        await loadTeams();
        await loadOccupations();
        
        // Update filter options with the loaded teams and occupations data
        updateTeamFilterOptions();
        
        await loadUsers();
        updateUserCounts();
    } catch (error) {
        console.error('Error initializing users:', error);
        showNotification('Çalışanlar yüklenirken hata oluştu', 'error');
    }
}

function initializeTableComponent() {
    usersTable = new TableComponent('users-table-container', {
        title: 'Çalışan Listesi',
        columns: [
            {
                field: 'id',
                label: 'ID',
                sortable: true,
                formatter: (value) => value || '-'
            },
            {
                field: 'username',
                label: 'Kullanıcı Adı',
                sortable: true,
                formatter: (value) => `<strong>${value || '-'}</strong>`
            },
            {
                field: 'first_name',
                label: 'Ad',
                sortable: true,
                formatter: (value) => value || '-'
            },
            {
                field: 'last_name',
                label: 'Soyad',
                sortable: true,
                formatter: (value) => value || '-'
            },
            {
                field: 'email',
                label: 'E-posta',
                sortable: true,
                formatter: (value) => value || '-'
            },
            {
                field: 'team_label',
                label: 'Takım',
                sortable: true,
                formatter: (value) => value || '-'
            },
            {
                field: 'occupation_label',
                label: 'Görev',
                sortable: true,
                formatter: (value) => value || '-'
            },
            {
                field: 'work_location_label',
                label: 'Çalışma Yeri',
                sortable: true,
                formatter: (value) => value || '-'
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
            // Reset to first page when refreshing
            currentPage = 1;
            await loadUsers();
        },
        onExport: (format) => {
            exportUsers(format);
        },
        onSort: async (field, direction) => {
            // Reset to first page when sorting
            currentPage = 1;
            currentSortField = field;
            currentSortDirection = direction;
            await loadUsers();
        },
        onPageChange: async (page) => {
            currentPage = page;
            await loadUsers();
        },
        actions: [
            {
                key: 'edit',
                label: 'Düzenle',
                icon: 'fas fa-edit',
                class: 'btn-outline-primary',
                onClick: (row) => {
                    editUser(row.id);
                }
            },
            {
                key: 'delete',
                label: 'Sil',
                icon: 'fas fa-trash',
                class: 'btn-outline-danger',
                onClick: (row) => deleteUser(row.id, row.username)
            }
        ],
        emptyMessage: 'Çalışan bulunamadı',
        emptyIcon: 'fas fa-users'
    });
}

async function loadTeams() {
    try {
        const teamsData = await fetchTeams();
        teams = teamsData; // Store teams globally
        
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
        const occupationsData = await fetchOccupations();
        occupations = occupationsData; // Store occupations globally
        
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
            // Reset to first page when applying filters
            currentPage = 1;
            loadUsers();
        },
        onClear: () => {
            // Reset to first page when clearing filters
            currentPage = 1;
            loadUsers();
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

async function loadUsers() {
    console.log('loadUsers called, currentPage:', currentPage);
    
    try {
        if (isLoading) return;
        
        isLoading = true;
        if (usersTable) {
            console.log('Setting table loading state to true');
            usersTable.setLoading(true);
        }
        
        // Get filter values
        const filterValues = userFilters ? userFilters.getFilterValues() : {};
        console.log('Filter values:', filterValues);
        
        // Build query parameters
        const params = new URLSearchParams();
        params.append('page', currentPage.toString());
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
        
        console.log('Calling authFetchUsers with params:', {
            page: currentPage,
            pageSize: 20,
            filters: filterValues,
            ordering: orderingParam
        });
        
        const usersResponse = await authFetchUsers(currentPage, 20, {
            username: filterValues['username-filter'] || '',
            team: filterValues['team-filter'] || '',
            work_location: filterValues['work-location-filter'] || '',
            occupation: filterValues['occupation-filter'] || '',
            ordering: orderingParam
        });
        
        console.log('API response:', usersResponse);
        
        // Extract users and total count from response
        users = usersResponse.results || usersResponse || [];
        totalUsers = usersResponse.count || usersResponse.total || users.length;
        
        console.log('Extracted data:', { users: users.length, totalUsers });
        
        // Update table data with pagination info
        if (usersTable) {
            console.log('Updating table with data:', { users: users.length, totalUsers, currentPage });
            usersTable.updateData(users, totalUsers, currentPage);
        } else {
            console.warn('usersTable is null, cannot update data');
        }
        
        updateUserCounts();
        
        // Update team filter options
        updateTeamFilterOptions();
        
    } catch (error) {
        console.error('Error loading users:', error);
        showNotification('Çalışanlar yüklenirken hata oluştu', 'error');
        users = [];
        totalUsers = 0;
        if (usersTable) {
            usersTable.updateData([], 0, currentPage);
        }
    } finally {
        isLoading = false;
        if (usersTable) {
            console.log('Setting table loading state to false');
            usersTable.setLoading(false);
        }
    }
}

// Table rendering is now handled by TableComponent

// Pagination is now handled by TableComponent

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
    
    // Use the stored teams data from API instead of extracting from user data
    const teamOptions = [
        { value: '', label: 'Tüm Takımlar' },
        ...teams.map(team => ({ 
            value: team.value || team.id, 
            label: team.label || team.name 
        }))
    ];
    
    userFilters.updateFilterOptions('team-filter', teamOptions);
    
    // Also update occupation filter options using stored occupations data
    const occupationOptions = [
        { value: '', label: 'Tüm Görevler' },
        ...occupations.map(occupation => ({ 
            value: occupation.value || occupation.id, 
            label: occupation.label || occupation.name 
        }))
    ];
    
    userFilters.updateFilterOptions('occupation-filter', occupationOptions);
}

// Sorting is now handled by TableComponent

function setupEventListeners() {
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
                bootstrap.Modal.getOrCreateInstance(document.getElementById('deleteUserConfirmModal')).hide();
                // Clear the pending delete key
                window.pendingDeleteUserId = null;
                // Reload users
                loadUsers();
            } else {
                throw new Error('Failed to delete user');
            }
        } catch (error) {
            console.error('Error deleting user:', error);
            showNotification('Çalışan silinirken hata oluştu', 'error');
        }
    });
}

// Global functions for actions

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
     const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('editUserModal'));
     modal.show();
 };

window.deleteUser = function(userId, username) {
    window.pendingDeleteUserId = userId;
    document.getElementById('delete-user-name').textContent = username;
    
    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('deleteUserConfirmModal'));
    modal.show();
};

function showCreateUserModal() {
    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('createUserModal'));
    modal.show();
}

function showBulkCreateUserModal() {
    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('bulkCreateUserModal'));
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
            
            // Hide modal
            bootstrap.Modal.getOrCreateInstance(document.getElementById('createUserModal')).hide();
            
            // Reset form
            form.reset();
            
                         // Reload users
             currentPage = 1;
             loadUsers();
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
             bootstrap.Modal.getOrCreateInstance(document.getElementById('editUserModal')).hide();
             
             // Clear the editing user ID
             window.editingUserId = null;
             
             // Reload users
             loadUsers();
         } else {
             const errorData = await response.json();
             throw new Error(errorData.message || 'Çalışan güncellenemedi');
         }
     } catch (error) {
         console.error('Error updating user:', error);
         showNotification(error.message || 'Çalışan güncellenirken hata oluştu', 'error');
     }
 }

async function exportUsers(format) {
    try {
        // Show loading message
        const exportBtn = document.querySelector('#users-table-container-export');
        if (exportBtn) {
            exportBtn.disabled = true;
            exportBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Dışa Aktarılıyor...';
        }
        
        // Get filter values
        const filterValues = userFilters ? userFilters.getFilterValues() : {};
        
        // Fetch all users for export (use a large page size)
        const usersResponse = await authFetchUsers(1, 10000, {
            username: filterValues['username-filter'] || '',
            team: filterValues['team-filter'] || '',
            work_location: filterValues['work-location-filter'] || '',
            occupation: filterValues['occupation-filter'] || '',
            ordering: currentSortDirection === 'asc' ? currentSortField : `-${currentSortField}`
        });
        
        const allUsers = usersResponse.results || usersResponse || [];
        
        if (allUsers.length === 0) {
            alert('Dışa aktarılacak çalışan bulunamadı');
            return;
        }
        
        // Prepare data for export (match visible columns)
        const headers = [
            'ID',
            'Kullanıcı Adı',
            'Ad',
            'Soyad',
            'E-posta',
            'Takım',
            'Görev',
            'Çalışma Yeri'
        ];
        
        const exportData = [
            headers,
            ...allUsers.map(user => [
                user.id ?? '',
                user.username || '',
                user.first_name || '',
                user.last_name || '',
                user.email || '',
                user.team_label || '',
                user.occupation_label || '',
                user.work_location_label || ''
            ])
        ];
        
        // Export based on format
        if (format === 'csv') {
            exportToCSV(exportData, 'calisanlar');
        } else if (format === 'excel') {
            exportToExcel(exportData, 'calisanlar');
        }
        
    } catch (error) {
        // Error exporting users
        alert('Dışa aktarma sırasında hata oluştu');
        console.error('Export error:', error);
    } finally {
        // Reset export button
        const exportBtn = document.querySelector('#users-table-container-export');
        if (exportBtn) {
            exportBtn.disabled = false;
            exportBtn.innerHTML = '<i class="fas fa-download me-1"></i>Dışa Aktar';
        }
    }
}

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

// Helper function for notifications
function showNotification(message, type = 'info') {
    // You can implement your own notification system here
    console.log(`${type.toUpperCase()}: ${message}`);
    
    // Simple alert for now
    alert(`${type.toUpperCase()}: ${message}`);
} 

// Loading state is now handled by TableComponent 