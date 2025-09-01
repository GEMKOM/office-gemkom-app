import { guardRoute } from '/authService.js';
import { initNavbar } from '/components/navbar.js';
import { HeaderComponent } from '/components/header/header.js';
import { ModernDropdown } from '/components/dropdown.js';
import { createMaintenanceRequest } from '/generic/maintenance.js';
import { fetchMachines } from '/generic/machines.js';

// Global state
let headerComponent;
let machineDropdown, typeDropdown, breakingDropdown;

// Fault request data
let faultRequestData = {
    machine: '',
    description: '',
    is_maintenance: false,
    is_breaking: false
};

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    await initNavbar();
    
    initializeHeader();
    initializeDropdowns();
    initializeFormHandlers();
    await loadMachines();
});

// Initialize header component
function initializeHeader() {
    headerComponent = new HeaderComponent({
        title: 'Arıza/Bakım Talebi Oluştur',
        subtitle: 'Yeni arıza veya bakım talebi oluşturun ve sisteme kaydedin',
        icon: 'exclamation-triangle',
        showBackButton: 'block',
        showCreateButton: 'none',
        backUrl: '/manufacturing/maintenance/fault-requests',
        onBackClick: () => {
            window.location.href = '/manufacturing/maintenance/fault-requests';
        }
    });
}

// Initialize dropdown components
function initializeDropdowns() {
    // Machine dropdown
    const machineContainer = document.getElementById('machine-dropdown-container');
    machineDropdown = new ModernDropdown(machineContainer, {
        placeholder: 'Ekipman seçin...',
        searchable: true
    });

    // Type dropdown (Fault vs Maintenance)
    const typeContainer = document.getElementById('type-dropdown-container');
    typeDropdown = new ModernDropdown(typeContainer, {
        placeholder: 'Tür seçin...',
        searchable: false
    });
    
    typeDropdown.setItems([
        { value: 'fault', text: 'Arıza' },
        { value: 'maintenance', text: 'Bakım' }
    ]);

    // Breaking status dropdown
    const breakingContainer = document.getElementById('breaking-dropdown-container');
    breakingDropdown = new ModernDropdown(breakingContainer, {
        placeholder: 'Durum seçin...',
        searchable: false
    });
    
    breakingDropdown.setItems([
        { value: 'false', text: 'Çalışıyor' },
        { value: 'true', text: 'Durdu' }
    ]);

    // Add event listeners for dropdowns
    machineContainer.addEventListener('dropdown:select', (e) => {
        faultRequestData.machine = e.detail.value;
    });

    typeContainer.addEventListener('dropdown:select', (e) => {
        faultRequestData.is_maintenance = e.detail.value === 'maintenance';
        updateBreakingDropdown();
    });

    breakingContainer.addEventListener('dropdown:select', (e) => {
        faultRequestData.is_breaking = e.detail.value === 'true';
    });
}

// Update breaking dropdown based on type selection
function updateBreakingDropdown() {
    if (faultRequestData.is_maintenance) {
        // If maintenance is selected, machine cannot be breaking
        breakingDropdown.setItems([
            { value: 'false', text: 'Çalışıyor' }
        ]);
        breakingDropdown.setValue('false');
        faultRequestData.is_breaking = false;
    } else {
        // If fault is selected, machine can be either working or stopped
        breakingDropdown.setItems([
            { value: 'false', text: 'Çalışıyor' },
            { value: 'true', text: 'Durdu' }
        ]);
    }
}

// Initialize form event handlers
function initializeFormHandlers() {
    const form = document.getElementById('fault-request-form');
    const resetBtn = document.getElementById('reset-form-btn');

    // Form submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleFormSubmit();
    });

    // Reset form
    resetBtn.addEventListener('click', () => {
        resetForm();
    });

    // Real-time validation
    const inputs = form.querySelectorAll('input, textarea');
    inputs.forEach(input => {
        input.addEventListener('blur', () => validateField(input));
        input.addEventListener('input', () => clearFieldError(input));
    });
}

