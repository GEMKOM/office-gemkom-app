import { initNavbar } from '../../components/navbar.js';
import { ModernDropdown } from '../../components/dropdown/dropdown.js';
import { authFetchUsers, deleteUser as deleteUserAPI, createUser as createUserAPI, updateUser as updateUserAPI, fetchOccupations, fetchUserGroups } from '../../apis/users.js';
import { fetchUsersSummary } from '../../apis/summaries.js';
import { HeaderComponent } from '../../components/header/header.js';
import { FiltersComponent } from '../../components/filters/filters.js';
import { StatisticsCards } from '../../components/statistics-cards/statistics-cards.js';
import { TableComponent } from '../../components/table/table.js';
import { DisplayModal } from '../../components/display-modal/display-modal.js';
import { EditModal } from '../../components/edit-modal/edit-modal.js';
import { initRouteProtection } from '../../apis/routeProtection.js';
import { showNotification } from '../../components/notification/notification.js';

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
let occupations = []; // Store occupations data for filters
let groups = []; // Store groups data for filters
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
        
        await loadGroups();
        await loadOccupations();
        updateOccupationFilterOptions();
        updateGroupFilterOptions();
        
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
                field: 'occupation_label',
                label: 'Görev',
                sortable: true,
                formatter: (value) => value || '-'
            },
            {
                field: 'portal',
                label: 'Portal',
                sortable: true,
                formatter: (value) => {
                    const v = (value || '').toString();
                    if (!v) return '-';
                    if (v === 'office') return '<span class="status-badge status-blue">OFİS</span>';
                    if (v === 'workshop') return '<span class="status-badge status-grey">ATÖLYE</span>';
                    return `<span class="status-badge status-grey">${v}</span>`;
                }
            },
            {
                field: 'groups',
                label: 'Gruplar',
                sortable: false,
                formatter: (value) => {
                    const arr = Array.isArray(value) ? value : [];
                    return arr.length ? arr.join(', ') : '-';
                }
            },
            {
                field: 'is_active',
                label: 'Durum',
                sortable: true,
                formatter: (value) => {
                    if (value === true) {
                        return '<span class="status-badge status-green">Aktif</span>';
                    } else if (value === false) {
                        return '<span class="status-badge status-grey">Pasif</span>';
                    }
                    return '<span class="text-muted">-</span>';
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
            // Reset to first page when refreshing
            currentPage = 1;
            await loadUsers();
        },
        onExport: async (format) => {
            await exportUsers(format);
        },
        onSort: async (field, direction) => {
            // Reset to first page when sorting
            currentPage = 1;
            currentSortField = field;
            currentSortDirection = direction;
            await loadUsers();
        },
        onPageSizeChange: async (newPageSize) => {
            // Update local variable to keep in sync
            let itemsPerPage = newPageSize;
            // Ensure table component also has the correct value (should already be set, but ensure sync)
            if (usersTable) {
                usersTable.options.itemsPerPage = newPageSize;
            }
            // Reset to page 1 and load with new page size
            currentPage = 1;
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

async function loadGroups() {
    try {
        const data = await fetchUserGroups();
        groups = Array.isArray(data) ? data : [];
    } catch (error) {
        console.error('Error loading groups:', error);
        groups = [];
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

    userFilters.addDropdownFilter({
        id: 'group-filter',
        label: 'Grup',
        placeholder: 'Tüm Gruplar',
        options: [
            { value: '', label: 'Tüm Gruplar' }
        ],
        multiple: true,
        colSize: 3
    });

    // "Çalışma Yeri" is now derived from access flags instead of a user field.
    // Ofis -> office_access=true, Atölye -> workshop_access=true
    userFilters.addDropdownFilter({
        id: 'access-filter',
        label: 'Erişim',
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

    userFilters.addDropdownFilter({
        id: 'is-active-filter',
        label: 'Durum',
        options: [
            { value: '', label: 'Tümü' },
            { value: 'true', label: 'Aktif' },
            { value: 'false', label: 'Pasif' }
        ],
        placeholder: 'Tümü',
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
        // Get page size from table component if available, otherwise use default
        // This ensures we always use the most up-to-date page size
        const pageSize = usersTable ? usersTable.options.itemsPerPage : 20;
        params.append('page_size', String(pageSize));
        
        // Add filters
        if (filterValues['username-filter']) {
            params.append('username', filterValues['username-filter']);
        }
        // group can be single or multiple. backend supports comma-separated list
        const groupVal = filterValues['group-filter'] || [];
        const group = Array.isArray(groupVal) ? groupVal.filter(Boolean).join(',') : (groupVal || '');
        if (group) params.append('group', group);

        // access filter -> office_access/workshop_access
        const access = filterValues['access-filter'] || '';
        if (access === 'office') params.append('office_access', 'true');
        if (access === 'workshop') params.append('workshop_access', 'true');

        if (filterValues['occupation-filter']) {
            params.append('occupation', filterValues['occupation-filter']);
        }
        if (filterValues['is-active-filter']) {
            params.append('is_active', filterValues['is-active-filter']);
        }
        
        // Add ordering
        const orderingParam = currentSortDirection === 'asc' ? currentSortField : `-${currentSortField}`;
        params.append('ordering', orderingParam);
        
        // Call API with parameters
        const usersResponse = await authFetchUsers(currentPage, pageSize, {
            username: filterValues['username-filter'] || '',
            group,
            office_access: access === 'office' ? 'true' : '',
            workshop_access: access === 'workshop' ? 'true' : '',
            occupation: filterValues['occupation-filter'] || '',
            is_active: filterValues['is-active-filter'] || '',
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
        
        updateOccupationFilterOptions();
        updateGroupFilterOptions();
        
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
            // New shape: { total, office, workshop }
            // Legacy shape: [{ portal/work_location, count }, ...]
            let officeCount = 0;
            let workshopCount = 0;
            let totalCount = 0;

            if (summary && typeof summary === 'object' && !Array.isArray(summary)) {
                officeCount = Number(summary.office || 0);
                workshopCount = Number(summary.workshop || 0);
                totalCount = Number(summary.total || (officeCount + workshopCount));
            } else if (Array.isArray(summary)) {
                officeCount = summary.find(s => (s.portal || s.work_location) === 'office')?.count || 0;
                workshopCount = summary.find(s => (s.portal || s.work_location) === 'workshop')?.count || 0;
                totalCount = officeCount + workshopCount;
            }
            
            // Card kept for layout; count distinct occupations instead of teams (team field removed)
            const occs = new Set(users.map(user => user.occupation_label).filter(Boolean));
            const activeTeamsCount = occs.size;
            
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

function updateOccupationFilterOptions() {
    if (!userFilters) return;
    
    // Update occupation filter options using stored occupations data
    const occupationOptions = [
        { value: '', label: 'Tüm Görevler' },
        ...occupations.map(occupation => ({ 
            value: occupation.value || occupation.id, 
            label: occupation.label || occupation.name 
        }))
    ];
    
    userFilters.updateFilterOptions('occupation-filter', occupationOptions);
}

function updateGroupFilterOptions() {
    if (!userFilters) return;

    const groupOptions = [
        { value: '', label: 'Tüm Gruplar' },
        ...(groups || []).map(g => ({
            value: g.name,
            label: g.display_name || g.name
        }))
    ];

    userFilters.updateFilterOptions('group-filter', groupOptions);
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

     // Add is_active checkbox
     editUserModal.addField({
         id: 'is_active',
         name: 'is_active',
         label: 'Aktif',
         type: 'checkbox',
         value: user.is_active !== false, // Default to true if not explicitly false
         icon: 'fas fa-check-circle',
         colSize: 12,
         helpText: 'Çalışanın aktif durumu'
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

    // Add is_active checkbox
    createUserModal.addField({
        id: 'is_active',
        name: 'is_active',
        label: 'Aktif',
        type: 'checkbox',
        value: true,
        icon: 'fas fa-check-circle',
        colSize: 12,
        helpText: 'Çalışanın aktif durumu'
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
        // Show loading state using table component's method
        if (usersTable) {
            usersTable.setExportLoading(true);
        }
        
        // Get filter values
        const filterValues = userFilters ? userFilters.getFilterValues() : {};
        
        // Fetch all users for export (use a large page size)
        const groupVal = filterValues['group-filter'] || [];
        const group = Array.isArray(groupVal) ? groupVal.filter(Boolean).join(',') : (groupVal || '');
        const access = filterValues['access-filter'] || '';

        const usersResponse = await authFetchUsers(1, 10000, {
            username: filterValues['username-filter'] || '',
            group,
            office_access: access === 'office' ? 'true' : '',
            workshop_access: access === 'workshop' ? 'true' : '',
            occupation: filterValues['occupation-filter'] || '',
            is_active: filterValues['is-active-filter'] || '',
            ordering: currentSortDirection === 'asc' ? currentSortField : `-${currentSortField}`
        });
        
        const allUsers = usersResponse.results || usersResponse || [];
        
        if (allUsers.length === 0) {
            alert('Dışa aktarılacak çalışan bulunamadı');
            return;
        }
        
        // Store current table state
        const originalData = usersTable.options.data;
        const originalTotal = usersTable.options.totalItems;
        
        // Temporarily update table with all users for export
        usersTable.options.data = allUsers;
        usersTable.options.totalItems = allUsers.length;
        
        // Use table component's export functionality
        // The table component will use its prepareExportData and exportToExcel methods
        usersTable.exportData('excel');
        
        // Restore original table state
        usersTable.options.data = originalData;
        usersTable.options.totalItems = originalTotal;
        
    } catch (error) {
        // Error exporting users
        alert('Dışa aktarma sırasında hata oluştu');
        console.error('Export error:', error);
    } finally {
        // Reset loading state using table component's method
        if (usersTable) {
            usersTable.setExportLoading(false);
        }
    }
}

// Helper function for notifications

// Loading state is now handled by TableComponent 