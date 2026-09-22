import { guardRoute } from '../../authService.js';
import { initNavbar } from '../../components/navbar.js';
import { MenuComponent } from '../../components/menu/menu.js';
import { initRouteProtection } from '../../apis/routeProtection.js';

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    // Initialize route protection
    if (!initRouteProtection()) {
        return;
    }

    await initNavbar();
    
    // Initialize menu component
    const menuComponent = new MenuComponent('menu-container', {
        title: 'Kaynak Modülü',
        subtitle: 'Kaynak işlemleri ve zaman kayıtları yönetimi',
        cards: [
            {
                title: 'Zaman Kayıtları',
                description: 'Kaynak zaman kayıtlarını görüntüleyin, oluşturun ve yönetin.',
                icon: 'fas fa-clock',
                iconColor: 'primary',
                link: '/manufacturing/welding/time-entries',
                features: []
            },
            {
                title: 'Ekipler',
                description: 'Kaynak ekiplerini oluşturun, ustabaşı ve üyeleri yönetin.',
                icon: 'fas fa-users',
                iconColor: 'warning',
                link: '/manufacturing/welding/teams',
                features: []
            },
            {
                title: 'Raporlar',
                description: 'Kaynak zaman kayıtları analizleri ve performans raporları.',
                icon: 'fas fa-chart-bar',
                iconColor: 'success',
                link: '/manufacturing/welding/reports',
                features: [
                    {
                        label: 'Çalışan Çalışma Saatleri',
                        icon: 'fas fa-user-clock',
                        link: '/manufacturing/welding/reports/user-work-hours'
                    }
                ]
            }
        ]
    });
    
    // Render the menu
    menuComponent.render();
});

