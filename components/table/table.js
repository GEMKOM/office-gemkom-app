/**
 * Reusable Table Component
 * Supports customizable columns, actions, and editable functionality
 */
class TableComponent {
    constructor(containerId, options = {}) {
        this.containerId = containerId;
        this.container = document.getElementById(containerId);
        
        // Default options
        this.options = {
            // Table configuration
            columns: [],
            data: [],
            sortable: true,
            pagination: false,
            itemsPerPage: 20,
            currentPage: 1,
            totalItems: 0,
            
            // Editable configuration
            editable: false,
            editableColumns: [],
            onEdit: null,
            onSave: null,
            
            // Actions configuration
            actions: [],
            actionColumnWidth: 'auto',
            
            // Styling
            tableClass: 'table table-hover',
            responsive: true,
            striped: false,
            bordered: false,
            small: false,
            
            // Callbacks
            onRowClick: null,
            onSort: null,
            onPageChange: null,
            
            // Empty state
            emptyMessage: 'Veri bulunamadı',
            emptyIcon: 'fas fa-inbox',
            
            // Loading state
            loading: false,
            
            // Export functionality
            exportable: false,
            exportFormats: ['csv', 'excel'],
            onExport: null,
            
            // Refresh functionality
            refreshable: false,
            onRefresh: null,
            
            ...options
        };
        
        this.currentSortField = null;
        this.currentSortDirection = 'asc';
        this.isInlineEditing = false;
        
        this.init();
    }
    
    init() {
        if (!this.container) {
            console.error(`Table container with id '${this.containerId}' not found`);
            return;
        }
        
        this.render();
        this.setupEventListeners();
    }
    
    render() {
        const tableClass = this.buildTableClass();
        
        this.container.innerHTML = `
            <div class="dashboard-card">
                <div class="card-header">
                    <h5 class="card-title">
                        <i class="fas fa-table me-2 text-primary"></i>
                        ${this.options.title || 'Tablo'}
                    </h5>
                    <div class="card-actions">
                        ${this.options.refreshable ? `
                            <button class="btn btn-sm btn-outline-secondary" id="${this.containerId}-refresh">
                                <i class="fas fa-sync-alt me-1"></i>Yenile
                            </button>
                        ` : ''}
                        ${this.options.exportable ? `
                            <button class="btn btn-sm btn-outline-secondary" id="${this.containerId}-export">
                                <i class="fas fa-download me-1"></i>Dışa Aktar
                            </button>
                        ` : ''}
                    </div>
                </div>
                <div class="card-body">
                    ${this.options.responsive ? '<div class="table-responsive">' : ''}
                        <table class="${tableClass}" id="${this.containerId}-table">
                            <thead>
                                ${this.renderHeader()}
                            </thead>
                            <tbody id="${this.containerId}-tbody">
                                ${this.renderBody()}
                            </tbody>
                        </table>
                    ${this.options.responsive ? '</div>' : ''}
                </div>
                ${this.options.pagination ? this.renderPagination() : ''}
            </div>
        `;
    }
    
    buildTableClass() {
        let classes = [this.options.tableClass];
        
        if (this.options.striped) classes.push('table-striped');
        if (this.options.bordered) classes.push('table-bordered');
        if (this.options.small) classes.push('table-sm');
        
        return classes.join(' ');
    }
    
    renderHeader() {
        const headers = this.options.columns.map(column => {
            const sortable = this.options.sortable && column.sortable !== false;
            const sortClass = sortable ? 'sortable' : '';
            
            // Determine sort icon based on current sort state
            let sortIcon = '';
            if (sortable) {
                if (this.currentSortField === column.field) {
                    sortIcon = this.currentSortDirection === 'asc' ? 
                        '<i class="fas fa-sort-up sort-icon"></i>' : 
                        '<i class="fas fa-sort-down sort-icon"></i>';
                } else {
                    sortIcon = '<i class="fas fa-sort sort-icon"></i>';
                }
            }
            
            return `
                <th class="${sortClass}" data-field="${column.field}">
                    ${column.label} ${sortIcon}
                </th>
            `;
        });
        
        // Add actions column if actions are defined
        if (this.options.actions.length > 0) {
            headers.push(`
                <th style="width: ${this.options.actionColumnWidth}">İşlemler</th>
            `);
        }
        
        return `<tr>${headers.join('')}</tr>`;
    }
    
    renderBody() {
        if (this.options.loading) {
            return this.renderLoadingState();
        }
        
        if (this.options.data.length === 0) {
            return this.renderEmptyState();
        }
        
        const startIndex = (this.options.currentPage - 1) * this.options.itemsPerPage;
        const endIndex = startIndex + this.options.itemsPerPage;
        const pageData = this.options.pagination ? 
            this.options.data.slice(startIndex, endIndex) : 
            this.options.data;
        
        return pageData.map((row, index) => this.renderRow(row, startIndex + index)).join('');
    }
    
