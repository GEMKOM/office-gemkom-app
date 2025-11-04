import { ModernDropdown } from '../dropdown/dropdown.js';

/**
 * Reusable Filters Component
 * Supports dynamic filter creation with different types and configurations
 */
export class FiltersComponent {
    constructor(containerId, options = {}) {
        this.containerId = containerId;
        this.container = document.getElementById(containerId);
        this.filters = [];
        this.dropdowns = new Map();
        this.options = {
            title: 'Filtreler',
            showClearButton: true,
            showApplyButton: true,
            applyButtonText: 'Filtrele',
            clearButtonText: 'Temizle',
            onApply: null,
            onClear: null,
            onFilterChange: null,
            ...options
        };
        
        this.init();
    }

    /**
     * Initialize the filters component
     */
    init() {
        if (!this.container) {
            console.error(`Filters container with id '${this.containerId}' not found`);
            return;
        }

        this.render();
    }

    /**
     * Render the filters component HTML
     */
    render() {
        this.container.innerHTML = `
            <div class="filters-component" id="filters-component">
                <div class="row mb-3">
                    <div class="col-12">
                        <div class="dashboard-card compact">
                            <div class="card-header">
                                <h6 class="card-title mb-0">
                                    <i class="fas fa-filter me-2 text-primary"></i>
                                    <span id="filters-title">${this.options.title}</span>
                                </h6>
                            </div>
                            <div class="card-body py-3">
                                <div class="row g-2" id="filters-container">
                                    <!-- Filter fields will be dynamically inserted here -->
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Setup event listeners for the component
     */
    setupEventListeners() {
        const applyBtn = this.container.querySelector('#apply-filters');
        const clearBtn = this.container.querySelector('#clear-filters');

        if (applyBtn && this.options.showApplyButton) {
            applyBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.applyFilters();
            });
        }

        if (clearBtn && this.options.showClearButton) {
            clearBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.clearFilters();
            });
        }
    }

    /**
     * Add a text input filter
     * @param {Object} config - Filter configuration
     * @param {string} config.id - Unique filter ID
     * @param {string} config.label - Filter label
     * @param {string} config.placeholder - Input placeholder
     * @param {string} config.type - Input type (text, number, email, etc.)
     * @param {string} config.value - Default value
     * @param {number} config.colSize - Bootstrap column size (default: 2)
     */
    addTextFilter(config) {
        const filter = {
            type: 'text',
            id: config.id,
            label: config.label,
            placeholder: config.placeholder || '',
            inputType: config.type || 'text',
            value: config.value || '',
            colSize: config.colSize || 2,
            ...config
        };

        this.filters.push(filter);
        this.renderFilters();
        return this;
    }

    /**
     * Add a dropdown filter
     * @param {Object} config - Filter configuration
     * @param {string} config.id - Unique filter ID
     * @param {string} config.label - Filter label
     * @param {Array} config.options - Dropdown options array
     * @param {string} config.placeholder - Dropdown placeholder
     * @param {string} config.value - Default selected value
     * @param {number} config.colSize - Bootstrap column size (default: 2)
     * @param {boolean} config.searchable - Enable search in dropdown (default: true)
     */
    addDropdownFilter(config) {
        const filter = {
            type: 'dropdown',
            id: config.id,
            label: config.label,
            options: config.options || [],
            placeholder: config.placeholder || 'Seçiniz',
            value: config.value || '',
            colSize: config.colSize || 2,
            searchable: config.searchable !== false,
            ...config
        };

        this.filters.push(filter);
        this.renderFilters();
        return this;
    }

    /**
     * Add a date filter
     * @param {Object} config - Filter configuration
     * @param {string} config.id - Unique filter ID
     * @param {string} config.label - Filter label
     * @param {string} config.value - Default date value
     * @param {number} config.colSize - Bootstrap column size (default: 2)
     */
    addDateFilter(config) {
        const filter = {
            type: 'date',
            id: config.id,
            label: config.label,
            value: config.value || '',
            colSize: config.colSize || 2,
            ...config
        };

        this.filters.push(filter);
        this.renderFilters();
        return this;
    }

    /**
     * Add a datetime-local filter
     * @param {Object} config - Filter configuration
     * @param {string} config.id - Unique filter ID
     * @param {string} config.label - Filter label
     * @param {string} config.value - Default datetime value
     * @param {number} config.colSize - Bootstrap column size (default: 2)
     */
    addDatetimeFilter(config) {
        const filter = {
            type: 'datetime-local',
            id: config.id,
            label: config.label,
            value: config.value || '',
            colSize: config.colSize || 2,
            ...config
        };

        this.filters.push(filter);
        this.renderFilters();
        return this;
    }

    /**
     * Add a select filter (native HTML select)
     * @param {Object} config - Filter configuration
     * @param {string} config.id - Unique filter ID
     * @param {string} config.label - Filter label
     * @param {Array} config.options - Select options array
     * @param {string} config.placeholder - Select placeholder
     * @param {string} config.value - Default selected value
     * @param {number} config.colSize - Bootstrap column size (default: 2)
     */
    addSelectFilter(config) {
        const filter = {
            type: 'select',
            id: config.id,
            label: config.label,
            options: config.options || [],
            placeholder: config.placeholder || 'Seçiniz',
            value: config.value || '',
            colSize: config.colSize || 2,
            ...config
        };

        this.filters.push(filter);
        this.renderFilters();
        return this;
    }

    /**
     * Add a checkbox filter
     * @param {Object} config - Filter configuration
     * @param {string} config.id - Unique filter ID
     * @param {string} config.label - Filter label
     * @param {boolean} config.checked - Default checked state
     * @param {number} config.colSize - Bootstrap column size (default: 2)
     */
    addCheckboxFilter(config) {
        const filter = {
            type: 'checkbox',
            id: config.id,
            label: config.label,
            checked: config.checked || false,
            colSize: config.colSize || 2,
            ...config
        };

        this.filters.push(filter);
        this.renderFilters();
        return this;
    }

    /**
     * Render all filters
     */
    renderFilters() {
        const container = this.container.querySelector('#filters-container');
        if (!container) return;

        let filtersHTML = '';

        // Calculate total column size of filters
        const totalFilterSize = this.filters.reduce((sum, filter) => sum + filter.colSize, 0);
        
        // Calculate available space for filters (12 - 2 for buttons = 10 columns)
        const availableSpace = 10;
        
        // Render filter fields with adjusted sizes
        this.filters.forEach(filter => {
            filtersHTML += this.renderFilterField(filter, totalFilterSize, availableSpace);
        });

        // Add action buttons on the same row
        if (this.options.showApplyButton || this.options.showClearButton) {
            filtersHTML += this.renderActionButtons();
        }

        container.innerHTML = filtersHTML;

        // Initialize dropdowns after rendering
        this.initializeDropdowns();
        this.setupFilterEventListeners();
        this.setupEventListeners();
    }

    /**
     * Render a single filter field
     * @param {Object} filter - Filter configuration
     * @param {number} totalFilterSize - Total column size of all filters
     * @param {number} availableSpace - Available space for filters
     * @returns {string} HTML string
     */
    renderFilterField(filter, totalFilterSize, availableSpace) {
        // Calculate adjusted column size
        let adjustedColSize = filter.colSize;
        
        // If filters exceed available space, reduce their sizes proportionally
        if (totalFilterSize > availableSpace) {
            const reductionRatio = availableSpace / totalFilterSize;
            adjustedColSize = Math.max(1, Math.floor(filter.colSize * reductionRatio));
        }
        
        const colClass = `col-md-${adjustedColSize}`;
        
        switch (filter.type) {
            case 'text':
                return `
                    <div class="${colClass}">
                        <label class="form-label small mb-1">${filter.label}</label>
                        <input type="${filter.inputType}" 
                               class="form-control form-control-sm" 
                               id="${filter.id}" 
                               placeholder="${filter.placeholder}"
                               value="${filter.value}">
                    </div>
                `;

            case 'dropdown':
                return `
                    <div class="${colClass}">
                        <label class="form-label small mb-1">${filter.label}</label>
                        <div id="${filter.id}-container"></div>
                    </div>
                `;

            case 'date':
                return `
                    <div class="${colClass}">
                        <label class="form-label small mb-1">${filter.label}</label>
                        <input type="date" 
                               class="form-control form-control-sm" 
                               id="${filter.id}" 
                               value="${filter.value}">
                    </div>
                `;

            case 'select':
                const optionsHTML = filter.options.map(option => 
                    `<option value="${option.value}" ${option.value === filter.value ? 'selected' : ''}>
                        ${option.label}
                    </option>`
                ).join('');
                
                return `
                    <div class="${colClass}">
                        <label class="form-label small mb-1">${filter.label}</label>
                        <select class="form-control form-control-sm" id="${filter.id}">
                            <option value="">${filter.placeholder}</option>
                            ${optionsHTML}
                        </select>
                    </div>
                `;

            case 'datetime-local':
                return `
                    <div class="${colClass}">
                        <label class="form-label small mb-1">${filter.label}</label>
                        <input type="datetime-local" 
                               class="form-control form-control-sm" 
                               id="${filter.id}" 
                               value="${filter.value}">
                    </div>
                `;

            case 'checkbox':
                return `
                    <div class="${colClass}">
                        <label class="form-label small mb-1">${filter.label}</label>
                        <div class="checkbox-container">
                            <input class="form-check-input" 
                                   type="checkbox" 
                                   id="${filter.id}" 
                                   ${filter.checked ? 'checked' : ''}>
                            <span class="checkbox-label">${filter.label}</span>
                        </div>
                    </div>
                `;

            case 'date-range':
                return `
                    <div class="${colClass}">
                        <label class="form-label small mb-1">${filter.label}</label>
                        <div class="row g-2">
                            <div class="col-6">
                                <input type="date" 
                                       class="form-control form-control-sm" 
                                       id="${filter.id}-start" 
                                       placeholder="Başlangıç"
                                       value="${filter.startDate}">
                            </div>
                            <div class="col-6">
                                <input type="date" 
                                       class="form-control form-control-sm" 
                                       id="${filter.id}-end" 
                                       placeholder="Bitiş"
                                       value="${filter.endDate}">
                            </div>
                        </div>
                    </div>
                `;

            default:
                return '';
        }
    }

    /**
     * Render action buttons
     * @returns {string} HTML string
     */
    renderActionButtons() {
        const buttons = [];
        
        if (this.options.showApplyButton) {
            buttons.push(`
                <button type="button" class="btn btn-sm btn-primary" id="apply-filters">
                    <i class="fas fa-search me-1"></i>${this.options.applyButtonText}
                </button>
            `);
        }
        
        if (this.options.showClearButton) {
            buttons.push(`
                <button type="button" class="btn btn-sm btn-outline-secondary" id="clear-filters">
                    <i class="fas fa-times me-1"></i>${this.options.clearButtonText}
                </button>
            `);
        }

        return `
            <div class="col-md-2 ms-auto">
                <label class="form-label small mb-1">&nbsp;</label>
                <div class="d-grid gap-1">
                    ${buttons.join('')}
                </div>
            </div>
        `;
    }

    /**
     * Initialize dropdown components
     */
    initializeDropdowns() {
        this.filters.forEach(filter => {
            if (filter.type === 'dropdown') {
                const container = document.getElementById(`${filter.id}-container`);
                if (container) {
                    const dropdown = new ModernDropdown(container, {
                        placeholder: filter.placeholder,
                        searchable: filter.searchable
                    });
                    
                    // Convert options to items format for ModernDropdown
                    const items = filter.options.map(option => ({
                        value: option.value,
                        text: option.label
                    }));
                    dropdown.setItems(items);
                    
                    // Set initial value if provided
                    if (filter.value) {
                        dropdown.setValue(filter.value);
                    }
                    
                    this.dropdowns.set(filter.id, dropdown);
                    
                    // Add change event listener
                    dropdown.onChange = (value) => {
                        if (this.options.onFilterChange) {
                            this.options.onFilterChange(filter.id, value);
                        }
                    };
                }
            }
        });
    }

    /**
     * Setup event listeners for filter inputs
     */
    setupFilterEventListeners() {
        this.filters.forEach(filter => {
            const element = document.getElementById(filter.id);
            if (element) {
                // Add enter key support for text inputs
                if (filter.type === 'text') {
                    element.addEventListener('keypress', (e) => {
                        if (e.key === 'Enter') {
                            this.applyFilters();
                        }
                    });
                }

                // Add change event listener
                element.addEventListener('change', (e) => {
                    if (this.options.onFilterChange) {
                        let value;
                        if (filter.type === 'checkbox') {
                            value = e.target.checked;
                        } else {
                            value = e.target.value;
                        }
                        this.options.onFilterChange(filter.id, value);
                    }
                });

                // Add click event listener for checkbox container
                if (filter.type === 'checkbox') {
                    const container = element.closest('.checkbox-container');
                    if (container) {
                        container.addEventListener('click', (e) => {
                            // Prevent double-triggering if clicking directly on the checkbox
                            if (e.target !== element) {
                                element.checked = !element.checked;
                                // Trigger change event manually
                                const changeEvent = new Event('change', { bubbles: true });
                                element.dispatchEvent(changeEvent);
                            }
                        });
                    }
                }
            }
        });
    }

    /**
     * Get all filter values
     * @returns {Object} Object with filter ID as key and value as value
     */
    getFilterValues() {
        const values = {};
        
        this.filters.forEach(filter => {
            if (filter.type === 'dropdown') {
                const dropdown = this.dropdowns.get(filter.id);
                values[filter.id] = dropdown ? dropdown.getValue() : '';
            } else if (filter.type === 'checkbox') {
                const element = document.getElementById(filter.id);
                values[filter.id] = element ? element.checked : false;
            } else if (filter.type === 'date-range') {
                const startElement = document.getElementById(`${filter.id}-start`);
                const endElement = document.getElementById(`${filter.id}-end`);
                values[filter.id] = {
                    start: startElement ? startElement.value : '',
                    end: endElement ? endElement.value : ''
                };
            } else {
                const element = document.getElementById(filter.id);
                values[filter.id] = element ? element.value : '';
            }
        });

        return values;
    }

    /**
     * Set filter values
     * @param {Object} values - Object with filter ID as key and value as value
     */
    setFilterValues(values) {
        Object.keys(values).forEach(filterId => {
            const filter = this.filters.find(f => f.id === filterId);
            if (filter) {
                if (filter.type === 'dropdown') {
                    const dropdown = this.dropdowns.get(filterId);
                    if (dropdown) {
                        dropdown.setValue(values[filterId]);
                    }
                } else if (filter.type === 'checkbox') {
                    const element = document.getElementById(filterId);
                    if (element) {
                        element.checked = values[filterId];
                    }
                } else if (filter.type === 'date-range') {
                    const startElement = document.getElementById(`${filterId}-start`);
                    const endElement = document.getElementById(`${filterId}-end`);
                    if (startElement && values[filterId].start) {
                        startElement.value = values[filterId].start;
                    }
                    if (endElement && values[filterId].end) {
                        endElement.value = values[filterId].end;
                    }
                } else {
                    const element = document.getElementById(filterId);
                    if (element) {
                        element.value = values[filterId];
                    }
                }
            }
        });
    }

    /**
     * Clear all filters
     */
    clearFilters() {
        this.filters.forEach(filter => {
            if (filter.type === 'dropdown') {
                const dropdown = this.dropdowns.get(filter.id);
                if (dropdown) {
                    dropdown.setValue('');
                }
            } else if (filter.type === 'checkbox') {
                const element = document.getElementById(filter.id);
                if (element) {
                    element.checked = false;
                }
            } else if (filter.type === 'date-range') {
                const startElement = document.getElementById(`${filter.id}-start`);
                const endElement = document.getElementById(`${filter.id}-end`);
                if (startElement) {
                    startElement.value = '';
                }
                if (endElement) {
                    endElement.value = '';
                }
            } else {
                const element = document.getElementById(filter.id);
                if (element) {
                    element.value = '';
                }
            }
        });

        if (this.options.onClear) {
            this.options.onClear();
        }
    }

    /**
     * Apply filters
     */
    applyFilters() {
        const values = this.getFilterValues();
        
        if (this.options.onApply) {
            this.options.onApply(values);
        }
    }

    /**
     * Remove a filter by ID
     * @param {string} filterId - Filter ID to remove
     */
    removeFilter(filterId) {
        this.filters = this.filters.filter(f => f.id !== filterId);
        this.dropdowns.delete(filterId);
        this.renderFilters();
    }

    /**
     * Remove all filters
     */
    removeAllFilters() {
        this.filters = [];
        this.dropdowns.clear();
        this.renderFilters();
    }

    /**
     * Update filter options (for dropdowns)
     * @param {string} filterId - Filter ID to update
     * @param {Array} options - New options array
     */
    updateFilterOptions(filterId, options) {
        const filter = this.filters.find(f => f.id === filterId);
        if (filter && filter.type === 'dropdown') {
            filter.options = options;
            const dropdown = this.dropdowns.get(filterId);
            if (dropdown) {
                // Convert options to items format for ModernDropdown
                const items = options.map(option => ({
                    value: option.value,
                    text: option.label
                }));
                dropdown.setItems(items);
            }
        }
    }

    /**
     * Show loading state
     */
    showLoading() {
        const component = this.container.querySelector('.filters-component');
        if (component) {
            component.classList.add('loading');
        }
    }

    /**
     * Hide loading state
     */
    hideLoading() {
        const component = this.container.querySelector('.filters-component');
        if (component) {
            component.classList.remove('loading');
        }
    }

    /**
     * Add a date range filter
     * @param {Object} config - Filter configuration
     * @param {string} config.id - Unique filter ID
     * @param {string} config.label - Filter label
     * @param {string} config.startDate - Default start date value
     * @param {string} config.endDate - Default end date value
     * @param {number} config.colSize - Bootstrap column size (default: 3)
     */
    addDateRangeFilter(config) {
        const filter = {
            type: 'date-range',
            id: config.id,
            label: config.label,
            startDate: config.startDate || '',
            endDate: config.endDate || '',
            colSize: config.colSize || 3,
            ...config
        };

        this.filters.push(filter);
        this.renderFilters();
        return this;
    }

    /**
     * Destroy the component
     */
    destroy() {
        this.dropdowns.forEach(dropdown => {
            if (dropdown.destroy) {
                dropdown.destroy();
            }
        });
        this.dropdowns.clear();
        this.filters = [];
        
        if (this.container) {
            this.container.innerHTML = '';
        }
    }
}
