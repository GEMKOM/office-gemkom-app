import { guardRoute } from '../../authService.js';
import { initNavbar } from '../../components/navbar.js';
import { fetchUsers, fetchOccupations, authFetchUsers, fetchTeams, deleteUser } from '../../generic/users.js';
import { authedFetch } from '../../authService.js';
import { backendBase } from '../../base.js';
import { HeaderComponent } from '../../components/header/header.js';
import { FiltersComponent } from '../../components/filters/filters.js';
import { StatisticsCards } from '../../components/statistics-cards/statistics-cards.js';

// Header component instance
let headerComponent;

// Statistics Cards component instance
let usersStats = null;

// Filters component instance
let userFilters = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    initNavbar();
    
    // Initialize header component
    initHeaderComponent();
    
    // Initialize Statistics Cards component
    usersStats = new StatisticsCards('users-statistics', {
        cards: [
            { title: 'Toplam Çalışan', value: '0', icon: 'fas fa-users', color: 'primary', id: 'total-users' },
            { title: 'Admin Kullanıcı', value: '0', icon: 'fas fa-user-shield', color: 'success', id: 'admin-users' },
            { title: 'Aktif Takım', value: '0', icon: 'fas fa-layer-group', color: 'info', id: 'active-teams' },
            { title: 'Departman', value: '0', icon: 'fas fa-building', color: 'warning', id: 'total-departments' }
        ],
        compact: true,
        animation: true
    });
    
    await initializeUserList();
});

// Initialize header component
function initHeaderComponent() {
    headerComponent = new HeaderComponent({
        title: 'Çalışan Listesi',
        subtitle: 'Şirket çalışanlarının yönetimi ve bilgi güncelleme',
        icon: 'users',
        showCreateButton: 'block',
        showBulkCreateButton: 'block',
        showRefreshButton: 'block',
        createButtonText: 'Yeni Çalışan',
        bulkCreateButtonText: 'Toplu Oluştur',
        refreshButtonText: 'Yenile',
        onCreateClick: () => {
            const modal = new bootstrap.Modal(document.getElementById('createUserModal'));
            modal.show();
        },
        onBulkCreateClick: () => {
            const modal = new bootstrap.Modal(document.getElementById('bulkCreateUserModal'));
            modal.show();
        },
        onRefreshClick: async () => {
            const button = document.getElementById('refresh-btn');
            const originalText = button.innerHTML;
            button.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Yenileniyor...';
            button.disabled = true;
            
            try {
                await loadUserData();
            } catch (error) {
                console.error('Error refreshing users:', error);
            } finally {
                button.innerHTML = originalText;
                button.disabled = false;
            }
        }
    });
}

async function initializeUserList() {
    try {
        // Initialize filters component
        initializeFiltersComponent();
        
        // Load initial data
        await loadUserData();
        
        // Add event listeners
        setupEventListeners();
        
        // Initialize user creation functionality
        await initializeUserCreation();
        
        // Setup delete confirmation
        setupDeleteConfirmation();
        
    } catch (error) {
        console.error('Error initializing user list:', error);
        showError('Kullanıcı listesi yüklenirken hata oluştu.');
    }
}

