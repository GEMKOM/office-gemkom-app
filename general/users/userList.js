import { initNavbar } from '../../components/navbar.js';
import { ModernDropdown } from '../../components/dropdown/dropdown.js';
import { authFetchUsers, deleteUser as deleteUserAPI, createUser as createUserAPI, updateUser as updateUserAPI, fetchTeams, fetchOccupations } from '../../apis/users.js';
import { fetchUsersSummary } from '../../apis/summaries.js';
import { HeaderComponent } from '../../components/header/header.js';
import { FiltersComponent } from '../../components/filters/filters.js';
import { StatisticsCards } from '../../components/statistics-cards/statistics-cards.js';
import { TableComponent } from '../../components/table/table.js';
import { DisplayModal } from '../../components/display-modal/display-modal.js';
import { EditModal } from '../../components/edit-modal/edit-modal.js';
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

// Modal component instances
let createUserModal = null;
let editUserModal = null;
let deleteUserModal = null;

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
        showBulkCreateButton: 'none',
        createButtonText: '      Yeni Çalışan',
        onBackClick: () => window.location.href = '/general/',
        onCreateClick: () => showCreateUserModal()
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
        initializeModalComponents();
        
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

// Initialize modal components
function initializeModalComponents() {
    // Create User Modal
    createUserModal = new EditModal('create-user-modal-container', {
        title: 'Yeni Çalışan Oluştur',
        icon: 'fas fa-plus-circle',
        size: 'lg',
        showEditButton: false
    });

    // Edit User Modal
    editUserModal = new EditModal('edit-user-modal-container', {
        title: 'Çalışan Düzenle',
        icon: 'fas fa-edit',
        size: 'lg',
        showEditButton: false
    });

    // Delete User Modal
    deleteUserModal = new DisplayModal('delete-user-modal-container', {
        title: 'Çalışan Silme Onayı',
        icon: 'fas fa-exclamation-triangle',
        size: 'md',
        showEditButton: false
    });

    // Set up modal callbacks
    setupModalCallbacks();
}

// Set up modal callbacks
function setupModalCallbacks() {
    // Create user modal callbacks
    createUserModal.onSaveCallback(async (formData) => {
        await createUser(formData);
    });

    // Edit user modal callbacks
    editUserModal.onSaveCallback(async (formData) => {
        await updateUser(formData);
    });

    // Delete user modal callbacks
    deleteUserModal.onCloseCallback(() => {
        // Clear any pending delete data when modal is closed
        window.pendingDeleteUserId = null;
    });
}

