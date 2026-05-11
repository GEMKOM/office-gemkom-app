import { guardRoute } from '../../authService.js';
import { initNavbar } from '../../components/navbar.js';
import { MenuComponent } from '../../components/menu/menu.js';
import { initRouteProtection } from '../../apis/routeProtection.js';

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) return;
    if (!initRouteProtection()) return;

    await initNavbar();

    const menuComponent = new MenuComponent('menu-container', {
        title: 'İzin Talepleri',
        subtitle: 'İzin taleplerinizi oluşturun, takip edin ve onay süreçlerini yönetin',
        cards: [
            {
                title: 'İzin Taleplerim',
                description: 'Yeni izin talebi oluşturun, bakiyenizi görün ve taleplerinizi yönetin.',
                icon: 'fas fa-calendar-plus',
                iconColor: 'primary',
                link: '/general/vacation/requests'
            },
            {
                title: 'Bekleyen Onaylar',
                description: 'Onayınızda olan izin taleplerini onaylayın veya reddedin.',
                icon: 'fas fa-user-check',
                iconColor: 'warning',
                link: '/general/vacation/pending'
            }
        ]
    });

    menuComponent.render();
});
