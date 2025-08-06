import { guardRoute } from '../../authService.js';
import { initNavbar } from '../../components/navbar.js';
import { fetchMachines, fetchMachineTypes } from '../../generic/machines.js';
import { fetchTeams } from '../../generic/users.js';
import { authedFetch } from '../../authService.js';
import { backendBase } from '../../base.js';

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    initNavbar();
    await initializeMachineList();
});

async function initializeMachineList() {
    try {
        // Load initial data
        await loadMachineData();
        
        // Add event listeners
        setupEventListeners();
        
        // Initialize machine creation functionality
        await initializeMachineCreation();
        
        // Setup delete confirmation
        setupDeleteConfirmation();
        
    } catch (error) {
        console.error('Error initializing machine list:', error);
        showError('Makine listesi yüklenirken hata oluştu.');
    }
}

async function loadMachineData() {
    try {
        const machines = await fetchMachines();
        const machineTypes = await fetchMachineTypes();
        const teams = await fetchTeams();
        
        // Update statistics
        updateStatistics(machines);
        
        // Update filters
        updateFilters(machines);
        
        // Render machine table
        renderMachineTable(machines, machineTypes);
        
    } catch (error) {
        console.error('Error loading machine data:', error);
        showError('Makine verileri yüklenemedi.');
    }
}

function updateStatistics(machines) {
    const totalMachines = machines.length;
    const activeMachines = machines.filter(machine => machine.is_active).length;
    const machineTypes = new Set(machines.map(machine => machine.machine_type_label).filter(Boolean));
    const usageAreas = new Set(machines.map(machine => machine.used_in).filter(Boolean));
    
    document.getElementById('total-machines').textContent = totalMachines;
    document.getElementById('active-machines').textContent = activeMachines;
    document.getElementById('machine-types').textContent = machineTypes.size;
    document.getElementById('usage-areas').textContent = usageAreas.size;
}

function updateFilters(machines) {
    const typeFilter = document.getElementById('filter-type');
    const usageAreaFilter = document.getElementById('filter-usage-area');
    const types = [...new Set(machines.map(machine => machine.machine_type_label).filter(Boolean))].sort();
    const usageAreas = [...new Set(machines.map(machine => machine.used_in).filter(Boolean))].sort();
    
    // Clear existing options except the first one
    typeFilter.innerHTML = '<option value="">Tüm Tipler</option>';
    usageAreaFilter.innerHTML = '<option value="">Tüm Alanlar</option>';
    
    types.forEach(type => {
        const option = document.createElement('option');
        option.value = type;
        option.textContent = type;
        typeFilter.appendChild(option);
    });
    
    usageAreas.forEach(area => {
        const option = document.createElement('option');
        option.value = area;
        option.textContent = area;
        usageAreaFilter.appendChild(option);
    });
}

