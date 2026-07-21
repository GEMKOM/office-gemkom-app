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
        title: 'Vinç Talepleri',
        subtitle: 'Kiralık vinç ve platform taleplerinin yönetimi ve takibi',
        cards: [
            {
                title: 'Tüm Talepler',
                description: 'Tüm vinç/platform taleplerinin listesi, yeni talep oluşturma ve tamamlama işlemleri.',
                icon: 'fas fa-list',
                iconColor: 'primary',
                link: '/general/crane-requests/list'
            },
            {
                title: 'Bekleyen Talepler',
                description: 'Onayınızı bekleyen vinç taleplerinin listesi ve onay/red işlemleri.',
                icon: 'fas fa-clock',
                iconColor: 'warning',
                link: '/general/crane-requests/pending'
            },
            {
                title: 'Fiyat Listesi',
                description: 'Kiralık vinç ve platform fiyat listesi; yetkili kullanıcılar için fiyat güncelleme.',
                icon: 'fas fa-tags',
                iconColor: 'success',
                link: '/general/crane-requests/prices'
            }
        ]
    });

    // Render the menu
    menuComponent.render();
});
