import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { MenuComponent } from '../../../components/menu/menu.js';
import { HeaderComponent } from '../../../components/header/header.js';
import { FiltersComponent } from '../../../components/filters/filters.js';
import { TableComponent } from '../../../components/table/table.js';
import { getOvertimeUsersForDate } from '../../../generic/overtime.js';

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    await initNavbar();
    
    // Initialize menu component
    const menuComponent = new MenuComponent('menu-container', {
        title: 'Mesai Talepleri',
        subtitle: 'Mesai taleplerinin yönetimi ve takibi',
        cards: [
            {
                title: 'Bekleyen Talepler',
                description: 'Onay bekleyen mesai taleplerinin listesi ve durum takibi.',
                icon: 'fas fa-clock',
                iconColor: 'warning',
                link: '/general/overtime/pending'
            },
            {
                title: 'Kayıt Defteri',
                description: 'Tüm mesai taleplerinin geçmişi ve kayıt defteri.',
                icon: 'fas fa-archive',
                iconColor: 'info',
                link: '/general/overtime/registry'
            },
            {
                title: 'Mesai Kullanıcıları',
                description: 'Belirli bir tarihte mesai yapacak kullanıcıların listesi.',
                icon: 'fas fa-users',
                iconColor: 'primary',
                link: '/general/overtime/users',
                active: true
            }
        ]
    });
    
    // Render the menu
    menuComponent.render();

    // Initialize header component
    const headerComponent = new HeaderComponent({
        containerId: 'header-placeholder',
        title: 'Mesai Kullanıcıları',
        subtitle: 'Belirli bir tarihte mesai yapacak kullanıcıların listesi',
        icon: 'users',
        showBackButton: 'block',
        showRefreshButton: 'block',
        backUrl: '/general/overtime',
        onRefreshClick: () => {
            loadOvertimeUsers();
        }
    });

    // Initialize filters component
    const filtersComponent = new FiltersComponent('filters-placeholder', {
        title: 'Tarih Filtresi',
        showClearButton: true,
        showApplyButton: true,
        applyButtonText: 'Listele',
        clearButtonText: 'Temizle',
        onApply: (filters) => {
            loadOvertimeUsers(filters.date);
        },
        onClear: () => {
            loadOvertimeUsers();
        }
    });

    // Add date filter
    const today = new Date().toISOString().split('T')[0];
    filtersComponent.addDateFilter({
        id: 'date',
        label: 'Tarih',
        value: today,
        colSize: 3
    });

    // Initialize table component
    const tableComponent = new TableComponent('table-placeholder', {
        title: 'Mesai Kullanıcıları',
        icon: 'fas fa-users',
        iconColor: 'text-primary',
        columns: [
            {
                field: 'user_name',
                label: 'Kullanıcı Adı',
                sortable: true
            },
            {
                field: 'team_name',
                label: 'Takım',
                sortable: true
            },
            {
                field: 'job_no',
                label: 'İş Numarası',
                sortable: true
            },
            {
                field: 'description',
                label: 'Açıklama',
                sortable: false
            },
            {
                field: 'start_time',
                label: 'Başlangıç Saati',
                type: 'date',
                sortable: true,
                formatter: (value) => {
                    if (!value) return '-';
                    const date = new Date(value);
                    return date.toLocaleTimeString('tr-TR', {
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                }
            },
            {
                field: 'end_time',
                label: 'Bitiş Saati',
                type: 'date',
                sortable: true,
                formatter: (value) => {
                    if (!value) return '-';
                    const date = new Date(value);
                    return date.toLocaleTimeString('tr-TR', {
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                }
            }
        ],
        data: [],
        loading: false,
        emptyMessage: 'Seçilen tarihte mesai yapacak kullanıcı bulunamadı',
        emptyIcon: 'fas fa-user-times',
        refreshable: true,
        onRefresh: () => {
            loadOvertimeUsers();
        }
    });

    // Load initial data
    await loadOvertimeUsers(today);

    async function loadOvertimeUsers(date = null) {
        try {
            tableComponent.setLoading(true);
            
            // Use today's date if no date is provided
            const targetDate = date || new Date().toISOString().split('T')[0];
            
            const response = await getOvertimeUsersForDate(targetDate);
            
            // Handle different response structures
            let data = [];
            if (Array.isArray(response)) {
                data = response;
            } else if (response && Array.isArray(response.results)) {
                data = response.results;
            } else if (response && Array.isArray(response.data)) {
                data = response.data;
            } else {
                console.warn('Unexpected response structure:', response);
                data = [];
            }
            
            // Transform the data to match our table structure
            const transformedData = data.map(item => ({
                user_name: item.user_name || item.user?.name || item.name || '-',
                team_name: item.team_name || item.team?.name || item.team || '-',
                job_no: item.job_no || item.job_number || '-',
                description: item.description || item.reason || '-',
                start_time: item.start_time || item.start_at,
                end_time: item.end_time || item.end_at
            }));
            
            tableComponent.updateData(transformedData);
            
        } catch (error) {
            console.error('Error loading overtime users:', error);
            tableComponent.updateData([]);
            
            // Show error notification
            const errorMessage = error.message || 'Bilinmeyen hata';
            showNotification('Mesai kullanıcıları yüklenirken hata oluştu: ' + errorMessage, 'error');
        } finally {
            tableComponent.setLoading(false);
        }
    }

    // Helper function for notifications
    function showNotification(message, type = 'info') {
        // Create a simple notification system
        const notification = document.createElement('div');
        notification.className = `alert alert-${type === 'error' ? 'danger' : type} alert-dismissible fade show position-fixed`;
        notification.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
        notification.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        
        document.body.appendChild(notification);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 5000);
    }
});
