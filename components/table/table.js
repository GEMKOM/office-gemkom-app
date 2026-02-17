/**
 * Reusable Table Component
 * Supports customizable columns, actions, and editable functionality
 */
import { showNotification } from '../notification/notification.js';

export class TableComponent {
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
            serverSidePagination: false,
            
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
            onPageSizeChange: null,
            
            // Empty state
            emptyMessage: 'Veri bulunamadı',
            emptyIcon: 'fas fa-inbox',
            
            // Loading state
            loading: false,
            // Skeleton loading configuration
            skeleton: true,
            skeletonRows: 5,
            
            // Export functionality
            exportable: false,
            exportFormats: ['csv', 'excel'],
            onExport: null,
            
            // Refresh functionality
            refreshable: false,
            onRefresh: null,
            
            // Custom row attributes
            rowAttributes: null, // Function that returns attributes for each row
            
            // Row background color
            rowBackgroundColor: null, // Function that returns background color for each row (receives row, index)
            
            // Drag and drop configuration
            draggable: false,
            onReorder: null, // Callback function when rows are reordered
            
            // Grouping configuration
            groupBy: null, // Field name to group by (e.g., 'user_id', 'category')
            groupHeaderFormatter: null, // Function to format group header (receives groupValue, groupRows)
            groupCollapsible: false, // Allow collapsing/expanding groups
            defaultGroupExpanded: true, // Default state for groups (expanded/collapsed)
            
