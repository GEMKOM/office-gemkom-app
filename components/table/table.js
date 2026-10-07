/**
 * Reusable Table Component
 * Supports customizable columns, actions, and editable functionality
 */
import { showNotification } from '../notification/notification.js';

/*
 * Excel export cells. Numbers leave as real numbers carrying an Excel number
 * format, so the sheet looks like the table yet can be summed; text such as
 * "1.234,56" or "€1.234,56" cannot.
 *
 * Per column (all optional):
 *   exportType     'number' | 'integer' | 'money' | 'percent' | 'date' | 'text'
 *                  ('percent' takes percent units: 41.4 → 41,40%)
 *   exportValue    (value, row) => raw value to export instead of row[field]
 *   exportFormat   Excel format string, or (value, row) => string
 *   exportCurrency 'EUR' | 'USD' | ..., or (row) => code — for 'money' (default EUR)
 *   exportLabel    header text in the sheet instead of `label`
 * Columns with `type: 'number'` and no exportType export as 'number'.
 */
const EXPORT_NUMBER_FORMATS = {
    number: '#,##0.00',
    integer: '#,##0',
    percent: '0.00%',
    date: 'dd.mm.yyyy',
};

const EXPORT_CURRENCY_FORMATS = {
    EUR: '"€"#,##0.00',
    USD: '"$"#,##0.00',
    GBP: '"£"#,##0.00',
    TRY: '#,##0.00 "₺"',
};

function exportCurrencyFormat(code) {
    const c = String(code || 'EUR').toUpperCase();
    return EXPORT_CURRENCY_FORMATS[c] || `#,##0.00 "${c.replace(/"/g, '')}"`;
}

/** A number, or an API decimal string such as "1234.50"; anything else → null. */
function toExportNumber(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v === 'string' && /^\s*[-+]?\d+(\.\d+)?\s*$/.test(v)) return parseFloat(v);
    return null;
}

/** Number shown as tr-TR text: "€1.234,56", "12,5 saat", "1.234" → number. */
function parseDisplayedNumber(text) {
    const s = String(text ?? '').replace(/[^\d,.\-]/g, '');
    if (!/\d/.test(s)) return null;
    let n;
    if (s.includes(',')) n = parseFloat(s.replace(/\./g, '').replace(',', '.'));
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) n = parseFloat(s.replace(/\./g, ''));
    else n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
}

/** Excel date serial for "YYYY-MM-DD", an ISO datetime or a Date (local day). */
function toExcelDateSerial(v) {
    if (v == null || v === '') return null;
    let y, m, d;
    const ymd = typeof v === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
    if (ymd) {
        [y, m, d] = [Number(ymd[1]), Number(ymd[2]), Number(ymd[3])];
    } else {
        const dt = v instanceof Date ? v : new Date(v);
        if (Number.isNaN(dt.getTime())) return null;
        [y, m, d] = [dt.getFullYear(), dt.getMonth() + 1, dt.getDate()];
    }
    return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
}

export class TableComponent {
    constructor(containerId, options = {}) {
        this.containerId = containerId;
        this.container = document.getElementById(containerId);
        // Every listener this component registers is bound to this controller's
        // signal, so tearing them all down is a single abort() instead of a
        // deep clone of the container. See removeEventListeners().
        this._listenerController = null;
        
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
            stickyHeader: false, // Make table headers sticky when scrolling
            
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
            
            // Footer
            footer: null, // Function that returns <tr>...</tr> HTML for <tfoot>. Receives ({ displayedData, allData, columns, hasActions })
            
            // Drag and drop configuration
            draggable: false,
            onReorder: null, // Callback function when rows are reordered
            
            // Grouping configuration
            groupBy: null, // Field name to group by (e.g., 'user_id', 'category')
            groupHeaderFormatter: null, // Function to format group header (receives groupValue, groupRows)
            groupCollapsible: false, // Allow collapsing/expanding groups
            defaultGroupExpanded: true, // Default state for groups (expanded/collapsed)
            groupSortDirection: 'asc', // 'asc' | 'desc' - sorting for group header keys
            
            // Row selection (opt-in)
            selectable: false,
            isRowSelectable: null, // (row) => boolean
            isRowEditable: null, // (row) => boolean
            onSelectionChange: null, // (selectedRows) => void

            // Initial server-side sort (optional)
            initialSortField: null,
            initialSortDirection: 'asc', // 'asc' | 'desc'
            
            ...options
        };
        