function renderMachineTable(machines, machineTypes) {
    const container = document.getElementById('machine-list-table-container');
    
    // Group machines by usage area
    const machinesByArea = {};
    machines.forEach(machine => {
        const areaName = machine.used_in || 'Alan Belirtilmemiş';
        if (!machinesByArea[areaName]) {
            machinesByArea[areaName] = [];
        }
        machinesByArea[areaName].push(machine);
    });
    
    // Sort areas alphabetically
    const sortedAreas = Object.keys(machinesByArea).sort();
    
    const tableHtml = `
        <div class="table-responsive">
            <table class="table table-bordered table-hover">
                <thead class="table-dark">
                    <tr>
                        <th style="width: 30px;"></th>
                        <th>Makine Adı</th>
                        <th>Makine Tipi</th>
                        <th>Kullanım Alanı</th>
                        <th>Durum</th>
                        <th>Açıklama</th>
                        <th>Özellikler</th>
                        <th style="text-align:center;">İşlemler</th>
                    </tr>
                </thead>
                <tbody>
                    ${sortedAreas.map((areaName, areaIndex) => `
                        <tr class="team-header-row" data-area="${areaName}">
                            <td style="text-align: center;">
                                <button class="team-toggle-btn" data-area="${areaName}" aria-label="Aç/Kapat">
                                    <span class="team-toggle-icon" data-area="${areaName}">&#8250;</span>
                                </button>
                            </td>
                            <td colspan="7" style="text-align: left;">
                                <i class="fas fa-cogs me-2"></i>
                                <span class="team-name">${areaName}</span>
                                <span class="team-count">(${machinesByArea[areaName].length} makine)</span>
                            </td>
                        </tr>
                        ${machinesByArea[areaName].map(machine => `
                            <tr class="team-member-row" data-area="${areaName}" style="display: none;">
                                <td></td>
                                <td class="machine-name"><strong>${machine.name || ''}</strong></td>
                                <td class="editable-cell machine-type" data-machine-id="${machine.id}" data-field="machine_type" data-type="machine_type_select" data-value="${machine.machine_type || ''}" data-machine-types='${JSON.stringify(machineTypes)}' style="cursor:pointer;">
                                    ${machine.machine_type_label || 'Tip belirtilmemiş'}
                                </td>
                                <td class="editable-cell machine-usage-area" data-machine-id="${machine.id}" data-field="used_in" data-type="used_in_select" data-value="${machine.used_in || ''}" style="cursor:pointer;">
                                    ${machine.used_in || 'Alan belirtilmemiş'}
                                </td>
                                <td style="text-align:center; font-size:1.3em;">
                                    ${machine.is_active
                                        ? '<span class="machine-status-active" title="Aktif"><i class="fas fa-check-circle"></i></span>'
                                        : '<span class="machine-status-inactive" title="Pasif"><i class="fas fa-times-circle"></i></span>'}
                                </td>
                                <td class="editable-cell machine-department" data-machine-id="${machine.id}" data-field="description" data-type="text" data-value="${machine.description || ''}" style="cursor:pointer;">
                                    ${machine.description || 'Açıklama yok'}
                                </td>
                                <td>
                                    ${machine.properties && typeof machine.properties === 'object' && Object.keys(machine.properties).length > 0 ? `
                                        <a href="#" class="properties-toggle" data-machine-id="${machine.id}">
                                            <span class="toggle-icon">▶</span>
                                            <span class="toggle-text">Özellikleri Göster (${Object.keys(machine.properties).length})</span>
                                        </a>
                                        <div class="properties-content" id="properties-${machine.id}">
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
                                <td style="text-align:center;">
                                    <div class="action-buttons">
                                        <button class="btn btn-sm btn-outline-danger" onclick="deleteMachine(${machine.id}, '${machine.name}')" title="Sil">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </div>
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
    setupCollapsibleAreas();
    
    // Setup editable cells
    setupEditableCells();
    
    // Setup properties toggles
    setupPropertiesToggles();
}

function renderPropertyValue(value) {
    if (typeof value === 'boolean') {
        return value
            ? '<span style="color:green;">&#10004;</span>'
            : '<span style="color:red;">&#10008;</span>';
    }
    return value;
}

function setupCollapsibleAreas() {
    // Make entire area header row clickable
    document.querySelectorAll('.team-header-row').forEach(headerRow => {
        headerRow.addEventListener('click', function() {
            const areaName = this.getAttribute('data-area');
            const memberRows = document.querySelectorAll(`.team-member-row[data-area="${areaName}"]`);
            const icon = document.querySelector(`.team-toggle-icon[data-area="${areaName}"]`);
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
            const machineId = this.getAttribute('data-machine-id');
            const field = this.getAttribute('data-field');
            const type = this.getAttribute('data-type');
            const currentValue = this.getAttribute('data-value');
            
            // Don't edit if already editing
            if (this.querySelector('input, select')) return;
            
            let input;
            if (type === 'machine_type_select') {
                input = document.createElement('select');
                input.className = 'form-control form-control-sm';
                
                // Get machine types from data attribute
                const machineTypesData = this.getAttribute('data-machine-types');
                const machineTypes = machineTypesData ? JSON.parse(machineTypesData) : [];
                
                // Add default option
                input.innerHTML = '<option value="">Makine Tipi Seçin</option>';
                
                // Add machine type options
                machineTypes.forEach(type => {
                    const typeValue = type.value || type;
                    const typeLabel = type.label || type.name || type;
                    const selected = typeLabel === currentValue ? 'selected' : '';
                    input.innerHTML += `<option value="${typeValue}" ${selected}>${typeLabel}</option>`;
                });
            } else if (type === 'used_in_select') {
                input = document.createElement('select');
                input.className = 'form-control form-control-sm';
                
                // Add usage area options
                input.innerHTML = '<option value="">Kullanım Alanı Seçin</option>';
                
                // Get unique usage areas from existing machines
                const usageAreas = [...new Set(Array.from(document.querySelectorAll('.editable-cell[data-field="used_in"]'))
                    .map(cell => cell.textContent.trim())
                    .filter(area => area && area !== 'Alan belirtilmemiş'))];
                
                usageAreas.forEach(area => {
                    const selected = area === currentValue ? 'selected' : '';
                    input.innerHTML += `<option value="${area}" ${selected}>${area}</option>`;
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
                    const success = await updateMachineField(machineId, field, newValue);
                    if (success) {
                        // Update the cell content with new value
                        updateMachineCellContent(this, field, newValue);
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
            if (type === 'machine_type_select' || type === 'used_in_select') {
                input.addEventListener('change', saveChanges);
            }
        });
    });
}

function setupPropertiesToggles() {
    const toggleButtons = document.querySelectorAll('.properties-toggle');
    
    toggleButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            
            const machineId = button.getAttribute('data-machine-id');
            const propertiesContent = document.getElementById(`properties-${machineId}`);
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

async function updateMachineField(machineId, field, value) {
    try {
        const payload = {};
        payload[field] = value;
        
        const resp = await authedFetch(`${backendBase}/machines/${machineId}/`, {
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

function updateMachineCellContent(cell, field, value) {
    let displayValue = '';
    
    if (field === 'machine_type') {
        // For machine type fields, we need to find the label for the selected value
        const machineTypesData = cell.getAttribute('data-machine-types');
        const machineTypes = machineTypesData ? JSON.parse(machineTypesData) : [];
        
        // Find the machine type with matching value and use its label
        const selectedType = machineTypes.find(type => type.value === value);
        displayValue = selectedType ? selectedType.label : (value || 'Tip belirtilmemiş');
    } else if (field === 'used_in') {
        displayValue = value || 'Alan belirtilmemiş';
    } else if (field === 'description') {
        displayValue = value || 'Açıklama yok';
    } else {
        displayValue = value || '';
    }
    
    cell.innerHTML = displayValue;
    cell.setAttribute('data-value', value);
}

function setupEventListeners() {
    // Refresh button
    document.getElementById('refresh-machines-btn').addEventListener('click', async () => {
        const button = document.getElementById('refresh-machines-btn');
        const originalText = button.innerHTML;
        button.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Yenileniyor...';
        button.disabled = true;
        
        try {
            await loadMachineData();
        } catch (error) {
            console.error('Error refreshing machines:', error);
        } finally {
            button.innerHTML = originalText;
            button.disabled = false;
        }
    });
    
    // Search functionality
    document.getElementById('search-machines').addEventListener('input', filterMachines);
    
    // Filter functionality
    document.getElementById('filter-type').addEventListener('change', filterMachines);
    document.getElementById('filter-status').addEventListener('change', filterMachines);
    document.getElementById('filter-usage-area').addEventListener('change', filterMachines);
    document.getElementById('filter-description').addEventListener('input', filterMachines);
    
    // Apply filters button
    document.getElementById('apply-filters').addEventListener('click', filterMachines);
    
    // Clear filters
    document.getElementById('clear-filters').addEventListener('click', clearFilters);
}

function filterMachines() {
    const searchTerm = document.getElementById('search-machines').value.toLowerCase();
    const selectedType = document.getElementById('filter-type').value;
    const selectedStatus = document.getElementById('filter-status').value;
    const selectedUsageArea = document.getElementById('filter-usage-area').value;
    const descriptionTerm = document.getElementById('filter-description').value.toLowerCase();
    
    const rows = document.querySelectorAll('.team-member-row');
    
    rows.forEach(row => {
        const machineName = row.querySelector('td:nth-child(2)').textContent.toLowerCase();
        const machineType = row.querySelector('td:nth-child(3)').textContent;
        const usageArea = row.querySelector('td:nth-child(4)').textContent;
        const description = row.querySelector('td:nth-child(6)').textContent.toLowerCase();
        const status = row.querySelector('td:nth-child(5) .machine-status-active, .machine-status-inactive') !== null;
        
        const matchesSearch = machineName.includes(searchTerm);
        const matchesType = !selectedType || machineType === selectedType;
        const matchesUsageArea = !selectedUsageArea || usageArea === selectedUsageArea;
        const matchesDescription = !descriptionTerm || description.includes(descriptionTerm);
        const matchesStatus = !selectedStatus || 
            (selectedStatus === 'active' && status) || 
            (selectedStatus === 'inactive' && !status);
        
        if (matchesSearch && matchesType && matchesStatus && matchesUsageArea && matchesDescription) {
            row.style.display = 'table-row';
        } else {
            row.style.display = 'none';
        }
    });
    
    // Update area headers visibility
    updateAreaHeadersVisibility();
}

function updateAreaHeadersVisibility() {
    const areaHeaders = document.querySelectorAll('.team-header-row');
    
    areaHeaders.forEach(header => {
        const areaName = header.getAttribute('data-area');
        const memberRows = document.querySelectorAll(`.team-member-row[data-area="${areaName}"]`);
        const visibleMembers = Array.from(memberRows).filter(row => row.style.display !== 'none');
        
        if (visibleMembers.length > 0) {
            header.style.display = 'table-row';
            // Update member count
            const countElement = header.querySelector('td:nth-child(2)');
            const originalText = countElement.innerHTML;
            const newText = originalText.replace(/\(\d+ makine\)/, `(${visibleMembers.length} makine)`);
            countElement.innerHTML = newText;
        } else {
            header.style.display = 'none';
        }
    });
}

function clearFilters() {
    document.getElementById('search-machines').value = '';
    document.getElementById('filter-type').value = '';
    document.getElementById('filter-status').value = '';
    document.getElementById('filter-usage-area').value = '';
    document.getElementById('filter-description').value = '';
    
    // Show all rows
    document.querySelectorAll('.team-member-row').forEach(row => {
        row.style.display = 'table-row';
    });
    
    // Show all area headers
    document.querySelectorAll('.team-header-row').forEach(header => {
        header.style.display = 'table-row';
    });
}

function showError(message) {
    const container = document.getElementById('machine-list-table-container');
    container.innerHTML = `
        <div class="alert alert-danger" role="alert">
            <i class="fas fa-exclamation-triangle me-2"></i>
            ${message}
        </div>
    `;
}

// Machine Creation Functionality
async function initializeMachineCreation() {
    try {
        // Load machine types and teams for dropdowns
        const machineTypes = await fetchMachineTypes();
        const teams = await fetchTeams();
        populateDropdowns(machineTypes, teams);
        
        // Setup event listeners for machine creation
        setupMachineCreationEventListeners();
        
    } catch (error) {
        console.error('Error initializing machine creation:', error);
    }
}

function populateDropdowns(machineTypes, teams) {
    // Populate machine type dropdowns
    const singleMachineType = document.getElementById('machine-type');
    const bulkMachineType = document.getElementById('bulk-machine-type');
    
    [singleMachineType, bulkMachineType].forEach(select => {
        if (select) {
            // Keep the first option
            const firstOption = select.querySelector('option[value=""]');
            select.innerHTML = '';
            if (firstOption) {
                select.appendChild(firstOption);
            }
        }
    });
    
    // Add machine type options
    if (machineTypes && machineTypes.length > 0) {
        machineTypes.forEach(type => {
            [singleMachineType, bulkMachineType].forEach(select => {
                if (select) {
                    const option = document.createElement('option');
                    option.value = type.value;
                    option.textContent = type.label;
                    select.appendChild(option);
                }
            });
        });
    }
    
    // Populate usage area dropdowns
    const singleMachineUsedIn = document.getElementById('machine-used-in');
    const bulkMachineUsedIn = document.getElementById('bulk-machine-used-in');
    
    [singleMachineUsedIn, bulkMachineUsedIn].forEach(select => {
        if (select) {
            // Keep the first option
            const firstOption = select.querySelector('option[value=""]');
            select.innerHTML = '';
            if (firstOption) {
                select.appendChild(firstOption);
            }
        }
    });
    
    // Add team options as usage areas
    if (teams && teams.length > 0) {
        teams.forEach(team => {
            [singleMachineUsedIn, bulkMachineUsedIn].forEach(select => {
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

function setupMachineCreationEventListeners() {
    // Single machine creation button
    const createMachineBtn = document.getElementById('create-machine-btn');
    if (createMachineBtn) {
        createMachineBtn.addEventListener('click', () => {
            const modal = new bootstrap.Modal(document.getElementById('createMachineModal'));
            modal.show();
        });
    }
    
    // Bulk machine creation button
    const bulkCreateMachineBtn = document.getElementById('bulk-create-machine-btn');
    if (bulkCreateMachineBtn) {
        bulkCreateMachineBtn.addEventListener('click', () => {
            const modal = new bootstrap.Modal(document.getElementById('bulkCreateMachineModal'));
            modal.show();
        });
    }
    
    // Save single machine button
    const saveMachineBtn = document.getElementById('save-machine-btn');
    if (saveMachineBtn) {
        saveMachineBtn.addEventListener('click', handleSingleMachineCreate);
    }
    
    // Save bulk machines button
    const saveBulkMachinesBtn = document.getElementById('save-bulk-machines-btn');
    if (saveBulkMachinesBtn) {
        saveBulkMachinesBtn.addEventListener('click', handleBulkMachineCreate);
    }
    
    // Bulk machine names input - real-time preview
    const bulkMachineNamesInput = document.getElementById('bulk-machine-names');
    if (bulkMachineNamesInput) {
        bulkMachineNamesInput.addEventListener('input', updateBulkMachinePreview);
    }
    
    // Property management
    const addPropertyBtn = document.getElementById('add-property');
    if (addPropertyBtn) {
        addPropertyBtn.addEventListener('click', addPropertyRow);
    }
    
    // Setup initial property row listeners
    setupPropertyRowListeners();
}

function addPropertyRow() {
    const container = document.getElementById('properties-container');
    const propertyRow = document.createElement('div');
    propertyRow.className = 'property-row mb-2';
    propertyRow.innerHTML = `
        <div class="row">
            <div class="col-md-5">
                <input type="text" class="form-control form-control-sm property-key" placeholder="Özellik adı">
            </div>
            <div class="col-md-5">
                <input type="text" class="form-control form-control-sm property-value" placeholder="Özellik değeri">
            </div>
            <div class="col-md-2">
                <button type="button" class="btn btn-danger btn-sm remove-property">Sil</button>
            </div>
        </div>
    `;
    
    container.appendChild(propertyRow);
    setupPropertyRowListeners();
}

function setupPropertyRowListeners() {
    const propertyRows = document.querySelectorAll('#properties-container .property-row');
    
    propertyRows.forEach(row => {
        const removeBtn = row.querySelector('.remove-property');
        
        if (removeBtn) {
            removeBtn.addEventListener('click', () => {
                row.remove();
                updateRemoveButtons();
            });
        }
    });
    
    updateRemoveButtons();
}

function updateRemoveButtons() {
    const propertyRows = document.querySelectorAll('#properties-container .property-row');
    
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

async function handleSingleMachineCreate() {
    // Get form values
    const machineData = {
        name: document.getElementById('machine-name').value.trim(),
        machine_type: document.getElementById('machine-type').value,
        used_in: document.getElementById('machine-used-in').value,
        is_active: document.getElementById('machine-status').value === 'active',
        description: document.getElementById('machine-description').value.trim(),
        properties: {}
    };
    
    // Collect properties
    const propertyRows = document.querySelectorAll('#properties-container .property-row');
    propertyRows.forEach(row => {
        const keyInput = row.querySelector('.property-key');
        const valueInput = row.querySelector('.property-value');
        
        if (keyInput && valueInput && keyInput.value.trim() && valueInput.value.trim()) {
            machineData.properties[keyInput.value.trim()] = valueInput.value.trim();
        }
    });
    
    // Validate required fields
    if (!machineData.name || !machineData.machine_type || !machineData.used_in) {
        showNotification('Lütfen gerekli alanları doldurun (Makine Adı, Makine Tipi ve Kullanım Alanı)', 'error');
        return;
    }
    
    // Show loading state
    const saveBtn = document.getElementById('save-machine-btn');
    const originalText = saveBtn.innerHTML;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Oluşturuluyor...';
    saveBtn.disabled = true;
    
    try {
        // Create machine
        const response = await authedFetch(`${backendBase}/machines/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(machineData)
        });
        
        if (response.ok) {
            const result = await response.json();
            showNotification('Makine başarıyla oluşturuldu!', 'success');
            
            // Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('createMachineModal'));
            modal.hide();
            
            // Reset form
            document.getElementById('create-machine-form').reset();
            
            // Clear properties
            document.getElementById('properties-container').innerHTML = `
                <div class="property-row mb-2">
                    <div class="row">
                        <div class="col-md-5">
                            <input type="text" class="form-control form-control-sm property-key" placeholder="Özellik adı">
                        </div>
                        <div class="col-md-5">
                            <input type="text" class="form-control form-control-sm property-value" placeholder="Özellik değeri">
                        </div>
                        <div class="col-md-2">
                            <button type="button" class="btn btn-danger btn-sm remove-property" style="display: none;">Sil</button>
                        </div>
                    </div>
                </div>
            `;
            setupPropertyRowListeners();
            
            // Reload machine data
            await loadMachineData();
            
        } else {
            const errorData = await response.json().catch(() => ({}));
            showNotification(errorData.message || 'Makine oluşturulamadı', 'error');
        }
        
    } catch (error) {
        console.error('Error creating machine:', error);
        showNotification('Bir hata oluştu. Lütfen tekrar deneyin.', 'error');
        
    } finally {
        // Restore button state
        const saveBtn = document.getElementById('save-machine-btn');
        saveBtn.innerHTML = originalText;
        saveBtn.disabled = false;
    }
}

function updateBulkMachinePreview() {
    const input = document.getElementById('bulk-machine-names');
    const preview = document.getElementById('bulk-machine-preview');
    const counter = document.getElementById('bulk-machine-count');
    
    if (!input || !preview || !counter) return;
    
    const text = input.value.trim();
    if (!text) {
        preview.innerHTML = '<em class="text-muted">Makine adlarını yazmaya başlayın...</em>';
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
                <span><i class="fas fa-cogs me-2 text-success"></i>${name}</span>
                <small class="text-muted">#${index + 1}</small>
            </div>`
        ).join('');
        preview.innerHTML = previewHtml;
    } else {
        preview.innerHTML = '<em class="text-muted">Geçerli makine adı bulunamadı</em>';
    }
}

async function handleBulkMachineCreate() {
    const namesInput = document.getElementById('bulk-machine-names');
    const typeSelect = document.getElementById('bulk-machine-type');
    const usedInSelect = document.getElementById('bulk-machine-used-in');
    const statusSelect = document.getElementById('bulk-machine-status');
    
    // Get and validate input
    const namesText = namesInput.value.trim();
    const type = typeSelect.value;
    const usedIn = usedInSelect.value;
    const status = statusSelect.value;
    
    if (!namesText || !type || !usedIn) {
        showNotification('Lütfen makine adları, makine tipi ve kullanım alanı seçin', 'error');
        return;
    }
    
    // Parse names
    const names = namesText.split(/\n|,/)
        .map(name => name.trim())
        .filter(name => name.length > 0);
    
    if (names.length === 0) {
        showNotification('Geçerli makine adı bulunamadı', 'error');
        return;
    }
    
    try {
        // Show progress
        const progressContainer = document.getElementById('bulk-create-progress');
        const resultsContainer = document.getElementById('bulk-create-results');
        const progressBar = progressContainer.querySelector('.progress-bar');
        const progressText = document.getElementById('bulk-progress-text');
        const saveBtn = document.getElementById('save-bulk-machines-btn');
        
        // Setup UI for processing
        progressContainer.style.display = 'block';
        resultsContainer.style.display = 'none';
        saveBtn.disabled = true;
        progressText.textContent = `0/${names.length} makine işleniyor...`;
        progressBar.style.width = '0%';
        
        // Prepare bulk data
        const bulkData = {
            names: names,
            machine_type: type,
            used_in: usedIn,
            is_active: status === 'active'
        };
        
        // Make API call
        const response = await authedFetch(`${backendBase}/machines/admin/bulk-create-machine/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bulkData)
        });
        
        // Update progress
        progressBar.style.width = '100%';
        progressText.textContent = `${names.length}/${names.length} makine işlendi`;
        
        if (response.ok) {
            const result = await response.json();
            
            // Show results
            displayBulkCreateResults(result, names);
            showNotification(`${names.length} makine başarıyla oluşturuldu!`, 'success');
            
            // Reload machine data
            await loadMachineData();
            
        } else {
            const errorData = await response.text();
            throw new Error(errorData);
        }
        
    } catch (error) {
        console.error('Error bulk creating machines:', error);
        showNotification(`Toplu makine oluşturma hatası: ${error.message}`, 'error');
        
        // Hide progress
        document.getElementById('bulk-create-progress').style.display = 'none';
        
    } finally {
        // Restore button
        document.getElementById('save-bulk-machines-btn').disabled = false;
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
            <p class="mb-0 mt-2">${successCount} makine başarıyla oluşturuldu.</p>
        </div>
        
        <div class="table-responsive">
            <table class="table table-sm table-bordered">
                <thead class="table-light">
                    <tr>
                        <th>Sıra</th>
                        <th>Makine Adı</th>
                        <th>Makine Tipi</th>
                        <th>Kullanım Alanı</th>
                        <th>Durum</th>
                    </tr>
                </thead>
                <tbody>
                    ${originalNames.map((name, index) => `
                        <tr>
                            <td>${index + 1}</td>
                            <td><i class="fas fa-cogs me-2 text-success"></i>${name}</td>
                            <td><i class="fas fa-tags me-2 text-info"></i>${document.getElementById('bulk-machine-type').selectedOptions[0]?.textContent || 'N/A'}</td>
                            <td><i class="fas fa-building me-2 text-warning"></i>${document.getElementById('bulk-machine-used-in').selectedOptions[0]?.textContent || 'N/A'}</td>
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

// Delete Machine Functionality
window.deleteMachine = function(machineId, machineName) {
    // Set the pending delete machine info
    window.pendingDeleteMachineId = machineId;
    window.pendingDeleteMachineName = machineName;
    
    // Update the modal content
    const deleteMachineName = document.getElementById('delete-machine-name');
    if (deleteMachineName) {
        deleteMachineName.textContent = machineName;
    }
    
    // Show the delete confirmation modal
    const deleteModal = new bootstrap.Modal(document.getElementById('deleteMachineConfirmModal'));
    deleteModal.show();
};

// Handle delete confirmation
function setupDeleteConfirmation() {
    const confirmDeleteBtn = document.getElementById('confirm-delete-machine-btn');
    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', async function() {
            const machineId = window.pendingDeleteMachineId;
            const machineName = window.pendingDeleteMachineName;
            
            if (!machineId) {
                showNotification('Silinecek makine bulunamadı', 'error');
                return;
            }
            
            try {
                // Show loading state
                this.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Siliniyor...';
                this.disabled = true;
                
                const response = await authedFetch(`${backendBase}/machines/${machineId}/`, {
                    method: 'DELETE'
                });
                
                if (response.ok) {
                    showNotification(`${machineName} başarıyla silindi!`, 'success');
                    
                    // Close modal
                    const modal = bootstrap.Modal.getInstance(document.getElementById('deleteMachineConfirmModal'));
                    modal.hide();
                    
                    // Reload machine data
                    await loadMachineData();
                    
                } else {
                    const errorData = await response.json().catch(() => ({}));
                    showNotification(errorData.message || 'Makine silinemedi', 'error');
                }
                
            } catch (error) {
                console.error('Error deleting machine:', error);
                showNotification('Bir hata oluştu. Lütfen tekrar deneyin.', 'error');
                
            } finally {
                // Restore button state
                this.innerHTML = '<i class="fas fa-trash me-2"></i>Evet, Sil';
                this.disabled = false;
                
                // Clear pending delete info
                window.pendingDeleteMachineId = null;
                window.pendingDeleteMachineName = null;
            }
        });
    }
} 