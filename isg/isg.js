import { guardRoute } from '../authService.js';
import { initNavbar } from '../components/navbar.js';
import { MenuComponent } from '../components/menu/menu.js';
import { initRouteProtection } from '../apis/routeProtection.js';

document.addEventListener('DOMContentLoaded', async () => {
    if (!guardRoute()) {
        return;
    }

    // Open to everyone — /isg is in ALWAYS_ALLOWED_ROUTES — but still run the
    // guard so an unauthenticated visitor lands on the login page.
    if (!initRouteProtection()) {
        return;
    }

    await initNavbar();

    const menuComponent = new MenuComponent('menu-container', {
        title: 'İş Sağlığı ve Güvenliği',
        subtitle: 'İSG bildirimlerini takip edin, üzerinize atanan aksiyonları kapatın',
        cards: [
            {
                title: 'İSG Bildirimleri',
                description: 'Tüm İSG bildirimlerini görüntüleyin, filtreleyin ve takip edin.',
                icon: 'fas fa-helmet-safety',
                iconColor: 'primary',
                link: '/isg/issues'
            },
            {
                title: 'Bana Atananlar',
                description: 'Size atanmış, henüz kapanmamış İSG aksiyonlarını görün.',
                icon: 'fas fa-user-shield',
                iconColor: 'danger',
                link: '/isg/issues?mine=true'
            }
        ]
    });

    menuComponent.render();
});