        this.currentSortField = this.options.initialSortField ?? null;
        this.currentSortDirection = this.options.initialSortDirection ?? 'asc';
        this.isInlineEditing = false;
        this.groupExpandedState = {}; // Track expanded/collapsed state of groups
        this.selectedKeys = new Set();
        this.selectedRowsData = new Map();
        
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
        // Preserve scroll positions across full re-renders.
        // This component replaces its DOM via innerHTML, which resets scroll
        // positions (especially for .table-responsive wrappers).
        const windowScrollX = window.scrollX || 0;
        const windowScrollY = window.scrollY || 0;
        const prevResponsive = this.container?.querySelector?.('.table-responsive');
        const prevResponsiveScrollTop = prevResponsive ? prevResponsive.scrollTop : 0;
        const prevResponsiveScrollLeft = prevResponsive ? prevResponsive.scrollLeft : 0;

        const tableClass = this.buildTableClass();
        
        // showHeader:false drops the card header entirely — for tables embedded
        // in a page that already provides its own title and toolbar.
        const header = this.options.showHeader === false ? '' : `
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
                </div>`;

        this.container.innerHTML = `
            <div class="dashboard-card ${this.options.stickyHeader ? 'has-sticky-header' : ''}">
                ${header}
                <div class="card-body">
                    ${this.options.responsive ? `<div class="table-responsive ${this.options.stickyHeader ? 'table-sticky-header' : ''}">` : ''}
                        <table class="${tableClass} ${this.options.stickyHeader ? 'table-sticky-header' : ''}" id="${this.containerId}-table">
                            ${this.renderColGroup()}
                            <thead class="${this.options.stickyHeader ? 'sticky-thead' : ''}">
                                ${this.renderHeader()}
                            </thead>
                            <tbody id="${this.containerId}-tbody">
                                ${this.renderBody()}
                            </tbody>
                            ${this.renderFooter()}
                        </table>
                    ${this.options.responsive ? '</div>' : ''}
                </div>
                ${this.options.pagination ? this.renderPagination() : ''}
            </div>
        `;
        
        // Re-setup event listeners after rendering
        this.setupEventListeners();

