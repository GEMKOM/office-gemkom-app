import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
import { TableComponent } from '../../../components/table/table.js';
import { getPlanningRequestItems } from '../../../apis/planning/planningRequestItems.js';
import { initRouteProtection } from '../../../apis/routeProtection.js';

/**
 * Malzeme Takibi Page
 * Displays delivered planning request items (excluding expenditure items)
 */

let filtersComponent;
let tableComponent;
let currentFilters = {};
let currentPage = 1;
let currentPageSize = 20;

/**
 * Format date string to Turkish format
 */
function formatDate(dateString) {
    if (!dateString) return '-';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('tr-TR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (error) {
        return '-';
    }
}

/**
 * Format date for export
 */
function formatDateForExport(dateString) {
    if (!dateString) return '-';
    try {
        const date = new Date(dateString);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${day}.${month}.${year} ${hours}:${minutes}`;
    } catch (error) {
        return '-';
    }
}

/**
 * Format quantity with 2 decimal places
 */
function formatQuantity(quantity) {
    if (!quantity) return '-';
    return parseFloat(quantity).toFixed(2);
}

/**
 * Initialize filters component
 */
function initFilters() {
    filtersComponent = new FiltersComponent('filters-placeholder', {
        title: 'Filtreler',
        showClearButton: true,
        showApplyButton: true,
        applyButtonText: 'Filtrele',
        clearButtonText: 'Temizle',
        onApply: handleFilter,
        onClear: handleClear
    });

    // Add text filters
    filtersComponent.addTextFilter({
        id: 'job_no',
        label: 'İş No',
        placeholder: 'İş numarası...',
        colSize: 3
    });

    filtersComponent.addTextFilter({
        id: 'item_code',
        label: 'Malzeme Kodu',
        placeholder: 'Malzeme kodu...',
        colSize: 3
    });

    filtersComponent.addTextFilter({
        id: 'item_name',
        label: 'Malzeme Adı',
        placeholder: 'Malzeme adı...',
        colSize: 3
    });

    filtersComponent.addTextFilter({
        id: 'planning_request_number',
        label: 'Planlama Talebi No',
        placeholder: 'Planlama talebi numarası...',
        colSize: 3
    });
}

/**
 * Initialize table component
 */
function initTable() {
    const columns = [
        {
            field: 'job_no',
            label: 'İş No',
            sortable: true
        },
        {
            field: 'item_code',
            label: 'Malzeme Kodu',
            sortable: true
        },
        {
            field: 'item_name',
            label: 'Malzeme Adı',
            sortable: true
        },
        {
            field: 'item_unit',
            label: 'Birim',
            sortable: true,
            width: '100px'
        },
        {
            field: 'quantity',
            label: 'Miktar',
            sortable: true,
            formatter: (value) => formatQuantity(value),
            width: '100px'
        },
        {
            field: 'planning_request_number',
            label: 'Planlama Talebi No',
            sortable: true
        },
        {
            field: 'delivered_at',
            label: 'Teslim Tarihi',
            sortable: true,
            formatter: (value) => formatDate(value)
        },
        {
            field: 'delivered_by_username',
            label: 'Teslim Eden',
            sortable: true
        }
    ];

    tableComponent = new TableComponent('table-container', {
        title: 'Malzeme Takibi',
        columns: columns,
        data: [],
        emptyMessage: 'Veri yükleniyor...',
        emptyIcon: 'fas fa-box',
        striped: true,
        bordered: true,
        responsive: true,
        
        // Pagination configuration
        pagination: true,
        serverSidePagination: true,
        itemsPerPage: 20,
        currentPage: 1,
        totalItems: 0,
        onPageChange: handlePageChange,
        onPageSizeChange: handlePageSizeChange,
        
        // Loading state
        loading: false,
        skeleton: true,
        skeletonRows: 5,
        
        // Refresh functionality
        refreshable: true,
        onRefresh: handleRefresh,
        
        // Export functionality
        exportable: true,
        onExport: handleExport
    });
}

/**
 * Load material tracking data with pagination
 */
async function loadData(page = 1, pageSize = 20) {
    try {
        // Show loading state
        tableComponent.setLoading(true);

        // Build filter parameters
        const filters = {
            fields: 'simple',
            is_delivered: true,
            item_type_exclude: 'expenditure',
            ordering: 'job_no',
            page: page,
            page_size: pageSize,
            ...currentFilters
        };

        // Remove empty filters
        Object.keys(filters).forEach(key => {
            if (filters[key] === '' || filters[key] === null || filters[key] === undefined) {
                delete filters[key];
            }
        });

        // Fetch data
        const response = await getPlanningRequestItems(filters);

        // Update table with results and pagination
        tableComponent.updateData(response.results || [], response.count || 0, page);
        
        // Update empty message based on context
        if ((response.results || []).length === 0) {
            const hasFilters = Object.values(currentFilters).some(value => {
                if (value === null || value === undefined) return false;
                if (typeof value === 'string') return value.trim() !== '';
                return true;
            });
            tableComponent.options.emptyMessage = hasFilters 
                ? 'Filtre kriterlerine uygun sonuç bulunamadı.'
                : 'Kayıt bulunamadı.';
        }

        // Update current state
        currentPage = page;
        currentPageSize = pageSize;
        
        // Hide loading state
        tableComponent.setLoading(false);

    } catch (error) {
        console.error('Error loading material tracking data:', error);
        tableComponent.setLoading(false);
        tableComponent.options.emptyMessage = 'Veri yüklenirken bir hata oluştu. Lütfen tekrar deneyin.';
        tableComponent.updateData([], 0, 1);
    }
}

/**
 * Handle filter action
 */
async function handleFilter(filters) {
    // Update current filters
    currentFilters = { ...filters };
    
    // Reset to page 1 when filtering
    await loadData(1, currentPageSize);
}

/**
 * Handle clear action
 */
async function handleClear() {
    // Clear filters
    currentFilters = {};
    
    // Reset to page 1 and reload data
    await loadData(1, currentPageSize);
}

/**
 * Handle page change
 */
async function handlePageChange(page) {
    await loadData(page, currentPageSize);
}

/**
 * Handle page size change
 */
async function handlePageSizeChange(pageSize) {
    await loadData(1, pageSize);
}

/**
 * Handle refresh action
 */
async function handleRefresh() {
    await loadData(currentPage, currentPageSize);
}

/**
 * Handle export action
 */
function handleExport(format = 'csv') {
    try {
        // Get current data
        const data = tableComponent.options.data;
        
        if (data.length === 0) {
            alert('İndirilecek veri bulunamadı.');
            return;
        }

        // Prepare export data with formatted values
        const exportData = data.map(row => ({
            'İş No': row.job_no || '-',
            'Malzeme Kodu': row.item_code || '-',
            'Malzeme Adı': row.item_name || '-',
            'Birim': row.item_unit || '-',
            'Miktar': row.quantity ? formatQuantity(row.quantity) : '-',
            'Planlama Talebi No': row.planning_request_number || '-',
            'Teslim Tarihi': row.delivered_at ? formatDateForExport(row.delivered_at) : '-',
            'Teslim Eden': row.delivered_by_username || '-'
        }));

        if (format === 'csv') {
            exportToCSV(exportData, 'malzeme_takibi');
        } else if (format === 'excel') {
            exportToExcel(exportData, 'malzeme_takibi');
        }

    } catch (error) {
        console.error('Error exporting data:', error);
        alert('Veri dışa aktarılırken bir hata oluştu.');
    }
}

/**
 * Export data to CSV
 */
function exportToCSV(data, filename) {
    if (data.length === 0) return;

    // Get headers
    const headers = Object.keys(data[0]);
    
    // Date columns that need special Excel formatting
    const dateColumns = ['Teslim Tarihi'];
    
    // Create CSV content with semicolon delimiter for Turkish Excel
    let csvContent = '\uFEFF'; // UTF-8 BOM for Excel
    csvContent += headers.join(';') + '\n';
    
    data.forEach(row => {
        const values = headers.map(header => {
            const value = row[header];
            const stringValue = String(value).replace(/"/g, '""');
            
            // For date columns, use Excel formula format to force text
            if (dateColumns.includes(header) && value !== '-') {
                return `"=""${stringValue}"""`;
            }
            
            return `"${stringValue}"`;
        });
        csvContent += values.join(';') + '\n';
    });

    // Download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
}

/**
 * Export data to Excel (simplified CSV format)
 */
function exportToExcel(data, filename) {
    // For now, use CSV format with .xls extension
    exportToCSV(data, filename);
}

/**
 * Initialize the page
 */
async function init() {
    try {
        // Check authentication
        if (!guardRoute()) {
            return;
        }

        // Initialize route protection
        if (!initRouteProtection()) {
            return;
        }

        // Initialize navbar
        await initNavbar();

        // Initialize header
        const header = new HeaderComponent({
            containerId: 'header-placeholder',
            title: 'Malzeme Takibi',
            subtitle: 'Teslim edilmiş planlama talebi kalemlerini görüntüleyin',
            icon: 'box',
            showBackButton: 'block',
            backUrl: '../index.html'
        });

        // Initialize filters
        initFilters();

        // Initialize table
        initTable();

        // Load initial data
        await loadData(1, 20);

    } catch (error) {
        console.error('Error initializing material tracking page:', error);
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', init);
