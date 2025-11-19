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
        title: 'Departman Talepleri',
        subtitle: 'Departman taleplerinin yönetimi ve takibi',
        cards: [
            {
                title: 'Tüm Talepler',
                description: 'Tüm departman taleplerinin listesi, oluşturma, düzenleme ve silme işlemleri.',
                icon: 'fas fa-list',
                iconColor: 'primary',
                link: '/general/department-requests/list'
            },
            {
                title: 'Bekleyen Talepler',
                description: 'Onay bekleyen departman taleplerinin listesi ve durum takibi.',
                icon: 'fas fa-clock',
                iconColor: 'warning',
                link: '/general/department-requests/pending'
            }
        ]
    });

    // Render the menu
    menuComponent.render();
});
