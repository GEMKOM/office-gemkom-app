import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { fetchUsers, fetchOccupations, authFetchUsers } from '../../../generic/users.js';
import { authedFetch } from '../../../authService.js';
import { backendBase } from '../../../base.js';

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    initNavbar();
    await initializeUserList();
});

async function initializeUserList() {
    try {
        // Load initial data
        await loadUserData();
        
        // Add event listeners
        setupEventListeners();
        
    } catch (error) {
        console.error('Error initializing user list:', error);
        showError('Kullanıcı listesi yüklenirken hata oluştu.');
    }
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
    
    document.getElementById('total-users').textContent = totalUsers;
    document.getElementById('admin-users').textContent = adminUsers;
    document.getElementById('active-teams').textContent = teams.size;
    document.getElementById('total-departments').textContent = departments.size;
}

function updateFilters(users) {
    const teamFilter = document.getElementById('filter-team');
    const teams = [...new Set(users.map(user => user.team_label).filter(Boolean))].sort();
    
    // Clear existing options except the first one
    teamFilter.innerHTML = '<option value="">Tüm Takımlar</option>';
    
    teams.forEach(team => {
        const option = document.createElement('option');
        option.value = team;
        option.textContent = team;
        teamFilter.appendChild(option);
    });
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
                            <td colspan="8" style="text-align: left;">
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
                                <td>${user.work_location_label || 'Belirtilmemiş'}</td>
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
            if (type === 'occupation_select') {
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
    } else {
        displayValue = value || '';
    }
    
    cell.innerHTML = displayValue;
    cell.setAttribute('data-value', value);
}

function setupEventListeners() {
    // Refresh button
    document.getElementById('refresh-users-btn').addEventListener('click', async () => {
        const button = document.getElementById('refresh-users-btn');
        const originalText = button.innerHTML;
        button.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Yenileniyor...';
        button.disabled = true;
        
        try {
            await loadUserData();
        } catch (error) {
            console.error('Error refreshing users:', error);
        } finally {
            button.innerHTML = originalText;
            button.disabled = false;
        }
    });
    
    // Search functionality
    document.getElementById('search-users').addEventListener('input', filterUsers);
    
    // Filter functionality
    document.getElementById('filter-team').addEventListener('change', filterUsers);
    document.getElementById('filter-role').addEventListener('change', filterUsers);
    
    // Clear filters
    document.getElementById('clear-filters').addEventListener('click', clearFilters);
}

function filterUsers() {
    const searchTerm = document.getElementById('search-users').value.toLowerCase();
    const selectedTeam = document.getElementById('filter-team').value;
    const selectedRole = document.getElementById('filter-role').value;
    
    const rows = document.querySelectorAll('.team-member-row');
    
    rows.forEach(row => {
        const username = row.querySelector('td:nth-child(2)').textContent.toLowerCase();
        const isAdmin = row.querySelector('td:nth-child(7) .user-status-admin') !== null;
        const team = row.querySelector('td:nth-child(6)').textContent;
        
        const matchesSearch = username.includes(searchTerm);
        const matchesTeam = !selectedTeam || team === selectedTeam;
        const matchesRole = !selectedRole || 
            (selectedRole === 'admin' && isAdmin) || 
            (selectedRole === 'user' && !isAdmin);
        
        if (matchesSearch && matchesTeam && matchesRole) {
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
    document.getElementById('search-users').value = '';
    document.getElementById('filter-team').value = '';
    document.getElementById('filter-role').value = '';
    
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