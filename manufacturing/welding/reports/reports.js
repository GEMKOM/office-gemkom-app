import { guardRoute } from '../../../../authService.js';
import { initNavbar } from '../../../../components/navbar.js';
import { MenuComponent } from '../../../../components/menu/menu.js';
import { initRouteProtection } from '../../../../apis/routeProtection.js';

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
        title: 'Kaynak Raporları',
        subtitle: 'Kaynak zaman kayıtları analizleri ve performans raporları',
        cards: [
            {
                title: 'Çalışan Çalışma Saatleri Raporu',
                description: 'Çalışanların belirli bir tarih aralığındaki çalışma saatlerini mesai tipine göre görüntüleyin.',
                icon: 'fas fa-user-clock',
                iconColor: 'primary',
                link: '/manufacturing/welding/reports/user-work-hours'
            },
            {
                title: 'Maliyet Analizi Raporu',
                description: 'İş numaralarına göre detaylı saat analizi ve kullanıcı bazlı detaylar.',
                icon: 'fas fa-calculator',
                iconColor: 'success',
                link: '/manufacturing/welding/reports/cost-analysis'
            }
        ]
    });
    
    // Render the menu
    menuComponent.render();
});