            ...options
        };
        
        this.currentSortField = null;
        this.currentSortDirection = 'asc';
        this.isInlineEditing = false;
        this.groupExpandedState = {}; // Track expanded/collapsed state of groups
        
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
                        <i class="${this.options.icon || 'fas fa-table'} me-2 ${this.options.iconColor || 'text-primary'}"></i>
                        ${this.options.title || 'Tablo'}
                    </h5>
                    <div class="card-actions">
                        ${this.options.refreshable ? `
                            <button class="btn btn-sm btn-outline-secondary" id="${this.containerId}-refresh">
                                <i class="fas fa-sync-alt me-1"></i>Yenile
                            </button>
                        ` : ''}
                        ${this.options.exportable ? `
                            <button class="btn btn-sm btn-outline-secondary" type="button" id="${this.containerId}-export-btn">
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
        
        // Re-setup event listeners after rendering
        this.setupEventListeners();
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
            const headerExtraClass = column.headerClass || '';
            const widthStyle = column.width ? `style="width: ${column.width}; min-width: ${column.width};"` : '';
            
            // Determine sort icon based on current sort state
            let sortIcon = '';
            if (sortable) {
                const currentField = this.options.currentSortField;
                const currentDirection = this.options.currentSortDirection;
                
                if (currentField === column.field) {
                    if (currentDirection === 'asc') {
                        sortIcon = '<i class="fas fa-sort-up sort-icon text-primary"></i>';
                    } else if (currentDirection === 'desc') {
                        sortIcon = '<i class="fas fa-sort-down sort-icon text-primary"></i>';
                    } else {
                        sortIcon = '<i class="fas fa-sort sort-icon"></i>';
                    }
                } else {
                    sortIcon = '<i class="fas fa-sort sort-icon"></i>';
                }
            }
            
            // Add editable indicator if column is marked as editable
            const editableIcon = column.editable ? 
                '<i class="fas fa-edit editable-indicator text-muted ms-1" title="Düzenlenebilir" style="font-size: 0.75rem;"></i>' : '';
            
            return `
                <th class="${sortClass} ${headerExtraClass}" data-field="${column.field}" ${widthStyle}>
                    ${column.label} ${editableIcon} ${sortIcon}
                </th>
            `;
        });
        
        // Add actions column if actions are defined
        if (this.options.actions.length > 0) {
            headers.push(`
                <th class="action-column" style="width: ${this.options.actionColumnWidth}">İşlemler</th>
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
        
        // If grouping is enabled, render grouped data
        if (this.options.groupBy) {
            return this.renderGroupedBody();
        }
        
        // For server-side pagination, use all data as-is
        // For client-side pagination, slice the data
        let pageData = this.options.data;
        let startIndex = 0;
        
        if (this.options.pagination && !this.options.serverSidePagination && this.options.totalItems > this.options.data.length) {
            // Client-side pagination: slice the data
            startIndex = (this.options.currentPage - 1) * this.options.itemsPerPage;
            const endIndex = startIndex + this.options.itemsPerPage;
            pageData = this.options.data.slice(startIndex, endIndex);
        }
        
        return pageData.map((row, index) => this.renderRow(row, startIndex + index)).join('');
    }
    
    renderGroupedBody() {
        // Group data by the specified field
        const groups = {};
        this.options.data.forEach((row, index) => {
            const groupValue = this.getGroupValue(row);
            if (!groups[groupValue]) {
                groups[groupValue] = [];
            }
            groups[groupValue].push({ row, originalIndex: index });
        });
        
        // Sort groups (optional - could be made configurable)
        const sortedGroupKeys = Object.keys(groups).sort();
        
        // Calculate total items for pagination (all rows, not just groups)
        if (this.options.pagination && !this.options.serverSidePagination) {
            // Total items is the total number of data rows
            this.options.totalItems = this.options.data.length;
        }
        
        let html = '';
        let rowIndex = 0;
        
        sortedGroupKeys.forEach(groupKey => {
            const groupRows = groups[groupKey];
            const groupValue = groupRows[0].row[this.options.groupBy];
            
            // Initialize expanded state if not set
            if (this.groupExpandedState[groupKey] === undefined) {
                this.groupExpandedState[groupKey] = this.options.defaultGroupExpanded !== false;
            }
            
            const isExpanded = this.groupExpandedState[groupKey];
            
            // Render group header
            html += this.renderGroupHeader(groupKey, groupValue, groupRows, isExpanded);
            
            // Render group rows if expanded
            if (isExpanded) {
                groupRows.forEach(({ row }) => {
                    html += this.renderRow(row, rowIndex);
                    rowIndex++;
                });
            }
        });
        
        return html;
    }
    
    getGroupValue(row) {
        const value = row[this.options.groupBy];
        // Use a consistent string representation for grouping
        if (value === null || value === undefined) {
            return '__null__';
        }
        return String(value);
    }
    
    renderGroupHeader(groupKey, groupValue, groupRows, isExpanded) {
        const colspan = this.options.columns.length + (this.options.actions.length > 0 ? 1 : 0);
        const toggleIcon = isExpanded ? 'fa-chevron-down' : 'fa-chevron-right';
        const toggleClass = this.options.groupCollapsible ? 'group-header-toggle' : '';
        const toggleClick = this.options.groupCollapsible ? 
            `onclick="document.getElementById('${this.containerId}').dispatchEvent(new CustomEvent('toggleGroup', {detail: {groupKey: '${groupKey}'}}))"` : '';
        
        // Format group header
        let headerContent = '';
        if (this.options.groupHeaderFormatter && typeof this.options.groupHeaderFormatter === 'function') {
            headerContent = this.options.groupHeaderFormatter(groupValue, groupRows.map(gr => gr.row));
        } else {
            // Default formatting
            headerContent = `
                <div class="d-flex align-items-center">
                    ${this.options.groupCollapsible ? `<i class="fas ${toggleIcon} me-2"></i>` : ''}
                    <strong>${groupValue || '-'}</strong>
                    <span class="badge bg-secondary ms-2">${groupRows.length} ${groupRows.length === 1 ? 'görev' : 'görev'}</span>
                </div>
            `;
        }
        
        return `
            <tr class="group-header ${toggleClass}" data-group-key="${groupKey}" ${toggleClick}>
                <td colspan="${colspan}" class="group-header-cell">
                    ${headerContent}
                </td>
            </tr>
        `;
    }
    
    renderRow(row, rowIndex) {
        const cells = this.options.columns.map(column => {
            const value = this.getCellValue(row, column);
                            const isEditable = this.isColumnEditable(column);
            const editableClass = isEditable ? 'editable-cell' : '';
            const cellExtraClass = column.cellClass || '';
            const dataAttributes = isEditable ? 
                `data-field="${column.field}" data-row-index="${rowIndex}"` : '';
            const widthStyle = column.width ? `style="width: ${column.width}; min-width: ${column.width};"` : '';
            
            return `
                <td class="${editableClass} ${cellExtraClass}" ${dataAttributes} ${widthStyle}>
                    ${this.formatCellValue(value, column, row)}
                </td>
            `;
        });
        
        // Add actions cell
        if (this.options.actions.length > 0) {
            cells.push(`
                <td class="action-column">
                    <div class="action-buttons">
                        ${this.renderActions(row, rowIndex)}
                    </div>
                </td>
            `);
        }
        
        const rowClick = this.options.onRowClick ? 
            `onclick="this.dispatchEvent(new CustomEvent('rowClick', {detail: {index: ${rowIndex}}}))"` : '';
        
        // Get custom row attributes if provided
        let customAttributes = '';
        if (this.options.rowAttributes) {
            const attrs = this.options.rowAttributes(row, rowIndex);
            if (typeof attrs === 'string') {
                customAttributes = attrs;
            } else if (typeof attrs === 'object' && attrs !== null) {
                // Handle object format: { class: 'my-class', style: 'color: red;', 'data-id': '123' }
                customAttributes = Object.entries(attrs)
                    .map(([key, value]) => `${key}="${value}"`)
                    .join(' ');
            }
        }
        
        // Apply background color if provided
        let rowStyle = '';
        if (this.options.rowBackgroundColor) {
            const bgColor = this.options.rowBackgroundColor(row, rowIndex);
            if (bgColor) {
                rowStyle = `style="background-color: ${bgColor} !important;"`;
            }
        }
        
        // Add draggable attributes if drag and drop is enabled
        const draggableAttributes = this.options.draggable ? 
            `draggable="true" data-row-key="${row.key || rowIndex}"` : '';
        
        return `<tr ${customAttributes} ${rowStyle} ${draggableAttributes} ${rowClick}>${cells.join('')}</tr>`;
    }
    
    renderActions(row, rowIndex) {
        return this.options.actions.map(action => {
            const isVisible = typeof action.visible === 'function' ? 
                action.visible(row, rowIndex) : 
                (action.visible !== false);
            
            if (!isVisible) return '';
            
            const onClick = action.onClick ? 
                `onclick="event.preventDefault(); event.stopPropagation(); document.getElementById('${this.containerId}').dispatchEvent(new CustomEvent('actionClick', {detail: {action: '${action.key}', index: ${rowIndex}}}))"` : '';
            
            return `
                <button type="button" class="btn btn-sm ${action.class || 'btn-outline-secondary'}" 
                        title="${action.title || action.label}" 
                        ${onClick}>
                    <i class="${action.icon}"></i>
                </button>
            `;
        }).join('');
    }
    
    renderLoadingState() {
        const colspan = this.options.columns.length + (this.options.actions.length > 0 ? 1 : 0);
        
        if (!this.options.skeleton) {
            return `
            <tr>
                <td colspan="${colspan}" class="text-center">
                    <div class="loading-state">
                        <i class="fas fa-spinner fa-spin"></i>
                        <p>Yükleniyor...</p>
                    </div>
                </td>
            </tr>`;
        }
        
        const rows = [];
        for (let i = 0; i < (this.options.skeletonRows || 5); i++) {
            const cells = this.options.columns.map((col) => {
                const width = this.getSkeletonWidth(col);
                return `<td><div class="loading-skeleton" style="width: ${width}px;"></div></td>`;
            });
            if (this.options.actions.length > 0) {
                cells.push(`<td><div class="loading-skeleton" style="width: 80px;"></div></td>`);
            }
            rows.push(`<tr class="loading-row">${cells.join('')}</tr>`);
        }
        
        return rows.join('');
    }
    
    getSkeletonWidth(column) {
        // Allow per-column override
        if (typeof column.skeletonWidth === 'number') return column.skeletonWidth;
        
        // Heuristics by type
        let base = 120;
        if (column.type === 'number') base = 60;
        else if (column.type === 'date') base = 90;
        else if (column.type === 'boolean') base = 50;
        
        // Slight variation for natural feel
        const variance = 30;
        const delta = Math.floor(Math.random() * (variance * 2 + 1)) - variance;
        return Math.max(40, base + delta);
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
        // Always show pagination, even for single page or when all data fits
        // if (totalPages <= 1) return '';
        
        const startItem = (this.options.currentPage - 1) * this.options.itemsPerPage + 1;
        const endItem = Math.min(this.options.currentPage * this.options.itemsPerPage, this.options.totalItems);
        
        let html = '<div class="card-footer pagination-transition">';
        
        // Enhanced page info with better styling
        html += `<div class="pagination-info">`;
        html += `<i class="fas fa-list-alt me-2"></i>`;
        html += `Sayfa <span class="text-primary">${this.options.currentPage}</span> / <span class="text-primary">${totalPages}</span> `;
        html += `(<span class="text-primary">${startItem}-${endItem}</span> / <span class="text-primary">${this.options.totalItems}</span> kayıt)`;
        html += '</div>';
        
        // Enhanced pagination controls - all in one row
        html += '<div class="pagination-controls">';
        
        // Page size selector
        html += `
            <div class="page-size-selector">
                <label for="${this.containerId}-page-size">Sayfa başına:</label>
                <select id="${this.containerId}-page-size" class="form-select form-select-sm">
                    <option value="10" ${this.options.itemsPerPage === 10 ? 'selected' : ''}>10</option>
                    <option value="20" ${this.options.itemsPerPage === 20 ? 'selected' : ''}>20</option>
                    <option value="50" ${this.options.itemsPerPage === 50 ? 'selected' : ''}>50</option>
                    <option value="100" ${this.options.itemsPerPage === 100 ? 'selected' : ''}>100</option>
                </select>
            </div>
        `;
        
        // Pagination navigation in the middle
        html += '<nav class="pagination-nav"><ul class="pagination pagination-compact">';
        
        // Handle single page scenario
        if (totalPages === 1) {
            // Show just the current page as active
            html += `
                <li class="page-item active">
                    <span class="page-link">1</span>
                </li>
            `;
        } else {
            // First page button (only show if there are more than 3 pages and not on first few pages)
            if (this.options.currentPage > 3 && totalPages > 3) {
                html += `
                    <li class="page-item">
                        <a class="page-link" href="javascript:void(0)" data-page="1" title="İlk sayfa">
                            <i class="fas fa-angle-double-left"></i>
                        </a>
                    </li>
                `;
            }
            
            // Previous button
            html += `
                <li class="page-item ${this.options.currentPage === 1 ? 'disabled' : ''}">
                    <a class="page-link" href="javascript:void(0)" data-page="${this.options.currentPage - 1}" title="Önceki sayfa">
                        <i class="fas fa-chevron-left"></i>
                    </a>
                </li>
            `;
            
            // Page numbers with smart ellipsis
            const startPage = Math.max(1, this.options.currentPage - 2);
            const endPage = Math.min(totalPages, this.options.currentPage + 2);
            
            if (startPage > 1) {
                html += `
                    <li class="page-item">
                        <a class="page-link" href="javascript:void(0)" data-page="1">1</a>
                    </li>
                `;
                if (startPage > 2) {
                    html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
                }
            }
            
            for (let i = startPage; i <= endPage; i++) {
                html += `
                    <li class="page-item ${i === this.options.currentPage ? 'active' : ''}">
                        <a class="page-link" href="javascript:void(0)" data-page="${i}">${i}</a>
                    </li>
                `;
            }
            
            if (endPage < totalPages) {
                if (endPage < totalPages - 1) {
                    html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
                }
                html += `
                    <li class="page-item">
                        <a class="page-link" href="javascript:void(0)" data-page="${totalPages}">${totalPages}</a>
                    </li>
                `;
            }
            
            // Next button
            html += `
                <li class="page-item ${this.options.currentPage === totalPages ? 'disabled' : ''}">
                    <a class="page-link" href="javascript:void(0)" data-page="${this.options.currentPage + 1}" title="Sonraki sayfa">
                        <i class="fas fa-chevron-right"></i>
                    </a>
                </li>
            `;
            
            // Last page button (only show if there are more than 3 pages and not on last few pages)
            if (this.options.currentPage < totalPages - 2 && totalPages > 3) {
                html += `
                    <li class="page-item">
                        <a class="page-link" href="javascript:void(0)" data-page="${totalPages}" title="Son sayfa">
                            <i class="fas fa-angle-double-right"></i>
                        </a>
                    </li>
                `;
            }
        }
        
        html += '</ul></nav>';
        
        // Quick jump controls (only show if more than 1 page)
        if (totalPages > 1) {
            html += `
                <div class="pagination-jump">
                    <label for="${this.containerId}-jump-page">Sayfaya git:</label>
                    <input type="number" id="${this.containerId}-jump-page" 
                           min="1" max="${totalPages}" 
                           value="${this.options.currentPage}" 
                           class="form-control form-control-sm">
                    <button type="button" id="${this.containerId}-jump-btn" class="btn btn-sm btn-primary">
                        <i class="fas fa-arrow-right"></i>
                    </button>
                </div>
            `;
        } else {
            // Show a simple indicator for single page
            html += `
                <div class="pagination-jump">
                    <span class="text-muted">
                        <i class="fas fa-info-circle me-1"></i>
                        Tüm veriler tek sayfada görüntüleniyor
                    </span>
                </div>
            `;
        }
        
        html += '</div></div>';
        return html;
    }
    
    removeEventListeners() {
        // Remove all event listeners by cloning the container
        if (this.container) {
            const newContainer = this.container.cloneNode(true);
            this.container.parentNode.replaceChild(newContainer, this.container);
            this.container = newContainer;
        }
    }
    
    setupEventListeners() {
        // Remove existing event listeners to prevent duplicates
        this.removeEventListeners();
        
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
        
        // Enhanced Pagination
        if (this.options.pagination) {
            const paginationLinks = this.container.querySelectorAll('.page-link[data-page]');
            paginationLinks.forEach(link => {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const page = parseInt(link.dataset.page);
                    const totalPages = Math.ceil(this.options.totalItems / this.options.itemsPerPage);
                    console.log('Pagination clicked:', page, 'Current page:', this.options.currentPage, 'Total pages:', totalPages);
                    
                    // Check if page is valid
                    if (page >= 1 && page <= totalPages && page !== this.options.currentPage) {
                        this.changePage(page);
                    }
                });
            });
            
            // Page size selector
            const pageSizeSelect = this.container.querySelector(`#${this.containerId}-page-size`);
            if (pageSizeSelect) {
                pageSizeSelect.addEventListener('change', (e) => {
                    const newPageSize = parseInt(e.target.value);
                    // changePageSize will handle calling onPageSizeChange or onPageChange
                    this.changePageSize(newPageSize);
                });
            }
            
            // Quick jump controls (only if they exist)
            const jumpInput = this.container.querySelector(`#${this.containerId}-jump-page`);
            const jumpButton = this.container.querySelector(`#${this.containerId}-jump-btn`);
            
            if (jumpInput && jumpButton) {
                const handleJump = () => {
                    const targetPage = parseInt(jumpInput.value);
                    const totalPages = Math.ceil(this.options.totalItems / this.options.itemsPerPage);
                    
                    if (targetPage >= 1 && targetPage <= totalPages && targetPage !== this.options.currentPage) {
                        this.changePage(targetPage);
                    }
                };
                
                jumpButton.addEventListener('click', handleJump);
                jumpInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        handleJump();
                    }
                });
            }
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
            const exportBtn = this.container.querySelector(`#${this.containerId}-export-btn`);
            if (exportBtn) {
                exportBtn.addEventListener('click', () => {
                    if (this.options.onExport) {
                        this.options.onExport('csv');
                    } else {
                        this.exportData('excel');
                    }
                });
            }
        }
        
        // Row click events
        if (this.options.onRowClick) {
            this.container.addEventListener('rowClick', (e) => {
                const index = e.detail.index;
                const row = this.options.data[index];
                this.options.onRowClick(row, index);
            });
        }
        
        // Action click events
        this.container.addEventListener('actionClick', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const action = this.options.actions.find(a => a.key === e.detail.action);
            if (action && action.onClick) {
                const index = e.detail.index;
                const row = this.options.data[index];
                action.onClick(row, index);
            }
        });
        
        // Inline editing
        if (this.options.editable) {
            this.setupInlineEditing();
        }
        
        // Drag and drop
        if (this.options.draggable) {
            this.setupDragAndDrop();
        }
        
        // Group toggle functionality
        if (this.options.groupBy && this.options.groupCollapsible) {
            this.container.addEventListener('toggleGroup', (e) => {
                const groupKey = e.detail.groupKey;
                this.toggleGroup(groupKey);
            });
        }
    }
    
    toggleGroup(groupKey) {
        // Toggle the expanded state
        this.groupExpandedState[groupKey] = !this.groupExpandedState[groupKey];
        // Re-render the table body
        const tbody = this.container.querySelector(`#${this.containerId}-tbody`);
        if (tbody) {
            tbody.innerHTML = this.renderBody();
            // Re-setup event listeners after re-rendering
            this.setupEventListeners();
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
        
        input.addEventListener('blur', handleSave);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
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
            
            column.options.forEach(option => {
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
                await this.options.onEdit(row, field, newValue, oldValue);
                cell.innerHTML = this.formatCellValue(newValue, column, row);
            } catch (error) {
                console.error('Edit failed:', error);
                cell.innerHTML = originalContent;
                showNotification('Düzenleme başarısız', 'error');
            }
        } else {
            cell.innerHTML = this.formatCellValue(newValue, column, row);
        }
        
        this.isInlineEditing = false;
    }
    
    getCellValue(row, column) {
        if (column.valueGetter) {
            return column.valueGetter(row);
        }
        
        // Handle both 'field' and 'key' properties for column identification
        const field = column.field || column.key;
        if (!field) {
            return null;
        }
        
        if (field.includes('.')) {
            return field.split('.').reduce((obj, key) => obj?.[key], row);
        }
        
        return row[field];
    }
    
    formatCellValue(value, column, row) {
        if (column.formatter) {
            return column.formatter(value, row);
        }
        
        if (value === null || value === undefined) {
            return 'N/A';
        }
        
        if (column.type === 'date') {
            if (!value) return '-';
            const date = new Date(value);
            const formattedDate = date.toLocaleDateString('tr-TR', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            return `<div style="color: #6c757d; font-weight: 500;">${formattedDate}</div>`;
        }
        
        if (column.type === 'number') {
            return value.toLocaleString('tr-TR');
        }
        
        if (column.type === 'boolean') {
            return value ? 'Evet' : 'Hayır';
        }
        
        return value.toString();
    }
    
    isColumnEditable(column) {
        if (!this.options.editable) return false;
        if (this.options.editableColumns.length === 0) return true;
        
        // Handle both 'field' and 'key' properties
        const field = column.field || column.key;
        if (!field) return false;
        
        return this.options.editableColumns.includes(field);
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
        console.log('Changing page from', this.options.currentPage, 'to', page);
        
        // Add loading state to pagination
        this.addPaginationLoading();
        
        this.options.currentPage = page;
        if (this.options.onPageChange) {
            console.log('Calling onPageChange callback with page:', page);
            this.options.onPageChange(page);
        } else {
            console.log('No onPageChange callback defined');
        }
        // Re-render the table to update pagination state
        this.render();
    }
    
    changePageSize(newPageSize) {
        console.log('Changing page size from', this.options.itemsPerPage, 'to', newPageSize);
        
        // Add loading state to pagination
        this.addPaginationLoading();
        
        // Update page size FIRST before any callbacks
        // This ensures that any code reading from this.options.itemsPerPage gets the correct value
        this.options.itemsPerPage = newPageSize;
        this.options.currentPage = 1; // Reset to first page when changing page size
        
        // If onPageSizeChange callback exists, call it instead of onPageChange
        // onPageSizeChange should handle loading data with the new page size
        // Pages can either use the newSize parameter or read from this.options.itemsPerPage
        if (this.options.onPageSizeChange) {
            this.options.onPageSizeChange(newPageSize);
        } else if (this.options.onPageChange) {
            // Fallback: if no onPageSizeChange handler, use onPageChange
            // Pages should read from this.options.itemsPerPage if they need the new page size
            this.options.onPageChange(1);
        }
        
        // Re-render the table to update pagination state
        this.render();
    }
    
    addPaginationLoading() {
        const paginationContainer = this.container.querySelector('.pagination');
        if (paginationContainer) {
            paginationContainer.classList.add('pagination-loading');
        }
    }
    
    removePaginationLoading() {
        const paginationContainer = this.container.querySelector('.pagination');
        if (paginationContainer) {
            paginationContainer.classList.remove('pagination-loading');
        }
    }
    
    // Public methods for updating the table
    updateData(data, totalItems = null, currentPage = null) {
        this.options.data = data;
        if (totalItems !== null) {
            this.options.totalItems = totalItems;
        }
        if (currentPage !== null) {
            this.options.currentPage = currentPage;
        }
        
        // Remove pagination loading state
        this.removePaginationLoading();
        
        this.render();
    }
    
    setLoading(loading) {
        this.options.loading = loading;
        this.render();
    }
    
    updateColumn(columnField, updates) {
        const column = this.options.columns.find(col => col.field === columnField);
        if (column) {
            Object.assign(column, updates);
            this.render();
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
    
    // Export functionality
    exportData(format) {
        try {
            // Set export flag for formatters
            window.isExporting = true;
            
            // Show loading state
            this.setExportLoading(true);
            
            // Prepare data for export
            const exportData = this.prepareExportData();
            
            if (exportData.length === 0) {
                alert('Dışa aktarılacak veri bulunamadı');
                return;
            }
            
            // Export as Excel
            this.exportToExcel(exportData);
            
        } catch (error) {
            console.error('Export error:', error);
            alert('Dışa aktarma sırasında hata oluştu');
        } finally {
            // Clear export flag
            window.isExporting = false;
            this.setExportLoading(false);
        }
    }
    
    prepareExportData() {
        const headers = this.options.columns
            .filter(col => col.field !== 'actions' && !col.hidden)
            .map(col => col.label || col.field);
        
        const rows = this.options.data.map(row => {
            return this.options.columns
                .filter(col => col.field !== 'actions' && !col.hidden)
                .map(col => {
                    const value = row[col.field];
                    
                    // Handle different data types
                    if (col.type === 'boolean') {
                        return value ? 'Evet' : 'Hayır';
                    } else if (col.type === 'number' || (typeof value === 'number' && !isNaN(value))) {
                        // Check if value is null or undefined before formatting
                        if (value === null || value === undefined || isNaN(value)) {
                            return '-';
                        }
                        // Format numbers with comma as decimal separator (Turkish locale)
                        return value.toLocaleString('tr-TR', { 
                            minimumFractionDigits: 2, 
                            maximumFractionDigits: 2 
                        });
                    } else if (col.formatter && typeof col.formatter === 'function') {
                        // Use formatter but strip HTML tags
                        const formatted = col.formatter(value, row);
                        const stripped = this.stripHtmlTags(formatted);
                        // Only try to parse as number if column is explicitly marked as type 'number'
                        // This prevents parsing strings like "1160x6000" or "ST37" as numbers
                        if (col.type === 'number') {
                            const numValue = parseFloat(stripped.replace(/[^\d,.-]/g, '').replace(',', '.'));
                            if (!isNaN(numValue) && stripped.match(/[\d,.-]/)) {
                                return numValue.toLocaleString('tr-TR', { 
                                    minimumFractionDigits: 2, 
                                    maximumFractionDigits: 2 
                                });
                            }
                        }
                        return stripped;
                    } else {
                        return value ?? '';
                    }
                });
        });
        
        return [headers, ...rows];
    }
    
    stripHtmlTags(html) {
        const temp = document.createElement('div');
        temp.innerHTML = html;
        return temp.textContent || temp.innerText || '';
    }
    
    exportToExcel(data) {
        // Check if XLSX library is available
        if (typeof XLSX === 'undefined') {
            // Load XLSX library dynamically
            this.loadXLSXLibrary().then(() => {
                this.exportToExcel(data);
            });
            return;
        }
        
        try {
            // Create workbook
            const wb = XLSX.utils.book_new();
            
            // Convert data to worksheet
            const ws = XLSX.utils.aoa_to_sheet(data);
            
            // Add worksheet to workbook
            XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
            
            // Generate Excel file
            const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
            
            // Create blob and download
            const blob = new Blob([excelBuffer], { 
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
            });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `${this.containerId}_${new Date().toISOString().split('T')[0]}.xlsx`;
            link.click();
            
            // Clean up
            setTimeout(() => URL.revokeObjectURL(link.href), 100);
            
        } catch (error) {
            console.error('Excel export error:', error);
            alert('Excel dosyası oluşturulurken hata oluştu');
        }
    }
    
    loadXLSXLibrary() {
        return new Promise((resolve, reject) => {
            // Check if already loaded
            if (typeof XLSX !== 'undefined') {
                resolve();
                return;
            }
            
            // Create script element
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('XLSX library failed to load'));
            
            // Add to document
            document.head.appendChild(script);
        });
    }
    
    setExportLoading(loading) {
        const exportBtn = this.container.querySelector(`#${this.containerId}-export-btn`);
        if (exportBtn) {
            if (loading) {
                exportBtn.disabled = true;
                exportBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Dışa Aktarılıyor...';
            } else {
                exportBtn.disabled = false;
                exportBtn.innerHTML = '<i class="fas fa-download me-1"></i>Dışa Aktar';
            }
        }
    }
    
    setupDragAndDrop() {
        const tbody = this.container.querySelector(`#${this.containerId}-tbody`);
        if (!tbody) return;
        
        // Add event listeners to the tbody
        tbody.addEventListener('dragstart', (e) => {
            const row = e.target.closest('tr');
            if (row && row.dataset.rowKey) {
                e.dataTransfer.setData('text/plain', row.dataset.rowKey);
                row.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            }
        });
        
        tbody.addEventListener('dragend', (e) => {
            const row = e.target.closest('tr');
            if (row && row.dataset.rowKey) {
                row.classList.remove('dragging');
                // Remove all drag-over classes
                tbody.querySelectorAll('tr').forEach(r => r.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom'));
            }
        });
        
        tbody.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            
            // Add visual feedback but don't move DOM elements yet
            const afterElement = this.getDragAfterElement(tbody, e.clientY);
            const dragging = tbody.querySelector('.dragging');
            
            if (dragging) {
                // Remove drag-over class from all rows
                tbody.querySelectorAll('tr').forEach(r => r.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom'));
                
                // Add appropriate drag-over class based on position
                if (afterElement) {
                    const rect = afterElement.getBoundingClientRect();
                    const midPoint = rect.top + rect.height / 2;
                    
                    if (e.clientY < midPoint) {
                        afterElement.classList.add('drag-over-top');
                    } else {
                        afterElement.classList.add('drag-over-bottom');
                    }
                } else {
                    // Check if we're at the very top or bottom
                    const allRows = tbody.querySelectorAll('tr[data-row-key]:not(.dragging)');
                    if (allRows.length > 0) {
                        const firstRow = allRows[0];
                        const lastRow = allRows[allRows.length - 1];
                        const firstRect = firstRow.getBoundingClientRect();
                        const lastRect = lastRow.getBoundingClientRect();
                        
                        if (e.clientY < firstRect.top + firstRect.height / 2) {
                            firstRow.classList.add('drag-over-top');
                        } else if (e.clientY > lastRect.bottom - lastRect.height / 2) {
                            lastRow.classList.add('drag-over-bottom');
                        }
                    }
                }
            }
        });
        
        tbody.addEventListener('drop', (e) => {
            e.preventDefault();
            const draggedRowKey = e.dataTransfer.getData('text/plain');
            
            if (!draggedRowKey) return;
            
            // Remove drag-over classes
            tbody.querySelectorAll('tr').forEach(r => r.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom'));
            
            // Find the target position based on mouse position
            const afterElement = this.getDragAfterElement(tbody, e.clientY);
            let targetRowKey = null;
            let insertPosition = 'after';
            
            if (afterElement) {
                targetRowKey = afterElement.dataset.rowKey;
                const rect = afterElement.getBoundingClientRect();
                const midPoint = rect.top + rect.height / 2;
                insertPosition = e.clientY < midPoint ? 'before' : 'after';
            } else {
                // Check if we're at the very top or bottom
                const allRows = tbody.querySelectorAll('tr[data-row-key]:not(.dragging)');
                if (allRows.length > 0) {
                    const firstRow = allRows[0];
                    const lastRow = allRows[allRows.length - 1];
                    const firstRect = firstRow.getBoundingClientRect();
                    const lastRect = lastRow.getBoundingClientRect();
                    
                    if (e.clientY < firstRect.top + firstRect.height / 2) {
                        targetRowKey = firstRow.dataset.rowKey;
                        insertPosition = 'before';
                    } else if (e.clientY > lastRect.bottom - lastRect.height / 2) {
                        targetRowKey = lastRow.dataset.rowKey;
                        insertPosition = 'after';
                    }
                }
            }
            
            // Only reorder if we have a valid target and it's different from dragged row
            if (targetRowKey && targetRowKey !== draggedRowKey && this.options.onReorder) {
                this.options.onReorder(draggedRowKey, targetRowKey, insertPosition);
            }
        });
    }
    
    getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('tr[data-row-key]:not(.dragging)')];
        
        if (draggableElements.length === 0) return null;
        
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }
    
    destroy() {
        if (this.container) {
            this.container.innerHTML = '';
        }
    }
}

// showNotification is imported from notification component
