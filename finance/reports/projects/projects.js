import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
import { TableComponent } from '../../../components/table/table.js';
import { getProjectsReport } from '../../../generic/procurement/reports.js';

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    await initNavbar();
    
    // Sort state management
    let currentSortField = 'job_no';
    let currentSortDirection = 'asc';
    
    // Initialize header component
    const headerComponent = new HeaderComponent({
        containerId: 'header-placeholder',
        title: 'Proje Raporu',
        subtitle: 'Proje bazlı satın alma analizleri ve maliyet metrikleri',
        icon: 'chart-line',
        showBackButton: 'block',
        showExportButton: 'block',
        showRefreshButton: 'block',
        exportButtonText: 'Excel\'e Aktar',
        refreshButtonText: 'Yenile',
        backUrl: '/finance',
        onExportClick: handleExport,
        onRefreshClick: loadProjectsReport
    });
    
    // Initialize filters component
    const filtersComponent = new FiltersComponent('filters-placeholder', {
        title: 'Proje Raporu Filtreleri',
        onApply: handleFilterApply,
        onClear: handleFilterClear
    });
    
    // Add filters
    filtersComponent
        .addTextFilter({
            id: 'job-no',
            label: 'İş Numarası',
            placeholder: 'İş numarası giriniz',
            colSize: 3
        })
        .addTextFilter({
            id: 'job-prefix',
            label: 'İş Öneki',
            placeholder: 'İş öneki giriniz',
            colSize: 3
        })
        .addDateFilter({
            id: 'created-gte',
            label: 'Başlangıç Tarihi',
            colSize: 3
        })
        .addDateFilter({
            id: 'created-lte',
            label: 'Bitiş Tarihi',
            colSize: 3
        })
        .addDropdownFilter({
            id: 'include-empty',
            label: 'Boş Projeler',
            placeholder: 'Boş projeleri dahil et',
            options: [
                { value: '', label: 'Tüm Projeler' },
                { value: 'true', label: 'Boş Projeler Dahil' },
                { value: 'false', label: 'Sadece Aktif Projeler' }
            ],
            colSize: 3
        });
    
    // Initialize table component
    const tableComponent = new TableComponent('table-placeholder', {
        title: 'Proje Raporu',
        columns: [
            { 
                field: 'job_no', 
                label: 'İş No', 
                sortable: true, 
                type: 'text',
                formatter: (value) => `<span class="project-number">${value || '-'}</span>`
            },
            { 
                field: 'distinct_items', 
                label: 'Ürün Sayısı', 
                sortable: true, 
                type: 'number',
                formatter: (value) => `<span class="badge bg-light text-dark border">${value || 0}</span>`
            },
            { 
                field: 'total_pos', 
                label: 'Toplam PO', 
                sortable: true, 
                type: 'number',
                formatter: (value) => `<span class="badge bg-light text-dark border">${value || 0}</span>`
            },
            { 
                field: 'active_pos', 
                label: 'Aktif PO', 
                sortable: true, 
                type: 'number',
                formatter: (value) => `<span class="badge bg-success text-white">${value || 0}</span>`
            },
            { 
                field: 'committed_gross_eur', 
                label: 'Taahhüt Edilen (EUR)', 
                sortable: true, 
                type: 'number',
                formatter: (value) => `<span class="currency-value">${formatCurrency(value)}</span>`
            },
            { 
                field: 'paid_eur', 
                label: 'Ödenen (EUR)', 
                sortable: true, 
                type: 'number',
                formatter: (value) => `<span class="currency-value">${formatCurrency(value)}</span>`
            },
            { 
                field: 'unpaid_eur', 
                label: 'Ödenmemiş (EUR)', 
                sortable: true, 
                type: 'number',
                formatter: (value) => `<span class="currency-value ${value > 0 ? 'negative' : ''}">${formatCurrency(value)}</span>`
            },
            { 
                field: 'pending_pr_estimate_eur', 
                label: 'Bekleyen PR (EUR)', 
                sortable: true, 
                type: 'number',
                formatter: (value) => `<span class="currency-value">${formatCurrency(value)}</span>`
            },
            { 
                field: 'forecast_eur', 
                label: 'Tahmin (EUR)', 
                sortable: true, 
                type: 'number',
                formatter: (value) => `<span class="currency-value">${formatCurrency(value)}</span>`
            },
            { 
                field: 'last_activity_at', 
                label: 'Son Aktivite', 
                sortable: true, 
                type: 'date'
            }
        ],
        onSort: handleSort,
        onRowClick: handleRowClick,
        skeletonLoading: true
    });
    
    // Load initial data
    await loadProjectsReport();
    
    // Event handlers
    async function handleFilterApply() {
        await loadProjectsReport();
    }
    
    async function handleFilterClear() {
        filtersComponent.clearFilters();
        await loadProjectsReport();
    }
    
    async function handleSort(field, direction) {
        currentSortField = field;
        currentSortDirection = direction;
        await loadProjectsReport();
    }
    
    function handleRowClick(project) {
        // Handle row click - could open project details modal
        console.log('Project clicked:', project);
    }
    
    async function handleExport() {
        try {
            const filters = filtersComponent.getFilterValues();
            const ordering = currentSortDirection === 'desc' ? `-${currentSortField}` : currentSortField;
            
            // Build export URL
            const params = new URLSearchParams();
            Object.entries(filters).forEach(([key, value]) => {
                if (value) {
                    params.append(key.replace('-', '_'), value);
                }
            });
            if (ordering) {
                params.append('ordering', ordering);
            }
            params.append('export', 'excel');
            
            const queryString = params.toString();
            const exportUrl = `/api/procurement/reports/projects/export${queryString ? `?${queryString}` : ''}`;
            
            // Trigger download
            window.open(exportUrl, '_blank');
        } catch (error) {
            console.error('Export error:', error);
            showNotification('Dışa aktarma sırasında hata oluştu', 'error');
        }
    }
    
    async function loadProjectsReport() {
        try {
            const filters = filtersComponent.getFilterValues();
            const ordering = currentSortDirection === 'desc' ? `-${currentSortField}` : currentSortField;
            
            // Convert filter keys to match API expectations
            const apiFilters = {};
            if (filters['job-no']) apiFilters.job_no = filters['job-no'];
            if (filters['job-prefix']) apiFilters.job_prefix = filters['job-prefix'];
            if (filters['created-gte']) apiFilters.created_gte = filters['created-gte'];
            if (filters['created-lte']) apiFilters.created_lte = filters['created-lte'];
            if (filters['include-empty']) apiFilters.include_empty = filters['include-empty'];
            
            const data = await getProjectsReport(apiFilters, ordering);
            
            // Transform data for table display
            const transformedData = data.results.map(project => ({
                ...project,
                // Keep currency values as strings for formatter functions to handle
                committed_gross_eur: project.committed_gross_eur || '0',
                paid_eur: project.paid_eur || '0',
                unpaid_eur: project.unpaid_eur || '0',
                pending_pr_estimate_eur: project.pending_pr_estimate_eur || '0',
                forecast_eur: project.forecast_eur || '0',
                // Keep datetime as string for formatter to handle
                last_activity_at: project.last_activity_at || null
            }));
            
            tableComponent.updateData(transformedData);
            
        } catch (error) {
            console.error('Error loading projects report:', error);
            showNotification('Proje raporu yüklenirken hata oluştu: ' + error.message, 'error');
            tableComponent.updateData([]);
        }
    }
    
    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `alert alert-${type === 'error' ? 'danger' : type} alert-dismissible fade show position-fixed`;
        notification.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
        notification.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 5000);
    }
    
    // Helper functions for formatting
    function formatCurrency(value) {
        if (value === null || value === undefined || isNaN(value)) {
            return '0,00 EUR';
        }
        return `${parseFloat(value).toLocaleString('tr-TR', { 
            minimumFractionDigits: 2, 
            maximumFractionDigits: 2 
        })} EUR`;
    }
    
    function formatDateTime(value) {
        if (!value) return '-';
        const date = new Date(value);
        return date.toLocaleDateString('tr-TR', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
});
