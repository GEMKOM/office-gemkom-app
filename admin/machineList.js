import { fetchMachines } from "../generic/machines.js";
import { authedFetch } from "../authService.js";
import { backendBase } from "../base.js";
import { fetchTeams } from "../generic/users.js";
import { fetchMachineTypes } from "../generic/machines.js";

export async function showMachineList(team) {
    const mainContent = document.querySelector('.admin-main-content .container-fluid');
    if (!mainContent) return;
    mainContent.innerHTML = `
        <style>
            .machine-properties-table td.key-cell {
                padding-right: 20px;
                white-space: nowrap;
                font-weight: bold;
                width: 1%;
            }
            .machine-properties-table td.value-cell {
                padding-left: 300px;
                text-align: left;
            }
            .properties-toggle {
                cursor: pointer;
                color: #007bff;
                text-decoration: none;
            }
            .properties-toggle:hover {
                text-decoration: underline;
            }
            .properties-content {
                display: none;
                margin-top: 10px;
            }
            .properties-content.show {
                display: block;
            }
            .toggle-icon {
                margin-right: 5px;
                transition: transform 0.2s;
            }
            .toggle-icon.rotated {
                transform: rotate(90deg);
            }
            .filter-container {
                margin-bottom: 20px;
                padding: 15px;
                background-color: #f8f9fa;
                border-radius: 5px;
                border: 1px solid #dee2e6;
            }
        </style>
        
        <!-- Edit Machine Modal -->
        <div class="modal fade" id="editMachineModal" tabindex="-1" aria-labelledby="editMachineModalLabel" aria-hidden="true">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" id="editMachineModalLabel">Makine Düzenle</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body">
                        <form id="edit-machine-form">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label for="edit-machine-name" class="form-label">Makine Adı *</label>
                                    <input type="text" class="form-control" id="edit-machine-name" required>
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label for="edit-machine-type" class="form-label">Makine Tipi *</label>
                                    <select class="form-select" id="edit-machine-type" required>
                                        <option value="">Makine tipi seçiniz...</option>
                                    </select>
                                </div>
                            </div>
                            
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label for="edit-machine-used-in" class="form-label">Kullanım Alanı *</label>
                                    <select class="form-select" id="edit-machine-used-in" required>
                                        <option value="">Kullanım alanı seçiniz...</option>
                                    </select>
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label for="edit-machine-status" class="form-label">Durum</label>
                                    <select class="form-select" id="edit-machine-status">
                                        <option value="active">Aktif</option>
                                        <option value="inactive">Pasif</option>
                                    </select>
                                </div>
                            </div>
                            
                            <div class="mb-3">
                                <label for="edit-machine-description" class="form-label">Açıklama</label>
                                <textarea class="form-control" id="edit-machine-description" rows="3" placeholder="Makine hakkında açıklama..."></textarea>
                            </div>
                            
                            <div class="mb-3">
                                <label class="form-label">Özellikler</label>
                                <div id="edit-properties-container">
                                    <div class="property-row mb-2">
                                        <div class="row">
                                            <div class="col-md-5">
                                                <input type="text" class="form-control property-key" placeholder="Özellik adı">
                                            </div>
                                            <div class="col-md-5">
                                                <input type="text" class="form-control property-value" placeholder="Özellik değeri">
                                            </div>
                                            <div class="col-md-2">
                                                <button type="button" class="btn btn-danger btn-sm remove-property" style="display: none;">Sil</button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <button type="button" class="btn btn-secondary btn-sm" id="edit-add-property">
                                    <i class="bi bi-plus"></i> + Özellik Ekle
                                </button>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">İptal</button>
                        <button type="button" class="btn btn-primary" id="edit-machine-submit" style="background-color: #cc0000; border-color: #cc0000;">Güncelle</button>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="row justify-content-center machine-list">
            <div class="col-12 col-md-10">
                <div class="card">
                    <div class="card-header">
                        <h5 class="mb-0">Makine Listesi</h5>
                    </div>
                    <div class="card-body">
                        <div class="filter-container">
                            <div class="row">
                                <div class="col-md-4">
                                    <label for="used-in-filter" class="form-label">Kullanım Alanına Göre Filtrele</label>
                                    <select class="form-select" id="used-in-filter">
                                        <option value="">Tümü</option>
                                    </select>
                                </div>
                                <div class="col-md-4">
                                    <label for="status-filter" class="form-label">Duruma Göre Filtrele</label>
                                    <select class="form-select" id="status-filter">
                                        <option value="">Tümü</option>
                                        <option value="active">Aktif</option>
                                        <option value="inactive">Pasif</option>
                                    </select>
                                </div>
                                <div class="col-md-4 d-flex align-items-end">
                                    <button class="btn btn-secondary" id="clear-filters">
                                        Filtreleri Temizle
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div id="machine-list-table-container">Yükleniyor...</div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    try {
        const machines = await fetchMachines(team);
        
        // Store machines globally for filtering
        window.allMachines = machines;
        
        // Populate filter dropdowns
        populateFilterDropdowns(machines);
        
        // Render initial table
        renderMachineTable(machines);
        
        // Setup filter functionality
        setupFilterHandlers();
        
    } catch (err) {
        document.getElementById('machine-list-table-container').innerHTML = 'Bir hata oluştu.';
    }
}

function renderPropertyValue(value) {
    if (typeof value === 'boolean') {
        return value
            ? '<span style="color:green;">&#10004;</span>'
            : '<span style="color:red;">&#10008;</span>';
    }
    return value;
}

function setupPropertiesToggles() {
    const toggleButtons = document.querySelectorAll('.properties-toggle');
    
    toggleButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            
            const machineIndex = button.getAttribute('data-machine-index');
            const propertiesContent = document.getElementById(`properties-${machineIndex}`);
            const toggleIcon = button.querySelector('.toggle-icon');
            const toggleText = button.querySelector('.toggle-text');
            
            if (propertiesContent.classList.contains('show')) {
                // Collapse
                propertiesContent.classList.remove('show');
                toggleIcon.classList.remove('rotated');
                toggleText.textContent = toggleText.textContent.replace('Gizle', 'Göster');
            } else {
                // Expand
                propertiesContent.classList.add('show');
                toggleIcon.classList.add('rotated');
                toggleText.textContent = toggleText.textContent.replace('Göster', 'Gizle');
            }
        });
    });
}

function setupEditMachineButtons() {
    const editButtons = document.querySelectorAll('.edit-machine-btn');
    
    editButtons.forEach(button => {
        button.addEventListener('click', async () => {
            const machineId = button.getAttribute('data-machine-id');
            const machineData = JSON.parse(button.getAttribute('data-machine-data'));
            
            await openEditMachineModal(machineData);
        });
    });
}

async function openEditMachineModal(machineData) {
    // Fetch dropdown data
    let machineTypes = [];
    let teams = [];
    
    try {
        machineTypes = await fetchMachineTypes();
        teams = await fetchTeams();
    } catch (error) {
        console.error('Error fetching dropdown data:', error);
    }
    
    // Populate dropdowns
    const typeSelect = document.getElementById('edit-machine-type');
    const usedInSelect = document.getElementById('edit-machine-used-in');
    
    typeSelect.innerHTML = '<option value="">Makine tipi seçiniz...</option>' + 
        machineTypes.map(type => `<option value="${type.value}">${type.label}</option>`).join('');
    
    usedInSelect.innerHTML = '<option value="">Kullanım alanı seçiniz...</option>' + 
        teams.map(team => `<option value="${team.value}">${team.label}</option>`).join('');
    
            // Populate form fields
        document.getElementById('edit-machine-name').value = machineData.name || '';
        document.getElementById('edit-machine-type').value = machineData.machine_type || '';
        document.getElementById('edit-machine-used-in').value = machineData.used_in || '';
        document.getElementById('edit-machine-status').value = machineData.is_active ? 'active' : 'inactive';
        document.getElementById('edit-machine-description').value = machineData.description || '';
    
    // Populate properties
    populateEditProperties(machineData.properties || {});
    
    // Store machine ID for submission
    document.getElementById('edit-machine-submit').setAttribute('data-machine-id', machineData.id);
    
    // Setup edit form listeners
    setupEditFormListeners();
    
    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('editMachineModal'));
    modal.show();
}

function populateEditProperties(properties) {
    const container = document.getElementById('edit-properties-container');
    container.innerHTML = '';
    
    if (Object.keys(properties).length === 0) {
        // Add one empty row
        addEditPropertyRow();
    } else {
        // Add rows for each property
        Object.entries(properties).forEach(([key, value]) => {
            addEditPropertyRow(key, value);
        });
    }
    
    setupEditPropertyRowListeners();
}

function addEditPropertyRow(key = '', value = '') {
    const container = document.getElementById('edit-properties-container');
    const propertyRow = document.createElement('div');
    propertyRow.className = 'property-row mb-2';
    propertyRow.innerHTML = `
        <div class="row">
            <div class="col-md-5">
                <input type="text" class="form-control property-key" placeholder="Özellik adı" value="${key}">
            </div>
            <div class="col-md-5">
                <input type="text" class="form-control property-value" placeholder="Özellik değeri" value="${value}">
            </div>
            <div class="col-md-2">
                <button type="button" class="btn btn-danger btn-sm remove-property">Sil</button>
            </div>
        </div>
    `;
    
    container.appendChild(propertyRow);
}

function setupEditFormListeners() {
    const addPropertyBtn = document.getElementById('edit-add-property');
    const submitBtn = document.getElementById('edit-machine-submit');
    
    if (addPropertyBtn) {
        addPropertyBtn.addEventListener('click', () => {
            addEditPropertyRow();
            setupEditPropertyRowListeners();
        });
    }
    
    if (submitBtn) {
        submitBtn.addEventListener('click', handleEditMachineSubmission);
    }
}

function setupEditPropertyRowListeners() {
    const propertyRows = document.querySelectorAll('#edit-properties-container .property-row');
    
    propertyRows.forEach(row => {
        const removeBtn = row.querySelector('.remove-property');
        
        if (removeBtn) {
            removeBtn.addEventListener('click', () => {
                row.remove();
                updateEditRemoveButtons();
            });
        }
    });
    
    updateEditRemoveButtons();
}

function updateEditRemoveButtons() {
    const propertyRows = document.querySelectorAll('#edit-properties-container .property-row');
    
    propertyRows.forEach((row, index) => {
        const removeBtn = row.querySelector('.remove-property');
        const keyInput = row.querySelector('.property-key');
        const valueInput = row.querySelector('.property-value');
        
        if (removeBtn) {
            const hasContent = (keyInput && keyInput.value.trim()) || (valueInput && valueInput.value.trim());
            const shouldShow = propertyRows.length > 1 || hasContent;
            removeBtn.style.display = shouldShow ? 'block' : 'none';
        }
    });
}

async function handleEditMachineSubmission() {
    const submitBtn = document.getElementById('edit-machine-submit');
    const machineId = submitBtn.getAttribute('data-machine-id');
    const originalText = submitBtn.textContent;
    
    try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Güncelleniyor...';
        
        // Collect form data
        const formData = {
            name: document.getElementById('edit-machine-name').value.trim(),
            machine_type: document.getElementById('edit-machine-type').value,
            used_in: document.getElementById('edit-machine-used-in').value,
            is_active: document.getElementById('edit-machine-status').value === 'active',
            description: document.getElementById('edit-machine-description').value.trim(),
            properties: {}
        };
        
        // Collect properties
        const propertyRows = document.querySelectorAll('#edit-properties-container .property-row');
        propertyRows.forEach(row => {
            const keyInput = row.querySelector('.property-key');
            const valueInput = row.querySelector('.property-value');
            
            if (keyInput && valueInput && keyInput.value.trim() && valueInput.value.trim()) {
                formData.properties[keyInput.value.trim()] = valueInput.value.trim();
            }
        });
        
        // Validate required fields
        if (!formData.name || !formData.machine_type || !formData.used_in) {
            alert('Lütfen tüm zorunlu alanları doldurun.');
            return;
        }
        
        // Send PATCH request
        const response = await authedFetch(`${backendBase}/machines/${machineId}/`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        
        if (response.ok) {
            alert('Makine başarıyla güncellendi!');
            // Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('editMachineModal'));
            modal.hide();
            // Refresh the machine list
            await showMachineList(window.currentTeam);
        } else {
            const errorData = await response.json();
            alert(`Makine güncellenirken hata oluştu: ${errorData.message || 'Bilinmeyen hata'}`);
        }
    } catch (error) {
        console.error('Error updating machine:', error);
        alert('Makine güncellenirken hata oluştu.');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}

function setupDeleteMachineButtons() {
    const deleteButtons = document.querySelectorAll('.delete-machine-btn');
    
    deleteButtons.forEach(button => {
        button.addEventListener('click', async () => {
            const machineId = button.getAttribute('data-machine-id');
            const machineName = button.getAttribute('data-machine-name');
            
            await handleDeleteMachine(machineId, machineName);
        });
    });
}

async function handleDeleteMachine(machineId, machineName) {
    // Show confirmation dialog
    const confirmed = confirm(`"${machineName}" makinesini silmek istediğinizden emin misiniz?\n\nBu işlem geri alınamaz.`);
    
    if (!confirmed) {
        return;
    }
    
    try {
        // Send DELETE request
        const response = await authedFetch(`${backendBase}/machines/${machineId}/`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            alert(`"${machineName}" makinesi başarıyla silindi!`);
            // Refresh the machine list
            await showMachineList(window.currentTeam);
        } else {
            const errorData = await response.json();
            alert(`Makine silinirken hata oluştu: ${errorData.message || 'Bilinmeyen hata'}`);
        }
    } catch (error) {
        console.error('Error deleting machine:', error);
        alert('Makine silinirken hata oluştu.');
    }
}

// ============================================================================
// FILTERING FUNCTIONS
// ============================================================================

function populateFilterDropdowns(machines) {
    const usedInFilter = document.getElementById('used-in-filter');
    const statusFilter = document.getElementById('status-filter');
    
    if (usedInFilter) {
        // Get unique used_in values
        const usedInValues = [...new Set(machines.map(m => m.used_in).filter(Boolean))];
        usedInValues.sort();
        
        // Add options
        usedInValues.forEach(value => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            usedInFilter.appendChild(option);
        });
    }
}

function setupFilterHandlers() {
    const usedInFilter = document.getElementById('used-in-filter');
    const statusFilter = document.getElementById('status-filter');
    const clearFiltersBtn = document.getElementById('clear-filters');
    
    if (usedInFilter) {
        usedInFilter.addEventListener('change', applyFilters);
    }
    
    if (statusFilter) {
        statusFilter.addEventListener('change', applyFilters);
    }
    
    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', clearFilters);
    }
}

function applyFilters() {
    const usedInFilter = document.getElementById('used-in-filter');
    const statusFilter = document.getElementById('status-filter');
    
    let filteredMachines = [...window.allMachines];
    
    // Filter by used_in
    if (usedInFilter && usedInFilter.value) {
        filteredMachines = filteredMachines.filter(machine => machine.used_in === usedInFilter.value);
    }
    
    // Filter by status
    if (statusFilter && statusFilter.value) {
        const isActive = statusFilter.value === 'active';
        filteredMachines = filteredMachines.filter(machine => machine.is_active === isActive);
    }
    
    renderMachineTable(filteredMachines);
}

function clearFilters() {
    const usedInFilter = document.getElementById('used-in-filter');
    const statusFilter = document.getElementById('status-filter');
    
    if (usedInFilter) usedInFilter.value = '';
    if (statusFilter) statusFilter.value = '';
    
    renderMachineTable(window.allMachines);
}

function renderMachineTable(machines) {
    const tableHtml = `
        <table class="table table-bordered">
            <thead>
                <tr>
                    <th>Makine Adı</th>
                    <th>Makine Tipi</th>
                    <th>Kullanım Alanı</th>
                    <th>Durum</th>
                    <th>Özellikler</th>
                    <th>İşlemler</th>
                </tr>
            </thead>
            <tbody>
                ${machines.map((machine, index) => `
                    <tr>
                        <td><strong>${machine.name || ''}</strong></td>
                        <td>${machine.machine_type_label || ''}</td>
                        <td>${machine.used_in || '-'}</td>
                        <td>
                            <span class="badge ${machine.is_active ? 'bg-success' : 'bg-secondary'}">
                                ${machine.is_active ? 'Aktif' : 'Pasif'}
                            </span>
                        </td>
                        <td>
                            ${machine.properties && typeof machine.properties === 'object' && Object.keys(machine.properties).length > 0 ? `
                                <a href="#" class="properties-toggle" data-machine-index="${index}">
                                    <span class="toggle-icon">▶</span>
                                    <span class="toggle-text">Özellikleri Göster (${Object.keys(machine.properties).length})</span>
                                </a>
                                <div class="properties-content" id="properties-${index}">
                                    <table class="table table-sm mb-0 machine-properties-table">
                                        <tbody>
                                            ${Object.entries(machine.properties).map(([key, value]) => `
                                                <tr><td class="key-cell">${key}</td><td class="value-cell">${renderPropertyValue(value)}</td></tr>
                                            `).join('')}
                                        </tbody>
                                    </table>
                                </div>
                            ` : '<em>Özellik yok</em>'}
                        </td>
                        <td>
                            <div class="btn-group" role="group">
                                <button class="btn btn-primary btn-sm edit-machine-btn" data-machine-id="${machine.id}" data-machine-data='${JSON.stringify(machine)}'>
                                    <i class="bi bi-pencil"></i> Düzenle
                                </button>
                                <button class="btn btn-danger btn-sm delete-machine-btn ms-1" data-machine-id="${machine.id}" data-machine-name="${machine.name}">
                                    <i class="bi bi-trash"></i> Sil
                                </button>
                            </div>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    document.getElementById('machine-list-table-container').innerHTML = tableHtml;
    
    // Setup toggle functionality
    setupPropertiesToggles();
    
    // Setup edit functionality
    setupEditMachineButtons();
    
    // Setup delete functionality
    setupDeleteMachineButtons();
} 