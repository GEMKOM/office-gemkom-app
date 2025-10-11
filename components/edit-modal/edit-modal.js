// Edit Modal Component
import { ModernDropdown } from '../dropdown/dropdown.js';

export class EditModal {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            throw new Error(`Container with id "${containerId}" not found`);
        }
        
        this.options = {
            title: 'Düzenle',
            icon: 'fas fa-edit',
            saveButtonText: 'Kaydet',
            size: 'lg', // sm, lg, xl
            ...options
        };
        
        this.modal = null;
        this.form = null;
        this.sections = [];
        this.fields = new Map();
        this.dropdowns = new Map();
        this.isLoading = false;
        this.onSave = null;
        this.onCancel = null;
        
        this.init();
    }
    
    init() {
        this.createModal();
        this.bindEvents();
    }
    
    createModal() {
        // Create modal HTML
        const modalHtml = `
            <div class="modal fade edit-modal-container" id="editModal" tabindex="-1">
                <div class="modal-dialog modal-${this.options.size}">
                    <div class="modal-content compact">
                        <div class="modal-header compact">
                            <h6 class="modal-title">
                                <i class="modal-icon ${this.options.icon} me-2"></i>
                                <span class="modal-title-text">${this.options.title}</span>
                            </h6>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body compact">
                            <form id="edit-modal-form">
                                <!-- Dynamic sections will be rendered here -->
                            </form>
                            <div class="modal-loading" style="display: none;">
                                <div class="spinner"></div>
                            </div>
                        </div>
                        <div class="modal-footer compact">
                            <button type="button" class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal">
                                <i class="fas fa-times me-1"></i>İptal
                            </button>
                            <button type="button" class="btn btn-sm btn-primary" id="save-edit-btn">
                                <i class="fas fa-save me-1"></i>
                                <span class="save-btn-text">${this.options.saveButtonText}</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        this.container.innerHTML = modalHtml;
        this.modal = this.container.querySelector('#editModal');
        this.form = this.container.querySelector('#edit-modal-form');
        
        // Set initial inert state (better than aria-hidden for focus management)
        this.modal.setAttribute('inert', '');
    }
    
    bindEvents() {
        // Save button event
        const saveBtn = this.container.querySelector('#save-edit-btn');
        saveBtn.addEventListener('click', () => {
            this.handleSave();
        });
        
        // Modal events
        this.modal.addEventListener('hidden.bs.modal', () => {
            this.handleCancel();
        });
        
        // Handle Bootstrap modal events to prevent aria-hidden conflicts
        this.modal.addEventListener('show.bs.modal', () => {
            this.modal.removeAttribute('aria-hidden');
        });
        
        this.modal.addEventListener('shown.bs.modal', () => {
            this.modal.removeAttribute('aria-hidden');
        });
        
        this.modal.addEventListener('hide.bs.modal', () => {
            this.modal.setAttribute('inert', '');
        });
        
        this.modal.addEventListener('hidden.bs.modal', () => {
            this.modal.setAttribute('inert', '');
        });
        
        
        // Form validation events
        this.form.addEventListener('input', (e) => {
            this.validateField(e.target);
        });
        
        this.form.addEventListener('change', (e) => {
            this.validateField(e.target);
        });
    }
    
    // Add a section to the modal
    addSection(sectionConfig) {
        const section = {
            id: sectionConfig.id || `section-${Date.now()}`,
            title: sectionConfig.title || 'Bölüm',
            icon: sectionConfig.icon || 'fas fa-info-circle',
            iconColor: sectionConfig.iconColor || 'text-primary',
            fields: sectionConfig.fields || [],
            ...sectionConfig
        };
        
        this.sections.push(section);
        return this;
    }
    
    // Add a field to the last section
    addField(fieldConfig) {
        if (this.sections.length === 0) {
            this.addSection({ title: 'Genel Bilgiler' });
        }
        
        const lastSection = this.sections[this.sections.length - 1];
        lastSection.fields.push(fieldConfig);
        return this;
    }
    
    // Render the modal with all sections and fields
    render() {
        this.form.innerHTML = '';
        
        this.sections.forEach(section => {
            const sectionElement = this.createSectionElement(section);
            this.form.appendChild(sectionElement);
        });
        
        return this;
    }
    
    createSectionElement(section) {
        const sectionDiv = document.createElement('div');
        sectionDiv.className = 'form-section compact mb-3';
        sectionDiv.dataset.sectionId = section.id;
        
        const title = document.createElement('h6');
        title.className = `section-subtitle compact ${section.iconColor}`;
        title.innerHTML = `<i class="${section.icon} me-2"></i>${section.title}`;
        
        const fieldsContainer = document.createElement('div');
        fieldsContainer.className = 'row g-2';
        
        section.fields.forEach(field => {
            const fieldElement = this.createFieldElement(field);
            fieldsContainer.appendChild(fieldElement);
        });
        
        sectionDiv.appendChild(title);
        sectionDiv.appendChild(fieldsContainer);
        
        return sectionDiv;
    }
    
    createFieldElement(fieldConfig) {
        const field = {
            id: fieldConfig.id || `field-${Date.now()}`,
            name: fieldConfig.name || fieldConfig.id,
            label: fieldConfig.label || 'Alan',
            type: fieldConfig.type || 'text',
            placeholder: fieldConfig.placeholder || '',
            help: fieldConfig.help || '',
            required: fieldConfig.required || false,
            icon: fieldConfig.icon || '',
            colSize: fieldConfig.colSize || 12,
            options: fieldConfig.options || [],
            value: fieldConfig.value || '',
            min: fieldConfig.min || null,
            max: fieldConfig.max || null,
            step: fieldConfig.step || null,
            ...fieldConfig
        };
        
        // Store field config
        this.fields.set(field.id, field);
        
        const colDiv = document.createElement('div');
        colDiv.className = `col-md-${field.colSize}`;
        
        const fieldGroup = document.createElement('div');
        fieldGroup.className = 'field-group mb-2';
        fieldGroup.dataset.fieldId = field.id;
        
        // Create input based on type
        const input = this.createInputElement(field);
        
        // For checkbox fields, don't create a separate label (checkbox handles its own label)
        if (field.type !== 'checkbox') {
            // Create label
            const label = document.createElement('label');
            label.className = 'field-label';
            if (field.required) label.classList.add('required');
            if (field.icon) {
                label.innerHTML = `<i class="${field.icon} me-1"></i>${field.label}`;
            } else {
                label.textContent = field.label;
            }
            fieldGroup.appendChild(label);
        }
        
        // Create help text
        const help = document.createElement('div');
        help.className = 'field-help';
        help.textContent = field.help;
        
        // Create error message
        const error = document.createElement('div');
        error.className = 'field-error';
        error.textContent = 'Bu alan gereklidir';
        
        fieldGroup.appendChild(input);
        fieldGroup.appendChild(help);
        fieldGroup.appendChild(error);
        
        colDiv.appendChild(fieldGroup);
        return colDiv;
    }
    
    createInputElement(field) {
        let input;
        
        switch (field.type) {
            case 'text':
            case 'email':
            case 'password':
                input = document.createElement('input');
                input.type = field.type;
                input.className = 'form-control field-input';
                input.placeholder = field.placeholder;
                input.value = field.value;
                if (field.required) input.required = true;
                if (field.readonly) {
                    input.readOnly = true;
                    input.classList.add('readonly-field');
                }
                break;
                
            case 'number':
                input = document.createElement('input');
                input.type = 'number';
                input.className = 'form-control field-input number-field';
                input.placeholder = field.placeholder;
                input.value = field.value;
                if (field.min !== null) input.min = field.min;
                if (field.max !== null) input.max = field.max;
                if (field.step !== null) input.step = field.step;
                if (field.required) input.required = true;
                if (field.readonly) {
                    input.readOnly = true;
                    input.classList.add('readonly-field');
                }
                break;
                
            case 'date':
                input = document.createElement('input');
                input.type = 'date';
                input.className = 'form-control field-input date-field';
                input.value = field.value;
                if (field.required) input.required = true;
                if (field.readonly) {
                    input.readOnly = true;
                    input.classList.add('readonly-field');
                }
                break;
                
            case 'datetime-local':
                input = document.createElement('input');
                input.type = 'datetime-local';
                input.className = 'form-control field-input date-field';
                input.value = field.value;
                if (field.required) input.required = true;
                if (field.readonly) {
                    input.readOnly = true;
                    input.classList.add('readonly-field');
                }
                break;
                
            case 'time':
                input = document.createElement('input');
                input.type = 'time';
                input.className = 'form-control field-input date-field';
                input.value = field.value;
                if (field.required) input.required = true;
                if (field.readonly) {
                    input.readOnly = true;
                    input.classList.add('readonly-field');
                }
                break;
                
            case 'textarea':
                input = document.createElement('textarea');
                input.className = 'form-control field-input textarea-field';
                input.placeholder = field.placeholder;
                input.value = field.value;
                input.rows = field.rows || 3;
                if (field.required) input.required = true;
                if (field.readonly) {
                    input.readOnly = true;
                    input.classList.add('readonly-field');
                }
                break;
                
            case 'select':
            case 'dropdown':
                return this.createDropdownElement(field);
                
            case 'checkbox':
                return this.createCheckboxElement(field);
                
            case 'radio':
                return this.createRadioElement(field);
                
            case 'file':
                input = document.createElement('input');
                input.type = 'file';
                input.className = 'form-control field-input file-field';
                input.accept = field.accept || '*/*';
                if (field.required) input.required = true;
                if (field.multiple) input.multiple = true;
                break;
                
            case 'color':
                input = document.createElement('input');
                input.type = 'color';
                input.className = 'form-control field-input color-field';
                input.value = field.value || '#000000';
                break;
                
            case 'range':
                return this.createRangeElement(field);
                
            default:
                input = document.createElement('input');
                input.type = 'text';
                input.className = 'form-control field-input';
                input.placeholder = field.placeholder;
                input.value = field.value;
                if (field.required) input.required = true;
        }
        
        input.id = field.id;
        input.name = field.name;
        
        return input;
    }
    
    createDropdownElement(field) {
        const container = document.createElement('div');
        container.className = 'dropdown-field-container';
        
        const dropdownContainer = document.createElement('div');
        dropdownContainer.id = `dropdown-${field.id}`;
        
        container.appendChild(dropdownContainer);
        
        // Initialize dropdown after rendering
        setTimeout(() => {
            const dropdown = new ModernDropdown(dropdownContainer, {
                placeholder: field.placeholder || 'Seçiniz...',
                searchable: field.searchable || false,
                multiple: field.multiple || false
            });
            
            const items = field.options.map((option, index) => {
                // Handle different option formats
                let value = option.value !== undefined ? option.value : option.id;
                
                // If value is still undefined, use index as fallback
                if (value === undefined) {
                    value = index;
                }
                
                const text = option.label || option.text || option.name;
                return {
                    value: value,
                    text: text,
                    disabled: option.disabled || false
                };
            });
            
            dropdown.setItems(items);
            dropdown.setValue(field.value);
            
            // Store dropdown reference
            this.dropdowns.set(field.id, dropdown);
            
            // Add change event listener
            dropdownContainer.addEventListener('dropdown:select', (e) => {
                this.validateField(dropdownContainer);
            });
        }, 100);
        
        return container;
    }
    
    createCheckboxElement(field) {
        const container = document.createElement('div');
        container.className = 'checkbox-field custom-checkbox';
        
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'field-input';
        input.id = field.id;
        input.name = field.name;
        input.checked = field.value === true || field.value === 'true';
        if (field.required) input.required = true;
        
        const label = document.createElement('label');
        label.className = 'field-label checkbox-label';
        label.htmlFor = field.id;
        if (field.icon) {
            label.innerHTML = `<i class="${field.icon} me-1"></i>${field.label}`;
        } else {
            label.textContent = field.label;
        }
        
        container.appendChild(input);
        container.appendChild(label);
        
        return container;
    }
    
    createRadioElement(field) {
        const container = document.createElement('div');
        container.className = 'radio-group';
        
        field.options.forEach((option, index) => {
            const radioField = document.createElement('div');
            radioField.className = 'radio-field';
            
            const input = document.createElement('input');
            input.type = 'radio';
            input.className = 'form-check-input field-input';
            input.id = `${field.id}-${index}`;
            input.name = field.name;
            input.value = option.value || option.id;
            input.checked = field.value === (option.value || option.id);
            if (field.required) input.required = true;
            
            const label = document.createElement('label');
            label.className = 'field-label';
            label.htmlFor = `${field.id}-${index}`;
            label.textContent = option.label || option.text || option.name;
            
            radioField.appendChild(input);
            radioField.appendChild(label);
            container.appendChild(radioField);
        });
        
        return container;
    }
    
    createRangeElement(field) {
        const container = document.createElement('div');
        container.className = 'range-field';
        
        const input = document.createElement('input');
        input.type = 'range';
        input.className = 'form-control field-input';
        input.id = field.id;
        input.name = field.name;
        input.min = field.min || 0;
        input.max = field.max || 100;
        input.step = field.step || 1;
        input.value = field.value || field.min || 0;
        if (field.required) input.required = true;
        
        const valueDisplay = document.createElement('div');
        valueDisplay.className = 'range-value';
        valueDisplay.textContent = input.value;
        
        input.addEventListener('input', () => {
            valueDisplay.textContent = input.value;
        });
        
        container.appendChild(input);
        container.appendChild(valueDisplay);
        
        return container;
    }
    
    // Set field value
    setFieldValue(fieldId, value) {
        const field = this.fields.get(fieldId);
        if (!field) return;
        
        const fieldElement = this.container.querySelector(`[data-field-id="${fieldId}"]`);
        if (!fieldElement) return;
        
        if (field.type === 'select' || field.type === 'dropdown') {
            const dropdown = this.dropdowns.get(fieldId);
            if (dropdown) {
                dropdown.setValue(value);
            }
        } else {
            const input = fieldElement.querySelector('.field-input');
            if (input) {
                if (input.type === 'checkbox') {
                    input.checked = value === true || value === 'true';
                } else {
                    input.value = value;
                }
            }
        }
        
        // Update field config
        field.value = value;
        this.fields.set(fieldId, field);
    }
    
    // Get field value
    getFieldValue(fieldId) {
        const field = this.fields.get(fieldId);
        if (!field) return null;
        
        const fieldElement = this.container.querySelector(`[data-field-id="${fieldId}"]`);
        if (!fieldElement) return null;
        
        if (field.type === 'select' || field.type === 'dropdown') {
            const dropdown = this.dropdowns.get(fieldId);
            return dropdown ? dropdown.getValue() : null;
        } else {
            const input = fieldElement.querySelector('.field-input');
            if (input) {
                if (input.type === 'checkbox') {
                    return input.checked;
                } else {
                    return input.value;
                }
            }
        }
        
        return null;
    }
    
    // Get all field values
    getFormData() {
        const data = {};
        this.fields.forEach((field, fieldId) => {
            data[fieldId] = this.getFieldValue(fieldId);
        });
        return data;
    }
    
    // Set all field values
    setFormData(data) {
        Object.keys(data).forEach(fieldId => {
            this.setFieldValue(fieldId, data[fieldId]);
        });
    }
    
    // Validate field
    validateField(input) {
        const fieldGroup = input.closest('.field-group');
        if (!fieldGroup) return true;
        
        const fieldId = fieldGroup.dataset.fieldId;
        const field = this.fields.get(fieldId);
        if (!field) return true;
        
        const value = this.getFieldValue(fieldId);
        const isValid = this.isFieldValid(field, value);
        
        fieldGroup.classList.remove('has-error', 'has-success');
        const errorElement = fieldGroup.querySelector('.field-error');
        
        if (!isValid) {
            fieldGroup.classList.add('has-error');
            if (errorElement) errorElement.classList.add('show');
        } else {
            fieldGroup.classList.add('has-success');
            if (errorElement) errorElement.classList.remove('show');
        }
        
        return isValid;
    }
    
    // Check if field is valid
    isFieldValid(field, value) {
        if (field.required && (!value || value === '')) {
            return false;
        }
        
        if (field.type === 'email' && value) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return emailRegex.test(value);
        }
        
        if (field.type === 'number' && value) {
            const num = parseFloat(value);
            if (isNaN(num)) return false;
            if (field.min !== null && num < field.min) return false;
            if (field.max !== null && num > field.max) return false;
        }
        
        return true;
    }
    
    // Validate all fields
    validateForm() {
        let isValid = true;
        
        this.fields.forEach((field, fieldId) => {
            const fieldElement = this.container.querySelector(`[data-field-id="${fieldId}"]`);
            if (fieldElement) {
                const input = fieldElement.querySelector('.field-input');
                if (input) {
                    if (!this.validateField(input)) {
                        isValid = false;
                    }
                }
            }
        });
        
        return isValid;
    }
    
    // Show modal
    show() {
        const modalInstance = bootstrap.Modal.getOrCreateInstance(this.modal);
        // Remove inert when showing the modal
        this.modal.removeAttribute('inert');
        modalInstance.show();
    }
    
    // Hide modal
    hide() {
        const modalInstance = bootstrap.Modal.getOrCreateInstance(this.modal);
        // Use inert instead of aria-hidden to prevent focus issues
        this.modal.setAttribute('inert', '');
        modalInstance.hide();
    }
    
    // Set loading state
    setLoading(loading) {
        this.isLoading = loading;
        const loadingElement = this.container.querySelector('.modal-loading');
        const saveBtn = this.container.querySelector('#save-edit-btn');
        
        if (loading) {
            if (loadingElement) loadingElement.style.display = 'flex';
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Kaydediliyor...';
            }
        } else {
            if (loadingElement) loadingElement.style.display = 'none';
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = `<i class="fas fa-save me-1"></i><span class="save-btn-text">${this.options.saveButtonText}</span>`;
            }
        }
    }
    
    // Handle save
    async handleSave() {
        if (!this.validateForm()) {
            return;
        }
        
        const formData = this.getFormData();
        
        if (this.onSave) {
            try {
                this.setLoading(true);
                await this.onSave(formData);
            } catch (error) {
                console.error('Save error:', error);
            } finally {
                this.setLoading(false);
            }
        }
    }
    
    // Handle cancel
    handleCancel() {
        if (this.onCancel) {
            this.onCancel();
        }
    }
    
    // Set save callback
    onSaveCallback(callback) {
        this.onSave = callback;
        return this;
    }
    
    // Set cancel callback
    onCancelCallback(callback) {
        this.onCancel = callback;
        return this;
    }
    
    // Update modal title
    setTitle(title) {
        this.options.title = title;
        const titleElement = this.container.querySelector('.modal-title-text');
        if (titleElement) {
            titleElement.textContent = title;
        }
        return this; // Return this for method chaining
    }
    
    // Update modal icon
    setIcon(icon) {
        this.options.icon = icon;
        const iconElement = this.container.querySelector('.modal-icon');
        if (iconElement) {
            iconElement.className = `modal-icon ${icon} me-2`;
        } else {
            console.warn('Modal icon element not found');
        }
        return this; // Return this for method chaining
    }
    
    // Update save button text
    setSaveButtonText(text) {
        this.options.saveButtonText = text;
        const saveBtnText = this.container.querySelector('.save-btn-text');
        if (saveBtnText) {
            saveBtnText.textContent = text;
        }
        return this; // Return this for method chaining
    }
    
    // Clear form
    clearForm() {
        this.fields.forEach((field, fieldId) => {
            this.setFieldValue(fieldId, '');
        });
        return this; // Return this for method chaining
    }
    
    // Clear all form data and structure
    clearAll() {
        // Clear dropdowns
        this.dropdowns.forEach(dropdown => {
            dropdown.destroy();
        });
        this.dropdowns.clear();
        
        // Clear fields
        this.fields.clear();
        
        // Clear sections
        this.sections = [];
        
        // Clear form HTML
        if (this.form) {
            this.form.innerHTML = '';
        }
        
        return this; // Return this for method chaining
    }
    
    // Reset form
    resetForm() {
        this.fields.forEach((field, fieldId) => {
            this.setFieldValue(fieldId, field.defaultValue || '');
        });
    }
    
    // Destroy modal
    destroy() {
        this.dropdowns.forEach(dropdown => {
            dropdown.destroy();
        });
        this.dropdowns.clear();
        this.fields.clear();
        this.sections = [];
        this.container.innerHTML = '';
    }
}