// Load machines for dropdown
async function loadMachines() {
    try {
        // Fetch machines from API using fetchMachines function
        const response = await fetchMachines();
        
        // Extract machines from the results array
        const machines = response.results || response;
        
        machineDropdown.setItems(
            machines.map(machine => ({
                value: machine.id.toString(),
                text: machine.name
            }))
        );
    } catch (error) {
        console.error('Error loading machines:', error);
        showAlert('Ekipman listesi yüklenirken hata oluştu', 'danger');
    }
}

// Handle form submission
async function handleFormSubmit() {
    if (!validateForm()) {
        return;
    }

    try {
        showLoading(true);
        
        const formData = collectFormData();
        const response = await createMaintenanceRequest(formData);
        
        showAlert('Talep başarıyla oluşturuldu!', 'success');
        
        // Redirect to list page after 2 seconds
        setTimeout(() => {
            window.location.href = '/manufacturing/maintenance/fault-requests/list';
        }, 2000);
        
    } catch (error) {
        console.error('Error creating fault request:', error);
        showAlert('Talep oluşturulurken hata oluştu: ' + error.message, 'danger');
    } finally {
        showLoading(false);
    }
}

// Collect form data
function collectFormData() {
    return {
        machine: parseInt(faultRequestData.machine),
        description: document.getElementById('fault-description').value.trim(),
        is_maintenance: faultRequestData.is_maintenance,
        is_breaking: faultRequestData.is_breaking
    };
}

// Validate form
function validateForm() {
    const requiredFields = [
        { id: 'fault-description', label: 'Açıklama' }
    ];

    let isValid = true;

    // Validate required fields
    requiredFields.forEach(field => {
        const element = document.getElementById(field.id);
        if (!element.value.trim()) {
            showFieldError(element, `${field.label} zorunludur`);
            isValid = false;
        }
    });

    // Validate dropdowns
    if (!faultRequestData.machine) {
        showAlert('Ekipman seçimi zorunludur', 'warning');
        isValid = false;
    }

    if (faultRequestData.is_maintenance === undefined || faultRequestData.is_maintenance === '') {
        showAlert('Tür seçimi zorunludur', 'warning');
        isValid = false;
    }

    if (faultRequestData.is_breaking === undefined || faultRequestData.is_breaking === '') {
        showAlert('Durum seçimi zorunludur', 'warning');
        isValid = false;
    }

    return isValid;
}

// Validate individual field
function validateField(field) {
    if (field.hasAttribute('required') && !field.value.trim()) {
        showFieldError(field, 'Bu alan zorunludur');
        return false;
    }
    return true;
}

// Show field error
function showFieldError(field, message) {
    clearFieldError(field);
    field.classList.add('is-invalid');
    
    const errorDiv = document.createElement('div');
    errorDiv.className = 'invalid-feedback';
    errorDiv.textContent = message;
    field.parentNode.appendChild(errorDiv);
}

// Clear field error
function clearFieldError(field) {
    field.classList.remove('is-invalid');
    const errorDiv = field.parentNode.querySelector('.invalid-feedback');
    if (errorDiv) {
        errorDiv.remove();
    }
}

// Reset form
function resetForm() {
    document.getElementById('fault-request-form').reset();
    
    // Reset dropdowns
    machineDropdown.setValue('');
    typeDropdown.setValue('');
    breakingDropdown.setValue('');
    
    // Reset data object
    faultRequestData = {
        machine: '',
        description: '',
        is_maintenance: false,
        is_breaking: false
    };
    
    // Clear all field errors
    document.querySelectorAll('.is-invalid').forEach(field => {
        clearFieldError(field);
    });
    
    showAlert('Form temizlendi', 'info');
}

// Show alert message
function showAlert(message, type = 'info') {
    // Create alert element
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
    alertDiv.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(alertDiv);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.remove();
        }
    }, 5000);
}

// Show/hide loading state
function showLoading(show) {
    const submitBtn = document.getElementById('submit-fault-btn');
    const resetBtn = document.getElementById('reset-form-btn');
    
    if (show) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Gönderiliyor...';
        resetBtn.disabled = true;
    } else {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-paper-plane me-2"></i>Gönder';
        resetBtn.disabled = false;
    }
}
