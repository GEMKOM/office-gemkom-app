import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
import { TableComponent } from '../../../components/table/table.js';
import { getStaffReport } from '../../../apis/procurement/reports.js';
import { authFetchUsers } from '../../../apis/users.js';

// Global variables
let currentSortField = 'total_spent_eur';
let currentSortDirection = 'desc';

// Initialize header component
const headerComponent = new HeaderComponent({
    containerId: 'header-placeholder',
    title: 'Personel Raporu',
    subtitle: 'Satın alma personeli performans analizleri ve metrikleri',
    icon: 'chart-bar',
    showBackButton: 'block',
    showExportButton: 'block',
    showRefreshButton: 'block',
    exportButtonText: 'Excel\'e Aktar',
    refreshButtonText: 'Yenile',
    backUrl: '/procurement/reports',
    onExportClick: exportToCSV,
    onRefreshClick: loadStaffReport
});

// Initialize filters component
const filtersComponent = new FiltersComponent('filters-placeholder', {
    title: 'Personel Raporu Filtreleri',
    onApply: handleFilterApply,
    onClear: handleFilterClear
});

// Load users for dropdown filter
async function loadUsers() {
    try {
        const usersResponse = await authFetchUsers(1, 1000, { 
            team: 'procurement,external_workshop',
            ordering: 'full_name'
        });
        
        const users = usersResponse.results || [];
        
        // Add user dropdown filter
        filtersComponent.addDropdownFilter({
            id: 'user',
            label: 'Personel',
            placeholder: 'Tüm personel',
            options: [
                { value: '', label: 'Tüm personel' },
                ...users.map(user => ({
                    value: user.id.toString(),
                    label: `${user.full_name} (${user.username})`
                }))
            ],
            colSize: 4
        });
        
    } catch (error) {
        console.error('Error loading users:', error);
        // Add empty dropdown if users fail to load
        filtersComponent.addDropdownFilter({
            id: 'user',
            label: 'Personel',
            placeholder: 'Tüm personel',
            options: [{ value: '', label: 'Tüm personel' }],
            colSize: 4
        });
    }
}

// Initialize table component
const tableComponent = new TableComponent('table-placeholder', {
    title: 'Personel Raporu',
    icon: 'chart-bar',
    iconColor: 'text-primary',
    columns: [
        {
            field: 'username',
            label: 'Kullanıcı Adı',
            sortable: true,
            type: 'text',
            formatter: (value) => `<span class="fw-bold text-dark">${value || '-'}</span>`
        },
        {
            field: 'full_name',
            label: 'Ad Soyad',
            sortable: true,
            type: 'text',
            formatter: (value) => `<span class="text-dark">${value || '-'}</span>`
        },
        {
            field: 'pr_count',
            label: 'PR Sayısı',
            sortable: true,
            type: 'number',
            formatter: (value) => `<span class="badge bg-light text-dark border">${value || 0}</span>`
        },
        {
            field: 'po_count',
            label: 'PO Sayısı',
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
            field: 'distinct_items_in_prs',
            label: 'Farklı Ürün Sayısı',
            sortable: true,
            type: 'number',
            formatter: (value) => `<span class="badge bg-light text-dark border">${value || 0}</span>`
        },
        {
            field: 'requested_qty_by_unit',
            label: 'Talep Edilen Miktar',
            sortable: false,
            type: 'text',
            formatter: (value) => {
                if (!value || typeof value !== 'object') return '<span class="text-muted">-</span>';
                const units = Object.entries(value).map(([unit, qty]) => 
                    `<span class="badge bg-light text-dark border me-1">${parseFloat(qty).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${unit}</span>`
                ).join('');
                return units || '<span class="text-muted">-</span>';
            }
        },
        {
            field: 'ordered_qty_by_unit',
            label: 'Sipariş Edilen Miktar',
            sortable: false,
            type: 'text',
            formatter: (value) => {
                if (!value || typeof value !== 'object') return '<span class="text-muted">-</span>';
                const units = Object.entries(value).map(([unit, qty]) => 
                    `<span class="badge bg-light text-dark border me-1">${parseFloat(qty).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${unit}</span>`
                ).join('');
                return units || '<span class="text-muted">-</span>';
            }
        },
        {
            field: 'last_activity_at',
            label: 'Son Aktivite',
            sortable: true,
            type: 'date'
        }
    ],
    pagination: true,
    itemsPerPage: 20,
    exportable: true,
    refreshable: true,
    skeleton: true,
    currentSortField: currentSortField,
    currentSortDirection: currentSortDirection,
    onSort: handleSort
});

// Load staff report data
async function loadStaffReport() {
    try {
        tableComponent.setLoading(true);
        
        const filters = filtersComponent.getFilterValues();
        const ordering = currentSortDirection === 'desc' ? `-${currentSortField}` : currentSortField;
        
        const response = await getStaffReport(filters, ordering);
        
        // Handle different response formats
        let data = [];
        if (Array.isArray(response)) {
            data = response;
        } else if (response && Array.isArray(response.results)) {
            data = response.results;
        } else if (response && response.data && Array.isArray(response.data)) {
            data = response.data;
        } else {
            console.warn('Unexpected data format from getStaffReport:', response);
            data = [];
        }
        
        tableComponent.updateData(data, data.length, 1);
        
        // Update sort state in table component
        tableComponent.options.currentSortField = currentSortField;
        tableComponent.options.currentSortDirection = currentSortDirection;
        tableComponent.render();
        
    } catch (error) {
        console.error('Error loading staff report:', error);
        tableComponent.updateData([], 0, 1);
    } finally {
        tableComponent.setLoading(false);
    }
}

// Handle sort
function handleSort(field, direction) {
    currentSortField = field;
    currentSortDirection = direction;
    loadStaffReport();
}

// Handle filter apply
function handleFilterApply(filterValues) {
    const ordering = currentSortDirection === 'desc' ? `-${currentSortField}` : currentSortField;
    loadStaffReport();
}

// Handle filter clear
function handleFilterClear() {
    loadStaffReport();
}

// Export to CSV
function exportToCSV() {
    const data = tableComponent.options.data;
    if (!data || data.length === 0) {
        alert('İndirilecek veri bulunamadı');
        return;
    }

    const headers = [
        'Kullanıcı Adı',
        'Ad Soyad',
        'PR Sayısı',
        'PO Sayısı',
        'Toplam Harcama (€)',
        'Farklı Ürün Sayısı',
        'Talep Edilen Miktar',
        'Sipariş Edilen Miktar',
        'Son Aktivite'
    ];

    const csvData = data.map(item => [
        item.username || '',
        item.full_name || '',
        item.pr_count || 0,
        item.po_count || 0,
        parseFloat(item.total_spent_eur || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 }),
        item.distinct_items_in_prs || 0,
        item.requested_qty_by_unit ? Object.entries(item.requested_qty_by_unit).map(([unit, qty]) => `${parseFloat(qty).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${unit}`).join(', ') : '',
        item.ordered_qty_by_unit ? Object.entries(item.ordered_qty_by_unit).map(([unit, qty]) => `${parseFloat(qty).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${unit}`).join(', ') : '',
        item.last_activity_at ? new Date(item.last_activity_at).toLocaleDateString('tr-TR') : ''
    ]);

    const csvContent = [headers, ...csvData]
        .map(row => row.map(field => `"${field}"`).join(','))
        .join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `personel_raporu_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    await initNavbar();
    await loadUsers();
    await loadStaffReport();
});
