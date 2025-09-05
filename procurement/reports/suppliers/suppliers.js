import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
import { TableComponent } from '../../../components/table/table.js';
import { getSuppliersReport } from '../../../generic/procurement/reports.js';

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    await initNavbar();
    
    // Sort state management
    let currentSortField = 'total_spent_eur';
    let currentSortDirection = 'desc';
    
    // Initialize header component
    const headerComponent = new HeaderComponent({
        containerId: 'header-placeholder',
        title: 'Tedarikçi Raporu',
        subtitle: 'Tedarikçi performans analizleri ve satın alma metrikleri',
        icon: 'chart-pie',
        showBackButton: 'block',
        showExportButton: 'block',
        showRefreshButton: 'block',
        exportButtonText: 'Excel\'e Aktar',
        refreshButtonText: 'Yenile',
        backUrl: '/procurement/reports',
        onExportClick: handleExport,
        onRefreshClick: loadSuppliersReport
    });
    
    // Initialize filters component
    const filtersComponent = new FiltersComponent('filters-placeholder', {
        title: 'Tedarikçi Raporu Filtreleri',
        onApply: handleFilterApply,
        onClear: handleFilterClear
    });
    
    // Add filters
    filtersComponent
        .addTextFilter({
            id: 'supplier-name',
            label: 'Tedarikçi Adı',
            placeholder: 'Tedarikçi adı giriniz',
            colSize: 2
        })
        .addTextFilter({
            id: 'supplier-code',
            label: 'Tedarikçi Kodu',
            placeholder: 'Tedarikçi kodu giriniz',
            colSize: 2
        })
        .addSelectFilter({
            id: 'has_dbs',
            label: 'DBS Durumu',
            placeholder: 'DBS durumu seçiniz',
            options: [
                { value: '', label: 'Tümü' },
                { value: 'true', label: 'DBS Var' },
                { value: 'false', label: 'DBS Yok' }
            ],
            colSize: 2
        })
        .addDateFilter({
            id: 'created_gte',
            label: 'Başlangıç Tarihi',
            colSize: 2
        })
        .addDateFilter({
            id: 'created_lte',
            label: 'Bitiş Tarihi',
            colSize: 2
        })
        .addTextFilter({
            id: 'min_total_spent_eur',
            label: 'Min. Toplam Harcama (EUR)',
            placeholder: 'Minimum harcama giriniz',
            type: 'number',
            colSize: 2
        });
    
    // Initialize table component
    const tableComponent = new TableComponent('table-placeholder', {
        title: 'Tedarikçi Raporu',
        icon: 'chart-pie',
        iconColor: 'text-primary',
        columns: [
            {
                field: 'code',
                label: 'Tedarikçi Kodu',
                sortable: true,
                type: 'text',
                formatter: (value) => `<span class="fw-bold text-dark">${value || '-'}</span>`
            },
            {
                field: 'name',
                label: 'Tedarikçi Adı',
                sortable: true,
                type: 'text',
                formatter: (value) => `<span class="text-dark">${value || '-'}</span>`
            },
            {
                field: 'default_currency',
                label: 'Varsayılan Para Birimi',
                sortable: true,
                type: 'text',
                formatter: (value) => `<span class="badge bg-light text-dark border">${value || '-'}</span>`
            },
            {
                field: 'has_dbs',
                label: 'DBS Durumu',
                sortable: true,
                type: 'boolean',
                formatter: (value) => {
                    if (value === true) {
                        return '<span class="badge bg-light text-dark border">DBS Var</span>';
                    } else if (value === false) {
                        return '<span class="badge bg-light text-dark border">DBS Yok</span>';
                    }
                    return '<span class="text-muted">-</span>';
                }
            },
            {
                field: 'dbs_limit',
                label: 'DBS Limiti',
                sortable: true,
                type: 'number',
                formatter: (value) => {
                    if (!value) return '<span class="text-muted">-</span>';
                    return `<span class="fw-medium text-dark">${parseFloat(value).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>`;
                }
            },
            {
                field: 'total_pos',
                label: 'Toplam PO',
                sortable: true,
                type: 'number',
                formatter: (value) => `<span class="badge bg-light text-dark border">${value || 0}</span>`
            },
            {
                field: 'total_post',
                label: 'Onaylanan PO',
                sortable: true,
                type: 'number',
                formatter: (value) => `<span class="badge bg-light text-dark border">${value || 0}</span>`
            },
            {
                field: 'cancelled_pos',
                label: 'İptal Edilen PO',
                sortable: true,
                type: 'number',
                formatter: (value) => `<span class="badge bg-light text-dark border">${value || 0}</span>`
            },
            {
                field: 'total_spent_eur',
                label: 'Toplam Harcama',
                sortable: true,
                type: 'number',
                formatter: (value) => `<span class="fw-bold text-dark">${parseFloat(value).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} €</span>`
            },
            {
                field: 'total_tax_eur',
                label: 'Toplam Vergi',
                sortable: true,
                type: 'number',
                formatter: (value) => `<span class="fw-medium text-dark">${parseFloat(value).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} €</span>`
            },
            {
                field: 'unpaid_amount_eur',
                label: 'Ödenmemiş Tutar',
                sortable: true,
                type: 'number',
                formatter: (value) => {
                    const amount = parseFloat(value);
                    if (amount > 0) {
                        return `<span class="fw-bold text-dark">${amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} €</span>`;
                    }
                    return '<span class="text-muted">Ödendi</span>';
                }
            },
            {
                field: 'distinct_items',
                label: 'Farklı Ürün Sayısı',
                sortable: true,
                type: 'number',
                formatter: (value) => `<span class="badge bg-light text-dark border">${value || 0}</span>`
            },
            {
                field: 'avg_delivery_days_weighted',
                label: 'Ort. Teslimat Süresi',
                sortable: true,
                type: 'number',
                formatter: (value) => {
                    if (!value) return '<span class="text-muted">-</span>';
                    return `<span class="fw-medium text-dark">${value} gün</span>`;
                }
            },
            {
                field: 'last_purchase_at',
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
        itemsPerPage: 20,
        exportable: true,
        refreshable: true,
        skeleton: true,
        onExport: handleExport,
        onRefresh: loadSuppliersReport,
        onSort: handleSort,
        // Add current sort state
        currentSortField: currentSortField,
        currentSortDirection: currentSortDirection
    });
    
    // Load initial data with default ordering by total_spent_eur
    await loadSuppliersReport({}, '-total_spent_eur');
    
    // Sort handler
    function handleSort(field, direction) {
        currentSortField = field;
        currentSortDirection = direction;
        
        // Update table component sort state
        tableComponent.options.currentSortField = field;
        tableComponent.options.currentSortDirection = direction;
        
        const ordering = direction === 'desc' ? `-${field}` : field;
        const currentFilters = filtersComponent.getFilterValues();
        loadSuppliersReport(currentFilters, ordering);
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
            link.setAttribute('download', `tedarikci_raporu_${new Date().toISOString().split('T')[0]}.csv`);
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
            'Tedarikçi Kodu',
            'Tedarikçi Adı',
            'Varsayılan Para Birimi',
            'DBS Durumu',
            'DBS Limiti',
            'Toplam PO',
            'Onaylanan PO',
            'İptal Edilen PO',
            'Toplam Harcama (EUR)',
            'Toplam Vergi (EUR)',
            'Ödenmemiş Tutar (EUR)',
            'Farklı Ürün Sayısı',
            'Ortalama Teslimat Süresi (Gün)',
            'Son Satın Alma'
        ];
        
        const csvRows = [headers.join(',')];
        
        data.forEach(item => {
            const row = [
                `"${item.code || ''}"`,
                `"${item.name || ''}"`,
                `"${item.default_currency || ''}"`,
                `"${item.has_dbs ? 'DBS Var' : 'DBS Yok'}"`,
                item.dbs_limit || 0,
                item.total_pos || 0,
                item.total_post || 0,
                item.cancelled_pos || 0,
                item.total_spent_eur || 0,
                item.total_tax_eur || 0,
                item.unpaid_amount_eur || 0,
                item.distinct_items || 0,
                item.avg_delivery_days_weighted || 0,
                `"${item.last_purchase_at ? new Date(item.last_purchase_at).toLocaleDateString('tr-TR') : ''}"`
            ];
            csvRows.push(row.join(','));
        });
        
        return csvRows.join('\n');
    }
    
    // Filter handlers
    function handleFilterApply(filterValues) {
        const ordering = currentSortDirection === 'desc' ? `-${currentSortField}` : currentSortField;
        loadSuppliersReport(filterValues, ordering);
    }
    
    function handleFilterClear() {
        const ordering = currentSortDirection === 'desc' ? `-${currentSortField}` : currentSortField;
        loadSuppliersReport({}, ordering);
    }
    
    // Load suppliers report data
    async function loadSuppliersReport(filters = {}, ordering = null) {
        try {
            tableComponent.setLoading(true);
            
            // Use the existing getSuppliersReport function with filters and ordering
            const tableResponse = await getSuppliersReport(filters, ordering);
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
            console.error('Error loading suppliers report:', error);
            tableComponent.updateData([], 0, 1);
        } finally {
            tableComponent.setLoading(false);
        }
    }
});
