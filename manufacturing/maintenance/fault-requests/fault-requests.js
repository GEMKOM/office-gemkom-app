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
                features: []
            },
            {
                title: 'Arıza Listesi',
                description: 'Tüm arıza taleplerini görüntüleyin, filtreleyin ve yönetin.',
                icon: 'fas fa-list',
                iconColor: 'primary',
                link: '/manufacturing/maintenance/fault-requests/list',
                features: []
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
