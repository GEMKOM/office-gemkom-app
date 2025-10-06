import { guardRoute } from '../../authService.js';
import { initNavbar } from '../../components/navbar.js';
import { MenuComponent } from '../../components/menu/menu.js';

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    await initNavbar();
    
    // Initialize menu component
    const menuComponent = new MenuComponent('menu-container', {
        title: 'Bakım Modülü',
        subtitle: 'Ekipman bakım planları, arıza takibi ve önleyici bakım yönetimi',
        cards: [
            {
                title: 'Arıza Talepleri',
                description: 'Yeni arıza talepleri oluşturun ve mevcut arıza durumlarını takip edin.',
                icon: 'fas fa-exclamation-triangle',
                iconColor: 'danger',
                link: '/manufacturing/maintenance/fault-requests',
                features: [
                    {
                        label: 'Arıza Listesi',
                        icon: 'fas fa-list',
                        iconColor: 'rgba(139, 0, 0, 1)',
                        link: '/manufacturing/maintenance/fault-requests/list'
                    },
                    {
                        label: 'Arıza İstatistikleri',
                        icon: 'fas fa-chart-bar',
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