function initializeFiltersComponent() {
    // Initialize filters component
    userFilters = new FiltersComponent('filters-placeholder', {
        title: 'Çalışan Filtreleri',
        onApply: (values) => {
            // Apply filters and filter users
            filterUsers();
        },
        onClear: () => {
            // Clear filters and show all users
            clearFilters();
            showNotification('Filtreler temizlendi', 'info');
        },
        onFilterChange: (filterId, value) => {
            // Optional: Handle individual filter changes
            console.log(`Filter ${filterId} changed to:`, value);
        }
    });

    // Add text filter for employee name
    userFilters.addTextFilter({
        id: 'search-users',
        label: 'Çalışan Adı',
        placeholder: 'Çalışan ara...',
        colSize: 2
    });

    // Add dropdown filter for team
    userFilters.addDropdownFilter({
        id: 'filter-team',
        label: 'Takım',
        options: [
            { value: '', label: 'Tüm Takımlar' }
        ],
        placeholder: 'Tüm Takımlar',
        colSize: 2
    });

    // Add dropdown filter for role
    userFilters.addDropdownFilter({
        id: 'filter-role',
        label: 'Rol',
        options: [
            { value: '', label: 'Tüm Roller' },
            { value: 'admin', label: 'Admin' },
            { value: 'user', label: 'Kullanıcı' }
        ],
        placeholder: 'Tüm Roller',
        colSize: 2
    });

    // Add dropdown filter for work location
    userFilters.addDropdownFilter({
        id: 'filter-work-location',
        label: 'Çalışma Yeri',
        options: [
            { value: '', label: 'Tüm Yerler' },
            { value: 'office', label: 'Ofis' },
            { value: 'workshop', label: 'Atölye' }
        ],
        placeholder: 'Tüm Yerler',
        colSize: 2
    });

    // Add dropdown filter for department
    userFilters.addDropdownFilter({
        id: 'filter-department',
        label: 'Departman',
        options: [
            { value: '', label: 'Tüm Departmanlar' }
        ],
        placeholder: 'Tüm Departmanlar',
        colSize: 2
    });
}

async function loadUserData() {
    try {
        const users = await authFetchUsers();
        const occupations = await fetchOccupations();
        
        // Update statistics
        updateStatistics(users);
        
        // Update filters
        updateFilters(users);
        
        // Render user table
        renderUserTable(users, occupations);
        
    } catch (error) {
        console.error('Error loading user data:', error);
        showError('Kullanıcı verileri yüklenemedi.');
    }
}

function updateStatistics(users) {
    const totalUsers = users.length;
    const adminUsers = users.filter(user => user.is_admin || user.is_superuser).length;
    const teams = new Set(users.map(user => user.team_label).filter(Boolean));
    const departments = new Set(users.map(user => user.occupation_label).filter(Boolean));
    
    // Update statistics cards using the component
    if (usersStats) {
        usersStats.updateValues({
            0: totalUsers.toString(),
            1: adminUsers.toString(),
            2: teams.size.toString(),
            3: departments.size.toString()
        });
    }
}

function updateFilters(users) {
    const teams = [...new Set(users.map(user => user.team_label).filter(Boolean))].sort();
    const departments = [...new Set(users.map(user => user.occupation_label).filter(Boolean))].sort();
    
    // Update team filter options
    const teamOptions = [
        { value: '', label: 'Tüm Takımlar' },
        ...teams.map(team => ({ value: team, label: team }))
    ];
    userFilters.updateFilterOptions('filter-team', teamOptions);
    
    // Update department filter options
    const departmentOptions = [
        { value: '', label: 'Tüm Departmanlar' },
        ...departments.map(department => ({ value: department, label: department }))
    ];
    userFilters.updateFilterOptions('filter-department', departmentOptions);
}

