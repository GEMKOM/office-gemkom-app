import { initNavbar } from '../../../../components/navbar.js';
import { HeaderComponent } from '../../../../components/header/header.js';
import { FiltersComponent } from '../../../../components/filters/filters.js';
import { TableComponent } from '../../../../components/table/table.js';
import { searchCncParts } from '../../../../apis/cnc_cutting/parts.js';

/**
 * CNC Parts Search Report
 * Allows searching for CNC parts by job_no, image_no, and position_no
 */

let filtersComponent;
let tableComponent;
let currentFilters = {};
let currentPage = 1;
let currentPageSize = 20;

/**
 * Format timestamp to date string
 */
function formatDate(timestamp) {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    return date.toLocaleDateString('tr-TR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Format weight with 3 decimal places
 */
function formatWeight(weight) {
    if (!weight) return '-';
    return parseFloat(weight).toFixed(3) + ' kg';
}

/**
 * Initialize filters component
 */
function initFilters() {
    filtersComponent = new FiltersComponent('filters-placeholder', {
        title: 'Arama Filtreleri',
        showClearButton: true,
        showApplyButton: true,
        applyButtonText: 'Ara',
        clearButtonText: 'Temizle',
        onApply: handleSearch,
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
        id: 'image_no',
        label: 'Resim No',
        placeholder: 'Resim numarası...',
        colSize: 3
    });

    filtersComponent.addTextFilter({
        id: 'position_no',
        label: 'Pozisyon No',
        placeholder: 'Pozisyon numarası...',
        colSize: 3
    });
}

/**
 * Initialize table component
 */
function initTable() {
    const columns = [
        {
            field: 'id',
            label: 'ID',
            sortable: true,
            width: '60px'
        },
        {
            field: 'job_no',
            label: 'İş No',
            sortable: true
        },
        {
            field: 'image_no',
            label: 'Resim No',
            sortable: true
        },
        {
            field: 'position_no',
            label: 'Pozisyon No',
            sortable: true
        },
        {
            field: 'weight_kg',
            label: 'Ağırlık',
            sortable: true,
            formatter: (value) => formatWeight(value)
        },
        {
            field: 'quantity',
            label: 'Adet',
            sortable: true
        },
        {
            field: 'nesting_id',
            label: 'Nesting ID',
            sortable: true
        },
        {
            field: 'planned_start_ms',
            label: 'Planlanan Başlangıç',
            sortable: true,
            formatter: (value) => formatDate(value)
        },
        {
            field: 'planned_end_ms',
            label: 'Planlanan Bitiş',
            sortable: true,
            formatter: (value) => formatDate(value)
        },
        {
            field: 'completion_date',
            label: 'Tamamlanma Tarihi',
            sortable: true,
            formatter: (value) => formatDate(value)
        }
    ];

    tableComponent = new TableComponent('table-container', {
        title: 'CNC Parça Arama Sonuçları',
        columns: columns,
        data: [],
        emptyMessage: 'Veri yükleniyor...',
        emptyIcon: 'fas fa-search',
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
        onExport: handleExport,
        
        // Row background color based on completion status
        rowBackgroundColor: (row) => {
            if (row.completion_date) {
                return '#d4edda'; // Light green for completed parts
            }
            return null; // Default color
        }
    });
}

/**
 * Load parts data with pagination
 */
async function loadParts(page = 1, pageSize = 20) {
    try {
        // Show loading state
        tableComponent.setLoading(true);

        // Build search parameters with pagination
        const searchParams = {
            ...currentFilters,
            page: page,
            page_size: pageSize
        };

        // Search for parts
        const response = await searchCncParts(searchParams);

        // Update table with results and pagination
        tableComponent.updateData(response.results, response.count, page);
        
        // Update empty message based on context
        if (response.results.length === 0) {
            const hasFilters = Object.values(currentFilters).some(value => value && value.trim() !== '');
            tableComponent.options.emptyMessage = hasFilters 
                ? 'Arama kriterlerine uygun sonuç bulunamadı.'
                : 'Kayıt bulunamadı.';
        }

        // Update current state
        currentPage = page;
        currentPageSize = pageSize;
        
        // Hide loading state
        tableComponent.setLoading(false);

    } catch (error) {
        console.error('Error loading CNC parts:', error);
        tableComponent.setLoading(false);
        tableComponent.options.emptyMessage = 'Veri yüklenirken bir hata oluştu. Lütfen tekrar deneyin.';
        tableComponent.updateData([], 0, 1);
    }
}

/**
 * Handle search action
 */
async function handleSearch(filters) {
    // Update current filters
    currentFilters = { ...filters };
    
    // Reset to page 1 when searching
    await loadParts(1, currentPageSize);
}

/**
 * Handle clear action
 */
async function handleClear() {
    // Clear filters
    currentFilters = {};
    
    // Reset to page 1 and reload data
    await loadParts(1, currentPageSize);
}

/**
 * Handle page change
 */
async function handlePageChange(page) {
    await loadParts(page, currentPageSize);
}

/**
 * Handle page size change
 */
async function handlePageSizeChange(pageSize) {
    await loadParts(1, pageSize);
}

/**
 * Handle refresh action
 */
async function handleRefresh() {
    await loadParts(currentPage, currentPageSize);
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

        // Prepare export data
        const exportData = data.map(row => ({
            'ID': row.id || '-',
            'İş No': row.job_no || '-',
            'Resim No': row.image_no || '-',
            'Pozisyon No': row.position_no || '-',
            'Ağırlık (kg)': row.weight_kg || '-',
            'Adet': row.quantity || '-',
            'Nesting ID': row.nesting_id || '-',
            'Planlanan Başlangıç': row.planned_start_ms ? new Date(row.planned_start_ms).toLocaleString('tr-TR') : '-',
            'Planlanan Bitiş': row.planned_end_ms ? new Date(row.planned_end_ms).toLocaleString('tr-TR') : '-',
            'Tamamlanma Tarihi': row.completion_date ? new Date(row.completion_date).toLocaleString('tr-TR') : '-',
            'Durum': row.completion_date ? 'Tamamlandı' : 'Devam Ediyor'
        }));

        if (format === 'csv') {
            exportToCSV(exportData, 'cnc_parca_arama');
        } else if (format === 'excel') {
            exportToExcel(exportData, 'cnc_parca_arama');
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
    
    // Create CSV content
    let csvContent = '\uFEFF'; // UTF-8 BOM for Excel
    csvContent += headers.join(',') + '\n';
    
    data.forEach(row => {
        const values = headers.map(header => {
            const value = row[header];
            // Escape quotes and wrap in quotes if contains comma
            const stringValue = String(value).replace(/"/g, '""');
            return `"${stringValue}"`;
        });
        csvContent += values.join(',') + '\n';
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
    // In production, you might want to use a library like SheetJS
    exportToCSV(data, filename);
}

/**
 * Initialize the page
 */
async function init() {
    try {
        // Initialize navbar
        await initNavbar();

        // Initialize header
        const header = new HeaderComponent({
            title: 'CNC Parça Arama',
            subtitle: 'İş No, Resim No veya Pozisyon No ile CNC parçalarını arayın',
            icon: 'search',
            showBackButton: 'block',
            backUrl: '../index.html'
        });

        // Initialize filters
        initFilters();

        // Initialize table
        initTable();

        // Load initial data
        await loadParts(1, 20);

    } catch (error) {
        console.error('Error initializing parts search page:', error);
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', init);