async function loadUsers() {
    try {
        if (isLoading) return;
        
        isLoading = true;
        if (usersTable) {
            usersTable.setLoading(true);
        }
        
        // Get filter values
        const filterValues = userFilters ? userFilters.getFilterValues() : {};
        
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
        
        // Call API with parameters
        const usersResponse = await authFetchUsers(currentPage, 20, {
            username: filterValues['username-filter'] || '',
            team: filterValues['team-filter'] || '',
            work_location: filterValues['work-location-filter'] || '',
            occupation: filterValues['occupation-filter'] || '',
            ordering: orderingParam
        });
        
        // Extract users and total count from response
        users = usersResponse.results || usersResponse || [];
        totalUsers = usersResponse.count || usersResponse.total || users.length;
        
        // Update table data with pagination info
        if (usersTable) {
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
    // Use event delegation for dynamically added buttons
    document.addEventListener('click', async (e) => {
        if (e.target && e.target.id === 'confirm-delete-user-btn') {
            const userId = window.pendingDeleteUserId;
            if (!userId) return;
            
            try {
                const response = await deleteUserAPI(userId);
                
                if (response.ok) {
                    showNotification('Çalışan silindi', 'success');
                    // Hide the modal
                    deleteUserModal.hide();
                    // Clear the pending delete key
                    window.pendingDeleteUserId = null;
                    // Reload users
                    await loadUsers();
                } else {
                    throw new Error('Failed to delete user');
                }
            } catch (error) {
                console.error('Error deleting user:', error);
                showNotification('Çalışan silinirken hata oluştu', 'error');
            }
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
     
     // Ensure teams are loaded
     if (!teams || teams.length === 0) {
         showNotification('Takım verileri yükleniyor, lütfen bekleyin...', 'warning');
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
     
    // Clear and configure the edit modal
    editUserModal.clearAll();
     
     // Add Basic Information section
     editUserModal.addSection({
         title: 'Temel Bilgiler',
         icon: 'fas fa-info-circle',
         iconColor: 'text-primary'
     });

     // Add form fields with user data
     editUserModal.addField({
         id: 'username',
         name: 'username',
         label: 'Kullanıcı Adı',
         type: 'text',
         value: user.username || '',
         required: true,
         icon: 'fas fa-user',
         colSize: 6,
         helpText: 'Benzersiz kullanıcı adı'
     });

     editUserModal.addField({
         id: 'email',
         name: 'email',
         label: 'E-posta',
         type: 'email',
         value: user.email || '',
         icon: 'fas fa-envelope',
         colSize: 6,
         helpText: 'İletişim için e-posta adresi'
     });

     editUserModal.addField({
         id: 'first_name',
         name: 'first_name',
         label: 'Ad',
         type: 'text',
         value: user.first_name || '',
         required: true,
         icon: 'fas fa-id-card',
         colSize: 6,
         helpText: 'Çalışanın adı'
     });

     editUserModal.addField({
         id: 'last_name',
         name: 'last_name',
         label: 'Soyad',
         type: 'text',
         value: user.last_name || '',
         required: true,
         icon: 'fas fa-id-card',
         colSize: 6,
         helpText: 'Çalışanın soyadı'
     });

     // Add Work Information section
     editUserModal.addSection({
         title: 'İş Bilgileri',
         icon: 'fas fa-briefcase',
         iconColor: 'text-success'
     });

     
     // Add team dropdown
     editUserModal.addField({
         id: 'team',
         name: 'team',
         label: 'Takım',
         type: 'dropdown',
         value: user.team || '',
         required: true,
         icon: 'fas fa-users',
         colSize: 6,
         helpText: 'Çalışanın bağlı olduğu takım',
         options: teams.map(team => ({
             value: team.value || team.id,
             label: team.label || team.name
         }))
     });

     // Add work location dropdown
     editUserModal.addField({
         id: 'work_location',
         name: 'work_location',
         label: 'Çalışma Yeri',
         type: 'dropdown',
         value: user.work_location || '',
         required: true,
         icon: 'fas fa-map-marker-alt',
         colSize: 6,
         helpText: 'Çalışanın çalışma yeri',
         options: [
             { value: 'office', label: 'Ofis' },
             { value: 'workshop', label: 'Atölye' }
         ]
     });

     // Render and show modal
     editUserModal.render();
     editUserModal.show();
 };

window.deleteUser = function(userId, username) {
    showDeleteUserModal(userId, username);
};

// Show delete user confirmation modal
function showDeleteUserModal(userId, username) {
    // Store the user ID for deletion
    window.pendingDeleteUserId = userId;

    // Clear and configure the delete modal
    deleteUserModal.clearData();
    
    // Add warning section
    deleteUserModal.addSection({
        title: 'Silme Onayı',
        icon: 'fas fa-exclamation-triangle',
        iconColor: 'text-danger'
    });

    // Add warning message
    deleteUserModal.addField({
        id: 'delete-warning',
        name: 'warning',
        label: 'Uyarı',
        type: 'text',
        value: 'Bu çalışanı silmek istediğinize emin misiniz?',
        icon: 'fas fa-exclamation-triangle',
        colSize: 12
    });

    // Add user name
    deleteUserModal.addField({
        id: 'delete-user-name',
        name: 'user_name',
        label: 'Çalışan Adı',
        type: 'text',
        value: username,
        icon: 'fas fa-user',
        colSize: 12
    });

    // Add warning about permanent deletion
    deleteUserModal.addField({
        id: 'delete-warning-permanent',
        name: 'permanent_warning',
        label: 'Dikkat',
        type: 'text',
        value: 'Bu işlem geri alınamaz ve çalışan kalıcı olarak silinecektir.',
        icon: 'fas fa-trash',
        colSize: 12
    });

    // Render the modal first
    deleteUserModal.render();
    
    // Add custom buttons after rendering
    const modalFooter = deleteUserModal.container.querySelector('.modal-footer');
    if (modalFooter) {
        modalFooter.innerHTML = `
            <div class="d-flex justify-content-end gap-2">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                    <i class="fas fa-times me-1"></i>İptal
                </button>
                <button type="button" class="btn btn-danger" id="confirm-delete-user-btn">
                    <i class="fas fa-trash me-1"></i>Evet, Sil
                </button>
            </div>
        `;
    }

    // Show the modal
    deleteUserModal.show();
}

function showCreateUserModal() {
    // Ensure teams are loaded
    if (!teams || teams.length === 0) {
        showNotification('Takım verileri yükleniyor, lütfen bekleyin...', 'warning');
        return;
    }

    // Clear and configure the create modal
    createUserModal.clearAll();
    
    // Add Basic Information section
    createUserModal.addSection({
        title: 'Temel Bilgiler',
        icon: 'fas fa-info-circle',
        iconColor: 'text-primary'
    });

    // Add form fields
    createUserModal.addField({
        id: 'username',
        name: 'username',
        label: 'Kullanıcı Adı',
        type: 'text',
        placeholder: 'Kullanıcı adını girin',
        required: true,
        icon: 'fas fa-user',
        colSize: 6,
        helpText: 'Benzersiz kullanıcı adı'
    });

    createUserModal.addField({
        id: 'email',
        name: 'email',
        label: 'E-posta',
        type: 'email',
        placeholder: 'E-posta adresi',
        icon: 'fas fa-envelope',
        colSize: 6,
        helpText: 'İletişim için e-posta adresi'
    });

    createUserModal.addField({
        id: 'first_name',
        name: 'first_name',
        label: 'Ad',
        type: 'text',
        placeholder: 'Adını girin',
        required: true,
        icon: 'fas fa-id-card',
        colSize: 6,
        helpText: 'Çalışanın adı'
    });

    createUserModal.addField({
        id: 'last_name',
        name: 'last_name',
        label: 'Soyad',
        type: 'text',
        placeholder: 'Soyadını girin',
        required: true,
        icon: 'fas fa-id-card',
        colSize: 6,
        helpText: 'Çalışanın soyadı'
    });

    // Add Work Information section
    createUserModal.addSection({
        title: 'İş Bilgileri',
        icon: 'fas fa-briefcase',
        iconColor: 'text-success'
    });

    
    // Add team dropdown
    createUserModal.addField({
        id: 'team',
        name: 'team',
        label: 'Takım',
        type: 'dropdown',
        placeholder: 'Takım seçin...',
        required: true,
        icon: 'fas fa-users',
        colSize: 6,
        helpText: 'Çalışanın bağlı olduğu takım',
        options: teams.map(team => ({
            value: team.value || team.id,
            label: team.label || team.name
        }))
    });

    // Add work location dropdown
    createUserModal.addField({
        id: 'work_location',
        name: 'work_location',
        label: 'Çalışma Yeri',
        type: 'dropdown',
        placeholder: 'Çalışma yeri seçin...',
        required: true,
        icon: 'fas fa-map-marker-alt',
        colSize: 6,
        helpText: 'Çalışanın çalışma yeri',
        options: [
            { value: 'office', label: 'Ofis' },
            { value: 'workshop', label: 'Atölye' }
        ]
    });

    // Render and show modal
    createUserModal.render();
    createUserModal.show();
}


async function createUser(formData) {
    // This function is called by the modal's onSaveCallback
    // formData is already provided by the modal component
    
    try {
        const response = await createUserAPI(formData);
        
        if (response.ok) {
            showNotification('Çalışan başarıyla oluşturuldu', 'success');
            
            // Hide modal
            createUserModal.hide();
            
            // Reload users
            currentPage = 1;
            await loadUsers();
        } else {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Çalışan oluşturulamadı');
        }
    } catch (error) {
        console.error('Error creating user:', error);
        showNotification(error.message || 'Çalışan oluşturulurken hata oluştu', 'error');
    }
}
 
 async function updateUser(formData) {
     const userId = window.editingUserId;
     if (!userId) {
         showNotification('Düzenlenecek çalışan bulunamadı', 'error');
         return;
     }
     
     try {
         const response = await updateUserAPI(userId, formData);
         
         if (response.ok) {
             showNotification('Çalışan başarıyla güncellendi', 'success');
             
             // Hide modal
             editUserModal.hide();
             
             // Clear the editing user ID
             window.editingUserId = null;
             
             // Reload users
             await loadUsers();
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
    
    // Simple alert for now
    alert(`${type.toUpperCase()}: ${message}`);
} 

// Loading state is now handled by TableComponent 