function renderUserTable(users, occupations) {
    const container = document.getElementById('user-list-table-container');
    
    // Group users by team
    const usersByTeam = {};
    users.forEach(user => {
        const teamName = user.team_label || 'Takım Belirtilmemiş';
        if (!usersByTeam[teamName]) {
            usersByTeam[teamName] = [];
        }
        usersByTeam[teamName].push(user);
    });
    
    // Sort teams alphabetically
    const sortedTeams = Object.keys(usersByTeam).sort();
    
    const tableHtml = `
        <div class="table-responsive">
            <table class="table table-bordered table-hover">
                <thead class="table-dark">
                    <tr>
                        <th style="width: 30px;"></th>
                        <th>Kullanıcı Adı</th>
                        <th>Ad</th>
                        <th>Soyad</th>
                        <th>E-posta</th>
                        <th>Takım</th>
                        <th style="text-align:center;">Admin</th>
                                                         <th>Görev</th>
                                 <th>Çalışma Yeri</th>
                                 <th style="text-align:center;">İşlemler</th>
                    </tr>
                </thead>
                <tbody>
                    ${sortedTeams.map((teamName, teamIndex) => `
                        <tr class="team-header-row" data-team="${teamName}">
                            <td style="text-align: center;">
                                <button class="team-toggle-btn" data-team="${teamName}" aria-label="Aç/Kapat">
                                    <span class="team-toggle-icon" data-team="${teamName}">&#8250;</span>
                                </button>
                            </td>
                            <td colspan="9" style="text-align: left;">
                                <i class="fas fa-users me-2"></i>
                                <span class="team-name">${teamName}</span>
                                <span class="team-count">(${usersByTeam[teamName].length} kullanıcı)</span>
                            </td>
                        </tr>
                        ${usersByTeam[teamName].map(user => `
                            <tr class="team-member-row" data-team="${teamName}" style="display: none;">
                                <td></td>
                                <td><strong>${user.username || ''}</strong></td>
                                <td class="editable-cell" data-user-id="${user.id}" data-field="first_name" data-type="text" data-value="${user.first_name || ''}" style="cursor:pointer;">
                                    ${user.first_name || ''}
                                </td>
                                <td class="editable-cell" data-user-id="${user.id}" data-field="last_name" data-type="text" data-value="${user.last_name || ''}" style="cursor:pointer;">
                                    ${user.last_name || ''}
                                </td>
                                <td class="editable-cell" data-user-id="${user.id}" data-field="email" data-type="email" data-value="${user.email || ''}" style="cursor:pointer;">
                                    ${user.email || ''}
                                </td>
                                <td>${user.team_label || 'Atanmamış'}</td>
                                <td style="text-align:center; font-size:1.3em;">
                                    ${user.is_admin || user.is_superuser
                                        ? '<span class="user-status-admin" title="Admin"><i class="fas fa-crown"></i></span>'
                                        : '<span class="user-status-user" title="Kullanıcı"><i class="fas fa-user"></i></span>'}
                                </td>
                                                                 <td class="editable-cell" data-user-id="${user.id}" data-field="occupation" data-type="occupation_select" data-value="${user.occupation_label || ''}" data-occupations='${JSON.stringify(occupations)}' style="cursor:pointer;">
                                     ${user.occupation_label || 'Görev belirtilmemiş'}
                                 </td>
                                                                  <td class="editable-cell" data-user-id="${user.id}" data-field="work_location" data-type="work_location_select" data-value="${user.work_location || ''}" style="cursor:pointer;">
                                     ${user.work_location_label || 'Belirtilmemiş'}
                                 </td>
                                 <td style="text-align:center;">
                                     <button class="btn btn-sm btn-outline-danger" onclick="deleteUser(${user.id}, '${user.username}')" title="Sil">
                                         <i class="fas fa-trash"></i>
                                     </button>
                                 </td>
                             </tr>
                        `).join('')}
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
    
    container.innerHTML = tableHtml;
    
    // Setup collapsible functionality
    setupCollapsibleTeams();
    
    // Setup editable cells
    setupEditableCells();
}

function setupCollapsibleTeams() {
    // Make entire team header row clickable
    document.querySelectorAll('.team-header-row').forEach(headerRow => {
        headerRow.addEventListener('click', function() {
            const teamName = this.getAttribute('data-team');
            const memberRows = document.querySelectorAll(`.team-member-row[data-team="${teamName}"]`);
            const icon = document.querySelector(`.team-toggle-icon[data-team="${teamName}"]`);
            const isOpen = icon.classList.contains('open');
            
            if (isOpen) {
                // Collapse
                icon.classList.remove('open');
                icon.innerHTML = '&#8250;';
                icon.style.transform = '';
                memberRows.forEach(row => {
                    row.style.display = 'none';
                    row.style.background = '';
                });
            } else {
                // Expand
                icon.classList.add('open');
                icon.innerHTML = '&#8250;';
                icon.style.transform = 'rotate(90deg)';
                memberRows.forEach(row => row.style.display = 'table-row');
                setTimeout(() => { 
                    memberRows.forEach(row => row.style.background = '#f6faff'); 
                }, 80);
            }
        });
    });
    
    // Prevent button clicks from triggering row click
    document.querySelectorAll('.team-toggle-btn').forEach(button => {
        button.addEventListener('click', function(e) {
            e.stopPropagation();
        });
    });
}

