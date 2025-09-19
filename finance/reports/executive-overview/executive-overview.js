import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
import { StatisticsCards } from '../../../components/statistics-cards/statistics-cards.js';
import { TableComponent } from '../../../components/table/table.js';
import { getExecutiveReport } from '../../../generic/procurement/reports.js';

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    await initNavbar();
    
    // Initialize header component
    const headerComponent = new HeaderComponent({
        containerId: 'header-placeholder',
        title: 'Yönetici Özeti',
        subtitle: 'Finansal durumun genel görünümü ve temel performans göstergeleri',
        icon: 'chart-pie',
        showBackButton: 'block',
        showExportButton: 'none',
        showRefreshButton: 'block',
        backUrl: '/finance/reports',
        onRefresh: loadExecutiveData
    });
    
    // Initialize filters component
    const filtersComponent = new FiltersComponent('filters-placeholder', {
        title: 'Yönetici Özeti Filtreleri',
        onApply: handleFilterApply,
        onClear: handleFilterClear
    });
    
    // Add filters
    filtersComponent
        .addDateFilter({
            id: 'created-gte',
            label: 'Başlangıç Tarihi',
            colSize: 6
        })
        .addDateFilter({
            id: 'created-lte',
            label: 'Bitiş Tarihi',
            colSize: 6
        });
    
    // Initialize KPI cards component
    const kpiCardsComponent = new StatisticsCards('kpi-cards-placeholder', {
        cards: [
            {
                id: 'total-spent',
                title: 'Toplam Harcama',
                value: '0,00 EUR',
                icon: 'fas fa-euro-sign',
                color: 'primary'
            },
            {
                id: 'total-paid',
                title: 'Ödenen',
                value: '0,00 EUR',
                icon: 'fas fa-check-circle',
                color: 'success'
            },
            {
                id: 'total-awaiting',
                title: 'Bekleyen',
                value: '0,00 EUR',
                icon: 'fas fa-clock',
                color: 'danger'
            },
            {
                id: 'po-count',
                title: 'PO Sayısı',
                value: '0',
                icon: 'fas fa-file-invoice',
                color: 'info'
            },
            {
                id: 'active-suppliers',
                title: 'Aktif Tedarikçiler',
                value: '0',
                icon: 'fas fa-truck',
                color: 'secondary'
            },
            {
                id: 'mom-percent',
                title: 'Aylık Değişim',
                value: '0%',
                icon: 'fas fa-arrow-up',
                color: 'dark'
            },
            {
                id: 'yoy-percent',
                title: 'Yıllık Değişim',
                value: '0%',
                icon: 'fas fa-calendar-alt',
                color: 'dark'
            }
        ],
        compact: true,
        responsive: true
    });
    
    // Initialize table component for monthly data
    const tableComponent = new TableComponent('table-placeholder', {
        title: 'Aylık Detaylar',
        icon: 'chart-bar',
        iconColor: 'text-info',
        loading: true,
        refreshable: false,
        exportable: true,
        onExport: handleExport,
        columns: [
            { 
                field: 'month', 
                label: 'Ay', 
                sortable: true, 
                type: 'text',
                formatter: (value) => formatMonth(value)
            },
            { 
                field: 'total_spent_eur', 
                label: 'Harcama (EUR)', 
                sortable: true, 
                type: 'number',
                formatter: (value) => `<span class="currency-value">${formatCurrency(value)}</span>`
            },
            { 
                field: 'paid_eur', 
                label: 'Ödenen (EUR)', 
                sortable: true, 
                type: 'number',
                formatter: (value) => `<span class="currency-value text-success">${formatCurrency(value)}</span>`
            },
            { 
                field: 'awaiting_eur', 
                label: 'Bekleyen (EUR)', 
                sortable: true, 
                type: 'number',
                formatter: (value) => `<span class="currency-value" style="color: #a52a2a;">${formatCurrency(value)}</span>`
            },
            { 
                field: 'po_count', 
                label: 'PO Sayısı', 
                sortable: true, 
                type: 'number',
                formatter: (value) => `<span class="badge bg-light text-dark border">${value || 0}</span>`
            },
            { 
                field: 'active_suppliers', 
                label: 'Aktif Tedarikçiler',
                sortable: true,
                type: 'number',
                formatter: (value) => `<span class="badge bg-success text-white">${value || 0}</span>`
            }
        ],
        skeleton: true,
        emptyMessage: 'Aylık veri bulunamadı.',
        emptyIcon: 'fas fa-chart-bar'
    });
    
    // Load initial data
    await loadExecutiveData();
    
    // Event handlers
    async function handleFilterApply() {
        await loadExecutiveData();
    }
    
    async function handleFilterClear() {
        filtersComponent.clearFilters();
        await loadExecutiveData();
    }
    
    async function handleExport() {
        try {
            const filters = filtersComponent.getFilterValues();
            
            // Build export URL
            const params = new URLSearchParams();
            Object.entries(filters).forEach(([key, value]) => {
                if (value) {
                    params.append(key.replace('-', '_'), value);
                }
            });
            params.append('export', 'excel');
            
            const queryString = params.toString();
            const exportUrl = `/api/procurement/reports/executive/export${queryString ? `?${queryString}` : ''}`;
            
            // Trigger download
            window.open(exportUrl, '_blank');
        } catch (error) {
            console.error('Export error:', error);
            showNotification('Dışa aktarma sırasında hata oluştu', 'error');
        }
    }
    
    async function loadExecutiveData() {
        try {
            // Set loading state
            kpiCardsComponent.showLoading();
            tableComponent.setLoading(true);
            
            const filters = filtersComponent.getFilterValues();
            
            // Convert filter keys to match API expectations
            const apiFilters = {};
            if (filters['created-gte']) apiFilters.created_gte = filters['created-gte'];
            if (filters['created-lte']) apiFilters.created_lte = filters['created-lte'];
            
            const data = await getExecutiveReport(apiFilters);
            
            // Update KPI cards
            updateKPICards(data.kpis);
            
            // Update charts
            updateCharts(data.series);
            
            // Update table with monthly data
            const transformedData = data.series.map(item => ({
                ...item,
                total_spent_eur: item.total_spent_eur || '0',
                paid_eur: item.paid_eur || '0',
                awaiting_eur: item.awaiting_eur || '0'
            }));
            
            tableComponent.setLoading(false);
            tableComponent.updateData(transformedData);
            
        } catch (error) {
            console.error('Error loading executive data:', error);
            showNotification('Yönetici özeti yüklenirken hata oluştu: ' + error.message, 'error');
            
            // Update components with empty data on error
            kpiCardsComponent.showEmpty('Veri yüklenirken hata oluştu');
            tableComponent.setLoading(false);
            tableComponent.updateData([]);
        }
    }
    
    function updateKPICards(kpis) {
        const cards = [
            {
                id: 'total-spent',
                title: 'Toplam Harcama',
                value: formatCurrency(kpis.total_spent_eur),
                icon: 'fas fa-euro-sign',
                color: 'primary'
            },
            {
                id: 'total-paid',
                title: 'Ödenen',
                value: formatCurrency(kpis.total_paid_eur),
                icon: 'fas fa-check-circle',
                color: 'success'
            },
            {
                id: 'total-awaiting',
                title: 'Bekleyen',
                value: formatCurrency(kpis.total_awaiting_eur),
                icon: 'fas fa-clock',
                color: 'danger'
            },
            {
                id: 'po-count',
                title: 'PO Sayısı',
                value: kpis.po_count?.toString() || '0',
                icon: 'fas fa-file-invoice',
                color: 'info'
            },
            {
                id: 'active-suppliers',
                title: 'Aktif Tedarikçiler',
                value: kpis.active_suppliers?.toString() || '0',
                icon: 'fas fa-truck',
                color: 'secondary'
            },
            {
                id: 'mom-percent',
                title: 'Aylık Değişim',
                value: formatPercentage(kpis.mom_percent),
                icon: kpis.mom_percent >= 0 ? 'fas fa-arrow-up' : 'fas fa-arrow-down',
                color: kpis.mom_percent >= 0 ? 'success' : 'danger'
            },
            {
                id: 'yoy-percent',
                title: 'Yıllık Değişim',
                value: formatPercentage(kpis.yoy_percent),
                icon: kpis.yoy_percent >= 0 ? 'fas fa-arrow-up' : 'fas fa-arrow-down',
                color: kpis.yoy_percent >= 0 ? 'success' : 'danger'
            }
        ];
        
        kpiCardsComponent.setCards(cards);
    }
    
    function updateCharts(series) {
        const chartsContainer = document.getElementById('charts-placeholder');
        
        // Sort series by month for proper chart display
        const sortedSeries = [...series].sort((a, b) => a.month.localeCompare(b.month));
        
        const months = sortedSeries.map(item => formatMonth(item.month));
        const spentData = sortedSeries.map(item => parseFloat(item.total_spent_eur));
        const paidData = sortedSeries.map(item => parseFloat(item.paid_eur));
        const awaitingData = sortedSeries.map(item => parseFloat(item.awaiting_eur));
        const poCountData = sortedSeries.map(item => item.po_count);
        const suppliersData = sortedSeries.map(item => item.active_suppliers);
        
        // Calculate cumulative amounts
        let cumulativeSpent = 0;
        let cumulativePaid = 0;
        let cumulativeAwaiting = 0;
        
        const cumulativeSpentData = spentData.map(amount => {
            cumulativeSpent += amount;
            return cumulativeSpent;
        });
        
        const cumulativePaidData = paidData.map(amount => {
            cumulativePaid += amount;
            return cumulativePaid;
        });
        
        const cumulativeAwaitingData = awaitingData.map(amount => {
            cumulativeAwaiting += amount;
            return cumulativeAwaiting;
        });
        
        chartsContainer.innerHTML = `
            <div class="row g-4 mb-4">
                <div class="col-lg-8">
                    <div class="card">
                        <div class="card-header">
                            <h5 class="card-title mb-0">
                                <i class="fas fa-chart-line text-primary me-2"></i>
                                Kümülatif Harcama Trendi
                            </h5>
                        </div>
                        <div class="card-body">
                            <canvas id="spendingChart" height="200"></canvas>
                        </div>
                    </div>
                </div>
                <div class="col-lg-4">
                    <div class="card">
                        <div class="card-header">
                            <h5 class="card-title mb-0">
                                <i class="fas fa-chart-bar text-success me-2"></i>
                                PO ve Tedarikçi Sayıları
                            </h5>
                        </div>
                        <div class="card-body">
                            <canvas id="countsChart" height="200"></canvas>
                        </div>
                    </div>
                </div>
            </div>
            <div class="row g-4 mb-4">
                <div class="col-lg-6">
                    <div class="card">
                        <div class="card-header">
                            <h5 class="card-title mb-0">
                                <i class="fas fa-credit-card text-warning me-2"></i>
                                Ödeme Durumu
                            </h5>
                        </div>
                        <div class="card-body">
                            <canvas id="paymentChart" height="200"></canvas>
                        </div>
                    </div>
                </div>
                <div class="col-lg-6">
                    <div class="card">
                        <div class="card-header">
                            <h5 class="card-title mb-0">
                                <i class="fas fa-chart-pie text-info me-2"></i>
                                Ödeme Dağılımı
                            </h5>
                        </div>
                        <div class="card-body">
                            <canvas id="paymentPieChart" height="200"></canvas>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Create cumulative spending trend chart
        const spendingCtx = document.getElementById('spendingChart').getContext('2d');
        new Chart(spendingCtx, {
            type: 'line',
            data: {
                labels: months,
                datasets: [
                    {
                        label: 'Kümülatif Harcama (EUR)',
                        data: cumulativeSpentData,
                        borderColor: '#0d6efd',
                        backgroundColor: 'rgba(13, 110, 253, 0.1)',
                        tension: 0.4,
                        fill: false
                    },
                    {
                        label: 'Kümülatif Ödenen (EUR)',
                        data: cumulativePaidData,
                        borderColor: '#198754',
                        backgroundColor: 'rgba(25, 135, 84, 0.1)',
                        tension: 0.4,
                        fill: false
                    },
                    {
                        label: 'Kümülatif Bekleyen (EUR)',
                        data: cumulativeAwaitingData,
                        borderColor: '#a52a2a',
                        backgroundColor: 'rgba(165, 42, 42, 0.1)',
                        tension: 0.4,
                        fill: false
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return context.dataset.label + ': ' + formatCurrency(context.parsed.y);
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return formatCurrency(value);
                            }
                        }
                    }
                }
            }
        });
        
        // Create counts chart
        const countsCtx = document.getElementById('countsChart').getContext('2d');
        new Chart(countsCtx, {
            type: 'bar',
            data: {
                labels: months,
                datasets: [
                    {
                        label: 'PO Sayısı',
                        data: poCountData,
                        backgroundColor: '#0dcaf0',
                        borderColor: '#0dcaf0',
                        borderWidth: 1
                    },
                    {
                        label: 'Aktif Tedarikçiler',
                        data: suppliersData,
                        backgroundColor: '#ffc107',
                        borderColor: '#ffc107',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1
                        }
                    }
                }
            }
        });
        
        // Create payment status chart
        const paymentCtx = document.getElementById('paymentChart').getContext('2d');
        new Chart(paymentCtx, {
            type: 'bar',
            data: {
                labels: months,
                datasets: [
                    {
                        label: 'Ödenen (EUR)',
                        data: paidData,
                        backgroundColor: '#198754',
                        borderColor: '#198754',
                        borderWidth: 1
                    },
                    {
                        label: 'Bekleyen (EUR)',
                        data: awaitingData,
                        backgroundColor: '#a52a2a',
                        borderColor: '#a52a2a',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return context.dataset.label + ': ' + formatCurrency(context.parsed.y);
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return formatCurrency(value);
                            }
                        }
                    }
                }
            }
        });
        
        // Create payment pie chart (total amounts)
        const totalPaid = paidData.reduce((sum, val) => sum + val, 0);
        const totalAwaiting = awaitingData.reduce((sum, val) => sum + val, 0);
        
        const paymentPieCtx = document.getElementById('paymentPieChart').getContext('2d');
        new Chart(paymentPieCtx, {
            type: 'doughnut',
            data: {
                labels: ['Ödenen', 'Bekleyen'],
                datasets: [{
                    data: [totalPaid, totalAwaiting],
                    backgroundColor: ['#198754', '#a52a2a'],
                    borderColor: ['#198754', '#a52a2a'],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const value = context.parsed;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = ((value / total) * 100).toFixed(1);
                                return context.label + ': ' + formatCurrency(value) + ' (' + percentage + '%)';
                            }
                        }
                    }
                }
            }
        });
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
    
    function formatPercentage(value) {
        if (value === null || value === undefined || isNaN(value)) {
            return '0%';
        }
        const formatted = parseFloat(value).toLocaleString('tr-TR', { 
            minimumFractionDigits: 1, 
            maximumFractionDigits: 1 
        });
        return `${formatted}%`;
    }
    
    function formatMonth(monthString) {
        if (!monthString) return '-';
        const [year, month] = monthString.split('-');
        const date = new Date(year, month - 1);
        return date.toLocaleDateString('tr-TR', {
            year: 'numeric',
            month: 'short'
        });
    }
});
