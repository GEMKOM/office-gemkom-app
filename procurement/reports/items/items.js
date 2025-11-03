import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
import { TableComponent } from '../../../components/table/table.js';
import { getItemsReport } from '../../../apis/procurement/reports.js';

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    await initNavbar();
    
    // Sort state management
    let currentSortField = 'total_spent_eur';
    let currentSortDirection = 'desc';
    
    // Pagination state
    let currentPage = 1;
    let itemsPerPage = 20;
    
    // Initialize header component
    const headerComponent = new HeaderComponent({
        containerId: 'header-placeholder',
        title: 'Ürün Raporu',
        subtitle: 'Ürün satın alma analizleri ve performans metrikleri',
        icon: 'chart-bar',
        showBackButton: 'block',
        showExportButton: 'block',
        showRefreshButton: 'block',
        exportButtonText: 'Excel\'e Aktar',
        refreshButtonText: 'Yenile',
        backUrl: '/procurement/reports',
        onExportClick: handleExport,
        onRefreshClick: loadItemReport
    });
    
    // Initialize filters component
    const filtersComponent = new FiltersComponent('filters-placeholder', {
        title: 'Ürün Raporu Filtreleri',
        onApply: handleFilterApply,
        onClear: handleFilterClear
    });
    
    // Add filters
    filtersComponent
        .addTextFilter({
            id: 'item-code',
            label: 'Ürün Kodu',
            placeholder: 'Ürün kodu giriniz',
            colSize: 3
        })
        .addTextFilter({
            id: 'item-name',
            label: 'Ürün Adı',
            placeholder: 'Ürün adı giriniz',
            colSize: 3
        });
    
    // Initialize table component
    const tableComponent = new TableComponent('table-placeholder', {
        title: 'Ürün Raporu',
        icon: 'chart-bar',
        iconColor: 'text-primary',
        columns: [
            {
                field: 'code',
                label: 'Ürün Kodu',
                sortable: true,
                type: 'text',
                formatter: (value) => `<span class="fw-bold text-dark">${value || '-'}</span>`
            },
            {
                field: 'name',
                label: 'Ürün Adı',
                sortable: true,
                type: 'text',
                formatter: (value) => `<span class="text-dark">${value || '-'}</span>`
            },
            {
                field: 'buy_count',
                label: 'Talep Sayısı',
                sortable: true,
                type: 'number',
                formatter: (value) => `<span class="badge bg-light text-dark border">${value || 0}</span>`
            },
            {
                field: 'total_quantity',
                label: 'Toplam Miktar',
                sortable: true,
                type: 'number',
                formatter: (value) => `<span class="fw-medium text-dark">${parseFloat(value).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>`
            },
            {
                field: 'unit',
                label: 'Birim',
                sortable: true,
                type: 'text',
                formatter: (value) => `<span class="badge bg-light text-dark border">${value || '-'}</span>`
            },
            {
                field: 'total_spent_eur',
                label: 'Toplam Harcama',
                sortable: true,
                type: 'number',
                formatter: (value) => `<span class="fw-bold text-dark">${parseFloat(value).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} €</span>`
            },
            {
                field: 'min_unit_price_eur',
                label: 'En Düşük Birim Fiyat',
                sortable: true,
                type: 'number',
                formatter: (value) => `<span class="fw-medium text-dark">${parseFloat(value).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} €</span>`
            },
            {
                field: 'suppliers',
                label: 'Tedarikçiler',
                sortable: false,
                type: 'text',
                formatter: (value) => {
                    if (!value || !Array.isArray(value)) return '<span class="text-muted">-</span>';
                    return value.map(supplier => `<span class="badge bg-light text-dark border me-1">${supplier}</span>`).join('');
                }
            },
            {
                field: 'last_bought_at',
                label: 'Son Satın Alma',
                sortable: true,
                type: 'date',
                formatter: (value) => {
                    if (!value) return '<span class="text-muted">-</span>';
                    const date = new Date(value);
                    const formattedDate = date.toLocaleDateString('tr-TR', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                    });
                    return `<span class="text-muted small">${formattedDate}</span>`;
                }
            }
        ],
        pagination: true,
        serverSidePagination: true,
        itemsPerPage: 20,
        currentPage: 1,
        totalItems: 0,
        exportable: true,
        refreshable: true,
        skeleton: true,
        onExport: handleExport,
        onRefresh: loadItemReport,
        onSort: handleSort,
        onPageChange: (page) => {
            currentPage = page;
            loadItemReport();
        },
        onPageSizeChange: (newPageSize) => {
            // Update local variable to keep in sync
            itemsPerPage = newPageSize;
            // Ensure table component also has the correct value (should already be set, but ensure sync)
            if (tableComponent) {
                tableComponent.options.itemsPerPage = newPageSize;
            }
            // Reset to page 1 and load with new page size
            currentPage = 1;
            loadItemReport();
        },
        // Add current sort state
        currentSortField: currentSortField,
        currentSortDirection: currentSortDirection
    });
    
    // Load initial data with default ordering by total_spent_eur
    await loadItemReport({}, '-total_spent_eur');
    
    // Sort handler
    function handleSort(field, direction) {
        currentSortField = field;
        currentSortDirection = direction;
        
        // Update table component sort state
        tableComponent.options.currentSortField = field;
        tableComponent.options.currentSortDirection = direction;
        
        const ordering = direction === 'desc' ? `-${field}` : field;
        const currentFilters = filtersComponent.getFilterValues();
        loadItemReport(currentFilters, ordering);
    }
    
    // Export handler
    function handleExport() {
        try {
            // Get current filtered data from the table
            const currentData = tableComponent.options.data;
            
            // Convert data to CSV format
            const csvContent = convertToCSV(currentData);
            
            // Create and download the file
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `urun_raporu_${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error) {
            console.error('Export failed:', error);
        }
    }
    
    // Convert data to CSV format
    function convertToCSV(data) {
        if (!data || data.length === 0) return '';
        
        const headers = [
            'Ürün Kodu',
            'Ürün Adı', 
            'Birim',
            'Satın Alma Sayısı',
            'Toplam Miktar',
            'Toplam Harcama (EUR)',
            'En Düşük Birim Fiyat (EUR)',
            'Tedarikçiler',
            'Son Satın Alma'
        ];
        
        const csvRows = [headers.join(',')];
        
        data.forEach(item => {
            const row = [
                `"${item.code || ''}"`,
                `"${item.name || ''}"`,
                `"${item.unit || ''}"`,
                item.buy_count || 0,
                item.total_quantity || 0,
                item.total_spent_eur || 0,
                item.min_unit_price_eur || 0,
                `"${Array.isArray(item.suppliers) ? item.suppliers.join(', ') : item.suppliers || ''}"`,
                `"${item.last_bought_at ? new Date(item.last_bought_at).toLocaleDateString('tr-TR') : ''}"`
            ];
            csvRows.push(row.join(','));
        });
        
        return csvRows.join('\n');
    }
    
    // Filter handlers
    function handleFilterApply(filterValues) {
        const ordering = currentSortDirection === 'desc' ? `-${currentSortField}` : currentSortField;
        loadItemReport(filterValues, ordering);
    }
    
    function handleFilterClear() {
        const ordering = currentSortDirection === 'desc' ? `-${currentSortField}` : currentSortField;
        loadItemReport({}, ordering);
    }
    
    // Load item report data
    async function loadItemReport(filters = {}, ordering = null) {
        try {
            tableComponent.setLoading(true);
            
            // Use the existing getItemsReport function with filters and ordering
            const tableResponse = await getItemsReport(filters, ordering);
            const data = tableResponse.results || tableResponse || [];
            
            tableComponent.updateData(data, data.length, 1);
            
            // Update sort state in table component
            if (ordering) {
                const field = ordering.startsWith('-') ? ordering.substring(1) : ordering;
                const direction = ordering.startsWith('-') ? 'desc' : 'asc';
                currentSortField = field;
                currentSortDirection = direction;
                
                // Update table component sort state and re-render
                tableComponent.options.currentSortField = field;
                tableComponent.options.currentSortDirection = direction;
                tableComponent.render();
            }
        } catch (error) {
            console.error('Error loading item report:', error);
            tableComponent.updateData([], 0, 1);
        } finally {
            tableComponent.setLoading(false);
        }
    }
});