function setupEditableCells() {
    document.querySelectorAll('.editable-cell').forEach(cell => {
        cell.addEventListener('click', function() {
            const userId = this.getAttribute('data-user-id');
            const field = this.getAttribute('data-field');
            const type = this.getAttribute('data-type');
            const currentValue = this.getAttribute('data-value');
            
            // Don't edit if already editing
            if (this.querySelector('input, select')) return;
            
            let input;
            if (type === 'email') {
                input = document.createElement('input');
                input.type = 'email';
                input.className = 'form-control form-control-sm';
                input.value = currentValue;
                         } else if (type === 'occupation_select') {
                 input = document.createElement('select');
                 input.className = 'form-control form-control-sm';
                 
                 // Get occupations from data attribute
                 const occupationsData = this.getAttribute('data-occupations');
                 const occupations = occupationsData ? JSON.parse(occupationsData) : [];
                 
                 // Add default option
                 input.innerHTML = '<option value="">Görev Seçin</option>';
                 
                 // Add occupation options
                 occupations.forEach(occupation => {
                     const occupationValue = occupation.value || occupation;
                     const occupationLabel = occupation.label || occupation.name || occupation;
                     const selected = occupationLabel === currentValue ? 'selected' : '';
                     input.innerHTML += `<option value="${occupationValue}" ${selected}>${occupationLabel}</option>`;
                 });
             } else if (type === 'work_location_select') {
                 input = document.createElement('select');
                 input.className = 'form-control form-control-sm';
                 
                 // Add default option
                 input.innerHTML = '<option value="">Çalışma Yeri Seçin</option>';
                 
                 // Add work location options
                 const workLocations = [
                     { value: 'office', label: 'Ofis' },
                     { value: 'workshop', label: 'Atölye' }
                 ];
                 
                 workLocations.forEach(location => {
                     const selected = location.value === currentValue ? 'selected' : '';
                     input.innerHTML += `<option value="${location.value}" ${selected}>${location.label}</option>`;
                 });
             } else {
                input = document.createElement('input');
                input.type = type;
                input.className = 'form-control form-control-sm';
                input.value = currentValue;
            }
            
            // Store original content
            this.setAttribute('data-original-content', this.innerHTML);
            
            // Add editing class for visual feedback
            this.classList.add('editing');
            
            // Replace content with input
            this.innerHTML = '';
            this.appendChild(input);
            input.focus();
            
            // Handle save on Enter or blur
            const saveChanges = async () => {
                const newValue = input.value;
                if (newValue !== currentValue) {
                    // Show loading state
                    this.innerHTML = '<small class="text-muted">Kaydediliyor...</small>';
                    const success = await updateUserField(userId, field, newValue);
                    if (success) {
                        // Update the cell content with new value
                        updateUserCellContent(this, field, newValue);
                        this.removeAttribute('data-original-content');
                        this.classList.remove('editing');
                    } else {
                        // Restore original content on error
                        this.innerHTML = this.getAttribute('data-original-content');
                        this.removeAttribute('data-original-content');
                        this.classList.remove('editing');
                    }
                } else {
                    this.innerHTML = this.getAttribute('data-original-content');
                    this.removeAttribute('data-original-content');
                    this.classList.remove('editing');
                }
            };
            
            const handleKeyDown = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    saveChanges();
                } else if (e.key === 'Escape') {
                    this.innerHTML = this.getAttribute('data-original-content');
                    this.removeAttribute('data-original-content');
                    this.classList.remove('editing');
                }
            };
            
            input.addEventListener('keydown', handleKeyDown);
            input.addEventListener('blur', saveChanges);
            
                         // For select elements, save on change
             if (type === 'occupation_select' || type === 'work_location_select') {
                 input.addEventListener('change', saveChanges);
             }
        });
    });
}

