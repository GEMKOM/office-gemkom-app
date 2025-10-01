// Display Modal Component
export class DisplayModal {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            throw new Error(`Container with id "${containerId}" not found`);
        }
        
        this.options = {
            title: 'Görüntüle',
            icon: 'fas fa-eye',
            showEditButton: false,
            editButtonText: 'Düzenle',
            size: 'lg', // sm, lg, xl
            fullscreen: false, // Enable fullscreen mode
            ...options
        };
        
        this.modal = null;
        this.content = null;
        this.sections = [];
        this.fields = new Map();
        this.isLoading = false;
        this.onEdit = null;
        this.onClose = null;
        
        this.init();
    }
    
    init() {
        this.createModal();
        this.bindEvents();
    }
    
    createModal() {
        // Create modal HTML
        const modalSizeClass = this.options.fullscreen ? 'modal-fullscreen' : `modal-${this.options.size}`;
        const modalHtml = `
            <div class="modal fade display-modal-container" id="displayModal" tabindex="-1" aria-hidden="true">
                <div class="modal-dialog ${modalSizeClass}">
                    <div class="modal-content compact">
                        <div class="modal-header compact">
                            <h6 class="modal-title">
                                <i class="modal-icon ${this.options.icon} me-2"></i>
                                <span class="modal-title-text">${this.options.title}</span>
                            </h6>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body compact">
                            <div id="display-modal-content">
                                <!-- Dynamic sections will be rendered here -->
                            </div>
                            <div class="modal-loading" style="display: none;">
                                <div class="spinner"></div>
                            </div>
                        </div>
                        <div class="modal-footer compact">
                            <button type="button" class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal">
                                <i class="fas fa-times me-1"></i>Kapat
                            </button>
                            <button type="button" class="btn btn-sm btn-primary" id="edit-btn" style="display: ${this.options.showEditButton ? 'inline-block' : 'none'};">
                                <i class="fas fa-edit me-1"></i>
                                <span class="edit-btn-text">${this.options.editButtonText}</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        this.container.innerHTML = modalHtml;
        this.modal = this.container.querySelector('#displayModal');
        this.content = this.container.querySelector('#display-modal-content');
    }
    
    bindEvents() {
        // Edit button event
        const editBtn = this.container.querySelector('#edit-btn');
        editBtn.addEventListener('click', () => {
            this.handleEdit();
        });
        
        // Modal events
        this.modal.addEventListener('hidden.bs.modal', () => {
            this.handleClose();
        });
        
        // Copy to clipboard functionality
        this.content.addEventListener('click', (e) => {
            if (e.target.classList.contains('copyable')) {
                this.copyToClipboard(e.target);
            }
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
    
    // Add custom HTML content to the last section
    addCustomContent(htmlContent) {
        if (this.sections.length === 0) {
            this.addSection({ title: 'Genel Bilgiler' });
        }
        
        const lastSection = this.sections[this.sections.length - 1];
        if (!lastSection.customContent) {
            lastSection.customContent = '';
        }
        lastSection.customContent += htmlContent;
        return this;
    }
    
    // Add a section with custom content only
    addCustomSection(sectionConfig) {
        const section = {
            id: sectionConfig.id || `section-${Date.now()}`,
            title: sectionConfig.title || null,
            icon: sectionConfig.icon || 'fas fa-info-circle',
            iconColor: sectionConfig.iconColor || 'text-primary',
            customContent: sectionConfig.customContent || '',
            ...sectionConfig
        };
        
        this.sections.push(section);
        return this;
    }
    
    // Render the modal with all sections and fields
    render() {
        this.content.innerHTML = '';
        
        this.sections.forEach(section => {
            const sectionElement = this.createSectionElement(section);
            this.content.appendChild(sectionElement);
        });
        
        return this;
    }
    
    createSectionElement(section) {
        const sectionDiv = document.createElement('div');
        sectionDiv.className = 'display-section compact mb-3';
        sectionDiv.dataset.sectionId = section.id;
        
        // Add title if provided
        if (section.title) {
            const title = document.createElement('h6');
            title.className = `section-subtitle compact ${section.iconColor}`;
            title.innerHTML = `<i class="${section.icon} me-2"></i>${section.title}`;
            sectionDiv.appendChild(title);
        }
        
        // Handle custom content
        if (section.customContent) {
            const customContainer = document.createElement('div');
            customContainer.className = 'custom-content';
            customContainer.innerHTML = section.customContent;
            sectionDiv.appendChild(customContainer);
        }
        
        // Handle regular fields
        if (section.fields && section.fields.length > 0) {
            const fieldsContainer = document.createElement('div');
            fieldsContainer.className = 'row g-2';
            
            section.fields.forEach(field => {
                const fieldElement = this.createFieldElement(field);
                fieldsContainer.appendChild(fieldElement);
            });
            
            sectionDiv.appendChild(fieldsContainer);
        }
        
        return sectionDiv;
    }
    
    createFieldElement(fieldConfig) {
        const field = {
            id: fieldConfig.id || `field-${Date.now()}`,
            name: fieldConfig.name || fieldConfig.id,
            label: fieldConfig.label || 'Alan',
            type: fieldConfig.type || 'text',
            value: fieldConfig.value || '',
            icon: fieldConfig.icon || '',
            colSize: fieldConfig.colSize || 12,
            copyable: fieldConfig.copyable || false,
            format: fieldConfig.format || null,
            ...fieldConfig
        };
        
        // Store field config
        this.fields.set(field.id, field);
        
        const colDiv = document.createElement('div');
        colDiv.className = `col-md-${field.colSize}`;
        
        const fieldDisplay = document.createElement('div');
        fieldDisplay.className = 'field-display mb-2';
        fieldDisplay.dataset.fieldId = field.id;
        
        // Create label
        const label = document.createElement('label');
        label.className = 'field-label';
        if (field.icon) {
            label.innerHTML = `<i class="${field.icon} me-1"></i>${field.label}`;
        } else {
            label.textContent = field.label;
        }
        
        // Create value display
        const valueDisplay = this.createValueElement(field);
        
        fieldDisplay.appendChild(label);
        fieldDisplay.appendChild(valueDisplay);
        
        colDiv.appendChild(fieldDisplay);
        return colDiv;
    }
    
    createValueElement(field) {
        const valueDiv = document.createElement('div');
        valueDiv.className = 'field-value';
        
        // Add type-specific classes
        if (field.type) {
            valueDiv.classList.add(field.type);
        }
        
        // Add copyable class if enabled
        if (field.copyable) {
            valueDiv.classList.add('copyable');
            valueDiv.title = 'Kopyalamak için tıklayın';
        }
        
        // Format and display value based on type
        const displayValue = this.formatValue(field);
        
        if (field.type === 'image' && field.value) {
            const img = document.createElement('img');
            img.src = field.value;
            img.alt = field.label;
            img.onerror = () => {
                valueDiv.textContent = 'Resim yüklenemedi';
                valueDiv.classList.add('empty');
            };
            valueDiv.appendChild(img);
        } else if (field.type === 'badge' && field.value) {
            const badge = document.createElement('span');
            badge.className = `badge ${field.badgeClass || 'bg-primary'}`;
            badge.textContent = field.value;
            valueDiv.appendChild(badge);
        } else if (field.type === 'list' && Array.isArray(field.value)) {
            field.value.forEach((item, index) => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'list-item';
                itemDiv.textContent = typeof item === 'object' ? JSON.stringify(item) : item;
                valueDiv.appendChild(itemDiv);
            });
        } else if (field.type === 'boolean') {
            valueDiv.textContent = field.value ? 'Evet' : 'Hayır';
            valueDiv.classList.add(field.value ? 'true' : 'false');
        } else if (field.type === 'url' && field.value) {
            const link = document.createElement('a');
            link.href = field.value;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = field.value;
            valueDiv.appendChild(link);
        } else if (field.type === 'email' && field.value) {
            const link = document.createElement('a');
            link.href = `mailto:${field.value}`;
            link.textContent = field.value;
            valueDiv.appendChild(link);
        } else {
            valueDiv.textContent = displayValue;
        }
        
        // Add empty class if no value
        if (!field.value && field.value !== 0 && field.value !== false) {
            valueDiv.classList.add('empty');
        }
        
        return valueDiv;
    }
    
    formatValue(field) {
        if (field.value === null || field.value === undefined) {
            return '';
        }
        
        // Custom format function
        if (field.format && typeof field.format === 'function') {
            return field.format(field.value);
        }
        
        // Type-specific formatting
        switch (field.type) {
            case 'date':
                if (field.value instanceof Date) {
                    return field.value.toLocaleDateString('tr-TR');
                } else if (typeof field.value === 'string') {
                    const date = new Date(field.value);
                    return isNaN(date.getTime()) ? field.value : date.toLocaleDateString('tr-TR');
                }
                return field.value;
                
            case 'datetime':
            case 'datetime-local':
                if (field.value instanceof Date) {
                    return field.value.toLocaleString('tr-TR');
                } else if (typeof field.value === 'string') {
                    const date = new Date(field.value);
                    return isNaN(date.getTime()) ? field.value : date.toLocaleString('tr-TR');
                }
                return field.value;
                
            case 'time':
                if (field.value instanceof Date) {
                    return field.value.toLocaleTimeString('tr-TR');
                } else if (typeof field.value === 'string') {
                    const date = new Date(field.value);
                    return isNaN(date.getTime()) ? field.value : date.toLocaleTimeString('tr-TR');
                }
                return field.value;
                
            case 'number':
            case 'currency':
                if (typeof field.value === 'number') {
                    if (field.type === 'currency') {
                        return new Intl.NumberFormat('tr-TR', {
                            style: 'currency',
                            currency: 'TRY'
                        }).format(field.value);
                    }
                    return new Intl.NumberFormat('tr-TR').format(field.value);
                }
                return field.value;
                
            case 'percentage':
                if (typeof field.value === 'number') {
                    return `${field.value}%`;
                }
                return field.value;
                
            case 'json':
                try {
                    return JSON.stringify(field.value, null, 2);
                } catch (e) {
                    return field.value;
                }
                
            default:
                return field.value;
        }
    }
    
    // Set field value
    setFieldValue(fieldId, value) {
        const field = this.fields.get(fieldId);
        if (!field) return;
        
        const fieldElement = this.container.querySelector(`[data-field-id="${fieldId}"]`);
        if (!fieldElement) return;
        
        const valueElement = fieldElement.querySelector('.field-value');
        if (!valueElement) return;
        
        // Update field config
        field.value = value;
        this.fields.set(fieldId, field);
        
        // Recreate value element
        const newValueElement = this.createValueElement(field);
        valueElement.parentNode.replaceChild(newValueElement, valueElement);
    }
    
    // Get field value
    getFieldValue(fieldId) {
        const field = this.fields.get(fieldId);
        return field ? field.value : null;
    }
    
    // Get all field values
    getData() {
        const data = {};
        this.fields.forEach((field, fieldId) => {
            data[fieldId] = field.value;
        });
        return data;
    }
    
    // Set all field values
    setData(data) {
        Object.keys(data).forEach(fieldId => {
            this.setFieldValue(fieldId, data[fieldId]);
        });
    }
    
    // Show modal
    show() {
        const modalInstance = bootstrap.Modal.getOrCreateInstance(this.modal);
        modalInstance.show();
    }
    
    // Hide modal
    hide() {
        const modalInstance = bootstrap.Modal.getOrCreateInstance(this.modal);
        modalInstance.hide();
    }
    
    // Set loading state
    setLoading(loading) {
        this.isLoading = loading;
        const loadingElement = this.container.querySelector('.modal-loading');
        const editBtn = this.container.querySelector('#edit-btn');
        
        if (loading) {
            if (loadingElement) loadingElement.style.display = 'flex';
            if (editBtn) editBtn.disabled = true;
        } else {
            if (loadingElement) loadingElement.style.display = 'none';
            if (editBtn) editBtn.disabled = false;
        }
    }
    
    // Handle edit
    handleEdit() {
        if (this.onEdit) {
            this.onEdit(this.getData());
        }
    }
    
    // Handle close
    handleClose() {
        if (this.onClose) {
            this.onClose();
        }
    }
    
    // Copy to clipboard
    async copyToClipboard(element) {
        try {
            const text = element.textContent || element.innerText;
            await navigator.clipboard.writeText(text);
            
            // Visual feedback
            element.classList.add('copied');
            setTimeout(() => {
                element.classList.remove('copied');
            }, 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
        }
    }
    
    // Set edit callback
    onEditCallback(callback) {
        this.onEdit = callback;
        return this;
    }
    
    // Set close callback
    onCloseCallback(callback) {
        this.onClose = callback;
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
    
    // Show/hide edit button
    setShowEditButton(show) {
        this.options.showEditButton = show;
        const editBtn = this.container.querySelector('#edit-btn');
        if (editBtn) {
            editBtn.style.display = show ? 'inline-block' : 'none';
        }
        return this;
    }
    
    // Update edit button text
    setEditButtonText(text) {
        this.options.editButtonText = text;
        const editBtnText = this.container.querySelector('.edit-btn-text');
        if (editBtnText) {
            editBtnText.textContent = text;
        }
        return this;
    }
    
    // Clear all data
    clearData() {
        // Clear fields
        this.fields.clear();
        
        // Clear sections
        this.sections = [];
        
        // Clear content
        if (this.content) {
            this.content.innerHTML = '';
        }
        
        // Reset modal state
        this.isLoading = false;
        this.onEdit = null;
        this.onClose = null;
    }
    
    // Reset modal to initial state
    reset() {
        // Clear all data
        this.clearData();
        
        // Reset title and icon to defaults
        this.setTitle(this.options.title);
        this.setIcon(this.options.icon);
        this.setShowEditButton(this.options.showEditButton);
        this.setEditButtonText(this.options.editButtonText);
        
        // Reset footer to default
        const modalFooter = this.container.querySelector('.modal-footer');
        if (modalFooter) {
            modalFooter.innerHTML = `
                <button type="button" class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal">
                    <i class="fas fa-times me-1"></i>Kapat
                </button>
                <button type="button" class="btn btn-sm btn-primary" id="edit-btn" style="display: ${this.options.showEditButton ? 'inline-block' : 'none'};">
                    <i class="fas fa-edit me-1"></i>
                    <span class="edit-btn-text">${this.options.editButtonText}</span>
                </button>
            `;
            
            // Re-bind edit button event
            const editBtn = modalFooter.querySelector('#edit-btn');
            if (editBtn) {
                editBtn.addEventListener('click', () => {
                    this.handleEdit();
                });
            }
        }
        
        // Reset loading state
        this.setLoading(false);
    }
    
    // Destroy modal
    destroy() {
        this.fields.clear();
        this.sections = [];
        this.container.innerHTML = '';
    }
}