        // Restore scroll after DOM replacement and paint
        const restore = () => {
            const nextResponsive = this.container?.querySelector?.('.table-responsive');
            if (nextResponsive) {
                nextResponsive.scrollTop = prevResponsiveScrollTop;
                nextResponsive.scrollLeft = prevResponsiveScrollLeft;
            }
            window.scrollTo(windowScrollX, windowScrollY);
        };
        requestAnimationFrame(() => {
            restore();
            requestAnimationFrame(restore);
        });
    }

    renderColGroup() {
        const cols = [];
        if (this.options.selectable) {
            cols.push('<col style="width: 40px; min-width: 40px;">');
        }
        (this.options.columns || []).forEach((col) => {
            const width = col?.width;
            if (width) {
                cols.push(`<col style="width: ${width}; min-width: ${width};">`);
            } else {
                cols.push('<col>');
            }
        });

        if (this.options.actions.length > 0) {
            const w = this.options.actionColumnWidth;
            if (w && w !== 'auto') {
                cols.push(`<col style="width: ${w}; min-width: ${w};">`);
            } else {
                cols.push('<col>');
            }
        }

        return `<colgroup>${cols.join('')}</colgroup>`;
    }
    
    buildTableClass() {
        let classes = [this.options.tableClass];
        
        if (this.options.striped) classes.push('table-striped');
        if (this.options.bordered) classes.push('table-bordered');
        if (this.options.small) classes.push('table-sm');
        
        return classes.join(' ');
    }
    
    renderHeader() {
        const headers = [];
        if (this.options.selectable) {
            headers.push(`
                <th class="selection-column" style="width: 40px; min-width: 40px;">
                    <input type="checkbox" class="select-all-checkbox" title="Tümünü seç" aria-label="Tümünü seç">
                </th>
            `);
        }
        headers.push(...this.options.columns.map(column => {
            const sortable = this.options.sortable && column.sortable !== false;
            const sortClass = sortable ? 'sortable' : '';
            const headerExtraClass = column.headerClass || '';
            const widthStyle = column.width ? `style="width: ${column.width}; min-width: ${column.width};"` : '';
            
            // Determine sort icon based on current sort state
            let sortIcon = '';
            if (sortable) {
                const currentField = this.currentSortField;
                const currentDirection = this.currentSortDirection;
                
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
        }));
        
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
        
        const { displayedData, startIndex } = this.getDisplayedData();
        return displayedData.map((row, index) => this.renderRow(row, startIndex + index)).join('');
    }

    getDisplayedData() {
        // For server-side pagination, use all data as-is
        // For client-side pagination, slice the data
        let displayedData = this.options.data;
        let startIndex = 0;
        
        if (this.options.pagination && !this.options.serverSidePagination && this.options.totalItems > this.options.data.length) {
            startIndex = (this.options.currentPage - 1) * this.options.itemsPerPage;
            const endIndex = startIndex + this.options.itemsPerPage;
            displayedData = this.options.data.slice(startIndex, endIndex);
        }
        
        return { displayedData, startIndex };
    }

    renderFooter() {
        if (!this.options.footer || typeof this.options.footer !== 'function') return '';
        if (this.options.loading) return '';
        if (this.options.data.length === 0) return '';
        if (this.options.groupBy) return ''; // Footer for grouped tables is not supported yet
        
        const { displayedData } = this.getDisplayedData();
        const hasActions = this.options.actions.length > 0;
        const footerRowHtml = this.options.footer({
            displayedData,
            allData: this.options.data,
            columns: this.options.columns,
            hasActions
        });
        
        if (!footerRowHtml || typeof footerRowHtml !== 'string') return '';
        
        return `<tfoot>${footerRowHtml}</tfoot>`;
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
        if (String(this.options.groupSortDirection).toLowerCase() === 'desc') {
            sortedGroupKeys.reverse();
        }
        
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
                groupRows.forEach(({ row, originalIndex }) => {
                    html += this.renderRow(row, originalIndex);
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
        const toggleIcon = isExpanded ? 'fa-chevron-down' : 'fa-chevron-right';
        const toggleClass = this.options.groupCollapsible ? 'group-header-toggle' : '';
        const toggleClick = this.options.groupCollapsible ? 
            `onclick="document.getElementById('${this.containerId}').dispatchEvent(new CustomEvent('toggleGroup', {detail: {groupKey: '${groupKey}'}}))"` : '';
        
        // Check if there's an _expand column (first column with field '_expand')
        const hasExpandColumn = this.options.columns.length > 0 && this.options.columns[0].field === '_expand';
        
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
        
        // A formatter may return an OBJECT keyed by column field instead of an
        // HTML string. Then the group header is rendered as real cells aligned
        // to the table's own columns — so a summary row lines up with the rows
        // it summarises. '_actions' fills the actions column; missing keys
        // render empty cells.
        if (headerContent && typeof headerContent === 'object') {
            const cellMap = headerContent;
            const cells = this.options.columns.map(column => {
                const widthStyle = column.width ?
                    `style="width: ${column.width}; min-width: ${column.width};"` : '';
                const extraClass = column.cellClass || '';
                return `
                    <td class="group-header-cell ${extraClass}" ${widthStyle}>
                        ${cellMap[column.field] ?? ''}
                    </td>
                `;
            });
            if (this.options.actions.length > 0) {
                cells.push(`
                    <td class="group-header-cell action-column">
                        ${cellMap._actions ?? ''}
                    </td>
                `);
            }
            if (this.options.selectable) {
                cells.unshift('<td class="group-header-cell selection-column"></td>');
            }
            return `
                <tr class="group-header ${toggleClass}" data-group-key="${groupKey}" ${toggleClick}>
                    ${cells.join('')}
                </tr>
            `;
        }

        if (hasExpandColumn) {
            // Render with separate cells: expand column + content spanning remaining columns
            const expandColumn = this.options.columns[0];
            const expandWidth = expandColumn.width || '50px';
            const remainingColspan = this.options.columns.length - 1 + (this.options.actions.length > 0 ? 1 : 0);
            
            return `
                <tr class="group-header ${toggleClass}" data-group-key="${groupKey}">
                    <td class="group-header-cell" style="width: ${expandWidth};" ${toggleClick}>
                        ${this.options.groupCollapsible ? `<i class="fas ${toggleIcon}" style="color: #0d6efd; cursor: pointer;"></i>` : ''}
                    </td>
                    <td colspan="${remainingColspan}" class="group-header-cell">
                        ${headerContent}
                    </td>
                </tr>
            `;
        } else {
            // Original behavior: single cell spanning all columns
            const colspan = this.options.columns.length + (this.options.actions.length > 0 ? 1 : 0);
            return `
                <tr class="group-header ${toggleClass}" data-group-key="${groupKey}" ${toggleClick}>
                    <td colspan="${colspan}" class="group-header-cell">
                        ${headerContent}
                    </td>
                </tr>
            `;
        }
    }
    
    renderRow(row, rowIndex) {
        const cells = [];
        const rowKey = row.key != null ? String(row.key) : String(rowIndex);
        const isSelectable = this.options.selectable && (
            !this.options.isRowSelectable || this.options.isRowSelectable(row, rowIndex)
        );

        if (this.options.selectable) {
            const checked = this.selectedKeys.has(rowKey) ? 'checked' : '';
            const disabled = isSelectable ? '' : 'disabled';
            cells.push(`
                <td class="selection-column" style="width: 40px; min-width: 40px;">
                    <input type="checkbox" class="row-select-checkbox" data-row-key="${rowKey}" ${checked} ${disabled}>
                </td>
            `);
        }

        cells.push(...this.options.columns.map(column => {
            const value = this.getCellValue(row, column);
            const rowEditable = !this.options.isRowEditable || this.options.isRowEditable(row, rowIndex);
            const isEditable = rowEditable && this.isColumnEditable(column);
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
        }));
        
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
            `onclick="this.dispatchEvent(new CustomEvent('rowClick', {bubbles: true, composed: true, detail: {index: ${rowIndex}}}))"` : '';
        
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
            
            // Handle dropdown action type
            if (action.type === 'dropdown' && action.subActions) {
                const visibleSubActions = action.subActions.filter(subAction => {
                    const subVisible = typeof subAction.visible === 'function' ? 
                        subAction.visible(row, rowIndex) : 
                        (subAction.visible !== false);
                    return subVisible;
                });
                
                if (visibleSubActions.length === 0) return '';
                
                const dropdownId = `${this.containerId}-dropdown-${rowIndex}`;
                return `
                    <div class="dropdown" style="display: inline-block;">
                        <button type="button" class="btn btn-sm ${action.class || 'btn-outline-secondary'}" 
                                id="${dropdownId}-btn"
                                data-bs-toggle="dropdown" 
                                aria-expanded="false"
                                title="${action.title || action.label || 'Diğer İşlemler'}">
                            <i class="${action.icon || 'fas fa-ellipsis-v'}"></i>
                        </button>
                        <ul class="dropdown-menu" aria-labelledby="${dropdownId}-btn">
                            ${visibleSubActions.map(subAction => {
                                const subOnClick = subAction.onClick ? 
                                    `onclick="event.preventDefault(); event.stopPropagation(); document.getElementById('${this.containerId}').dispatchEvent(new CustomEvent('actionClick', {detail: {action: '${subAction.key}', index: ${rowIndex}}})); const dropdownInstance = bootstrap.Dropdown.getInstance(document.getElementById('${dropdownId}-btn')); if (dropdownInstance) dropdownInstance.hide();"` : '';
                                return `
                                    ${subAction.dividerBefore ? '<li><hr class="dropdown-divider"></li>' : ''}
                                    <li>
                                        <a class="dropdown-item ${subAction.class || ''}" href="#" ${subOnClick}>
                                            <i class="${subAction.icon} me-2"></i>${subAction.label}
                                        </a>
                                    </li>
                                `;
                            }).join('')}
                        </ul>
                    </div>
                `;
            }
            
            // Regular button action
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
        // Detach everything registered with the previous signal, then start a
        // fresh controller for the listeners about to be attached.
        //
        // This used to clone the container (cloneNode(true) + replaceChild) to
        // drop listeners. That cost ~192 ms on a 5,000-element table -- more
        // than the innerHTML render it ran alongside -- and it ran on every
        // sort, filter, page change and row expand.
        if (this._listenerController) {
            this._listenerController.abort();
        }
        this._listenerController = new AbortController();
    }

    // Options object for addEventListener, scoping the listener to the current
    // controller so removeEventListeners() can drop it.
    _sig() {
        if (!this._listenerController) {
            this._listenerController = new AbortController();
        }
        return { signal: this._listenerController.signal };
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
                }, this._sig());
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
                    
                    // Check if page is valid
                    if (page >= 1 && page <= totalPages && page !== this.options.currentPage) {
                        this.changePage(page);
                    }
                }, this._sig());
            });
            
            // Page size selector
            const pageSizeSelect = this.container.querySelector(`#${this.containerId}-page-size`);
            if (pageSizeSelect) {
                pageSizeSelect.addEventListener('change', (e) => {
                    const newPageSize = parseInt(e.target.value);
                    // changePageSize will handle calling onPageSizeChange or onPageChange
                    this.changePageSize(newPageSize);
                }, this._sig());
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
                
                jumpButton.addEventListener('click', handleJump, this._sig());
                jumpInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        handleJump();
                    }
                }, this._sig());
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
                }, this._sig());
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
                }, this._sig());
            }
        }
        
        // Row click events
        if (this.options.onRowClick) {
            this.container.addEventListener('rowClick', (e) => {
                const index = e.detail.index;
                const row = this.options.data[index];
                this.options.onRowClick(row, index);
            }, this._sig());
        }
        
        // Action click events
        this.container.addEventListener('actionClick', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // First try to find in main actions
            let action = this.options.actions.find(a => a.key === e.detail.action);
            
            // If not found, check sub-actions in dropdowns
            if (!action) {
                for (const mainAction of this.options.actions) {
                    if (mainAction.type === 'dropdown' && mainAction.subActions) {
                        const subAction = mainAction.subActions.find(sa => sa.key === e.detail.action);
                        if (subAction) {
                            action = subAction;
                            break;
                        }
                    }
                }
            }
            
            if (action && action.onClick) {
                const index = e.detail.index;
                const row = this.options.data[index];
                action.onClick(row, index);
            }
        }, this._sig());
        
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
            }, this._sig());
        }

        // Row selection
        if (this.options.selectable) {
            this.setupSelectionListeners();
        }
    }

    setupSelectionListeners() {
        const selectAll = this.container.querySelector('.select-all-checkbox');
        if (selectAll) {
            selectAll.addEventListener('change', (e) => {
                const checked = e.target.checked;
                const { displayedData } = this.getDisplayedData();
                displayedData.forEach((row, index) => {
                    const rowKey = row.key != null ? String(row.key) : String(index);
                    const isSelectable = !this.options.isRowSelectable || this.options.isRowSelectable(row, index);
                    if (!isSelectable) return;
                    if (checked) {
                        this.selectedKeys.add(rowKey);
                        this.selectedRowsData.set(rowKey, row);
                    } else {
                        this.selectedKeys.delete(rowKey);
                        this.selectedRowsData.delete(rowKey);
                    }
                });
                this._notifySelectionChange();
                const tbody = this.container.querySelector(`#${this.containerId}-tbody`);
                if (tbody) {
                    tbody.innerHTML = this.renderBody();
                    this._setupRowCheckboxListeners();
                    if (this.options.editable) {
                        this.setupInlineEditing();
                    }
                }
            }, this._sig());
        }

        this._setupRowCheckboxListeners();
    }

    _setupRowCheckboxListeners() {
        const rowCheckboxes = this.container.querySelectorAll('.row-select-checkbox');
        rowCheckboxes.forEach((checkbox) => {
            checkbox.addEventListener('change', (e) => {
                e.stopPropagation();
                const rowKey = checkbox.dataset.rowKey;
                const row = this.options.data.find((r) => String(r.key) === rowKey);
                if (e.target.checked && row) {
                    this.selectedKeys.add(rowKey);
                    this.selectedRowsData.set(rowKey, row);
                } else {
                    this.selectedKeys.delete(rowKey);
                    this.selectedRowsData.delete(rowKey);
                }
                this._updateSelectAllCheckbox();
                this._notifySelectionChange();
            }, this._sig());
        });
    }

    _updateSelectAllCheckbox() {
        const selectAll = this.container.querySelector('.select-all-checkbox');
        if (!selectAll) return;
        const { displayedData } = this.getDisplayedData();
        const selectableRows = displayedData.filter((row, index) =>
            !this.options.isRowSelectable || this.options.isRowSelectable(row, index)
        );
        if (selectableRows.length === 0) {
            selectAll.checked = false;
            selectAll.indeterminate = false;
            return;
        }
        const selectedCount = selectableRows.filter((row) =>
            this.selectedKeys.has(String(row.key))
        ).length;
        selectAll.checked = selectedCount === selectableRows.length;
        selectAll.indeterminate = selectedCount > 0 && selectedCount < selectableRows.length;
    }

    _notifySelectionChange() {
        if (this.options.onSelectionChange) {
            this.options.onSelectionChange(this.getSelectedRows());
        }
    }

    getSelectedRows() {
        return Array.from(this.selectedRowsData.values());
    }

    getSelectedKeys() {
        return Array.from(this.selectedKeys);
    }

    clearSelection() {
        this.selectedKeys.clear();
        this.selectedRowsData.clear();
        this._notifySelectionChange();
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
                // Row <tr> may use onclick to open detail; stop bubbling so inline edit wins.
                e.stopPropagation();
                this.startInlineEdit(cell);
            }, this._sig());
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
        
        let saveCommitted = false;
        const handleCancel = () => {
            input.removeEventListener('blur', onBlurSave);
            cell.innerHTML = originalContent;
            this.isInlineEditing = false;
        };
        const onBlurSave = () => {
            void commitSave();
        };
        const commitSave = async () => {
            if (saveCommitted) return;
            saveCommitted = true;
            input.removeEventListener('blur', onBlurSave);
            const newValue = input.value;
            await this.finishInlineEdit(cell, field, rowIndex, newValue, originalContent);
        };
        
        input.addEventListener('blur', onBlurSave, this._sig());
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                void commitSave();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                saveCommitted = true;
                input.removeEventListener('blur', onBlurSave);
                handleCancel();
            }
        }, this._sig());
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
        } else if (column.type === 'number') {
            const input = document.createElement('input');
            input.type = 'number';
            input.className = 'form-control form-control-sm';
            if (column.min !== undefined && column.min !== null) input.min = String(column.min);
            if (column.max !== undefined && column.max !== null) input.max = String(column.max);
            input.step = column.step !== undefined && column.step !== null ? String(column.step) : '1';
            if (value === null || value === undefined || value === '') {
                input.value = '';
            } else {
                input.value = String(value);
            }
            return input;
        } else {
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'form-control form-control-sm';
            input.value = value ?? '';
            return input;
        }
    }

    /**
     * Compare old vs new for inline edit; number columns must not use === (5 !== "5").
     */
    isInlineEditValueUnchanged(column, oldValue, newValue) {
        if (column?.type === 'number') {
            const parseNum = (v) => {
                if (v === null || v === undefined || v === '') return null;
                const n = Number(typeof v === 'string' ? v.trim() : v);
                return Number.isFinite(n) ? n : null;
            };
            const rawNew = newValue === null || newValue === undefined ? '' : `${newValue}`.trim();
            const o = parseNum(oldValue);
            const n = rawNew === '' ? null : parseNum(rawNew);
            if (o === null && n === null) return true;
            if (o === null || n === null) return false;
            return o === n;
        }
        return newValue === oldValue;
    }
    
    async finishInlineEdit(cell, field, rowIndex, newValue, originalContent) {
        const row = this.options.data[rowIndex];
        const oldValue = this.getCellValue(row, { field });
        
        // Validate the new value
        const column = this.options.columns.find(col => col.field === field);
        if (this.isInlineEditValueUnchanged(column, oldValue, newValue)) {
            cell.innerHTML = originalContent;
            this.isInlineEditing = false;
            return;
        }
        if (column && column.validate) {
            const validation = column.validate(newValue, row);
            if (validation !== true) {
                showNotification(validation, 'error');
                cell.innerHTML = originalContent;
                this.isInlineEditing = false;
                return;
            }
        }
        
        // Call onEdit (e.g. PATCH); callback should update `row` from the response when needed
        if (this.options.onEdit) {
            try {
                await this.options.onEdit(row, field, newValue, oldValue);
                const displayValue = this.getCellValue(row, { field });
                cell.innerHTML = this.formatCellValue(displayValue, column, row);
            } catch (error) {
                console.error('Edit failed:', error);
                cell.innerHTML = originalContent;
                showNotification(error.message || 'Düzenleme başarısız', 'error');
            }
        } else {
            if (column?.type === 'number') {
                const t = `${newValue ?? ''}`.trim();
                row[field] = t === '' ? null : Number(t);
            } else {
                row[field] = newValue;
            }
            cell.innerHTML = this.formatCellValue(this.getCellValue(row, { field }), column, row);
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
        
        // Add loading state to pagination
        this.addPaginationLoading();
        
        this.options.currentPage = page;
        if (this.options.onPageChange) {
            this.options.onPageChange(page);
        }
        // Re-render the table to update pagination state
        this.render();
    }
    
    changePageSize(newPageSize) {
        
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

        // Drop cached row data for keys no longer on this page
        const pageKeys = new Set(data.map((row) => String(row.key)));
        for (const key of Array.from(this.selectedRowsData.keys())) {
            if (!pageKeys.has(key)) {
                this.selectedRowsData.delete(key);
                this.selectedKeys.delete(key);
            }
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

            // Prepare data for export (an override of prepareExportData may
            // not fill the per-cell formats; exportToExcel copes with none)
            this._exportCellFormats = null;
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
        const columns = this.options.columns.filter(col => col.field !== 'actions' && !col.hidden);
        const headers = columns.map(col => col.exportLabel || col.label || col.field);

        // Excel number format per cell, parallel to the data rows (see exportToExcel)
        const formats = [];
        const rows = this.options.data.map(row => {
            const rowFormats = [];
            const cells = columns.map(col => {
                const { value, format } = this.exportCell(col, row);
                rowFormats.push(format || null);
                return value;
            });
            formats.push(rowFormats);
            return cells;
        });
        this._exportCellFormats = formats;

        return [headers, ...rows];
    }

    /** One export cell: `{ value, format }`; numbers stay numbers (see EXPORT_NUMBER_FORMATS). */
    exportCell(col, row) {
        const value = typeof col.exportValue === 'function'
            ? col.exportValue(row[col.field], row)
            : row[col.field];
        const displayed = () => (typeof col.formatter === 'function'
            ? this.stripHtmlTags(col.formatter(row[col.field], row))
            : (value ?? ''));

        const kind = col.exportType || (col.type === 'number' ? 'number' : null);
        if (kind && kind !== 'text') {
            const override = typeof col.exportFormat === 'function' ? col.exportFormat(value, row) : col.exportFormat;
            if (kind === 'date') {
                const serial = toExcelDateSerial(value);
                return serial == null ? { value: null } : { value: serial, format: override || EXPORT_NUMBER_FORMATS.date };
            }
            // An explicit exportType trusts the raw value. A legacy
            // `type: 'number'` column keeps exporting what its formatter shows
            // (it may convert units), now parsed into a real number.
            let n = toExportNumber(value);
            if (!col.exportType && typeof value !== 'number' && typeof col.formatter === 'function') {
                n = parseDisplayedNumber(displayed()) ?? n;
            } else if (n == null && !col.exportValue && typeof col.formatter === 'function') {
                n = parseDisplayedNumber(displayed());
            }
            if (n == null) return { value: null };
            if (kind === 'percent') n /= 100;
            let format = override;
            if (!format) {
                if (kind === 'money') {
                    format = exportCurrencyFormat(typeof col.exportCurrency === 'function' ? col.exportCurrency(row) : col.exportCurrency);
                } else {
                    format = EXPORT_NUMBER_FORMATS[kind] || EXPORT_NUMBER_FORMATS.number;
                }
            }
            return { value: n, format };
        }

        if (col.type === 'boolean') return { value: value ? 'Evet' : 'Hayır' };
        if (!col.exportType && typeof value === 'number' && Number.isFinite(value)) {
            return { value, format: Number.isInteger(value) ? EXPORT_NUMBER_FORMATS.integer : EXPORT_NUMBER_FORMATS.number };
        }
        if (typeof col.formatter === 'function' && !col.exportValue) return { value: displayed() };
        return { value: value ?? '' };
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
            this.applyExportSheetLayout(ws, data);

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
            const fallbackName = `${this.containerId}_${new Date().toISOString().split('T')[0]}.xlsx`;
            const customName =
                typeof this.options.exportFilename === 'function'
                    ? this.options.exportFilename()
                    : this.options.exportFilename;
            link.download = (customName && String(customName).trim()) ? String(customName).trim() : fallbackName;
            link.click();
            
            // Clean up
            setTimeout(() => URL.revokeObjectURL(link.href), 100);
            
        } catch (error) {
            console.error('Excel export error:', error);
            alert('Excel dosyası oluşturulurken hata oluştu');
        }
    }
    
    /** Number formats on numeric cells, column widths and a header filter. */
    applyExportSheetLayout(ws, data) {
        if (!data.length) return;
        const formats = this._exportCellFormats || [];
        const widths = data[0].map(h => String(h ?? '').length);
        data.forEach((cells, r) => {
            cells.forEach((v, c) => {
                const format = r > 0 ? formats[r - 1]?.[c] : null;
                const cell = ws[XLSX.utils.encode_cell({ r, c })];
                if (cell && cell.t === 'n' && format) cell.z = format;
                // Rough display width: numbers as their formatted length
                const len = typeof v === 'number'
                    ? (format === EXPORT_NUMBER_FORMATS.date ? 10 : Math.abs(v).toFixed(2).length + 4)
                    : String(v ?? '').length;
                widths[c] = Math.max(widths[c] || 0, len);
            });
        });
        ws['!cols'] = widths.map(w => ({ wch: Math.min(Math.max(w + 2, 8), 60) }));
        ws['!autofilter'] = {
            ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: data.length - 1, c: data[0].length - 1 } }),
        };
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
        }, this._sig());
        
        tbody.addEventListener('dragend', (e) => {
            const row = e.target.closest('tr');
            if (row && row.dataset.rowKey) {
                row.classList.remove('dragging');
                // Remove all drag-over classes
                tbody.querySelectorAll('tr').forEach(r => r.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom'));
            }
        }, this._sig());
        
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
        }, this._sig());
        
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
        }, this._sig());
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