async function updateUserField(userId, field, value) {
    try {
        const payload = {};
        payload[field] = value;
        
        const resp = await authedFetch(`${backendBase}/users/${userId}/`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!resp.ok) throw new Error('Güncelleme başarısız');
        
        return true; // Success
        
    } catch (err) {
        alert('Hata: ' + err.message);
        return false; // Error
    }
}

function updateUserCellContent(cell, field, value) {
    let displayValue = '';
    
    if (field === 'first_name') {
        displayValue = value || '';
    } else if (field === 'last_name') {
        displayValue = value || '';
         } else if (field === 'occupation' || field === 'occupation_label') {
         // For occupation fields, we need to find the label for the selected value
         const occupationsData = cell.getAttribute('data-occupations');
         const occupations = occupationsData ? JSON.parse(occupationsData) : [];
         
         // Find the occupation with matching value and use its label
         const selectedOccupation = occupations.find(occ => occ.value === value);
         displayValue = selectedOccupation ? selectedOccupation.label : (value || 'Görev belirtilmemiş');
     } else if (field === 'work_location') {
         // For work location fields, map the value to display label
         const workLocationMap = {
             'office': 'Ofis',
             'workshop': 'Atölye'
         };
         displayValue = workLocationMap[value] || (value || 'Belirtilmemiş');
     } else {
        displayValue = value || '';
    }
    
    cell.innerHTML = displayValue;
    cell.setAttribute('data-value', value);
}

function setupEventListeners() {
    // Event listeners are now handled by the filters component
    // No additional event listeners needed for filters
}

function filterUsers() {
    const filterValues = userFilters.getFilterValues();
    const searchTerm = filterValues['search-users'].toLowerCase();
    const selectedTeam = filterValues['filter-team'];
    const selectedRole = filterValues['filter-role'];
    const selectedWorkLocation = filterValues['filter-work-location'];
    const selectedDepartment = filterValues['filter-department'];
    
    const rows = document.querySelectorAll('.team-member-row');
    
    rows.forEach(row => {
        const username = row.querySelector('td:nth-child(2)').textContent.toLowerCase();
        const isAdmin = row.querySelector('td:nth-child(7) .user-status-admin') !== null;
        const team = row.querySelector('td:nth-child(6)').textContent;
        const workLocation = row.querySelector('td:nth-child(5)').textContent;
        const department = row.querySelector('td:nth-child(4)').textContent;
        
        const matchesSearch = username.includes(searchTerm);
        const matchesTeam = !selectedTeam || team === selectedTeam;
        const matchesRole = !selectedRole || 
            (selectedRole === 'admin' && isAdmin) || 
            (selectedRole === 'user' && !isAdmin);
        const matchesWorkLocation = !selectedWorkLocation || workLocation === selectedWorkLocation;
        const matchesDepartment = !selectedDepartment || department === selectedDepartment;
        
        if (matchesSearch && matchesTeam && matchesRole && matchesWorkLocation && matchesDepartment) {
            row.style.display = 'table-row';
        } else {
            row.style.display = 'none';
        }
    });
    
    // Update team headers visibility
    updateTeamHeadersVisibility();
}

function updateTeamHeadersVisibility() {
    const teamHeaders = document.querySelectorAll('.team-header-row');
    
    teamHeaders.forEach(header => {
        const teamName = header.getAttribute('data-team');
        const memberRows = document.querySelectorAll(`.team-member-row[data-team="${teamName}"]`);
        const visibleMembers = Array.from(memberRows).filter(row => row.style.display !== 'none');
        
        if (visibleMembers.length > 0) {
            header.style.display = 'table-row';
            // Update member count
            const countElement = header.querySelector('td:nth-child(2)');
            const originalText = countElement.innerHTML;
            const newText = originalText.replace(/\(\d+ kullanıcı\)/, `(${visibleMembers.length} kullanıcı)`);
            countElement.innerHTML = newText;
        } else {
            header.style.display = 'none';
        }
    });
}

