// --- createMachine.js ---
// Machine creation functionality for admin panel

import { authedFetch } from '../authService.js';
import { backendBase } from '../base.js';
import { fetchTeams } from '../generic/users.js';
import { fetchMachineTypes } from '../generic/machines.js';

export async function showMachineCreateForm() {
    const mainContent = document.querySelector('.admin-main-content .container-fluid');
    if (!mainContent) return;

    // Fetch machine types and teams for dropdowns
    let machineTypes = [];
    let teams = [];
    
    try {
        machineTypes = await fetchMachineTypes();
        teams = await fetchTeams();
    } catch (error) {
        console.error('Error fetching dropdown data:', error);
    }

    const formHTML = `
        <div class="row">
            <div class="col-md-8 mx-auto">
                <div class="card">
                    <div class="card-header">
                        <h5 class="card-title mb-0">Makine Ekle</h5>
                    </div>
                    <div class="card-body">
                        <form id="machine-create-form">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label for="machine-name" class="form-label">Makine Adı *</label>
                                    <input type="text" class="form-control" id="machine-name" required>
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label for="machine-type" class="form-label">Makine Tipi *</label>
                                    <select class="form-select" id="machine-type" required>
                                        <option value="">Makine tipi seçiniz...</option>
                                        ${machineTypes.map(type => `<option value="${type.value}">${type.label}</option>`).join('')}
                                    </select>
                                </div>
                            </div>
                            
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label for="machine-used-in" class="form-label">Kullanım Alanı *</label>
                                    <select class="form-select" id="machine-used-in" required>
                                        <option value="">Kullanım alanı seçiniz...</option>
                                        ${teams.map(team => `<option value="${team.value}">${team.label}</option>`).join('')}
                                    </select>
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label for="machine-status" class="form-label">Durum</label>
                                    <select class="form-select" id="machine-status">
                                        <option value="active">Aktif</option>
                                        <option value="inactive">Pasif</option>
                                    </select>
                                </div>
                            </div>
                            
                            <div class="mb-3">
                                <label for="machine-description" class="form-label">Açıklama</label>
                                <textarea class="form-control" id="machine-description" rows="3" placeholder="Makine hakkında açıklama..."></textarea>
                            </div>
                            
                            <div class="mb-3">
                                <label class="form-label">Özellikler</label>
                                <div id="properties-container">
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
                                <button type="button" class="btn btn-secondary btn-sm" id="add-property">
                                    <i class="bi bi-plus"></i> + Özellik Ekle
                                </button>
                            </div>
                            
                            <div class="d-flex justify-content-end gap-2">
                                <button type="button" class="btn btn-secondary" onclick="history.back()">İptal</button>
                                <button type="submit" class="btn btn-primary" style="background-color: #cc0000; border-color: #cc0000;">Makine Oluştur</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    `;

    mainContent.innerHTML = formHTML;
    
    // Setup form event listeners
    setupMachineFormListeners();
}

function setupMachineFormListeners() {
    const form = document.getElementById('machine-create-form');
    const addPropertyBtn = document.getElementById('add-property');
    const propertiesContainer = document.getElementById('properties-container');
    
    if (!form || !addPropertyBtn || !propertiesContainer) return;
    
    // Add property button
    addPropertyBtn.addEventListener('click', () => {
        addPropertyRow();
    });
    
    // Form submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleMachineCreation();
    });
    
    // Setup initial property row
    setupPropertyRowListeners();
}

function addPropertyRow() {
    const propertiesContainer = document.getElementById('properties-container');
    if (!propertiesContainer) return;
    
    const propertyRow = document.createElement('div');
    propertyRow.className = 'property-row mb-2';
    propertyRow.innerHTML = `
        <div class="row">
            <div class="col-md-5">
                <input type="text" class="form-control property-key" placeholder="Özellik adı">
            </div>
            <div class="col-md-5">
                <input type="text" class="form-control property-value" placeholder="Özellik değeri">
            </div>
            <div class="col-md-2">
                <button type="button" class="btn btn-danger btn-sm remove-property">Sil</button>
            </div>
        </div>
    `;
    
    propertiesContainer.appendChild(propertyRow);
    setupPropertyRowListeners();
}

function setupPropertyRowListeners() {
    const propertyRows = document.querySelectorAll('.property-row');
    
    propertyRows.forEach(row => {
        const removeBtn = row.querySelector('.remove-property');
        const keyInput = row.querySelector('.property-key');
        const valueInput = row.querySelector('.property-value');
        
        if (removeBtn) {
            removeBtn.addEventListener('click', () => {
                row.remove();
                updateRemoveButtons();
            });
        }
        
        // Show/hide remove button based on content
        [keyInput, valueInput].forEach(input => {
            if (input) {
                input.addEventListener('input', updateRemoveButtons);
            }
        });
    });
    
    updateRemoveButtons();
}

function updateRemoveButtons() {
    const propertyRows = document.querySelectorAll('.property-row');
    const removeButtons = document.querySelectorAll('.remove-property');
    
    // Show remove button if there's more than one row or if the row has content
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

async function handleMachineCreation() {
    const form = document.getElementById('machine-create-form');
    if (!form) return;
    
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    
    try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Oluşturuluyor...';
        
        // Collect form data
        const formData = {
            name: document.getElementById('machine-name').value.trim(),
            machine_type: document.getElementById('machine-type').value,
            used_in: document.getElementById('machine-used-in').value,
            is_active: document.getElementById('machine-status').value === 'active',
            description: document.getElementById('machine-description').value.trim(),
            properties: {}
        };
        
        // Collect properties
        const propertyRows = document.querySelectorAll('.property-row');
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
        
        // Send request
        const response = await authedFetch(`${backendBase}/machines/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        
        if (response.ok) {
            alert('Makine başarıyla oluşturuldu!');
            form.reset();
            // Clear properties
            const propertiesContainer = document.getElementById('properties-container');
            if (propertiesContainer) {
                propertiesContainer.innerHTML = `
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
                `;
                setupPropertyRowListeners();
            }
        } else {
            const errorData = await response.json();
            alert(`Makine oluşturulurken hata oluştu: ${errorData.message || 'Bilinmeyen hata'}`);
        }
    } catch (error) {
        console.error('Error creating machine:', error);
        alert('Makine oluşturulurken hata oluştu.');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
} 