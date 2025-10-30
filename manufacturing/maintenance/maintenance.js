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
                link: '/manufacturing/maintenance/fault-requests'
            },
            {
                title: 'Raporlar',
                description: 'Bakım ve arıza süreçlerine ait raporlar.',
                icon: 'fas fa-chart-bar',
                iconColor: 'primary',
                link: '/manufacturing/maintenance/reports',
                features: [
                    {
                        label: 'Arızalar Özeti',
                        icon: 'fas fa-file-alt',
                        iconColor: 'rgba(13, 110, 253, 1)',
                        link: '/manufacturing/maintenance/reports/faults'
                    },
                    {
                        label: 'Kullanıcı Çözüm Raporu',
                        icon: 'fas fa-user-check',
                        iconColor: 'rgba(25, 135, 84, 1)',
                        link: '/manufacturing/maintenance/reports/user-resolution'
                    }
                ]
            }
        ]
    });
    
    // Render the menu
    menuComponent.render();
});