function clearFilters() {
    // Clear all filters using the component
    userFilters.clearFilters();
    
    // Show all rows
    document.querySelectorAll('.team-member-row').forEach(row => {
        row.style.display = 'table-row';
    });
    
    // Show all team headers
    document.querySelectorAll('.team-header-row').forEach(header => {
        header.style.display = 'table-row';
    });
}

function showError(message) {
    const container = document.getElementById('user-list-table-container');
    container.innerHTML = `
        <div class="alert alert-danger" role="alert">
            <i class="fas fa-exclamation-triangle me-2"></i>
            ${message}
        </div>
    `;
}

// User Creation Functionality
async function initializeUserCreation() {
    try {
        // Load teams for dropdowns
        const teams = await fetchTeams();
        populateTeamDropdowns(teams);
        
        // Setup event listeners for user creation
        setupUserCreationEventListeners();
        
    } catch (error) {
        console.error('Error initializing user creation:', error);
    }
}

function populateTeamDropdowns(teams) {
    const singleUserTeam = document.getElementById('user-team');
    const bulkUserTeam = document.getElementById('bulk-user-team');
    
    // Clear existing options
    [singleUserTeam, bulkUserTeam].forEach(select => {
        if (select) {
            // Keep the first option
            const firstOption = select.querySelector('option[value=""]');
            select.innerHTML = '';
            if (firstOption) {
                select.appendChild(firstOption);
            }
        }
    });
    
    // Add team options
    if (teams && teams.length > 0) {
        teams.forEach(team => {
            [singleUserTeam, bulkUserTeam].forEach(select => {
                if (select) {
                    const option = document.createElement('option');
                    option.value = team.value;
                    option.textContent = team.label;
                    select.appendChild(option);
                }
            });
        });
    }
}

function setupUserCreationEventListeners() {
    
    // Save single user button
    const saveUserBtn = document.getElementById('save-user-btn');
    if (saveUserBtn) {
        saveUserBtn.addEventListener('click', handleSingleUserCreate);
    }
    
    // Save bulk users button
    const saveBulkUsersBtn = document.getElementById('save-bulk-users-btn');
    if (saveBulkUsersBtn) {
        saveBulkUsersBtn.addEventListener('click', handleBulkUserCreate);
    }
    
    // Bulk user names input - real-time preview
    const bulkUserNamesInput = document.getElementById('bulk-user-names');
    if (bulkUserNamesInput) {
        bulkUserNamesInput.addEventListener('input', updateBulkUserPreview);
    }
}

