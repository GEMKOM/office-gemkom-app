import { fetchUsers, fetchOccupations } from '../generic/users.js';
import { authedFetch } from '../authService.js';
import { backendBase } from '../base.js';

export async function showUserList() {
    const mainContent = document.querySelector('.admin-main-content .container-fluid');
    if (!mainContent) return;
    mainContent.innerHTML = `
        <style>
            .editable-cell {
                position: relative;
                transition: background-color 0.2s;
            }
            .editable-cell:hover {
                background-color: #f8f9fa !important;
                border: 1px solid #007bff !important;
            }
            .editable-cell input,
            .editable-cell select {
                border: none;
                background: transparent;
                width: 100%;
                padding: 2px 4px;
                font-size: inherit;
            }
            .editable-cell input:focus,
            .editable-cell select:focus {
                outline: 2px solid #007bff;
                background: white;
            }
            .editable-cell.editing {
                background-color: #fff3cd !important;
                border: 2px solid #ffc107 !important;
            }
        </style>
        <div class="row justify-content-center user-list">
            <div class="col-12 col-md-10">
                <div class="card">
                    <div class="card-header">
                        <h5 class="mb-0">Kullanıcı Listesi</h5>
                    </div>
                    <div class="card-body">
                        <div id="user-list-table-container">Yükleniyor...</div>
                    </div>
                </div>
            </div>
        </div>
    `;
    try {
        const users = await fetchUsers();
        
        const occupations = await fetchOccupations();
        
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
            <table class="table table-bordered table-hover">
                <thead>
                    <tr>
                        <th style="width: 30px;"></th>
                        <th>Kullanıcı Adı</th>
                        <th style="text-align:center;">Admin mi?</th>
                        <th>Ad</th>
                        <th>Soyad</th>
                        <th>Görev</th>
                        <th>E-posta</th>
                    </tr>
                </thead>
                <tbody>
                    ${sortedTeams.map((teamName, teamIndex) => `
                        <tr class="team-header-row" data-team="${teamName}" style="background-color: #f8f9fa; font-weight: bold;">
                            <td style="text-align: center;">
                                <button class="team-toggle-btn" data-team="${teamName}" aria-label="Aç/Kapat">
                                    <span class="team-toggle-icon" data-team="${teamName}">&#8250;</span>
                                </button>
                            </td>
                            <td colspan="6">
                                <i class="bi bi-people-fill me-2"></i>
                                ${teamName} (${usersByTeam[teamName].length} kullanıcı)
                            </td>
                        </tr>
                        ${usersByTeam[teamName].map(user => `
                            <tr class="team-member-row" data-team="${teamName}" style="display: none;">
                                <td></td>
                                <td><strong>${user.username}</strong></td>
                                <td style="text-align:center; font-size:1.3em;">
                                    ${user.is_admin || user.is_superuser
                                        ? '<span style="color:green;" title="Admin">&#10004;</span>'
                                        : '<span style="color:red;" title="Kullanıcı">&#10008;</span>'}
                                </td>
                                <td class="editable-cell" data-user-id="${user.id}" data-field="first_name" data-type="text" data-value="${user.first_name || ''}" style="cursor:pointer;">
                                    ${user.first_name || ''}
                                </td>
                                <td class="editable-cell" data-user-id="${user.id}" data-field="last_name" data-type="text" data-value="${user.last_name || ''}" style="cursor:pointer;">
                                    ${user.last_name || ''}
                                </td>
                                <td class="editable-cell" data-user-id="${user.id}" data-field="occupation" data-type="occupation_select" data-value="${user.occupation_label || ''}" data-occupations='${JSON.stringify(occupations)}' style="cursor:pointer;">
                                    ${user.occupation_label || 'Görev belirtilmemiş'}
                                </td>
                                <td class="editable-cell" data-user-id="${user.id}" data-field="email" data-type="email" data-value="${user.email || ''}" style="cursor:pointer;">
                                    ${user.email || ''}
                                </td>
                            </tr>
                        `).join('')}
                    `).join('')}
                </tbody>
            </table>
        `;
        document.getElementById('user-list-table-container').innerHTML = tableHtml;
        
        // Add event listeners for collapsible functionality
        document.querySelectorAll('.team-toggle-btn').forEach(button => {
            button.addEventListener('click', function() {
                const teamName = this.getAttribute('data-team');
                const memberRows = document.querySelectorAll(`.team-member-row[data-team="${teamName}"]`);
                const icon = document.querySelector(`.team-toggle-icon[data-team="${teamName}"]`);
                const isOpen = icon.classList.contains('open');
                
                if (isOpen) {
                    // Collapse
                    icon.classList.remove('open');
                    icon.innerHTML = '&#8250;';
                    icon.style.transform = '';
                    memberRows.forEach(row => row.style.display = 'none');
                } else {
                    // Expand
                    icon.classList.add('open');
                    icon.innerHTML = '&#8250;';
                    icon.style.transform = 'rotate(90deg)';
                    memberRows.forEach(row => row.style.display = 'table-row');
                    setTimeout(() => { memberRows.forEach(row => row.style.background = '#f6faff'); }, 80);
                }
            });
        });

        // Add event listeners for editable cells
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
                        // Use value for the option value, label for display
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
        
    } catch (err) {
        console.error('Error loading user list:', err);
        document.getElementById('user-list-table-container').innerHTML = `Kullanıcılar yüklenemedi: ${err.message}`;
    }
}

// Function to update user field
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

// Function to update user cell content without refreshing the table
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