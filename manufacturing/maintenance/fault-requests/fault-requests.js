import { guardRoute } from '../../../authService.js';
import { initNavbar } from '../../../components/navbar.js';
import { MenuComponent } from '../../../components/menu/menu.js';

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    await initNavbar();
    
    // Initialize menu component
    const menuComponent = new MenuComponent('menu-container', {
        title: 'Arıza Talepleri',
        subtitle: 'Arıza taleplerini yönetin ve takip edin',
        cards: [
            {
                title: 'Yeni Arıza Talebi',
                description: 'Yeni arıza talebi oluşturun ve sisteme kaydedin.',
                icon: 'fas fa-plus-circle',
                iconColor: 'success',
                link: '/manufacturing/maintenance/fault-requests/create',
                features: [
                    {
                        label: 'Talep Oluştur',
                        icon: 'fas fa-plus',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/manufacturing/maintenance/fault-requests/create'
                    },
                    {
                        label: 'Talep Şablonları',
                        icon: 'fas fa-file-alt',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/manufacturing/maintenance/fault-requests/templates'
                    }
                ]
            },
            {
                title: 'Arıza Listesi',
                description: 'Tüm arıza taleplerini görüntüleyin, filtreleyin ve yönetin.',
                icon: 'fas fa-list',
                iconColor: 'primary',
                link: '/manufacturing/maintenance/fault-requests/list',
                features: [
                    {
                        label: 'Tüm Arızalar',
                        icon: 'fas fa-th-list',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/manufacturing/maintenance/fault-requests/list'
                    },
                    {
                        label: 'Filtreleme',
                        icon: 'fas fa-filter',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/manufacturing/maintenance/fault-requests/list'
                    },
                    {
                        label: 'Çözüm Ekleme',
                        icon: 'fas fa-tools',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/manufacturing/maintenance/fault-requests/list'
                    }
                ]
            },
            {
                title: 'Arıza İstatistikleri',
                description: 'Arıza verilerini analiz edin ve raporlar oluşturun.',
                icon: 'fas fa-chart-bar',
                iconColor: 'info',
                link: '/manufacturing/maintenance/fault-requests/statistics',
                features: [
                    {
                        label: 'Genel İstatistikler',
                        icon: 'fas fa-chart-pie',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/manufacturing/maintenance/fault-requests/statistics'
                    },
                    {
                        label: 'Ekipman Analizi',
                        icon: 'fas fa-cogs',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/manufacturing/maintenance/fault-requests/statistics'
                    },
                    {
                        label: 'Trend Raporları',
                        icon: 'fas fa-chart-line',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/manufacturing/maintenance/fault-requests/statistics'
                    }
                ]
            }
        ]
    });
    
    // Render the menu
    menuComponent.render();
});