async function handleSingleUserCreate() {
    const form = document.getElementById('create-user-form');
    const formData = new FormData(form);
    
    // Get form values
    const userData = {
        username: document.getElementById('user-username').value.trim(),
        email: document.getElementById('user-email').value.trim(),
        first_name: document.getElementById('user-first-name').value.trim(),
        last_name: document.getElementById('user-last-name').value.trim(),
        team: document.getElementById('user-team').value,
        work_location: document.getElementById('user-work-location').value
    };
    
    // Validate required fields
    if (!userData.username || !userData.team || !userData.first_name || !userData.last_name || !userData.work_location) {
        showNotification('Lütfen gerekli alanları doldurun (Kullanıcı Adı, Ad, Soyad, Takım ve Çalışma Yeri)', 'error');
        return;
    }
    
    // Show loading state
    const saveBtn = document.getElementById('save-user-btn');
    const originalText = saveBtn.innerHTML;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Oluşturuluyor...';
    saveBtn.disabled = true;
    
    try {
        
        // Create user
        const response = await authedFetch(`${backendBase}/users/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData)
        });
        
        if (response.ok) {
            const result = await response.json();
            showNotification('Çalışan başarıyla oluşturuldu!', 'success');
            
            // Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('createUserModal'));
            modal.hide();
            
            // Reset form
            form.reset();
            
            // Reload user data
            await loadUserData();
            
        } else {
            const errorData = await response.json().catch(() => ({}));
            showNotification(errorData.message || 'Çalışan oluşturulamadı', 'error');
        }
        
    } catch (error) {
        console.error('Error creating user:', error);
        showNotification('Bir hata oluştu. Lütfen tekrar deneyin.', 'error');
        
    } finally {
        // Restore button state
        const saveBtn = document.getElementById('save-user-btn');
        saveBtn.innerHTML = originalText;
        saveBtn.disabled = false;
    }
}

function updateBulkUserPreview() {
    const input = document.getElementById('bulk-user-names');
    const preview = document.getElementById('bulk-user-preview');
    const counter = document.getElementById('bulk-user-count');
    
    if (!input || !preview || !counter) return;
    
    const text = input.value.trim();
    if (!text) {
        preview.innerHTML = '<em class="text-muted">Çalışan adlarını yazmaya başlayın...</em>';
        counter.textContent = '0';
        return;
    }
    
    // Parse names
    const names = text.split(/\n|,/)
        .map(name => name.trim())
        .filter(name => name.length > 0);
    
    // Update counter
    counter.textContent = names.length;
    
    // Update preview
    if (names.length > 0) {
        const previewHtml = names.map((name, index) => 
            `<div class="d-flex justify-content-between align-items-center py-1 ${index % 2 === 0 ? 'bg-white' : 'bg-light'}">
                <span><i class="fas fa-user me-2 text-primary"></i>${name}</span>
                <small class="text-muted">#${index + 1}</small>
            </div>`
        ).join('');
        preview.innerHTML = previewHtml;
    } else {
        preview.innerHTML = '<em class="text-muted">Geçerli çalışan adı bulunamadı</em>';
    }
}

async function handleBulkUserCreate() {
    const namesInput = document.getElementById('bulk-user-names');
    const teamSelect = document.getElementById('bulk-user-team');
    const workLocationSelect = document.getElementById('bulk-user-work-location');
    
    // Get and validate input
    const namesText = namesInput.value.trim();
    const team = teamSelect.value;
    const workLocation = workLocationSelect.value;
    
    if (!namesText || !team || !workLocation) {
        showNotification('Lütfen çalışan adları, takım ve çalışma yeri seçin', 'error');
        return;
    }
    
    // Parse names
    const names = namesText.split(/\n|,/)
        .map(name => name.trim())
        .filter(name => name.length > 0);
    
    if (names.length === 0) {
        showNotification('Geçerli çalışan adı bulunamadı', 'error');
        return;
    }
    
    try {
        // Show progress
        const progressContainer = document.getElementById('bulk-create-progress');
        const resultsContainer = document.getElementById('bulk-create-results');
        const progressBar = progressContainer.querySelector('.progress-bar');
        const progressText = document.getElementById('bulk-progress-text');
        const saveBtn = document.getElementById('save-bulk-users-btn');
        
        // Setup UI for processing
        progressContainer.style.display = 'block';
        resultsContainer.style.display = 'none';
        saveBtn.disabled = true;
        progressText.textContent = `0/${names.length} çalışan işleniyor...`;
        progressBar.style.width = '0%';
        
        // Prepare bulk data
        const bulkData = {
            names: names,
            team: team,
            work_location: workLocation
        };
        
        // Make API call
        const response = await authedFetch(`${backendBase}/users/admin/bulk-create-user/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bulkData)
        });
        
        // Update progress
        progressBar.style.width = '100%';
        progressText.textContent = `${names.length}/${names.length} çalışan işlendi`;
        
        if (response.ok) {
            const result = await response.json();
            
            // Show results
            displayBulkCreateResults(result, names);
            showNotification(`${names.length} çalışan başarıyla oluşturuldu!`, 'success');
            
            // Reload user data
            await loadUserData();
            
        } else {
            const errorData = await response.text();
            throw new Error(errorData);
        }
        
    } catch (error) {
        console.error('Error bulk creating users:', error);
        showNotification(`Toplu çalışan oluşturma hatası: ${error.message}`, 'error');
        
        // Hide progress
        document.getElementById('bulk-create-progress').style.display = 'none';
        
    } finally {
        // Restore button
        document.getElementById('save-bulk-users-btn').disabled = false;
    }
}