    renderRow(row, rowIndex) {
        const cells = this.options.columns.map(column => {
            const value = this.getCellValue(row, column);
            const isEditable = this.isColumnEditable(column.field);
            const editableClass = isEditable ? 'editable-cell' : '';
            const dataAttributes = isEditable ? 
                `data-field="${column.field}" data-row-index="${rowIndex}"` : '';
            
            return `
                <td class="${editableClass}" ${dataAttributes}>
                    ${this.formatCellValue(value, column, row)}
                </td>
            `;
        });
        
        // Add actions cell
        if (this.options.actions.length > 0) {
            cells.push(`
                <td>
                    <div class="action-buttons">
                        ${this.renderActions(row, rowIndex)}
                    </div>
                </td>
            `);
        }
        
        const rowClick = this.options.onRowClick ? 
            `onclick="this.dispatchEvent(new CustomEvent('rowClick', {detail: {row: ${JSON.stringify(row)}, index: ${rowIndex}}}))"` : '';
        
        return `<tr ${rowClick}>${cells.join('')}</tr>`;
    }
    
    renderActions(row, rowIndex) {
        return this.options.actions.map(action => {
            const isVisible = typeof action.visible === 'function' ? 
                action.visible(row, rowIndex) : 
                (action.visible !== false);
            
            if (!isVisible) return '';
            
            return `
                <button class="btn btn-sm ${action.class || 'btn-outline-secondary'} action-btn" 
                        title="${action.title || action.label}" 
                        data-action="${action.key}"
                        data-row-index="${rowIndex}">
                    <i class="${action.icon}"></i>
                </button>
            `;
        }).join('');
    }
    
    renderLoadingState() {
        const colspan = this.options.columns.length + (this.options.actions.length > 0 ? 1 : 0);
        return `
            <tr>
                <td colspan="${colspan}" class="text-center">
                    <div class="loading-state">
                        <i class="fas fa-spinner fa-spin"></i>
                        <p>Yükleniyor...</p>
                    </div>
                </td>
            </tr>
        `;
    }
    
    renderEmptyState() {
        const colspan = this.options.columns.length + (this.options.actions.length > 0 ? 1 : 0);
        return `
            <tr>
                <td colspan="${colspan}" class="text-center">
                    <div class="empty-state">
                        <i class="${this.options.emptyIcon}"></i>
                        <h5>Veri Bulunamadı</h5>
                        <p>${this.options.emptyMessage}</p>
                    </div>
                </td>
            </tr>
        `;
    }
    
    renderPagination() {
        const totalPages = Math.ceil(this.options.totalItems / this.options.itemsPerPage);
        if (totalPages <= 1) return '';
        
        let html = '<div class="card-footer"><nav><ul class="pagination justify-content-center">';
        
        // Previous button
        html += `
            <li class="page-item ${this.options.currentPage === 1 ? 'disabled' : ''}">
                <a class="page-link" href="#" data-page="${this.options.currentPage - 1}">
                    <i class="fas fa-chevron-left"></i>
                </a>
            </li>
        `;
        
        // Page numbers
        const startPage = Math.max(1, this.options.currentPage - 2);
        const endPage = Math.min(totalPages, this.options.currentPage + 2);
        
        for (let i = startPage; i <= endPage; i++) {
            html += `
                <li class="page-item ${i === this.options.currentPage ? 'active' : ''}">
                    <a class="page-link" href="#" data-page="${i}">${i}</a>
                </li>
            `;
        }
        
        // Next button
        html += `
            <li class="page-item ${this.options.currentPage === totalPages ? 'disabled' : ''}">
                <a class="page-link" href="#" data-page="${this.options.currentPage + 1}">
                    <i class="fas fa-chevron-right"></i>
                </a>
            </li>
        `;
        
        html += '</ul></nav></div>';
        return html;
    }
    