function displayBulkCreateResults(result, originalNames) {
    const resultsContainer = document.getElementById('bulk-create-results');
    const progressContainer = document.getElementById('bulk-create-progress');
    
    // Hide progress, show results
    progressContainer.style.display = 'none';
    resultsContainer.style.display = 'block';
    
    const successCount = originalNames.length;
    
    resultsContainer.innerHTML = `
        <div class="alert alert-success">
            <i class="fas fa-check-circle me-2"></i>
            <strong>İşlem Tamamlandı!</strong>
            <p class="mb-0 mt-2">${successCount} çalışan başarıyla oluşturuldu.</p>
        </div>
        
        <div class="table-responsive">
            <table class="table table-sm table-bordered">
                <thead class="table-light">
                    <tr>
                        <th>Sıra</th>
                        <th>Çalışan Adı</th>
                        <th>Takım</th>
                        <th>Çalışma Yeri</th>
                        <th>Durum</th>
                    </tr>
                </thead>
                <tbody>
                    ${originalNames.map((name, index) => `
                        <tr>
                            <td>${index + 1}</td>
                            <td><i class="fas fa-user me-2 text-primary"></i>${name}</td>
                            <td><i class="fas fa-users me-2 text-success"></i>${document.getElementById('bulk-user-team').selectedOptions[0]?.textContent || 'N/A'}</td>
                            <td><i class="fas fa-map-marker-alt me-2 text-info"></i>${document.getElementById('bulk-user-work-location').selectedOptions[0]?.textContent || 'N/A'}</td>
                            <td><span class="badge bg-success"><i class="fas fa-check me-1"></i>Oluşturuldu</span></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `alert alert-${type === 'error' ? 'danger' : type} alert-dismissible fade show position-fixed`;
    notification.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-triangle' : 'info-circle'} me-2"></i>
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    // Add to document
    document.body.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 5000);
}

// Delete User Functionality
window.deleteUser = function(userId, username) {
    // Set the pending delete user info
    window.pendingDeleteUserId = userId;
    window.pendingDeleteUsername = username;
    
    // Update the modal content
    const deleteTaskName = document.getElementById('delete-user-name');
    if (deleteTaskName) {
        deleteTaskName.textContent = username;
    }
    
    // Show the delete confirmation modal
    const deleteModal = new bootstrap.Modal(document.getElementById('deleteUserConfirmModal'));
    deleteModal.show();
};

// Handle delete confirmation
function setupDeleteConfirmation() {
    const confirmDeleteBtn = document.getElementById('confirm-delete-user-btn');
    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', async function() {
            const userId = window.pendingDeleteUserId;
            const username = window.pendingDeleteUsername;
            
            if (!userId) {
                showNotification('Silinecek kullanıcı bulunamadı', 'error');
                return;
            }
            
            try {
                // Show loading state
                this.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Siliniyor...';
                this.disabled = true;
                
                const response = await deleteUser(userId);
                
                if (response.ok) {
                    showNotification(`${username} başarıyla silindi!`, 'success');
                    
                    // Close modal
                    const modal = bootstrap.Modal.getInstance(document.getElementById('deleteUserConfirmModal'));
                    modal.hide();
                    
                    // Reload user data
                    await loadUserData();
                    
                } else {
                    const errorData = await response.json().catch(() => ({}));
                    showNotification(errorData.message || 'Kullanıcı silinemedi', 'error');
                }
                
            } catch (error) {
                console.error('Error deleting user:', error);
                showNotification('Bir hata oluştu. Lütfen tekrar deneyin.', 'error');
                
            } finally {
                // Restore button state
                this.innerHTML = '<i class="fas fa-trash me-2"></i>Evet, Sil';
                this.disabled = false;
                
                // Clear pending delete info
                window.pendingDeleteUserId = null;
                window.pendingDeleteUsername = null;
            }
        });
    }
} 