    setupEventListeners() {
        // Sort functionality
        if (this.options.sortable) {
            const sortableHeaders = this.container.querySelectorAll('.sortable');
            sortableHeaders.forEach(header => {
                header.addEventListener('click', (e) => {
                    e.preventDefault();
                    const field = header.dataset.field;
                    this.handleSort(field);
                });
            });
        }
        
        // Pagination
        if (this.options.pagination) {
            const paginationLinks = this.container.querySelectorAll('.page-link[data-page]');
            paginationLinks.forEach(link => {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    const page = parseInt(link.dataset.page);
                    if (page >= 1 && page <= Math.ceil(this.options.totalItems / this.options.itemsPerPage)) {
                        this.changePage(page);
                    }
                });
            });
        }
        
        // Refresh button
        if (this.options.refreshable) {
            const refreshBtn = this.container.querySelector(`#${this.containerId}-refresh`);
            if (refreshBtn) {
                refreshBtn.addEventListener('click', () => {
                    if (this.options.onRefresh) {
                        this.options.onRefresh();
                    }
                });
            }
        }
        
        // Export button
        if (this.options.exportable) {
            const exportBtn = this.container.querySelector(`#${this.containerId}-export`);
            if (exportBtn) {
                exportBtn.addEventListener('click', () => {
                    if (this.options.onExport) {
                        this.options.onExport();
                    }
                });
            }
        }
        
        // Row click events
        if (this.options.onRowClick) {
            this.container.addEventListener('rowClick', (e) => {
                this.options.onRowClick(e.detail.row, e.detail.index);
            });
        }
        
        // Action click events
        this.container.addEventListener('click', (e) => {
            if (e.target.closest('.action-btn')) {
                e.preventDefault();
                const button = e.target.closest('.action-btn');
                const actionKey = button.dataset.action;
                const rowIndex = parseInt(button.dataset.rowIndex);
                const row = this.options.data[rowIndex];
                
                const action = this.options.actions.find(a => a.key === actionKey);
                if (action && action.onClick) {
                    action.onClick(row, rowIndex);
                } else {
                    console.log('Action not found or no onClick handler:', actionKey);
                }
            }
        });
        
        // Inline editing
        if (this.options.editable) {
            this.setupInlineEditing();
        }
    }
    
    setupInlineEditing() {
        const editableCells = this.container.querySelectorAll('.editable-cell');
        editableCells.forEach(cell => {
            cell.addEventListener('click', (e) => {
                if (this.isInlineEditing) return;
                this.startInlineEdit(cell);
            });
        });
    }
    
    startInlineEdit(cell) {
        if (this.isInlineEditing) return;
        
        const field = cell.dataset.field;
        const rowIndex = parseInt(cell.dataset.rowIndex);
        const row = this.options.data[rowIndex];
        const currentValue = this.getCellValue(row, { field });
        
        this.isInlineEditing = true;
        this.currentEditingCell = cell;
        const originalContent = cell.innerHTML;
        
        // Create input element based on field type
        const input = this.createInputElement(field, currentValue);
        
        cell.innerHTML = '';
        cell.appendChild(input);
        input.focus();
        
        // Handle save
        const handleSave = () => {
            const newValue = input.value;
            this.finishInlineEdit(cell, field, rowIndex, newValue, originalContent);
        };
        
        // Handle cancel
        const handleCancel = () => {
            cell.innerHTML = originalContent;
            this.isInlineEditing = false;
        };
        
        this.isProcessing = false;
        
        input.addEventListener('blur', () => {
            if (!this.isProcessing) {
                handleSave();
            }
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.isProcessing = true;
                handleSave();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                handleCancel();
            }
        });
    }
    
    createInputElement(field, value) {
        const column = this.options.columns.find(col => col.field === field);
        
        if (column.type === 'select' && column.options) {
            const select = document.createElement('select');
            select.className = 'form-control form-control-sm';
            
            // Get the current row data for dynamic options
            const rowIndex = parseInt(this.currentEditingCell?.dataset.rowIndex || '0');
            const row = this.options.data[rowIndex];
            
            let options = [];
            if (typeof column.options === 'function') {
                // If options is a function, call it with the row data
                options = column.options(row);
            } else {
                // If options is an array, use it directly
                options = column.options;
            }
            
            options.forEach(option => {
                const optionEl = document.createElement('option');
                optionEl.value = option.value;
                optionEl.textContent = option.label;
                optionEl.selected = option.value == value;
                select.appendChild(optionEl);
            });
            
            return select;
        } else if (column.type === 'date') {
            const input = document.createElement('input');
            input.type = 'date';
            input.className = 'form-control form-control-sm';
            input.value = value;
            return input;
        } else {
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'form-control form-control-sm';
            input.value = value;
            return input;
        }
    }
    
    async finishInlineEdit(cell, field, rowIndex, newValue, originalContent) {
        const row = this.options.data[rowIndex];
        const oldValue = this.getCellValue(row, { field });
        
        if (newValue === oldValue) {
            cell.innerHTML = originalContent;
            this.isInlineEditing = false;
            return;
        }
        
        // Validate the new value
        const column = this.options.columns.find(col => col.field === field);
        if (column && column.validate) {
            const validation = column.validate(newValue, row);
            if (validation !== true) {
                showNotification(validation, 'error');
                cell.innerHTML = originalContent;
                this.isInlineEditing = false;
                return;
            }
        }
        
        // Update the data
        row[field] = newValue;
        
        // Call onEdit callback
        if (this.options.onEdit) {
            try {
                const result = await this.options.onEdit(row, field, newValue, oldValue);
                if (result === false) {
                    // Edit was cancelled or failed
                    if (cell && cell.parentNode) {
                        cell.innerHTML = originalContent;
                    }
                    this.isInlineEditing = false;
                    return;
                }
                
                // If result is an object, it contains updated data from API
                if (result && typeof result === 'object') {
                    // Update the row data with API response
                    Object.assign(row, result);
                    // Get the updated value (might be formatted differently by API)
                    const updatedValue = this.getCellValue(row, { field });
                    const formattedValue = this.formatCellValue(updatedValue, column, row);
                    if (cell && cell.parentNode) {
                        cell.innerHTML = formattedValue;
                    }
                } else {
                    // Only update cell content if edit was successful
                    if (cell && cell.parentNode) {
                        cell.innerHTML = this.formatCellValue(newValue, column, row);
                    }
                }
                
                // Ensure the cell is updated even if API response is empty
                if (cell && cell.parentNode && cell.innerHTML === originalContent) {
                    cell.innerHTML = this.formatCellValue(newValue, column, row);
                }
            } catch (error) {
                console.error('Edit failed:', error);
                if (cell && cell.parentNode) {
                    cell.innerHTML = originalContent;
                }
                showNotification('Düzenleme başarısız', 'error');
            }
        } else {
            if (cell && cell.parentNode) {
                cell.innerHTML = this.formatCellValue(newValue, column, row);
            }
        }
        
        this.isInlineEditing = false;
        this.currentEditingCell = null;
        this.isProcessing = false;
    }
    
    getCellValue(row, column) {
        // Check if there's a valueGetter for this field in the options
        if (this.options.valueGetters && this.options.valueGetters[column.field]) {
            const value = this.options.valueGetters[column.field](row);
            return value;
        }
        
        // Check if column has its own valueGetter
        if (column.valueGetter) {
            const value = column.valueGetter(row);
            return value;
        }
        
        const field = column.field;
        if (field.includes('.')) {
            return field.split('.').reduce((obj, key) => obj?.[key], row);
        }
        
        return row[field];
    }
    
    formatCellValue(value, column, row) {
        // Check if there's a formatter for this field in the options
        if (this.options.formatters && this.options.formatters[column.field]) {
            return this.options.formatters[column.field](value, row);
        }
        
        if (value === null || value === undefined) {
            return 'N/A';
        }
        
        if (column.type === 'date') {
            return new Date(value).toLocaleDateString('tr-TR');
        }
        
        if (column.type === 'number') {
            return value.toLocaleString('tr-TR');
        }
        
        if (column.type === 'boolean') {
            return value ? 'Evet' : 'Hayır';
        }
        
        return value.toString();
    }
    
    isColumnEditable(field) {
        if (!this.options.editable) return false;
        
        // Check if the specific column is marked as editable
        const column = this.options.columns.find(col => col.field === field);
        if (column && column.editable === false) return false;
        
        // Check editableColumns array if specified
        if (this.options.editableColumns && this.options.editableColumns.length > 0) {
            return this.options.editableColumns.includes(field);
        }
        
        return true;
    }
    
    handleSort(field) {
        if (this.currentSortField === field) {
            this.currentSortDirection = this.currentSortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.currentSortField = field;
            this.currentSortDirection = 'asc';
        }
        
        if (this.options.onSort) {
            this.options.onSort(field, this.currentSortDirection);
        }
    }
    
    changePage(page) {
        this.options.currentPage = page;
        if (this.options.onPageChange) {
            this.options.onPageChange(page);
        }
        this.render();
    }
    
    // Public methods for updating the table
    updateData(data, totalItems = null) {
        this.options.data = data;
        if (totalItems !== null) {
            this.options.totalItems = totalItems;
        }
        this.render();
        this.setupEventListeners();
    }
    
    setSortState(field, direction) {
        this.currentSortField = field;
        this.currentSortDirection = direction;
        this.render();
        this.setupEventListeners();
    }
    
    setLoading(loading) {
        this.options.loading = loading;
        this.render();
        if (!loading) {
            this.setupEventListeners();
        }
    }
    
    updateColumn(columnField, updates) {
        const column = this.options.columns.find(col => col.field === columnField);
        if (column) {
            Object.assign(column, updates);
            this.render();
            this.setupEventListeners();
        }
    }
    
    addAction(action) {
        this.options.actions.push(action);
        this.render();
    }
    
    removeAction(actionKey) {
        this.options.actions = this.options.actions.filter(action => action.key !== actionKey);
        this.render();
    }
    
    getColumn(field) {
        return this.options.columns.find(col => col.field === field);
    }
    
    destroy() {
        if (this.container) {
            this.container.innerHTML = '';
        }
    }
}

// Helper function for notifications (if not already available)
function showNotification(message, type = 'info') {
    // You can implement your own notification system here
    console.log(`${type.toUpperCase()}: ${message}`);
}

export { TableComponent };
